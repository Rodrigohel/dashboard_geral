import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { accessDevicesRouter } from './routes/accessDevices.js';
import { getFaceRelayToken } from './services/accessControlClient.js';
import { brandingRouter } from './routes/branding.js';
import { settingsRouter } from './routes/settings.js';
import { modulesRouter } from './routes/modules.js';
import { systemRouter } from './routes/system.js';
import { auditRouter } from './routes/audit.js';
import { requireAuth, requireOwner, requireModule } from './middleware/auth.js';
import { gatewayProxy } from './services/gatewayService.js';
import './db/sqlite.js';

const app = express();
// Necessário pra req.ip pegar o IP real do cliente (não o do túnel/proxy
// local) quando o Portal roda atrás de cloudflared — usado no log de login.
app.set('trust proxy', true);
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// Sem autenticação de propósito: é o equipamento de controle de acesso (não
// um usuário do Portal) quem busca essa imagem, por um link temporário de
// uso único gerado ao cadastrar uma foto facial (ver accessControlClient.js
// e routes/accessDevices.js). Token aleatório + expira sozinho em segundos.
app.get('/api/access/face-relay/:token', (req, res) => {
  const token = req.params.token.replace(/\.jpg$/i, '');
  const entry = getFaceRelayToken(token);
  if (!entry) return res.status(404).end();
  res.set('Content-Type', entry.mimetype);
  res.send(entry.buffer);
});

// Sem requireAuth no mount — GET é público (tela de login precisa mostrar
// nome/logo antes de autenticar); o PUT já exige dono dentro do próprio
// router (ver branding.js).
app.use('/api/branding', brandingRouter);

app.use('/api/auth', authRouter);
app.use('/api/modules', requireAuth, modulesRouter);
app.use('/api/users', requireAuth, requireOwner, usersRouter);
app.use('/api/access/devices', requireAuth, requireModule('acesso'), accessDevicesRouter);
app.use('/api/settings', requireAuth, requireOwner, settingsRouter);
app.use('/api/system', requireAuth, requireOwner, systemRouter);
app.use('/api/audit', requireAuth, requireOwner, auditRouter);

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
