import Icon from './Icon.jsx';

const NAV_ITEMS = [
  { key: 'home', label: 'Início', icon: 'home', module: null },
  { key: 'rede', label: 'Rede', icon: 'network', module: 'rede' },
  { key: 'interfone', label: 'Interfone', icon: 'phone', module: 'interfone' },
  { key: 'acesso', label: 'Controle de acesso', icon: 'shieldFace', module: 'acesso' },
];

const ADMIN_ITEMS = [
  { key: 'usuarios', label: 'Usuários', icon: 'users' },
  { key: 'servidor', label: 'Saúde do servidor', icon: 'server' },
  { key: 'configuracoes', label: 'Configurações', icon: 'settings' },
];

export default function Sidebar({ view, onNavigate, can, isOwner, open, onClose }) {
  return (
    <>
      <div className={`sidebar-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">P</div>
          <span className="brand-text">Portal</span>
        </div>

        <nav className="nav">
          {NAV_ITEMS.filter((item) => !item.module || can(item.module)).map((item) => (
            <button
              key={item.key}
              className={`nav-item ${view === item.key ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}

          {isOwner && (
            <>
              <div className="nav-section-label">Administração</div>
              {ADMIN_ITEMS.map((item) => (
                <button
                  key={item.key}
                  className={`nav-item ${view === item.key ? 'active' : ''}`}
                  onClick={() => onNavigate(item.key)}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </button>
              ))}
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
