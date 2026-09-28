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

// Notificação push (opt-in, liga em Configurações > Notificações push) —
// avisos de infraestrutura/segurança (porteiro caiu, trava de força
// bruta). Corpo já vem pronto do backend em JSON; sem 'data' (payload
// vazio ou formato inesperado), mostra um aviso genérico em vez de falhar
// silenciosamente.
self.addEventListener('push', (event) => {
  let payload = { title: 'Portal', body: 'Você tem uma notificação nova.' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // mantém o genérico
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/api/branding/pwa-icon',
      tag: payload.tag,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
