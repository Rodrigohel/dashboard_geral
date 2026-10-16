import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { requirePermission } from '../middleware/auth.js';
import { readGeneratorStatus, testGeneratorConnection } from '../services/generatorClient.js';

export const generatorRouter = Router();

const POINTS = [
  ['pronto', 'pronto'],
  ['falha', 'falha'],
  ['emOperacao', 'em_operacao'],
];

const VALID_TYPES = new Set(['coil', 'discrete', 'holding', 'input']);

function getRow() {
  return db.prepare('SELECT * FROM generator_station WHERE id = 1').get();
}

function serializeConfig(row) {
  const points = {};
  for (const [key, column] of POINTS) {
    points[key] = { addr: row[`${column}_addr`], type: row[`${column}_type`], invert: Boolean(row[`${column}_invert`]) };
  }
  return {
    enabled: Boolean(row.enabled),
    name: row.name,
    host: row.host,
    port: row.port,
    unitId: row.unit_id,
    pollSeconds: row.poll_seconds,
    points,
  };
}

// Mesma política de pump_station/config: endereço/host/porta são detalhe de
// instalação — só quem edita a configuração precisa ver isso. Quem só
// acompanha usa GET /status, que devolve só nome/pollSeconds/valores.
generatorRouter.get('/config', requirePermission('gerador.editar'), (req, res) => {
  res.json(serializeConfig(getRow()));
});

generatorRouter.put('/config', requirePermission('gerador.editar'), (req, res) => {
  const row = getRow();
  const body = req.body || {};
  const name = body.name ?? row.name;
  const host = body.host ?? row.host;
  const port = Number(body.port ?? row.port) || 502;
  const unitId = Number(body.unitId ?? row.unit_id) || 1;
  const enabled = body.enabled === undefined ? Boolean(row.enabled) : Boolean(body.enabled);
  const pollSecondsInput = body.pollSeconds === undefined || body.pollSeconds === null || body.pollSeconds === ''
    ? row.poll_seconds
    : Number(body.pollSeconds);
  const pollSeconds = Math.min(3600, Math.max(1, Number.isFinite(pollSecondsInput) ? pollSecondsInput : row.poll_seconds));

  const assignments = ['name = ?', 'host = ?', 'port = ?', 'unit_id = ?', 'enabled = ?', 'poll_seconds = ?'];
  const values = [name, host, port, unitId, enabled ? 1 : 0, pollSeconds];

  for (const [key, column] of POINTS) {
    const incoming = body.points?.[key];
    const existingAddr = row[`${column}_addr`];
    const existingType = row[`${column}_type`];
    const existingInvert = row[`${column}_invert`];
    const addrRaw = incoming?.addr;
    const addr = addrRaw === '' || addrRaw === null || addrRaw === undefined ? null : Number(addrRaw);
    const type = incoming?.type && VALID_TYPES.has(incoming.type) ? incoming.type : existingType;
    const invert = incoming && incoming.invert !== undefined ? (incoming.invert ? 1 : 0) : existingInvert;
    assignments.push(`${column}_addr = ?`, `${column}_type = ?`, `${column}_invert = ?`);
    values.push(incoming ? addr : existingAddr, type, invert);
  }

  db.prepare(`UPDATE generator_station SET ${assignments.join(', ')} WHERE id = 1`).run(...values);
  res.json(serializeConfig(getRow()));
});

generatorRouter.post('/test-connection', requirePermission('gerador.editar'), async (req, res) => {
  const { host, port, unitId } = req.body || {};
  if (!host) return res.status(400).json({ error: 'Informe o IP do controlador' });
  try {
    await testGeneratorConnection(host, Number(port) || 502, Number(unitId) || 1);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

generatorRouter.get('/status', async (req, res) => {
  const row = getRow();
  const config = serializeConfig(row);
  if (!config.enabled) {
    return res.status(400).json({ error: 'Gerador ainda não está ativado em Configurações.' });
  }
  try {
    const points = await readGeneratorStatus(config);
    res.json({ name: config.name, pollSeconds: config.pollSeconds, points });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
