import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, uid } from '../lib/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mahi-token');
    const saved = localStorage.getItem('mahi-user');
    if (token && saved) {
      let parsed = null;
      try {
        parsed = JSON.parse(saved);
        if (parsed) setUser(parsed);
      } catch {}

      api('/auth/me', { headers: { 'x-auth-token': token } })
        .then(d => {
          if (d?.user) {
            setUser(d.user);
            localStorage.setItem('mahi-user', JSON.stringify({ ...d.user, token }));
          }
        })
        .catch((err) => {
          if (err?.status === 401 || err?.message === 'auth_required' || err?.message === 'Login diperlukan' || err?.message === 'Sesi habis, login ulang') {
            localStorage.removeItem('mahi-token');
            localStorage.removeItem('mahi-user');
            setUser(null);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const storeUser = (user) => {
    const token = user.token || localStorage.getItem('mahi-token');
    if (user.id) localStorage.setItem('mahi-uid', user.id);
    localStorage.setItem('mahi-user', JSON.stringify({ id: user.id, username: user.username, display_name: user.display_name, role: user.role, token }));
    setUser(user);
  };

  const login = useCallback(async (username, password) => {
    const d = await api('/auth/login', 'POST', { username, password });
    localStorage.setItem('mahi-token', d.user.token);
    storeUser(d.user);
    const anonId = uid();
    api('/auth/link', 'POST', { token: d.user.token, anonymousId: anonId }).catch(() => {});
    return d.user;
  }, []);

  const register = useCallback(async (username, password) => {
    const d = await api('/auth/register', 'POST', { username, password });
    localStorage.setItem('mahi-token', d.user.token);
    storeUser(d.user);
    const anonId = uid();
    api('/auth/link', 'POST', { token: d.user.token, anonymousId: anonId }).catch(() => {});
    return d.user;
  }, []);

  const googleLogin = useCallback(async (credential, clientId, profile) => {
    const anonId = uid();
    const d = await api('/auth/google', 'POST', { credential, profile, clientId, anonymousId: anonId });
    localStorage.setItem('mahi-token', d.user.token);
    storeUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('mahi-token');
    localStorage.removeItem('mahi-user');
    setUser(null);
  }, []);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('mahi-token');
    return token ? { 'x-auth-token': token } : {};
  }, []);

  const userId = user?.id || uid();

  return (
    <AuthContext.Provider value={{ user, loading, login, register, googleLogin, logout, userId, authHeaders, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
