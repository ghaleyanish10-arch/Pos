export function shortId(id) {
  if (!id) return '#----';
  if (id.startsWith('#')) return id;
  return `#${id.slice(0, 5).toUpperCase()}`;
}

function elapsedFrom(iso) {
  if (!iso) return '0 min';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '0 min';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  return `${mins} min`;
}

export function normalizeTicket(t) {
  return {
    ...t,
    id: t.id,
    type: t.type || 'dine-in',
    ai: !!t.ai_phone,
    ai_phone: t.ai_phone,
    linked: !!t.linked_ticket_id,
    allergy: t.allergy || '',
    elapsed: t.elapsed || elapsedFrom(t.created_at),
    status: t.status || 'incoming',
    station: t.station || 'Kitchen',
    items: t.items || []
  };
}