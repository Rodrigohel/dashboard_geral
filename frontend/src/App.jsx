import { useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { useTheme } from './hooks/useTheme.js';
import LoadingScreen from './components/LoadingScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import ModuleLink from './pages/ModuleLink.jsx';
import AccessControl from './pages/AccessControl/index.jsx';
import UsersAdmin from './pages/UsersAdmin/index.jsx';
import Settings from './pages/Settings.jsx';
import ServerHealth from './pages/ServerHealth.jsx';

export default function App() {
  const { user, checking, login, logout, can } = useAuth();
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);

  if (checking) return <LoadingScreen />;
  if (!user) return <Login onLogin={login} />;

  const isOwner = user.role === 'owner';

  function navigate(next) {
    setView(next);
    setMenuOpen(false);
  }

  function renderView() {
    switch (view) {
      case 'rede':
        return can('rede') ? <ModuleLink moduleKey="rede" isOwner={isOwner} onNavigate={navigate} /> : <NoAccess />;
      case 'interfone':
        return can('interfone') ? <ModuleLink moduleKey="interfone" isOwner={isOwner} onNavigate={navigate} /> : <NoAccess />;
      case 'acesso':
        return can('acesso') ? <AccessControl isOwner={isOwner} /> : <NoAccess />;
      case 'usuarios':
        return isOwner ? <UsersAdmin currentUserId={user.id} /> : <NoAccess />;
      case 'servidor':
        return isOwner ? <ServerHealth /> : <NoAccess />;
      case 'configuracoes':
        return isOwner ? <Settings /> : <NoAccess />;
      default:
        return <Home user={user} onNavigate={navigate} />;
    }
  }

  return (
    <div className="shell">
      <Sidebar view={view} onNavigate={navigate} can={can} isOwner={isOwner} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div>
        <TopBar view={view} user={user} onLogout={logout} theme={theme} setTheme={setTheme} onMenuClick={() => setMenuOpen(true)} />
        <main className="content">{renderView()}</main>
      </div>
    </div>
  );
}

function NoAccess() {
  return (
    <div className="surface" style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
      Você não tem permissão para ver esta página.
    </div>
  );
}
