import Icon from './Icon.jsx';

const NAV_ITEMS = [
  { key: 'home', label: 'Início', icon: 'home', module: null },
  { key: 'rede', label: 'Rede', icon: 'network', module: 'rede' },
  { key: 'interfone', label: 'Interfone', icon: 'phone', module: 'interfone' },
  { key: 'acesso', label: 'Controle de acesso', icon: 'shieldFace', module: 'acesso' },
];

// Mesma ordem e agrupamento do mockup aprovado: "Administração" leva só
// Usuários/Auditoria/Saúde do servidor; Configurações fica sozinha embaixo,
// numa seção "Outros" separada.
const ADMIN_ITEMS = [
  { key: 'usuarios', label: 'Usuários', icon: 'users' },
  { key: 'auditoria', label: 'Auditoria', icon: 'key' },
  { key: 'servidor', label: 'Saúde do servidor', icon: 'server' },
];

const OTHER_ITEMS = [{ key: 'configuracoes', label: 'Configurações', icon: 'settings' }];

function NavButton({ item, active, onNavigate }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => onNavigate(item.key)}>
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
    </button>
  );
}

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
          <span className="brand-text">{branding.name}</span>
        </div>

        <nav className="nav">
          {NAV_ITEMS.filter((item) => !item.module || can(item.module)).map((item) => (
            <NavButton key={item.key} item={item} active={view === item.key} onNavigate={onNavigate} />
          ))}

          {isOwner && (
            <>
              <div className="nav-section-label">Administração</div>
              {ADMIN_ITEMS.map((item) => (
                <NavButton key={item.key} item={item} active={view === item.key} onNavigate={onNavigate} />
              ))}

              <div className="nav-section-label">Outros</div>
              {OTHER_ITEMS.map((item) => (
                <NavButton key={item.key} item={item} active={view === item.key} onNavigate={onNavigate} />
              ))}
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
