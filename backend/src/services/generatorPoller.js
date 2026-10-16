// Checagem periódica do gerador em segundo plano — sem isso, o alarme de
// "falha" (ver telegramService.js) só seria detectado enquanto alguém
// estivesse com a tela do Gerador ou a Início abertas (são elas que chamam
// GET /status hoje). Mesma ideia do pumpStationHistoryPoller.js, só que sem
// histórico/snapshots: o gerador só precisa disso pra alimentar o alarme.
import { db } from '../db/sqlite.js';
import { readGeneratorStatus } from './generatorClient.js';
import { checkGeneratorAlarms } from './telegramService.js';
import { logSystemEvent } from './systemEventsService.js';
import { recordGeneratorEvent, recordGeneratorActivationSnapshot } from './generatorHistoryService.js';

const POINT_LABEL = {
  pronto: 'Pronto (standby)',
  falha: 'Falha (nível 2/shutdown)',
  emOperacao: 'Em operação (gerando energia)',
  avisoAtivo: 'Aviso ativo (nível 1)',
};

// Mesmo cuidado do pumpStationHistoryPoller: só loga mudança de estado
// (não a leitura em si), e só depois da primeira leitura bem sucedida
// (baseline) — senão todo restart do Portal geraria um evento falso.
let lastKnown = {};
let hasBaseline = false;

function getConfig() {
  const row = db.prepare('SELECT * FROM generator_station WHERE id = 1').get();
  return {
    enabled: Boolean(row.enabled),
    host: row.host,
    port: row.port,
    unitId: row.unit_id,
    pollSeconds: row.poll_seconds,
    falhaPriority: Boolean(row.falha_priority),
    avisoPriority: Boolean(row.aviso_ativo_priority),
    points: {
      pronto: { addr: row.pronto_addr, type: row.pronto_type, invert: Boolean(row.pronto_invert) },
      falha: { addr: row.falha_addr, type: row.falha_type, invert: Boolean(row.falha_invert) },
      emOperacao: { addr: row.em_operacao_addr, type: row.em_operacao_type, invert: Boolean(row.em_operacao_invert) },
      avisoAtivo: { addr: row.aviso_ativo_addr, type: row.aviso_ativo_type, invert: Boolean(row.aviso_ativo_invert) },
    },
    // Ver VALUE_POINTS em routes/generator.js — mesmos endereços, só sem
    // invert/priority (não são booleanos).
    valuePoints: {
      estadoMotor: { addr: row.estado_motor_addr, type: row.estado_motor_type },
      modoControlador: { addr: row.modo_controlador_addr, type: row.modo_controlador_type },
      tensaoGeradorL1N: { addr: row.tensao_gerador_l1n_addr, type: row.tensao_gerador_l1n_type },
      tensaoGeradorL2N: { addr: row.tensao_gerador_l2n_addr, type: row.tensao_gerador_l2n_type },
      tensaoGeradorL3N: { addr: row.tensao_gerador_l3n_addr, type: row.tensao_gerador_l3n_type },
      tensaoRedeL1N: { addr: row.tensao_rede_l1n_addr, type: row.tensao_rede_l1n_type },
      tensaoRedeL2N: { addr: row.tensao_rede_l2n_addr, type: row.tensao_rede_l2n_type },
      tensaoRedeL3N: { addr: row.tensao_rede_l3n_addr, type: row.tensao_rede_l3n_type },
    },
    customPoints: getCustomPointRows(),
  };
}

function getCustomPointRows() {
  return db.prepare('SELECT id, name, addr, type, invert FROM generator_custom_points ORDER BY id ASC').all();
}

async function pollOnce() {
  const config = getConfig();
  if (!config.enabled || !config.host) return;
  let points;
  try {
    points = await readGeneratorStatus(config);
  } catch {
    // Falha de leitura pontual (controlador fora do ar, rede) — só pula essa
    // rodada, igual pumpStationHistoryPoller.
    return;
  }
  for (const key of Object.keys(POINT_LABEL)) {
    const value = points[key];
    if (value === null || (typeof value === 'object' && value?.error)) continue;
    const boolValue = Boolean(value);
    if (hasBaseline && lastKnown[key] !== boolValue) {
      logSystemEvent('gerador.' + key, `${POINT_LABEL[key]}: ${boolValue ? 'entrou' : 'saiu'}`);
      recordGeneratorEvent(key, boolValue);
      // Gerador acabou de entrar em operação: tira uma foto de TODOS os
      // pontos nesse instante, mesma ideia das fotos de ativação de bomba.
      if (key === 'emOperacao' && boolValue === true) {
        recordGeneratorActivationSnapshot(points);
      }
    }
    lastKnown[key] = boolValue;
  }
  hasBaseline = true;

  await checkGeneratorAlarms(points, config.falhaPriority, config.avisoPriority).catch(() => {});
}

export function startGeneratorPoller() {
  async function tick() {
    await pollOnce();
    const { pollSeconds } = getConfig();
    setTimeout(tick, Math.max(1, pollSeconds || 10) * 1000);
  }
  setTimeout(tick, 10_000);
}
