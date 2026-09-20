import { useState, useRef, useEffect } from 'react';
import Icon from './Icon.jsx';

const TITLES = {
  home: ['Início', 'Visão geral de tudo o que você administra'],
  rede: ['Rede', 'Monitoramento de câmeras, NVRs e equipamentos de rede'],
  interfone: ['Interfone', 'Ramais, chamadas e saúde do PBX'],
  acesso: ['Controle de acesso', 'Porteiros e reconhecimento facial'],
  usuarios: ['Usuários', 'Contas do Portal e permissões'],
  servidor: ['Saúde do servidor', 'CPU, memória, disco e temperatura desta máquina'],
  configuracoes: ['Configurações', 'Integrações e preferências gerais'],
};

export default function TopBar({ view, user, onLogout, theme, setTheme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [title, subtitle] = TITLES[view] || ['Portal', ''];

  useEffect(() => {
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const initials = (user?.displayName || user?.username || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        <div className="topbar-subtitle">{subtitle}</div>
      </div>

      <div className="topbar-actions">
        <div className="theme-toggle">
          <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} aria-label="Tema escuro">
            <Icon name="moon" size={15} />
          </button>
          <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} aria-label="Tema claro">
            <Icon name="sun" size={15} />
          </button>
        </div>

        <div className="user-menu" ref={ref} onClick={() => setOpen((v) => !v)} style={{ position: 'relative' }}>
          <div style={{ textAlign: 'right' }}>
            <div className="user-menu-name">{user?.displayName}</div>
            <div className="user-menu-role">{user?.role === 'owner' ? 'Administrador' : 'Usuário'}</div>
          </div>
          <div className="avatar">{initials}</div>

          {open && (
            <div
              className="surface"
              style={{
                position: 'absolute',
                top: '110%',
                right: 0,
                minWidth: 160,
                padding: 6,
                zIndex: 20,
              }}
            >
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={onLogout}>
                <Icon name="logout" size={16} />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
