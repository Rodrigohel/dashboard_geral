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

// Só pro iPhone/iPad: a Apple não expõe NENHUMA API pra oferecer instalação
// por código (nem 'beforeinstallprompt', nem nada equivalente) — o único
// caminho é o passo a passo manual abaixo. No Android/Chrome não precisa de
// nada daqui: o próprio navegador já mostra seu banner flutuante de
// instalação sozinho, sem precisar de UI própria do Portal pra isso.
export default function InstallAppBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      setDismissed(Date.now() < until);
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // navegador sem localStorage disponível (aba anônima restrita) — só não persiste, sem quebrar
    }
    setDismissed(true);
  }

  if (dismissed || isStandalone() || !isIos()) return null;

  return (
    <div
      className="surface"
      style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, borderLeft: '3px solid var(--accent-500)', marginBottom: 16 }}
    >
      <Icon name="download" size={20} style={{ color: 'var(--accent-400)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Instale o Portal como app</div>
        <p className="field-hint" style={{ marginTop: 2 }}>
          Toque em <strong>Compartilhar</strong> (ícone com a seta pra cima) e depois em{' '}
          <strong>"Adicionar à Tela de Início"</strong>.
        </p>
      </div>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={dismiss} aria-label="Fechar aviso" title="Fechar">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
