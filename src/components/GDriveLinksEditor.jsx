import { useState, useEffect } from "react";
import { PlusIcon, TrashIcon, FilmIcon } from "./icons";

export function jsonToPipe(jsonData) {
  if (!jsonData) return '';
  let arr;
  if (typeof jsonData === 'string') {
    try { arr = JSON.parse(jsonData); } catch { return ''; }
  } else {
    arr = jsonData;
  }
  if (!Array.isArray(arr) || arr.length === 0) return '';
  arr.sort((a, b) => (a.episode || a.ep || 0) - (b.episode || b.ep || 0));
  return arr.map((item) => {
    const ep = item.episode || item.ep || '';
    const label = item.label || '1080p';
    const url = item.url || '';
    return `${ep}|${label}|${url}`;
  }).join('\n');
}

export function pipeToJson(pipeStr) {
  if (!pipeStr) return '[]';
  const lines = pipeStr.split('\n').filter(Boolean);
  const items = [];
  for (const line of lines) {
    if (line.startsWith('SKIP:')) continue;
    const parts = line.split('|').map(s => s.trim());
    const epNum = parseInt(parts[0]);
    if (!epNum) continue;
    items.push({ episode: epNum, label: parts[1] || '1080p', url: parts.slice(2).join('|') });
  }
  return JSON.stringify(items);
}

export default function GDriveLinksEditor({ value, onChange }) {
  const [episodes, setEpisodes] = useState([]);

  useEffect(() => {
    if (!value) { setEpisodes([]); return; }
    if (Array.isArray(value)) { setEpisodes(value); return; }
    if (typeof value === 'string') {
      const lines = value.split('\n').filter(Boolean);
      const map = {};
      for (const line of lines) {
        const skipMatch = line.match(/^SKIP:(\d+)\|(.+)/);
        if (skipMatch) {
          const epNum = parseInt(skipMatch[1]);
          if (!map[epNum]) map[epNum] = { number: epNum, urls: [], skip_intro: '' };
          map[epNum].skip_intro = skipMatch[2].trim();
          continue;
        }
        const parts = line.split('|').map(s => s.trim());
        const epNum = parseInt(parts[0]);
        if (!epNum) continue;
        if (!map[epNum]) map[epNum] = { number: epNum, urls: [], skip_intro: '' };
        if (parts.length === 2) map[epNum].urls.push({ label: '1080p', url: parts[1] });
        else if (parts.length >= 3) map[epNum].urls.push({ label: parts[1], url: parts.slice(2).join('|') });
      }
      setEpisodes(Object.values(map).sort((a, b) => a.number - b.number));
    }
  }, []);

  const emit = (eps) => {
    setEpisodes(eps);
    const lines = eps.map(ep => {
      const skip = ep.skip_intro ? `SKIP:${ep.number}|${ep.skip_intro}` : '';
      const urlLines = ep.urls.map(u => `${ep.number}|${u.label}|${u.url}`);
      return [...(skip ? [skip] : []), ...urlLines].join('\n');
    }).join('\n');
    onChange(lines);
  };

  const addEpisode = () => {
    const max = episodes.reduce((m, e) => Math.max(m, e.number), 0);
    emit([...episodes, { number: max + 1, urls: [{ label: '1080p', url: '' }], skip_intro: '' }]);
  };

  const updateEp = (idx, ep) => {
    const eps = [...episodes];
    eps[idx] = ep;
    emit(eps);
  };

  const removeEp = (idx) => emit(episodes.filter((_, i) => i !== idx));

  const addUrl = (idx) => {
    const eps = [...episodes];
    const labels = ['1080p', '720p', '480p', '360p'];
    const used = eps[idx].urls.map(u => u.label);
    const nextLabel = labels.find(l => !used.includes(l)) || `Res ${eps[idx].urls.length + 1}`;
    eps[idx] = { ...eps[idx], urls: [...eps[idx].urls, { label: nextLabel, url: '' }] };
    emit(eps);
  };

  const removeUrl = (epIdx, urlIdx) => {
    const eps = [...episodes];
    eps[epIdx] = { ...eps[epIdx], urls: eps[epIdx].urls.filter((_, i) => i !== urlIdx) };
    emit(eps);
  };

  return (
    <div className="space-y-2">
      {episodes.map((ep, epIdx) => (
        <div key={epIdx} className="rounded-xl border border-line/40 bg-elevated/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-accent">Episode {ep.number}</span>
            <button onClick={() => removeEp(epIdx)} className="text-muted2 hover:text-red text-[11px]">Hapus</button>
          </div>
          <div className="mb-2 flex gap-2">
            <span className="text-[10px] font-semibold text-muted2 self-center">Skip Intro:</span>
            <input value={ep.skip_intro || ''} onChange={e => {
              const eps = [...episodes];
              eps[epIdx] = { ...eps[epIdx], skip_intro: e.target.value };
              emit(eps);
            }} className="input w-32 text-[11px] text-center" placeholder="00:00-01:28" />
          </div>
          <div className="space-y-1.5">
            {ep.urls.map((u, urlIdx) => (
              <div key={urlIdx} className="flex flex-col gap-1 rounded-lg bg-elevated/40 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-muted2">Resolusi</span>
                  {ep.urls.length > 1 && (
                    <button onClick={() => removeUrl(epIdx, urlIdx)} className="ml-auto text-muted2 hover:text-red text-[10px]">Hapus URL ini</button>
                  )}
                </div>
                <input value={u.label} onChange={e => {
                  const eps = [...episodes];
                  eps[epIdx].urls[urlIdx].label = e.target.value;
                  emit(eps);
                }} className="input w-full text-[11px]" placeholder="1080p / 720p / 480p" />
                <input value={u.url} onChange={e => {
                  const eps = [...episodes];
                  eps[epIdx].urls[urlIdx].url = e.target.value;
                  emit(eps);
                }} className="input w-full text-[11px] border-accent/30" placeholder="https://drive.google.com/file/d/ID_VIDEO/view" />
              </div>
            ))}
          </div>
          <button onClick={() => addUrl(epIdx)} className="mt-1.5 text-[11px] font-semibold text-accent hover:text-accent/80">
            + Tambah URL
          </button>
        </div>
      ))}
      <button onClick={addEpisode}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line/40 py-2.5 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-accent">
        <PlusIcon size={14} /> Tambah Episode
      </button>
    </div>
  );
}
