import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { api } from '../api/client.js';

const PAGES = [
  { key: 'home', label: 'Início', icon: 'home', module: null },
  { key: 'rede', label: 'Rede', icon: 'network', module: 'rede' },
  { key: 'interfone', label: 'Interfone', icon: 'phone', module: 'interfone' },
  { key: 'acesso', label: 'Controle de acesso', icon: 'shieldFace', module: 'acesso' },
  { key: 'usuarios', label: 'Usuários', icon: 'users', ownerOnly: true },
  { key: 'servidor', label: 'Saúde do servidor', icon: 'server', ownerOnly: true },
  { key: 'auditoria', label: 'Auditoria', icon: 'key', ownerOnly: true },
  { key: 'configuracoes', label: 'Configurações', icon: 'settings', ownerOnly: true },
];

// Busca universal (Ctrl/Cmd+K) — junta páginas do menu com entidades reais
// (porteiros, ramais, equipamentos de rede) num resultado só. As listas de
// entidade só são buscadas na hora que a busca abre (não no carregamento da
// tela toda), e só se o usuário tiver o módulo correspondente.
export default function CommandPalette({ open, onClose, can, isOwner, onNavigate, onOpenDevice }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [accessDevices, setAccessDevices] = useState(null);
  const [redeDevices, setRedeDevices] = useState(null);
  const [extensions, setExtensions] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    if (can('acesso') && accessDevices === null) {
      api.accessDevices.list().then(setAccessDevices).catch(() => setAccessDevices([]));
    }
    if (can('rede') && redeDevices === null) {
      api.rede.devices().then((r) => setRedeDevices(r.data || [])).catch(() => setRedeDevices([]));
    }
    if (can('interfone') && extensions === null) {
      api.interfone.extensions().then(setExtensions).catch(() => setExtensions([]));
    }
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (s) => !needle || (s || '').toLowerCase().includes(needle);

    const pageResults = PAGES.filter((p) => (p.ownerOnly ? isOwner : !p.module || can(p.module)))
      .filter((p) => matches(p.label))
      .map((p) => ({ id: `page-${p.key}`, icon: p.icon, title: p.label, subtitle: 'Página', onSelect: () => onNavigate(p.key) }));

    const deviceResults = (accessDevices || [])
      .filter((d) => matches(d.name) || matches(d.location))
      .map((d) => ({
        id: `device-${d.id}`,
        icon: 'shieldFace',
        title: d.name,
        subtitle: d.location || 'Controle de acesso',
        onSelect: () => onOpenDevice(d),
      }));

    const extensionResults = (extensions || [])
      .filter((e) => matches(e.number) || matches(e.name))
      .map((e) => ({
        id: `ext-${e.number}`,
        icon: 'phone',
        title: `Ramal ${e.number}`,
        subtitle: e.name || 'Interfone',
        onSelect: () => onNavigate('interfone'),
      }));

    const redeResults = (redeDevices || [])
      .filter((d) => matches(d.name) || matches(d.ip) || matches(d.location))
      .map((d) => ({
        id: `rede-${d.id}`,
        icon: 'network',
        title: d.name,
        subtitle: d.ip || 'Rede',
        onSelect: () => onNavigate('rede'),
      }));

    return [
      { label: 'Páginas', items: pageResults.slice(0, 8) },
      { label: 'Porteiros', items: deviceResults.slice(0, 6) },
      { label: 'Ramais', items: extensionResults.slice(0, 6) },
      { label: 'Equipamentos de rede', items: redeResults.slice(0, 6) },
    ].filter((g) => g.items.length > 0);
  }, [query, accessDevices, redeDevices, extensions, isOwner, can, onNavigate, onOpenDevice]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    if (activeIndex >= flatItems.length) setActiveIndex(0);
  }, [flatItems.length, activeIndex]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(flatItems.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[activeIndex];
        if (item) {
          onClose();
          item.onSelect();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, flatItems, activeIndex, onClose]);

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk-box">
        <div className="cmdk-input-row">
          <Icon name="search" size={17} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Buscar porteiro, ramal, equipamento, página..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
          />
          <span className="field-hint" style={{ flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
            esc
          </span>
        </div>
        <div className="cmdk-results">
          {flatItems.length === 0 ? (
            <div className="cmdk-empty">Nada encontrado para "{query}".</div>
          ) : (
            groups.map((g) => (
              <div key={g.label}>
                <div className="cmdk-group-label">{g.label}</div>
                {g.items.map((item) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  return (
                    <div
                      key={item.id}
                      className={`cmdk-item ${idx === activeIndex ? 'active' : ''}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        onClose();
                        item.onSelect();
                      }}
                    >
                      <div className="cmdk-item-icon">
                        <Icon name={item.icon} size={15} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                        <div className="field-hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.subtitle}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
