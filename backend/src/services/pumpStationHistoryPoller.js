import { db } from '../db/sqlite.js';
import { readPumpStationStatus } from './pumpStationClient.js';
import { recordPumpStationEvent } from './pumpStationHistoryService.js';

// Mesmos 9 sinais da tela "Bombas" — centralizado aqui pra bater com
// routes/pumpStation.js sem importar o router inteiro só por causa disso.
const POINTS = [
  ['nivelMinimo', 'nivel_minimo'],
  ['nivelMedio', 'nivel_medio'],
  ['nivelMaximo', 'nivel_maximo'],
  ['nivelSeguranca', 'nivel_seguranca'],
  ['bomba1', 'bomba1'],
  ['bomba2', 'bomba2'],
  ['termico1', 'termico1'],
  ['termico2', 'termico2'],
  ['modoManual', 'modo_manual'],
];

function getConfig() {
  const row = db.prepare('SELECT * FROM pump_station WHERE id = 1').get();
  const points = {};
  for (const [key, column] of POINTS) {
    points[key] = { addr: row[`${column}_addr`], type: row[`${column}_type`] };
  }
  return { enabled: Boolean(row.enabled), host: row.host, port: row.port, unitId: row.unit_id, pollSeconds: row.poll_seconds, points };
}

// Último valor conhecido de cada sinal — null até a primeira leitura bem
// sucedida (nunca grava "evento" na primeira leitura: isso seria o estado
// atual, não uma mudança de verdade, e criaria uma ativação falsa toda vez
// que o Portal reiniciar).
let lastKnown = {};
let hasBaseline = false;

async function pollOnce() {
  const config = getConfig();
  if (!config.enabled || !config.host) return;
  let status;
  try {
    status = await readPumpStationStatus(config);
  } catch {
    // Falha de leitura pontual (IHM fora do ar, rede) — só pula essa rodada,
    // não apaga o baseline (senão uma queda de rede de 1 rodada geraria
    // eventos falsos quando voltasse).
    return;
  }

  for (const [key] of POINTS) {
    const value = status[key];
    if (value === null || (typeof value === 'object' && value?.error)) continue; // ponto não configurado ou erro de leitura nesse ciclo
    const boolValue = Boolean(value);
    if (hasBaseline && lastKnown[key] !== boolValue) {
      recordPumpStationEvent(key, boolValue);
    }
    lastKnown[key] = boolValue;
  }
  hasBaseline = true;
}

export function startPumpStationHistoryPoller() {
  // Mesmo intervalo configurado pra tela de status — não faz sentido ter um
  // segundo número de "a cada quanto tempo checar" só pro histórico.
  async function tick() {
    await pollOnce();
    const { pollSeconds } = getConfig();
    setTimeout(tick, Math.max(1, pollSeconds || 10) * 1000);
  }
  setTimeout(tick, 10_000);
}
