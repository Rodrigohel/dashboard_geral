import { db } from '../db/sqlite.js';

// Só grava uma linha quando o valor de um sinal MUDA (ver
// pumpStationHistoryPoller.js) — log de borda, não de amostra. Isso é o que
// permite reconstruir "quando ligou, por quanto tempo, com quais níveis
// ativos" sem guardar uma linha a cada poll.
export function recordPumpStationEvent(pointKey, state) {
  db.prepare('INSERT INTO pump_events (point_key, state) VALUES (?, ?)').run(pointKey, state ? 1 : 0);
}

const LEVEL_KEYS = ['nivelMinimo', 'nivelMedio', 'nivelMaximo', 'nivelSeguranca'];
const PUMP_KEYS = ['bomba1', 'bomba2'];

// Processa TODO o histórico de borda em ordem cronológica — não só a janela
// pedida — porque pra saber "quais níveis estavam ativos quando a bomba 1
// ligou às 14h" precisa saber o estado de cada sensor ANTES desse instante,
// não só os eventos dentro do período. A tabela é de borda (não de amostra),
// então mesmo meses de histórico ficam pequenos o bastante pra processar em
// memória sem problema.
export function getPumpStationHistory({ days = 30 } = {}) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare('SELECT point_key, state, created_at FROM pump_events ORDER BY created_at ASC, id ASC').all();

  const currentState = {};
  const openActivations = {}; // pointKey -> { startedAt, levelsAtStart }
  const activations = [];
  let lastMinimoOnAt = null;
  const minimoToMedioSamples = []; // { ms, at } — at = quando o médio ligou (pra filtrar pela janela de dias)

  for (const row of rows) {
    const isoAt = row.created_at.replace(' ', 'T') + 'Z';
    if (PUMP_KEYS.includes(row.point_key)) {
      if (row.state === 1) {
        openActivations[row.point_key] = {
          pointKey: row.point_key,
          startedAt: isoAt,
          levelsAtStart: Object.fromEntries(LEVEL_KEYS.map((k) => [k, Boolean(currentState[k])])),
        };
      } else {
        const open = openActivations[row.point_key];
        if (open) {
          activations.push({ ...open, endedAt: isoAt, durationSeconds: Math.round((new Date(isoAt) - new Date(open.startedAt)) / 1000) });
          delete openActivations[row.point_key];
        }
      }
    }
    if (row.point_key === 'nivelMinimo' && row.state === 1) {
      lastMinimoOnAt = isoAt;
    }
    if (row.point_key === 'nivelMedio' && row.state === 1 && lastMinimoOnAt) {
      minimoToMedioSamples.push({ ms: new Date(isoAt) - new Date(lastMinimoOnAt), at: isoAt });
      lastMinimoOnAt = null;
    }
    currentState[row.point_key] = row.state;
  }

  // Bombas que ficaram ligadas e nunca mais desligaram (ainda em andamento,
  // ou a última leitura caiu bem no meio) — mostra como "em andamento" em
  // vez de descartar.
  const nowIso = new Date().toISOString();
  for (const open of Object.values(openActivations)) {
    activations.push({ ...open, endedAt: null, durationSeconds: Math.round((new Date(nowIso) - new Date(open.startedAt)) / 1000) });
  }

  const inRange = activations.filter((a) => a.startedAt >= sinceIso).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  const stats = {};
  for (const key of PUMP_KEYS) {
    const forPump = inRange.filter((a) => a.pointKey === key);
    stats[key] = {
      count: forPump.length,
      totalSeconds: forPump.reduce((sum, a) => sum + a.durationSeconds, 0),
    };
  }
  const avgSamples = minimoToMedioSamples.filter((s) => s.at >= sinceIso);
  stats.avgMinimoToMedioSeconds = avgSamples.length
    ? Math.round(avgSamples.reduce((sum, s) => sum + s.ms, 0) / avgSamples.length / 1000)
    : null;
  stats.minimoToMedioSampleCount = avgSamples.length;

  return { days, activations: inRange, stats };
}
