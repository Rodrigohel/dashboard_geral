import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { getPumpActivationReport } from '../services/pumpStationHistoryService.js';
import { getRedeDowntimeReport, getInterfoneDowntimeReport } from '../services/networkReportService.js';

export const reportsRouter = Router();

reportsRouter.get('/rede', async (req, res) => {
  try {
    res.json(await getRedeDowntimeReport({ from: req.query.from, to: req.query.to }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

reportsRouter.get('/interfone', async (req, res) => {
  try {
    res.json(await getInterfoneDowntimeReport({ from: req.query.from, to: req.query.to }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Acesso controlado pela permissão `relatorios.ver` (checada no mount, ver
// server.js) — independente dos módulos Bombas/Acesso, só quem o dono
// liberar explicitamente em Usuários → permissões vê qualquer relatório.
reportsRouter.get('/bombas', (req, res) => {
  res.json(getPumpActivationReport({ from: req.query.from, to: req.query.to }));
});

reportsRouter.get('/acesso', (req, res) => {
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
