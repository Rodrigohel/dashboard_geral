// Manifest do PWA — gerado na hora a partir da marca (nome/logo/cor) já
// configurada em Configurações, em vez de um arquivo estático fixo: cada
// instalação do Portal (empresa diferente) fica instalável com o próprio
// nome/ícone, sem precisar buildar o frontend de novo. GET público de
// propósito, igual /api/branding (só nome/logo, nada sensível) — o
// navegador busca isso ANTES do usuário logar, ao tentar instalar.
import { Router } from 'express';
import { db } from '../db/sqlite.js';

export const manifestRouter = Router();

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

manifestRouter.get('/', (req, res) => {
  const row = db.prepare('SELECT * FROM branding WHERE id = 1').get();
  const name = row?.name || 'Portal';
  const accentColor = row?.accent_color || '#14b8a6';

  const icons = [];
  if (row?.logo_filename) {
    const ext = row.logo_filename.slice(row.logo_filename.lastIndexOf('.')).toLowerCase();
    const type = MIME_BY_EXT[ext] || 'image/png';
    // Mesmo arquivo declarado em todos os tamanhos — não temos como gerar
    // recortes quadrados de verdade a partir da logo enviada pelo
    // administrador; o sistema operacional escala/centraliza sozinho
    // (mesma limitação que já existe pra logo do login/menu).
    icons.push({ src: '/api/branding/logo', sizes: '192x192', type, purpose: 'any' });
    icons.push({ src: '/api/branding/logo', sizes: '512x512', type, purpose: 'any' });
  } else {
    icons.push({ src: '/icon-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' });
  }

  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'no-cache');
  res.json({
    name,
    short_name: name.length > 20 ? name.slice(0, 20) : name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0e1a',
    theme_color: accentColor,
    icons,
  });
});
