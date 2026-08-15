import { useState, useEffect } from 'react';
import { api, uid } from '../lib/client';
import { ExternalLinkIcon, XIcon } from './icons';

const COMM_STORAGE = 'mahi_community_seen';

export default function CommunityPopup() {
  const [settings, setSettings] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    api('/settings/community').then(d => {
      if (!d) return;
      setSettings(d);
      if (sessionStorage.getItem(COMM_STORAGE)) return;
      setShow(true);
    }).catch(() => {});
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(COMM_STORAGE, String(Date.now()));
    setShow(false);
  };

  if (!show || !settings) return null;

  const links = [
    settings.telegram_link && { label: settings.telegram_label || 'Telegram', link: settings.telegram_link, color: 'bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 ring-1 ring-sky-500/25' },
    settings.wa_link && { label: settings.wa_label || 'WhatsApp', link: settings.wa_link, color: 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 ring-1 ring-emerald-500/25' },
    settings.discord_link && { label: settings.discord_label || 'Discord', link: settings.discord_link, color: 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 ring-1 ring-indigo-500/25' },
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={dismiss}>
      <div className="w-full max-w-md rounded-t-3xl border border-line bg-surface p-6 sm:rounded-3xl"
        onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Gabung Komunitas</h2>
          <button onClick={dismiss} className="rounded-full bg-elevated p-1.5 text-muted hover:text-ink transition">
            <XIcon size={18} />
          </button>
        </div>
        <p className="mb-5 text-sm text-muted">
          Ikuti kami di komunitas resmi untuk info terbaru, update anime, dan diskusi seru!
        </p>
        <div className="space-y-3">
          {links.map((l, i) => (
            <a key={i} href={l.link} target="_blank" rel="noopener noreferrer"
              className={`flex items-center justify-between rounded-2xl px-5 py-4 font-semibold transition ${l.color}`}>
              <span className="text-sm">{l.label}</span>
              <ExternalLinkIcon size={16} />
            </a>
          ))}
        </div>
        <button onClick={dismiss}
          className="mt-5 w-full rounded-xl border border-line py-2.5 text-sm font-semibold text-muted transition hover:bg-elevated hover:text-ink">
          Nanti Saja
        </button>
      </div>
    </div>
  );
}
