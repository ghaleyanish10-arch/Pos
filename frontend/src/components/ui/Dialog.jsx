import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-sm'
}) {
  return (
    <AnimatePresence>
      {open &&
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <motion.button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
        
          <motion.div
          role="dialog"
          aria-label={title || 'Dialog'}
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className={`relative w-full ${width} rounded-card border border-line bg-surface shadow-pop-lg`}>
            
            {title &&
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div>
                  <h3 className="sheet-title">
                    {title}
                  </h3>
                  {subtitle &&
              <p className="mt-0.5 text-sm text-meta">{subtitle}</p>
              }
                </div>
                <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="icon-btn h-8 w-8">
                  
                  <XIcon className="h-4 w-4" />
                </button>
              </header>
          }
            <div className="px-5 py-4">{children}</div>
            {footer &&
          <footer className="flex items-center gap-2 border-t border-line px-5 py-3.5">
              {footer}
            </footer>
          }
          </motion.div>
        </div>
      }
    </AnimatePresence>);

}