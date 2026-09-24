import { Router } from 'express';
import { db } from '../db/sqlite.js';

export const auditRouter = Router();

// Só os últimos 500 — é uma tela de auditoria pra consulta rápida, não um
// relatório histórico completo (o SQLite guarda tudo, mas não pagina aqui).
auditRouter.get('/logins', (req, res) => {
  const rows = db
    .prepare('SELECT id, username, success, ip, user_agent, created_at FROM login_events ORDER BY id DESC LIMIT 500')
    .all();
  res.json(rows.map((r) => ({ ...r, success: Boolean(r.success) })));
});
