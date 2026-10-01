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
  const shortName = row?.short_name || (name.length > 20 ? name.slice(0, 20) : name);

  // Só o ícone quadrado dedicado (pwa_icon_filename) entra como ícone do
  // app — NUNCA a logo (logo_filename). A logo é tipicamente um logotipo
  // retangular (texto + símbolo), não um ícone quadrado; declarar ela como
  // "192x192"/"512x512" quando o arquivo real é bem menor/não-quadrado faz
  // o Chrome invalidar o manifest inteiro (ícone não bate com o tamanho
  // declarado) e simplesmente nunca oferecer o banner de instalação — sem
  // erro nenhum visível. Sem um ícone quadrado dedicado cadastrado, é mais
  // seguro cair no ícone padrão do Portal do que arriscar isso.
  //
  // O padrão usado pra cair era só um SVG com sizes:"any" — tecnicamente
  // válido, mas o checador de instalabilidade do Chrome no Android já foi
  // visto recusando manifests só-com-SVG (sem nenhum PNG 192/512 "de
  // verdade"), mesmo exibindo o ícone normalmente depois de instalado.
  // PNGs gerados do mesmo desenho (frontend/public/icon-192.png e
  // icon-512.png) eliminam essa categoria de problema pra qualquer tenant
  // que ainda não subiu um ícone próprio.
  const icons = [];
  if (row?.pwa_icon_filename) {
    const ext = row.pwa_icon_filename.slice(row.pwa_icon_filename.lastIndexOf('.')).toLowerCase();
    const type = MIME_BY_EXT[ext] || 'image/png';
    // Mesmo arquivo declarado em todos os tamanhos — não temos como gerar
    // recortes de verdade em cada tamanho; o sistema operacional
    // escala/centraliza sozinho.
    icons.push({ src: '/api/branding/pwa-icon', sizes: '192x192', type, purpose: 'any' });
    icons.push({ src: '/api/branding/pwa-icon', sizes: '512x512', type, purpose: 'any' });
  } else {
    icons.push({ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' });
    icons.push({ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' });
  }

  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'no-cache');
  res.json({
    name,
    short_name: shortName,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0e1a',
    theme_color: accentColor,
    icons,
  });
});
