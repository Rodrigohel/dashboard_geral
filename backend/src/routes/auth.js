import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/sqlite.js';
import { config, MODULE_KEYS } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

function permissionsFor(user) {
  if (user.role === 'owner') {
    return {
      modules: MODULE_KEYS,
      deviceIds: db.prepare('SELECT id FROM access_devices').all().map((d) => d.id),
    };
  }
  const modules = db
    .prepare('SELECT module_key FROM permissions WHERE user_id = ?')
    .all(user.id)
    .map((r) => r.module_key);
  const deviceIds = db
    .prepare('SELECT device_id FROM device_permissions WHERE user_id = ?')
    .all(user.id)
    .map((r) => r.device_id);
  return { modules, deviceIds };
}

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, displayName: user.display_name, role: user.role },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn }
  );

  const { modules, deviceIds } = permissionsFor(user);
  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role, modules, deviceIds },
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user) return res.status(401).json({ error: 'Usuário não existe mais' });

  const { modules, deviceIds } = permissionsFor(user);
  res.json({ id: user.id, username: user.username, displayName: user.display_name, role: user.role, modules, deviceIds });
});
