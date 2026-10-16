import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { requirePermission } from '../middleware/auth.js';
import { readPumpStationStatus, testPumpStationConnection } from '../services/pumpStationClient.js';
import { getPumpStationHistory, getFillEstimate, getPumpActivationSnapshots } from '../services/pumpStationHistoryService.js';

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

function getCustomPointRows() {
  return db.prepare('SELECT id, name, addr, type, invert FROM pump_custom_points ORDER BY id ASC').all();
}

function serializeCustomPoint(row) {
  return { id: row.id, name: row.name, addr: row.addr, type: row.type, invert: Boolean(row.invert) };
}

// "Prioridade" (ver telegramService.js) só existe pra esses 7 — os 4 níveis
// não são alarme, não tem o que "insistir". Mesma lista de colunas da
// migração em sqlite.js.
const PRIORITY_KEYS = new Set(['termico1', 'termico2', 'modoManual', 'emergencia', 'faltaFase', 'painelDesligado', 'falhaBoias']);

function serializeConfig(row) {
  const points = {};
  for (const [key, column] of POINTS) {
    points[key] = {
      addr: row[`${column}_addr`],
      type: row[`${column}_type`],
      invert: Boolean(row[`${column}_invert`]),
      priority: PRIORITY_KEYS.has(key) ? Boolean(row[`${column}_priority`]) : false,
    };
  }
  return {
    enabled: Boolean(row.enabled),
    name: row.name,
    host: row.host,
    port: row.port,
    unitId: row.unit_id,
    pollSeconds: row.poll_seconds,
    points,
    customPoints: getCustomPointRows().map(serializeCustomPoint),
  };
}

const VALID_TYPES = new Set(['coil', 'discrete', 'holding', 'input']);

// IP/porta/unitId/endereços Modbus são detalhe de instalação (infra crítica)
// — só quem tem bombas.editar (dono ou liberado) precisa ver isso. Quem só
// acompanha o status (módulo "bombas" comum) usa GET /status, que já devolve
// só nome/pollSeconds/valores — nunca os detalhes de configuração.
pumpStationRouter.get('/config', requirePermission('bombas.editar'), (req, res) => {
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
    const existingInvert = row[`${column}_invert`];
    const addrRaw = incoming?.addr;
    const addr = addrRaw === '' || addrRaw === null || addrRaw === undefined ? null : Number(addrRaw);
    const type = incoming?.type && VALID_TYPES.has(incoming.type) ? incoming.type : existingType;
    const invert = incoming && incoming.invert !== undefined ? (incoming.invert ? 1 : 0) : existingInvert;
    assignments.push(`${column}_addr = ?`, `${column}_type = ?`, `${column}_invert = ?`);
    values.push(incoming ? addr : existingAddr, type, invert);
    // Coluna só existe pros 7 pontos em PRIORITY_KEYS (ver migração em
    // sqlite.js) — pra qualquer outro, nem monta o UPDATE dessa coluna.
    if (PRIORITY_KEYS.has(key)) {
      const existingPriority = row[`${column}_priority`];
      const priority = incoming && incoming.priority !== undefined ? (incoming.priority ? 1 : 0) : existingPriority;
      assignments.push(`${column}_priority = ?`);
      values.push(priority);
    }
  }

  db.prepare(`UPDATE pump_station SET ${assignments.join(', ')} WHERE id = 1`).run(...values);
  res.json(serializeConfig(getRow()));
});

// Fase 1 de "pontos customizados" (ver IDEIAS.md): o Rodrigo cadastra um
// sinal novo sozinho (nome + endereço + tipo), sem precisar de deploy.
// Exibição ainda genérica (sim/não com o nome dado) — igual aos pontos
// fixos, mas em lista em vez de colunas fixas no schema.
pumpStationRouter.post('/custom-points', requirePermission('bombas.editar'), (req, res) => {
  const { name, addr, type, invert } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Informe um nome pro ponto.' });
  const validType = VALID_TYPES.has(type) ? type : 'coil';
  const addrValue = addr === '' || addr === null || addr === undefined ? null : Number(addr);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO pump_custom_points (name, addr, type, invert) VALUES (?, ?, ?, ?)')
    .run(String(name).trim(), addrValue, validType, invert ? 1 : 0);
  res.status(201).json(serializeCustomPoint(db.prepare('SELECT id, name, addr, type, invert FROM pump_custom_points WHERE id = ?').get(lastInsertRowid)));
});

pumpStationRouter.put('/custom-points/:id', requirePermission('bombas.editar'), (req, res) => {
  const existing = db.prepare('SELECT id, name, addr, type, invert FROM pump_custom_points WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ponto customizado não encontrado.' });
  const body = req.body || {};
  const newName = body.name && String(body.name).trim() ? String(body.name).trim() : existing.name;
  const newType = VALID_TYPES.has(body.type) ? body.type : existing.type;
  // `addr` não enviado (campo ausente do body) tem que MANTER o valor atual
  // — só limpa o endereço quando a chave vem explicitamente como
  // null/''/undefined no payload (a tela sempre manda o objeto inteiro, mas
  // a API não pode depender disso). Mesmo cuidado já usado em PUT /config.
  const addrValue = 'addr' in body ? (body.addr === '' || body.addr === null || body.addr === undefined ? null : Number(body.addr)) : existing.addr;
  const newInvert = body.invert === undefined ? existing.invert : (body.invert ? 1 : 0);
  db.prepare('UPDATE pump_custom_points SET name = ?, addr = ?, type = ?, invert = ? WHERE id = ?').run(newName, addrValue, newType, newInvert, existing.id);
  res.json(serializeCustomPoint(db.prepare('SELECT id, name, addr, type, invert FROM pump_custom_points WHERE id = ?').get(existing.id)));
});

pumpStationRouter.delete('/custom-points/:id', requirePermission('bombas.editar'), (req, res) => {
  db.prepare('DELETE FROM pump_custom_points WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
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
    // null até ter amostra histórica suficiente pra essa fronteira — o
    // front cai pro degrau fixo nesse caso, sem precisar de troca manual
    // nenhuma (ver getFillEstimate).
    const customPoints = config.customPoints.map((p) => ({ id: p.id, name: p.name, value: points[`custom_${p.id}`] }));
    res.json({ name: config.name, pollSeconds: config.pollSeconds, points, customPoints, fillEstimate: getFillEstimate(points) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

pumpStationRouter.get('/history', (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  res.json(getPumpStationHistory({ days }));
});

// Fotos automáticas tiradas no instante em que uma bomba liga — pra
// comparar com o painel físico sem precisar estar lá esperando (ver
// IDEIAS.md). Mesma permissão de /config: é diagnóstico de infra, não pro
// usuário comum.
pumpStationRouter.get('/activation-snapshots', requirePermission('bombas.editar'), (req, res) => {
  res.json(getPumpActivationSnapshots());
});
