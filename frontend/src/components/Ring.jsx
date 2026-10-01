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
