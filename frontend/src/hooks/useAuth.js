import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../api/client.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const { token, user: u } = await api.login(username, password);
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const can = useCallback(
    (moduleKey) => !!user && (user.role === 'owner' || user.modules?.includes(moduleKey)),
    [user]
  );

  return { user, checking, login, logout, isAuthenticated: !!user, can };
}
