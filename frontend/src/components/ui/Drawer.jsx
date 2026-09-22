import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { useDevice } from '../../state/DeviceContext';

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-[420px]'
}) {
  const { isPhone } = useDevice();

  return (
    <AnimatePresence>
      {open &&
      (isPhone ? (
        // One-handed phones: the same panel slides up as a bottom sheet.
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <motion.button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
          <motion.aside
            role="dialog"
            aria-label={title}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            className="relative flex max-h-[92vh] w-full max-w-[720px] flex-col rounded-t-[24px] border-t border-line bg-surface shadow-drawer">
            <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true" />
            <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-3">
              <div>
                <h2 className="sheet-title">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-meta">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="icon-btn h-8 w-8">
                <XIcon className="h-4 w-4" />
              </button>
            </header>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 pb-6">{children}</div>
            {footer &&
              <footer
                className="flex items-center gap-2 border-t border-line px-5 py-4"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                {footer}
              </footer>
            }
          </motion.aside>
        </div>
      ) : (
        <div className="fixed inset-0 z-40 flex justify-end">
          <motion.button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />

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
                <h2 className="sheet-title">
                  {title}
                </h2>
                {subtitle && <p className="mt-0.5 text-sm text-meta">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="icon-btn h-8 w-8">

                <XIcon className="h-4 w-4" />
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
      )
      )
    }
    </AnimatePresence>);

}