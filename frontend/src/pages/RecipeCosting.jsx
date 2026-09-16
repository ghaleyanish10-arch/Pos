import { useState, useRef, useEffect } from 'react';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Dialog } from '../components/ui/Dialog';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Field, inputClass } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';
import { recipeLines, recipeMeta } from '../data/ims';
import api from '../api/client';

const fromLine = (l) => ({
  ingredient: l.ingredient || '',
  qty: `${l.qty ?? ''}`,
  unitCost: Number(l.unit_cost) || 0
});

const toLineReq = (l) => ({
  ingredient: l.ingredient || '',
  qty: Number(String(l.qty).replace(/[^\d.]/g, '')) || 0,
  unit_cost: Number(l.unitCost) || 0
});

export function RecipeCosting() {
  const toast = useToast();
  const [lines, setLines] = useState(recipeLines);
  const [meta, setMeta] = useState(recipeMeta);
  const [recipeId, setRecipeId] = useState(null);
  const [saved, setSaved] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupName, setDupName] = useState('');
  const nameRef = useRef(null);
  const addRef = useRef(null);

  const plateCost = lines.reduce((s, l) => s + l.unitCost, 0);
  const margin = Math.round(
    (meta.menuPrice - plateCost) / meta.menuPrice * 100
  );
  const thin = margin < 60;

  const bump = (index, delta) =>
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, unitCost: Math.max(1, l.unitCost + delta) } : l
      )
    );

  const handleSave = () => {
    setSaved(true);
    const body = { name: meta.item, target_cost: meta.menuPrice, lines: lines.map(toLineReq) };
    if (recipeId) {
      api(`/recipes/${recipeId}`, { method: 'PUT', body }).catch(() => {});
    } else {
      api('/recipes', { method: 'POST', body }).catch(() => {});
    }
    toast.success('Recipe saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDuplicate = () => {
    if (!dupName.trim()) return;
    setLines([...lines.map((l) => ({ ...l }))]);
    setDupOpen(false);
    setDupName('');
    toast.success(`Duplicated as ${dupName.trim()}`);
  };

  const openDuplicate = () => {
    setDupOpen(true);
  };

  useEffect(() => {
    if (dupOpen && nameRef.current) nameRef.current.focus();
  }, [dupOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/recipes');
        if (cancelled) return;
        const data = res?.data || [];
        if (data.length > 0) {
          const recipe = data[0];
          if (Array.isArray(recipe.lines) && recipe.lines.length > 0) {
            setLines(recipe.lines.map(fromLine));
          }
          if (recipe.id) setRecipeId(recipe.id);
          if (recipe.name) setMeta((prev) => ({ ...prev, item: recipe.name }));
        }
      } catch {
        // keep static demo data as fallback
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const addIngredient = () => {
    const newLine = { ingredient: 'New ingredient', qty: '0 g', unitCost: 0 };
    setLines((prev) => [...prev, newLine]);
    setTimeout(() => {
      if (addRef.current) addRef.current.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const updateIngredient = (index, field, value) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Recipe & Costing"
        descriptor={`${meta.item} · ${meta.yield}`}>

        <Button variant="outline" onClick={openDuplicate}>Duplicate recipe</Button>
        <Button variant={saved ? 'green' : 'dark'} onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save recipe'}
        </Button>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-base font-extrabold uppercase tracking-[0.08em] text-ink">
              Ingredients
            </h2>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-meta">
              Per serving
            </span>
          </div>

          <ul className="divide-y divide-line">
            {lines.map((l, i) =>
              <li key={`${l.ingredient}-${i}`} ref={i === lines.length - 1 ? addRef : undefined} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <input
                    className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-meta focus:bg-surface focus:rounded-lg focus:px-2 focus:-mx-2"
                    value={l.ingredient}
                    onChange={(e) => updateIngredient(i, 'ingredient', e.target.value)}
                    aria-label="Ingredient name"
                  />
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
                  <span className="w-20 text-right font-mono text-sm font-bold">
                    Rs {l.unitCost}
                  </span>
                  <button
                    type="button"
                    onClick={() => bump(i, 2)}
                    aria-label={`Increase cost of ${l.ingredient}`}
                    className="h-8 w-8 rounded-lg border border-line bg-canvas text-sm font-bold text-ink">
                    +
                  </button>
                </div>
              </li>
            )}
          </ul>

          <Button size="sm" variant="outline" className="mt-4" onClick={addIngredient}>
            Add ingredient
          </Button>
        </Card>

        <Card className="h-fit">
          <h2 className="text-base font-extrabold uppercase tracking-[0.08em] text-ink">
            Live cost
          </h2>

          <dl className="mt-4 space-y-2 text-sm">
            {lines.map((l, i) =>
              <div key={`${l.ingredient}-${i}`} className="flex justify-between">
                <dt className="text-meta">{l.ingredient}</dt>
                <dd className="font-mono">Rs {l.unitCost}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-meta">
              Plate cost
            </p>
            <p className="mt-1 font-mono text-4xl font-extrabold tracking-tight text-ink">
              Rs {plateCost}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
            <div>
              <p className="text-xs text-meta">Menu price</p>
              <p className="font-mono text-lg font-bold text-ink">Rs {meta.menuPrice}</p>
            </div>
            <Pill tone={thin ? 'amber' : 'green'} dot>
              {margin}% margin
            </Pill>
          </div>

          {thin &&
            <div className="mt-4">
              <AlertBanner>
                Margin under the 60% target — ingredient cost rose this week.
              </AlertBanner>
            </div>
          }

          <div className="mt-5 flex gap-2">
            <Button variant="outline" onClick={() => setLines(recipeLines)}>
              Reset
            </Button>
            <Button variant="green" full onClick={() => { toast.success('Costing applied'); }}>
              Apply costing
            </Button>
          </div>
        </Card>
      </div>

      <Dialog
        open={dupOpen}
        onClose={() => { setDupOpen(false); setDupName(''); }}
        title="Duplicate recipe"
        subtitle="Name for the copy"
        footer={
          <>
            <Button variant="outline" onClick={() => { setDupOpen(false); setDupName(''); }}>Cancel</Button>
            <Button variant="dark" onClick={handleDuplicate}>Copy</Button>
          </>
        }
      >
        <Field label="Recipe name">
          <input
            ref={nameRef}
            className={inputClass}
            value={dupName}
            onChange={(e) => setDupName(e.target.value)}
            placeholder="e.g. Momo Jhol (Copy)"
            onKeyDown={(e) => { if (e.key === 'Enter') handleDuplicate(); }}
          />
        </Field>
      </Dialog>
    </div>);
}
