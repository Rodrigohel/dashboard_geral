// Alertas via Telegram (ver IDEIAS.md) pra Rede/Interfone — painéis à parte
// (ver gatewayService.js), então em vez de ler direto do banco como
// Bombas/Gerador/Acesso, o Portal pergunta pro gateway o mesmo resumo que a
// Início já mostra ("Rede — N equipamento(s) offline"). Sem poller próprio,
// isso só seria checado enquanto alguém tivesse a Início ou o painel aberto
// no navegador — igual o motivo do generatorPoller.js existir.
import { db } from '../db/sqlite.js';
import { getGatewayConfig, getServiceToken } from './gatewayService.js';
import { checkNetworkAlarm } from './telegramService.js';

const POLL_MS = 2 * 60 * 1000;
const INITIAL_DELAY_MS = 20 * 1000;

const SUMMARY_PATH = {
  rede: '/api/devices/summary',
  interfone: '/api/extensions/summary',
};

function getPriorities() {
  const row = db.prepare('SELECT * FROM telegram_module_priority WHERE id = 1').get();
  return { rede: Boolean(row.rede_offline_priority), interfone: Boolean(row.interfone_offline_priority) };
}

async function fetchSummary(moduleKey) {
  const gw = getGatewayConfig(moduleKey);
  if (!gw.configured) return null;
  const token = await getServiceToken(moduleKey);
  const res = await fetch(`${gw.baseUrl}${SUMMARY_PATH[moduleKey]}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const MODULE_LABEL = { rede: 'Rede', interfone: 'Interfone' };

async function pollOnce() {
  const priorities = getPriorities();
  for (const moduleKey of ['rede', 'interfone']) {
    try {
      const summary = await fetchSummary(moduleKey);
      if (!summary) continue; // gateway ainda não configurado — nada a checar
      await checkNetworkAlarm(moduleKey, MODULE_LABEL[moduleKey], Number(summary.offline) || 0, priorities[moduleKey]);
    } catch {
      // Painel fora do ar / token expirado nessa rodada — só pula, igual os
      // outros pollers (não apaga alarme já ativo por uma falha pontual).
    }
  }
}

export function startNetworkAlarmPoller() {
  setTimeout(() => {
    pollOnce();
    setInterval(pollOnce, POLL_MS);
  }, INITIAL_DELAY_MS);
}
