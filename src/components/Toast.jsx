import { createContext, useCallback, useContext, useState } from "react";
import { cx } from "./ui/index";
import { CheckCircleIcon, AlertIcon, InfoIcon, XIcon } from "./icons";

const Ctx = createContext({ toast: () => {} });
export function useToast() { return useContext(Ctx); }

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems(p => p.filter(t => t.id !== id)), []);

  const toast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setItems(p => [...p, { id, message, type }]);
    setTimeout(() => remove(id), 3200);
  }, [remove]);

  const styles = {
    success: { cls: "border-emerald-500/40 text-emerald-300", Icon: CheckCircleIcon },
    error: { cls: "border-rose-500/40 text-rose-300", Icon: AlertIcon },
    info: { cls: "border-accent/40 text-accent2", Icon: InfoIcon },
  };

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map(t => {
          const { cls, Icon } = styles[t.type] || styles.success;
          return (
            <div key={t.id} className={cx("slide-up glass-strong pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border px-4 py-3 shadow-2xl", cls)}>
              <Icon size={18} className="shrink-0" />
              <span className="flex-1 text-sm font-medium text-ink">{t.message}</span>
              <button onClick={() => remove(t.id)} className="text-muted transition hover:text-ink" aria-label="Tutup"><XIcon size={14} /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
