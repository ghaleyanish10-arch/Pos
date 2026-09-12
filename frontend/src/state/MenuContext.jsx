import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { menuItems as staticItems, menuCategories as staticCategories } from '../data/manage';
import { api } from '../api/client';

const MenuContext = createContext(null);

const ALL = 'All items';

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
          price: local.priceNum ?? Number(String(local.price).replace(/\D/g, '')),
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
        .catch(() => {});
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
          price: item.priceNum ?? Number(String(item.price).replace(/\D/g, '')),
          category_id: item.category_id || catIdByName[item.category] || '',
          photo_url: item.photo || '',
          available: !!item.available
        }
      }).catch(() => {});
    }
  }, [items, catIdByName]);

  const removeItem = useCallback((name) => {
    setItems((prev) => prev.filter((it) => it.name !== name));
  }, []);

  const value = useMemo(
    () => ({ items, categories, categoriesById: catIdByName, addItem, updateItem, removeItem }),
    [items, categories, catIdByName, addItem, updateItem, removeItem]
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