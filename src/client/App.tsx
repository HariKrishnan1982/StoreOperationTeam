import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Skeleton } from './components';
import { AppProvider } from './context/AppContext';
import { RequireAuth, RequireRole } from './guards/RouteGuards';
import { AppShell } from './layouts/AppShell';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const ForbiddenPage = lazy(() =>
  import('./pages/ForbiddenPage').then((m) => ({ default: m.ForbiddenPage }))
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const OrdersPage = lazy(() =>
  import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage }))
);
const NewOrderPage = lazy(() =>
  import('./pages/NewOrderPage').then((m) => ({ default: m.NewOrderPage }))
);
const OrderDetailPage = lazy(() =>
  import('./pages/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage }))
);
const PackingSlipPage = lazy(() =>
  import('./pages/PackingSlipPage').then((m) => ({ default: m.PackingSlipPage }))
);
const InventoryPage = lazy(() =>
  import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage }))
);
const InventoryFormPage = lazy(() =>
  import('./pages/InventoryFormPage').then((m) => ({ default: m.InventoryFormPage }))
);
const StockMovementsPage = lazy(() =>
  import('./pages/StockMovementsPage').then((m) => ({ default: m.StockMovementsPage }))
);
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((m) => ({ default: m.AccountPage }))
);
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })));
const ComponentGalleryPage = lazy(() =>
  import('./pages/ComponentGalleryPage').then((m) => ({ default: m.ComponentGalleryPage }))
);

export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <div className="app-main">
          <Skeleton rows={5} />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />

        <Route
          path="/app/orders/:reference/packing-slip"
          element={
            <RequireAuth>
              <PackingSlipPage />
            </RequireAuth>
          }
        />

        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route
            path="orders/new"
            element={
              <RequireRole roles={['Admin', 'Operator']}>
                <NewOrderPage />
              </RequireRole>
            }
          />
          <Route path="orders/:reference" element={<OrderDetailPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route
            path="inventory/new"
            element={
              <RequireRole roles={['Admin']}>
                <InventoryFormPage />
              </RequireRole>
            }
          />
          <Route
            path="inventory/:id"
            element={
              <RequireRole roles={['Admin']}>
                <InventoryFormPage />
              </RequireRole>
            }
          />
          <Route path="stock-movements" element={<StockMovementsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="help" element={<HelpPage />} />
          {import.meta.env.DEV ? (
            <Route path="dev/components" element={<ComponentGalleryPage />} />
          ) : null}
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;
