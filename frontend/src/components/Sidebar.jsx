import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { api } from '../api/client.js';
import { useToast } from '../hooks/useToast.jsx';

const POLL_MS = 10000;

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

// Só esses três têm submenu — Início e as páginas de administração vão
// direto, não precisam de atalho nenhum.
const SUBMENU_KEYS = new Set(['rede', 'interfone', 'acesso']);

function NavButton({ item, active, onNavigate }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => onNavigate(item.key)}>
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
    </button>
  );
}

// Planta baixa (só quem tem a permissão) + quantos equipamentos estão
// offline agora — mesmo dado que a própria tela de Rede mostra, só visível
// sem precisar abrir a tela.
function RedeSubmenu({ onNavigate, canSeePlantaBaixa, offline }) {
  return (
    <div className="nav-submenu">
      {canSeePlantaBaixa && (
        <button className="nav-subitem" onClick={() => onNavigate('rede')}>
          <Icon name="building" size={14} />
          <span>Planta baixa</span>
        </button>
      )}
      <button className="nav-subitem" onClick={() => onNavigate('rede')}>
        <Icon name="wifi" size={14} />
        <span>Dispositivos offline</span>
        {offline > 0 && <span className="nav-subitem-badge danger">{offline}</span>}
      </button>
    </div>
  );
}

function InterfoneSubmenu({ onNavigate, offline }) {
  return (
    <div className="nav-submenu">
      <button className="nav-subitem" onClick={() => onNavigate('interfone')}>
        <Icon name="phone" size={14} />
        <span>Ramais offline</span>
        {offline > 0 && <span className="nav-subitem-badge danger">{offline}</span>}
      </button>
    </div>
  );
}

const ACESSO_SUBMENU_LIMIT = 8;

// Nome de cada porteiro/portão cadastrado com um botão de abrir do lado —
// só pra quem tem permissão de abrir aquele equipamento específico
// (mesma regra "canOpen" já usada na tela de Controle de acesso), sem
// precisar entrar na tela pra isso.
function AcessoSubmenu({ onNavigate, onOpenDevice, devices }) {
  const toast = useToast();
  const [openingId, setOpeningId] = useState(null);

  async function handleOpen(e, device) {
    e.stopPropagation();
    setOpeningId(device.id);
    try {
      await api.accessDevices.openDoor(device.id);
      toast(`"${device.name}" aberto.`);
    } catch (err) {
      toast(`Falha ao abrir: ${err.message}`, 'error');
    } finally {
      setOpeningId(null);
    }
  }

  if (devices.length === 0) {
    return (
      <div className="nav-submenu">
        <button className="nav-subitem" onClick={() => onNavigate('acesso')}>
          <Icon name="plus" size={14} />
          <span>Cadastrar equipamento</span>
        </button>
      </div>
    );
  }

  return (
    <div className="nav-submenu">
      {devices.slice(0, ACESSO_SUBMENU_LIMIT).map((d) => (
        <div key={d.id} className="nav-subitem-device">
          <button className="nav-subitem-name" onClick={() => (onOpenDevice ? onOpenDevice(d) : onNavigate('acesso'))} title={d.name}>
            <span className={`nav-subitem-dot ${d.lastStatus === 'online' ? 'online' : d.lastStatus === 'offline' ? 'offline' : ''}`} />
            <span className="nav-subitem-name-text">{d.name}</span>
          </button>
          {d.canOpen && (
            <button
              className="nav-subitem-open-btn"
              onClick={(e) => handleOpen(e, d)}
              disabled={openingId === d.id}
              title={`Abrir ${d.name}`}
              aria-label={`Abrir ${d.name}`}
            >
              {openingId === d.id ? <span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> : <Icon name="key" size={13} />}
            </button>
          )}
        </div>
      ))}
      {devices.length > ACESSO_SUBMENU_LIMIT && (
        <button className="nav-subitem nav-subitem-more" onClick={() => onNavigate('acesso')}>
          <span>Ver todos ({devices.length})</span>
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ branding, view, onNavigate, onOpenDevice, can, isOwner, open, onClose }) {
  const [expanded, setExpanded] = useState({});
  const [redeOffline, setRedeOffline] = useState(0);
  const [interfoneOffline, setInterfoneOffline] = useState(0);
  const [acessoDevices, setAcessoDevices] = useState([]);

  const hasRede = can('rede');
  const hasInterfone = can('interfone');
  const hasAcesso = can('acesso');

  // Mesmo intervalo de polling já usado no resto do Portal — os números do
  // submenu (offline, status de cada porteiro) ficam ao vivo mesmo com o
  // menu fechado, prontos quando a pessoa expandir.
  useEffect(() => {
    if (!hasRede) return;
    function load() {
      api.rede
        .summary()
        .then((s) => setRedeOffline(s?.offline ?? 0))
        .catch(() => {});
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [hasRede]);

  useEffect(() => {
    if (!hasInterfone) return;
    function load() {
      api.interfone
        .extensionsSummary()
        .then((s) => setInterfoneOffline(s?.offline ?? 0))
        .catch(() => {});
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [hasInterfone]);

  useEffect(() => {
    if (!hasAcesso) return;
    function load() {
      api.accessDevices.list().then(setAcessoDevices).catch(() => {});
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [hasAcesso]);

  function toggleExpanded(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function renderSubmenu(key) {
    if (key === 'rede') {
      return <RedeSubmenu onNavigate={onNavigate} canSeePlantaBaixa={can('rede.plantaBaixa')} offline={redeOffline} />;
    }
    if (key === 'interfone') {
      return <InterfoneSubmenu onNavigate={onNavigate} offline={interfoneOffline} />;
    }
    if (key === 'acesso') {
      return <AcessoSubmenu onNavigate={onNavigate} onOpenDevice={onOpenDevice} devices={acessoDevices} />;
    }
    return null;
  }

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
            <div key={item.key}>
              <div className="nav-item-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <NavButton item={item} active={view === item.key} onNavigate={onNavigate} />
                </div>
                {SUBMENU_KEYS.has(item.key) && (
                  <button
                    className="nav-expand-btn"
                    onClick={() => toggleExpanded(item.key)}
                    aria-label={expanded[item.key] ? `Recolher ${item.label}` : `Expandir ${item.label}`}
                  >
                    <Icon name={expanded[item.key] ? 'chevronDown' : 'chevronRight'} size={14} />
                  </button>
                )}
              </div>
              {SUBMENU_KEYS.has(item.key) && expanded[item.key] && renderSubmenu(item.key)}
            </div>
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
