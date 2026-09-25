export const inventory = [
{ name: 'Buff mince', category: 'Meat', stock: 4, capacity: 40, unit: 'kg', threshold: 10, supplier: 'Everest Meats', restocked: '2 days ago', location: 'Main floor', estPrice: 850 },
{ name: 'Chicken breast', category: 'Meat', stock: 26, capacity: 60, unit: 'kg', threshold: 15, supplier: 'Everest Meats', restocked: 'Yesterday', location: 'Main floor', estPrice: 620 },
{ name: 'Momo wrappers', category: 'Dry goods', stock: 120, capacity: 800, unit: 'pcs', threshold: 300, supplier: 'Kathmandu Foods', restocked: '4 days ago', location: 'Main floor', estPrice: 5 },
{ name: 'Basmati rice', category: 'Dry goods', stock: 55, capacity: 80, unit: 'kg', threshold: 20, supplier: 'Kathmandu Foods', restocked: '6 days ago', location: 'Main floor', estPrice: 180 },
{ name: 'Fresh mint', category: 'Produce', stock: 0.4, capacity: 5, unit: 'kg', threshold: 1, supplier: 'Valley Greens', restocked: 'Today', location: 'Main floor', estPrice: 400 },
{ name: 'Tomatoes', category: 'Produce', stock: 18, capacity: 30, unit: 'kg', threshold: 8, supplier: 'Valley Greens', restocked: 'Today', location: 'Main floor', estPrice: 120 },
{ name: 'Cooking oil', category: 'Pantry', stock: 9, capacity: 40, unit: 'L', threshold: 12, supplier: 'Nepal Oils', restocked: '9 days ago', location: 'Bar', estPrice: 250 },
{ name: 'Espresso beans', category: 'Beverage', stock: 3.2, capacity: 15, unit: 'kg', threshold: 4, supplier: 'Himalayan Roast', restocked: '3 days ago', location: 'Bar', estPrice: 1200 },
{ name: 'Whole milk', category: 'Dairy', stock: 22, capacity: 40, unit: 'L', threshold: 10, supplier: 'Sujal Dairy', restocked: 'Today', location: 'Upstairs', estPrice: 110 },
{ name: 'White rum', category: 'Bar', stock: 5, capacity: 12, unit: 'btl', threshold: 4, supplier: 'City Beverages', restocked: '11 days ago', location: 'Bar', estPrice: 900 }];


export const reorderSuggestions = [
{ name: 'Buff mince', quantity: '24 kg', note: 'Based on 14-day velocity · 3.4 kg/day' },
{ name: 'Momo wrappers', quantity: '600 pcs', note: 'Based on 14-day velocity · 82 pcs/day' },
{ name: 'Cooking oil', quantity: '20 L', note: 'Based on 14-day velocity · 1.8 L/day' },
{ name: 'Espresso beans', quantity: '8 kg', note: 'Based on 14-day velocity · 0.6 kg/day' }];


export const menuCategories = [
'All items',
'Momo & Snacks',
'Mains',
'Grill',
'Bar',
'Dessert'];


export const menuItems = [
{ name: 'Chicken Momo', price: 'Rs 390', category: 'Momo & Snacks', photo: "/dishes/chicken-momo.jpg", available: true, variants: 'Steam · Fry · Jhol' },
{ name: 'Momo Jhol', price: 'Rs 420', category: 'Momo & Snacks', photo: "/dishes/momo-jhol.jpg", available: true, variants: 'Spice · Mild / Hot' },
{ name: 'Veg Momo', price: 'Rs 320', category: 'Momo & Snacks', photo: "/dishes/veg-momo.jpg", available: false, variants: 'Steam · Fry · Jhol' },
{ name: 'Thakali Set', price: 'Rs 995', category: 'Mains', photo: "/dishes/thakali-set.jpg", available: true, variants: 'Less rice option' },
{ name: 'Dal Bhat', price: 'Rs 720', category: 'Mains', photo: "/dishes/dal-bhat.jpg", available: true },
{ name: 'Buff Sekuwa', price: 'Rs 680', category: 'Grill', photo: "/dishes/buff-sekuwa.jpg", available: true, variants: 'Mild · Medium · Hot' },
{ name: 'Chicken Chilli', price: 'Rs 520', category: 'Grill', photo: "/dishes/chicken-chilli.jpg", available: true, variants: 'Bone-in · Boneless' },
{ name: 'Mint Mojito', price: 'Rs 450', category: 'Bar', photo: "/dishes/mint-mojito.jpg", available: true, variants: 'Sugar · Regular / Light' },
{ name: 'Old Fashioned', price: 'Rs 750', category: 'Bar', photo: "/dishes/old-fashioned.jpg", available: false },
{ name: 'Cheesecake', price: 'Rs 480', category: 'Dessert', photo: "/dishes/cheesecake.jpg", available: true, variants: 'Slice · 1 / 2' },
{ name: 'Tiramisu', price: 'Rs 520', category: 'Dessert', photo: "/dishes/tiramisu.jpg", available: true }];


export const guests = [
{ name: 'Anisha Shrestha', initials: 'AS', visits: 42, lastVisit: '2 days ago', avgSpend: 'Rs 2,180', tier: 'VIP', segment: ['VIP', 'Regulars'], note: 'Allergy: peanuts. Prefers corner table 12.' },
{ name: 'Bikash Rai', initials: 'BR', visits: 18, lastVisit: '1 week ago', avgSpend: 'Rs 1,420', tier: 'Regular', segment: ['Regulars'] },
{ name: 'Chloe Martin', initials: 'CM', visits: 3, lastVisit: 'Yesterday', avgSpend: 'Rs 980', tier: 'New', segment: ['New'], note: 'Vegetarian, no dairy.' },
{ name: 'Deepak Thapa', initials: 'DT', visits: 61, lastVisit: 'Today', avgSpend: 'Rs 3,040', tier: 'VIP', segment: ['VIP', 'Regulars', 'Birthday this month'] },
{ name: 'Elina Gurung', initials: 'EG', visits: 9, lastVisit: '3 weeks ago', avgSpend: 'Rs 1,150', tier: 'Regular', segment: ['Regulars', 'Birthday this month'] },
{ name: 'Farhan Ali', initials: 'FA', visits: 1, lastVisit: 'Today', avgSpend: 'Rs 640', tier: 'New', segment: ['New'] }];


export const guestTimeline = [
{ date: '10 Sep', detail: 'Table 12 · Rs 2,480 · Momo Jhol, Thakali Set' },
{ date: '28 Aug', detail: 'Table 5 · Rs 1,960 · Sekuwa platter, 2 mojitos' },
{ date: '14 Aug', detail: 'Takeaway · Rs 880 · Chicken Momo ×2' },
{ date: '02 Aug', detail: 'Table 12 · Rs 3,240 · Birthday dinner, 4 covers' }];


export const staff = [
{ name: 'Riya Sharma', role: 'Waiter', id: 'MST-101', email: 'riya@mesa.os', phone: '9800000101', joined: 'Mar 2024', station: 'Main floor' },
{ name: 'Kiran Lama', role: 'Kitchen', id: 'MST-102', email: 'kiran@mesa.os', phone: '9800000102', joined: 'Jul 2023', station: 'Kitchen line' },
{ name: 'Sunita K.C.', role: 'Kitchen', id: 'MST-103', email: 'sunita@mesa.os', phone: '9800000103', joined: 'Jan 2025', station: 'Pantry' },
{ name: 'Prakash Adhikari', role: 'Bar', id: 'MST-104', email: 'prakash@mesa.os', phone: '9800000104', joined: 'Nov 2022', station: 'Bar counter' },
{ name: 'Manisha Tamang', role: 'Host', id: 'MST-105', email: 'manisha@mesa.os', phone: '9800000105', joined: 'Sep 2024', station: 'Entrance' }];


export const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const shifts = [
{ staff: 'Riya Sharma', role: 'Waiter', day: 0, time: '10–18' },
{ staff: 'Riya Sharma', role: 'Waiter', day: 1, time: '10–18' },
{ staff: 'Riya Sharma', role: 'Waiter', day: 3, time: '14–22' },
{ staff: 'Riya Sharma', role: 'Waiter', day: 5, time: '14–22' },
{ staff: 'Kiran Lama', role: 'Kitchen', day: 0, time: '09–17' },
{ staff: 'Kiran Lama', role: 'Kitchen', day: 2, time: '09–17' },
{ staff: 'Kiran Lama', role: 'Kitchen', day: 3, time: '09–17' },
{ staff: 'Kiran Lama', role: 'Kitchen', day: 4, time: '12–20' },
{ staff: 'Sunita K.C.', role: 'Kitchen', day: 1, time: '12–20' },
{ staff: 'Sunita K.C.', role: 'Kitchen', day: 3, time: '12–20' },
{ staff: 'Sunita K.C.', role: 'Kitchen', day: 6, time: '12–20' },
{ staff: 'Prakash Adhikari', role: 'Bar', day: 3, time: '16–00' },
{ staff: 'Prakash Adhikari', role: 'Bar', day: 4, time: '16–00' },
{ staff: 'Prakash Adhikari', role: 'Bar', day: 5, time: '16–00' },
{ staff: 'Manisha Tamang', role: 'Host', day: 2, time: '17–23' },
{ staff: 'Manisha Tamang', role: 'Host', day: 3, time: '17–23' },
{ staff: 'Manisha Tamang', role: 'Host', day: 6, time: '11–19' }];


export const bookingTables = ['T2 · 2p', 'T5 · 4p', 'T12 · 6p', 'Terrace · 8p'];
export const bookingSlots = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

export const reservations = [
{ guest: 'Deepak Thapa', covers: 4, table: 'T5 · 4p', start: 0, duration: 2, status: 'Seated' },
{ guest: 'Anisha Shrestha', covers: 2, table: 'T2 · 2p', start: 1, duration: 1, status: 'Confirmed' },
{ guest: 'Gurung family', covers: 6, table: 'T12 · 6p', start: 2, duration: 2, status: 'Confirmed' },
{ guest: 'Corporate — Yeti Air', covers: 8, table: 'Terrace · 8p', start: 1, duration: 3, status: 'Confirmed' },
{ guest: 'Walk-in hold', covers: 2, table: 'T2 · 2p', start: 3, duration: 1, status: 'No-show' },
{ guest: 'Chloe Martin', covers: 2, table: 'T5 · 4p', start: 4, duration: 1, status: 'Confirmed' }];


export const waitlist = [
{ id: 'demo-wl-1', name: 'Bikash R.', party: 3, waited: '12 min', quoted: '20 min' },
{ id: 'demo-wl-2', name: 'Sara P.', party: 2, waited: '8 min', quoted: '15 min' },
{ id: 'demo-wl-3', name: 'Nabin & co.', party: 5, waited: '22 min', quoted: '30 min' },
{ id: 'demo-wl-4', name: 'Josh M.', party: 2, waited: '4 min', quoted: '25 min' }];


export const stockLocations = ['Main floor', 'Bar', 'Upstairs'];

export const csvFields = ['Name', 'Price', 'Category', 'Photo URL', 'Available'];

export const menuDiffData = [
{ type: 'added', name: 'Chicken Wings', detail: 'Rs 450 · Momo & Snacks' },
{ type: 'added', name: 'Garlic Naan', detail: 'Rs 180 · Mains' },
{ type: 'removed', name: 'Veg Momo', detail: 'Momo & Snacks' },
{ type: 'priceChanged', name: 'Buff Sekuwa', detail: 'Rs 650 → Rs 680' }];

export const laborBudget = { hours: 160, cost: 'Rs 128,000' };

export const bookingTimeSlots = ['12:00', '12:30', '13:00', '13:30', '14:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];

export const bookingSections = ['Indoor', 'Terrace', 'Bar area', 'Private room'];

export const bookingTableSections = {
  Indoor: ['T2 · 2p', 'T5 · 4p'],
  'Bar area': ['T12 · 6p'],
  Terrace: ['Terrace · 8p']
};

export const sectionTone = {
  Indoor: 'blue',
  Terrace: 'green',
  'Bar area': 'amber',
  'Private room': 'purple'
};
