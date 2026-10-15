// O LOGO só manda 4 pontos discretos (mínimo/médio/máximo/segurança) — não
// existe sensor de nível contínuo. "O nível" é sempre a boia mais alta que
// está ativa agora; usado tanto pela animação do tanque (PumpStation) quanto
// pelo card resumido da tela Início.
export const LEVEL_STOPS = [
  { key: 'nivelSeguranca', percent: 92, severity: 4, label: 'Segurança' },
  { key: 'nivelMaximo', percent: 72, severity: 3, label: 'Máximo' },
  { key: 'nivelMedio', percent: 48, severity: 2, label: 'Médio' },
  { key: 'nivelMinimo', percent: 24, severity: 1, label: 'Mínimo' },
];

export function fillPercentFor(points) {
  for (const stop of LEVEL_STOPS) {
    if (points?.[stop.key] === true) return stop.percent;
  }
  return 6;
}

// severity 0 = nenhuma boia ativa (abaixo do mínimo) — sem cor de alerta,
// usa a cor neutra de "sem dado"/normal baixo.
export function currentLevelStop(points) {
  for (const stop of LEVEL_STOPS) {
    if (points?.[stop.key] === true) return stop;
  }
  return null;
}

export function severityColorVar(severity) {
  return `var(--level-${Math.min(4, Math.max(1, severity || 1))})`;
}
