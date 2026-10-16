// Alertas via Telegram (ver IDEIAS.md) — manda mensagem quando um alarme da
// casa de bombas dispara; alarmes marcados como "prioridade" insistem
// (reenviam) a cada X segundos até alguém responder qualquer coisa no chat
// do bot, o que reconhece TODOS os alarmes ativos no momento (v1 simples:
// não tenta amarrar a resposta a um alarme específico via reply_to_message,
// qualquer mensagem no chat configurado conta como "já vi, pode parar").
import crypto from 'node:crypto';
import { db } from '../db/sqlite.js';
import { encryptSecret, decryptSecret } from './cryptoService.js';

function getRow() {
  return db.prepare('SELECT * FROM telegram_settings WHERE id = 1').get();
}

export function getTelegramSettings() {
  const row = getRow();
  return {
    enabled: Boolean(row.enabled),
    hasToken: Boolean(row.bot_token_enc),
    chatId: row.chat_id,
    resendIntervalSeconds: row.resend_interval_seconds,
    webhookSecret: row.webhook_secret,
  };
}

// Token nunca volta pro front depois de salvo (igual senha de equipamento)
// — só `hasToken: true/false`, pra tela saber se já tem um configurado sem
// expor o valor de novo.
export function saveTelegramSettings({ enabled, botToken, chatId, resendIntervalSeconds }) {
  const row = getRow();
  const webhookSecret = row.webhook_secret || crypto.randomBytes(24).toString('hex');
  const tokenEnc = botToken ? encryptSecret(botToken) : row.bot_token_enc;
  const interval = Math.min(24 * 3600, Math.max(60, Number(resendIntervalSeconds) || row.resend_interval_seconds));
  db.prepare(
    'UPDATE telegram_settings SET enabled = ?, bot_token_enc = ?, chat_id = ?, webhook_secret = ?, resend_interval_seconds = ? WHERE id = 1'
  ).run(enabled ? 1 : 0, tokenEnc, chatId ?? row.chat_id, webhookSecret, interval);
  return getTelegramSettings();
}

// Usado só pelo botão "Testar conexão" quando a pessoa não digitou um token
// novo — testa o que já está salvo, sem expor o valor pro front.
export function getSavedBotToken() {
  const row = getRow();
  return row.bot_token_enc ? decryptSecret(row.bot_token_enc) : null;
}

async function callTelegramApi(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `Telegram respondeu ${res.status}`);
  }
  return data.result;
}

// Testa o token digitado na hora, sem salvar ainda — "getMe" é o jeito
// padrão de confirmar que um token de bot é válido sem precisar mandar
// mensagem nenhuma.
export async function testTelegramToken(botToken) {
  return callTelegramApi(botToken, 'getMe');
}

// Registra a URL do webhook no próprio Telegram — chamado pela tela de
// Configurações depois de salvar token/chat, passando o domínio público do
// Portal (o backend não sabe sozinho qual é, atrás do túnel Cloudflare).
export async function registerWebhook(baseUrl) {
  const row = getRow();
  if (!row.bot_token_enc) throw new Error('Salve o token do bot primeiro.');
  const token = decryptSecret(row.bot_token_enc);
  const url = `${baseUrl.replace(/\/$/, '')}/api/telegram/webhook/${row.webhook_secret}`;
  await callTelegramApi(token, 'setWebhook', { url });
  return url;
}

export async function sendTelegramMessage(text) {
  const row = getRow();
  if (!row.enabled || !row.bot_token_enc || !row.chat_id) return;
  const token = decryptSecret(row.bot_token_enc);
  await callTelegramApi(token, 'sendMessage', { chat_id: row.chat_id, text });
}

// Qualquer mensagem recebida no chat configurado reconhece TODOS os alarmes
// ativos ainda não reconhecidos — simples de propósito (ver comentário no
// topo do arquivo). Confirma de volta no chat o que foi reconhecido.
export async function acknowledgeAllActiveAlarms() {
  const pending = db.prepare('SELECT alarm_key FROM telegram_alarm_state WHERE acknowledged_at IS NULL').all();
  if (pending.length === 0) return [];
  db.prepare("UPDATE telegram_alarm_state SET acknowledged_at = datetime('now') WHERE acknowledged_at IS NULL").run();
  return pending.map((r) => r.alarm_key);
}

// Checa o webhook_secret da URL contra o salvo — único jeito (nessa versão
// simples, sem validar a assinatura do Telegram) de garantir que quem está
// chamando esse endpoint é mesmo o Telegram e não qualquer um na internet
// que ache a URL.
export function isValidWebhookSecret(secret) {
  const row = getRow();
  return Boolean(row.webhook_secret) && secret === row.webhook_secret;
}

const ALARM_LABELS = {
  termico1: 'Térmico da bomba 1 desarmado',
  termico2: 'Térmico da bomba 2 desarmado',
  modoManual: 'Modo manual (não automático)',
  emergencia: 'Emergência acionada',
  faltaFase: 'Falta de fase na rede elétrica',
  painelDesligado: 'Painel de bombas desligado',
  falhaBoias: 'Falha nas boias de nível',
};

// Chamado a cada leitura da casa de bombas (ver pumpStationHistoryPoller.js)
// com os valores atuais dos 7 sinais de alarme + quais deles são
// prioridade. Decide sozinho quando mandar mensagem nova, quando insistir
// (só prioridade, a cada `resendIntervalSeconds`) e quando considerar
// resolvido (sinal voltou a false — limpa o estado, próxima vez que
// disparar manda de novo do zero).
export async function checkBombasAlarms(points, priorityByKey) {
  const settings = getTelegramSettings();
  if (!settings.enabled) return;

  for (const [key, label] of Object.entries(ALARM_LABELS)) {
    const alarmKey = `bombas.${key}`;
    const isActive = points?.[key] === true;
    const existing = db.prepare('SELECT * FROM telegram_alarm_state WHERE alarm_key = ?').get(alarmKey);

    if (!isActive) {
      if (existing) db.prepare('DELETE FROM telegram_alarm_state WHERE alarm_key = ?').run(alarmKey);
      continue;
    }

    const isPriority = Boolean(priorityByKey?.[key]);

    if (!existing) {
      db.prepare('INSERT INTO telegram_alarm_state (alarm_key, active_since, last_sent_at) VALUES (?, datetime(\'now\'), datetime(\'now\'))').run(alarmKey);
      await sendTelegramMessage(`⚠️ Bombas: ${label}`).catch(() => {});
      continue;
    }

    if (!isPriority || existing.acknowledged_at) continue;

    const lastSentMs = new Date(existing.last_sent_at.replace(' ', 'T') + 'Z').getTime();
    const elapsedSeconds = (Date.now() - lastSentMs) / 1000;
    if (elapsedSeconds >= settings.resendIntervalSeconds) {
      db.prepare("UPDATE telegram_alarm_state SET last_sent_at = datetime('now') WHERE alarm_key = ?").run(alarmKey);
      await sendTelegramMessage(`⚠️ Bombas (ainda ativo): ${label}`).catch(() => {});
    }
  }
}
