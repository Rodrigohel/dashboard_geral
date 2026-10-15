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

// Permissão à parte de requireDeviceAccess — controla quem pode ABRIR
// remotamente esse porteiro (não quem pode gerenciar os usuários dele).
export function requireDeviceOpenAccess(req, res, next) {
  if (req.user?.role === 'owner') return next();

  const deviceId = Number(req.params.deviceId || req.params.id);
  const allowed = db
    .prepare('SELECT 1 FROM device_open_permissions WHERE user_id = ? AND device_id = ?')
    .get(req.user.sub, deviceId);

  if (!allowed) return res.status(403).json({ error: 'Você não tem permissão para abrir este equipamento.' });
  next();
}

// Igual requireModule, mesma tabela — só com nome diferente pra ficar claro
// no código da rota que a chave é uma ação fina (ex.:
// "acesso.equipamentos.incluir"), não um módulo inteiro. 'owner' sempre
// passa, igual todo o resto.
export function requirePermission(key) {
  return (req, res, next) => {
    if (req.user?.role === 'owner') return next();

    const allowed = db.prepare('SELECT 1 FROM permissions WHERE user_id = ? AND module_key = ?').get(req.user.sub, key);

    if (!allowed) return res.status(403).json({ error: 'Você não tem permissão para fazer isso.' });
    next();
  };
}

// Passa se o usuário tiver QUALQUER UMA das chaves — usado só onde uma
// mesma ação de verdade é coberta por mais de uma permissão (ex.: mandar a
// foto faz parte tanto de "incluir" quanto de "editar" um morador — exigir
// só uma das duas quebraria o fluxo de "criar com foto" pra quem só tem
// "incluir").
export function requireAnyPermission(...keys) {
  return (req, res, next) => {
    if (req.user?.role === 'owner') return next();

    const allowed = keys.some((key) => db.prepare('SELECT 1 FROM permissions WHERE user_id = ? AND module_key = ?').get(req.user.sub, key));

    if (!allowed) return res.status(403).json({ error: 'Você não tem permissão para fazer isso.' });
    next();
  };
}

// Conjunto de chaves de permissão que um usuário tem AGORA — usado pelos
// guardas de escalonamento em users.js: ninguém que não é dono pode
// conceder (criar/editar outra conta com) uma permissão que ele mesmo não
// tem. 'owner' não usa isso (já passa por tudo via role).
export function getUserPermissionKeys(userId) {
  return new Set(db.prepare('SELECT module_key FROM permissions WHERE user_id = ?').all(userId).map((r) => r.module_key));
}
