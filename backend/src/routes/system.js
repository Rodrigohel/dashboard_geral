import { Router } from 'express';
import { getServerHealth, getHealthHistory, startHealthHistorySampler } from '../services/systemHealthService.js';

export const systemRouter = Router();

startHealthHistorySampler();

systemRouter.get('/health', async (req, res) => {
  try {
    res.json(await getServerHealth());
  } catch (err) {
    res.status(500).json({ error: `Não foi possível ler a saúde do servidor: ${err.message}` });
  }
});

systemRouter.get('/health/history', (req, res) => {
  res.json(getHealthHistory());
});
