import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { requirePermission } from '../middleware/auth.js';
import { readGeneratorStatus, testGeneratorConnection } from '../services/generatorClient.js';
import { encryptSecret } from '../services/cryptoService.js';
import { getGeneratorHistory, getGeneratorActivationSnapshots } from '../services/generatorHistoryService.js';
import { probeGeneratorTelnet } from '../services/generatorTelnetService.js';

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

function getCustomPointRows() {
  return db.prepare('SELECT id, name, addr, type, invert FROM generator_custom_points ORDER BY id ASC').all();
}

function serializeCustomPoint(row) {
  return { id: row.id, name: row.name, addr: row.addr, type: row.type, invert: Boolean(row.invert) };
}

function serializeConfig(row) {
  const points = {};
  for (const [key, column] of POINTS) {
    points[key] = {
      addr: row[`${column}_addr`],
      type: row[`${column}_type`],
      invert: Boolean(row[`${column}_invert`]),
      // Só "falha" faz sentido como alarme de prioridade (ver
      // telegramService.js) — pronto/emOperacao são estado normal.
      priority: key === 'falha' ? Boolean(row.falha_priority) : false,
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
    // Modbus TCP em si não pede login (ver sqlite.js) — campos pedidos pelo
    // Rodrigo mesmo assim, pra já estarem prontos quando ele descobrir se
    // precisa deles por algum outro caminho (ex.: tela web do controlador).
    // Senha nunca volta decifrada, só se já tem uma salva.
    username: row.username || '',
    hasPassword: Boolean(row.password_enc),
    customPoints: getCustomPointRows().map(serializeCustomPoint),
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

  const username = body.username ?? row.username;

  const assignments = ['name = ?', 'host = ?', 'port = ?', 'unit_id = ?', 'enabled = ?', 'poll_seconds = ?', 'username = ?'];
  const values = [name, host, port, unitId, enabled ? 1 : 0, pollSeconds, username];

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
    // Prioridade (ver telegramService.js) só existe pra "falha" — mesmo
    // cuidado do PUT de Bombas: não desmonta UPDATE de coluna que não existe
    // pros outros pontos.
    if (key === 'falha') {
      const priority = incoming && incoming.priority !== undefined ? (incoming.priority ? 1 : 0) : row.falha_priority;
      assignments.push('falha_priority = ?');
      values.push(priority);
    }
  }

  db.prepare(`UPDATE generator_station SET ${assignments.join(', ')} WHERE id = 1`).run(...values);
  // Senha nunca é obrigatória nem exigida de novo a cada salvamento — só
  // grava quando vier um valor novo, igual device_password_enc.
  if (body.password) {
    db.prepare('UPDATE generator_station SET password_enc = ? WHERE id = 1').run(encryptSecret(body.password));
  }
  res.json(serializeConfig(getRow()));
});

// Mesma fase 1 de "pontos customizados" das Bombas (ver IDEIAS.md): sinal
// extra que o Rodrigo cadastra sozinho, sem precisar de deploy.
generatorRouter.post('/custom-points', requirePermission('gerador.editar'), (req, res) => {
  const { name, addr, type, invert } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Informe um nome pro ponto.' });
  const validType = VALID_TYPES.has(type) ? type : 'coil';
  const addrValue = addr === '' || addr === null || addr === undefined ? null : Number(addr);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO generator_custom_points (name, addr, type, invert) VALUES (?, ?, ?, ?)')
    .run(String(name).trim(), addrValue, validType, invert ? 1 : 0);
  res.status(201).json(serializeCustomPoint(db.prepare('SELECT id, name, addr, type, invert FROM generator_custom_points WHERE id = ?').get(lastInsertRowid)));
});

generatorRouter.put('/custom-points/:id', requirePermission('gerador.editar'), (req, res) => {
  const existing = db.prepare('SELECT id, name, addr, type, invert FROM generator_custom_points WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ponto customizado não encontrado.' });
  const body = req.body || {};
  const newName = body.name && String(body.name).trim() ? String(body.name).trim() : existing.name;
  const newType = VALID_TYPES.has(body.type) ? body.type : existing.type;
  const addrValue = 'addr' in body ? (body.addr === '' || body.addr === null || body.addr === undefined ? null : Number(body.addr)) : existing.addr;
  const newInvert = body.invert === undefined ? existing.invert : (body.invert ? 1 : 0);
  db.prepare('UPDATE generator_custom_points SET name = ?, addr = ?, type = ?, invert = ? WHERE id = ?').run(newName, addrValue, newType, newInvert, existing.id);
  res.json(serializeCustomPoint(db.prepare('SELECT id, name, addr, type, invert FROM generator_custom_points WHERE id = ?').get(existing.id)));
});

generatorRouter.delete('/custom-points/:id', requirePermission('gerador.editar'), (req, res) => {
  db.prepare('DELETE FROM generator_custom_points WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

generatorRouter.get('/history', (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  res.json(getGeneratorHistory({ days }));
});

generatorRouter.get('/activation-snapshots', requirePermission('gerador.editar'), (req, res) => {
  res.json(getGeneratorActivationSnapshots());
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

// Diagnóstico — porta 23 (Telnet) do controlador, diferente da 502/Modbus
// já usada acima. Não é um protocolo documentado aqui ainda (ver
// generatorTelnetService.js): só abre, manda o texto digitado (se algum) e
// devolve tudo que chegou, puro, pra descobrir o que tem antes de
// implementar leitura de verdade. Usa SEMPRE o host já configurado (nunca
// um host vindo do corpo da requisição) pra não virar um "conecta em
// qualquer IP" a partir do front.
generatorRouter.post('/telnet-probe', requirePermission('gerador.editar'), async (req, res) => {
  const row = getRow();
  const send = String(req.body?.send || '').slice(0, 200);
  try {
    const result = await probeGeneratorTelnet({ host: row.host, send });
    res.json(result);
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
    const customPoints = config.customPoints.map((p) => ({ id: p.id, name: p.name, value: points[`custom_${p.id}`] }));
    res.json({ name: config.name, pollSeconds: config.pollSeconds, points, customPoints });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
