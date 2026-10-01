// Captura 'beforeinstallprompt' o mais cedo possível — importado direto no
// main.jsx, então o listener já existe antes de qualquer componente (mesmo
// a tela de Login, antes do usuário entrar). Esse evento dispara só uma vez
// por carregamento de página: perder ele aqui (ex.: só escutando depois do
// InstallAppBanner montar, que só existe pós-login) significa não ter mais
// como oferecer instalação até a pessoa recarregar a página sozinha.
let deferredPrompt = null;
const listeners = new Set();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  listeners.forEach((fn) => fn(deferredPrompt));
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  listeners.forEach((fn) => fn(null));
});

export function getDeferredInstallPrompt() {
  return deferredPrompt;
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
  listeners.forEach((fn) => fn(null));
}

// Retorna uma função de limpeza, no padrão de um useEffect.
export function onDeferredInstallPromptChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
