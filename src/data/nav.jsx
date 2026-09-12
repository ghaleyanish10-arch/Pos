import {
  ArrowLeftRightIcon,
  BadgeCheckIcon,
  BarChart3Icon,
  BookOpenIcon,
  BoxesIcon,
  CalendarClockIcon,
  CalculatorIcon,
  ChefHatIcon,
  ClipboardListIcon,
  CreditCardIcon,
  FileTextIcon,
  GiftIcon,
  HeartHandshakeIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  MonitorSmartphoneIcon,
  QrCodeIcon,
  ReceiptIcon,
  RotateCcwIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  StarIcon,
  TruckIcon,
UsersIcon,
  ActivityIcon,
  StoreIcon,
  SettingsIcon } from
  'lucide-react';

const ic = 'h-4 w-4';

export const navGroups = [
{
  index: '01',
  title: 'Sell',
  descriptor: 'Register & money',
  items: [
  {
    label: 'Register',
    path: '/register',
    meta: 'Register 1 · open',
    icon: <StoreIcon className={ic} />
  },
  {
    label: 'Orders',
    path: '/orders',
    meta: 'Today · 342',
    icon: <ClipboardListIcon className={ic} />
  },
  {
    label: 'Refunds & Returns',
    path: '/refunds',
    meta: '3 need approval',
    icon: <RotateCcwIcon className={ic} />,
    alert: true
  },
  {
    label: 'Transactions',
    path: '/transactions',
    meta: '126 today',
    icon: <CreditCardIcon className={ic} />
  },
  {
    label: 'Manual Payment',
    path: '/manual-payment',
    meta: 'Keypad · open',
    icon: <CalculatorIcon className={ic} />
  }]

},
{
  index: '02',
  title: 'Manage',
  descriptor: 'Menu, stock & people',
  items: [
  {
    label: 'Inventory',
    path: '/inventory',
    meta: '12 low',
    icon: <BoxesIcon className={ic} />,
    alert: true
  },
  {
    label: 'Items & Menu',
    path: '/menu',
    meta: '84 items · 3 86\'d',
    icon: <BookOpenIcon className={ic} />
  },
  {
    label: 'Guests',
    path: '/guests',
    meta: '2,418 profiles',
    icon: <HeartHandshakeIcon className={ic} />
  },
  {
    label: 'Team & Shifts',
    path: '/team',
    meta: '9 on shift',
    icon: <UsersIcon className={ic} />
  },
  {
    label: 'Bookings',
    path: '/bookings',
    meta: '24 covers tonight',
    icon: <CalendarClockIcon className={ic} />
  }]

},
{
  index: '03',
  title: 'Business',
  descriptor: 'Growth & reporting',
  items: [
  {
    label: 'Reports',
    path: '/reports',
    meta: 'Rs 4.82L week',
    icon: <BarChart3Icon className={ic} />
  },
  {
    label: 'Invoices',
    path: '/invoices',
    meta: '4 overdue',
    icon: <FileTextIcon className={ic} />,
    alert: true
  },
  {
    label: 'Loyalty',
    path: '/loyalty',
    meta: '1,204 members',
    icon: <GiftIcon className={ic} />
  },
  {
    label: 'Marketing',
    path: '/marketing',
    meta: '2 scheduled',
    icon: <MegaphoneIcon className={ic} />
  },
  {
    label: 'Online Store',
    path: '/online-store',
    meta: 'Open · 38 today',
    icon: <ShoppingBagIcon className={ic} />
  }]

},
{
  index: '04',
  title: 'POS',
  descriptor: 'Core operations',
  items: [
  {
    label: 'Kitchen Display',
    path: '/kds',
    meta: '14 live tickets',
    icon: <ChefHatIcon className={ic} />
  },
  {
    label: 'Front of House',
    path: '/front-of-house',
    meta: 'Hospitality mode',
    icon: <LayoutGridIcon className={ic} />
  },
  {
    label: 'Fiscal Log',
    path: '/fiscal',
    meta: '1 pending IRD',
    icon: <BadgeCheckIcon className={ic} />,
    alert: true
  }]

},
{
  index: '05',
  title: 'IMS',
  descriptor: 'Stock logistics',
  items: [
  {
    label: 'Recipe Costing',
    path: '/recipe-costing',
    meta: 'Avg margin 68%',
    icon: <ReceiptIcon className={ic} />
  },
  {
    label: 'Purchase Orders',
    path: '/purchase-orders',
    meta: '2 partially received',
    icon: <ScrollTextIcon className={ic} />
  },
  {
    label: 'Branch Transfers',
    path: '/transfers',
    meta: '4 in transit',
    icon: <ArrowLeftRightIcon className={ic} />
  }]

},
{
  index: '06',
  title: 'ORM',
  descriptor: 'Reputation & delivery',
  items: [
  {
    label: 'Reviews',
    path: '/reviews',
    meta: '4.6 · 38 this month',
    icon: <StarIcon className={ic} />
  },
  {
    label: 'Delivery Orders',
    path: '/delivery',
    meta: '7 incoming',
    icon: <TruckIcon className={ic} />
  },
  {
    label: 'QR Feedback',
    path: '/feedback',
    meta: '3 flagged',
    icon: <QrCodeIcon className={ic} />,
    alert: true
  }]

},
{
  index: '07',
  title: 'Admin',
  descriptor: 'Roles & system',
  items: [
  {
    label: 'Roles & Permissions',
    path: '/permissions',
    meta: '4 roles',
    icon: <ShieldCheckIcon className={ic} />
  },
  {
    label: 'Audit Trail',
    path: '/audit',
    meta: '1,940 events',
    icon: <MonitorSmartphoneIcon className={ic} />
  },
  {
    label: 'Settings',
    path: '/settings',
    meta: 'Store profile',
    icon: <SettingsIcon className={ic} />
  },
  {
    label: 'System Health',
    path: '/system-health',
    meta: '99.98% uptime',
    icon: <ActivityIcon className={ic} />
  }]

}];


export const allNavItems = navGroups.flatMap((g) => g.items);
