import { useEffect, useRef, useState } from 'react';
import { DownloadIcon, ImageIcon, UploadIcon } from 'lucide-react';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Drawer } from '../components/ui/Drawer';
import { Field, GhostCard, Toggle, inputClass } from '../components/ui/Controls';
import { Pill } from '../components/ui/Pill';
import { useToast } from '../components/ui/Toast';
import { useMenu } from '../state/MenuContext';
import { csvFields, menuDiffData } from '../data/manage';

const mappingData = [
{ csvCol: 'name_col', mappedTo: 'Name' },
{ csvCol: 'price_col', mappedTo: 'Price' },
{ csvCol: 'category_col', mappedTo: 'Category' }];

const validationRows = [
{ row: 1, status: 'valid', name: 'Chicken Momo' },
{ row: 2, status: 'valid', name: 'Momo Jhol' },
{ row: 3, status: 'valid', name: 'Thakali Set' },
{ row: 4, status: 'error', name: '', error: 'Missing name' },
{ row: 5, status: 'valid', name: 'Dal Bhat' },
{ row: 6, status: 'valid', name: 'Buff Sekuwa' },
{ row: 7, status: 'valid', name: 'Chicken Chilli' },
{ row: 8, status: 'valid', name: 'Mint Mojito' },
{ row: 9, status: 'error', name: '???', error: 'Invalid price format' },
{ row: 10, status: 'valid', name: 'Old Fashioned' },
{ row: 11, status: 'valid', name: 'Cheesecake' },
{ row: 12, status: 'valid', name: 'Tiramisu' },
{ row: 13, status: 'valid', name: 'Sekuwa Platter' },
{ row: 14, status: 'error', name: '', error: 'Missing category' },
{ row: 15, status: 'valid', name: 'Aloo Tama' },
{ row: 16, status: 'valid', name: 'Chatamari' },
{ row: 17, status: 'valid', name: 'Sel Roti' },
{ row: 18, status: 'valid', name: 'Yomari' },
{ row: 19, status: 'valid', name: 'Gundruk' },
{ row: 20, status: 'valid', name: 'Newari Khaja' },
{ row: 21, status: 'valid', name: 'Juju Dhau' },
{ row: 22, status: 'valid', name: 'Samosa' },
{ row: 23, status: 'valid', name: 'Pakora' },
{ row: 24, status: 'valid', name: 'Chowmein' },
{ row: 25, status: 'valid', name: 'Fried Rice' },
{ row: 26, status: 'valid', name: 'Lassi' },
{ row: 27, status: 'valid', name: 'Masala Tea' }];

const validCount = validationRows.filter((r) => r.status === 'valid').length;
const errorCount = validationRows.filter((r) => r.status === 'error').length;

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
              placeholder={isDataUrl ? 'Uploaded image in use' : 'Paste an image URL'}
            />
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
        <p className="text-[11px] leading-relaxed text-meta">
          Paste an image URL or upload a photo. The image shows on menu cards, in Register and on the online store.
        </p>
      </div>
    </Field>
  );
}

export function Menu() {
  const { items: allItems, categories: menuCategories, addItem, updateItem } = useMenu();
  const [category, setCategory] = useState('All items');
  const [editing, setEditing] = useState(null);
  const [editIndex, setEditIndex] = useState(-1);
  const [editDraft, setEditDraft] = useState(null);
  const [available, setAvailable] = useState(true);
  const toast = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    price: '',
    category: menuCategories[1],
    photo: '',
    available: true
  });

  const [extraCategories, setExtraCategories] = useState([]);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const categoriesList = [...menuCategories, ...extraCategories];

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
  const [menuVersion, setMenuVersion] = useState(5);

  const items =
  category === 'All items' ?
  allItems :
  allItems.filter((i) => i.category === category);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Items & Menu" descriptor="84 items · 3 currently 86'd">
        <Button variant="dark" onClick={() => setAddOpen(true)}>Add item</Button>
        <Button variant="outline" onClick={() => {
          setImportStep(1);
          setCsvFile(null);
          setImportOpen(true);
        }}>Import CSV</Button>
        <Button variant="dark" onClick={() => {
          setPublishSchedule(false);
          setPublishDate('');
          setPublishTime('');
          setPublishOpen(true);
        }}>Publish menu</Button>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Menu categories" className="rounded-card border border-line bg-surface p-3">
          <ul className="space-y-0.5">
            {categoriesList.map((c) =>
            <li key={c}>
                <button
                type="button"
                onClick={() => setCategory(c)}
                aria-current={c === category ? 'true' : undefined}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors duration-150 ease-soft ${
                c === category ?
                'bg-canvas font-semibold text-ink' :
                'text-meta hover:bg-canvas hover:text-ink'}`
                }>
                
                  {c}
                </button>
              </li>
            )}
          </ul>
          <GhostCard label="Add category" className="mt-3 min-h-[72px]" onClick={() => setNewCatOpen(true)} />
        </nav>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
          <article
            key={item.name}
            className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
            
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
                  <h3 className="text-[15px] font-bold leading-tight text-ink">
                    {item.name}
                  </h3>
                  <span className="font-mono text-sm font-bold">{item.price}</span>
                </div>
                <p className="mt-1 text-xs text-meta">{item.category}</p>
                <div className="mt-3 flex items-center justify-between">
                  {item.available ?
                <Pill tone="green" dot>
                      Available
                    </Pill> :

                <Pill tone="red" dot>
                      86'd
                    </Pill>
                }
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(item);
                      setEditIndex(allItems.findIndex((it) => it.name === item.name));
                      setEditDraft({ ...item });
                      setAvailable(item.available);
                    }}>
                    Edit
                  </Button>
                </div>
              </div>
            </article>
          ))}
          <GhostCard label="Add item" className="min-h-[228px]" onClick={() => setAddOpen(true)} />
        </div>
      </div>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? editing.name : ''}
        subtitle={editing ? `${editing.category} · sold 42 this week` : ''}
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
                if (editDraft && editIndex >= 0) {
                  updateItem(editIndex, { ...editDraft, available });
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
            <Field label="Price">
              <input
                className={inputClass}
                value={editDraft.price}
                onChange={(e) => setEditDraft((d) => ({ ...d, price: e.target.value }))} />
            </Field>
            <Field label="Category">
              <select
                className={inputClass}
                value={editDraft.category}
                onChange={(e) => setEditDraft((d) => ({ ...d, category: e.target.value }))}>
                {categoriesList.slice(1).map((c) =>
              <option key={c}>{c}</option>
              )}
              </select>
            </Field>
            <MenuImageField
              value={editDraft.photo || ''}
              onChange={(photo) => setEditDraft((d) => ({ ...d, photo }))} />

            <Field label="Variants">
              <input
                className={inputClass}
                value={editDraft.variants || ''}
                onChange={(e) => setEditDraft((d) => ({ ...d, variants: e.target.value }))}
                placeholder="e.g. Steam · Fry · Jhol" />
            </Field>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Modifiers & variants
              </p>
              <ul className="space-y-2">
                {['Steamed / Fried / Jhol', 'Spice level: mild, medium, hot', 'Add extra achar · Rs 60'].map(
                (m) =>
                <li
                  key={m}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm">
                  
                      {m}
                      <button type="button" className="text-xs font-semibold text-meta hover:text-ink">
                        Edit
                      </button>
                    </li>

              )}
              </ul>
              <GhostCard label="Add modifier group" className="mt-2 min-h-[64px]" />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Available today</p>
                <p className="text-xs text-meta">Turning this off 86's the item everywhere</p>
              </div>
              <Toggle checked={available} onChange={setAvailable} label="Available today" />
            </div>
          </div>
        }
      </Drawer>

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
                  category: newItem.category,
                  photo: newItem.photo || '',
                  available: newItem.available,
                  variants: 'New item'
                });
                toast.success(`"${newItem.name.trim()}" added to ${newItem.category}`);
                setCategory(newItem.category);
                setAddOpen(false);
                setNewItem({ name: '', price: '', category: menuCategories[1], photo: '', available: true });
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
            </div>
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

      <Drawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import CSV"
        subtitle={
          importStep === 1
            ? 'Upload file'
            : importStep === 2
              ? 'Map columns'
              : importStep === 3
                ? 'Validation results'
                : 'Confirm import'
        }
        footer={
        <>
            {importStep > 1 && (
              <Button variant="outline" onClick={() => setImportStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {importStep < 4 && (
              <Button
                variant="dark"
                full
                disabled={importStep === 1 && !csvFile}
                onClick={() => setImportStep((s) => s + 1)}>
                Next
              </Button>
            )}
            {importStep === 4 && (
              <Button
                variant="green"
                full
                onClick={() => {
                  toast(`Imported ${validCount} items · ${errorCount} errors`, { tone: 'green' });
                  setImportOpen(false);
                }}>
                Import {validCount} items
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
              {mappingData.map((m) => (
                <div
                  key={m.csvCol}
                  className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
                  
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">
                    {m.csvCol}
                  </span>
                  <span className="text-xs text-meta">→</span>
                  <select className={inputClass + ' w-[180px]'} defaultValue={m.mappedTo}>
                    {csvFields.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        }

        {importStep === 3 &&
        <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Pill tone="green" dot>{validCount} valid</Pill>
              <Pill tone="red" dot>{errorCount} errors</Pill>
            </div>
            <div className="max-h-[360px] space-y-1.5 overflow-y-auto">
              {validationRows.map((r) => (
                <div
                  key={r.row}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                  r.status === 'error'
                    ? 'border-status-red/30 bg-tint-red/40'
                    : 'border-status-green/30 bg-tint-green/40'}`
                  }>
                  
                  <span className="text-meta">Row {r.row}</span>
                  <span className={`font-semibold ${r.status === 'error' ? 'text-status-red' : 'text-ink'}`}>
                    {r.name || '(empty)'}
                  </span>
                  {r.error && (
                    <span className="text-xs text-status-red">{r.error}</span>
                  )}
                  {r.status === 'valid' && (
                    <Pill tone="green">Valid</Pill>
                  )}
                </div>
              ))}
            </div>
          </div>
        }

        {importStep === 4 &&
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-canvas p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Rows to import
                </p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-ink">
                  {validCount}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                  Errors skipped
                </p>
                <p className="mt-1 font-mono text-2xl font-extrabold text-status-red">
                  {errorCount}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-4">
              <p className="text-sm font-semibold text-ink">Source file</p>
              <p className="mt-0.5 font-mono text-xs text-meta">{csvFile}</p>
            </div>

            <div className="space-y-2">
              {mappingData.map((m) => (
                <div
                  key={m.csvCol}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2 text-sm">
                  
                  <span className="font-mono text-meta">{m.csvCol}</span>
                  <span className="text-xs text-meta">→</span>
                  <span className="font-semibold text-ink">{m.mappedTo}</span>
                </div>
              ))}
            </div>
          </div>
        }
      </Drawer>

      <Drawer
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish menu"
        subtitle={`Menu v${menuVersion} → v${menuVersion + 1}`}
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
                  toast(`Menu v${menuVersion + 1} published`, { tone: 'green' });
                  setMenuVersion((v) => v + 1);
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
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
                Changes
              </p>
              <div className="space-y-1.5">
                {menuDiffData.map((d, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                    d.type === 'added'
                      ? 'border-status-green/30 bg-tint-green/40'
                      : d.type === 'removed'
                        ? 'border-status-red/30 bg-tint-red/40'
                        : 'border-status-amber/30 bg-tint-amber/40'}`
                    }>
                    
                    <span className="font-semibold text-ink">{d.name}</span>
                    <span className="text-xs text-meta">{d.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
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
