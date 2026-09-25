// Single source of truth for table-state presentation so the floor plan
// (Front of House) and every other surface that lists tables show the SAME
// labels and order. The backend (GET /tables) reports raw state values
// ('Open', 'Seated', 'Check dropped', 'Needs attention', 'Reserved'); the
// user-facing label for a state lives here, exactly once.
export const TABLE_STATE_META = {
  'Needs attention': { label: 'Action needed', dot: 'bg-status-red' },
  Seated: { label: 'Seated', dot: 'bg-status-blue' },
  'Check dropped': { label: 'Check dropped', dot: 'bg-status-amber' },
  Open: { label: 'Vacant', dot: 'bg-status-green' }
};

// Canonical display order — busiest/attention states first, available last.
export const TABLE_STATE_ORDER = ['Needs attention', 'Seated', 'Check dropped', 'Open'];