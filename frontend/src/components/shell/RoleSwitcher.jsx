import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';
import { ROLES, ROLE_IDS, useRole } from '../../state/RoleContext';

export function RoleSwitcher() {
  const { role, setRole } = useRole();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 transition-colors duration-150 ease-soft hover:border-ink/30">
        
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
          RS
        </span>
        <span className="hidden text-[13px] font-semibold text-ink sm:block">
          Riya · {ROLES[role].label}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="flex">
          
          <ChevronDownIcon className="h-4 w-4 text-meta" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open &&
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="absolute right-0 top-11 z-40 w-[232px] rounded-xl border border-line bg-surface p-2 shadow-pop">
          
            <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Switch role (demo)
            </p>
            {ROLE_IDS.map((id) => {
              const r = ROLES[id];
              const active = id === role;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setRole(id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 ease-soft ${
                  active ?
                  'bg-canvas font-semibold text-ink' :
                  'text-meta hover:bg-canvas hover:text-ink'}`
                  }>
                  
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                    active ? 'bg-ink text-white' : 'bg-canvas text-meta'}`
                    }>
                    
                    {r.initials}
                  </span>
                  {r.label}
                </button>);

            })}
          </motion.div>
        }
      </AnimatePresence>
    </div>);

}