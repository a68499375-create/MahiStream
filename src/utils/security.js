export const obfuscate = (s) => {
  try { return btoa(encodeURIComponent(s).split('').reverse().join('')); } catch { return ''; }
};

export const deobfuscate = (s) => {
  try { return decodeURIComponent(atob(s).split('').reverse().join('')); } catch { return ''; }
};

export const checkRateLimit = (key, maxAttempts, windowMs) => {
  try {
    const raw = localStorage.getItem(`ratelimit_${key}`);
    if (!raw) return { ok: true };
    const { count, time } = JSON.parse(raw);
    if (Date.now() - time > windowMs) return { ok: true };
    if (count >= maxAttempts) return { ok: false, retryAfterMs: windowMs - (Date.now() - time) };
    return { ok: true };
  } catch { return { ok: true }; }
};

export const incrementRateLimit = (key, maxAttempts, windowMs) => {
  try {
    const raw = localStorage.getItem(`ratelimit_${key}`);
    if (!raw || Date.now() - JSON.parse(raw).time > windowMs) {
      localStorage.setItem(`ratelimit_${key}`, JSON.stringify({ count: 1, time: Date.now() }));
    } else {
      const { count, time } = JSON.parse(raw);
      localStorage.setItem(`ratelimit_${key}`, JSON.stringify({ count: count + 1, time }));
    }
  } catch {}
};

export const resetRateLimit = (key) => {
  try { localStorage.removeItem(`ratelimit_${key}`); } catch {}
};
