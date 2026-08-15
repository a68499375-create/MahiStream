import { useEffect, useState } from "react";
import { cx } from "./ui/index";

function ChevronUpIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

export default function ScrollTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cx("fixed bottom-24 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition-all duration-300 hover:scale-105", show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none")}
      aria-label="Scroll ke atas">
      <ChevronUpIcon size={20} />
    </button>
  );
}
