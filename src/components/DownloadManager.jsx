import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  Pause,
  Play,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowDownToLine,
  Settings,
  Clock,
  Wifi,
  XCircle,
} from 'lucide-react';
import { useDialog } from '../components/DialogProvider';
import './DownloadManager.css';

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks for progress

export default function DownloadManager({ isOpen, onClose, onAddDownload }) {
  const { toast } = useDialog();
  const [downloads, setDownloads] = useState(() => {
    try {
      const saved = localStorage.getItem('mahistream_downloads_v1');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [queue, setQueue] = useState([]);
  const [settings, setSettings] = useState({
    wifiOnly: true,
    maxConcurrent: 3,
    autoResume: true,
    notificationOnComplete: true,
  });

  // Save downloads to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mahistream_downloads_v1', JSON.stringify(downloads));
    } catch {}
  }, [downloads]);

  // Load settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mahistream_download_settings');
      if (saved) setSettings(JSON.parse(saved));
    } catch {}
  }, []);

  const saveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('mahistream_download_settings', JSON.stringify(newSettings));
  };

  const updateDownload = useCallback((id, updates) => {
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const removeDownload = useCallback((id) => {
    setDownloads(prev => prev.filter(d => d.id !== id));
    setQueue(prev => prev.filter(q => q.id !== id));
  }, []);

  const pauseDownload = useCallback((id) => {
    updateDownload(id, { status: 'paused', pausedAt: Date.now() });
    setQueue(prev => prev.filter(q => q.id !== id));
  }, [updateDownload]);

  const resumeDownload = useCallback((id) => {
    updateDownload(id, { status: 'queued' });
    setQueue(prev => [...prev, { id }]);
  }, [updateDownload]);

  const cancelDownload = useCallback((id) => {
    updateDownload(id, { status: 'cancelled' });
    setQueue(prev => prev.filter(q => q.id !== id));
  }, [updateDownload]);

  const retryDownload = useCallback((id) => {
    const download = downloads.find(d => d.id === id);
    if (!download) return;
    updateDownload(id, { status: 'queued', progress: 0, error: null, retries: 0 });
    setQueue(prev => [...prev, { id }]);
  }, [downloads, updateDownload]);

  const clearCompleted = useCallback(() => {
    setDownloads(prev => prev.filter(d => d.status !== 'completed'));
  }, []);

  // Process download queue
  useEffect(() => {
    if (!queue.length) return;
    
    const active = downloads.filter(d => d.status === 'downloading').length;
    if (active >= settings.maxConcurrent) return;

    const next = queue.find(q => {
      const d = downloads.find(dl => dl.id === q.id);
      return d && (d.status === 'queued' || d.status === 'pending');
    });
    
    if (next) {
      const download = downloads.find(d => d.id === next.id);
      if (download) startDownload(download);
    }
  }, [queue, downloads, settings.maxConcurrent]);

  const startDownload = async (download) => {
    updateDownload(download.id, { status: 'downloading', startedAt: Date.now() });
    
    try {
      const response = await fetch(download.url, {
        headers: {
          'Range': `bytes=${download.downloadedBytes || 0}-`,
        },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentLength = response.headers.get('content-length');
      const totalSize = contentLength ? parseInt(contentLength, 10) : download.totalSize || 0;
      
      if (totalSize) {
        updateDownload(download.id, { totalSize });
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      let receivedBytes = download.downloadedBytes || 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedBytes += value.length;
        
        const progress = totalSize ? Math.round((receivedBytes / totalSize) * 100) : 0;
        updateDownload(download.id, { 
          progress, 
          downloadedBytes: receivedBytes,
          speed: calculateSpeed(download.id, receivedBytes),
        });
      }

      // Combine chunks and create blob
      const blob = new Blob(chunks);
      const url = URL.createObjectURL(blob);
      
      // Save to device (in Capacitor, would use Filesystem API)
      await saveFile(download, blob);
      
      updateDownload(download.id, { 
        status: 'completed', 
        progress: 100, 
        completedAt: Date.now(),
        localPath: url,
      });

      if (settings.notificationOnComplete) {
        toast(`${download.title} selesai diunduh`, { tone: 'success' });
      }

      // Process next in queue
      setQueue(prev => prev.filter(q => q.id !== download.id));
    } catch (error) {
      console.error('Download error:', error);
      const retryCount = (download.retries || 0) + 1;
      
      if (retryCount <= 3 && settings.autoResume) {
        updateDownload(download.id, { 
          status: 'queued', 
          retries: retryCount,
          error: error.message,
        });
        setTimeout(() => setQueue(prev => [...prev, { id: download.id }]), 5000 * retryCount);
      } else {
        updateDownload(download.id, { 
          status: 'error', 
          error: error.message,
        });
        setQueue(prev => prev.filter(q => q.id !== download.id));
      }
    }
  };

  const calculateSpeed = (id, bytes) => {
    const dl = downloads.find(d => d.id === id);
    if (!dl || !dl.startedAt) return 0;
    const elapsed = (Date.now() - dl.startedAt) / 1000;
    return elapsed > 0 ? Math.round(bytes / elapsed) : 0;
  };

  const saveFile = async (download, blob) => {
    // In Capacitor, use Filesystem API
    // For web, trigger download
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
      // Native: use Capacitor Filesystem
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const base64 = await blobToBase64(blob);
        const result = await Filesystem.writeFile({
          path: `MahiStream/${download.filename}`,
          data: base64,
          directory: Directory.Downloads,
        });
        return result.uri;
      } catch (e) {
        console.warn('Filesystem write failed, using blob URL:', e);
      }
    }
    // Web fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = download.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const blobToBase64 = (blob) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });

  const formatSize = (bytes) => {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  };

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec) return '—';
    return `${formatSize(bytesPerSec)}/s`;
  };

  const formatTime = (ms) => {
    if (!ms) return '—';
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  const handleAddDownload = (options) => {
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const download = {
      id,
      title: options.title,
      url: options.url,
      quality: options.quality || 'auto',
      mirror: options.mirror || 'direct',
      filename: options.filename || `${options.title}.mp4`,
      totalSize: options.size || 0,
      status: 'queued',
      progress: 0,
      downloadedBytes: 0,
      createdAt: Date.now(),
      animeId: options.animeId,
      episode: options.episode,
      poster: options.poster,
    };
    
    setDownloads(prev => [download, ...prev]);
    setQueue(prev => [...prev, { id }]);
    onClose?.();
  };

  if (!isOpen) return null;

  const activeDownloads = downloads.filter(d => 
    ['queued', 'pending', 'downloading'].includes(d.status)
  );
  const completedDownloads = downloads.filter(d => d.status === 'completed');
  const failedDownloads = downloads.filter(d => d.status === 'error');

  return (
    <div className="download-manager-overlay" onClick={onClose}>
      <div className="download-manager-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="dm-header">
          <div className="dm-header-left">
            <h2 className="dm-title">Kelola Unduhan</h2>
            <span className="dm-badge">{downloads.length} total</span>
          </div>
          <div className="dm-header-right">
            <button className="dm-btn-icon" onClick={clearCompleted} disabled={!completedDownloads.length}>
              <Trash2 size={18} /> Hapus Selesai
            </button>
            <button className="dm-btn-icon dm-btn-settings" onClick={() => setShowSettings(!showSettings)}>
              <Settings size={18} />
            </button>
            <button className="dm-btn-icon dm-btn-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="dm-settings-panel">
            <h3>Pengaturan Unduhan</h3>
            <div className="dm-settings-grid">
              <label className="dm-setting">
                <input
                  type="checkbox"
                  checked={settings.wifiOnly}
                  onChange={e => saveSettings({ ...settings, wifiOnly: e.target.checked })}
                />
                <span>Hanya WiFi</span>
              </label>
              <label className="dm-setting">
                <input
                  type="checkbox"
                  checked={settings.autoResume}
                  onChange={e => saveSettings({ ...settings, autoResume: e.target.checked })}
                />
                <span>Resume Otomatis</span>
              </label>
              <label className="dm-setting">
                <input
                  type="checkbox"
                  checked={settings.notificationOnComplete}
                  onChange={e => saveSettings({ ...settings, notificationOnComplete: e.target.checked })}
                />
                <span>Notifikasi Selesai</span>
              </label>
              <div className="dm-setting dm-setting-select">
                <label>Maks. Konkuren</label>
                <select
                  value={settings.maxConcurrent}
                  onChange={e => saveSettings({ ...settings, maxConcurrent: parseInt(e.target.value) })}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="dm-tabs">
          <button className={`dm-tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => setActiveTab('active')}>
            <ArrowDownToLine size={16} /> Aktif ({activeDownloads.length})
          </button>
          <button className={`dm-tab ${activeTab === 'completed' ? 'active' : ''}`} onClick={() => setActiveTab('completed')}>
            <CheckCircle size={16} /> Selesai ({completedDownloads.length})
          </button>
          <button className={`dm-tab ${activeTab === 'failed' ? 'active' : ''}`} onClick={() => setActiveTab('failed')}>
            <AlertCircle size={16} /> Gagal ({failedDownloads.length})
          </button>
        </div>

        {/* Content */}
        <div className="dm-content">
          {activeTab === 'active' && activeDownloads.length === 0 && (
            <div className="dm-empty">
              <Download size={48} className="dm-empty-icon" />
              <p>Tidak ada unduhan aktif</p>
              <span>Tambah unduhan dari halaman video</span>
            </div>
          )}

          {activeTab === 'completed' && completedDownloads.length === 0 && (
            <div className="dm-empty">
              <CheckCircle size={48} className="dm-empty-icon" />
              <p>Belum ada unduhan selesai</p>
            </div>
          )}

          {activeTab === 'failed' && failedDownloads.length === 0 && (
            <div className="dm-empty">
              <AlertCircle size={48} className="dm-empty-icon" />
              <p>Tidak ada unduhan gagal</p>
            </div>
          )}

          <div className="dm-list">
            {getFilteredDownloads().map(download => (
              <DownloadItem
                key={download.id}
                download={download}
                onPause={() => pauseDownload(download.id)}
                onResume={() => resumeDownload(download.id)}
                onCancel={() => cancelDownload(download.id)}
                onRetry={() => retryDownload(download.id)}
                onRemove={() => removeDownload(download.id)}
                formatSize={formatSize}
                formatSpeed={formatSpeed}
                formatTime={formatTime}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadItem({ download, onPause, onResume, onCancel, onRetry, onRemove, formatSize, formatSpeed, formatTime }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = ['queued', 'pending', 'downloading'].includes(download.status);
  const isDone = download.status === 'completed';
  const isError = download.status === 'error';

  return (
    <div className={`dm-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isError ? 'error' : ''}`}>
      <div className="dm-item-main" onClick={() => setExpanded(!expanded)}>
        <div className="dm-item-thumb">
          {download.poster ? (
            <img src={download.poster} alt={download.title} loading="lazy" />
          ) : (
            <div className="dm-thumb-placeholder">📥</div>
          )}
        </div>
        <div className="dm-item-info">
          <div className="dm-item-title-row">
            <h4 className="dm-item-title">{download.title}</h4>
            <span className={`dm-status-badge ${download.status}`}>
              {getStatusLabel(download.status)}
            </span>
          </div>
          <div className="dm-item-meta">
            <span className="dm-quality">{download.quality}</span>
            <span className="dm-separator">•</span>
            <span className="dm-mirror">{download.mirror}</span>
            {download.episode && (
              <>
                <span className="dm-separator">•</span>
                <span className="dm-episode">EP {download.episode}</span>
              </>
            )}
          </div>
          
          {isActive && (
            <div className="dm-progress-container">
              <div className="dm-progress-bar">
                <div 
                  className="dm-progress-fill" 
                  style={{ width: `${download.progress}%` }}
                />
              </div>
              <div className="dm-progress-stats">
                <span>{download.progress}%</span>
                <span>{formatSize(download.downloadedBytes)} / {formatSize(download.totalSize)}</span>
                <span>{formatSpeed(download.speed)}</span>
                <span>{formatTime(estimateTimeRemaining(download))}</span>
              </div>
            </div>
          )}

          {isDone && (
            <div className="dm-completed-info">
              <span className="dm-completed-label">
                <CheckCircle size={14} /> Selesai
              </span>
              <span className="dm-completed-time">
                {formatTime(download.completedAt ? Date.now() - download.completedAt : 0)} lalu
              </span>
              <span className="dm-file-size">{formatSize(download.totalSize)}</span>
            </div>
          )}

          {isError && (
            <div className="dm-error-info">
              <AlertCircle size={14} />
              <span>{download.error || 'Unknown error'}</span>
            </div>
          )}
        </div>
        <ChevronDown size={20} className={`dm-expand-icon ${expanded ? 'rotated' : ''}`} />
      </div>

      {expanded && (
        <div className="dm-item-expanded">
          <div className="dm-expanded-actions">
            {isActive && (
              <>
                <button className="dm-action-btn" onClick={onPause}>
                  <Pause size={16} /> Jeda
                </button>
                <button className="dm-action-btn dm-action-danger" onClick={onCancel}>
                  <XCircle size={16} /> Batalkan
                </button>
              </>
            )}
            {isDone && (
              <>
                <button className="dm-action-btn dm-action-success">
                  <CheckCircle size={16} /> Buka File
                </button>
                <button className="dm-action-btn" onClick={onRemove}>
                  <Trash2 size={16} /> Hapus
                </button>
              </>
            )}
            {isError && (
              <>
                <button className="dm-action-btn dm-action-primary" onClick={onRetry}>
                  <Loader2 size={16} /> Coba Lagi
                </button>
                <button className="dm-action-btn" onClick={onRemove}>
                  <Trash2 size={16} /> Hapus
                </button>
              </>
            )}
            {['queued', 'pending'].includes(download.status) && (
              <button className="dm-action-btn dm-action-danger" onClick={onCancel}>
                <XCircle size={16} /> Batalkan
              </button>
            )}
          </div>
          
          <div className="dm-expanded-details">
            <div className="dm-detail-row">
              <span className="dm-detail-label">URL</span>
              <span className="dm-detail-value dm-url">{download.url}</span>
            </div>
            <div className="dm-detail-row">
              <span className="dm-detail-label">Dibuat</span>
              <span className="dm-detail-value">{new Date(download.createdAt).toLocaleString()}</span>
            </div>
            {download.startedAt && (
              <div className="dm-detail-row">
                <span className="dm-detail-label">Dimulai</span>
                <span className="dm-detail-value">{new Date(download.startedAt).toLocaleString()}</span>
              </div>
            )}
            {download.completedAt && (
              <div className="dm-detail-row">
                <span className="dm-detail-label">Selesai</span>
                <span className="dm-detail-value">{new Date(download.completedAt).toLocaleString()}</span>
              </div>
            )}
            {download.retries && download.retries > 0 && (
              <div className="dm-detail-row">
                <span className="dm-detail-label">Percobaan</span>
                <span className="dm-detail-value">{download.retries}/3</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getStatusLabel(status) {
  const labels = {
    queued: 'Menunggu',
    pending: 'Menunggu',
    downloading: 'Mengunduh',
    paused: 'Dijeda',
    completed: 'Selesai',
    error: 'Gagal',
    cancelled: 'Dibatalkan',
  };
  return labels[status] || status;
}

function estimateTimeRemaining(download) {
  if (!download.speed || download.speed <= 0) return 0;
  const remaining = (download.totalSize || 0) - (download.downloadedBytes || 0);
  return remaining > 0 ? (remaining / download.speed) * 1000 : 0;
}

// Export for use in VideoPlayer
export { handleAddDownload };