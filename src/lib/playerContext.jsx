import { createContext, useContext, useRef, useState, useCallback, useMemo } from 'react';

const Ctx = createContext(null);

const FALLBACK_REF = { current: null };
const FALLBACK = {
  videoRef: FALLBACK_REF, savedTime: FALLBACK_REF, savedSrc: FALLBACK_REF, epInfo: null, minimized: false, playing: false,
  play: () => {}, minimize: () => {}, expand: () => {}, close: () => {},
};

export function PlayerProvider({ children }) {
  const videoRef = useRef(null);
  const savedTime = useRef(0);
  const savedSrc = useRef('');
  const [epInfo, setEpInfo] = useState(null);
  const [minimized, setMinimized] = useState(false);

  const play = useCallback((info) => {
    setEpInfo(info);
    setMinimized(false);
  }, []);

  const minimize = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      savedTime.current = v.currentTime || 0;
      savedSrc.current = v.src || '';
      v.pause();
    }
    setMinimized(true);
  }, []);

  const expand = useCallback(() => {
    const v = videoRef.current;
    if (v) savedTime.current = v.currentTime || 0;
    setMinimized(false);
  }, []);

  const close = useCallback(() => {
    const v = videoRef.current;
    if (v) { v.pause(); v.src = ''; }
    setEpInfo(null);
    setMinimized(false);
    savedTime.current = 0;
    savedSrc.current = '';
  }, []);

  const value = useMemo(() => ({
    videoRef,
    savedTime,
    savedSrc,
    epInfo,
    minimized,
    play,
    minimize,
    expand,
    close,
    playing: epInfo !== null,
  }), [videoRef, savedTime, savedSrc, epInfo, minimized, play, minimize, expand, close]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  return ctx || FALLBACK;
}
