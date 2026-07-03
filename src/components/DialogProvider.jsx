import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const DialogContext = createContext(null);

export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
};

export function DialogProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(1);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      const normalized = typeof opts === 'string' ? { message: opts } : (opts || {});
      setConfirmState({
        title: normalized.title || 'Konfirmasi',
        message: normalized.message || '',
        okText: normalized.okText || 'OK',
        cancelText: normalized.cancelText || 'Batal',
        tone: normalized.tone || 'primary',
        resolve,
      });
    });
  }, []);

  const handleClose = useCallback((value) => {
    setConfirmState((cur) => {
      if (cur) {
        try { cur.resolve(value); } catch {}
      }
      return null;
    });
  }, []);

  const toast = useCallback((msg, opts = {}) => {
    const id = toastIdRef.current++;
    const entry = {
      id,
      message: typeof msg === 'string' ? msg : (msg?.message || ''),
      tone: opts.tone || (typeof msg === 'object' ? msg?.tone : null) || 'info',
      duration: opts.duration || 2500,
    };
    setToasts((prev) => [...prev, entry]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, entry.duration);
    return id;
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, toast }}>
      {children}
      {confirmState && (
        <ConfirmModal state={confirmState} onClose={handleClose} />
      )}
      {toasts.length > 0 && <ToastStack toasts={toasts} />}
    </DialogContext.Provider>
  );
}

function ConfirmModal({ state, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toneStyles = {
    primary: { bg: 'bg-primary', hover: 'hover:bg-primary-dark', text: 'text-white' },
    danger: { bg: 'bg-red-500', hover: 'hover:bg-red-600', text: 'text-white' },
    success: { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600', text: 'text-white' },
  };
  const tone = toneStyles[state.tone] || toneStyles.primary;
  const Icon = state.tone === 'danger' ? AlertTriangle : Info;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-fade-in"
      onClick={() => onClose(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-surface text-text border border-border rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4 flex items-start gap-3">
          <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${state.tone === 'danger' ? 'bg-red-500/15 text-red-500' : 'bg-primary/15 text-primary'}`}>
            <Icon size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-black text-text leading-snug">{state.title}</h3>
            {state.message && (
              <p className="text-[13px] text-text-secondary font-medium leading-relaxed mt-1.5 whitespace-pre-line">{state.message}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5 pt-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-surface-highlight hover:bg-border text-text font-bold text-[13px] transition active:scale-[0.97]"
          >
            {state.cancelText}
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className={`flex-1 px-4 py-2.5 rounded-2xl ${tone.bg} ${tone.hover} ${tone.text} font-bold text-[13px] transition active:scale-[0.97]`}
          >
            {state.okText}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts }) {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info;
        const styles =
          t.tone === 'success'
            ? 'bg-emerald-500 text-white'
            : t.tone === 'error'
            ? 'bg-red-500 text-white'
            : 'bg-surface text-text border border-border';
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md animate-fade-in min-w-[200px] max-w-[88vw] ${styles}`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="text-[13px] font-bold leading-tight break-words">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export default DialogProvider;
