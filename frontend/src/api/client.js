const TOKEN_KEY = 'portal_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = data?.error || `Erro ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/api/auth/me'),
  modules: () => request('/api/modules'),

  users: {
    list: () => request('/api/users'),
    create: (payload) => request('/api/users', { method: 'POST', body: payload }),
    update: (id, payload) => request(`/api/users/${id}`, { method: 'PUT', body: payload }),
    remove: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
  },

  accessDevices: {
    list: () => request('/api/access/devices'),
    create: (payload) => request('/api/access/devices', { method: 'POST', body: payload }),
    update: (id, payload) => request(`/api/access/devices/${id}`, { method: 'PUT', body: payload }),
    remove: (id) => request(`/api/access/devices/${id}`, { method: 'DELETE' }),
    testConnection: (id) => request(`/api/access/devices/${id}/test-connection`, { method: 'POST' }),
    searchUsers: (q) => request(`/api/access/devices/search-users?q=${encodeURIComponent(q)}`),

    users: {
      list: (deviceId) => request(`/api/access/devices/${deviceId}/users`),
      create: (deviceId, payload) => request(`/api/access/devices/${deviceId}/users`, { method: 'POST', body: payload }),
      update: (deviceId, userId, payload) =>
        request(`/api/access/devices/${deviceId}/users/${userId}`, { method: 'PUT', body: payload }),
      remove: (deviceId, userId) => request(`/api/access/devices/${deviceId}/users/${userId}`, { method: 'DELETE' }),
      setPhoto: (deviceId, userId, file) => {
        const form = new FormData();
        form.append('photo', file);
        return request(`/api/access/devices/${deviceId}/users/${userId}/photo`, { method: 'POST', body: form, isForm: true });
      },
      // Não usa `request()`: a resposta é a imagem em si (binário), não
      // JSON — e um <img src="..."> puro não manda o header Authorization,
      // por isso buscamos com fetch manual e viramos um blob URL local.
      getPhotoBlobUrl: async (deviceId, userId) => {
        const token = getToken();
        const res = await fetch(`/api/access/devices/${deviceId}/users/${userId}/photo`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          let message = `Erro ${res.status}`;
          try {
            message = (await res.json()).error || message;
          } catch {
            // resposta sem corpo JSON — mantém a mensagem genérica
          }
          throw new Error(message);
        }
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      },
    },
  },

  system: {
    health: () => request('/api/system/health'),
    healthHistory: () => request('/api/system/health/history'),
  },

  audit: {
    logins: () => request('/api/audit/logins'),
  },

  // Painel de Interfone consumido nativamente pelo Portal, igual o de Rede —
  // só leitura (ramais, chamadas): cadastro/config continuam no painel
  // original. Respostas de lá vêm envelopadas em `{ data, source }` — os
  // métodos abaixo já devolvem só `data` pra ficar igual ao resto do client.
  interfone: {
    extensionsSummary: () => request('/gateway/interfone/api/extensions/summary'),
    extensions: () => request('/gateway/interfone/api/extensions').then((r) => r.data),
    extensionDetail: (number) => request(`/gateway/interfone/api/extensions/${number}`),
    activeCalls: () => request('/gateway/interfone/api/calls/active').then((r) => r.data),
    callHistory: ({ q = '', page = 1, pageSize = 10 } = {}) =>
      request(`/gateway/interfone/api/calls/history?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`),
    todaySummary: () => request('/gateway/interfone/api/calls/today-summary'),
    callsSummary: (range = '7d') => request(`/gateway/interfone/api/calls/summary?range=${range}`),
    missedToday: () => request('/gateway/interfone/api/calls/missed-today').then((r) => r.data),
    alerts: () => request('/gateway/interfone/api/alerts'),
  },

  // Painel de Rede consumido nativamente pelo Portal (sem iframe) via
  // gateway — mesma origem, mesmo token, sem segunda tela de login.
  rede: {
    summary: () => request('/gateway/rede/api/devices/summary'),
    devices: () => request('/gateway/rede/api/devices'),
    // Detalhe completo (senha descriptografada, checagens recentes,
    // uptime7d) só vem no GET de UM dispositivo — a listagem não traz isso
    // de propósito (ver devicesService.js do painel de Rede).
    device: (id) => request(`/gateway/rede/api/devices/${id}`),
    uptimeHeatmap: (id, days = 90) => request(`/gateway/rede/api/devices/${id}/uptime-heatmap?days=${days}`),
    alerts: () => request('/gateway/rede/api/alerts'),
    floors: () => request('/gateway/rede/api/floors'),
    // Não dá pra usar <img src="/gateway/rede/..."> puro: o gateway exige
    // Authorization, e um <img> comum não manda esse header — o link
    // "quebra" (404/401, ícone de imagem quebrada). Busca autenticada com
    // fetch e vira blob local, igual já fazemos com a foto do porteiro.
    getFloorImageBlobUrl: async (imageUrl) => {
      const token = getToken();
      const res = await fetch(`/gateway/rede${imageUrl}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Não foi possível carregar a imagem (erro ${res.status}).`);
      return URL.createObjectURL(await res.blob());
    },
    networkHistory: (hours = 24) => request(`/gateway/rede/api/stats/network-history?hours=${hours}`),
    flappiest: () => request('/gateway/rede/api/stats/flappiest?hours=24&limit=5'),
    history: () => request('/gateway/rede/api/history?limit=100'),
    setFloorPosition: (deviceId, floorId, x, y) =>
      request(`/gateway/rede/api/devices/${deviceId}/floor-position`, { method: 'POST', body: { floorId, x, y } }),
    executiveReportBlob: async (days = 7) => {
      const res = await fetch(`/gateway/rede/api/stats/report/executive?days=${days}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
      return res.blob();
    },
    scanNetwork: () => request('/gateway/rede/api/devices/scan', { method: 'POST', body: {} }),
  },

  branding: {
    get: () => request('/api/branding'),
    save: ({ name, logoFile, accentColor }) => {
      const form = new FormData();
      form.append('name', name);
      if (logoFile) form.append('logo', logoFile);
      if (accentColor !== undefined) form.append('accentColor', accentColor);
      return request('/api/branding', { method: 'PUT', body: form, isForm: true });
    },
  },

  settings: {
    getGateways: () => request('/api/settings/gateways'),
    saveGateway: (moduleKey, payload) => request(`/api/settings/gateways/${moduleKey}`, { method: 'PUT', body: payload }),
    testGateway: (moduleKey) => request(`/api/settings/gateways/${moduleKey}/test-connection`, { method: 'POST' }),
  },
};
