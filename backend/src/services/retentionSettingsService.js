import { db } from '../db/sqlite.js';

const MIN_DAYS = 7;
const MAX_DAYS = 3650;

export function getRetentionSettings() {
  const row = db.prepare('SELECT * FROM retention_settings WHERE id = 1').get();
  return { auditRetentionDays: row.audit_retention_days };
}

// 0 é um valor válido de propósito — significa "nunca apagar sozinho"
// (comportamento de sempre). Fora isso, trava numa faixa razoável pra
// ninguém apagar tudo sem querer digitando 1 dia.
export function validateRetentionSettings({ auditRetentionDays }) {
  const v = Number(auditRetentionDays);
  if (!Number.isInteger(v) || (v !== 0 && (v < MIN_DAYS || v > MAX_DAYS))) {
    return `Valor inválido para "auditRetentionDays" — use 0 (nunca apagar) ou um inteiro entre ${MIN_DAYS} e ${MAX_DAYS}.`;
  }
  return null;
}

export function saveRetentionSettings({ auditRetentionDays }) {
  db.prepare('UPDATE retention_settings SET audit_retention_days = ? WHERE id = 1').run(Number(auditRetentionDays));
}
