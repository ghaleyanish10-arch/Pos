import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleOffIcon,
  DownloadIcon,
  ImageIcon,
  IndianRupeeIcon,
  LayersIcon,
  UploadIcon,
  WalletIcon
} from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Drawer } from '../components/ui/Drawer';
import { Field, GhostCard, SearchInput, Tabs, Toggle, inputClass } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { useToast } from '../components/ui/Toast';
import { useMenu } from '../state/MenuContext';
import { csvFields } from '../data/manage';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayDow() {
  return String(new Date().getDay());
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function parseHHMM(hhmm) {
  const [h, m] = (hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Is the item actually sellable right now? Availability flag AND published
// AND inside its schedule window. Register and the online store derive their
// sellable list from this same predicate.
export function isSellableNow(item, dow = todayDow(), minutes = nowMinutes()) {
  if (!item.available || item.published === false) return false;
  if (!String(item.schedule_days || '').split(',').includes(dow)) return false;
  return minutes >= parseHHMM(item.schedule_start) && minutes <= parseHHMM(item.schedule_end);
}

function MenuImageField({ value, onChange }) {
  const [previewError, setPreviewError] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setPreviewError(false);
  }, [value]);

  const pickFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };

  const isDataUrl = typeof value === 'string' && value.startsWith('data:');

  return (
    <Field label="Image">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {value && !previewError ? (
            <img
              src={value}
              alt="Item preview"
              onError={() => setPreviewError(true)}
              className="h-20 w-20 shrink-0 rounded-xl border border-line object-cover" />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-line bg-canvas text-meta">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <input
              className={inputClass}
              value={isDataUrl ? '' : (value || '')}
              onChange={(e) => onChange(e.target.value)}
              placeholder={isDataUrl ? 'Uploaded image in use' : 'Paste an image URL'} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
                <UploadIcon className="h-3.5 w-3.5 text-meta" />
                Upload
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="inline-flex items-center rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-meta transition-colors duration-150 ease-soft hover:text-status-red">
                  Remove
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = '';
            }} />
        </div>
        <p className="text-caption leading-relaxed text-meta">
          Paste an image URL or upload a photo. The image shows on menu cards, in Register and on the online store.
        </p>
      </div>
    </Field>
  );
}

// Variants editor: named configurations with their own price (Steam/Fry/Jhol).
function VariantsEditor({ variants, onChange }) {
  return (
    <div>
      <p className="mb-2 text-caption font-semibold text-meta">
        Variants
      </p>
      <div className="space-y-2">
        {(variants || []).map((v, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-ink focus:outline-none"
              value={v.name}
              placeholder="Variant name (e.g. Jhol)"
              onChange={(e) => onChange(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <div className="flex items-center rounded-lg border border-line bg-surface px-2">
              <span className="font-mono text-xs text-meta">Rs</span>
              <input
                type="number"
                min="0"
                className="h-8 w-16 bg-transparent px-2 font-mono text-sm text-ink focus:outline-none"
                value={v.price}
                onChange={(e) => onChange(variants.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} />
            </div>
            <button
              type="button"
              aria-label={`Remove ${v.name}`}
              className="text-xs font-semibold text-meta hover:text-status-red"
              onClick={() => onChange(variants.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <GhostCard
        label="Add variant"
        className="mt-2 min-h-[52px]"
        onClick={() => onChange([...(variants || []), { name: '', price: 0 }])} />
    </div>
  );
}

// Modifiers editor: optional add-on groups with priced options.
function ModifiersEditor({ modifiers, onChange }) {
  return (
    <div>
      <p className="mb-2 text-caption font-semibold text-meta">
        Modifier groups
      </p>
      <div className="space-y-2">
        {(modifiers || []).map((m, i) => (
          <div key={i} className="rounded-xl border border-line bg-canvas p-3">
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink focus:outline-none"
                value={m.name}
                placeholder="Group name (e.g. Extra achar)"
                onChange={(e) => onChange(modifiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <div className="flex items-center rounded-lg border border-line bg-surface px-2">
                <span className="font-mono text-xs text-meta">Rs</span>
                <input
                  type="number"
                  min="0"
                  className="h-8 w-16 bg-transparent px-2 font-mono text-sm text-ink focus:outline-none"
                  value={m.price}
                  onChange={(e) => onChange(modifiers.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} />
              </div>
              <button
                type="button"
                aria-label={`Remove ${m.name}`}
                className="text-xs font-semibold text-meta hover:text-status-red"
                onClick={() => onChange(modifiers.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
            <input
              className="mt-2 w-full bg-transparent text-xs text-meta focus:outline-none"
              value={(m.options || []).join(', ')}
              placeholder="Options, comma separated (mild, medium, hot)"
              onChange={(e) => onChange(modifiers.map((x, j) => (j === i
                ? { ...x, options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }
                : x)))} />
          </div>
        ))}
      </div>
      <GhostCard
        label="Add modifier group"
        className="mt-2 min-h-[52px]"
        onClick={() => onChange([...(modifiers || []), { name: '', options: [], price: 0 }])} />
    </div>
  );
}

// Schedule editor: which days + which hours this item is on sale.
function ScheduleEditor({ item, onDays, onStart, onEnd }) {
  const days = String(item.schedule_days || '0,1,2,3,4,5,6').split(',');
  const toggleDay = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    onDays(next.join(','));
  };
  return (
    <div className="rounded-xl border border-line bg-canvas p-4">
      <div className="flex items-center gap-2">
        <CalendarClockIcon className="h-4 w-4 text-meta" />
        <p className="text-sm font-semibold text-ink">Scheduling</p>
      </div>
      <div className="mt-3 flex gap-1.5">
        {DAY_NAMES.map((name, idx) => {
          const d = String(idx);
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              aria-pressed={on}
              className={`h-9 flex-1 rounded-lg border text-xs font-bold transition-colors duration-150 ease-soft ${
                on ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-meta hover:text-ink'}`}>
              {name}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="From">
          <input type="time" className={inputClass} value={item.schedule_start || '00:00'} onChange={(e) => onStart(e.target.value)} />
        </Field>
        <Field label="Until">
          <input type="time" className={inputClass} value={item.schedule_end || '23:59'} onChange={(e) => onEnd(e.target.value)} />
        </Field>
      </div>
      <p className="mt-1 text-xs text-meta">
        Outside this window the item is hidden from Register and the online store — no manual 86ing needed.
      </p>
    </div>
  );
}

export function Menu() {
  const { items: allItems, categories: menuCategories, addItem, updateItem, bulkUpdate } = useMenu();
  const [category, setCategory] = useState('All items');
  const [tab, setTab] = useState('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const toast = useToast();

  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    price: '',
    cost: '',
    category: menuCategories[1],
    photo: '',
    available: true
  });

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState('86');
  const [bulkPercent, setBulkPercent] = useState('10');
  const [bulkCategory, setBulkCategory] = useState('');

  const [extraCategories, setExtraCategories] = useState([]);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [csvFile, setCsvFile] = useState(null);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishChannels, setPublishChannels] = useState({
    'POS terminals': true,
    'Online Store': true,
    'Delivery aggregators': false
  });
  const [publishSchedule, setPublishSchedule] = useState(false);
  const [publishDate, setPublishDate] = useState('');
  const [publishTime, setPublishTime] = useState('');

  const categoriesList = [...menuCategories, ...extraCategories];

  // Exceptions first: unavailable, unpublished, or outside their schedule.
  const flagged = allItems.filter((i) => !isSellableNow(i));
  const lowMargin = allItems.filter((i) => i.priceNum > 0 && i.cost > 0 && (i.priceNum - i.cost) / i.priceNum < 0.3);

  const filtered = useMemo(() => {
    let rows = allItems;
    if (category !== 'All items') rows = rows.filter((i) => i.category === category);
    if (tab === "86'd") rows = rows.filter((i) => !i.available);
    if (tab === 'Scheduled off') rows = rows.filter((i) => i.available && !isSellableNow(i));
    if (tab === 'Unpublished') rows = rows.filter((i) => i.published === false);
    if (tab === 'Thin margin') rows = rows.filter((i) => i.priceNum > 0 && i.cost > 0 && (i.priceNum - i.cost) / i.priceNum < 0.3);
    if (query) rows = rows.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
    return rows;
  }, [allItems, category, tab, query]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const runBulk = async () => {
    console.log('[bulk] runBulk fired', { ids: [...selected].filter(Boolean), bulkAction, bulkPercent, selectedSize: selected.size });
    const ids = [...selected].filter(Boolean);
    if (ids.length === 0) {
      toast('No selectable items — item rows are missing real ids (menu list 401 fallback?). Touching bulk fix requires the store-manager session.', { tone: 'red' });
      clearSelection();
      setBulkOpen(false);
      return;
    }
    if (bulkAction === '86') {
      await bulkUpdate(ids, { available: false });
      toast.success(`${ids.length} items 86'd`);
    } else if (bulkAction === 'restore') {
      await bulkUpdate(ids, { available: true });
      toast.success(`${ids.length} items back on sale`);
    } else if (bulkAction === 'publish') {
      await bulkUpdate(ids, { published: true });
      toast.success(`${ids.length} items published`);
    } else if (bulkAction === 'unpublish') {
      await bulkUpdate(ids, { published: false });
      toast.success(`${ids.length} items unpublished`);
    } else if (bulkAction === 'price') {
      const pct = Number(bulkPercent);
      if (!pct) {
        toast('Enter a percentage to adjust', { tone: 'red' });
        return;
      }
      await bulkUpdate(ids, { pricePercent: pct });
      toast.success(`Prices ${pct > 0 ? '+' : ''}${pct}% on ${ids.length} items`);
    } else if (bulkAction === 'category') {
      if (!bulkCategory) {
        toast('Pick a category first', { tone: 'red' });
        return;
      }
      const catId = '';
      await bulkUpdate(ids.map((id) => id), { category_id: catId, category: bulkCategory });
      toast.success(`${ids.length} items moved to ${bulkCategory}`);
    }
    clearSelection();
    setBulkOpen(false);
  };

  const menuStats = [
    { label: 'Items', value: allItems.length, meta: `${categoriesList.length - 1} categories` },
    { label: "86'd now", value: allItems.filter((i) => !i.available).length, meta: 'manually off' },
    { label: 'Off schedule', value: flagged.filter((i) => i.available && i.published !== false).length, meta: 'time/day gated' },
    { label: 'Avg margin', value: (() => {
        const withCost = allItems.filter((i) => i.priceNum > 0 && i.cost > 0);
        if (withCost.length === 0) return '—';
        const avg = withCost.reduce((s, i) => s + (i.priceNum - i.cost) / i.priceNum, 0) / withCost.length;
        return `${Math.round(avg * 100)}%`;
      })(), meta: 'price − cost' }
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Items & Menu" descriptor={`${allItems.length} items · ${flagged.length} not currently sellable`}>
        <SearchInput
          className="w-[220px]"
          placeholder="Search items"
          value={query}
          onChange={setQuery} />
        <Button variant="outline" onClick={() => {
          setImportStep(1);
          setCsvFile(null);
          setImportOpen(true);
        }}>Import CSV</Button>
        <Button variant="outline" onClick={() => setPublishOpen(true)}>Publish menu</Button>
        <Button variant="dark" onClick={() => setAddOpen(true)}>Add item</Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {menuStats.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface px-4 py-3.5">
            <p className="text-caption font-semibold text-meta">{s.label}</p>
            <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">{s.value}</p>
            {s.meta && <p className="mt-0.5 text-xs text-meta">{s.meta}</p>}
          </div>
        ))}
      </div>

      {flagged.length > 0 &&
      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-status-amber/30 bg-tint-amber px-4 py-3">
          <CircleOffIcon className="h-4 w-4 shrink-0 text-status-amber" />
          <p className="text-sm font-semibold text-ink">
            Not sellable right now:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {flagged.slice(0, 6).map((i) => (
              <button
                key={i.id || i.name}
                type="button"
                onClick={() => {
                  setEditing(i);
                  setEditDraft({ ...i });
                }}
                className="rounded-full border border-status-amber/40 bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:border-ink/40">
                {i.name}
              </button>
            ))}
            {flagged.length > 6 &&
          <span className="text-xs font-semibold text-meta">+{flagged.length - 6} more</span>
            }
          </div>
        </div>
      }

      <div className="mt-6">
        <Tabs
          options={['All', "86'd", 'Scheduled off', 'Unpublished', 'Thin margin']}
          value={tab}
          onChange={setTab}
          counts={{
            'All': allItems.length,
            "86'd": allItems.filter((i) => !i.available).length,
            'Scheduled off': allItems.filter((i) => i.available && i.published !== false && !isSellableNow(i)).length,
            'Unpublished': allItems.filter((i) => i.published === false).length,
            'Thin margin': lowMargin.length
          }}
          danger={tab === "86'd" ? undefined : undefined} />
      </div>

      {/* Bulk action bar — appears when items are selected */}
      {selected.size > 0 &&
      <div className="sticky top-2 z-30 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-ink/20 bg-ink px-4 py-3 text-white shadow-pop">
          <span className="text-sm font-bold">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => { setBulkAction('86'); setBulkOpen(true); }}>86 out</Button>
          <Button size="sm" variant="outline" onClick={() => { setBulkAction('restore'); setBulkOpen(true); }}>Restore</Button>
          <Button size="sm" variant="outline" onClick={() => { setBulkAction('price'); setBulkOpen(true); }}>
            <IndianRupeeIcon className="mr-1.5 h-3.5 w-3.5" /> Adjust price
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setBulkAction('category'); setBulkOpen(true); }}>
            <LayersIcon className="mr-1.5 h-3.5 w-3.5" /> Move category
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setBulkAction('publish'); setBulkOpen(true); }}>Publish</Button>
          <Button size="sm" variant="outline" onClick={() => { setBulkAction('unpublish'); setBulkOpen(true); }}>Unpublish</Button>
          <button type="button" onClick={clearSelection} className="ml-auto text-xs font-semibold text-white/70 hover:text-white">
            Clear selection
          </button>
        </div>
      }

      <div className="mt-5 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Menu categories" className="rounded-card border border-line bg-surface p-3">
          <ul className="space-y-0.5">
            {categoriesList.map((c) => {
              const count = c === 'All items' ? allItems.length : allItems.filter((i) => i.category === c).length;
              return (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => setCategory(c)}
                    aria-current={c === category ? 'true' : undefined}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors duration-150 ease-soft ${
                      c === category ?
                      'bg-canvas font-semibold text-ink' :
                      'text-meta hover:bg-canvas hover:text-ink'}`}>
                    <span>{c}</span>
                    <span className="font-mono text-xs">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <GhostCard label="Add category" className="mt-3 min-h-[72px]" onClick={() => setNewCatOpen(true)} />
        </nav>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((item) => {
            const sellable = isSellableNow(item);
            const isSelected = selected.has(item.id);
            const margin = item.priceNum > 0 && item.cost > 0 ? Math.round(((item.priceNum - item.cost) / item.priceNum) * 100) : null;
            return (
              <article
                key={item.id || item.name}
                className={`relative flex flex-col overflow-hidden rounded-card border bg-surface transition-colors duration-150 ease-soft ${
                  isSelected ? 'border-ink ring-2 ring-ink/20' : 'border-line'}`}>
                <label className="absolute left-2.5 top-2.5 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface/90 backdrop-blur">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-current"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.id)}
                    aria-label={`Select ${item.name}`} />
                </label>
                {item.photo ? (
                  <img
                    src={item.photo}
                    alt={item.name}
                    className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center bg-canvas text-meta/60">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-15 font-bold leading-tight text-ink">
                      {item.name}
                    </h3>
                    <span className="font-mono text-sm font-bold">{item.price}</span>
                  </div>
                  <p className="mt-1 text-xs text-meta">
                    {item.category}
                    {margin !== null && <span className={margin < 30 ? ' font-semibold text-status-amber' : ''}> · {margin}% margin</span>}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {!item.available ? (
                      <Pill tone="red" dot>86'd</Pill>
                    ) : !sellable ? (
                      <Pill tone="amber" dot>Off schedule</Pill>
                    ) : item.published === false ? (
                      <Pill tone="amber" dot>Unpublished</Pill>
                    ) : (
                      <Pill tone="green" dot>On sale</Pill>
                    )}
                    {item.variants?.length > 0 && (
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-caption font-semibold text-meta">
                        {item.variants.length} variant{item.variants.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(item);
                        setEditDraft({ ...item });
                      }}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={item.available ? 'outline' : 'dark'}
                      onClick={() => {
                        updateItem(allItems.findIndex((it) => (it.id || it.name) === (item.id || item.name)), { ...item, available: !item.available });
                        toast.success(item.available ? `${item.name} 86'd` : `${item.name} back on sale`);
                      }}>
                      {item.available ? '86' : 'Restore'}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 &&
          <div className="col-span-full rounded-xl border border-line bg-canvas p-6 text-center text-sm text-meta">
              {query
                ? `Nothing matches "${query}".`
                : tab === 'All'
                  ? 'No items yet — add your first one.'
                  : `No items in "${tab}" right now — that's good news.`}
            </div>
          }
          {tab === 'All' &&
          <GhostCard label="Add item" className="min-h-[228px]" onClick={() => setAddOpen(true)} />
          }
        </div>
      </div>

      {/* Edit drawer — pricing, variants, modifiers, schedule, publish */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? editing.name : ''}
        subtitle={editing ? `${editing.category} · ${editing.priceNum ? `Rs ${editing.priceNum}` : ''}` : ''}
        footer={
        <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="green"
              full
              disabled={!editDraft?.name.trim()}
              onClick={() => {
                if (editDraft) {
                  const idx = allItems.findIndex((it) => (it.id || it.name) === (editing.id || editing.name));
                  if (idx >= 0) updateItem(idx, editDraft);
                  toast.success(`${editDraft.name} updated`);
                }
                setEditing(null);
              }}>
              Save item
            </Button>
          </>
        }>
        {editing && editDraft &&
        <div className="space-y-5">
            <Field label="Item name">
              <input
                className={inputClass}
                value={editDraft.name}
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Selling price (Rs)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={editDraft.priceNum ?? ''}
                  onChange={(e) => setEditDraft((d) => ({ ...d, priceNum: Number(e.target.value), price: `Rs ${e.target.value}` }))} />
              </Field>
              <Field label="Cost (Rs)">
                <input
                  type="number"
                  min="0"
                  className={inputClass}
                  value={editDraft.cost ?? ''}
                  onChange={(e) => setEditDraft((d) => ({ ...d, cost: Number(e.target.value) }))} />
              </Field>
            </div>
            {editDraft.priceNum > 0 && editDraft.cost > 0 &&
          <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <WalletIcon className="h-4 w-4 text-meta" /> Margin
                </span>
                <span className={`font-mono text-sm font-extrabold ${((editDraft.priceNum - editDraft.cost) / editDraft.priceNum) < 0.3 ? 'text-status-amber' : 'text-status-green'}`}>
                  Rs {(editDraft.priceNum - editDraft.cost).toFixed(0)} · {Math.round(((editDraft.priceNum - editDraft.cost) / editDraft.priceNum) * 100)}%
                </span>
              </div>
            }
            <Field label="Category">
              <select
                className={inputClass}
                value={editDraft.category}
                onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}>
                {categoriesList.slice(1).map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <MenuImageField
              value={editDraft.photo || ''}
              onChange={(photo) => setEditDraft((d) => ({ ...d, photo }))} />

            <VariantsEditor
              variants={editDraft.variants || []}
              onChange={(variants) => setEditDraft((d) => ({ ...d, variants }))} />
            <ModifiersEditor
              modifiers={editDraft.modifiers || []}
              onChange={(modifiers) => setEditDraft((d) => ({ ...d, modifiers }))} />

            <ScheduleEditor
              item={editDraft}
              onDays={(schedule_days) => setEditDraft((d) => ({ ...d, schedule_days }))}
              onStart={(schedule_start) => setEditDraft((d) => ({ ...d, schedule_start }))}
              onEnd={(schedule_end) => setEditDraft((d) => ({ ...d, schedule_end }))} />

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Available today</p>
                  <p className="text-xs text-meta">Turning this off 86's the item everywhere</p>
                </div>
                <Toggle
                  checked={!!editDraft.available}
                  onChange={(v) => setEditDraft((d) => ({ ...d, available: v }))}
                  label="Available today" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Published</p>
                  <p className="text-xs text-meta">Unpublished items are hidden from POS and online store</p>
                </div>
                <Toggle
                  checked={editDraft.published !== false}
                  onChange={(v) => setEditDraft((d) => ({ ...d, published: v }))}
                  label="Published" />
              </div>
            </div>
          </div>
        }
      </Drawer>

      {/* Add drawer */}
      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add item"
        subtitle="Create a new menu item"
        footer={
        <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="green"
              full
              disabled={!newItem.name.trim() || !newItem.price.trim()}
              onClick={() => {
                const price = Number(newItem.price.replace(/\D/g, ''));
                addItem({
                  name: newItem.name.trim(),
                  price: `Rs ${price}`,
                  priceNum: price,
                  cost: Number(newItem.cost) || 0,
                  category: newItem.category,
                  photo: newItem.photo || '',
                  available: newItem.available,
                  published: true,
                  variants: [],
                  modifiers: []
                });
                toast.success(`"${newItem.name.trim()}" added to ${newItem.category}`);
                setCategory(newItem.category);
                setAddOpen(false);
                setNewItem({ name: '', price: '', cost: '', category: menuCategories[1], photo: '', available: true });
              }}>
              Add item
            </Button>
          </>
        }>
        <div className="space-y-5">
            <Field label="Item name">
              <input
                className={inputClass}
                value={newItem.name}
                onChange={(e) => setNewItem((n) => ({ ...n, name: e.target.value }))}
                placeholder="e.g. Chicken Wings"
                autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price">
                <div className="flex items-center rounded-xl border border-line bg-surface px-3 focus-within:border-ink">
                  <span className="font-mono text-sm text-meta">Rs</span>
                  <input
                    type="number"
                    min="0"
                    className="h-10 w-full bg-transparent px-3 font-mono text-sm font-semibold text-ink focus:outline-none"
                    value={newItem.price}
                    onChange={(e) => setNewItem((n) => ({ ...n, price: e.target.value }))}
                    placeholder="0" />
                </div>
              </Field>
              <Field label="Cost (optional)">
                <div className="flex items-center rounded-xl border border-line bg-surface px-3 focus-within:border-ink">
                  <span className="font-mono text-sm text-meta">Rs</span>
                  <input
                    type="number"
                    min="0"
                    className="h-10 w-full bg-transparent px-3 font-mono text-sm font-semibold text-ink focus:outline-none"
                    value={newItem.cost}
                    onChange={(e) => setNewItem((n) => ({ ...n, cost: e.target.value }))}
                    placeholder="0" />
                </div>
              </Field>
            </div>
            <Field label="Category">
              <select
                className={inputClass}
                value={newItem.category}
                onChange={(e) => setNewItem((n) => ({ ...n, category: e.target.value }))}>
                {categoriesList.slice(1).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <MenuImageField
              value={newItem.photo || ''}
              onChange={(photo) => setNewItem((n) => ({ ...n, photo }))} />
            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Available today</p>
                <p className="text-xs text-meta">Untick to add the item as 86'd</p>
              </div>
              <Toggle
                checked={newItem.available}
                onChange={(v) => setNewItem((n) => ({ ...n, available: v }))}
                label="Available today" />
            </div>
          </div>
      </Drawer>

      {/* Bulk confirm dialog */}
      <Dialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk edit"
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button variant="dark" full onClick={runBulk}>Apply to {selected.size} items</Button>
          </>
        }>
        <div className="space-y-4">
          <p className="text-sm text-meta">
            {bulkAction === 'price' && 'Adjust prices by a percentage for every selected item.'}
            {bulkAction === 'category' && 'Move every selected item into one category.'}
            {bulkAction === '86' && 'Every selected item is removed from sale immediately.'}
            {bulkAction === 'restore' && 'Every selected item goes back on sale.'}
            {bulkAction === 'publish' && 'Every selected item becomes visible on POS and the online store.'}
            {bulkAction === 'unpublish' && 'Every selected item is hidden from POS and the online store.'}
          </p>
          {bulkAction === 'price' &&
          <Field label="Change (%)">
              <input
                type="number"
                className={inputClass}
                value={bulkPercent}
                onChange={(e) => setBulkPercent(e.target.value)}
                placeholder="e.g. 10 to raise, -5 to discount" />
            </Field>
          }
          {bulkAction === 'category' &&
          <Field label="Target category">
              <select className={inputClass} value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
                <option value="">Select…</option>
                {categoriesList.slice(1).map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          }
        </div>
      </Dialog>

      <Drawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import CSV"
        subtitle={importStep === 1 ? 'Upload file' : 'Map columns'}
        footer={
        <>
            {importStep > 1 && (
              <Button variant="outline" onClick={() => setImportStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {importStep < 2 && (
              <Button
                variant="dark"
                full
                disabled={!csvFile}
                onClick={() => setImportStep((s) => s + 1)}>
                Next
              </Button>
            )}
            {importStep === 2 && (
              <Button
                variant="green"
                full
                onClick={() => {
                  toast(`Import of ${csvFile} queued — items appear after validation`, { tone: 'green' });
                  setImportOpen(false);
                }}>
                Import
              </Button>
            )}
          </>
        }>
        {importStep === 1 &&
        <div className="space-y-5">
            <button
              type="button"
              onClick={() => setCsvFile('menu_export_2026-09-10.csv')}
              className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line bg-canvas p-8 text-center transition-colors duration-150 ease-soft hover:border-ink/30">
              <UploadIcon className="h-8 w-8 text-meta" />
              {csvFile ? (
                <div>
                  <p className="text-sm font-semibold text-ink">{csvFile}</p>
                  <p className="mt-0.5 text-xs text-meta">Click to change file</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Click to select a CSV file
                  </p>
                  <p className="mt-0.5 text-xs text-meta">
                    Supports .csv and .xlsx formats
                  </p>
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={() => toast('Template downloaded', { tone: 'dark' })}
              className="flex w-full items-center gap-2 rounded-xl border border-line bg-canvas px-4 py-3 text-sm font-semibold text-ink transition-colors duration-150 ease-soft hover:border-ink/30">
              <DownloadIcon className="h-4 w-4 text-meta" />
              Download template
            </button>
          </div>
        }

        {importStep === 2 &&
        <div className="space-y-4">
            <p className="text-sm text-meta">
              Map each CSV column to a menu field.
            </p>
            <div className="space-y-2">
              {['name_col', 'price_col', 'category_col'].map((col) => (
                <div
                  key={col}
                  className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">
                    {col}
                  </span>
                  <span className="text-xs text-meta">→</span>
                  <select className={inputClass + ' w-[180px]'} defaultValue={col === 'name_col' ? 'Name' : col === 'price_col' ? 'Price' : 'Category'}>
                    {csvFields.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        }
      </Drawer>

      {/* Publish drawer — channel-level publishing with schedule */}
      <Drawer
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish menu"
        subtitle="Push changes to every sales channel"
        footer={
        <>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            {!publishSchedule ? (
              <Button
                variant="green"
                full
                onClick={() => {
                  toast('Menu published to ' + Object.entries(publishChannels).filter(([, on]) => on).map(([ch]) => ch).join(', '), { tone: 'green' });
                  setPublishOpen(false);
                }}>
                Publish now
              </Button>
            ) : (
              <Button
                variant="green"
                full
                disabled={!publishDate || !publishTime}
                onClick={() => {
                  toast(`Menu publish scheduled for ${publishDate} ${publishTime}`, { tone: 'green' });
                  setPublishOpen(false);
                }}>
                Schedule publish
              </Button>
            )}
          </>
        }>
        <div className="space-y-5">
            <div className="rounded-xl border border-line bg-canvas p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2Icon className="h-4 w-4 text-status-green" />
                <p className="text-sm font-semibold text-ink">Live summary</p>
              </div>
              <p className="mt-2 text-sm text-meta">
                {allItems.filter((i) => i.published !== false).length} published · {allItems.filter((i) => i.published === false).length} hidden ·{' '}
                {allItems.filter((i) => !i.available).length} 86'd
              </p>
            </div>

            <div>
              <p className="mb-3 text-caption font-semibold text-meta">
                Publish to
              </p>
              <div className="space-y-2">
                {Object.entries(publishChannels).map(([ch, on]) => (
                  <div
                    key={ch}
                    className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                    <span className="text-sm font-semibold text-ink">{ch}</span>
                    <Toggle
                      checked={on}
                      onChange={(v) => setPublishChannels((p) => ({ ...p, [ch]: v }))}
                      label={ch} />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Schedule for later</p>
                <p className="text-xs text-meta">Publish at a specific date & time</p>
              </div>
              <Toggle
                checked={publishSchedule}
                onChange={setPublishSchedule}
                label="Schedule for later" />
            </div>

            {publishSchedule &&
            <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input
                    type="date"
                    className={inputClass}
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)} />
                </Field>
                <Field label="Time">
                  <input
                    type="time"
                    className={inputClass}
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)} />
                </Field>
              </div>
            }
          </div>
      </Drawer>

      <Dialog
        open={newCatOpen}
        onClose={() => { setNewCatOpen(false); setNewCatName(''); }}
        title="Add category"
        footer={
          <>
            <Button variant="outline" onClick={() => { setNewCatOpen(false); setNewCatName(''); }}>
              Cancel
            </Button>
            <Button
              variant="dark"
              full
              disabled={!newCatName.trim()}
              onClick={() => {
                const name = newCatName.trim();
                setExtraCategories((prev) => [...prev, name]);
                toast.success(`Category "${name}" added`);
                setNewCatOpen(false);
                setNewCatName('');
              }}>
              Add category
            </Button>
          </>
        }>
        <Field label="Category name">
          <input
            className={inputClass}
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="e.g. Desserts"
            autoFocus />
        </Field>
      </Dialog>
    </div>);
}
