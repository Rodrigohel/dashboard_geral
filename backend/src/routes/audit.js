import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { listSystemEvents } from '../services/systemEventsService.js';

export const auditRouter = Router();

// Só os últimos 500 — é uma tela de auditoria pra consulta rápida, não um
// relatório histórico completo (o SQLite guarda tudo, mas não pagina aqui).
auditRouter.get('/logins', (req, res) => {
  const rows = db
    .prepare('SELECT id, username, success, ip, user_agent, created_at FROM login_events ORDER BY id DESC LIMIT 500')
    .all();
  res.json(rows.map((r) => ({ ...r, success: Boolean(r.success) })));
});

// "Relatório de tudo" (ver IDEIAS.md) — por período, sem limite de 500
// (é pra baixar e guardar, não só olhar na tela). `from`/`to` são datas
// "YYYY-MM-DD"; sem nenhum dos dois, usa os últimos 30 dias.
auditRouter.get('/system-events', (req, res) => {
  res.json(listSystemEvents({ from: req.query.from, to: req.query.to }));
});

auditRouter.get('/door-opens', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, device_name, username, success, error_message, created_at
       FROM door_open_events ORDER BY id DESC LIMIT 500`
    )
    .all();
  res.json(rows.map((r) => ({ ...r, success: Boolean(r.success) })));
});
