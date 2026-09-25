export const floorRooms = ['Hall', 'Balcony', 'Mezzanine', 'Courtyard'];

// ILLUSTRATIVE ONLY — offline fallback for when the backend is unreachable.
// Once GET /tables responds, the server's derived state (and its live
// bill_dropped / needs_attention flags) fully replaces this list.
export const floorTables = [
{ name: 'T1', seats: 2, state: 'Open', detail: 'Free', room: 'Hall' },
{ name: 'T2', seats: 2, state: 'Seated', detail: '2 covers · 18 min', room: 'Balcony' },
{ name: 'T3', seats: 4, state: 'Open', detail: 'Free', room: 'Hall' },
{ name: 'T4', seats: 4, state: 'Check dropped', detail: 'Rs 3,120 · waiting', room: 'Hall' },
{ name: 'T5', seats: 4, state: 'Seated', detail: '4 covers · 42 min', room: 'Balcony' },
{ name: 'T6', seats: 2, state: 'Needs attention', detail: 'No order in 12 min', room: 'Balcony' },
{ name: 'T7', seats: 6, state: 'Seated', detail: '5 covers · 9 min', room: 'Mezzanine' },
{ name: 'T8', seats: 2, state: 'Open', detail: 'Free', room: 'Mezzanine' },
{ name: 'T9', seats: 4, state: 'Check dropped', detail: 'Rs 1,860 · waiting', room: 'Mezzanine' },
{ name: 'T10', seats: 2, state: 'Open', detail: 'Free', room: 'Courtyard' },
{ name: 'T11', seats: 6, state: 'Seated', detail: '6 covers · 55 min', room: 'Courtyard' },
{ name: 'T12', seats: 6, state: 'Needs attention', detail: 'Allergy flag open', room: 'Courtyard' }];


export const tableBill = [
{ item: '2× Momo Jhol', amount: 840 },
{ item: '1× Chicken Chilli', amount: 520 },
{ item: '1× Thakali Set', amount: 995 },
{ item: '3× Mint Mojito', amount: 1350 }];


export const retailCart = [
{ sku: '8901-2231', name: 'Himalayan Roast beans 250g', qty: 2, price: 890 },
{ sku: '8901-4410', name: 'Chilli achar jar', qty: 1, price: 420 },
{ sku: '8901-9982', name: 'Mesa tote bag', qty: 1, price: 650 }];


export const stations = ['Kitchen', 'Bar', 'Dessert', 'Expo'];

export const failedTransactions = [
  {
    id: 'TXN-8836',
    fiscalId: 'IRD-2026-08836',
    ref: 'Table 2',
    amount: 'Rs 4,260',
    time: '13:20',
    method: 'Card',
    error: 'IRD gateway returned timeout at 13:21 — connection reset by remote host',
    payload: {
      invoiceNumber: 'TXN-8836',
      fiscalId: 'IRD-2026-08836',
      totalAmount: 4260,
      vatAmount: 639,
      netAmount: 3621,
      taxpayerPin: '600123456',
      timestamp: '2026-09-10T13:20:00+05:45',
      items: [
        { desc: 'Buff Sekuwa', qty: 1, rate: 1450 },
        { desc: 'Chowmein', qty: 2, rate: 520 },
        { desc: 'Mojito', qty: 2, rate: 420 },
        { desc: 'Old Fashioned', qty: 1, rate: 950 }
      ]
    }
  }
];
