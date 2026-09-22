import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  BookOpenIcon,
  BoxesIcon,
  CalendarClockIcon,
  ChefHatIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  GiftIcon,
  Grid2x2Icon,
  HeartHandshakeIcon,
  LayoutGridIcon,
  MegaphoneIcon,
  MonitorSmartphoneIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  StarIcon,
  StoreIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon
} from 'lucide-react';

const ic = 'h-4 w-4';

export const navGroups = [
  {
    index: '01',
    title: 'Operate',
    descriptor: 'Register, orders & service',
    items: [
      {
        label: 'Dashboard',
        path: '/dashboard',
        icon: <LayoutGridIcon className={ic} />
      },
      {
        label: 'Register',
        path: '/register',
        icon: <StoreIcon className={ic} />
      },
      {
        label: 'Orders',
        path: '/orders',
        icon: <ClipboardListIcon className={ic} />,
        children: [
          {
            label: 'Refunds & Returns',
            path: '/refunds',
            alert: true
          }
        ]
      },
      {
        label: 'Tables',
        path: '/front-of-house',
        icon: <Grid2x2Icon className={ic} />
      },
      {
        label: 'Kitchen',
        path: '/kds',
        icon: <ChefHatIcon className={ic} />
      }
    ]
  },
  {
    index: '02',
    title: 'Manage',
    descriptor: 'Menu, stock & people',
    items: [
      {
        label: 'Menu',
        path: '/menu',
        icon: <BookOpenIcon className={ic} />
      },
      {
        label: 'Inventory',
        path: '/inventory',
        icon: <BoxesIcon className={ic} />,
        alert: true
      },
      {
        label: 'Customers',
        path: '/guests',
        icon: <HeartHandshakeIcon className={ic} />
      },
      {
        label: 'Bookings',
        path: '/bookings',
        icon: <CalendarClockIcon className={ic} />
      },
      {
        label: 'Staff',
        path: '/team',
        icon: <UsersIcon className={ic} />,
        children: [
          {
            label: 'Payroll',
            path: '/payroll',
          }
        ]
      }
    ]
  },
  {
    index: '03',
    title: 'Business',
    descriptor: 'Growth & reporting',
    items: [
      {
        label: 'Reports',
        path: '/reports',
        icon: <BarChart3Icon className={ic} />
      },
      {
        label: 'Finance',
        path: '/transactions',
        icon: <WalletIcon className={ic} />,
        children: [
          {
            label: 'Transactions',
            path: '/transactions-list',
          },
          {
            label: 'Manual Payment',
            path: '/manual-payment',
          },
          {
            label: 'Invoices',
            path: '/invoices',
            alert: true
          },
          {
            label: 'Fiscal Log',
            path: '/fiscal',
            alert: true
          }
        ]
      },
      {
        label: 'Marketing',
        path: '/marketing',
        icon: <MegaphoneIcon className={ic} />
      },
      {
        label: 'Online Store',
        path: '/online-store',
        icon: <ShoppingBagIcon className={ic} />
      }
    ]
  },
  {
    index: '04',
    title: 'More',
    descriptor: 'Delivery, loyalty & reputation',
    items: [
      {
        label: 'Delivery',
        path: '/delivery',
        icon: <TruckIcon className={ic} />
      },
      {
        label: 'Loyalty',
        path: '/loyalty',
        icon: <GiftIcon className={ic} />
      },
      {
        label: 'Reviews',
        path: '/reviews',
        icon: <StarIcon className={ic} />,
        children: [
          {
            label: 'QR Feedback',
            path: '/feedback',
            alert: true
          }
        ]
      },
      {
        label: 'Purchasing',
        path: '/purchase-orders',
        icon: <ScrollTextIcon className={ic} />,
        children: [
          {
            label: 'Recipe Costing',
            path: '/recipe-costing',
          },
          {
            label: 'Branch Transfers',
            path: '/transfers',
          }
        ]
      }
    ]
  },
  {
    index: '05',
    title: 'System',
    descriptor: 'Roles, access & system',
    items: [
      {
        label: 'Settings',
        path: '/settings',
        icon: <SettingsIcon className={ic} />
      },
      {
        label: 'Permissions',
        path: '/permissions',
        icon: <ShieldCheckIcon className={ic} />
      },
      {
        label: 'Audit',
        path: '/audit',
        icon: <MonitorSmartphoneIcon className={ic} />
      },
      {
        label: 'System Health',
        path: '/system-health',
        icon: <ActivityIcon className={ic} />
      },
      {
        label: 'Alerts',
        path: '/alerts',
        icon: <BellIcon className={ic} />
      },
      {
        label: 'Staff on Duty',
        path: '/staff',
        icon: <ClipboardCheckIcon className={ic} />
      }
    ]
  }
];

export const allNavItems = navGroups.flatMap((g) =>
  g.items.flatMap((i) => [i, ...(i.children || [])])
);