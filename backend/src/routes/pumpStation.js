import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { requirePermission } from '../middleware/auth.js';
import { readPumpStationStatus, testPumpStationConnection } from '../services/pumpStationClient.js';
import { getPumpStationHistory } from '../services/pumpStationHistoryService.js';

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
  ['emergencia', 'emergencia'],
  ['faltaFase', 'falta_fase'],
  ['painelDesligado', 'painel_desligado'],
  ['falhaBoias', 'falha_boias'],
  ['bomba1DoDia', 'bomba1_do_dia'],
  ['bomba2DoDia', 'bomba2_do_dia'],
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
    pollSeconds: row.poll_seconds,
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

pumpStationRouter.put('/config', requirePermission('bombas.editar'), (req, res) => {
  const row = getRow();
  const body = req.body || {};
  const name = body.name ?? row.name;
  const host = body.host ?? row.host;
  const port = Number(body.port ?? row.port) || 502;
  const unitId = Number(body.unitId ?? row.unit_id) || 1;
  const enabled = body.enabled === undefined ? Boolean(row.enabled) : Boolean(body.enabled);
  // Mínimo de 1s pra não martelar a IHM — máximo de 1h só pra evitar digitar
  // errado (ex.: "10000" achando que era milissegundo) e a tela nunca mais
  // atualizar sozinha. Importante: `|| row.poll_seconds` sozinho trataria um
  // "0" digitado de propósito como "não informado" e reverteria pro valor
  // antigo sem avisar — por isso checa undefined/null/'' explicitamente
  // antes de cair no clamp.
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
    const addrRaw = incoming?.addr;
    const addr = addrRaw === '' || addrRaw === null || addrRaw === undefined ? null : Number(addrRaw);
    const type = incoming?.type && VALID_TYPES.has(incoming.type) ? incoming.type : existingType;
    assignments.push(`${column}_addr = ?`, `${column}_type = ?`);
    values.push(incoming ? addr : existingAddr, type);
  }

  db.prepare(`UPDATE pump_station SET ${assignments.join(', ')} WHERE id = 1`).run(...values);
  res.json(serializeConfig(getRow()));
});

pumpStationRouter.post('/test-connection', requirePermission('bombas.editar'), async (req, res) => {
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
    res.json({ name: config.name, pollSeconds: config.pollSeconds, points });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

pumpStationRouter.get('/history', (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  res.json(getPumpStationHistory({ days }));
});
