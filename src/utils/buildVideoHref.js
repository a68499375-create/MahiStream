// Build navigation href ke halaman video player dari sebuah anime object.
// Tujuan: pastikan link selalu memuat ID yang cocok dengan source aktif,
// supaya VideoPlayer tidak ketuker anime (mis. ID Otakudesu dipakai
// dengan source Kuramanime). Logika ini sebelumnya tersebar di Home dan
// Search; dipusatkan di sini agar konsisten + bisa di-test.

export const pickPrimarySource = (anime) => {
  if (!anime) return 'otakudesu';
  const explicit = anime.source || anime._source;
  if (explicit) return explicit;
  const avail = Array.isArray(anime.availableSources) ? anime.availableSources : [];
  const sourceIds = (anime.sourceIds && typeof anime.sourceIds === 'object') ? anime.sourceIds : null;
  const hasId = (s) => sourceIds ? !!sourceIds[s] : true;
  if (avail.length > 0) {
    // Priority: Kuramanime > Otakudesu > Nekopoi. Kurama didahulukan karena:
    //   1) ID Kurama (1533/road-of-naruto) stabil; Otakudesu slug kadang
    //      mismatch ke anime lain dengan title mirip.
    //   2) User komplain klik hasil search dengan tag KURAMA tetapi
    //      VideoPlayer load anime Otakudesu yang berbeda karena
    //      sebelumnya priority Otakudesu di urutan pertama.
    const priority = ['kuramanime', 'otakudesu', 'nekopoi'];
    for (const p of priority) {
      if (avail.includes(p) && hasId(p)) return p;
    }
    for (const p of priority) {
      if (avail.includes(p)) return p;
    }
    return avail[0];
  }
  if (sourceIds) {
    const keys = Object.keys(sourceIds).filter((k) => sourceIds[k]);
    if (keys.length > 0) return keys[0];
  }
  return 'otakudesu';
};

export const buildVideoHref = (anime, extraQuery = '') => {
  if (!anime) return '#';
  const src = pickPrimarySource(anime);
  const explicitSource = anime.source || anime._source;

  // Prefer anime.id kalau anime sudah datang DENGAN source yang spesifik
  // (mis. Home aggregator memberi anime { id: 'movie-x', source: 'otakudesu' }).
  // sourceIds map hanya dipakai untuk cross-source switch, tidak boleh
  // overwrite ID natural yang sudah disinkronkan dengan source-nya. Tanpa
  // guard ini, banner "Yuru Camp Movie" / "Isekai Meikyuu de Harem wo Special"
  // bisa terhubung ke ID TV-series karena sourceIds map ikut nyangkut dari
  // hasil aggregate.
  let id;
  if (explicitSource && explicitSource === src && anime.id) {
    id = anime.id;
  } else {
    id = (anime.sourceIds && anime.sourceIds[src]) || anime.id;
  }
  if (!id) return '#';
  // Untuk Kuramanime, id berbentuk 'NN/slug-anime' (mengandung slash).
  // React Router pakai `path="/video/*"` jadi slash di params boleh — JANGAN
  // encodeURIComponent karena akan ubah '/' jadi '%2F' yang memecah routing.
  const params = new URLSearchParams();
  if (src && src !== 'otakudesu') params.set('source', src);
  if (extraQuery) {
    extraQuery.split('&').forEach((p) => {
      const [k, v] = p.split('=');
      if (k) params.set(k, v ?? '');
    });
  }
  const qs = params.toString();
  return `/video/${id}${qs ? `?${qs}` : ''}`;
};

export default buildVideoHref;
