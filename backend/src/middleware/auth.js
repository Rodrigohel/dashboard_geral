import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/sqlite.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  try {
    req.user = jwt.verify(token, config.auth.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Só o dono/administrador geral pode gerenciar usuários, dispositivos de
// acesso e a configuração dos gateways.
export function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Apenas o administrador pode fazer isso.' });
  }
  next();
}

// Bloqueia um módulo inteiro (rede/interfone/acesso) para quem não tem
// permissão explícita — 'owner' sempre passa.
export function requireModule(moduleKey) {
  return (req, res, next) => {
    if (req.user?.role === 'owner') return next();

    const allowed = db
      .prepare('SELECT 1 FROM permissions WHERE user_id = ? AND module_key = ?')
      .get(req.user.sub, moduleKey);

    if (!allowed) return res.status(403).json({ error: 'Você não tem acesso a este módulo.' });
    next();
  };
}

// Dentro do módulo "acesso", restringe a UM porteiro específico (:deviceId
// na URL) — usuário comum só mexe nos que foram liberados para ele.
export function requireDeviceAccess(req, res, next) {
  if (req.user?.role === 'owner') return next();

  const deviceId = Number(req.params.deviceId || req.params.id);
  const allowed = db
    .prepare('SELECT 1 FROM device_permissions WHERE user_id = ? AND device_id = ?')
    .get(req.user.sub, deviceId);

  if (!allowed) return res.status(403).json({ error: 'Você não tem acesso a este equipamento.' });
  next();
}
