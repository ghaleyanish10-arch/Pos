import { useCallback, useMemo, useState } from 'react';
import { CheckIcon, SaveIcon, TriangleAlertIcon, Undo2Icon } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { inputClass } from '../../components/ui/Controls';

/**
 * Draft state for one settings section: local edits, dirty detection against
 * the committed value, and a clean reset. `committed` may change under us
 * (another tab saved, settings reloaded) — a clean draft follows it; a dirty
 * draft (the user typed) is never clobbered. Comparison is by value, not
 * identity: callers pass fresh object literals on every render.
 */
export function useDraft(committed) {
  const [draft, setDraft] = useState(committed);
  const [lastSeen, setLastSeen] = useState(() => JSON.stringify(committed));
  const touchedRef = useMemo(() => ({ current: false }), []);

  const committedJson = JSON.stringify(committed);
  if (committedJson !== lastSeen) {
    // Committed settings changed underneath us.
    if (!touchedRef.current) {
      setDraft(committed); // clean draft: follow the new committed values
    }
    setLastSeen(committedJson);
  }

  const set = useCallback((patch) => {
    touchedRef.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  }, [touchedRef]);

  const dirty = JSON.stringify(draft) !== committedJson;
  const reset = useCallback(() => setDraft(committed), [committedJson]);

  return { draft, set, dirty, reset, touched: touchedRef.current };
}

/**
 * The standard save bar for a settings section: appears only when the form is
 * dirty, shows saving/saved state honestly, and can gate on validation errors.
 */
export function SaveBar({ dirty, busy, justSaved, errors, onSave, onReset, saveLabel = 'Save changes' }) {
  const hasErrors = errors && Object.keys(errors).length > 0;
  return (
    <div
      aria-live="polite"
      className={`flex flex-wrap items-center justify-end gap-2 rounded-xl border px-4 py-3 transition-colors duration-150 ease-soft ${
        hasErrors
          ? 'border-status-red/30 bg-tint-red'
          : dirty
            ? 'border-status-amber/30 bg-tint-amber'
            : 'border-transparent bg-transparent'
      }`}>
      {hasErrors &&
        <span className="mr-auto flex items-center gap-2 text-sm font-semibold text-status-red">
          <TriangleAlertIcon className="h-4 w-4" />
          Fix {Object.keys(errors).length} field{Object.keys(errors).length === 1 ? '' : 's'} before saving
        </span>
      }
      {!hasErrors && dirty &&
        <span className="mr-auto text-sm font-semibold text-status-amber">Unsaved changes</span>
      }
      {!dirty && justSaved &&
        <span className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-status-green">
          <CheckIcon className="h-4 w-4" />
          Saved
        </span>
      }
      {!dirty && !justSaved &&
        <span className="mr-auto text-sm text-meta">All changes saved</span>
      }
      <Button size="sm" variant="outline" disabled={!dirty || busy} onClick={onReset}>
        <Undo2Icon className="h-3.5 w-3.5" />
        Discard
      </Button>
      <Button size="sm" variant="dark" disabled={!dirty || busy || hasErrors} onClick={onSave}>
        <SaveIcon className="h-3.5 w-3.5" />
        {busy ? 'Saving…' : saveLabel}
      </Button>
    </div>
  );
}

/**
 * Destructive-action confirmation: requires typing an exact word (default
 * "confirm") before the button unlocks — no accidental wipes from a single
 * mis-click. Used for reset-to-defaults and anything that can't be undone.
 */
export function ConfirmTyped({ open, onClose, title, body, confirmWord = 'reset', busy, onConfirm, confirmLabel }) {
  const [typed, setTyped] = useState('');
  const ready = typed.trim().toLowerCase() === confirmWord;
  return (
    <Dialog
      open={open}
      onClose={() => {
        setTyped('');
        onClose();
      }}
      title={title}
      subtitle={`Type "${confirmWord}" to enable the button`}>
      <p className="text-sm text-meta">{body}</p>
      <input
        className={`${inputClass} mt-3`}
        value={typed}
        autoFocus
        onChange={(e) => setTyped(e.target.value)}
        placeholder={confirmWord}
        aria-label={`Type ${confirmWord} to confirm`} />
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setTyped('');
            onClose();
          }}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={!ready || busy}
          onClick={() => {
            setTyped('');
            onConfirm();
          }}>
          {busy ? 'Working…' : confirmLabel || confirmWord}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Inline validation error under a field.
 */
export function FieldError({ children }) {
  if (!children) return null;
  return <p className="mt-1 text-xs font-semibold text-status-red">{children}</p>;
}
