import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-[420px]'
}) {
  return (
    <AnimatePresence>
      {open &&
      <div className="fixed inset-0 z-40 flex justify-end">
          <motion.button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="absolute inset-0 bg-ink/25" />
        
          <motion.aside
          role="dialog"
          aria-label={title}
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 32, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className={`relative flex h-full w-full ${width} flex-col border-l border-line bg-surface shadow-drawer`}>
          
            <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-ink">
                  {title}
                </h2>
                {subtitle && <p className="mt-0.5 text-sm text-meta">{subtitle}</p>}
              </div>
              <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-meta transition-colors duration-150 ease-soft hover:bg-canvas hover:text-ink">
              
                <XIcon className="h-5 w-5" />
              </button>
            </header>
            <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer &&
          <footer className="flex items-center gap-2 border-t border-line px-6 py-4">
                {footer}
              </footer>
          }
          </motion.aside>
        </div>
      }
    </AnimatePresence>);

}
