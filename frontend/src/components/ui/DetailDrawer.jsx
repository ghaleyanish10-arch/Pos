import { Dialog } from './Dialog';

export function DetailDrawer({ open, onClose, title, subtitle, items = [], footer, children }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={footer}
      width="max-w-md">
      <div className="scroll-thin max-h-[64vh] overflow-y-auto pr-1">
        {items.length > 0 && (
          <dl className="space-y-0 divide-y divide-line">
            {items.map(({ label, value, tone, mono, badge, wide }) => (
              <div key={label} className={`flex items-start justify-between gap-4 ${wide ? 'flex-col' : 'py-3'}`}>
                <dt className="text-13 font-medium text-meta">{label}</dt>
                {wide ? (
                  <dd className="mt-1 w-full text-sm text-ink">{value}</dd>
                ) : (
                  <dd className={`text-right text-sm ${mono ? 'font-mono font-semibold' : 'font-medium'} ${tone ? `text-status-${tone}` : 'text-ink'}`}>
                    {badge || value}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </Dialog>
  );
}

export function DetailRow({ label, value, tone, mono, badge, wide }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${wide ? 'flex-col' : 'py-3'}`}>
      <dt className="text-13 font-medium text-meta">{label}</dt>
      {wide ? (
        <dd className="mt-1 w-full text-sm text-ink">{value}</dd>
      ) : (
        <dd className={`text-right text-sm ${mono ? 'font-mono font-semibold' : 'font-medium'} ${tone ? `text-status-${tone}` : 'text-ink'}`}>
          {badge || value}
        </dd>
      )}
    </div>
  );
}

export function DetailSection({ title, children }) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-13 font-semibold text-meta">{title}</p>
      {children}
    </div>
  );
}