import { useState } from 'react';

function SynopsisBlock({ text }) {
  const [expanded, setExpanded] = useState(false);
  const content = (text && text.trim()) || 'Sinopsis tidak tersedia untuk seri ini.';
  // Anggap perlu tombol expand kalau teks > ~280 karakter (kira-kira 5 baris).
  const needsToggle = content.length > 280;
  return (
    <div className="mb-8">
      <p
        className={`text-sm text-text-secondary font-medium leading-relaxed whitespace-pre-line ${
          !expanded && needsToggle ? 'line-clamp-5' : ''
        }`}
      >
        {content}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 px-4 py-2 rounded-full bg-surface-highlight hover:bg-border text-text font-bold text-xs transition active:scale-95"
        >
          {expanded ? 'Tampilkan lebih sedikit' : 'Selengkapnya'}
        </button>
      )}
    </div>
  );
}

export default SynopsisBlock;
