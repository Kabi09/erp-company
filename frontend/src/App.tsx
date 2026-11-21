import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { ERPProvider, useERP } from './context/ERPContext';
import { AppLayout } from './components/AppLayout';
import { Button, LoadingSkeleton } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DEPARTMENTS } from './config/navigation';
import type { PermissionModule } from './types/erp';

// Sales Management (Code-split)
const SalesDashboard = React.lazy(() => import('./pages/sales/SalesDashboard').then((m) => ({ default: m.SalesDashboard })));
const SalesReportsPage = React.lazy(() => import('./pages/sales/SalesDashboard').then((m) => ({ default: m.SalesReportsPage })));
const EnquiriesPage = React.lazy(() => import('./pages/sales/EnquiriesPage').then((m) => ({ default: m.EnquiriesPage })));
const EnquiryDetailPage = React.lazy(() => import('./pages/sales/EnquiriesPage').then((m) => ({ default: m.EnquiryDetailPage })));
const FollowUpsPage = React.lazy(() => import('./pages/sales/FollowUpsPage').then((m) => ({ default: m.FollowUpsPage })));
const CustomersPage = React.lazy(() => import('./pages/sales/CustomersProductsPage').then((m) => ({ default: m.CustomersPage })));
const ProductsPage = React.lazy(() => import('./pages/sales/CustomersProductsPage').then((m) => ({ default: m.ProductsPage })));
const QuotationsPage = React.lazy(() => import('./pages/sales/QuotationsPage').then((m) => ({ default: m.QuotationsPage })));
const CustomerPOsPage = React.lazy(() => import('./pages/sales/OrdersCommercialPage').then((m) => ({ default: m.CustomerPOsPage })));
const PaymentsPage = React.lazy(() => import('./pages/sales/OrdersCommercialPage').then((m) => ({ default: m.PaymentsPage })));
const ProformaInvoicesPage = React.lazy(() => import('./pages/sales/OrdersCommercialPage').then((m) => ({ default: m.ProformaInvoicesPage })));
const SalesOrdersPage = React.lazy(() => import('./pages/sales/OrdersCommercialPage').then((m) => ({ default: m.SalesOrdersPage })));

// Supply Chain Management (Code-split)
const SupplyChainDashboard = React.lazy(() => import('./pages/supply-chain/SupplyChainDashboard').then((m) => ({ default: m.SupplyChainDashboard })));
const SupplyChainReportsPage = React.lazy(() => import('./pages/supply-chain/SupplyChainDashboard').then((m) => ({ default: m.SupplyChainReportsPage })));
const MaterialIssuesPage = React.lazy(() => import('./pages/supply-chain/MaterialRequestsPage').then((m) => ({ default: m.MaterialIssuesPage })));
const MaterialRequestsPage = React.lazy(() => import('./pages/supply-chain/MaterialRequestsPage').then((m) => ({ default: m.MaterialRequestsPage })));
const MaterialsInventoryPage = React.lazy(() => import('./pages/supply-chain/MaterialsInventoryPage').then((m) => ({ default: m.MaterialsInventoryPage })));
const StockHistoryPage = React.lazy(() => import('./pages/supply-chain/MaterialsInventoryPage').then((m) => ({ default: m.StockHistoryPage })));
const SuppliersPage = React.lazy(() => import('./pages/supply-chain/MaterialsInventoryPage').then((m) => ({ default: m.SuppliersPage })));
const GRNAndVerificationPage = React.lazy(() => import('./pages/supply-chain/PurchasingGrnPage').then((m) => ({ default: m.GRNAndVerificationPage })));
const SupplierPOsPage = React.lazy(() => import('./pages/supply-chain/PurchasingGrnPage').then((m) => ({ default: m.SupplierPOsPage })));
const SupplierReturnsPage = React.lazy(() => import('./pages/supply-chain/PurchasingGrnPage').then((m) => ({ default: m.SupplierReturnsPage })));

// Production Management (Code-split)
const ProductionDashboard = React.lazy(() => import('./pages/production/ProductionDashboard').then((m) => ({ default: m.ProductionDashboard })));
const ProductionPlanningReportsPage = React.lazy(() => import('./pages/production/ProductionDashboard').then((m) => ({ default: m.ProductionPlanningReportsPage })));
const ReceivedSalesOrdersPage = React.lazy(() => import('./pages/production/ProductionDashboard').then((m) => ({ default: m.ReceivedSalesOrdersPage })));
const ProductionOrderDetailPage = React.lazy(() => import('./pages/production/ProductionOrdersPage').then((m) => ({ default: m.ProductionOrderDetailPage })));
const ProductionOrdersListPage = React.lazy(() => import('./pages/production/ProductionOrdersPage').then((m) => ({ default: m.ProductionOrdersListPage })));
const BomMaterialRequestsPage = React.lazy(() => import('./pages/production/BomReceiptsPage').then((m) => ({ default: m.BomMaterialRequestsPage })));
const MaterialReceiptsPage = React.lazy(() => import('./pages/production/BomReceiptsPage').then((m) => ({ default: m.MaterialReceiptsPage })));
const DailyUpdatesPage = React.lazy(() => import('./pages/production/DailyQualityReworkPage').then((m) => ({ default: m.DailyUpdatesPage })));
const QualityCheckPage = React.lazy(() => import('./pages/production/DailyQualityReworkPage').then((m) => ({ default: m.QualityCheckPage })));
const ReworkPage = React.lazy(() => import('./pages/production/DailyQualityReworkPage').then((m) => ({ default: m.ReworkPage })));

// Logistics & Delivery Management (Code-split)
const DeliveryIssuesPage = React.lazy(() => import('./pages/logistics/LogisticsPages').then((m) => ({ default: m.DeliveryIssuesPage })));
const DeliveryOrdersPage = React.lazy(() => import('./pages/logistics/LogisticsPages').then((m) => ({ default: m.DeliveryOrdersPage })));
const DeliveryOrderDetailPage = React.lazy(() => import('./pages/logistics/LogisticsPages').then((m) => ({ default: m.DeliveryOrderDetailPage })));
const LogisticsDashboard = React.lazy(() => import('./pages/logistics/LogisticsPages').then((m) => ({ default: m.LogisticsDashboard })));
const LogisticsReportsPage = React.lazy(() => import('./pages/logistics/LogisticsPages').then((m) => ({ default: m.LogisticsReportsPage })));
const ReadyForDispatchPage = React.lazy(() => import('./pages/logistics/LogisticsPages').then((m) => ({ default: m.ReadyForDispatchPage })));

// Shared & Administration (Code-split)
const OrderTrackingDetailPage = React.lazy(() => import('./pages/shared/OrderTrackingPage').then((m) => ({ default: m.OrderTrackingDetailPage })));
const OrderTrackingPage = React.lazy(() => import('./pages/shared/OrderTrackingPage').then((m) => ({ default: m.OrderTrackingPage })));
const NotificationsPage = React.lazy(() => import('./pages/shared/NotificationsProfilePage').then((m) => ({ default: m.NotificationsPage })));
const ProfilePage = React.lazy(() => import('./pages/shared/NotificationsProfilePage').then((m) => ({ default: m.ProfilePage })));
const ActivityLogsPage = React.lazy(() => import('./pages/shared/AdminPages').then((m) => ({ default: m.ActivityLogsPage })));
const AdminDashboard = React.lazy(() => import('./pages/shared/AdminPages').then((m) => ({ default: m.AdminDashboard })));
const AppSettingsPage = React.lazy(() => import('./pages/shared/AdminPages').then((m) => ({ default: m.AppSettingsPage })));
const CompanyProfilePage = React.lazy(() => import('./pages/shared/AdminPages').then((m) => ({ default: m.CompanyProfilePage })));
const EmployeesPage = React.lazy(() => import('./pages/shared/AdminPages').then((m) => ({ default: m.EmployeesPage })));
const RolesPermissionsPage = React.lazy(() => import('./pages/shared/AdminPages').then((m) => ({ default: m.RolesPermissionsPage })));

const HomeRedirect: React.FC = () => {
  const { user, loading } = useERP();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-md">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  const homePath = user.department === 'admin' ? '/sales' : DEPARTMENTS[user.department].basePath;
  return <Navigate to={homePath} replace />;
};

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useERP();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-md">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RequireModule: React.FC<{ module: PermissionModule; children: React.ReactNode }> = ({ module, children }) => {
  const { user, can } = useERP();
  if (!user) return <Navigate to="/login" replace />;
  if (!can(module, 'view')) {
    const fallback = user.department === 'admin' ? '/admin' : DEPARTMENTS[user.department].basePath;
    return (
      <div className="max-w-lg mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center space-y-3">
        <ShieldAlert className="w-8 h-8 text-red-600 mx-auto" />
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Access Restricted</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your role ({user.roleName}) does not have permission to access the{' '}
          <span className="font-medium capitalize">{module.replace('_', ' ')}</span> module.
        </p>
        <div className="pt-2">
          <Button onClick={() => window.location.assign(fallback)}>Return to My Department</Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

export function App() {
  return (
    <ERPProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomeRedirect />} />

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            {/* Department 1: Sales Management */}
            <Route
              path="/sales"
              element={
                <RequireModule module="sales">
                  <SalesDashboard />
                </RequireModule>
              }
            />
            <Route
              path="/sales/enquiries"
              element={
                <RequireModule module="sales">
                  <EnquiriesPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/enquiries/:id"
              element={
                <RequireModule module="sales">
                  <EnquiryDetailPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/qualified"
              element={
                <RequireModule module="sales">
                  <EnquiriesPage qualifiedOnly />
                </RequireModule>
              }
            />
            <Route
              path="/sales/follow-ups"
              element={
                <RequireModule module="sales">
                  <FollowUpsPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/customers"
              element={
                <RequireModule module="sales">
                  <CustomersPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/products"
              element={
                <RequireModule module="sales">
                  <ProductsPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/quotations"
              element={
                <RequireModule module="sales">
                  <QuotationsPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/proforma-invoices"
              element={
                <RequireModule module="sales">
                  <ProformaInvoicesPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/customer-pos"
              element={
                <RequireModule module="sales">
                  <CustomerPOsPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/payments"
              element={
                <RequireModule module="sales">
                  <PaymentsPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/sales-orders"
              element={
                <RequireModule module="sales">
                  <SalesOrdersPage />
                </RequireModule>
              }
            />
            <Route
              path="/sales/reports"
              element={
                <RequireModule module="sales">
                  <SalesReportsPage />
                </RequireModule>
              }
            />

            {/* Department 2: Supply Chain Management */}
            <Route
              path="/supply-chain"
              element={
                <RequireModule module="supply_chain">
                  <SupplyChainDashboard />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/material-requests"
              element={
                <RequireModule module="supply_chain">
                  <MaterialRequestsPage />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/materials"
              element={
                <RequireModule module="supply_chain">
                  <MaterialsInventoryPage mode="materials" />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/inventory"
              element={
                <RequireModule module="supply_chain">
                  <MaterialsInventoryPage mode="inventory" />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/suppliers"
              element={
                <RequireModule module="supply_chain">
                  <SuppliersPage />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/purchase-orders"
              element={
                <RequireModule module="supply_chain">
                  <SupplierPOsPage />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/grn"
              element={
                <RequireModule module="supply_chain">
                  <GRNAndVerificationPage mode="grn" />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/verification"
              element={
                <RequireModule module="supply_chain">
                  <GRNAndVerificationPage mode="verification" />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/returns"
              element={
                <RequireModule module="supply_chain">
                  <SupplierReturnsPage />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/issues"
              element={
                <RequireModule module="supply_chain">
                  <MaterialIssuesPage />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/stock-history"
              element={
                <RequireModule module="supply_chain">
                  <StockHistoryPage />
                </RequireModule>
              }
            />
            <Route
              path="/supply-chain/reports"
              element={
                <RequireModule module="supply_chain">
                  <SupplyChainReportsPage />
                </RequireModule>
              }
            />

            {/* Department 3: Production Management */}
            <Route
              path="/production"
              element={
                <RequireModule module="production">
                  <ProductionDashboard />
                </RequireModule>
              }
            />
            <Route
              path="/production/received-orders"
              element={
                <RequireModule module="production">
                  <ReceivedSalesOrdersPage />
                </RequireModule>
              }
            />
            <Route
              path="/production/orders"
              element={
                <RequireModule module="production">
                  <ProductionOrdersListPage filterPreset="all" />
                </RequireModule>
              }
            />
            <Route
              path="/production/orders/:id"
              element={
                <RequireModule module="production">
                  <ProductionOrderDetailPage />
                </RequireModule>
              }
            />
            <Route
              path="/production/planning"
              element={
                <RequireModule module="production">
                  <ProductionPlanningReportsPage mode="planning" />
                </RequireModule>
              }
            />
            <Route
              path="/production/bom"
              element={
                <RequireModule module="production">
                  <BomMaterialRequestsPage />
                </RequireModule>
              }
            />
            <Route
              path="/production/material-receipts"
              element={
                <RequireModule module="production">
                  <MaterialReceiptsPage />
                </RequireModule>
              }
            />
            <Route
              path="/production/active"
              element={
                <RequireModule module="production">
                  <ProductionOrdersListPage filterPreset="active" />
                </RequireModule>
              }
            />
            <Route
              path="/production/daily-updates"
              element={
                <RequireModule module="production">
                  <DailyUpdatesPage />
                </RequireModule>
              }
            />
            <Route
              path="/production/quality-check"
              element={
                <RequireModule module="production">
                  <QualityCheckPage />
                </RequireModule>
              }
            />
            <Route
              path="/production/rework"
              element={
                <RequireModule module="production">
                  <ReworkPage />
                </RequireModule>
              }
            />
            <Route
              path="/production/completed"
              element={
                <RequireModule module="production">
                  <ProductionOrdersListPage filterPreset="completed" />
                </RequireModule>
              }
            />
            <Route
              path="/production/reports"
              element={
                <RequireModule module="production">
                  <ProductionPlanningReportsPage mode="reports" />
                </RequireModule>
              }
            />

            {/* Department 4: Logistics & Delivery Management */}
            <Route
              path="/logistics"
              element={
                <RequireModule module="logistics">
                  <LogisticsDashboard />
                </RequireModule>
              }
            />
            <Route
              path="/logistics/ready"
              element={
                <RequireModule module="logistics">
                  <ReadyForDispatchPage />
                </RequireModule>
              }
            />
            <Route
              path="/logistics/delivery-orders"
              element={
                <RequireModule module="logistics">
                  <DeliveryOrdersPage mode="all" />
                </RequireModule>
              }
            />
            <Route
              path="/logistics/delivery-orders/:id"
              element={
                <RequireModule module="logistics">
                  <DeliveryOrderDetailPage />
                </RequireModule>
              }
            />
            <Route
              path="/logistics/in-transit"
              element={
                <RequireModule module="logistics">
                  <DeliveryOrdersPage mode="in_transit" />
                </RequireModule>
              }
            />
            <Route
              path="/logistics/completed"
              element={
                <RequireModule module="logistics">
                  <DeliveryOrdersPage mode="completed" />
                </RequireModule>
              }
            />
            <Route
              path="/logistics/issues"
              element={
                <RequireModule module="logistics">
                  <DeliveryIssuesPage />
                </RequireModule>
              }
            />
            <Route
              path="/logistics/history"
              element={
                <RequireModule module="logistics">
                  <DeliveryOrdersPage mode="history" />
                </RequireModule>
              }
            />
            <Route
              path="/logistics/reports"
              element={
                <RequireModule module="logistics">
                  <LogisticsReportsPage />
                </RequireModule>
              }
            />

            {/* Shared Modules */}
            <Route
              path="/tracking"
              element={
                <RequireModule module="tracking">
                  <OrderTrackingPage />
                </RequireModule>
              }
            />
            <Route
              path="/tracking/:soId"
              element={
                <RequireModule module="tracking">
                  <OrderTrackingDetailPage />
                </RequireModule>
              }
            />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />

            {/* Administration */}
            <Route
              path="/admin"
              element={
                <RequireModule module="admin">
                  <AdminDashboard />
                </RequireModule>
              }
            />
            <Route
              path="/admin/employees"
              element={
                <RequireModule module="admin">
                  <EmployeesPage />
                </RequireModule>
              }
            />
            <Route
              path="/admin/roles"
              element={
                <RequireModule module="admin">
                  <RolesPermissionsPage />
                </RequireModule>
              }
            />
            <Route
              path="/admin/company"
              element={
                <RequireModule module="admin">
                  <CompanyProfilePage />
                </RequireModule>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <RequireModule module="admin">
                  <AppSettingsPage />
                </RequireModule>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <RequireModule module="admin">
                  <ActivityLogsPage />
                </RequireModule>
              }
            />

            <Route path="*" element={<HomeRedirect />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ERPProvider>
  );
}

export default App;
