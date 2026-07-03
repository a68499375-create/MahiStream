import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ArrowLeft, Activity, Loader2, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../services/api';
import { useDialog } from '../components/DialogProvider';
import './Settings.css';

const DIAG_ENDPOINTS = [
  { key: 'backend', label: 'Backend MahiStream', path: '/', timeoutMs: 8000 },
  // Pakai endpoint cached cheap untuk health check supaya tidak trigger
  // Puppeteer/FlareSolverr cold-start setiap diagnosa:
  // - Otakudesu /otakudesu = route list saja (instant)
  // - Kuramanime /genres = data genre, cache 24 jam di backend (warm < 200ms)
  // - Nekopoi /index?path=hentai-list = cache 6 jam (warm < 300ms)
  //
  // Endpoint ini accurate untuk "service hidup atau tidak", tanpa
  // ke-confuse oleh scrape situs target yang kadang lambat.
  { key: 'otaku', label: 'Otakudesu', path: '/otakudesu', timeoutMs: 8000 },
  { key: 'kura', label: 'Kuramanime', path: '/kuramanime/genres', timeoutMs: 15000 },
  { key: 'neko', label: 'Nekopoi', path: '/nekopoi/index?path=hentai-list', timeoutMs: 15000 },
];

const HISTORY_KEY = 'mahistream_diag_history_v1';
const HISTORY_LIMIT = 20;

const readHistory = () => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};
const writeHistory = (next) => {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
};

const probeEndpoint = async (path, timeoutMs = 15000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    return { ok: res.ok, status: res.status, ms: Date.now() - start };
  } catch (e) {
    clearTimeout(t);
    const aborted = e?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      ms: Date.now() - start,
      error: aborted ? `Timeout >${Math.round(timeoutMs / 1000)}s` : (e?.message || 'failed'),
    };
  }
};

export default function SettingsDiagnosa() {
  const navigate = useNavigate();
  const { confirm, toast } = useDialog();
  const [diag, setDiag] = useState({});
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState(() => readHistory());

  useEffect(() => writeHistory(history), [history]);

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setDiag({});
    // Jalankan paralel supaya total durasi = max(endpoint), bukan jumlahnya.
    // Set state setiap kali ada hasil supaya UI update progresif.
    const result = {};
    await Promise.all(
      DIAG_ENDPOINTS.map(async (ep) => {
        const r = await probeEndpoint(ep.path, ep.timeoutMs);
        result[ep.key] = r;
        setDiag((prev) => ({ ...prev, [ep.key]: r }));
      })
    );
    setRunning(false);
    const entry = {
      at: new Date().toISOString(),
      summary: DIAG_ENDPOINTS.map((ep) => ({ key: ep.key, label: ep.label, ...result[ep.key] })),
    };
    setHistory((prev) => [entry, ...prev].slice(0, HISTORY_LIMIT));
  };

  const handleClearHistory = async () => {
    const ok = await confirm({
      title: 'Hapus riwayat diagnosa?',
      message: 'Semua catatan diagnosa sebelumnya akan dihapus.',
      okText: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    setHistory([]);
    toast('Riwayat diagnosa dibersihkan', { tone: 'success' });
  };

  const formatTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso || ''; }
  };

  return (
    <div className="min-h-screen bg-bg text-text pb-28">
      <header className="settings-header">
        <button type="button" onClick={() => navigate(-1)} className="settings-back-btn" aria-label="Kembali">
          <ArrowLeft size={18} />
        </button>
        <div className="settings-header-title">
          <Activity size={16} className="text-primary" />
          <span>Diagnosa Jaringan</span>
        </div>
        <span className="settings-header-spacer" aria-hidden />
      </header>

      <main className="settings-main">
        <h2 className="settings-section-label">Status saat ini</h2>
        <div className="settings-sub-section">
          {DIAG_ENDPOINTS.map((ep, idx) => {
            const result = diag[ep.key];
            const last = idx === DIAG_ENDPOINTS.length - 1;
            return (
              <div
                key={ep.key}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: idx > 0 ? '1px solid var(--color-border)' : 'none' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-text">{ep.label}</div>
                  <div className="text-[12px] text-text-secondary font-medium">{ep.path}</div>
                </div>
                {running && !result ? (
                  <span className="diag-pill diag-pill--idle"><Loader2 size={12} className="animate-spin" /> Memeriksa</span>
                ) : !result ? (
                  <span className="diag-pill diag-pill--idle">Belum diuji</span>
                ) : result.ok ? (
                  <span className="diag-pill diag-pill--ok"><CheckCircle2 size={12} /> {result.ms}ms</span>
                ) : (
                  <span className="diag-pill diag-pill--err"><XCircle size={12} /> {result.error || result.status || 'Gagal'}</span>
                )}
                {last ? null : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <button
            type="button"
            className="settings-action-btn"
            disabled={running}
            onClick={handleRun}
            style={{ opacity: running ? 0.7 : 1 }}
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />}
            {running ? 'Memeriksa…' : 'Jalankan pemeriksaan'}
          </button>
        </div>

        <div className="flex items-center justify-between mt-6 mb-2">
          <h2 className="settings-section-label" style={{ margin: 0 }}>Riwayat</h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="text-[11px] font-bold text-red-500 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-500/10"
            >
              <Trash2 size={12} /> Hapus
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="settings-card text-[13px] text-text-secondary font-medium text-center">
            Belum ada riwayat. Jalankan pemeriksaan untuk mencatatnya.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((h, i) => {
              const ok = h.summary.every((s) => s.ok);
              return (
                <div key={i} className="settings-card">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[12px] font-bold text-text">{formatTime(h.at)}</span>
                    {ok ? (
                      <span className="diag-pill diag-pill--ok"><CheckCircle2 size={12} /> Semua sehat</span>
                    ) : (
                      <span className="diag-pill diag-pill--err"><XCircle size={12} /> Ada gangguan</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {h.summary.map((s) => (
                      <div key={s.key} className="flex items-center justify-between text-[12px] gap-2">
                        <span className="text-text-secondary truncate">{s.label}</span>
                        <span className={s.ok ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {s.ok ? `${s.ms}ms` : (s.error || s.status || 'Gagal')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
