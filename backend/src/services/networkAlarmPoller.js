// Alertas via Telegram (ver IDEIAS.md) pra Rede/Interfone — painéis à parte
// (ver gatewayService.js). Sem poller próprio, isso só seria checado
// enquanto alguém tivesse a Início ou o painel aberto no navegador — igual
// o motivo do generatorPoller.js existir.
//
// Rede já tem campo "favorito" no próprio painel (ver externalDeviceService
// — descoberto lendo o código do Debian_dashboard) — por isso usa alarme
// POR EQUIPAMENTO, só nos favoritados (pedido do Rodrigo: um alarme por
// equipamento que ELE escolheu, não "N offline" do módulo inteiro, que
// ficaria ruidoso conforme mais equipamento cai junto). Interfone ainda não
// tem esse campo (o Rodrigo disse que vai adicionar) — continua com o
// alarme agregado antigo até lá.
import { db } from '../db/sqlite.js';
import { getGatewayConfig, getServiceToken } from './gatewayService.js';
import { checkNetworkAlarm, checkExternalDeviceAlarms } from './telegramService.js';
import { listFavoritedExternalDevices } from './externalDeviceService.js';

const POLL_MS = 2 * 60 * 1000;
const INITIAL_DELAY_MS = 20 * 1000;

function getInterfonePriority() {
  const row = db.prepare('SELECT interfone_offline_priority FROM telegram_module_priority WHERE id = 1').get();
  return Boolean(row.interfone_offline_priority);
}

async function pollRede() {
  const gw = getGatewayConfig('rede');
  if (!gw.configured) return;
  const devices = await listFavoritedExternalDevices('rede');
  await checkExternalDeviceAlarms('rede', 'Rede', devices);
}

async function pollInterfone() {
  const gw = getGatewayConfig('interfone');
  if (!gw.configured) return;
  const token = await getServiceToken('interfone');
  const res = await fetch(`${gw.baseUrl}/api/extensions/summary`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const summary = await res.json();
  await checkNetworkAlarm('interfone', 'Interfone', Number(summary.offline) || 0, getInterfonePriority());
}

async function pollOnce() {
  try {
    await pollRede();
  } catch {
    // Painel fora do ar / token expirado nessa rodada — só pula, igual os
    // outros pollers (não apaga alarme já ativo por uma falha pontual).
  }
  try {
    await pollInterfone();
  } catch {
    // mesma lógica acima, independente pro Interfone.
  }
}

export function startNetworkAlarmPoller() {
  setTimeout(() => {
    pollOnce();
    setInterval(pollOnce, POLL_MS);
  }, INITIAL_DELAY_MS);
}
