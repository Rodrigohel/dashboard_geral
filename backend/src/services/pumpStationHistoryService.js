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
  const validSince = getHistoryValidSince();
  const rows = validSince
    ? db.prepare('SELECT id, points_json, created_at FROM pump_activation_snapshots WHERE created_at >= ? ORDER BY id DESC LIMIT ?').all(validSince, limit)
    : db.prepare('SELECT id, points_json, created_at FROM pump_activation_snapshots ORDER BY id DESC LIMIT ?').all(limit);
  return rows
    // `created_at` vem do SQLite em UTC sem indicar o fuso ("YYYY-MM-DD
    // HH:MM:SS") — sem o "Z", o front interpreta como hora local e mostra
    // 3h adiantado (fuso de Brasília é UTC-3). Mesmo tratamento já usado
    // pros outros horários desse serviço (ver isoAt acima).
    .map((row) => ({ id: row.id, createdAt: row.created_at.replace(' ', 'T') + 'Z', points: JSON.parse(row.points_json) }));
}

const LEVEL_KEYS = ['nivelMinimo', 'nivelMedio', 'nivelMaximo', 'nivelSeguranca'];
const PUMP_KEYS = ['bomba1', 'bomba2'];

export function getHistoryValidSince() {
  return db.prepare('SELECT history_valid_since FROM pump_station WHERE id = 1').get()?.history_valid_since || null;
}

// Zera a validade do histórico de tempo a partir de agora (ver coluna
// `history_valid_since` em sqlite.js) — pump_events não é apagado, só passa
// a ser ignorado pelas médias/estatística antes do corte. Se uma bomba
// estiver ligada NESTE instante, o corte fica no início do ciclo dela em
// andamento (ele continua válido, só o que já tinha fechado antes some).
export function resetPumpHistoryValidity() {
  let cutoff = new Date().toISOString().slice(0, 19).replace('T', ' ');
  for (const key of PUMP_KEYS) {
    const last = db.prepare('SELECT state, created_at FROM pump_events WHERE point_key = ? ORDER BY id DESC LIMIT 1').get(key);
    if (last && last.state === 1 && last.created_at < cutoff) cutoff = last.created_at;
  }
  db.prepare('UPDATE pump_station SET history_valid_since = ? WHERE id = 1').run(cutoff);
  return cutoff;
}

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

  // Descarta ciclos que começaram antes do corte de validade (ver
  // resetPumpHistoryValidity) — mesmo processando o histórico todo acima
  // (necessário pra "levelsAtStart" ficar certo), o ciclo em si só entra na
  // conta se começou depois do corte (ou é o ciclo em andamento NO corte,
  // que foi exatamente o ponto escolhido como início válido).
  const validSince = getHistoryValidSince();
  const afterCutoff = validSince ? activations.filter((a) => a.startedAt.slice(0, 19).replace('T', ' ') >= validSince) : activations;
  const inRange = afterCutoff.filter((a) => a.startedAt >= sinceIso).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  const stats = {};
  for (const key of PUMP_KEYS) {
    const forPump = inRange.filter((a) => a.pointKey === key);
    stats[key] = {
      count: forPump.length,
      totalSeconds: forPump.reduce((sum, a) => sum + a.durationSeconds, 0),
    };
  }
  return {
    days,
    activations: inRange,
    stats,
    levelTransitions: getLevelTransitionStats(),
    historyValidSince: validSince ? validSince.replace(' ', 'T') + 'Z' : null,
  };
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
  // Corte de validade (ver resetPumpHistoryValidity) só vale pra ESVAZIANDO
  // (o nível desce porque uma bomba está puxando — direto afetado pela
  // falha dos contatores jumpeados: as duas bombas rodavam juntas, drenando
  // mais rápido que o normal). ENCHENDO é o poço recebendo água de fora,
  // sem bomba nenhuma envolvida — não tem relação com a falha, então usa o
  // histórico todo sempre (pedido do Rodrigo: "o tempo de enchimento é a
  // única coisa que permanece, pois independe das bombas").
  const validSince = getHistoryValidSince();
  const rows = db
    .prepare(`SELECT point_key, state, created_at FROM pump_events WHERE point_key IN (?, ?, ?, ?) ORDER BY created_at ASC, id ASC`)
    .all(...LEVEL_KEYS);

  // BUG corrigido aqui (relatado pelo Rodrigo: "máximo → médio" aparecia com
  // duração enorme e dezenas de ciclos mesmo o nível nunca tendo chegado no
  // máximo de verdade). Causa: a versão anterior usava `lastOnAt`/`lastOffAt`
  // como mapas "última vez que ligou/desligou, pra sempre" — uma vez que o
  // nível máximo ligasse e desligasse UMA VEZ (meses atrás, numa maré
  // forte), esse timestamp antigo ficava pendurado pra sempre e era reusado
  // em TODO ciclo futuro do médio desligando, mesmo sem relação nenhuma com
  // aquele evento antigo — inflando contagem e duração sem sentido.
  //
  // Corrigido com uma "pendência" por fronteira que só existe enquanto o
  // ciclo está de fato em andamento, e é consumida (ou invalidada) uma vez:
  // - pendingAscent[i]: timestamp em que a boia de BAIXO da fronteira i
  //   ligou — fica válido até a boia de CIMA ligar também (fecha o ciclo,
  //   gera a amostra) ou até a boia de baixo desligar de novo antes disso
  //   (invalida — não é mais a mesma enchente).
  // - pendingDescent[i]: timestamp em que a boia de CIMA da fronteira i
  //   desligou — fica válido até a boia de BAIXO desligar também (fecha o
  //   ciclo) ou até a boia de cima ligar de novo antes disso (invalida).
  const pendingAscent = BOUNDARIES.map(() => null);
  const pendingDescent = BOUNDARIES.map(() => null);
  const risingSamples = BOUNDARIES.map(() => []);
  const fallingSamples = BOUNDARIES.map(() => []);

  for (const row of rows) {
    const atMs = new Date(row.created_at.replace(' ', 'T') + 'Z').getTime();
    const idx = LEVEL_KEYS.indexOf(row.point_key);
    if (row.state === 1) {
      // Essa boia ligou: fecha a subida da fronteira de baixo dela (idx-1),
      // se tinha uma pendente — e invalida qualquer descida pendente dessa
      // mesma fronteira (essa boia religou antes da de baixo completar o
      // esvaziamento, não é mais o mesmo ciclo).
      if (idx > 0) {
        if (pendingAscent[idx - 1] !== null) {
          risingSamples[idx - 1].push({ ms: atMs - pendingAscent[idx - 1], startAt: pendingAscent[idx - 1], endAt: atMs });
          pendingAscent[idx - 1] = null;
        }
        pendingDescent[idx - 1] = null;
      }
      // E abre a pendência de subida da fronteira de cima dela (idx),
      // esperando a próxima boia ligar.
      if (idx < BOUNDARIES.length) pendingAscent[idx] = atMs;
    } else {
      // Essa boia desligou: fecha a descida da fronteira de cima dela
      // (idx), se tinha uma pendente — e invalida qualquer subida pendente
      // dessa mesma fronteira (essa boia desligou antes da de cima
      // completar o enchimento).
      if (idx < BOUNDARIES.length) {
        if (pendingDescent[idx] !== null) {
          fallingSamples[idx].push({ ms: atMs - pendingDescent[idx], startAt: pendingDescent[idx], endAt: atMs });
          pendingDescent[idx] = null;
        }
        pendingAscent[idx] = null;
      }
      // E abre a pendência de descida da fronteira de baixo dela (idx-1),
      // esperando a próxima boia (de baixo) desligar também.
      if (idx > 0) pendingDescent[idx - 1] = atMs;
    }
  }

  // `samples` vai junto na resposta pra dar pra CONFERIR de onde veio a
  // média (pedido do Rodrigo — "onde você tirou esse número?") — cada item
  // é um ciclo real, com data/hora de início e fim, não só o número final.
  // Limitado aos 20 mais recentes pra não inflar a resposta à toa.
  function summarize(samples) {
    if (samples.length === 0) return null;
    const avgMs = samples.reduce((a, s) => a + s.ms, 0) / samples.length;
    const recent = [...samples]
      .sort((a, b) => b.endAt - a.endAt)
      .slice(0, 20)
      .map((s) => ({ startAt: new Date(s.startAt).toISOString(), endAt: new Date(s.endAt).toISOString(), seconds: Math.round(s.ms / 1000) }));
    return { avgSeconds: Math.round(avgMs / 1000), sampleCount: samples.length, samples: recent };
  }

  const validSinceMs = validSince ? new Date(validSince.replace(' ', 'T') + 'Z').getTime() : null;
  return BOUNDARIES.map((b, i) => ({
    from: b.from,
    to: b.to,
    rising: summarize(risingSamples[i]),
    falling: summarize(validSinceMs ? fallingSamples[i].filter((s) => s.startAt >= validSinceMs) : fallingSamples[i]),
  }));
}

// Mínimo de amostras pra confiar na média o bastante pra usar num cálculo
// analógico em vez de só mostrar o degrau — abaixo disso, uma ou duas
// enchidas atípicas (chuva forte, maré) distorceriam demais a estimativa.
const MIN_SAMPLES_FOR_ESTIMATE = 3;

// `respectCutoff` só faz sentido pra esvaziando (ver getLevelTransitionStats
// acima) — enchendo não tem corte, usa o último evento real sempre.
function lastEventAt(pointKey, state, respectCutoff = true) {
  const validSince = respectCutoff ? getHistoryValidSince() : null;
  const row = validSince
    ? db
        .prepare('SELECT created_at FROM pump_events WHERE point_key = ? AND state = ? AND created_at >= ? ORDER BY id DESC LIMIT 1')
        .get(pointKey, state ? 1 : 0, validSince)
    : db.prepare('SELECT created_at FROM pump_events WHERE point_key = ? AND state = ? ORDER BY id DESC LIMIT 1').get(pointKey, state ? 1 : 0);
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

  const anchorMs = pumping ? lastEventAt(boundary.to, false, true) : lastEventAt(boundary.from, true, false);
  if (anchorMs === null) return null;

  const elapsedSeconds = (Date.now() - anchorMs) / 1000;
  const ratio = Math.min(1, Math.max(0, elapsedSeconds / dirStats.avgSeconds));
  const percent = pumping
    ? boundary.toPercent - ratio * (boundary.toPercent - boundary.fromPercent)
    : boundary.fromPercent + ratio * (boundary.toPercent - boundary.fromPercent);

  return { percent: Math.round(percent), direction: pumping ? 'esvaziando' : 'enchendo', sampleCount: dirStats.sampleCount };
}
