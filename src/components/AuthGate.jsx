import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { Check } from 'lucide-react';
import { api, uid } from '../lib/client';
import { AlertIcon } from './icons';
import './AuthGate.css';

async function doLogin(clientId, credential, profile) {
  const anonId = uid();
  const d = await api('/auth/google', 'POST', {
    credential,
    profile,
    clientId,
    anonymousId: anonId,
  });
  const userData = {
    id: d.user.id,
    username: d.user.username,
    display_name: d.user.display_name,
    role: d.user.role || 'user',
    token: d.user.token,
  };
  localStorage.setItem('mahi-token', d.user.token);
  localStorage.setItem('mahi-user', JSON.stringify(userData));
  return userData;
}

export function GoogleLoginPage({ onSuccess, standalone }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [agreed, setAgreed] = useState(true);
  const [mounted, setMounted] = useState(false);
  const promptShown = useRef(false);

  const clientIdRef = useRef('843035088451-oftajg1gqg6e2tks7gp0tfuu27028769.apps.googleusercontent.com');
  const isNative = Capacitor.isNativePlatform();

  // Handler tunggal untuk kedua mode (embedded/AuthGate & standalone route /login).
  // Standalone tidak dikasih onSuccess prop → tanpa handler ini user stuck di /login
  // meski localStorage sudah diisi oleh doLogin().
  const finishLogin = useCallback((userData) => {
    if (onSuccess) {
      onSuccess(userData);
    }
    window.dispatchEvent(new CustomEvent('mahi:auth-changed', { detail: userData }));
    if (standalone) {
      navigate('/', { replace: true });
    }
  }, [onSuccess, standalone, navigate]);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api('/config')
      .then(config => {
        if (cancelled) return;
        clientIdRef.current = config?.googleClientId || "843035088451-oftajg1gqg6e2tks7gp0tfuu27028769.apps.googleusercontent.com";
        initAll();
      }).catch(() => {
        if (cancelled) return;
        initAll();
      });

    function initAll() {
      if (isNative) {
        GoogleSignIn.initialize({
          clientId: clientIdRef.current,
        }).catch(err => console.warn('[GoogleSignIn Init Warn]:', err));
        if (!cancelled) setReady(true);
      } else {
        doInitWeb();
      }
    }

    function doInitWeb() {
      if (window.google?.accounts) {
        if (!cancelled) setReady(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => { if (!cancelled) setReady(true); };
      script.onerror = () => { if (!cancelled) setReady(true); };
      document.head.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [isNative]);

  const handleOneTapResponse = useCallback(async (response) => {
    if (!response?.credential) return;
    setBusy(true);
    setError('');
    try {
      const userData = await doLogin(clientIdRef.current, response.credential);
      finishLogin(userData);
    } catch (err) {
      setError(err?.message || 'Gagal login dengan Google');
      setBusy(false);
    }
  }, [finishLogin]);

  useEffect(() => {
    if (isNative) return;
    if (!ready || !window.google?.accounts?.id || promptShown.current) return;
    promptShown.current = true;
    try {
      window.google.accounts.id.initialize({
        client_id: clientIdRef.current,
        cancel_on_tap_outside: false,
        callback: handleOneTapResponse,
        use_fedcm_for_prompt: false,
      });
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
          console.warn('[Google One Tap Info]:', notification.getNotDisplayedReason?.() || notification.getSkippedReason?.() || 'One Tap suppressed');
        }
      });
    } catch (e) {
      console.error('[AuthGate] Google One Tap init error:', e);
    }
  }, [ready, handleOneTapResponse, isNative]);

  const handleGoogleLogin = async () => {
    if (!agreed) {
      setError('Mohon setujui Syarat & Ketentuan terlebih dahulu.');
      return;
    }
    setError('');
    setBusy(true);

    if (isNative) {
      try {
        await GoogleSignIn.initialize({
          clientId: clientIdRef.current,
        });
        const res = await GoogleSignIn.signIn();
        if (res && (res.idToken || res.accessToken)) {
          const userData = await doLogin(clientIdRef.current, res.idToken, {
            email: res.email,
            name: res.displayName || res.givenName || 'User',
            picture: res.imageUrl,
            sub: res.userId,
          });
          finishLogin(userData);
        } else {
          setError('Gagal mendapatkan token login Google.');
          setBusy(false);
        }
      } catch (err) {
        console.error('[GoogleSignIn Native Error]:', err);
        const errMsg = String(err?.message || err?.code || '');
        if (errMsg.toLowerCase().includes('cancel') || err?.code === 'SIGN_IN_CANCELED' || err?.code === '12501') {
          setBusy(false);
          return;
        }
        setError(err?.message || 'Gagal login dengan Google.');
        setBusy(false);
      }
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      setError('Layanan Google tidak tersedia. Muat ulang halaman.');
      setBusy(false);
      return;
    }

    const popupTimeout = setTimeout(() => {
      setError('Waktu habis. Popup mungkin terblokir, izinkan popup.');
      setBusy(false);
    }, 30000);

    try {
      const tokenClient = oauth2.initTokenClient({
        client_id: clientIdRef.current,
        scope: 'openid email profile',
        callback: async (tokenResponse) => {
          clearTimeout(popupTimeout);
          setBusy(false);
          if (tokenResponse?.error) {
            setError(tokenResponse.error);
            return;
          }
          if (tokenResponse?.access_token) {
            try {
              const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
              });
              const profile = await resp.json();
              const userData = await doLogin(clientIdRef.current, tokenResponse.id_token, profile);
              finishLogin(userData);
            } catch (loginErr) {
              setError(loginErr?.message || 'Gagal verifikasi login');
            }
          }
        },
      });
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      clearTimeout(popupTimeout);
      setError(err?.message || 'Terjadi kesalahan login');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5">
      <div className={`mb-8 flex flex-col items-center gap-3 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <h1 className="font-heading text-2xl tracking-wide text-ink">
          <span className="text-accent">Mahi</span>Stream
        </h1>
      </div>

      <div className={`w-full max-w-sm rounded-2xl border border-line bg-surface p-7 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'}`}>
        <div className="mb-6 text-center">
          <h2 className="text-xl font-extrabold tracking-tight text-ink">Masuk ke MahiStream</h2>
          <p className="mt-1.5 text-sm text-muted">Gunakan akun Google untuk melanjutkan</p>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={busy || !ready}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-elevated px-4 py-3.5 text-sm font-bold text-ink transition hover:bg-line active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {busy || !ready ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                {!ready ? 'Memuat Google...' : 'Memproses...'}
              </span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20">
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                </svg>
                Lanjutkan dengan Google
              </>
            )}
          </button>

        {error && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl bg-red-500/10 p-4 text-xs font-medium text-red-500 border border-red-500/20">
            <div className="flex items-center gap-2 font-bold text-sm text-red-400">
              <AlertIcon size={18} /> [ERR_AUTH_FAIL] Gagal Otentikasi
            </div>
            <p className="text-red-300 leading-relaxed">{error}</p>
          </div>
        )}

        <label className="mt-5 flex items-start gap-3 cursor-pointer">
          <span
            onClick={(e) => { e.preventDefault(); setAgreed((v) => !v); }}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
              agreed ? 'bg-accent border-accent text-white scale-105' : 'border-muted/40 bg-canvas'
            }`}
          >
            {agreed && <Check size={14} strokeWidth={3} />}
          </span>
          <span className="text-xs text-muted leading-[1.55]">
            Saya menyetujui{' '}
            <Link to="/terms" className="font-bold text-ink hover:text-accent transition-colors">Syarat & Ketentuan</Link>{' '}
            serta <span className="font-bold text-ink">Kebijakan Privasi</span> MahiStream.
          </span>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="sr-only" />
        </label>
      </div>

      <p className={`mt-5 text-center text-[11px] text-muted leading-relaxed max-w-xs transition-all duration-700 delay-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        Setiap akun punya riwayat dan bookmark sendiri.
        <br />
        Bukan akun barengan — milikmu, hanya untukmu.
      </p>
    </div>
  );
}

export default function AuthGate({ children }) {
  const location = useLocation();
  const isLoginPath = location.pathname === '/login' || location.pathname === '/auth';
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    let timer = setTimeout(() => {
      let fallbackUser = null;
      try { fallbackUser = JSON.parse(localStorage.getItem('mahi-user') || 'null'); } catch (e) {}
      setState({ loading: false, user: fallbackUser });
    }, 2500);

    const token = localStorage.getItem('mahi-token');
    const userStr = localStorage.getItem('mahi-user');
    let savedUser = null;
    if (userStr) {
      try { savedUser = JSON.parse(userStr); } catch (e) {}
    }

    if (token) {
      if (savedUser) {
        setState({ loading: false, user: savedUser });
      }
      api('/auth/me', { headers: { 'x-auth-token': token } })
        .then(d => {
          clearTimeout(timer);
          if (d?.user) {
            const userData = {
              id: d.user.id,
              username: d.user.username,
              display_name: d.user.display_name,
              role: d.user.role,
              token,
            };
            localStorage.setItem('mahi-user', JSON.stringify(userData));
            setState({ loading: false, user: userData });
          } else if (savedUser) {
            setState({ loading: false, user: savedUser });
          } else {
            const guest = { id: uid(), username: 'guest', display_name: 'Pengguna MahiStream', role: 'user' };
            localStorage.setItem('mahi-user', JSON.stringify(guest));
            setState({ loading: false, user: guest });
          }
        })
        .catch(err => {
          clearTimeout(timer);
          if (savedUser) {
            setState({ loading: false, user: savedUser });
          } else {
            const guest = { id: uid(), username: 'guest', display_name: 'Pengguna MahiStream', role: 'user' };
            localStorage.setItem('mahi-user', JSON.stringify(guest));
            setState({ loading: false, user: guest });
          }
        });
    } else {
      clearTimeout(timer);
      const guest = savedUser || { id: uid(), username: 'guest', display_name: 'Pengguna MahiStream', role: 'user' };
      localStorage.setItem('mahi-user', JSON.stringify(guest));
      setState({ loading: false, user: guest });
    }
  }, []);

  const handleLoginSuccess = useCallback((userData) => {
    setState({ loading: false, user: userData });
    window.dispatchEvent(new CustomEvent('mahi:auth-changed', { detail: userData }));
  }, []);

  useEffect(() => {
    const onAuthChanged = (e) => {
      const userData = e?.detail;
      if (userData && userData.id) {
        setState({ loading: false, user: userData });
      } else {
        try {
          const stored = JSON.parse(localStorage.getItem('mahi-user') || 'null');
          if (stored && stored.id) setState({ loading: false, user: stored });
        } catch {}
      }
    };
    window.addEventListener('mahi:auth-changed', onAuthChanged);
    return () => window.removeEventListener('mahi:auth-changed', onAuthChanged);
  }, []);

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-accent" />
      </div>
    );
  }

  return children;
}
