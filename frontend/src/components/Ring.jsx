// Nunca mostra 100% a menos que esteja tudo online de verdade, nem 0% a
// menos que esteja tudo offline — arredondamento comum faria, por exemplo,
// 199 de 200 online (99.5%) virar "100%" mesmo com 1 equipamento offline
// (foi exatamente isso que aconteceu na Rede: 100% com 1 offline, enquanto
// o Interfone, com menos ramais, arredondava "por sorte" pra 99%).
export function healthPercent(online, total) {
  if (!total) return 0;
  if (online >= total) return 100;
  if (online <= 0) return 0;
  const pct = Math.round((online / total) * 100);
  return Math.min(99, Math.max(1, pct));
}

// Anel de progresso simples (conic-gradient) — mesmo visual do mockup
// aprovado, alimentado com percentuais reais (online/total de cada módulo).
// Compartilhado entre Início, Rede, Interfone e Controle de acesso.
export default function Ring({ percent, color, value, sub, size = 60 }) {
  const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div
      className="kpi-ring"
      style={{ width: size, height: size, background: `conic-gradient(${color} 0% ${safePercent}%, var(--border-subtle) ${safePercent}% 100%)` }}
    >
      <div className="kpi-ring-inner">
        {value}
        {sub && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)' }}>{sub}</span>}
      </div>
    </div>
  );
}
