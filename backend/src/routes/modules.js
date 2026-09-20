// Endpoint "de leitura" para a tela Início: cada usuário só recebe
// informação dos módulos que ele pode ver (link público do gateway,
// contagem de equipamentos) — nada de credenciais, então não exige
// requireOwner como /api/settings.
import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { MODULE_KEYS } from '../config.js';
import { getGatewayConfig } from '../services/gatewayService.js';

export const modulesRouter = Router();

modulesRouter.get('/', (req, res) => {
  const isOwner = req.user.role === 'owner';
  const allowedModules = isOwner
    ? MODULE_KEYS
    : db.prepare('SELECT module_key FROM permissions WHERE user_id = ?').all(req.user.sub).map((r) => r.module_key);

  const result = {};
  for (const key of ['rede', 'interfone']) {
    if (!allowedModules.includes(key)) continue;
    const gw = getGatewayConfig(key);
    result[key] = { publicUrl: gw.publicUrl, configured: gw.configured };
  }

  if (allowedModules.includes('acesso')) {
    const deviceCount = isOwner
      ? db.prepare('SELECT COUNT(*) AS c FROM access_devices').get().c
      : db.prepare('SELECT COUNT(*) AS c FROM device_permissions WHERE user_id = ?').get(req.user.sub).c;
    result.acesso = { deviceCount };
  }

  res.json(result);
});
