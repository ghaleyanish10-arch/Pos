export const recipeLines = [
{ ingredient: 'Buff mince', qty: '120 g', unitCost: 78 },
{ ingredient: 'Momo wrappers', qty: '10 pcs', unitCost: 24 },
{ ingredient: 'Onion & garlic mix', qty: '40 g', unitCost: 9 },
{ ingredient: 'Tomato achar', qty: '60 g', unitCost: 14 },
{ ingredient: 'Coriander & spices', qty: '8 g', unitCost: 6 },
{ ingredient: 'Cooking oil', qty: '15 ml', unitCost: 5 }];


export const recipeMeta = {
  item: 'Momo Jhol',
  menuPrice: 420,
  yield: '1 plate · 10 pcs'
};

export const purchaseOrders = [
{ id: 'PO-0412', supplier: 'Everest Meats', items: 6, total: 'Rs 48,600', expected: '12 Sep', status: 'Sent' },
{ id: 'PO-0411', supplier: 'Kathmandu Foods', items: 11, total: 'Rs 32,180', expected: '11 Sep', status: 'Partially Received' },
{ id: 'PO-0410', supplier: 'Valley Greens', items: 8, total: 'Rs 14,240', expected: '10 Sep', status: 'Partially Received' },
{ id: 'PO-0409', supplier: 'Himalayan Roast', items: 3, total: 'Rs 21,900', expected: '09 Sep', status: 'Received' },
{ id: 'PO-0408', supplier: 'City Beverages', items: 14, total: 'Rs 68,400', expected: '08 Sep', status: 'Received' },
{ id: 'PO-0413', supplier: 'Nepal Oils', items: 2, total: 'Rs 9,600', expected: '—', status: 'Draft' }];


export const poLineItems = [
{ item: 'Buff mince', qty: 24, unit: 'kg', unitCost: 720 },
{ item: 'Chicken breast', qty: 18, unit: 'kg', unitCost: 640 },
{ item: 'Momo wrappers', qty: 600, unit: 'pcs', unitCost: 6 }];


export const transfersRequested = [
{ id: 'IBT-221', item: 'Momo wrappers', qty: '400 pcs', from: 'Central Kitchen', to: 'Thamel House', age: '18 min' },
{ id: 'IBT-222', item: 'Tomato achar', qty: '12 kg', from: 'Central Kitchen', to: 'Patan Branch', age: '35 min' }];


export const transfersInTransit = [
{ id: 'IBT-218', item: 'Buff mince', qty: '20 kg', from: 'Central Kitchen', to: 'Thamel House', eta: '25 min', age: '1 hr' },
{ id: 'IBT-219', item: 'Espresso beans', qty: '6 kg', from: 'Thamel House', to: 'Patan Branch', eta: '48 min', age: '1 hr' }];


export const transfersReceived = [
{ id: 'IBT-214', item: 'White rum', qty: '4 btl', from: 'Central Store', to: 'Thamel House', age: '3 hr' }];

export const suppliers = ['Everest Meats', 'Kathmandu Foods', 'Valley Greens', 'Himalayan Roast', 'City Beverages', 'Nepal Oils'];

export const branches = ['Central Kitchen', 'Thamel House', 'Patan Branch', 'Central Store'];

export const inventoryItems = ['Buff mince', 'Chicken breast', 'Momo wrappers', 'Tomato achar', 'Espresso beans', 'White rum', 'Cooking oil', 'Coriander & spices', 'Onion & garlic mix'];
