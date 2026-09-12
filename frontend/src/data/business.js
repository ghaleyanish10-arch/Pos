export const revenueSeries = [
{ day: 'Mon', revenue: 62000, covers: 118 },
{ day: 'Tue', revenue: 58400, covers: 104 },
{ day: 'Wed', revenue: 71200, covers: 131 },
{ day: 'Thu', revenue: 86400, covers: 152 },
{ day: 'Fri', revenue: 104800, covers: 186 },
{ day: 'Sat', revenue: 118600, covers: 214 },
{ day: 'Sun', revenue: 81200, covers: 148 }];


export const topSellers = [
{ name: 'Chicken Momo', sold: 284, revenue: 'Rs 1,10,760' },
{ name: 'Thakali Set', sold: 176, revenue: 'Rs 1,75,120' },
{ name: 'Buff Sekuwa', sold: 141, revenue: 'Rs 95,880' },
{ name: 'Mint Mojito', sold: 128, revenue: 'Rs 57,600' },
{ name: 'Dal Bhat', sold: 96, revenue: 'Rs 69,120' }];


export const slowMovers = [
{ name: 'Beetroot Salad', sold: 4, revenue: 'Rs 1,520' },
{ name: 'Herbal Tea', sold: 6, revenue: 'Rs 1,080' },
{ name: 'Tiramisu', sold: 9, revenue: 'Rs 4,680' },
{ name: 'Veg Sizzler', sold: 11, revenue: 'Rs 8,140' },
{ name: 'Lemon Soda', sold: 12, revenue: 'Rs 2,400' }];


export const invoices = [
{ id: 'INV-2041', party: 'Yeti Airlines — corporate dinner', amount: 'Rs 84,200', due: '18 Sep', status: 'Sent' },
{ id: 'INV-2040', party: 'Everest Meats (vendor)', amount: 'Rs 46,800', due: '04 Sep', status: 'Overdue' },
{ id: 'INV-2039', party: 'Himalayan Roast (vendor)', amount: 'Rs 18,400', due: '02 Sep', status: 'Overdue' },
{ id: 'INV-2038', party: 'Thamel Hostel — group booking', amount: 'Rs 32,600', due: '12 Sep', status: 'Sent' },
{ id: 'INV-2037', party: 'Valley Greens (vendor)', amount: 'Rs 9,850', due: '29 Aug', status: 'Paid' },
{ id: 'INV-2036', party: 'Private event — Rai wedding', amount: 'Rs 1,42,000', due: '25 Aug', status: 'Paid' },
{ id: 'INV-2042', party: 'New — untitled', amount: 'Rs 0', due: '—', status: 'Draft' }];


export const loyaltyTiers = [
{
  name: 'Bronze',
  members: '742 members',
  perks: ['1 point per Rs 100', 'Birthday dessert', 'Early access to events']
},
{
  name: 'Silver',
  members: '386 members',
  perks: ['1.5 points per Rs 100', '10% off weekday lunch', 'Priority waitlist']
},
{
  name: 'Gold',
  members: '76 members',
  perks: ['2 points per Rs 100', 'Free table hold', 'Chef\'s table invites']
}];


export const pointsLedger = [
{ guest: 'Deepak Thapa', type: 'Earned', points: '+248', detail: 'Table 5 · Rs 12,400', when: 'Today 13:40' },
{ guest: 'Anisha Shrestha', type: 'Redeemed', points: '−500', detail: 'Free dessert platter', when: 'Today 12:15' },
{ guest: 'Elina Gurung', type: 'Earned', points: '+96', detail: 'Takeaway · Rs 4,800', when: 'Yesterday' },
{ guest: 'Bikash Rai', type: 'Earned', points: '+142', detail: 'Table 9 · Rs 7,100', when: 'Yesterday' },
{ guest: 'Chloe Martin', type: 'Redeemed', points: '−250', detail: 'Welcome drink', when: '2 days ago' }];


export const campaigns = [
{ id: 'c1', name: 'Dashain set menu preview', channel: 'Email', audience: '1,204 members', status: 'Scheduled', stat: 'Sends Fri 09:00', previewStart: '2026-09-08', preorderStart: '2026-09-11', orderStart: '2026-09-20', dish: 'Momo Jhol' },
{ id: 'c2', name: 'Win back — 60 days quiet', channel: 'SMS', audience: '318 guests', status: 'Sent', stat: '41% open · 12% redeemed', ai: true, previewStart: '2026-09-01', preorderStart: '2026-09-03', orderStart: '2026-09-05', dish: 'Chicken Momo' },
{ id: 'c3', name: 'Weekend brunch launch', channel: 'Push', audience: '842 app users', status: 'Sent', stat: '33% open · 8% redeemed', previewStart: '2026-09-12', preorderStart: '2026-09-19', orderStart: '2026-09-21', dish: 'Dal Bhat' },
{ id: 'c4', name: 'Birthday club September', channel: 'Email', audience: '64 guests', status: 'Draft', stat: 'Not scheduled' }];


export const loyaltyGuests = [
{ id: 1, name: 'Deepak Thapa', balance: 1480, tier: 'Gold', lastPurchase: 12400 },
{ id: 2, name: 'Anisha Shrestha', balance: 620, tier: 'Silver', lastPurchase: 8200 },
{ id: 3, name: 'Elina Gurung', balance: 310, tier: 'Bronze', lastPurchase: 4800 },
{ id: 4, name: 'Bikash Rai', balance: 890, tier: 'Silver', lastPurchase: 7100 },
{ id: 5, name: 'Chloe Martin', balance: 140, tier: 'Bronze', lastPurchase: 3600 }];


export const onlineOrders = [
{ id: 'ORD-8812', customer: 'Suman K.', items: [{ name: 'Chicken Momo', qty: 2, price: 390 }, { name: 'Mint Mojito', qty: 1, price: 450 }], address: 'Thamel, Kathmandu', type: 'delivery', total: 'Rs 1,230', status: 'Received', time: 'Today 12:14' },
{ id: 'ORD-8811', customer: 'Praja L.', items: [{ name: 'Thakali Set', qty: 1, price: 950 }], address: 'Pickup at counter', type: 'pickup', total: 'Rs 950', status: 'Preparing', time: 'Today 11:58' },
{ id: 'ORD-8810', customer: 'Ming D.', items: [{ name: 'Buff Sekuwa', qty: 3, price: 2160 }, { name: 'Dal Bhat', qty: 1, price: 720 }], address: 'Lazimpat, Kathmandu', type: 'delivery', total: 'Rs 2,880', status: 'Received', time: 'Today 11:42' },
{ id: 'ORD-8809', customer: 'Aarav T.', items: [{ name: 'Tiramisu', qty: 2, price: 960 }], address: 'Pickup at counter', type: 'pickup', total: 'Rs 960', status: 'Completed', time: 'Today 11:20' }];
