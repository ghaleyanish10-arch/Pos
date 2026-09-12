import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from 'lucide-react';

const ToastContext = createContext(() => {});

const toneIcon = {
  green: <CheckIcon className="h-3.5 w-3.5" />,
  red: <XIcon className="h-3.5 w-3.5" />,
  blue: <InfoIcon className="h-3.5 w-3.5" />,
  amber: <AlertTriangleIcon className="h-3.5 w-3.5" />,
  dark: <CheckIcon className="h-3.5 w-3.5" />
};

const toneBg = {
  green: 'bg-status-green',
  red: 'bg-status-red',
  blue: 'bg-status-blue',
  amber: 'bg-status-amber',
  dark: 'bg-white/20'
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone: opts.tone || 'dark', undo: opts.undo }]);
    window.setTimeout(() => dismiss(id), opts.duration || 4000);
  }, [dismiss]);

  const toast = useCallback((message, opts) => push(message, opts), [push]);
  toast.success = useCallback((msg, opts) => push(msg, { tone: 'green', ...opts }), [push]);
  toast.error = useCallback((msg, opts) => push(msg, { tone: 'red', ...opts }), [push]);
  toast.info = useCallback((msg, opts) => push(msg, { tone: 'blue', ...opts }), [push]);
  toast.warning = useCallback((msg, opts) => push(msg, { tone: 'amber', ...opts }), [push]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex flex-col items-end gap-2">
        <AnimatePresence>
          {toasts.map((t) =>
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-line bg-ink/95 py-2 pl-3 pr-4 text-sm font-semibold text-white shadow-pop backdrop-blur">
            
              <span className={`flex h-5 w-5 items-center justify-center rounded-full ${toneBg[t.tone]}`}>
                {toneIcon[t.tone]}
              </span>
              {t.message}
              {t.undo &&
              <button
              type="button"
              onClick={() => {
                t.undo();
                dismiss(t.id);
              }}
              className="ml-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider transition-colors duration-150 ease-soft hover:bg-white/25">
                  
                  Undo
                </button>
              }
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>);

}

export function useToast() {
  return useContext(ToastContext);
}