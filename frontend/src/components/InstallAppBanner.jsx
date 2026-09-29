import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

const DISMISS_KEY = 'portal_install_banner_dismissed_until';
const DISMISS_DAYS = 14;

function isStandalone() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
}

// iPadOS 13+ finge ser um Mac no user-agent — só o toque múltiplo denuncia.
function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// No Android/Chrome o navegador decide sozinho quando oferecer a
// instalação (dispara 'beforeinstallprompt') — a gente só guarda o evento
// pra poder mostrar nosso próprio botão em vez do banner nativo do Chrome.
// No iPhone a Apple não expõe NENHUMA forma de disparar isso por código —
// o único caminho é manual (Compartilhar > Adicionar à Tela de Início), por
// isso o aviso ali é só instrução, sem botão.
export default function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      setDismissed(Date.now() < until);
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    function handleBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function handleInstalled() {
      setDeferredPrompt(null);
      dismiss();
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // navegador sem localStorage disponível (aba anônima restrita) — só não persiste, sem quebrar
    }
    setDismissed(true);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }

  const ios = isIos();

  if (dismissed || isStandalone()) return null;
  // No iPhone sempre vale mostrar a instrução (não tem como saber se o
  // navegador "aceitaria" instalar) — fora do iOS, só mostra se o próprio
  // navegador sinalizou que a instalação está disponível.
  if (!ios && !deferredPrompt) return null;

  return (
    <div
      className="surface"
      style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, borderLeft: '3px solid var(--accent-500)', marginBottom: 16 }}
    >
      <Icon name="download" size={20} style={{ color: 'var(--accent-400)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Instale o Portal como app</div>
        {ios ? (
          <p className="field-hint" style={{ marginTop: 2 }}>
            Toque em <strong>Compartilhar</strong> (ícone com a seta pra cima) e depois em{' '}
            <strong>"Adicionar à Tela de Início"</strong>.
          </p>
        ) : (
          <p className="field-hint" style={{ marginTop: 2 }}>Acesso mais rápido, em tela cheia, sem a barra do navegador.</p>
        )}
      </div>
      {!ios && (
        <button className="btn btn-primary btn-sm" onClick={handleInstallClick} disabled={installing}>
          {installing ? <span className="spinner" /> : 'Instalar'}
        </button>
      )}
      <button className="btn btn-ghost btn-icon btn-sm" onClick={dismiss} aria-label="Fechar aviso" title="Fechar">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
