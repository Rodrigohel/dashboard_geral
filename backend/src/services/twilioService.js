// Escalonamento por ligação telefônica (ver IDEIAS.md) — quando um alarme de
// prioridade fica ativo e sem reconhecer no Telegram por `callAfterSeconds`,
// liga pros números cadastrados além de insistir por mensagem. Sem conta
// Twilio de verdade (Account SID + Auth Token + número de origem) configurada
// aqui, isso nunca chega a ligar de fato — fica só pronto pra quando o
// Rodrigo criar a conta e preencher (preço/provedor ainda não decididos).
import { db } from '../db/sqlite.js';
import { encryptSecret, decryptSecret } from './cryptoService.js';

function getRow() {
  return db.prepare('SELECT * FROM twilio_settings WHERE id = 1').get();
}

function toNumberList(row) {
  return (row.to_numbers || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

export function getTwilioSettings() {
  const row = getRow();
  return {
    enabled: Boolean(row.enabled),
    hasAuthToken: Boolean(row.auth_token_enc),
    accountSid: row.account_sid,
    fromNumber: row.from_number,
    toNumbers: toNumberList(row),
    callAfterSeconds: row.call_after_seconds,
    configured: Boolean(row.account_sid && row.auth_token_enc && row.from_number) && toNumberList(row).length > 0,
  };
}

// Auth token nunca volta pro front já salvo — mesmo padrão do token do bot
// do Telegram e da senha de equipamento.
export function saveTwilioSettings({ enabled, accountSid, authToken, fromNumber, toNumbers, callAfterSeconds }) {
  const row = getRow();
  const authTokenEnc = authToken ? encryptSecret(authToken) : row.auth_token_enc;
  const toNumbersStr = Array.isArray(toNumbers) ? toNumbers.map((n) => String(n).trim()).filter(Boolean).join(',') : row.to_numbers;
  const callAfter = Math.min(3600, Math.max(30, Number(callAfterSeconds) || row.call_after_seconds));
  db.prepare(
    'UPDATE twilio_settings SET enabled = ?, account_sid = ?, auth_token_enc = ?, from_number = ?, to_numbers = ?, call_after_seconds = ? WHERE id = 1'
  ).run(enabled ? 1 : 0, accountSid ?? row.account_sid, authTokenEnc, fromNumber ?? row.from_number, toNumbersStr, callAfter);
  return getTwilioSettings();
}

function getSavedAuthToken() {
  const row = getRow();
  return row.auth_token_enc ? decryptSecret(row.auth_token_enc) : null;
}

// Confere a conta sem gastar nada (GET simples na API, sem ligar pra
// ninguém) — mesmo papel do "getMe" do Telegram, só pra validar
// Account SID + Auth Token antes de salvar de verdade.
export async function testTwilioConnection(accountSid, authToken) {
  const sid = accountSid || getRow().account_sid;
  const token = authToken || getSavedAuthToken();
  if (!sid || !token) throw new Error('Informe Account SID e Auth Token.');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Twilio respondeu ${res.status} — confira Account SID/Auth Token.`);
  return { friendlyName: data.friendly_name, status: data.status };
}

// Liga de verdade pra UM número, com uma mensagem falada por texto-pra-voz
// (TwiML <Say>) — repete duas vezes pra dar tempo de entender ao atender.
async function placeCall(toNumber, message) {
  const row = getRow();
  const authToken = decryptSecret(row.auth_token_enc);
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="pt-BR">${message}</Say><Pause length="1"/><Say language="pt-BR">${message}</Say></Response>`;
  const body = new URLSearchParams({ To: toNumber, From: row.from_number, Twiml: twiml });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${row.account_sid}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${row.account_sid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Twilio respondeu ${res.status} ao tentar ligar.`);
  return data;
}

// Chamado pelo telegramService (ver upsertAlarm) a cada checagem de um
// alarme de prioridade ainda ativo e não reconhecido — só liga UMA vez por
// episódio do alarme (até resolver ou reconhecer), passado `callAfterSeconds`
// desde que o alarme começou. `activeSince`/`callSentAt` vêm do
// telegram_alarm_state; devolve `true` se ligou agora (quem chamou marca
// call_sent_at).
export async function maybeEscalateToCall(label, activeSince, callSentAt) {
  const settings = getTwilioSettings();
  if (!settings.enabled || !settings.configured || callSentAt) return false;
  const activeSinceMs = new Date(activeSince.replace(' ', 'T') + 'Z').getTime();
  const elapsedSeconds = (Date.now() - activeSinceMs) / 1000;
  if (elapsedSeconds < settings.callAfterSeconds) return false;

  const message = `Alerta do Portal. ${label}. Ninguém confirmou pelo Telegram ainda.`;
  await Promise.allSettled(settings.toNumbers.map((n) => placeCall(n, message)));
  return true;
}
