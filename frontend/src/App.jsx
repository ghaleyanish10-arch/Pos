import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/shell/AppShell';
import { ToastProvider } from './components/ui/Toast';
import { RoleProvider } from './state/RoleContext';
import { SettingsProvider } from './state/SettingsContext';
import { OrderProvider } from './state/OrderContext';
import { TableProvider } from './state/TableContext';
import { MenuProvider } from './state/MenuContext';
import { CampaignProvider } from './state/CampaignContext';
import { NotificationProvider } from './state/Notifications';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Home } from './pages/Home';
import { Register } from './pages/Register';
import { RegisterCustomer } from './pages/RegisterCustomer';
import { VerifyEmail } from './pages/VerifyEmail';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { NotFound } from './pages/NotFound';
import { Orders } from './pages/Orders';
import { Refunds } from './pages/Refunds';
import { Transactions } from './pages/Transactions';
import { ManualPayment } from './pages/ManualPayment';
import { Inventory } from './pages/Inventory';
import { Menu } from './pages/Menu';
import { Guests } from './pages/Guests';
import { Team } from './pages/Team';
import { StaffProfile } from './pages/StaffProfile';
import { Bookings } from './pages/Bookings';
import { Reports } from './pages/Reports';
import { Invoices } from './pages/Invoices';
import { Loyalty } from './pages/Loyalty';
import { Marketing } from './pages/Marketing';
import { OnlineStore } from './pages/OnlineStore';
import { KDS } from './pages/KDS';
import { FrontOfHouse } from './pages/FrontOfHouse';
import { Fiscal } from './pages/Fiscal';
import { RecipeCosting } from './pages/RecipeCosting';
import { PurchaseOrders } from './pages/PurchaseOrders';
import { Transfers } from './pages/Transfers';
import { Reviews } from './pages/Reviews';
import { Delivery } from './pages/Delivery';
import { Feedback } from './pages/Feedback';
import { Permissions } from './pages/Permissions';
import { Settings } from './pages/Settings';
import { Audit } from './pages/Audit';
import { SystemHealth } from './pages/SystemHealth';

export function App() {
  return (
    <RoleProvider>
      <ErrorBoundary>
      <SettingsProvider>
      <ToastProvider>
        <NotificationProvider>
        <OrderProvider>
        <TableProvider>
        <MenuProvider>
        <CampaignProvider>
        <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/register/customer" element={<RegisterCustomer />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/refunds" element={<Refunds />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/manual-payment" element={<ManualPayment />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/menu" element={<Menu />} />
            <Route path="/guests" element={<Guests />} />
            <Route path="/team" element={<Team />} />
            <Route path="/team/:id" element={<StaffProfile />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/loyalty" element={<Loyalty />} />
            <Route path="/marketing" element={<Marketing />} />
            <Route path="/online-store" element={<OnlineStore />} />
            <Route path="/kds" element={<KDS />} />
            <Route path="/front-of-house" element={<FrontOfHouse />} />
            <Route path="/fiscal" element={<Fiscal />} />
            <Route path="/recipe-costing" element={<RecipeCosting />} />
            <Route path="/purchase-orders" element={<PurchaseOrders />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/delivery" element={<Delivery />} />
            <Route path="/feedback" element={<Feedback />} />
<Route path="/permissions" element={<Permissions />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audit" element={<Audit />} />
            <Route path="/system-health" element={<SystemHealth />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CampaignProvider>
    </MenuProvider>
    </TableProvider>
    </OrderProvider>
    </NotificationProvider>
    </ToastProvider>
    </SettingsProvider>
    </ErrorBoundary>
    </RoleProvider>);

}
