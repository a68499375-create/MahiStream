import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, inputCls } from '../lib/client';
import Shell from '../components/Shell';
import { Btn, cx } from '../components/ui/index';
import { PlayIcon, EyeIcon, CheckIcon, AlertIcon } from '../components/icons';

export default function Login() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!username.trim() || !password) { setError('Isi semua field'); return; }
    setBusy(true);
    try {
      const endpoint = tab === 'login' ? '/auth/login' : '/auth/register';
      const d = await api(endpoint, 'POST', { username: username.trim(), password });
      localStorage.setItem('mahi-token', d.user.token);
      localStorage.setItem('mahi-user', JSON.stringify({ id: d.user.id, username: d.user.username, role: d.user.role, token: d.user.token }));
      setSuccess(tab === 'login' ? 'Berhasil masuk!' : 'Akun berhasil dibuat!');
      setTimeout(() => navigate('/'), 300);
    } catch (err) {
      setError(err?.message || 'Terjadi kesalahan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell nav={false}>
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              {tab === 'login' ? 'Masuk' : 'Daftar'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {tab === 'login' ? 'Masuk ke akun MahiStream kamu' : 'Buat akun MahiStream baru'}
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-6">
            <div className="mb-5 flex rounded-xl bg-elevated p-1">
              <button onClick={() => { setTab('login'); setError(''); setSuccess(''); }}
                className={cx("flex-1 rounded-lg py-2 text-sm font-bold transition", tab === 'login' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink')}>
                Masuk
              </button>
              <button onClick={() => { setTab('register'); setError(''); setSuccess(''); }}
                className={cx("flex-1 rounded-lg py-2 text-sm font-bold transition", tab === 'register' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink')}>
                Daftar
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-500">
                <AlertIcon size={16} /> {error}
              </div>
            )}
            {success && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-500/10 px-4 py-3 text-sm font-medium text-green-500">
                <CheckIcon size={16} /> {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="Masukkan username" autoFocus autoComplete="username"
                  className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted">Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    className={inputCls + " pr-11"} />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
                    <EyeIcon size={18} />
                  </button>
                </div>
              </div>
              <Btn type="submit" disabled={busy} className="w-full justify-center">
                {busy ? 'Memproses...' : tab === 'login' ? 'Masuk' : 'Daftar'}
              </Btn>
            </form>
          </div>

          <p className="mt-4 text-center text-xs text-muted">
            Dengan mendaftar, kamu menyetujui <span className="text-accent">Syarat & Ketentuan</span>
          </p>
        </div>
      </div>
    </Shell>
  );
}
