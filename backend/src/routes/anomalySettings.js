import { Router } from 'express';
import { getAnomalyParams, validateAnomalySettings, saveAnomalySettings } from '../services/anomalySettingsService.js';

export const anomalySettingsRouter = Router();

// GET fica aberto pra qualquer usuário autenticado (não só dono) — a
// detecção de anomalia de Rede/Interfone roda no cliente, dentro dos
// próprios painéis, então qualquer usuário com acesso ao módulo precisa
// conseguir ler o parâmetro atual. Só a troca (PUT) é exclusiva do dono.
anomalySettingsRouter.get('/', (req, res) => {
  res.json(getAnomalyParams());
});

anomalySettingsRouter.put('/', (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Apenas o administrador pode alterar isso.' });
  }
  const error = validateAnomalySettings(req.body || {});
  if (error) return res.status(400).json({ error });
  saveAnomalySettings(req.body);
  res.json(getAnomalyParams());
});
