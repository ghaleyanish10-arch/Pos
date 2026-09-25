import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { menuItems as staticItems, menuCategories as staticCategories } from '../data/manage';
import { api } from '../api/client';

const MenuContext = createContext(null);

const ALL = 'All items';

// Parse a displayed price like "Rs 380.75" into 380.75 — keeps decimals
// (the old \D-strip made "Rs 380.75" into 38075 and charged 100x).
function toNumPrice(value) {
  const n = Number(String(value == null ? '' : value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function toDisplay(item, idToCat) {
  const category = idToCat[item.category_id] || 'Uncategorized';
  return {
    id: item.id || '',
    name: item.name,
    price: `Rs ${item.price}`,
    priceNum: Number(item.price),
    category,
    category_id: item.category_id || '',
    photo: item.photo_url || '',
    available: !!item.available
  };
}

export function MenuProvider({ children }) {
  const [items, setItems] = useState(staticItems);
  const [categories, setCategories] = useState(staticCategories);
  const [catIdByName, setCatIdByName] = useState({});
  const sourceRef = useRef('static');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catRes, itemRes] = await Promise.all([api('/menu/categories'), api('/menu')]);
        if (cancelled) return;
        const cats = catRes?.data || [];
        const apiItems = itemRes?.data || [];
        const idToCat = {};
        cats.forEach((c) => {
          idToCat[c.id] = c.name;
        });
        const names = cats.map((c) => c.name);
        const merged = [...names];
        staticCategories.forEach((c) => {
          if (c !== ALL && !names.includes(c)) merged.push(c);
        });
        const idMap = {};
        cats.forEach((c) => {
          idMap[c.name] = c.id;
        });
        setCatIdByName(idMap);
        setCategories([ALL, ...merged]);
        setItems(apiItems.map((it) => toDisplay(it, idToCat)));
        sourceRef.current = 'api';
      } catch {
        if (cancelled) return;
        sourceRef.current = 'static';
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addItem = useCallback((item) => {
    const local = {
      ...item,
      id: item.id || '',
      category_id: item.category_id || catIdByName[item.category] || ''
    };
    setItems((prev) => [...prev, local]);
    if (sourceRef.current === 'api') {
      api('/menu', {
        method: 'POST',
        body: {
          name: local.name,
          price: local.priceNum ?? toNumPrice(local.price),
          category_id: local.category_id,
          photo_url: local.photo || '',
          available: !!local.available
        }
      })
        .then((created) => {
          if (created && created.id) {
            setItems((prev) => prev.map((it) => (it.name === local.name && !it.id ? { ...it, id: created.id } : it)));
          }
        })
        .catch(() => {
          // The server rejected the creation: take the phantom item back off
          // the menu everywhere. Keeping it would show (and let staff sell)
          // something the store never received.
          setItems((prev) => prev.filter((it) => it !== local));
        });
    }
    return local;
  }, [catIdByName]);

  const updateItem = useCallback((index, item) => {
    const prevItem = items[index];
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...item } : it)));
    if (sourceRef.current === 'api' && prevItem && prevItem.id) {
      api(`/menu/${prevItem.id}`, {
        method: 'PUT',
        body: {
          name: item.name,
          price: item.priceNum ?? toNumPrice(item.price),
          category_id: item.category_id || catIdByName[item.category] || '',
          photo_url: item.photo || '',
          available: !!item.available
        }
      }).catch(() => {
        // Save failed — restore the item's last-known server state so the
        // register prices and availability match reality.
        setItems((prev) => prev.map((it) => (it.id === prevItem.id ? prevItem : it)));
      });
    }
  }, [items, catIdByName]);

  const removeItem = useCallback((name) => {
    setItems((prev) => prev.filter((it) => it.name !== name));
  }, []);

  const bulkUpdate = useCallback(async (ids, patch) => {
    if (!ids.length) return;
    const pricePatch = (it) => {
      if (patch.pricePercent !== undefined && patch.pricePercent !== null) {
        const cur = it.priceNum ?? toNumPrice(it.price);
        const next = Math.max(0, Math.round(cur * (1 + patch.pricePercent / 100) * 100) / 100);
        return { price: next, priceNum: next, pricePercent: undefined };
      }
      if (patch.priceDelta !== undefined && patch.priceDelta !== null) {
        const cur = it.priceNum ?? toNumPrice(it.price);
        const next = Math.max(0, cur + patch.priceDelta);
        return { price: next, priceNum: next, priceDelta: undefined };
      }
      return {};
    };
    // category_id may be given as a display name ("Momo & Snacks") — resolve to
    // the real server id; if it is already an id, keep it as-is.
    const resolvedCategory = patch.category_id
      ? catIdByName[patch.category_id] || patch.category_id
      : undefined;
    // Snapshot the affected items so a failed save can be rolled back instead
    // of leaving prices/availability different from what the store holds.
    const prevById = {};
    items.forEach((it) => {
      if (ids.includes(it.id)) prevById[it.id] = it;
    });
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, ...patch, ...pricePatch(it) } : it)));
    try {
      await api('/menu/bulk', {
        method: 'PUT',
        body: {
          ids,
          available: patch.available,
          published: patch.published,
          category_id: resolvedCategory,
          price_delta: patch.priceDelta,
          price_percent: patch.pricePercent
        }
      });
    } catch {
      setItems((prev) => prev.map((it) => (prevById[it.id] ? prevById[it.id] : it)));
    }
  }, [catIdByName, items]);

  const value = useMemo(
    () => ({ items, categories, categoriesById: catIdByName, addItem, updateItem, removeItem, bulkUpdate }),
    [items, categories, catIdByName, addItem, updateItem, removeItem, bulkUpdate]
  );

  return (
    <MenuContext.Provider value={value}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error('useMenu must be used within MenuProvider');
  return ctx;
}