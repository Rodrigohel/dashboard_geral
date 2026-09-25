// Service worker mínimo — só o necessário pra instalabilidade (Adicionar à
// tela inicial / abrir como app, sem a barra do navegador), sem cache
// nenhum de propósito. Esse Portal mostra dados ao vivo (status de
// equipamento, controle de acesso físico de porteiros/portões) — cachear
// qualquer coisa aqui arriscaria a tela mostrar informação desatualizada
// sobre um porteiro ou uma porta, então toda requisição passa direto pra
// rede, exatamente como se não houvesse service worker nenhum.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Sem respondWith — deixa o navegador tratar a requisição normalmente.
});
