import { useSyncExternalStore } from 'react';

let state = null;
const listeners = new Set();
function emit() { for (const l of listeners) l(); }

export function getMiniPlayer() { return state; }
export function setMiniPlayer(payload) {
  state = payload ? { ...state, ...payload } : null;
  emit();
}
export function updateMiniPlayer(patch) {
  if (!state) return;
  state = { ...state, ...patch };
  emit();
}
export function clearMiniPlayer() { state = null; emit(); }

export function useMiniPlayer() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => state
  );
}
