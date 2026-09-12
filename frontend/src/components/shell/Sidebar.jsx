import { NavLink } from 'react-router-dom';
import { useRole, visibleGroupsFor } from '../../state/RoleContext';
import { useSettings } from '../../state/SettingsContext';

export function Sidebar({ onNavigate }) {
  const { role } = useRole();
  const groups = visibleGroupsFor(role);
  const { settings } = useSettings();

  return (
    <nav
      aria-label="Primary"
      className="scroll-thin h-full w-[264px] shrink-0 overflow-y-auto border-r border-line bg-surface px-4 py-5">
      
      <NavLink
        to="/"
        onClick={onNavigate}
        className="mb-6 flex items-center gap-2.5 px-2">
        
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink font-mono text-sm font-bold text-white">
          {(settings.name || 'M').charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-sm font-extrabold uppercase tracking-[0.14em] text-ink">
          {settings.name}
        </span>
      </NavLink>

      {groups.map((group) =>
      <div key={group.index} className="mb-5">
          <div className="mb-2 flex items-baseline gap-2 px-2">
            <span className="font-mono text-[11px] text-meta">{group.index}</span>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink">
              {group.title}
            </span>
          </div>
          <ul className="space-y-0.5">
            {group.items.map((item) =>
          <li key={item.path}>
                <NavLink
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors duration-150 ease-soft ${
              isActive ?
              'bg-canvas font-semibold text-ink' :
              'text-meta hover:bg-canvas hover:text-ink'}`

              }>
              
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  {item.alert &&
              <span
                className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-status-red"
                aria-label="Needs attention" />

              }
                </NavLink>
              </li>
          )}
          </ul>
        </div>
      )}
    </nav>);

}
