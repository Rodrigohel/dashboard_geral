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
    },
  },

  system: {
    health: () => request('/api/system/health'),
  },

  settings: {
    getGateways: () => request('/api/settings/gateways'),
    saveGateway: (moduleKey, payload) => request(`/api/settings/gateways/${moduleKey}`, { method: 'PUT', body: payload }),
    testGateway: (moduleKey) => request(`/api/settings/gateways/${moduleKey}/test-connection`, { method: 'POST' }),
  },
};
