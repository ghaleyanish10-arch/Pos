import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { hasApiSession } from './api/client';
import { AppShell } from './components/shell/AppShell';
import { ToastProvider } from './components/ui/Toast';
import { RoleProvider } from './state/RoleContext';
import { SettingsProvider } from './state/SettingsContext';
import { OrderProvider } from './state/OrderContext';
import { TableProvider } from './state/TableContext';
import { MenuProvider } from './state/MenuContext';
import { CampaignProvider } from './state/CampaignContext';
import { NotificationProvider } from './state/Notifications';
import { SoundProvider } from './state/SoundContext';
import { ElevationProvider } from './state/ElevationContext';
import { DeviceProvider, useDevice } from './state/DeviceContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Landing } from './pages/Landing';
import { Home } from './pages/Home';
import { Register } from './pages/Register';
import { RegisterCustomer } from './pages/RegisterCustomer';
import { VerifyEmail } from './pages/VerifyEmail';
import { AuthCallback } from './pages/AuthCallback';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { NotFound } from './pages/NotFound';
import { Orders } from './pages/Orders';
import { Refunds } from './pages/Refunds';
import { Transactions } from './pages/Transactions';
import { Finance } from './pages/Finance';
import { ManualPayment } from './pages/ManualPayment';
import { Inventory } from './pages/Inventory';
import { Menu } from './pages/Menu';
import { Guests } from './pages/Guests';
import { Team } from './pages/Team';
import { StaffProfile } from './pages/StaffProfile';
import { Payroll } from './pages/Payroll';
import { Bookings } from './pages/Bookings';
import { Reports } from './pages/Reports';
import { Invoices } from './pages/Invoices';
import { Loyalty } from './pages/Loyalty';
import { Marketing } from './pages/Marketing';
import { OnlineStore } from './pages/OnlineStore';
import { KDS } from './pages/KDS';
import { FrontOfHouse } from './pages/FrontOfHouse';
import { Alerts } from './pages/Alerts';
import { StaffOnDuty } from './pages/StaffOnDuty';
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

// RootRoute decides landing vs dashboard from the live session. It listens for
// the mesa-session event (fired by establishSession/clearApiSession) so a
// fresh login on the Landing page — which sits at "/" already — transitions to
// the dashboard without navigate('/') being a no-op.
function RootRoute() {
  const [hasSession, setHasSession] = useState(() => hasApiSession());
  const { device } = useDevice();
  useEffect(() => {
    const sync = () => setHasSession(hasApiSession());
    window.addEventListener('mesa-session', sync);
    return () => window.removeEventListener('mesa-session', sync);
  }, []);
  // Each device can open on the surface its staff actually uses: the floor
  // handout lands on Orders, the counter terminal boots straight into the
  // register, the admin desk opens the dashboard.
  const homePath = device === 'phone' ? '/orders' : device === 'tablet' ? '/register' : '/dashboard';
  return hasSession ? <Navigate to={homePath} replace /> : <Landing />;
}

export function App() {
  return (
    <RoleProvider>
      <ErrorBoundary>
      <SettingsProvider>
      <SoundProvider>
      <ToastProvider>
        <NotificationProvider>
        <ElevationProvider>
        <OrderProvider>
        <TableProvider>
        <MenuProvider>
        <CampaignProvider>
        <DeviceProvider>
        <BrowserRouter>
        <Routes>
          {/* The public landing page: owner login/signup, toggled in place.
              Staff never mix in here — the PIN terminal is a separate route.
              /login and /signup are the same page for old links. */}
          <Route path="/" element={
            <RootRoute />
          } />
          <Route path="/login" element={<Landing />} />
          <Route path="/signup" element={<Landing />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/refunds" element={<Refunds />} />
            <Route path="/transactions" element={<Finance />} />
            <Route path="/transactions-list" element={<Transactions />} />
            <Route path="/manual-payment" element={<ManualPayment />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/menu" element={<Menu />} />
            <Route path="/guests" element={<Guests />} />
            <Route path="/team" element={<Team />} />
            <Route path="/team/:id" element={<StaffProfile />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/loyalty" element={<Loyalty />} />
            <Route path="/marketing" element={<Marketing />} />
            <Route path="/online-store" element={<OnlineStore />} />
            <Route path="/kds" element={<KDS />} />
            <Route path="/front-of-house" element={<FrontOfHouse />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/staff" element={<StaffOnDuty />} />
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
          {/* The shared-device staff flow — roster + PIN, no landing page. It
              must sit OUTSIDE the AppShell layout route: AppShell handles the
              clock-in view itself (see its guarded branch for /terminal). */}
          <Route path="/terminal" element={<AppShell />} />
          {/* The customer register is public and standalone: a customer (QR
              scan / storefront link) must get the register only — no staff
              session, no side bar, no POS features. */}
          <Route path="/register/customer" element={<RegisterCustomer />} />
        </Routes>
      </BrowserRouter>
      </DeviceProvider>
    </CampaignProvider>
    </MenuProvider>
    </TableProvider>
    </OrderProvider>
    </ElevationProvider>
    </NotificationProvider>
    </ToastProvider>
    </SoundProvider>
    </SettingsProvider>
    </ErrorBoundary>
    </RoleProvider>);

}
