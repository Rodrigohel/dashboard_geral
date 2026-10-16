import { db } from '../db/sqlite.js';
import { readPumpStationStatus } from './pumpStationClient.js';
import { recordPumpStationEvent, recordPumpActivationSnapshot } from './pumpStationHistoryService.js';
import { checkBombasAlarms } from './telegramService.js';
import { logSystemEvent } from './systemEventsService.js';

const POINT_LABEL = {
  nivelMinimo: 'Nível mínimo',
  nivelMedio: 'Nível médio',
  nivelMaximo: 'Nível máximo',
  nivelSeguranca: 'Nível de segurança',
  bomba1: 'Bomba 1',
  bomba2: 'Bomba 2',
  termico1: 'Térmico 1',
  termico2: 'Térmico 2',
  modoManual: 'Modo manual',
  emergencia: 'Emergência',
  faltaFase: 'Falta de fase',
  painelDesligado: 'Painel desligado',
  falhaBoias: 'Falha nas boias',
};

// Mesma lista de PRIORITY_KEYS de routes/pumpStation.js — centralizada aqui
// de novo (igual os POINTS acima) pra não importar o router inteiro só por
// causa disso.
const PRIORITY_COLUMN_BY_KEY = {
  termico1: 'termico1',
  termico2: 'termico2',
  modoManual: 'modo_manual',
  emergencia: 'emergencia',
  faltaFase: 'falta_fase',
  painelDesligado: 'painel_desligado',
  falhaBoias: 'falha_boias',
};

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
  ['emergencia', 'emergencia'],
  ['faltaFase', 'falta_fase'],
  ['painelDesligado', 'painel_desligado'],
  ['falhaBoias', 'falha_boias'],
  ['bomba1DoDia', 'bomba1_do_dia'],
  ['bomba2DoDia', 'bomba2_do_dia'],
];

function getConfig() {
  const row = db.prepare('SELECT * FROM pump_station WHERE id = 1').get();
  const points = {};
  for (const [key, column] of POINTS) {
    points[key] = { addr: row[`${column}_addr`], type: row[`${column}_type`] };
  }
  const priorityByKey = {};
  for (const [key, column] of Object.entries(PRIORITY_COLUMN_BY_KEY)) {
    priorityByKey[key] = Boolean(row[`${column}_priority`]);
  }
  return { enabled: Boolean(row.enabled), host: row.host, port: row.port, unitId: row.unit_id, pollSeconds: row.poll_seconds, points, priorityByKey };
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
      const label = POINT_LABEL[key] || key;
      logSystemEvent('bombas.' + key, `${label}: ${boolValue ? 'ligou/ativou' : 'desligou/desativou'}`);
      // Bomba acabou de ligar: tira uma foto de TODOS os pontos nesse exato
      // instante, pra comparar depois com o painel físico sem precisar
      // estar lá esperando ligar (pedido do Rodrigo após a discrepância da
      // bomba 1 — ver IDEIAS.md).
      if ((key === 'bomba1' || key === 'bomba2') && boolValue === true) {
        recordPumpActivationSnapshot(status);
      }
    }
    lastKnown[key] = boolValue;
  }
  hasBaseline = true;

  // Alertas via Telegram (ver IDEIAS.md) — checa a cada leitura, não só em
  // cima de edge/baseline: se o Portal reiniciar com um alarme já ativo,
  // ainda assim quer avisar.
  checkBombasAlarms(status, config.priorityByKey).catch(() => {});
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
