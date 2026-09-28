import { db } from '../db/sqlite.js';

export const SENSITIVITY_LEVELS = ['baixa', 'media', 'alta'];

// Cada nível mapeia pro parâmetro numérico que a detecção de cada módulo já
// usava fixo no código antes desta tela existir — 'media' reproduz
// exatamente o comportamento antigo (2x desvio-padrão / 3 perdidas e 2x a
// média / 15 aberturas de amostra), então trocar a tabela não muda nada até
// o dono ir em Configurações escolher outra sensibilidade.
const REDE_LATENCY_STDEV_MULTIPLIER = { baixa: 3, media: 2, alta: 1.5 };
const INTERFONE_MISSED = {
  baixa: { minCount: 5, multiplier: 3 },
  media: { minCount: 3, multiplier: 2 },
  alta: { minCount: 2, multiplier: 1.5 },
};
const ACESSO_MIN_SAMPLE = { baixa: 30, media: 15, alta: 8 };

export function getAnomalySettings() {
  const row = db.prepare('SELECT * FROM anomaly_settings WHERE id = 1').get();
  return {
    redeSensitivity: row.rede_sensitivity,
    interfoneSensitivity: row.interfone_sensitivity,
    acessoSensitivity: row.acesso_sensitivity,
  };
}

// Junto com o nível, devolve o parâmetro numérico já resolvido — assim o
// front-end (Rede/Interfone, que calculam a anomalia no cliente) e o
// back-end (Acesso, em accessDevices.js) usam a mesma fonte sem duplicar a
// tabela de níveis.
export function getAnomalyParams() {
  const s = getAnomalySettings();
  return {
    ...s,
    redeLatencyStdevMultiplier: REDE_LATENCY_STDEV_MULTIPLIER[s.redeSensitivity],
    interfoneMissedMinCount: INTERFONE_MISSED[s.interfoneSensitivity].minCount,
    interfoneMissedMultiplier: INTERFONE_MISSED[s.interfoneSensitivity].multiplier,
    acessoMinSample: ACESSO_MIN_SAMPLE[s.acessoSensitivity],
  };
}

export function validateAnomalySettings({ redeSensitivity, interfoneSensitivity, acessoSensitivity }) {
  for (const [key, v] of Object.entries({ redeSensitivity, interfoneSensitivity, acessoSensitivity })) {
    if (!SENSITIVITY_LEVELS.includes(v)) {
      return `Valor inválido para "${key}" — precisa ser "baixa", "media" ou "alta".`;
    }
  }
  return null;
}

export function saveAnomalySettings({ redeSensitivity, interfoneSensitivity, acessoSensitivity }) {
  db.prepare(
    'UPDATE anomaly_settings SET rede_sensitivity = ?, interfone_sensitivity = ?, acesso_sensitivity = ? WHERE id = 1'
  ).run(redeSensitivity, interfoneSensitivity, acessoSensitivity);
}
