import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { requireOwner } from '../middleware/auth.js';
import { readPumpStationStatus, testPumpStationConnection } from '../services/pumpStationClient.js';

export const pumpStationRouter = Router();

// Cada "ponto" vira um par de colunas (<chave>_addr, <chave>_type) na
// tabela — ver sqlite.js. Centralizado aqui pra não repetir os 9 nomes em
// três lugares (GET, PUT, status).
const POINTS = [
  ['nivelMinimo', 'nivel_minimo'],
  ['nivelMedio', 'nivel_medio'],
  ['nivelMaximo', 'nivel_maximo'],
  ['nivelSeguranca', 'nivel_seguranca'],
  ['bomba1', 'bomba1'],
  ['bomba2', 'bomba2'],
  ['termico1', 'termico1'],
  ['termico2', 'termico2'],
  ['modoManual', 'modo_manual'],
];

function getRow() {
  return db.prepare('SELECT * FROM pump_station WHERE id = 1').get();
}

function serializeConfig(row) {
  const points = {};
  for (const [key, column] of POINTS) {
    points[key] = { addr: row[`${column}_addr`], type: row[`${column}_type`] };
  }
  return {
    enabled: Boolean(row.enabled),
    name: row.name,
    host: row.host,
    port: row.port,
    unitId: row.unit_id,
    points,
  };
}

const VALID_TYPES = new Set(['coil', 'discrete', 'holding', 'input']);

// GET é liberado pra qualquer usuário do módulo "bombas" (não só dono) —
// precisa saber os endereços configurados nem que seja só pra ler o status,
// mas sem exigir acesso de dono só pra isso. A edição (PUT) é só dono, como
// o resto da configuração de equipamento no Portal.
pumpStationRouter.get('/config', (req, res) => {
  res.json(serializeConfig(getRow()));
});

pumpStationRouter.put('/config', requireOwner, (req, res) => {
  const row = getRow();
  const body = req.body || {};
  const name = body.name ?? row.name;
  const host = body.host ?? row.host;
  const port = Number(body.port ?? row.port) || 502;
  const unitId = Number(body.unitId ?? row.unit_id) || 1;
  const enabled = body.enabled === undefined ? Boolean(row.enabled) : Boolean(body.enabled);

  const assignments = ['name = ?', 'host = ?', 'port = ?', 'unit_id = ?', 'enabled = ?'];
  const values = [name, host, port, unitId, enabled ? 1 : 0];

  for (const [key, column] of POINTS) {
    const incoming = body.points?.[key];
    const existingAddr = row[`${column}_addr`];
    const existingType = row[`${column}_type`];
    const addrRaw = incoming?.addr;
    const addr = addrRaw === '' || addrRaw === null || addrRaw === undefined ? null : Number(addrRaw);
    const type = incoming?.type && VALID_TYPES.has(incoming.type) ? incoming.type : existingType;
    assignments.push(`${column}_addr = ?`, `${column}_type = ?`);
    values.push(incoming ? addr : existingAddr, type);
  }

  db.prepare(`UPDATE pump_station SET ${assignments.join(', ')} WHERE id = 1`).run(...values);
  res.json(serializeConfig(getRow()));
});

pumpStationRouter.post('/test-connection', requireOwner, async (req, res) => {
  const { host, port, unitId } = req.body || {};
  if (!host) return res.status(400).json({ error: 'Informe o IP da IHM' });
  try {
    await testPumpStationConnection(host, Number(port) || 502, Number(unitId) || 1);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

pumpStationRouter.get('/status', async (req, res) => {
  const row = getRow();
  const config = serializeConfig(row);
  if (!config.enabled) {
    return res.status(400).json({ error: 'Casa de bombas ainda não está ativada em Configurações.' });
  }
  try {
    const points = await readPumpStationStatus(config);
    res.json({ name: config.name, points });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
