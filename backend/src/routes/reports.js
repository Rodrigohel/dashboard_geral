import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { requireModule } from '../middleware/auth.js';
import { getPumpActivationReport } from '../services/pumpStationHistoryService.js';

export const reportsRouter = Router();

// Cada rota checa o módulo dela mesma (não tem um "requireModule" só no
// mount, porque são dois módulos diferentes nesse mesmo router) — quem tem
// Bombas liberado vê o relatório de Bombas, independente de ter Acesso.
reportsRouter.get('/bombas', requireModule('bombas'), (req, res) => {
  res.json(getPumpActivationReport({ from: req.query.from, to: req.query.to }));
});

reportsRouter.get('/acesso', requireModule('acesso'), (req, res) => {
  const to = req.query.to ? `${req.query.to} 23:59:59` : new Date().toISOString().slice(0, 19).replace('T', ' ');
  const from = req.query.from
    ? `${req.query.from} 00:00:00`
    : new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const rows = db
    .prepare(
      `SELECT device_name, username, success, error_message, created_at
       FROM door_open_events WHERE created_at BETWEEN ? AND ? ORDER BY id DESC LIMIT 5000`
    )
    .all(from, to);
  res.json(rows.map((r) => ({ ...r, success: Boolean(r.success) })));
});
