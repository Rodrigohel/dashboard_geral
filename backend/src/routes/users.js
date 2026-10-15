import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/sqlite.js';
import { MODULE_KEYS, FEATURE_KEYS } from '../config.js';
import { requirePermission, getUserPermissionKeys } from '../middleware/auth.js';

export const usersRouter = Router();

function serializeUser(user) {
  const modules = db
    .prepare('SELECT module_key FROM permissions WHERE user_id = ?')
    .all(user.id)
    .map((r) => r.module_key);
  const deviceIds = db
    .prepare('SELECT device_id FROM device_permissions WHERE user_id = ?')
    .all(user.id)
    .map((r) => r.device_id);
  // À parte de deviceIds (que só controla "enxerga/gerencia usuários daquele
  // porteiro") — quais desses o usuário também pode ABRIR remotamente.
  const openDeviceIds = db
    .prepare('SELECT device_id FROM device_open_permissions WHERE user_id = ?')
    .all(user.id)
    .map((r) => r.device_id);
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    modules,
    deviceIds,
    openDeviceIds,
    createdAt: user.created_at,
  };
}

function setPermissions(userId, modules, deviceIds) {
  db.prepare('DELETE FROM permissions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM device_permissions WHERE user_id = ?').run(userId);

  const insertModule = db.prepare('INSERT OR IGNORE INTO permissions (user_id, module_key) VALUES (?, ?)');
  const requestedModules = modules || [];
  for (const key of requestedModules) {
    if (!MODULE_KEYS.includes(key) && !FEATURE_KEYS.includes(key)) continue;
    // Uma permissão de funcionalidade (ex.: "rede.dispositivos") só faz
    // sentido com o módulo pai também liberado — sem isso, sobra uma
    // permissão órfã que nunca é checada (requireModule bloqueia antes).
    // Só exige o pai quando o pai É um módulo de verdade (rede/acesso/
    // bombas) — "usuarios.*" não tem módulo pai nenhum (a tela Usuários
    // nunca foi um módulo escolhível), então passa direto.
    const parentModule = key.includes('.') ? key.split('.')[0] : key;
    if (MODULE_KEYS.includes(parentModule) && !requestedModules.includes(parentModule)) continue;
    insertModule.run(userId, key);
  }

  const insertDevice = db.prepare('INSERT OR IGNORE INTO device_permissions (user_id, device_id) VALUES (?, ?)');
  for (const deviceId of deviceIds || []) {
    insertDevice.run(userId, Number(deviceId));
  }
}

// À parte de setPermissions/device_permissions de propósito — só mexe na
// tabela nova (device_open_permissions), nunca nas outras, e só quando o
// campo vem no corpo da requisição (ver chamadas abaixo).
function setOpenPermissions(userId, openDeviceIds) {
  db.prepare('DELETE FROM device_open_permissions WHERE user_id = ?').run(userId);
  const insertOpen = db.prepare('INSERT OR IGNORE INTO device_open_permissions (user_id, device_id) VALUES (?, ?)');
  for (const deviceId of openDeviceIds || []) {
    insertOpen.run(userId, Number(deviceId));
  }
}

// Ninguém que não é dono pode, via essa tela, virar (ou criar) um dono, nem
// conceder a outra conta uma permissão que ele mesmo não tem — sem isso, um
// "usuarios.editar" bastaria pra alguém se promover ou montar uma conta mais
// poderosa que a própria. 'owner' não passa por aqui (sem limite nenhum).
function assertNoEscalation(req, res, { role, modules, existingModules }) {
  if (req.user.role === 'owner') return true;
  if (role === 'owner') {
    res.status(403).json({ error: 'Você não pode criar nem promover ninguém a administrador.' });
    return false;
  }
  const own = getUserPermissionKeys(req.user.sub);
  // Na edição, o alvo pode já ter uma permissão que o ator não tem (dada
  // antes por um dono). Reenviar essa chave sem tocar nela não é "conceder"
  // nada novo — só bloqueia quem tenta ACRESCENTAR algo além do que já tem.
  const existing = existingModules || new Set();
  const excess = (modules || []).filter((k) => !own.has(k) && !existing.has(k));
  if (excess.length > 0) {
    res.status(403).json({ error: `Você não pode conceder uma permissão que você mesmo não tem: ${excess.join(', ')}` });
    return false;
  }
  return true;
}

// Idem pro alvo já existente — sem isso, alguém com "usuarios.editar"/
// "usuarios.excluir" poderia mexer ou apagar a conta de um administrador.
function assertNotTargetingOwner(req, res, targetUser) {
  if (req.user.role === 'owner') return true;
  if (targetUser.role === 'owner') {
    res.status(403).json({ error: 'Você não pode alterar ou excluir uma conta de administrador.' });
    return false;
  }
  return true;
}

usersRouter.get('/', requirePermission('usuarios.ver'), (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
  res.json(users.map(serializeUser));
});

usersRouter.post('/', requirePermission('usuarios.incluir'), (req, res) => {
  const { username, displayName, password, role, modules, deviceIds, openDeviceIds } = req.body || {};
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Usuário, nome e senha são obrigatórios' });
  }
  if (role && !['owner', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Papel inválido' });
  }
  if (!assertNoEscalation(req, res, { role: role || 'user', modules })) return;

  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare('INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(username, displayName, passwordHash, role || 'user');
    setPermissions(info.lastInsertRowid, modules, deviceIds);
    if (openDeviceIds !== undefined) setOpenPermissions(info.lastInsertRowid, openDeviceIds);
    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(serializeUser(created));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Já existe um usuário com esse login' });
    }
    throw err;
  }
});

usersRouter.put('/:id', requirePermission('usuarios.editar'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!assertNotTargetingOwner(req, res, user)) return;

  const { displayName, password, role, modules, deviceIds, openDeviceIds } = req.body || {};
  if (!assertNoEscalation(req, res, { role: role ?? user.role, modules, existingModules: getUserPermissionKeys(user.id) })) return;

  if (role && role !== user.role) {
    if (!['owner', 'user'].includes(role)) return res.status(400).json({ error: 'Papel inválido' });
    if (user.role === 'owner' && role !== 'owner') {
      const owners = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'owner'").get().c;
      if (owners <= 1) return res.status(400).json({ error: 'Precisa existir ao menos um administrador (owner).' });
    }
  }

  db.prepare('UPDATE users SET display_name = ?, role = ? WHERE id = ?').run(
    displayName ?? user.display_name,
    role ?? user.role,
    user.id
  );

  if (password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), user.id);
  }

  if (modules !== undefined || deviceIds !== undefined) {
    setPermissions(user.id, modules ?? [], deviceIds ?? []);
  }
  if (openDeviceIds !== undefined) {
    setOpenPermissions(user.id, openDeviceIds);
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json(serializeUser(updated));
});

usersRouter.delete('/:id', requirePermission('usuarios.excluir'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!assertNotTargetingOwner(req, res, user)) return;

  if (user.role === 'owner') {
    const owners = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'owner'").get().c;
    if (owners <= 1) return res.status(400).json({ error: 'Precisa existir ao menos um administrador (owner).' });
  }
  if (Number(req.params.id) === req.user.sub) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.status(204).end();
});
