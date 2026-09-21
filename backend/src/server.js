import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { accessDevicesRouter } from './routes/accessDevices.js';
import { getFaceRelayToken } from './services/accessControlClient.js';
import { settingsRouter } from './routes/settings.js';
import { modulesRouter } from './routes/modules.js';
import { systemRouter } from './routes/system.js';
import { requireAuth, requireOwner, requireModule } from './middleware/auth.js';
import { gatewayProxy } from './services/gatewayService.js';
import './db/sqlite.js';

const app = express();
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

app.use('/api/auth', authRouter);
app.use('/api/modules', requireAuth, modulesRouter);
app.use('/api/users', requireAuth, requireOwner, usersRouter);
app.use('/api/access/devices', requireAuth, requireModule('acesso'), accessDevicesRouter);
app.use('/api/settings', requireAuth, requireOwner, settingsRouter);
app.use('/api/system', requireAuth, requireOwner, systemRouter);

// Gateway: o front-end do Portal chama /gateway/rede/... e /gateway/interfone/...
// como se fossem API própria; por trás, isso vira uma chamada autenticada
// para o backend real de cada painel (ver services/gatewayService.js).
app.all('/gateway/rede/*', requireAuth, requireModule('rede'), gatewayProxy('rede'));
app.all('/gateway/interfone/*', requireAuth, requireModule('interfone'), gatewayProxy('interfone'));

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
