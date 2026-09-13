export const incomingTickets = [
{
  id: '#1042',
  type: 'dine-in',
  tag: 'Table 12',
  items: ['2× Momo Jhol', '1× Chicken Chilli', '1× Ice Tea'],
  elapsed: '1 min',
  allergy: 'Allergy: peanuts — table 12',
  station: 'Kitchen',
  modifiers: ['Momo Jhol: extra spicy', 'Ice Tea: no sugar'],
  timestamps: { placed: '12:04', fired: '12:05', served: '12:19' },
  payment: 'Card',
  server: 'Riya',
  table: '12'
},
{
  id: '#1043',
  type: 'delivery',
  tag: 'Phone',
  items: ['1× Thakali Set', '2× Lassi'],
  elapsed: '2 min',
  ai: true,
  station: 'Kitchen',
  modifiers: ['Thakali Set: less rice'],
  timestamps: { placed: '12:07', fired: '12:08', served: '12:22' },
  payment: 'QR/Wallet',
  server: 'Arjun',
  table: '—'
},
{
  id: '#1044',
  type: 'dine-in',
  tag: 'Table 4',
  items: ['3× Espresso', '1× Cheesecake'],
  elapsed: '3 min',
  station: 'Bar',
  linked: true,
  modifiers: ['Espresso: double shot'],
  timestamps: { placed: '12:10', fired: '12:11', served: '12:25' },
  payment: 'Cash',
  server: 'Riya',
  table: '4'
}];


export const preparingTickets = [
{
  id: '#1038',
  type: 'dine-in',
  tag: 'Table 7',
  items: ['1× Buff Sekuwa', '2× Chowmein'],
  elapsed: '9 min',
  station: 'Kitchen',
  fired: true,
  modifiers: ['Sekuwa: medium rare'],
  timestamps: { placed: '11:50', fired: '11:55', served: '—' },
  payment: 'Card',
  server: 'Aayush',
  table: '7'
},
{
  id: '#1039',
  type: 'takeaway',
  tag: 'Takeaway',
  items: ['4× Chicken Momo'],
  elapsed: '12 min',
  station: 'Kitchen',
  modifiers: ['Momo: steam, extra chutney'],
  timestamps: { placed: '11:48', fired: '11:52', served: '—' },
  payment: 'Cash',
  server: 'Riya',
  table: '—'
},
{
  id: '#1040',
  type: 'dine-in',
  tag: 'Table 2',
  items: ['2× Mojito', '1× Old Fashioned'],
  elapsed: '5 min',
  station: 'Bar',
  modifiers: ['Mojito: light sugar', 'Old Fashioned: no cherry'],
  timestamps: { placed: '11:55', fired: '11:57', served: '—' },
  payment: 'Card',
  server: 'Arjun',
  table: '2'
}];


export const readyTickets = [
{
  id: '#1035',
  type: 'dine-in',
  tag: 'Table 9',
  items: ['2× Dal Bhat', '1× Papad'],
  elapsed: '18 min',
  station: 'Expo',
  modifiers: [],
  timestamps: { placed: '11:42', fired: '11:45', served: '12:00' },
  payment: 'Card',
  server: 'Riya',
  table: '9'
},
{
  id: '#1036',
  type: 'delivery',
  tag: 'Phone',
  items: ['1× Tiramisu'],
  elapsed: '21 min',
  ai: true,
  station: 'Dessert',
  modifiers: [],
  timestamps: { placed: '11:40', fired: '11:44', served: '12:01' },
  payment: 'QR/Wallet',
  server: 'Arjun',
  table: '—'
}];


export const refundsRequested = [
{
  id: '#1021',
  tag: 'Table 6',
  items: '1× Chicken Chilli',
  reason: 'Served cold',
  amount: 'Rs 420',
  age: '4 min'
},
{
  id: '#1017',
  tag: 'Takeaway',
  items: '2× Veg Momo',
  reason: 'Wrong item packed',
  amount: 'Rs 360',
  age: '12 min'
}];


export const refundsApproval = [
{
  id: '#0998',
  tag: 'Table 11',
  items: 'Full bill',
  reason: 'Guest complaint — service delay',
  amount: 'Rs 3,840',
  age: '22 min',
  locked: true
},
{
  id: '#1004',
  tag: 'Zomato',
  items: '1× Thakali Set',
  reason: 'Courier never collected',
  amount: 'Rs 780',
  age: '35 min'
},
{
  id: '#1009',
  tag: 'Table 3',
  items: '1× Old Fashioned',
  reason: 'Duplicate charge',
  amount: 'Rs 950',
  age: '48 min'
}];


export const refundsResolved = [
{
  id: '#0987',
  tag: 'Table 8',
  items: '1× Cheesecake',
  reason: 'Melted in transit',
  amount: 'Rs 480',
  age: '1 hr'
}];


export const transactions = [
{ time: '14:42', id: 'TXN-8841', ref: 'Table 12', method: 'Card', amount: 'Rs 2,480', status: 'Success', fiscalId: 'IRD-2026-08841', certified: 'Certified' },
{ time: '14:31', id: 'TXN-8840', ref: 'Takeaway', method: 'Cash', amount: 'Rs 640', status: 'Success', fiscalId: 'IRD-2026-08840', certified: 'Certified' },
{ time: '14:18', id: 'TXN-8839', ref: 'Table 4', method: 'QR/Wallet', amount: 'Rs 3,120', status: 'Success', fiscalId: 'IRD-2026-08839', certified: 'Pending' },
{ time: '13:57', id: 'TXN-8838', ref: 'Table 9', method: 'Card', amount: 'Rs 1,180', status: 'Refunded', fiscalId: 'IRD-2026-08838', certified: 'Certified' },
{ time: '13:44', id: 'TXN-8837', ref: 'Zomato', method: 'QR/Wallet', amount: 'Rs 890', status: 'Success', fiscalId: 'IRD-2026-08837', certified: 'Certified' },
{ time: '13:20', id: 'TXN-8836', ref: 'Table 2', method: 'Card', amount: 'Rs 4,260', status: 'Failed', fiscalId: 'IRD-2026-08836', certified: 'Pending' },
{ time: '12:58', id: 'TXN-8835', ref: 'Table 15', method: 'Cash', amount: 'Rs 720', status: 'Success', fiscalId: 'IRD-2026-08835', certified: 'Certified' },
{ time: '12:31', id: 'TXN-8834', ref: 'Takeaway', method: 'QR/Wallet', amount: 'Rs 1,540', status: 'Success', fiscalId: 'IRD-2026-08834', certified: 'Certified' },
{ time: '12:04', id: 'TXN-8833', ref: 'Table 7', method: 'Card', amount: 'Rs 2,980', status: 'Success', fiscalId: 'IRD-2026-08833', certified: 'Certified' }];
