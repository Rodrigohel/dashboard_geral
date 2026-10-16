// Checagem periódica do gerador em segundo plano — sem isso, o alarme de
// "falha" (ver telegramService.js) só seria detectado enquanto alguém
// estivesse com a tela do Gerador ou a Início abertas (são elas que chamam
// GET /status hoje). Mesma ideia do pumpStationHistoryPoller.js, só que sem
// histórico/snapshots: o gerador só precisa disso pra alimentar o alarme.
import { db } from '../db/sqlite.js';
import { readGeneratorStatus } from './generatorClient.js';
import { checkGeneratorAlarms } from './telegramService.js';

function getConfig() {
  const row = db.prepare('SELECT * FROM generator_station WHERE id = 1').get();
  return {
    enabled: Boolean(row.enabled),
    host: row.host,
    port: row.port,
    unitId: row.unit_id,
    pollSeconds: row.poll_seconds,
    falhaPriority: Boolean(row.falha_priority),
    points: {
      pronto: { addr: row.pronto_addr, type: row.pronto_type, invert: Boolean(row.pronto_invert) },
      falha: { addr: row.falha_addr, type: row.falha_type, invert: Boolean(row.falha_invert) },
      emOperacao: { addr: row.em_operacao_addr, type: row.em_operacao_type, invert: Boolean(row.em_operacao_invert) },
    },
  };
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
  await checkGeneratorAlarms(points, config.falhaPriority).catch(() => {});
}

export function startGeneratorPoller() {
  async function tick() {
    await pollOnce();
    const { pollSeconds } = getConfig();
    setTimeout(tick, Math.max(1, pollSeconds || 10) * 1000);
  }
  setTimeout(tick, 10_000);
}
