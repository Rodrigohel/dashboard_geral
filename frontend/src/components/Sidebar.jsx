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
  { key: 'auditoria', label: 'Auditoria', icon: 'key' },
  { key: 'configuracoes', label: 'Configurações', icon: 'settings' },
];

export default function Sidebar({ branding, view, onNavigate, can, isOwner, open, onClose }) {
  return (
    <>
      <div className={`sidebar-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.name} className="brand-mark brand-logo-img" />
          ) : (
            <div className="brand-mark">{branding.name.charAt(0).toUpperCase()}</div>
          )}
          <span className="nav-label brand-text">{branding.name}</span>
        </div>

        <nav className="nav">
          {NAV_ITEMS.filter((item) => !item.module || can(item.module)).map((item) => (
            <button
              key={item.key}
              className={`nav-item ${view === item.key ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
              title={item.label}
            >
              <Icon name={item.icon} size={18} />
              <span className="nav-label">{item.label}</span>
            </button>
          ))}

          {isOwner && (
            <>
              <div className="nav-section-label nav-label">Administração</div>
              {ADMIN_ITEMS.map((item) => (
                <button
                  key={item.key}
                  className={`nav-item ${view === item.key ? 'active' : ''}`}
                  onClick={() => onNavigate(item.key)}
                  title={item.label}
                >
                  <Icon name={item.icon} size={18} />
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
