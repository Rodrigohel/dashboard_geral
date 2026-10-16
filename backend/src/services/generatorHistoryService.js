// Histórico/fotos do Gerador — mesmo padrão de pumpStationHistoryService.js,
// simplificado: Gerador não tem "nível" (não faz sentido estimar tempo de
// enchimento), só os 3 pontos booleanos + customizados, então o histórico é
// a lista crua de transições (liga/desliga pronto/falha/emOperacao), não um
// gráfico calculado.
import { db } from '../db/sqlite.js';

export function recordGeneratorEvent(pointKey, state) {
  db.prepare('INSERT INTO generator_events (point_key, state) VALUES (?, ?)').run(pointKey, state ? 1 : 0);
}

// Foto completa (todos os pontos) no instante em que o gerador entra em
// operação — ver generator_activation_snapshots em sqlite.js e o chamador
// em generatorPoller.js.
export function recordGeneratorActivationSnapshot(points) {
  db.prepare('INSERT INTO generator_activation_snapshots (points_json) VALUES (?)').run(JSON.stringify(points));
}

export function getGeneratorActivationSnapshots(limit = 10) {
  return db
    .prepare('SELECT id, points_json, created_at FROM generator_activation_snapshots ORDER BY id DESC LIMIT ?')
    .all(limit)
    // Mesmo cuidado do pumpStationHistoryService: SQLite guarda em UTC sem
    // "Z" — sem isso o navegador mostra 3h adiantado.
    .map((row) => ({ id: row.id, createdAt: row.created_at.replace(' ', 'T') + 'Z', points: JSON.parse(row.points_json) }));
}

export function getGeneratorHistory({ days = 30 } = {}) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare('SELECT point_key AS pointKey, state, created_at AS createdAt FROM generator_events WHERE created_at >= ? ORDER BY id DESC')
    .all(sinceIso.slice(0, 19).replace('T', ' '))
    .map((row) => ({ pointKey: row.pointKey, state: Boolean(row.state), createdAt: row.createdAt.replace(' ', 'T') + 'Z' }));
}
