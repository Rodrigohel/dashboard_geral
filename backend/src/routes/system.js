import { Router } from 'express';
import { getServerHealth } from '../services/systemHealthService.js';

export const systemRouter = Router();

systemRouter.get('/health', async (req, res) => {
  try {
    res.json(await getServerHealth());
  } catch (err) {
    res.status(500).json({ error: `Não foi possível ler a saúde do servidor: ${err.message}` });
  }
});
