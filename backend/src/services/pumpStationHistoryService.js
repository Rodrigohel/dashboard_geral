import { db } from '../db/sqlite.js';

// Só grava uma linha quando o valor de um sinal MUDA (ver
// pumpStationHistoryPoller.js) — log de borda, não de amostra. Isso é o que
// permite reconstruir "quando ligou, por quanto tempo, com quais níveis
// ativos" sem guardar uma linha a cada poll.
export function recordPumpStationEvent(pointKey, state) {
  db.prepare('INSERT INTO pump_events (point_key, state) VALUES (?, ?)').run(pointKey, state ? 1 : 0);
}

// Foto completa (todos os pontos) no instante em que uma bomba liga — ver
// pump_activation_snapshots em sqlite.js e o chamador em
// pumpStationHistoryPoller.js.
export function recordPumpActivationSnapshot(points) {
  db.prepare('INSERT INTO pump_activation_snapshots (points_json) VALUES (?)').run(JSON.stringify(points));
}

export function getPumpActivationSnapshots(limit = 10) {
  return db
    .prepare('SELECT id, points_json, created_at FROM pump_activation_snapshots ORDER BY id DESC LIMIT ?')
    .all(limit)
    // `created_at` vem do SQLite em UTC sem indicar o fuso ("YYYY-MM-DD
    // HH:MM:SS") — sem o "Z", o front interpreta como hora local e mostra
    // 3h adiantado (fuso de Brasília é UTC-3). Mesmo tratamento já usado
    // pros outros horários desse serviço (ver isoAt acima).
    .map((row) => ({ id: row.id, createdAt: row.created_at.replace(' ', 'T') + 'Z', points: JSON.parse(row.points_json) }));
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
  return { days, activations: inRange, stats, levelTransitions: getLevelTransitionStats() };
}

// Quanto tempo leva pra cruzar cada fronteira entre boias consecutivas,
// enchendo (a boia de cima liga depois da de baixo já estar ligada) e
// esvaziando (a boia de cima desliga, depois, tempo depois, a de baixo
// desliga também) — calculado do mesmo log de borda já gravado (nenhuma
// tabela nova), processando os 4 sinais de nível em ordem cronológica.
// Usado tanto pro histórico (ver tela Bombas) quanto pra estimar um %
// analógico de enchimento em tempo real (ver getFillEstimate abaixo).
const BOUNDARIES = [
  { from: 'nivelMinimo', to: 'nivelMedio', fromPercent: 24, toPercent: 48 },
  { from: 'nivelMedio', to: 'nivelMaximo', fromPercent: 48, toPercent: 72 },
  { from: 'nivelMaximo', to: 'nivelSeguranca', fromPercent: 72, toPercent: 92 },
];

export function getLevelTransitionStats() {
  const rows = db
    .prepare(`SELECT point_key, state, created_at FROM pump_events WHERE point_key IN (?, ?, ?, ?) ORDER BY created_at ASC, id ASC`)
    .all(...LEVEL_KEYS);

  const lastOnAt = {};
  const lastOffAt = {};
  const risingSamples = BOUNDARIES.map(() => []);
  const fallingSamples = BOUNDARIES.map(() => []);

  for (const row of rows) {
    const atMs = new Date(row.created_at.replace(' ', 'T') + 'Z').getTime();
    const idx = LEVEL_KEYS.indexOf(row.point_key);
    if (row.state === 1) {
      // Subindo: essa boia ligou — se a de baixo já estava ligada, essa é a
      // duração de cruzar a fronteira entre as duas.
      if (idx > 0 && lastOnAt[LEVEL_KEYS[idx - 1]] !== undefined) {
        risingSamples[idx - 1].push(atMs - lastOnAt[LEVEL_KEYS[idx - 1]]);
      }
      lastOnAt[row.point_key] = atMs;
    } else {
      // Descendo: essa boia desligou — se a de cima já tinha desligado
      // antes, essa é a duração de cruzar a mesma fronteira esvaziando.
      if (idx < LEVEL_KEYS.length - 1 && lastOffAt[LEVEL_KEYS[idx + 1]] !== undefined) {
        fallingSamples[idx].push(atMs - lastOffAt[LEVEL_KEYS[idx + 1]]);
      }
      lastOffAt[row.point_key] = atMs;
    }
  }

  function summarize(samplesMs) {
    if (samplesMs.length === 0) return null;
    const avgMs = samplesMs.reduce((a, b) => a + b, 0) / samplesMs.length;
    return { avgSeconds: Math.round(avgMs / 1000), sampleCount: samplesMs.length };
  }

  return BOUNDARIES.map((b, i) => ({
    from: b.from,
    to: b.to,
    rising: summarize(risingSamples[i]),
    falling: summarize(fallingSamples[i]),
  }));
}

// Mínimo de amostras pra confiar na média o bastante pra usar num cálculo
// analógico em vez de só mostrar o degrau — abaixo disso, uma ou duas
// enchidas atípicas (chuva forte, maré) distorceriam demais a estimativa.
const MIN_SAMPLES_FOR_ESTIMATE = 3;

function lastEventAt(pointKey, state) {
  const row = db
    .prepare('SELECT created_at FROM pump_events WHERE point_key = ? AND state = ? ORDER BY id DESC LIMIT 1')
    .get(pointKey, state ? 1 : 0);
  return row ? new Date(row.created_at.replace(' ', 'T') + 'Z').getTime() : null;
}

// % de enchimento estimado de forma contínua (não só os 4 degraus das
// boias) — interpola entre a marca atual e a próxima/anterior usando o
// tempo decorrido desde que entrou nessa faixa, dividido pela duração
// média histórica de cruzar essa fronteira (nessa direção: enchendo ou
// esvaziando). Sem amostra suficiente ainda pra essa fronteira específica,
// devolve null — quem chama cai pro degrau fixo (fillPercentFor), sem
// precisar de nenhuma troca manual: assim que acumular amostra o bastante,
// passa a vir preenchido sozinho.
export function getFillEstimate(points) {
  const pumping = points?.bomba1 === true || points?.bomba2 === true;
  const activeIdx = LEVEL_KEYS.reduce((acc, k, i) => (points?.[k] === true ? i : acc), -1);

  // Faixa "abaixo do mínimo" (nenhuma boia ativa) ou "acima da segurança"
  // (todas ativas) não têm fronteira rastreada de um dos lados — sem como
  // estimar, fica pro degrau fixo.
  if (activeIdx === -1 || activeIdx === LEVEL_KEYS.length - 1) return null;

  // A faixa atual (entre LEVEL_KEYS[activeIdx] e LEVEL_KEYS[activeIdx+1]) é
  // sempre a fronteira de mesmo índice em BOUNDARIES — enchendo ou
  // esvaziando, é a mesma fronteira sendo cruzada, só a direção muda.
  const boundaryIdx = activeIdx;

  const boundary = BOUNDARIES[boundaryIdx];
  const stats = getLevelTransitionStats()[boundaryIdx];
  const dirStats = pumping ? stats.falling : stats.rising;
  if (!dirStats || dirStats.sampleCount < MIN_SAMPLES_FOR_ESTIMATE) return null;

  const anchorMs = pumping ? lastEventAt(boundary.to, false) : lastEventAt(boundary.from, true);
  if (anchorMs === null) return null;

  const elapsedSeconds = (Date.now() - anchorMs) / 1000;
  const ratio = Math.min(1, Math.max(0, elapsedSeconds / dirStats.avgSeconds));
  const percent = pumping
    ? boundary.toPercent - ratio * (boundary.toPercent - boundary.fromPercent)
    : boundary.fromPercent + ratio * (boundary.toPercent - boundary.fromPercent);

  return { percent: Math.round(percent), direction: pumping ? 'esvaziando' : 'enchendo', sampleCount: dirStats.sampleCount };
}
