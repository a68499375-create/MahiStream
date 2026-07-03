import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, getCurrentUserId } from '../services/api';
import { ArrowLeft, Activity, Server, Database, Globe, RefreshCw, AlertTriangle, CheckCircle, Clock, Cpu } from 'lucide-react';

const REFRESH_INTERVAL = 15000;

function StatusBadge({ status }) {
  if (status === 'ok') return <span className="inline-flex items-center gap-1 text-green-400 text-xs font-bold"><CheckCircle size={14} /> OK</span>;
  return <span className="inline-flex items-center gap-1 text-red-400 text-xs font-bold"><AlertTriangle size={14} /> {status}</span>;
}

export default function Monitoring() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState('');
  const [authorized, setAuthorized] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [flareStatus, setFlareStatus] = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem('mahistream_user');
    if (raw) {
      try {
        const u = JSON.parse(raw);
        setUserEmail(u.email || '');
      } catch {}
    }
  }, []);

  const isAllowed = userEmail && userEmail.toLowerCase() === 'sapapenontonbg@gmail.com';

  const fetchAll = useCallback(async () => {
    if (!isAllowed) return;
    const params = `?email=${encodeURIComponent(userEmail)}`;
    try {
      const [epRes, flareRes, cacheRes, sysRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/admin/status${params}`),
        fetch(`${API_BASE_URL}/admin/flare${params}`),
        fetch(`${API_BASE_URL}/admin/cache${params}`),
        fetch(`${API_BASE_URL}/admin/system${params}`),
      ]);

      if (epRes.status === 'fulfilled' && epRes.value.ok) {
        const data = await epRes.value.json();
        setEndpoints(data.data?.endpoints || []);
      }
      if (flareRes.status === 'fulfilled' && flareRes.value.ok) {
        const data = await flareRes.value.json();
        setFlareStatus(data.data);
      }
      if (cacheRes.status === 'fulfilled' && cacheRes.value.ok) {
        const data = await cacheRes.value.json();
        setCacheInfo(data.data);
      }
      if (sysRes.status === 'fulfilled' && sysRes.value.ok) {
        const data = await sysRes.value.json();
        setSystemInfo(data.data);
      }
      setLastFetch(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Monitoring fetch failed:', e);
    }
  }, [isAllowed, userEmail]);

  useEffect(() => {
    if (!isAllowed) return;
    fetchAll();
    if (!autoRefresh) return;
    const iv = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [isAllowed, autoRefresh, fetchAll]);

  if (userEmail && !isAllowed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle size={48} className="mx-auto mb-4 text-yellow-500" />
          <h1 className="text-xl font-bold mb-2">Akses Ditolak</h1>
          <p className="text-text-secondary">Halaman ini hanya untuk pemilik akun.</p>
        </div>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <Activity size={48} className="mx-auto mb-4 text-text-secondary" />
          <h1 className="text-xl font-bold mb-2">Monitoring</h1>
          <p className="text-text-secondary">Silakan login terlebih dahulu.</p>
        </div>
      </div>
    );
  }

  const memMB = systemInfo?.memory ? (systemInfo.memory.heapUsed / 1024 / 1024).toFixed(1) : '?';
  const uptimeStr = systemInfo?.uptime ? `${Math.floor(systemInfo.uptime / 60)}m ${Math.floor(systemInfo.uptime % 60)}s` : '?';

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-20 bg-surface border-b border-border">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-surface-highlight rounded-full transition">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-lg font-bold flex-1">Monitoring</h1>
          <button
            onClick={() => { setAutoRefresh(v => !v); if (!autoRefresh) fetchAll(); }}
            className={`p-2 rounded-full transition ${autoRefresh ? 'text-primary' : 'text-text-secondary'}`}
            title={autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
          >
            <RefreshCw size={18} className={autoRefresh ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
        {lastFetch && (
          <p className="text-xs text-text-secondary text-center">
            Terakhir diperbarui: {lastFetch} {autoRefresh ? '(auto 15s)' : ''}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Cpu size={16} /> System
            </div>
            <div className="text-sm space-y-1">
              <p>Uptime: <span className="text-text font-bold">{uptimeStr}</span></p>
              <p>RAM: <span className="text-text font-bold">{memMB} MB</span></p>
              <p>Node: <span className="text-text font-bold">{systemInfo?.nodeVersion || '?'}</span></p>
            </div>
          </div>
          <div className="bg-surface rounded-xl p-4 border border-border">
            <div className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Database size={16} /> Cache
            </div>
            <div className="text-sm space-y-1">
              <p>Entries: <span className="text-text font-bold">{cacheInfo?.cacheEntries || 0}</span></p>
              <p>TTL: <span className="text-text font-bold">{cacheInfo?.cacheTTL || '?'}</span></p>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 text-sm text-text-secondary mb-3">
            <Globe size={16} /> FlareSolverr
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={flareStatus?.status} />
            {flareStatus?.sessions && (
              <span className="text-xs text-text-secondary">{flareStatus.sessions.length} session(s)</span>
            )}
            {flareStatus?.message && (
              <span className="text-xs text-red-400">{flareStatus.message}</span>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 text-sm text-text-secondary mb-3">
            <Server size={16} /> Endpoints
          </div>
          <div className="space-y-2">
            {endpoints.map((ep, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{ep.label}</p>
                  <p className="text-xs text-text-secondary">{ep.time}ms</p>
                </div>
                <StatusBadge status={ep.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
