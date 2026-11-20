import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { ERPProvider, useERP } from './context/ERPContext';
import { AppLayout } from './components/AppLayout';
import { Button, LoadingSkeleton } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DEPARTMENTS } from './config/navigation';
import type { PermissionModule } from './types/erp';

// Sales Management
import { SalesDashboard, SalesReportsPage } from './pages/sales/SalesDashboard';
import { EnquiriesPage, EnquiryDetailPage } from './pages/sales/EnquiriesPage';
import { FollowUpsPage } from './pages/sales/FollowUpsPage';
import { CustomersPage, ProductsPage } from './pages/sales/CustomersProductsPage';
import { QuotationsPage } from './pages/sales/QuotationsPage';
import {
  CustomerPOsPage,
  PaymentsPage,
  ProformaInvoicesPage,
  SalesOrdersPage,
} from './pages/sales/OrdersCommercialPage';

// Supply Chain Management
import { SupplyChainDashboard, SupplyChainReportsPage } from './pages/supply-chain/SupplyChainDashboard';
import { MaterialIssuesPage, MaterialRequestsPage } from './pages/supply-chain/MaterialRequestsPage';
import {
  MaterialsInventoryPage,
  StockHistoryPage,
  SuppliersPage,
} from './pages/supply-chain/MaterialsInventoryPage';
import {
  GRNAndVerificationPage,
  SupplierPOsPage,
  SupplierReturnsPage,
} from './pages/supply-chain/PurchasingGrnPage';

// Production Management
import {
  ProductionDashboard,
  ProductionPlanningReportsPage,
  ReceivedSalesOrdersPage,
} from './pages/production/ProductionDashboard';
import { ProductionOrderDetailPage, ProductionOrdersListPage } from './pages/production/ProductionOrdersPage';
import { BomMaterialRequestsPage, MaterialReceiptsPage } from './pages/production/BomReceiptsPage';
import { DailyUpdatesPage, QualityCheckPage, ReworkPage } from './pages/production/DailyQualityReworkPage';

// Logistics & Delivery Management
import {
  DeliveryIssuesPage,
  DeliveryOrdersPage,
  LogisticsDashboard,
  LogisticsReportsPage,
  ReadyForDispatchPage,
} from './pages/logistics/LogisticsPages';

// Shared & Administration
import { OrderTrackingDetailPage, OrderTrackingPage } from './pages/shared/OrderTrackingPage';
import { NotificationsPage, ProfilePage } from './pages/shared/NotificationsProfilePage';
import {
  ActivityLogsPage,
  AdminDashboard,
  AppSettingsPage,
  CompanyProfilePage,
  EmployeesPage,
  RolesPermissionsPage,
} from './pages/shared/AdminPages';

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
