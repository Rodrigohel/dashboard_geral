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

const LOGO_DIR = path.join(path.dirname(config.auth.sqlitePath), 'branding');
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

brandingRouter.get('/', (req, res) => {
  const row = getBranding();
  res.json({ name: row.name, logoUrl: row.logo_filename ? '/api/branding/logo' : null });
});

brandingRouter.get('/logo', (req, res) => {
  const row = getBranding();
  if (!row.logo_filename) return res.status(404).end();
  const filePath = path.join(LOGO_DIR, row.logo_filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.set('Cache-Control', 'no-cache');
  res.sendFile(filePath);
});

brandingRouter.put('/', requireAuth, requireOwner, upload.single('logo'), (req, res) => {
  const row = getBranding();
  const name = (req.body?.name || '').trim() || row.name;
  let logoFilename = row.logo_filename;

  if (req.file) {
    const ext = EXT_BY_MIME[req.file.mimetype];
    if (!ext) return res.status(400).json({ error: 'Formato de imagem não suportado (use PNG, JPG, SVG ou WEBP).' });
    fs.mkdirSync(LOGO_DIR, { recursive: true });
    // Remove o logo antigo (nome diferente) antes de gravar o novo, senão
    // arquivo de extensão trocada (ex.: .png -> .svg) fica órfão no disco.
    if (logoFilename && logoFilename !== `logo${ext}`) {
      fs.rmSync(path.join(LOGO_DIR, logoFilename), { force: true });
    }
    logoFilename = `logo${ext}`;
    fs.writeFileSync(path.join(LOGO_DIR, logoFilename), req.file.buffer);
  }

  db.prepare('UPDATE branding SET name = ?, logo_filename = ? WHERE id = 1').run(name, logoFilename);
  res.json({ name, logoUrl: logoFilename ? '/api/branding/logo' : null });
});
