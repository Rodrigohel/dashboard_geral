import { db } from '../db/sqlite.js';
import { getRetentionSettings } from './retentionSettingsService.js';

const RUN_EVERY_MS = 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;

function pruneOnce() {
  const { auditRetentionDays } = getRetentionSettings();
  if (!auditRetentionDays) return;
  const cutoff = `-${auditRetentionDays} days`;
  db.prepare(`DELETE FROM login_events WHERE created_at < datetime('now', ?)`).run(cutoff);
  db.prepare(`DELETE FROM door_open_events WHERE created_at < datetime('now', ?)`).run(cutoff);
}

// Roda 1x por dia — apagar log de auditoria não é urgente, então não faz
// sentido checar com mais frequência que isso (mesma ideia do
// deviceHealthPoller, intervalo bem mais espaçado por não precisar de
// "tempo real").
export function startAuditRetentionPruner() {
  setTimeout(() => {
    pruneOnce();
    setInterval(pruneOnce, RUN_EVERY_MS);
  }, INITIAL_DELAY_MS);
}
