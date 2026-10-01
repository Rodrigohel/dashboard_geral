import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { getDeferredInstallPrompt, onDeferredInstallPromptChange, clearDeferredInstallPrompt } from '../utils/installPrompt.js';

const DISMISS_KEY = 'portal_install_banner_dismissed_until';
const DISMISS_DAYS = 14;

function isStandalone() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
}

// iPadOS 13+ finge ser um Mac no user-agent — só o toque múltiplo denuncia.
function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// iPhone/iPad: a Apple não expõe NENHUMA API pra oferecer instalação por
// código (nem 'beforeinstallprompt', nem nada equivalente) — o único
// caminho é o passo a passo manual abaixo.
//
// Android/Desktop (Chrome, Edge e afins): o navegador dispara
// 'beforeinstallprompt' quando julga o Portal instalável, mas por padrão só
// mostra um ícone discreto na barra de endereço — fácil de nunca notar, e
// foi exatamente a causa de "o instalador não funciona" aí: não tinha bug
// nenhum, só não existia NENHUM botão de instalar dentro do próprio Portal.
// `preventDefault` segura esse prompt nativo pra chamar na hora que a
// pessoa clicar no nosso aviso, em vez de depender dela achar o ícone
// sozinha. Em navegadores sem suporte a esse evento (ex.: Firefox), o
// Portal simplesmente não oferece instalação — não existe outro meio.
export default function InstallAppBanner() {
  const [dismissed, setDismissed] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(getDeferredInstallPrompt);
  const [installing, setInstalling] = useState(false);
  const ios = isIos();

  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
      setDismissed(Date.now() < until);
    } catch {
      setDismissed(false);
    }
  }, []);

  // O evento pode ter disparado antes desse componente existir (ex.: ainda
  // na tela de Login) — installPrompt.js já guardou ele, só precisamos ler
  // o valor atual (acima) e escutar mudanças daqui pra frente.
  useEffect(() => onDeferredInstallPromptChange(setDeferredPrompt), []);

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
    } catch {
      // usuário cancelou o prompt do próprio navegador — nada a fazer
    } finally {
      // Um prompt já usado dá exceção se chamado de novo — limpa o
      // singleton (não só o estado local) pra qualquer outra instância do
      // banner (ex.: tela de Login) também parar de oferecê-lo.
      clearDeferredInstallPrompt();
      setInstalling(false);
    }
  }

  if (dismissed || isStandalone()) return null;
  // No Android/Desktop só mostra o aviso quando o navegador de fato ofereceu
  // o evento — sem ele não tem como instalar por aqui (ver comentário acima).
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
          <p className="field-hint" style={{ marginTop: 2 }}>
            Acesso mais rápido, em tela cheia, sem a barra do navegador.
          </p>
        )}
      </div>
      {!ios && (
        <button className="btn btn-primary btn-sm" onClick={handleInstallClick} disabled={installing}>
          {installing ? <span className="spinner" /> : <Icon name="download" size={15} />} Instalar
        </button>
      )}
      <button className="btn btn-ghost btn-icon btn-sm" onClick={dismiss} aria-label="Fechar aviso" title="Fechar">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
