import { Router } from 'express';
import { getPublicPushInfo, saveSubscription, removeSubscription } from '../services/pushService.js';

export const pushRouter = Router();

// Aberto a qualquer usuário autenticado — o navegador precisa saber se a
// funcionalidade está ligada e, se estiver, a chave pública pra poder se
// inscrever.
pushRouter.get('/public-key', (req, res) => {
  res.json(getPublicPushInfo());
});

pushRouter.post('/subscribe', (req, res) => {
  try {
    saveSubscription(req.user.sub, req.body?.subscription);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

pushRouter.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) removeSubscription(endpoint);
  res.json({ ok: true });
});
