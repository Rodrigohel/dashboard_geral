import { Router } from 'express';
import { MODULE_KEYS } from '../config.js';
import { getGatewayConfig, saveGatewayConfig, testGatewayConnection } from '../services/gatewayService.js';

export const settingsRouter = Router();
const GATEWAY_MODULES = MODULE_KEYS.filter((k) => k !== 'acesso'); // 'rede' | 'interfone'

settingsRouter.get('/gateways', (req, res) => {
  const result = {};
  for (const key of GATEWAY_MODULES) {
    const gw = getGatewayConfig(key);
    result[key] = { baseUrl: gw.baseUrl, publicUrl: gw.publicUrl, serviceUsername: gw.serviceUsername, configured: gw.configured };
  }
  res.json(result);
});

settingsRouter.put('/gateways/:moduleKey', (req, res) => {
  const { moduleKey } = req.params;
  if (!GATEWAY_MODULES.includes(moduleKey)) {
    return res.status(400).json({ error: 'Módulo de gateway inválido' });
  }
  const { baseUrl, publicUrl, serviceUsername, servicePassword } = req.body || {};
  if (!baseUrl || !serviceUsername) {
    return res.status(400).json({ error: 'Endereço do painel e usuário de serviço são obrigatórios' });
  }
  saveGatewayConfig(moduleKey, { baseUrl, publicUrl, serviceUsername, servicePassword });
  const gw = getGatewayConfig(moduleKey);
  res.json({ baseUrl: gw.baseUrl, publicUrl: gw.publicUrl, serviceUsername: gw.serviceUsername, configured: gw.configured });
});

settingsRouter.post('/gateways/:moduleKey/test-connection', async (req, res) => {
  const { moduleKey } = req.params;
  if (!GATEWAY_MODULES.includes(moduleKey)) {
    return res.status(400).json({ error: 'Módulo de gateway inválido' });
  }
  try {
    await testGatewayConnection(moduleKey);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});
