import Icon from './Icon.jsx';

// Barra fixa embaixo, só no celular (ver .bottom-nav em layout.css) — igual
// o mockup aprovado. Só os módulos cabem aqui; "Mais" abre o menu lateral
// de sempre, onde ficam Usuários/Auditoria/Saúde do servidor/Configurações
// (dono) — nada que já existia foi removido, só ganhou esse atalho.
const ITEMS = [
  { key: 'home', label: 'Início', icon: 'home', module: null },
  { key: 'rede', label: 'Rede', icon: 'network', module: 'rede' },
  { key: 'interfone', label: 'Interfone', icon: 'phone', module: 'interfone' },
  { key: 'acesso', label: 'Acesso', icon: 'shieldFace', module: 'acesso' },
];

export default function BottomNav({ view, onNavigate, can, onMoreClick }) {
  const items = ITEMS.filter((item) => !item.module || can(item.module));

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.key}
          className={`bottom-nav-item ${view === item.key ? 'active' : ''}`}
          onClick={() => onNavigate(item.key)}
        >
          <Icon name={item.icon} size={20} strokeWidth={view === item.key ? 2.3 : 1.8} />
          <span>{item.label}</span>
        </button>
      ))}
      <button className="bottom-nav-item" onClick={onMoreClick}>
        <Icon name="menu" size={20} />
        <span>Mais</span>
      </button>
    </nav>
  );
}
