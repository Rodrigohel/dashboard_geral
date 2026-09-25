import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { useTheme } from './hooks/useTheme.js';
import { useBranding } from './hooks/useBranding.js';
import { applyAccentColor } from './theme/applyAccent.js';
import LoadingScreen from './components/LoadingScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import RedeDashboard from './pages/RedeDashboard.jsx';
import InterfoneDashboard from './pages/InterfoneDashboard.jsx';
import AccessControl from './pages/AccessControl/index.jsx';
import UsersAdmin from './pages/UsersAdmin/index.jsx';
import Settings from './pages/Settings.jsx';
import ServerHealth from './pages/ServerHealth.jsx';
import AuditLog from './pages/AuditLog.jsx';

export default function App() {
  const { user, checking, login, logout, can } = useAuth();
  const { theme, setTheme } = useTheme();
  const branding = useBranding();
  const [view, setView] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [acessoDevice, setAcessoDevice] = useState(null);

  useEffect(() => {
    document.title = branding.name;
  }, [branding.name]);

  useEffect(() => {
    applyAccentColor(branding.accentColor);
  }, [branding.accentColor]);

  // `view` mora aqui em cima (não desmonta ao deslogar) — sem resetar no
  // login, quem relogava depois de expirar a sessão caía direto na última
  // tela que estava aberta antes, em vez de voltar pro Início.
  async function handleLogin(username, password) {
    await login(username, password);
    setView('home');
  }

  if (checking) return <LoadingScreen />;
  if (!user) return <Login branding={branding} onLogin={handleLogin} />;

  const isOwner = user.role === 'owner';

  function navigate(next) {
    setView(next);
    setMenuOpen(false);
  }

  // Clicou num equipamento direto na tela Início — abre ele já na tela de
  // usuários do "Controle de acesso", sem precisar procurar de novo na lista.
  function openDeviceFromHome(device) {
    setAcessoDevice(device);
    setView('acesso');
    setMenuOpen(false);
  }

  function renderView() {
    switch (view) {
      case 'rede':
        return can('rede') ? <RedeDashboard can={can} /> : <NoAccess />;
      case 'interfone':
        return can('interfone') ? <InterfoneDashboard /> : <NoAccess />;
      case 'acesso':
        return can('acesso') ? (
          <AccessControl isOwner={isOwner} initialDevice={acessoDevice} onInitialDeviceHandled={() => setAcessoDevice(null)} />
        ) : (
          <NoAccess />
        );
      case 'usuarios':
        return isOwner ? <UsersAdmin currentUserId={user.id} /> : <NoAccess />;
      case 'servidor':
        return isOwner ? <ServerHealth /> : <NoAccess />;
      case 'auditoria':
        return isOwner ? <AuditLog /> : <NoAccess />;
      case 'configuracoes':
        return isOwner ? <Settings /> : <NoAccess />;
      default:
        return <Home user={user} onNavigate={navigate} onOpenDevice={openDeviceFromHome} />;
    }
  }

  return (
    <div className="shell">
      <Sidebar branding={branding} view={view} onNavigate={navigate} can={can} isOwner={isOwner} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="shell-main">
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
