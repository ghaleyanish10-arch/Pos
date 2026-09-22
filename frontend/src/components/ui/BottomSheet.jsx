import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';

/**
 * Phone-native bottom sheet. Replaces right-side drawers on small screens so a
 * tap on a table/order rises into a thumb-reachable sheet instead of a panel
 * that slides in from the edge. Optional drag-handle affordance on top.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  handle = true
}) {
  return (
    <AnimatePresence>
      {open &&
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close sheet"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />

          <motion.div
            role="dialog"
            aria-label={title || 'Sheet'}
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
            className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop-lg sm:max-w-md sm:rounded-card">
            {handle &&
              <span
                aria-hidden="true"
                className="mx-auto mt-2.5 block h-1.5 w-10 shrink-0 rounded-full bg-line" />
            }
            {title &&
              <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
                <div className="min-w-0">
                  <h3 className="sheet-title">{title}</h3>
                  {subtitle &&
                    <p className="mt-0.5 text-sm text-meta">{subtitle}</p>
                  }
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="icon-btn h-8 w-8 shrink-0">
                  <XIcon className="h-4 w-4" />
                </button>
              </header>
            }
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer &&
              <footer className="flex items-center gap-2 border-t border-line bg-canvas/60 px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))]">
                {footer}
              </footer>
            }
          </motion.div>
        </div>
      }
    </AnimatePresence>
  );
}