// Alertas via Telegram (ver IDEIAS.md) — manda mensagem quando um alarme da
// casa de bombas dispara, com dois botões ("Visto" / "Em manutenção")
// embutidos na própria mensagem. Tocar um botão reconhece SÓ aquele alarme
// (via callback_data = "ack:<alarmKey>" / "maint:<alarmKey>"), diferente de
// só digitar uma mensagem solta no chat, que continua reconhecendo todos os
// alarmes ativos de uma vez (fallback pra quem prefere digitar).
// Alarmes marcados como "prioridade" insistem (reenviam) a cada X segundos
// até alguém reconhecer, de um jeito ou de outro.
import crypto from 'node:crypto';
import { db } from '../db/sqlite.js';
import { encryptSecret, decryptSecret } from './cryptoService.js';
import { maybeEscalateToCall } from './twilioService.js';

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

export async function sendTelegramMessage(text, replyMarkup) {
  const row = getRow();
  if (!row.enabled || !row.bot_token_enc || !row.chat_id) return;
  const token = decryptSecret(row.bot_token_enc);
  await callTelegramApi(token, 'sendMessage', { chat_id: row.chat_id, text, reply_markup: replyMarkup });
}

// Manda a mensagem de alarme com os dois botões embutidos — tocar um deles
// manda uma "callback_query" pro webhook (ver handleCallbackQuery abaixo),
// sem precisar digitar nada.
function alarmReplyMarkup(alarmKey) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Visto', callback_data: `ack:${alarmKey}` },
        { text: '🔧 Em manutenção', callback_data: `maint:${alarmKey}` },
      ],
    ],
  };
}

const ACK_REASON_LABEL = { ack: 'visto', maint: 'em manutenção', texto: 'reconhecido pelo chat' };

// Reconhece UM alarme específico — usado quando a pessoa toca um dos
// botões da mensagem (ver handleCallbackQuery). `reason` é só pra confirmar
// de volta no chat com a palavra certa ("visto" vs "em manutenção").
function acknowledgeAlarm(alarmKey, reason) {
  const info = db
    .prepare("UPDATE telegram_alarm_state SET acknowledged_at = datetime('now'), ack_reason = ? WHERE alarm_key = ? AND acknowledged_at IS NULL")
    .run(reason, alarmKey);
  return info.changes > 0;
}

// Chamado pelo twilioService (ver handleCallAnswered) quando o Twilio avisa
// que alguém ATENDEU a ligação — atender já conta como reconhecimento,
// igual tocar "Visto" no Telegram, sem precisar fazer mais nada por voz.
export async function acknowledgeAlarmByPhone(alarmKey) {
  const row = db.prepare('SELECT label FROM telegram_alarm_state WHERE alarm_key = ?').get(alarmKey);
  const ok = acknowledgeAlarm(alarmKey, 'telefone');
  if (ok) {
    await sendTelegramMessage(`📞 "${row?.label || alarmKey}" reconhecido — ligação atendida, parei de insistir nesse.`).catch(() => {});
  }
}

// Qualquer MENSAGEM DE TEXTO solta no chat (não um toque de botão) reconhece
// TODOS os alarmes ativos ainda não reconhecidos — fallback pra quem prefere
// só digitar "já verifiquei" em vez de tocar num botão.
export async function acknowledgeAllActiveAlarms() {
  const pending = db.prepare('SELECT alarm_key FROM telegram_alarm_state WHERE acknowledged_at IS NULL').all();
  if (pending.length === 0) return [];
  db.prepare("UPDATE telegram_alarm_state SET acknowledged_at = datetime('now'), ack_reason = 'texto' WHERE acknowledged_at IS NULL").run();
  return pending.map((r) => r.alarm_key);
}

// Chamado pelo webhook quando chega uma "callback_query" (toque de botão).
// `data` é o callback_data mandado ("ack:bombas.termico1" ou
// "maint:bombas.termico1") — processa, responde o callback (pra tirar o
// "carregando" do botão no app do Telegram) e manda uma confirmação no chat.
export async function handleCallbackQuery(data, callbackQueryId) {
  const row = getRow();
  const [action, alarmKey] = String(data || '').split(':');
  if (!['ack', 'maint'].includes(action) || !alarmKey) {
    if (row.bot_token_enc) await callTelegramApi(decryptSecret(row.bot_token_enc), 'answerCallbackQuery', { callback_query_id: callbackQueryId }).catch(() => {});
    return;
  }
  // Label bonito salvo no momento em que o alarme disparou (ver upsertAlarm)
  // — funciona pra QUALQUER módulo, não só Bombas (antes só existia
  // ALARM_LABELS, que só cobria os 7 alarmes de Bombas; qualquer outro
  // alarme aparecia com a alarm_key crua nessa confirmação).
  const alarmRow = db.prepare('SELECT label FROM telegram_alarm_state WHERE alarm_key = ?').get(alarmKey);
  const ok = acknowledgeAlarm(alarmKey, action);
  const label = alarmRow?.label || alarmKey;
  if (row.bot_token_enc) {
    const token = decryptSecret(row.bot_token_enc);
    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: ok ? `Marcado como ${ACK_REASON_LABEL[action]}.` : 'Esse alarme já não estava mais ativo.',
    }).catch(() => {});
  }
  if (ok) {
    await sendTelegramMessage(`✅ "${label}" marcado como ${ACK_REASON_LABEL[action]} — parei de insistir nesse.`).catch(() => {});
  }
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

// Núcleo genérico, usado por TODOS os módulos (ver funções abaixo) — decide
// quando mandar mensagem nova, quando insistir (só prioridade, a cada
// `resendIntervalSeconds`), quando escalar pra ligação (ver twilioService,
// só prioridade também, depois de `callAfterSeconds` sem reconhecer) e
// quando considerar resolvido (isActive = false limpa o estado; próxima vez
// que disparar manda tudo de novo do zero).
async function upsertAlarm(alarmKey, label, isActive, isPriority) {
  const settings = getTelegramSettings();
  if (!settings.enabled) return;

  const existing = db.prepare('SELECT * FROM telegram_alarm_state WHERE alarm_key = ?').get(alarmKey);

  if (!isActive) {
    if (existing) db.prepare('DELETE FROM telegram_alarm_state WHERE alarm_key = ?').run(alarmKey);
    return;
  }

  if (!existing) {
    // Guarda o label bonito JUNTO com o estado — é o que permite a
    // confirmação de "Visto"/"Em manutenção" (handleCallbackQuery) e a de
    // ligação atendida (acknowledgeAlarmByPhone) mostrarem um texto decente
    // pra QUALQUER alarme, não só os 7 de Bombas.
    db.prepare("INSERT INTO telegram_alarm_state (alarm_key, label, active_since, last_sent_at) VALUES (?, ?, datetime('now'), datetime('now'))").run(alarmKey, label);
    await sendTelegramMessage(`⚠️ ${label}`, alarmReplyMarkup(alarmKey)).catch(() => {});
    return;
  }

  if (!isPriority || existing.acknowledged_at) return;

  maybeEscalateToCall(alarmKey, label, existing.active_since, existing.call_sent_at)
    .then((called) => {
      if (called) db.prepare("UPDATE telegram_alarm_state SET call_sent_at = datetime('now') WHERE alarm_key = ?").run(alarmKey);
    })
    .catch(() => {});

  const lastSentMs = new Date(existing.last_sent_at.replace(' ', 'T') + 'Z').getTime();
  const elapsedSeconds = (Date.now() - lastSentMs) / 1000;
  if (elapsedSeconds >= settings.resendIntervalSeconds) {
    db.prepare("UPDATE telegram_alarm_state SET last_sent_at = datetime('now') WHERE alarm_key = ?").run(alarmKey);
    await sendTelegramMessage(`⚠️ (ainda ativo) ${label}`, alarmReplyMarkup(alarmKey)).catch(() => {});
  }
}

// Chamado a cada leitura da casa de bombas (ver pumpStationHistoryPoller.js)
// com os valores atuais dos 7 sinais de alarme + quais deles são prioridade.
export async function checkBombasAlarms(points, priorityByKey) {
  for (const [key, label] of Object.entries(ALARM_LABELS)) {
    await upsertAlarm(`bombas.${key}`, `Bombas: ${label}`, points?.[key] === true, Boolean(priorityByKey?.[key]));
  }
}

// Chamado a cada leitura do gerador (ver generatorPoller.js) — só "falha"
// faz sentido como alarme (pronto/emOperacao são estado normal, não algo
// pra avisar/insistir).
export async function checkGeneratorAlarms(points, falhaPriority) {
  await upsertAlarm('gerador.falha', 'Gerador: falha ativa', points?.falha === true, Boolean(falhaPriority));
}

// Chamado a cada rodada do deviceHealthPoller.js, com TODOS os porteiros
// cadastrados — um alarme por equipamento (alarm_key inclui o id, não o
// nome, pra sobreviver a uma troca de nome sem perder o estado ativo).
export async function checkAccessDeviceAlarms(devices) {
  for (const device of devices) {
    await upsertAlarm(
      `acesso.device-${device.id}`,
      `Acesso: porteiro "${device.name}" offline`,
      device.last_status === 'offline',
      Boolean(device.telegram_priority)
    );
  }
}

// Rede/Interfone são painéis à parte (ver gatewayService.js) — só dão uma
// CONTAGEM de offline, não uma lista estável de equipamentos com id local.
// Por isso o alarme é por MÓDULO ("tem N offline" ou não), não por
// equipamento individual.
export async function checkNetworkAlarm(moduleKey, moduleLabel, offlineCount, isPriority) {
  const label = `${moduleLabel}: ${offlineCount} equipamento(s)/ramal(is) offline`;
  await upsertAlarm(`${moduleKey}.offline`, label, offlineCount > 0, isPriority);
}

// Força bruta é um EVENTO (uma tentativa isolada), não um sinal contínuo —
// não faz sentido "resolver" ou ficar reenviando igual os outros alarmes.
// Manda uma mensagem avulsa e, se marcado como prioridade, já liga direto
// (sem esperar `callAfterSeconds`, que só vale pros alarmes contínuos).
export async function sendForcaBrutaAlert(username, ip, isPriority) {
  const label = `Segurança: trava de força bruta disparada para "${username}" (${ip || 'IP desconhecido'})`;
  await sendTelegramMessage(`⚠️ ${label}`).catch(() => {});
  if (isPriority) {
    // Força bruta não tem uma linha persistente em telegram_alarm_state (é
    // evento, não sinal contínuo — ver comentário acima) — a chamada atendida
    // não tem o que reconhecer de volta, mas liga do mesmo jeito.
    await maybeEscalateToCall('seguranca.forca-bruta', label, new Date().toISOString().replace('T', ' ').slice(0, 19), null).catch(() => {});
  }
}
