import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { MODULE_KEYS } from '../config.js';
import { getGatewayConfig, saveGatewayConfig, testGatewayConnection } from '../services/gatewayService.js';
import { getSecuritySettings, saveSecuritySettings, validateSecuritySettings } from '../services/securitySettingsService.js';
import {
  getRetentionSettings,
  saveRetentionSettings,
  validateRetentionSettings,
} from '../services/retentionSettingsService.js';
import { getPushSettings, setPushEnabled } from '../services/pushService.js';
import { getTelegramSettings, saveTelegramSettings, testTelegramToken, getSavedBotToken, registerWebhook } from '../services/telegramService.js';
import { getTwilioSettings, saveTwilioSettings, testTwilioConnection } from '../services/twilioService.js';
import { listCriticalExternalDevices, setExternalDevicePriority, supportsCriticalPriority } from '../services/externalDeviceService.js';

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

settingsRouter.get('/security', (req, res) => {
  res.json(getSecuritySettings());
});

settingsRouter.put('/security', (req, res) => {
  const error = validateSecuritySettings(req.body || {});
  if (error) return res.status(400).json({ error });
  saveSecuritySettings(req.body);
  res.json(getSecuritySettings());
});

settingsRouter.get('/retention', (req, res) => {
  res.json(getRetentionSettings());
});

settingsRouter.put('/retention', (req, res) => {
  const error = validateRetentionSettings(req.body || {});
  if (error) return res.status(400).json({ error });
  saveRetentionSettings(req.body);
  res.json(getRetentionSettings());
});

settingsRouter.get('/push', (req, res) => {
  res.json(getPushSettings());
});

settingsRouter.put('/push', (req, res) => {
  res.json(setPushEnabled(Boolean(req.body?.enabled)));
});

settingsRouter.get('/telegram', (req, res) => {
  res.json(getTelegramSettings());
});

settingsRouter.put('/telegram', (req, res) => {
  // BUG corrigido aqui: `snoozeMinutes`/`maintenanceMinutes` mandados pela
  // tela eram descartados nessa desestruturação antes de chegar no
  // service — os dropdowns de duração pareciam salvar (sem erro), mas não
  // tinham efeito nenhum. `resolveDebounceMinutes` é novo (ver
  // telegramService.js).
  const { enabled, botToken, chatId, resendIntervalSeconds, snoozeMinutes, maintenanceMinutes, resolveDebounceMinutes } = req.body || {};
  if (enabled && !botToken && !getTelegramSettings().hasToken) {
    return res.status(400).json({ error: 'Informe o token do bot antes de ativar.' });
  }
  res.json(saveTelegramSettings({ enabled, botToken, chatId, resendIntervalSeconds, snoozeMinutes, maintenanceMinutes, resolveDebounceMinutes }));
});

// Testa o token digitado na hora (antes de salvar) — "getMe" confirma que o
// token é válido e devolve o @usuario do bot, útil pra confirmar que é o
// bot certo antes de configurar o webhook nele.
settingsRouter.post('/telegram/test-connection', async (req, res) => {
  const { botToken } = req.body || {};
  const token = botToken || getSavedBotToken();
  if (!token) return res.status(400).json({ error: 'Informe o token do bot pra testar.' });
  try {
    const me = await testTelegramToken(token);
    res.json({ ok: true, username: me.username });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

settingsRouter.post('/telegram/register-webhook', async (req, res) => {
  const { baseUrl } = req.body || {};
  if (!baseUrl) return res.status(400).json({ error: 'baseUrl é obrigatório.' });
  try {
    const url = await registerWebhook(baseUrl);
    res.json({ ok: true, url });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Prioridade dos alarmes que não são "por equipamento" (ver
// telegramService.js): hoje só Interfone (contagem agregada de offline,
// enquanto não tiver campo de favorito igual Rede) e a trava de força
// bruta (evento, não sinal contínuo). `redeOffline` fica no formato por
// compatibilidade mas não é mais usado — Rede virou por equipamento (ver
// GET/PUT /external-devices/rede, alimentado pelo favorito do próprio
// painel). Porteiro é por equipamento (telegramPriority no cadastro, ver
// accessDevices.js); Bombas/Gerador são por sinal (checkbox na própria
// tela de configuração).
settingsRouter.get('/telegram/priorities', (req, res) => {
  const row = db.prepare('SELECT * FROM telegram_module_priority WHERE id = 1').get();
  res.json({
    redeOffline: Boolean(row.rede_offline_priority),
    interfoneOffline: Boolean(row.interfone_offline_priority),
    forcaBruta: Boolean(row.forca_bruta_priority),
  });
});

settingsRouter.put('/telegram/priorities', (req, res) => {
  const { redeOffline, interfoneOffline, forcaBruta } = req.body || {};
  db.prepare(
    'UPDATE telegram_module_priority SET rede_offline_priority = ?, interfone_offline_priority = ?, forca_bruta_priority = ? WHERE id = 1'
  ).run(redeOffline ? 1 : 0, interfoneOffline ? 1 : 0, forcaBruta ? 1 : 0);
  const row = db.prepare('SELECT * FROM telegram_module_priority WHERE id = 1').get();
  res.json({
    redeOffline: Boolean(row.rede_offline_priority),
    interfoneOffline: Boolean(row.interfone_offline_priority),
    forcaBruta: Boolean(row.forca_bruta_priority),
  });
});

// Ligação telefônica via Twilio (ver twilioService.js) — escalonamento de
// um alarme de prioridade sem resposta no Telegram. Sem conta Twilio de
// verdade configurada aqui, fica só pronto: nunca chega a ligar.
settingsRouter.get('/twilio', (req, res) => {
  res.json(getTwilioSettings());
});

settingsRouter.put('/twilio', (req, res) => {
  const { enabled, accountSid, authToken, fromNumber, toNumbers, callAfterSeconds, publicBaseUrl } = req.body || {};
  res.json(saveTwilioSettings({ enabled, accountSid, authToken, fromNumber, toNumbers, callAfterSeconds, publicBaseUrl }));
});

settingsRouter.post('/twilio/test-connection', async (req, res) => {
  const { accountSid, authToken } = req.body || {};
  try {
    const info = await testTwilioConnection(accountSid, authToken);
    res.json({ ok: true, ...info });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Equipamentos de Rede/Interfone já marcados como CRÍTICO NO PRÓPRIO
// painel (ver externalDeviceService.js) — candidatos a marcar prioridade
// aqui no Portal, um por um, em vez de um alarme só pro módulo inteiro.
settingsRouter.get('/external-devices/:moduleKey', async (req, res) => {
  const { moduleKey } = req.params;
  if (!['rede', 'interfone'].includes(moduleKey)) return res.status(400).json({ error: 'Módulo inválido.' });
  if (!supportsCriticalPriority(moduleKey)) {
    return res.json({ supported: false, devices: [] });
  }
  try {
    const result = await listCriticalExternalDevices(moduleKey);
    res.json({ supported: true, ...result });
  } catch (err) {
    res.status(502).json({ error: `Não consegui falar com o painel: ${err.message}` });
  }
});

settingsRouter.put('/external-devices/:moduleKey/:deviceId', (req, res) => {
  const { moduleKey, deviceId } = req.params;
  if (!['rede', 'interfone'].includes(moduleKey)) return res.status(400).json({ error: 'Módulo inválido.' });
  setExternalDevicePriority(moduleKey, deviceId, Boolean(req.body?.priority));
  res.json({ ok: true });
});
