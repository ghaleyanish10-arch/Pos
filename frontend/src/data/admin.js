export const roles = ['Cashier', 'Store Manager', 'Inventory Auditor', 'Corporate Admin'];

export const permissionRows = [
{ action: 'Void bill', group: 'Register', grants: [false, true, false, true] },
{ action: 'Apply discount', group: 'Register', grants: [true, true, false, true] },
{ action: 'Open cash drawer', group: 'Register', grants: [true, true, false, true] },
{ action: 'Approve refund', group: 'Register', grants: [false, true, false, true] },
{ action: 'Adjust stock', group: 'Inventory', grants: [false, true, true, true] },
{ action: 'Create purchase order', group: 'Inventory', grants: [false, true, true, true] },
{ action: 'Receive transfer', group: 'Inventory', grants: [true, true, true, true] },
{ action: 'View reports', group: 'Business', grants: [false, true, false, true] },
{ action: 'Export fiscal log', group: 'Business', grants: [false, false, true, true] },
{ action: 'Edit menu & prices', group: 'Business', grants: [false, true, false, true] },
{ action: 'Manage roles', group: 'Admin', grants: [false, false, false, true] }];


export const activeSessions = [
  { name: 'Riya Sharma', role: 'Cashier', currentAction: 'Void bill' },
  { name: 'Manisha Tamang', role: 'Cashier', currentAction: 'Open cash drawer' }
];

export const auditEvents = [
{
  time: '10 Sep · 14:38',
  actor: 'Riya Sharma',
  role: 'Store Manager',
  type: 'Refund approval',
  summary: 'Approved refund on order #1004',
  before: 'Status: Awaiting approval · Rs 780',
  after: 'Status: Refunded to Zomato wallet · Rs 780',
  ip: '192.168.1.42',
  device: 'POS Terminal #2'
},
{
  time: '10 Sep · 14:02',
  actor: 'Kiran Lama',
  role: 'Inventory Auditor',
  type: 'Manual adjustment',
  summary: 'Buff mince stock corrected',
  before: 'Buff mince: 9.0 kg',
  after: 'Buff mince: 4.0 kg (reason: waste — spoilage)',
  ip: '192.168.1.15',
  device: 'Back-office Laptop'
},
{
  time: '10 Sep · 13:15',
  actor: 'Riya Sharma',
  role: 'Store Manager',
  type: 'Void',
  summary: 'Voided bill for table 3',
  before: 'Bill #1009 open · Rs 950',
  after: 'Bill #1009 voided · duplicate charge',
  ip: '192.168.1.42',
  device: 'POS Terminal #2'
},
{
  time: '10 Sep · 12:44',
  actor: 'Manisha Tamang',
  role: 'Cashier',
  type: 'Comp',
  summary: 'Comped dessert for table 8',
  before: 'Cheesecake · Rs 480 charged',
  after: 'Cheesecake · Rs 0 (service recovery)',
  ip: '192.168.1.31',
  device: 'POS Terminal #1'
},
{
  time: '10 Sep · 11:58',
  actor: 'Corporate Admin',
  role: 'Corporate Admin',
  type: 'Manual adjustment',
  summary: 'Menu price updated',
  before: 'Thakali Set · Rs 950',
  after: 'Thakali Set · Rs 995',
  ip: '10.0.0.5',
  device: 'Corporate Desktop'
}];


export const branches = [
{ name: 'Thamel House (HQ)', status: 'Online', latency: '180 ms', throughput: [12, 18, 22, 19, 28, 34, 30, 41] },
{ name: 'Patan Branch', status: 'Online', latency: '240 ms', throughput: [8, 11, 9, 14, 17, 15, 21, 19] },
{ name: 'Central Kitchen', status: 'Degraded', latency: '1.9 s', throughput: [4, 6, 5, 3, 7, 2, 4, 3] },
{ name: 'Bhaktapur Kiosk', status: 'Offline', latency: '—', throughput: [6, 7, 5, 4, 0, 0, 0, 0] },
{ name: 'Pokhara Lakeside', status: 'Online', latency: '310 ms', throughput: [9, 13, 16, 14, 18, 22, 20, 24] }];
