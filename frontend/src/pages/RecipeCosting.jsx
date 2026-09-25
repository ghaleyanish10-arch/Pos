import { useEffect, useRef, useState } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Dialog } from '../components/ui/Dialog';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Field, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import api from '../api/client';

const fromLine = (l) => ({
  ingredient: l?.ingredient || '',
  qty: `${l?.qty ?? ''}`,
  unitCost: Number(l?.unit_cost) || 0
});

const toLineReq = (l) => ({
  ingredient: l.ingredient || '',
  qty: Number(String(l.qty).replace(/[^\d.]/g, '')) || 0,
  unit_cost: Number(l.unitCost) || 0
});

// Listing conveniences: the server already sends plate_cost and the linked
// menu item's price; the margin is pure arithmetic.
const plateCostOf = (r) => (r.plate_cost != null ? Number(r.plate_cost) || 0
  : (r.lines || []).reduce((s, l) => s + (Number(l.unit_cost) || 0), 0));

const menuPriceOf = (r) => (r.menu_price != null ? Number(r.menu_price) : Number(r.target_cost) || 0);
const marginOf = (price, cost) => (price > 0 ? Math.round(((price - cost) / price) * 100) : null);
const fmtRs = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? `Rs ${Math.round(Number(n))}` : '—');

/**
 * Recipe costing: a list of all recipes (name, plate cost, margin) is the
 * default view; clicking one opens the ingredient/costing editor. New recipes
 * start blank from the list. Saves actually surface failures instead of the
 * old silent .catch, and recipes can be archived from the list.
 */
export function RecipeCosting() {
  const toast = useToast();
  const [view, setView] = useState('list'); // list | edit
  const [recipes, setRecipes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [listError, setListError] = useState('');
  const [current, setCurrent] = useState(null);
  const [originals, setOriginals] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const nameRef = useRef(null);
  const addRef = useRef(null);

  const loadRecipes = async () => {
    try {
      const res = await api('/recipes');
      setRecipes(res?.data || []);
      setListError('');
    } catch (err) {
      setListError(err?.body?.error || err?.message || 'Could not load recipes.');
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    loadRecipes();
  }, []);

  useEffect(() => {
    if (view === 'edit' && !current?.id && nameRef.current) nameRef.current.focus();
  }, [view, current?.id]);

  const openRecipe = (r) => {
    const lines = (r.lines || []).map(fromLine);
    setCurrent({
      id: r.id,
      name: r.name || '',
      menu_price: r.menu_price != null ? Number(r.menu_price) : Number(r.target_cost) || 0,
      lines
    });
    setOriginals(lines.map((l) => ({ ...l })));
    setView('edit');
    setSaved(false);
  };

  const newRecipe = () => {
    setCurrent({ id: null, name: '', menu_price: 0, lines: [] });
    setOriginals([]);
    setView('edit');
    setSaved(false);
  };

  const backToList = () => {
    setView('list');
    setCurrent(null);
    setSaved(false);
  };

  const setCurrentField = (key) => (e) =>
    setCurrent((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    if (busy) return;
    const name = (current?.name || '').trim();
    if (!name) {
      toast.error('Enter a recipe name first.');
      return;
    }
    setBusy(true);
    setSaved(false);
    const body = {
      name,
      target_cost: Number(current.menu_price) || 0,
      lines: (current.lines || []).map(toLineReq)
    };
    try {
      if (current.id) {
        await api(`/recipes/${current.id}`, { method: 'PUT', body });
      } else {
        await api('/recipes', { method: 'POST', body });
      }
      setSaved(true);
      toast.success(current.id ? 'Recipe saved' : 'Recipe created');
      await loadRecipes();
      backToList();
    } catch (err) {
      toast.error(`${err?.body?.error || err?.message || 'Could not save the recipe.'} — nothing was changed.`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!delTarget || busy) return;
    setBusy(true);
    try {
      await api(`/recipes/${delTarget.id}`, { method: 'DELETE' });
      toast.success('Recipe deleted');
      setDelTarget(null);
      if (view === 'edit' && current?.id === delTarget.id) backToList();
      await loadRecipes();
    } catch (err) {
      toast.error(err?.body?.error || err?.message || 'Could not delete the recipe.');
    } finally {
      setBusy(false);
    }
  };

  // Editor math
  const plateCost = (current?.lines || []).reduce((s, l) => s + l.unitCost, 0);
  const menuPrice = view === 'edit' ? Number(current?.menu_price) || 0 : 0;
  const margin = menuPrice > 0 ? Math.round(((menuPrice - plateCost) / menuPrice) * 100) : null;
  const thin = margin !== null && margin < 60;

  const bump = (index, delta) =>
    setCurrent((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => (i === index ? { ...l, unitCost: Math.max(1, l.unitCost + delta) } : l))
    }));

  const updateIngredient = (index, field, value) =>
    setCurrent((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    }));

  const addIngredient = () => {
    setCurrent((prev) => ({
      ...prev,
      lines: [...prev.lines, { ingredient: 'New ingredient', qty: '0 g', unitCost: 0 }]
    }));
    setTimeout(() => {
      if (addRef.current) addRef.current.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const resetLines = () =>
    setCurrent((prev) => ({ ...prev, lines: originals.map((l) => ({ ...l })) }));

  const descriptor = view === 'list'
    ? `${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'}`
    : (current?.id ? `Editing ${current.name || 'recipe'}` : 'New recipe');

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title="Recipe & Costing" descriptor={descriptor}>
        {view === 'list' ? (
          <Button variant="dark" icon={<PlusIcon className="h-4 w-4" />} onClick={newRecipe}>
            New recipe
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={backToList}>← All recipes</Button>
            {current?.id && (
              <Button variant="outline" onClick={() => setDelTarget(current)} disabled={busy}>
                Delete
              </Button>
            )}
            <Button variant={saved ? 'green' : 'dark'} onClick={handleSave} disabled={busy}>
              {busy ? 'Saving…' : saved ? '✓ Saved' : 'Save recipe'}
            </Button>
          </>
        )}
      </PageHeader>

      {view === 'list' ? (
        <>
          {listError && <AlertBanner>{listError}</AlertBanner>}

          {!loaded ? (
            <p className="text-sm text-meta">Loading recipes…</p>
          ) : recipes.length === 0 ? (
            <Card>
              <p className="text-sm text-meta">No recipes yet.</p>
              <Button variant="dark" className="mt-4" onClick={newRecipe}>
                Create your first recipe
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {recipes.map((r) => {
                const cost = plateCostOf(r);
                const price = menuPriceOf(r);
                const m = marginOf(price, cost);
                return (
                  <Card key={r.id} padded={false} className="overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-5 pt-5">
                      <h3 className="truncate text-base font-extrabold tracking-tight text-ink">{r.name}</h3>
                      <button
                        type="button"
                        aria-label={`Delete ${r.name}`}
                        onClick={() => setDelTarget(r)}
                        className="icon-btn h-8 w-8 shrink-0 text-meta transition-colors duration-150 ease-soft hover:text-status-red">
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </div>
                    <button type="button" onClick={() => openRecipe(r)} className="w-full px-5 pb-5 pt-4 text-left">
                      <dl className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between">
                          <dt className="text-meta">Plate cost</dt>
                          <dd className="font-mono font-semibold">{fmtRs(cost)}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-meta">Menu price</dt>
                          <dd className="font-mono font-semibold">{fmtRs(price)}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex justify-end">
                        <Pill tone={m === null ? 'neutral' : m < 60 ? 'amber' : 'green'} dot>
                          {m === null ? 'n/a margin' : `${m}% margin`}
                        </Pill>
                      </div>
                    </button>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Field label="Recipe name">
              <input
                ref={nameRef}
                className={inputClass}
                value={current?.name || ''}
                onChange={setCurrentField('name')}
                placeholder="e.g. Momo Jhol" />
            </Field>
            <Field label="Menu price (Rs)">
              <input
                className={inputClass}
                type="number"
                min="0"
                step="1"
                value={current?.menu_price ?? ''}
                onChange={setCurrentField('menu_price')}
                placeholder="0" />
            </Field>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="text-base font-bold tracking-tight text-ink">Ingredients</h2>
                <span className="text-caption font-medium text-meta">Per serving</span>
              </div>

              <ul className="divide-y divide-line">
                {(current?.lines || []).map((l, i) => (
                  <li
                    key={`${l.ingredient}-${i}`}
                    ref={i === (current?.lines || []).length - 1 ? addRef : undefined}
                    className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <input
                        className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-meta focus:bg-surface focus:rounded-lg focus:px-2 focus:-mx-2"
                        value={l.ingredient}
                        onChange={(e) => updateIngredient(i, 'ingredient', e.target.value)}
                        aria-label="Ingredient name" />
                      <p className="text-xs text-meta">{l.qty} per serving</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => bump(i, -2)}
                        aria-label={`Reduce cost of ${l.ingredient}`}
                        className="h-8 w-8 rounded-lg border border-line bg-canvas text-sm font-bold text-ink">
                        −
                      </button>
                      <span className="w-20 text-right font-mono text-sm font-bold">Rs {l.unitCost}</span>
                      <button
                        type="button"
                        onClick={() => bump(i, 2)}
                        aria-label={`Increase cost of ${l.ingredient}`}
                        className="h-8 w-8 rounded-lg border border-line bg-canvas text-sm font-bold text-ink">
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <Button size="sm" variant="outline" className="mt-4" onClick={addIngredient}>
                Add ingredient
              </Button>
            </Card>

            <Card className="h-fit">
              <h2 className="text-base font-bold tracking-tight text-ink">Live cost</h2>

              <dl className="mt-4 space-y-2 text-sm">
                {(current?.lines || []).map((l, i) => (
                  <div key={`${l.ingredient}-${i}`} className="flex justify-between">
                    <dt className="text-meta">{l.ingredient}</dt>
                    <dd className="font-mono">Rs {l.unitCost}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 border-t border-line pt-4">
                <p className="text-caption font-semibold text-meta">Plate cost</p>
                <p className="mt-1 font-mono text-4xl font-extrabold tracking-tight text-ink">Rs {plateCost}</p>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
                <div>
                  <p className="text-xs text-meta">Menu price</p>
                  <p className="font-mono text-lg font-bold text-ink">Rs {menuPrice}</p>
                </div>
                <Pill tone={thin ? 'amber' : 'green'} dot>
                  {margin}% margin
                </Pill>
              </div>

              {thin && (
                <div className="mt-4">
                  <AlertBanner>
                    Margin under the 60% target — ingredient cost rose this week.
                  </AlertBanner>
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <Button variant="outline" onClick={resetLines}>Reset</Button>
                <Button variant="green" full onClick={() => { toast.success('Costing applied'); }}>
                  Apply costing
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      <Dialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        title="Delete recipe"
        subtitle={delTarget ? `"${delTarget.name}" and its ingredient lines will be archived.` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setDelTarget(null)}>Cancel</Button>
            <Button variant="dark" onClick={handleDelete} disabled={busy}>Delete</Button>
          </>
        }>
        <p className="text-sm text-meta">This cannot be undone from the app, but the recipe stays recoverable in the database.</p>
      </Dialog>
    </div>
  );
}