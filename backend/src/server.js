import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { accessDevicesRouter } from './routes/accessDevices.js';
import { pumpStationRouter } from './routes/pumpStation.js';
import { generatorRouter } from './routes/generator.js';
import { brandingRouter } from './routes/branding.js';
import { manifestRouter } from './routes/manifest.js';
import { settingsRouter } from './routes/settings.js';
import { anomalySettingsRouter } from './routes/anomalySettings.js';
import { moduleCardsRouter } from './routes/moduleCards.js';
import { pushRouter } from './routes/push.js';
import { modulesRouter } from './routes/modules.js';
import { systemRouter } from './routes/system.js';
import { auditRouter } from './routes/audit.js';
import { reportsRouter } from './routes/reports.js';
import { requireAuth, requireOwner, requireModule, requirePermission } from './middleware/auth.js';
import { gatewayProxy } from './services/gatewayService.js';
import { startDeviceHealthPoller } from './services/deviceHealthPoller.js';
import { startAuditRetentionPruner } from './services/auditRetentionPruner.js';
import { startPumpStationHistoryPoller } from './services/pumpStationHistoryPoller.js';
import { startGeneratorPoller } from './services/generatorPoller.js';
import { startNetworkAlarmPoller } from './services/networkAlarmPoller.js';
import {
  isValidWebhookSecret,
  acknowledgeAllActiveAlarms,
  sendTelegramMessage,
  handleCallbackQuery,
  captureChatIdIfMissing,
} from './services/telegramService.js';
import { isValidTwilioWebhookSecret, handleCallAnswered } from './services/twilioService.js';
import { logSystemEvent } from './services/systemEventsService.js';
import { decryptSecret } from './services/cryptoService.js';
import * as deviceApi from './services/accessControlClient.js';
import { db } from './db/sqlite.js';

const app = express();
// Necessário pra req.ip pegar o IP real do cliente (não o do túnel/proxy
// local) quando o Portal roda atrás de cloudflared — usado no log de login.
app.set('trust proxy', true);
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// Versão do Portal — uma só pros dois lados (backend/package.json é a fonte;
// o frontend não tem como ler esse arquivo sozinho, então pede aqui).
// Público de propósito, igual /api/branding: a Sidebar mostra pra qualquer
// usuário logado, não só dono. Bump manual a cada PR que mude algo de
// verdade (ver convenção no topo do IDEIAS.md) — não é automático.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
app.get('/api/version', (req, res) => res.json({ version: PACKAGE_JSON.version }));

// Sem requireAuth no mount — GET é público (tela de login precisa mostrar
// nome/logo antes de autenticar); o PUT já exige dono dentro do próprio
// router (ver branding.js).
app.use('/api/branding', brandingRouter);

// Fora de /api de propósito — é onde o navegador/SO busca o manifest de um
// PWA (link rel="manifest" no index.html aponta pra cá). Registrado antes
// do fallback estático do frontend (final do arquivo) pra não cair no
// index.html no lugar do JSON.
app.use('/manifest.webmanifest', manifestRouter);

// Público de propósito (o Telegram chama isso, não um usuário logado do
// Portal) — autenticado pelo `secret` na própria URL em vez de JWT (ver
// webhook_secret/isValidWebhookSecret em telegramService.js). Configurado
// no bot via setWebhook pra essa URL completa.
app.post('/api/telegram/webhook/:secret', async (req, res) => {
  if (!isValidWebhookSecret(req.params.secret)) return res.status(404).end();
  res.status(200).end(); // responde rápido — o Telegram não espera processamento
  try {
    // Toque num botão ("Visto"/"Em manutenção") — reconhece só aquele
    // alarme (ver handleCallbackQuery).
    const callback = req.body?.callback_query;
    if (callback) {
      await handleCallbackQuery(callback.data, callback.id);
      return;
    }
    // Primeira mensagem solta, antes de ter um chat ID salvo: é a própria
    // configuração (ver captureChatIdIfMissing) — sem isso, descobrir o
    // chat ID exigia copiar à mão do getUpdates. Depois de capturado uma
    // vez, mensagem solta volta a significar "reconhecer alarmes" abaixo.
    const chatId = req.body?.message?.chat?.id;
    if (chatId && (await captureChatIdIfMissing(chatId))) return;

    // Mensagem de texto solta — reconhece todos os alarmes ativos (fallback
    // pra quem prefere digitar em vez de tocar num botão).
    const text = req.body?.message?.text;
    if (!text) return;
    const acked = await acknowledgeAllActiveAlarms();
    if (acked.length > 0) {
      await sendTelegramMessage(`✅ ${acked.length} alarme(s) reconhecido(s), parei de insistir.`).catch(() => {});
    }
  } catch {
    // webhook do Telegram não tem pra quem devolver erro depois do 200 já
    // mandado — só não derruba o processo.
  }
});

// Também público (o Twilio chama, não um usuário logado) — avisa que uma
// ligação de escalonamento foi ATENDIDA (ver StatusCallback em
// twilioService.js/placeCall), o que já conta como reconhecimento do
// alarme, igual tocar "Visto" no Telegram. Protegido pelo `secret` na URL
// (gerado junto com as outras configurações do Twilio), não por JWT — mesmo
// esquema do webhook do Telegram acima.
app.post('/api/twilio/status/:secret', (req, res) => {
  if (!isValidTwilioWebhookSecret(req.params.secret)) return res.status(404).end();
  res.status(204).end(); // responde rápido — o Twilio não espera processamento
  handleCallAnswered(req.query.alarmKey).catch(() => {});
});

// Abrir porteiro/porta por voz (Siri/Atalhos, Google/IFTTT — ver IDEIAS.md):
// também público, sem JWT (um atalho/webhook não loga) — o token em si (ver
// voice_open_tokens/accessDevices.js) já é o segredo, um por
// equipamento+usuário. GET de propósito: é o jeito mais simples de chamar
// tanto do app Atalhos quanto do Webhooks do IFTTT. Revalida a permissão de
// abrir NA HORA (não só na criação do token) — revogar o acesso de abrir
// desliga o link de voz sozinho.
app.get('/api/voice/open/:token', async (req, res) => {
  const row = db.prepare('SELECT device_id, user_id FROM voice_open_tokens WHERE token = ?').get(req.params.token);
  if (!row) return res.status(404).json({ error: 'Link inválido ou revogado.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  const device = db.prepare('SELECT * FROM access_devices WHERE id = ?').get(row.device_id);
  if (!user || !device) return res.status(404).json({ error: 'Link inválido ou revogado.' });

  const canOpen =
    user.role === 'owner' ||
    db.prepare('SELECT 1 FROM device_open_permissions WHERE user_id = ? AND device_id = ?').get(user.id, device.id);
  if (!canOpen) return res.status(403).json({ error: 'Esse usuário não tem mais permissão pra abrir esse equipamento.' });

  try {
    await deviceApi.openDoor(device, decryptSecret(device.device_password_enc));
    db.prepare(
      `INSERT INTO door_open_events (device_id, device_name, user_id, username, success) VALUES (?, ?, ?, ?, 1)`
    ).run(device.id, device.name, user.id, `${user.display_name} (voz)`);
    logSystemEvent('acesso.abertura.voz', `"${user.display_name}" abriu "${device.name}" por voz`);
    res.json({ ok: true });
  } catch (err) {
    db.prepare(
      `INSERT INTO door_open_events (device_id, device_name, user_id, username, success, error_message) VALUES (?, ?, ?, ?, 0, ?)`
    ).run(device.id, device.name, user.id, `${user.display_name} (voz)`, err.message || '');
    res.status(502).json({ error: err.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/modules', requireAuth, modulesRouter);
// Sem requireOwner no mount — cada rota dentro do router agora checa a
// permissão fina certa (usuarios.ver/incluir/editar/excluir), com guardas
// contra escalonamento pra quem não é dono (ver users.js).
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/access/devices', requireAuth, requireModule('acesso'), accessDevicesRouter);
app.use('/api/pumpstation', requireAuth, requireModule('bombas'), pumpStationRouter);
app.use('/api/generator', requireAuth, requireModule('gerador'), generatorRouter);
// Precisa vir antes do mount geral de '/api/settings' (dono-só) logo abaixo
// — como os dois prefixos se sobrepõem, o Express usa o primeiro que
// casar, e aqui o GET precisa ficar aberto a qualquer usuário autenticado
// (ver comentário em anomalySettings.js).
app.use('/api/settings/anomaly', requireAuth, anomalySettingsRouter);
app.use('/api/settings/module-cards', requireAuth, moduleCardsRouter);
app.use('/api/settings', requireAuth, requireOwner, settingsRouter);
app.use('/api/push', requireAuth, pushRouter);
app.use('/api/system', requireAuth, requireOwner, systemRouter);
// Dono sempre passa (ver requirePermission) — além dele, só quem o dono
// liberou explicitamente com "auditoria.ver" (ver Usuários → permissões).
app.use('/api/audit', requireAuth, requirePermission('auditoria.ver'), auditRouter);
// Igual Auditoria: dono sempre passa, além dele só quem foi liberado com
// "relatorios.ver" (ver Usuários → permissões) — independente de ter os
// módulos Bombas/Acesso.
app.use('/api/reports', requireAuth, requirePermission('relatorios.ver'), reportsRouter);

// Gateway: o front-end do Portal chama /gateway/rede/... e /gateway/interfone/...
// como se fossem API própria; por trás, isso vira uma chamada autenticada
// para o backend real de cada painel (ver services/gatewayService.js).
//
// Rede é só consulta no Portal: cadastro/edição/exclusão de equipamento e
// tudo de planta baixa (criar pavimento, posicionar) são feitos no painel
// de Rede original, não aqui — por isso toda escrita fica travada pro
// dono (nem ele usa isso pelo Portal; é só rede de segurança caso alguém
// tente chamar a API do gateway direto). Leitura da planta baixa e da
// análise/histórico continuam atrás das permissões de funcionalidade
// (controlam o que cada usuário VÊ, não o que ele pode mudar).
const REDE_FEATURE_RULES = [
  {
    test: (method, path) => method === 'GET' && /^\/api\/floors(\/|$)/.test(path),
    feature: 'rede.plantaBaixa',
    message: 'Você não tem acesso à planta baixa.',
  },
  {
    test: (method, path) => method !== 'GET' && (/^\/api\/floors(\/|$)/.test(path) || /\/floor-position$/.test(path)),
    requireOwner: true,
    message: 'Planta baixa é gerenciada no painel de Rede original.',
  },
  {
    test: (method, path) => method !== 'GET' && /^\/api\/devices(\/|$)/.test(path) && !/\/favorite$/.test(path),
    requireOwner: true,
    message: 'Cadastro de equipamentos é feito no painel de Rede original.',
  },
  {
    test: (method, path) => /^\/api\/(stats\/network-history|stats\/flappiest|stats\/report\/executive|history)(\/|$|\?)/.test(path),
    feature: 'rede.analise',
    message: 'Você não tem acesso à análise de rede.',
  },
  {
    // Configurações gerais do painel de Rede (nome, Telegram, intervalos) —
    // afeta todo mundo que usa aquele painel, então fica só com o dono.
    test: (method, path) => method !== 'GET' && /^\/api\/settings(\/|$)/.test(path),
    requireOwner: true,
    message: 'Só o administrador pode alterar as configurações do painel de Rede.',
  },
];
app.all('/gateway/rede/*', requireAuth, requireModule('rede'), gatewayProxy('rede', { featureRules: REDE_FEATURE_RULES }));

// Interfone é a mesma política de Rede: só consulta no Portal (ramais,
// chamadas) — configurações e usuários do painel de Interfone continuam lá.
const INTERFONE_FEATURE_RULES = [
  {
    test: (method, path) => /^\/api\/(settings|users)(\/|$)/.test(path),
    requireOwner: true,
    message: 'Configurações e usuários do painel de Interfone são geridos no painel original.',
  },
  {
    test: (method) => method !== 'GET',
    requireOwner: true,
    message: 'O Portal só mostra dados do Interfone — alterações são feitas no painel original.',
  },
];
app.all('/gateway/interfone/*', requireAuth, requireModule('interfone'), gatewayProxy('interfone', { featureRules: INTERFONE_FEATURE_RULES }));

// Opcional: se GATEWAY_*_FRONTEND_DIST apontar para o `frontend/dist` já
// buildado do painel de Rede/Interfone (rebuildado com
// VITE_BASE_PATH=/apps/rede/ ou /apps/interfone/ — ver README de cada
// painel), o Portal serve esse front direto, na mesma origem/domínio,
// então o cliente nunca sai do subdomínio único. Sem isso configurado, o
// módulo correspondente ainda funciona via API (gráfico e listas dentro do
// próprio front do Portal), só não embute a tela original inteira.
for (const [key, dist] of [
  ['rede', config.gateways.rede.frontendDist],
  ['interfone', config.gateways.interfone.frontendDist],
]) {
  if (dist && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(`/apps/${key}`, express.static(dist));
    app.get(`/apps/${key}/*`, (req, res) => res.sendFile(path.join(dist, 'index.html')));
    console.log(`[portal-backend] servindo front-end embutido de "${key}" a partir de ${dist}`);
  }
}

// Serve o próprio frontend do Portal já buildado (frontend/dist, pasta
// irmã de backend/) — um processo Node só, uma porta só.
const frontendDist = path.resolve(process.env.FRONTEND_DIST_PATH || path.join(process.cwd(), '../frontend/dist'));
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api|\/gateway|\/apps).*/, (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
  console.log(`[portal-backend] servindo frontend estático de ${frontendDist}`);
}

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[portal-backend] ouvindo em http://0.0.0.0:${config.port}`);
});

startDeviceHealthPoller();
startAuditRetentionPruner();
startPumpStationHistoryPoller();
startGeneratorPoller();
startNetworkAlarmPoller();
