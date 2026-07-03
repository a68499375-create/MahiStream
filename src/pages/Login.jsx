import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Sparkles, Check, ShieldCheck, Tv, Zap } from 'lucide-react';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const handleGoogleLogin = async () => {
    if (!agreed) {
      setError('Mohon setujui Syarat & Ketentuan terlebih dahulu.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await GoogleAuth.signIn();
      localStorage.setItem('mahistream_user', JSON.stringify({
        name: response.displayName || response.givenName || 'User',
        email: response.email,
        picture: response.imageUrl,
      }));
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Google Login Failed', err);
      const msg = err && err.message ? err.message : 'Gagal login.';
      setError(`Login gagal: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell min-h-screen relative overflow-hidden">
      {/* Cinematic backdrop — multiple layered ambient halos + grid */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Diagonal gradient wash */}
        <div className="absolute inset-0 login-wash" />
        {/* Soft floating halos */}
        <div
          className="absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full opacity-50 animate-float-soft"
          style={{ background: 'radial-gradient(closest-side, var(--color-primary), transparent 70%)' }}
        />
        <div
          className="absolute -bottom-48 -right-32 w-[560px] h-[560px] rounded-full opacity-40 animate-float-soft"
          style={{ background: 'radial-gradient(closest-side, var(--color-accent), transparent 70%)', animationDelay: '2s' }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full opacity-30 animate-float-soft"
          style={{ background: 'radial-gradient(closest-side, var(--color-primary-light), transparent 70%)', animationDelay: '4s' }}
        />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 login-grid" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header brand */}
        <header className={`pt-10 pb-6 px-6 flex justify-center transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-xl bg-primary/40 scale-125 animate-float-soft" />
              <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/40 ring-1 ring-white/30">
                <span className="font-heading text-white text-2xl leading-none">M</span>
              </div>
            </div>
            <span className="font-heading text-2xl tracking-wide">
              <span className="text-primary">Mahi</span>
              <span className="text-text">Stream</span>
            </span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-5 pb-10">
          <div className="w-full max-w-md mx-auto flex flex-col items-center gap-6">
            {/* Card */}
            <div
              className={`login-card-premium relative w-full px-7 py-9 sm:px-9 sm:py-10 rounded-[28px] flex flex-col items-center gap-7 transition-all duration-700 ${
                mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
              }`}
            >
              {/* Floating sparkles accent */}
              <div className="absolute top-5 right-5 text-primary/40 animate-float-soft">
                <Sparkles size={18} />
              </div>

              {/* Greeting */}
              <div className="w-full flex flex-col items-center gap-4 text-center">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] uppercase text-primary bg-primary/10 border border-primary/25 px-3.5 py-1.5 rounded-full mx-auto">
                  <Sparkles size={11} strokeWidth={2.6} /> Akses Premium
                </span>
                <h1 className="text-[26px] md:text-[30px] font-black tracking-tight text-text leading-[1.15] w-full text-center mx-auto">
                  <span className="block">Selamat Datang</span>
                  <span className="block bg-gradient-to-r from-primary via-primary-light to-accent bg-clip-text text-transparent">
                    di MahiStream
                  </span>
                </h1>
                <p className="text-[13.5px] text-text-secondary font-medium leading-[1.65] max-w-[320px] mx-auto text-center">
                  Masuk dengan akun Google untuk menyinkron riwayat dan daftar favoritmu di setiap perangkat.
                </p>
              </div>

              {/* Feature bullets */}
              <div className="grid grid-cols-3 gap-2.5 w-full">
                {[
                  { Icon: Tv, label: 'Resolusi HD' },
                  { Icon: Zap, label: 'Bebas Iklan' },
                  { Icon: ShieldCheck, label: 'Privat' },
                ].map(({ Icon, label }, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center justify-center text-center gap-2 px-2 py-3.5 rounded-2xl bg-surface-highlight border border-border min-h-[78px]"
                  >
                    <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                      <Icon size={16} />
                    </div>
                    <span className="text-[11px] font-bold text-text leading-tight">
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Agree checkbox */}
              <label className="w-full flex items-start gap-3 text-left bg-surface-highlight/80 border border-border rounded-2xl px-4 py-3.5 cursor-pointer hover:border-primary/40 transition-all min-h-[56px]">
                <span
                  onClick={(e) => { e.preventDefault(); setAgreed((v) => !v); }}
                  className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${
                    agreed
                      ? 'bg-primary border-primary text-white shadow-md shadow-primary/40 scale-105'
                      : 'border-text-muted/40 bg-surface'
                  }`}
                >
                  {agreed && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="text-[12.5px] text-text-secondary font-medium leading-[1.55]">
                  Saya menyetujui{' '}
                  <span className="font-bold text-text">Syarat &amp; Ketentuan</span>{' '}
                  serta{' '}
                  <span className="font-bold text-text">Kebijakan Privasi</span>{' '}
                  MahiStream.
                </span>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="sr-only"
                />
              </label>

              {/* Google sign-in primary CTA */}
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-2xl"
              >
                <span
                  className={`relative z-10 w-full flex items-center justify-center gap-3 py-4 font-bold text-[14px] transition-all border ${
                    !loading
                      ? 'bg-surface hover:bg-surface-highlight border-border text-text shadow-md active:scale-[0.98]'
                      : 'bg-surface-highlight border-border text-text-muted cursor-not-allowed'
                  } rounded-2xl block`}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Memproses...
                    </span>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="22" height="22">
                        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                      </svg>
                      Lanjutkan dengan Google
                    </>
                  )}
                </span>
              </button>

              {!Capacitor.isNativePlatform() && (
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('mahistream_user', JSON.stringify({
                    name: 'Mahi Streamer (Demo)',
                    email: 'demo@mahistream.com',
                    picture: '',
                  }));
                  navigate('/', { replace: true });
                  setTimeout(() => window.location.reload(), 100);
                }}
                className="text-[12px] font-black text-primary/75 hover:text-primary transition active:scale-95 -mt-3.5"
              >
                Bypass Login (Gunakan Akun Demo)
              </button>
            )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
                  <p className="text-[12px] font-bold text-red-500 leading-relaxed text-center">{error}</p>
                </div>
              )}
            </div>

            <p className={`text-center text-[11px] text-text-muted font-medium leading-relaxed max-w-[320px] mx-auto transition-all duration-700 delay-200 ${
              mounted ? 'opacity-100' : 'opacity-0'
            }`}>
              Setiap akun punya riwayat dan favorit sendiri.
              <br />
              Bukan akun barengan — milikmu sendiri.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
