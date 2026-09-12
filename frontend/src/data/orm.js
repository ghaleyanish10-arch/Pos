export const reviews = [
{
  id: 'rev-1',
  author: 'Sabina M.',
  platform: 'Google',
  rating: 5,
  text: 'The momo jhol is the best in Thamel. Service was quick even on a Friday night.',
  when: '2 hours ago',
  answered: false
},
{
  id: 'rev-2',
  author: 'Tom W.',
  platform: 'TripAdvisor',
  rating: 2,
  text: 'Waited 40 minutes for the mains. Food was good once it arrived but the wait spoiled it.',
  when: '2 days ago',
  answered: false,
  stale: true
},
{
  id: 'rev-3',
  author: 'Prakriti S.',
  platform: 'QR Survey',
  rating: 4,
  text: 'Lovely terrace seating. Would like more vegetarian mains on the set menu.',
  when: 'Yesterday',
  answered: true
},
{
  id: 'rev-4',
  author: 'Jens H.',
  platform: 'Facebook',
  rating: 5,
  text: 'Staff went out of their way for our daughter\'s birthday. Thank you!',
  when: '3 days ago',
  answered: true
},
{
  id: 'rev-5',
  author: 'Anonymous',
  platform: 'Google',
  rating: 3,
  text: 'Good food, but the bill took ages to arrive and the QR payment failed twice.',
  when: '4 days ago',
  answered: false,
  stale: true
}];


export const deliveryIncoming = [
{ id: 'FM-4412', platform: 'Foodmandu', items: ['2× Chicken Momo', '1× Coke'], courier: 'Courier 8 min away', elapsed: '1 min' },
{ id: 'PT-2290', platform: 'Pathao', items: ['1× Thakali Set'], courier: 'Unassigned', elapsed: '3 min' },
{ id: 'OS-1180', platform: 'Own store', items: ['3× Veg Momo', '2× Lassi'], courier: 'Own rider', elapsed: '4 min', ai: true }];


export const deliveryPreparing = [
{ id: 'FM-4409', platform: 'Foodmandu', items: ['1× Buff Sekuwa', '1× Chowmein'], courier: 'Courier arrived', elapsed: '11 min' },
{ id: 'BH-0771', platform: 'Bhoj', items: ['2× Dal Bhat'], courier: 'Courier 4 min away', elapsed: '8 min' }];


export const deliveryReady = [
{ id: 'PT-2287', platform: 'Pathao', items: ['1× Cheesecake', '1× Espresso'], courier: 'Handed to courier', elapsed: '16 min' }];


export const surveyResponses = [
{
  id: 'sr-1',
  guest: 'Table 6 guest',
  table: 'T6',
  rating: 2,
  comment: 'Chicken chilli arrived cold and the server did not check back.',
  when: '18 min ago',
  resolved: false,
  staffNotes: [
    { author: 'Riya', text: 'Spoken to kitchen — batch was held too long under heat lamp.', when: '12 min ago' },
    { author: 'Manager', text: 'Comp dessert offered on next visit.', when: '8 min ago' }
  ]
},
{
  id: 'sr-2',
  guest: 'Table 11 guest',
  table: 'T11',
  rating: 1,
  comment: 'Waited 25 minutes for the bill. Nobody at the pass.',
  when: '52 min ago',
  resolved: false,
  staffNotes: [
    { author: 'Riya', text: 'POS tablet was frozen — rebooted.', when: '40 min ago' }
  ]
},
{
  id: 'sr-3',
  guest: 'Table 3 guest',
  table: 'T3',
  rating: 3,
  comment: 'Music too loud to hold a conversation on the terrace.',
  when: '2 hours ago',
  resolved: true,
  staffNotes: []
}];
