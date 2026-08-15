import { useEffect } from "react";
import { CommandPalette } from "./CommandPalette";
import ScrollTop from "./ScrollTop";
import { ToastProvider } from "./Toast";
import { applyTheme } from "../lib/prefs";
import { PlayerProvider } from "../lib/playerContext.jsx";
import PlayerShell from "./PlayerShell";

function initTheme() {
  try {
    const t = localStorage.getItem("mahi-theme") || "dark";
    applyTheme(t);
    if (localStorage.getItem("mahi-reduce-motion") === "1")
      document.documentElement.classList.add("reduce-motion");
    const a = localStorage.getItem("mahi-accent") || "gold";
    const m = {
      gold: ["#eaa84e", "#f3c169", "#c8853c"],
      rose: ["#ec4899", "#f472b6", "#be185d"],
      violet: ["#a78bfa", "#c4b5fd", "#7c3aed"],
      teal: ["#2dd4bf", "#5eead4", "#0d9488"],
      crimson: ["#f43f5e", "#fb7185", "#be123c"],
      amber: ["#f59e0b", "#fbbf24", "#b45309"],
    };
    const d = m[a] || m.gold;
    document.documentElement.style.setProperty("--accent", d[0]);
    document.documentElement.style.setProperty("--accent-2", d[1]);
    document.documentElement.style.setProperty("--caramel", d[2]);
  } catch {}
}

export default function Global({ children }) {
  useEffect(() => {
    initTheme();
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const onChange = () => { if ((localStorage.getItem("mahi-theme") || "dark") === "auto") applyTheme("auto"); };
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);
  return (
    <ToastProvider>
      <PlayerProvider>
        {children}
        <CommandPalette />
        <ScrollTop />
        <PlayerShell />
      </PlayerProvider>
    </ToastProvider>
  );
}
