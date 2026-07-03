// Fuzzy title matching tanpa library — Levenshtein-style scoring untuk
// toleransi typo, plus token-set overlap untuk match cross-language
// (Inggris ↔ Romaji ↔ Japanese). Dipakai di Search page untuk re-rank
// hasil agar query "frieren" tetap menemukan "Sousou no Frieren", dan
// query "demon slyer" tetap menemukan "Demon Slayer / Kimetsu no Yaiba".

// Normalisasi: lowercase, hilangkan tag [XXX], suffix sub indo/uncensored/
// season info, simbol non-alfanumerik. Hasilnya jadi himpunan kata.
export const normalizeTitle = (raw = '') => {
  return String(raw)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/sub(title)?\s*indo(nesia)?/gi, ' ')
    .replace(/uncensored|episode\s*\d+(\s*[-–]\s*\d+)?|batch/gi, ' ')
    .replace(/season\s*\d+|\bs\d+\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const tokenize = (s = '') => normalizeTitle(s).split(' ').filter((t) => t.length > 1);

// Levenshtein distance dengan early-exit kalau salah satu string kosong.
const levenshtein = (a = '', b = '') => {
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > Math.max(m, n) / 2) return Math.max(m, n);
  const prev = new Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = prev[j];
      prev[j] = a[i - 1] === b[j - 1]
        ? prevDiag
        : 1 + Math.min(prev[j - 1], prev[j], prevDiag);
      prevDiag = temp;
    }
  }
  return prev[n];
};

const similarityWord = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
};

// Skor 0..1 antara query dan judul kandidat tunggal.
const scoreSingle = (q, candidate) => {
  const c = normalizeTitle(candidate);
  if (!q || !c) return 0;
  if (c === q) return 1; // exact match returns 1
  if (c.includes(q) || q.includes(c)) return 0.92;
  // Levenshtein skala penuh-string supaya typo seperti "demon slyer" → "demon slayer"
  // tetap dapat skor tinggi walau token-overlap tidak persis.
  const fullSim = similarityWord(q, c);
  const qTokens = tokenize(q);
  const cTokens = tokenize(c);
  if (qTokens.length === 0 || cTokens.length === 0) return fullSim;
  let matched = 0;
  qTokens.forEach((qt) => {
    let best = 0;
    cTokens.forEach((ct) => {
      const s = similarityWord(qt, ct);
      if (s > best) best = s;
    });
    if (best >= 0.66) matched += best; // turunkan threshold typo
  });
  const ratio = matched / qTokens.length;
  return Math.min(1, Math.max(ratio, fullSim));
};

// Skor 0..1 antara query dan judul kandidat (mengakomodasi alt titles).
// `candidate` boleh string (judul utama) atau object dengan field-field
// title/english_title/japanese_title/synonyms[]/alt_titles[].
export const scoreTitle = (query, candidate) => {
  const q = normalizeTitle(query);
  if (!q) return 0;
  const titles = [];
  if (typeof candidate === 'string') {
    titles.push(candidate);
  } else if (candidate && typeof candidate === 'object') {
    if (candidate.title) titles.push(candidate.title);
    if (candidate.english_title) titles.push(candidate.english_title);
    if (candidate.englishTitle) titles.push(candidate.englishTitle);
    if (candidate.japanese_title) titles.push(candidate.japanese_title);
    if (candidate.japaneseTitle) titles.push(candidate.japaneseTitle);
    if (candidate.native_title) titles.push(candidate.native_title);
    if (candidate.romaji_title) titles.push(candidate.romaji_title);
    if (Array.isArray(candidate.synonyms)) titles.push(...candidate.synonyms);
    if (Array.isArray(candidate.alt_titles)) titles.push(...candidate.alt_titles);
    if (Array.isArray(candidate.altTitles)) titles.push(...candidate.altTitles);
  }
  if (titles.length === 0) return 0;
  let best = 0;
  for (const t of titles) {
    const s = scoreSingle(q, t);
    if (s > best) best = s;
    if (best >= 0.99) break;
  }
  return best;
};

// Rank ulang array hasil pencarian; threshold default 0.25 supaya typo
// (mis. "demon slyer") tetap lolos.
export const fuzzyRank = (items, query, getTitle = (x) => x, threshold = 0.25) => {
  if (!Array.isArray(items) || items.length === 0) return items || [];
  if (!query || query.length < 2) return items;
  const scored = items.map((it) => {
    const candidate = typeof getTitle === 'function' ? getTitle(it) : it;
    // Bila getTitle hanya balik string judul utama, tetap inspect object asli
    // supaya alt_titles dipakai.
    const ctx = (candidate && typeof candidate === 'object') ? candidate : { title: candidate, ...((it && typeof it === 'object') ? it : {}) };
    return { it, s: scoreTitle(query, ctx) };
  });
  scored.sort((a, b) => b.s - a.s);
  // Don't filter by threshold - just return all ranked items
  return scored.map((x) => x.it);
};
