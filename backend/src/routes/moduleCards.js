import { Router } from 'express';
import { db } from '../db/sqlite.js';
import { MODULE_KEYS } from '../config.js';

export const moduleCardsRouter = Router();

// GET fica aberto pra qualquer usuário autenticado (não só dono) — o card
// da tela Início precisa mostrar o texto certo pra todo mundo, não só pra
// quem pode editar. Só a troca (PUT) é exclusiva do dono (mesmo padrão de
// anomalySettings.js).
moduleCardsRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT module_key, title, description FROM module_card_overrides').all();
  const result = {};
  for (const key of MODULE_KEYS) result[key] = { title: '', description: '' };
  for (const row of rows) {
    if (MODULE_KEYS.includes(row.module_key)) result[row.module_key] = { title: row.title, description: row.description };
  }
  res.json(result);
});

moduleCardsRouter.put('/:moduleKey', (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Apenas o administrador pode alterar isso.' });
  }
  const { moduleKey } = req.params;
  if (!MODULE_KEYS.includes(moduleKey)) {
    return res.status(400).json({ error: 'Módulo inválido' });
  }
  const { title = '', description = '' } = req.body || {};
  db.prepare(
    `INSERT INTO module_card_overrides (module_key, title, description) VALUES (?, ?, ?)
     ON CONFLICT(module_key) DO UPDATE SET title = excluded.title, description = excluded.description`
  ).run(moduleKey, title, description);
  res.json({ title, description });
});
