// Nome e logo do Portal — a tela de login precisa disso ANTES de qualquer
// autenticação, então GET aqui é público de propósito (só nome/logo, nada
// sensível). Só a troca (PUT) exige dono.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { db } from '../db/sqlite.js';
import { config } from '../config.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';

export const brandingRouter = Router();

// path.resolve antes do dirname: SQLITE_PATH pode vir relativo (é o padrão,
// "./data/portal.db"), e res.sendFile() abaixo exige caminho absoluto — sem
// isso ele lança e a rota devolve 500 no lugar da imagem (o navegador então
// mostra o ícone de "imagem quebrada" com o alt por cima).
const LOGO_DIR = path.join(path.dirname(path.resolve(config.auth.sqlitePath)), 'branding');
const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
};
const upload = multer({ limits: { fileSize: 2 * 1024 * 1024 } });

function getBranding() {
  return db.prepare('SELECT * FROM branding WHERE id = 1').get();
}

function serializeBranding(row) {
  return {
    name: row.name,
    logoUrl: row.logo_filename ? '/api/branding/logo' : null,
    accentColor: row.accent_color || '',
    shortName: row.short_name || '',
    pwaIconUrl: row.pwa_icon_filename ? '/api/branding/pwa-icon' : null,
  };
}

brandingRouter.get('/', (req, res) => {
  res.json(serializeBranding(getBranding()));
});

brandingRouter.get('/logo', (req, res) => {
  const row = getBranding();
  if (!row.logo_filename) return res.status(404).end();
  const filePath = path.join(LOGO_DIR, row.logo_filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(filePath);
});

// Ícone quadrado do PWA — à parte do logo (ver comentário da migração em
// db/sqlite.js). Sem ele, o manifest (routes/manifest.js) cai de volta no
// logo e depois no ícone padrão.
brandingRouter.get('/pwa-icon', (req, res) => {
  const row = getBranding();
  if (!row.pwa_icon_filename) return res.status(404).end();
  const filePath = path.join(LOGO_DIR, row.pwa_icon_filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(filePath);
});

brandingRouter.put(
  '/',
  requireAuth,
  requireOwner,
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'pwaIcon', maxCount: 1 },
  ]),
  (req, res) => {
    const row = getBranding();
    const name = (req.body?.name || '').trim() || row.name;
    let logoFilename = row.logo_filename;
    let pwaIconFilename = row.pwa_icon_filename;

    let accentColor = row.accent_color || '';
    if (req.body?.accentColor !== undefined) {
      const raw = String(req.body.accentColor).trim();
      if (raw === '') accentColor = '';
      else if (/^#[0-9a-fA-F]{6}$/.test(raw)) accentColor = raw;
      else return res.status(400).json({ error: 'Cor inválida — use o formato #RRGGBB.' });
    }

    const shortName = req.body?.shortName !== undefined ? String(req.body.shortName).trim() : row.short_name || '';

    const logoFile = req.files?.logo?.[0];
    if (logoFile) {
      const ext = EXT_BY_MIME[logoFile.mimetype];
      if (!ext) return res.status(400).json({ error: 'Formato de imagem não suportado (use PNG, JPG, SVG ou WEBP).' });
      fs.mkdirSync(LOGO_DIR, { recursive: true });
      // Remove o logo antigo (nome diferente) antes de gravar o novo, senão
      // arquivo de extensão trocada (ex.: .png -> .svg) fica órfão no disco.
      if (logoFilename && logoFilename !== `logo${ext}`) {
        fs.rmSync(path.join(LOGO_DIR, logoFilename), { force: true });
      }
      logoFilename = `logo${ext}`;
      fs.writeFileSync(path.join(LOGO_DIR, logoFilename), logoFile.buffer);
    }

    const pwaIconFile = req.files?.pwaIcon?.[0];
    if (pwaIconFile) {
      const ext = EXT_BY_MIME[pwaIconFile.mimetype];
      if (!ext) return res.status(400).json({ error: 'Formato de imagem não suportado (use PNG, JPG, SVG ou WEBP).' });
      fs.mkdirSync(LOGO_DIR, { recursive: true });
      if (pwaIconFilename && pwaIconFilename !== `pwa-icon${ext}`) {
        fs.rmSync(path.join(LOGO_DIR, pwaIconFilename), { force: true });
      }
      pwaIconFilename = `pwa-icon${ext}`;
      fs.writeFileSync(path.join(LOGO_DIR, pwaIconFilename), pwaIconFile.buffer);
    }

    db.prepare('UPDATE branding SET name = ?, logo_filename = ?, accent_color = ?, short_name = ?, pwa_icon_filename = ? WHERE id = 1').run(
      name,
      logoFilename,
      accentColor,
      shortName,
      pwaIconFilename
    );
    res.json(serializeBranding(getBranding()));
  }
);
