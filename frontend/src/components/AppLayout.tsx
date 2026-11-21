import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  Briefcase,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Search,
  Settings,
  Snowflake,
  Sun,
  User,
  X,
} from 'lucide-react';
import { DEPARTMENTS, inferDepartmentFromPath, OPERATIONAL_DEPARTMENTS } from '../config/navigation';
import { useERP } from '../context/ERPContext';
import { erpApi } from '../services/api';
import type { Department } from '../types/erp';
import { ErrorBanner, LoadingSkeleton, Modal, ToastContainer } from './ui';

export const AppLayout: React.FC = () => {
  const { user, data, loading, error, refresh, logout, theme, toggleTheme, can, toasts, dismissToast, activeDept, setActiveDept } = useERP();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [serverResults, setServerResults] = useState<Array<{ label: string; sub: string; path: string; dept: string }>>([]);
  const [mobileSheet, setMobileSheet] = useState<'work' | 'create' | 'more' | null>(null);

  // Keyboard shortcut: Ctrl+K / Cmd+K to open global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Server-side debounced global search
  useEffect(() => {
    if (globalQuery.trim().length >= 2) {
      const timer = setTimeout(() => {
        erpApi.globalSearch(globalQuery.trim())
          .then((res) => {
            if (res.results && Array.isArray(res.results)) {
              setServerResults(
                res.results.map((r: any) => ({
                  label: r.title,
                  sub: r.subtitle,
                  path: r.path,
                  dept: r.module,
                })),
              );
            }
          })
          .catch(() => {});
      }, 250);
      return () => clearTimeout(timer);
    } else {
      setServerResults([]);
    }
  }, [globalQuery]);

  const isSuperAdmin = user?.department === 'admin' || can('admin', 'view');

  const currentDept: Department = useMemo(() => {
    const inferred = inferDepartmentFromPath(location.pathname, activeDept);
    if (!isSuperAdmin && user && inferred !== user.department) {
      return user.department;
    }
    return inferred;
  }, [location.pathname, activeDept, isSuperAdmin, user]);

  useEffect(() => {
    if (currentDept !== activeDept) {
      setActiveDept(currentDept);
    }
  }, [currentDept, activeDept, setActiveDept]);

  useEffect(() => {
    setDrawerOpen(false);
    setMobileSheet(null);
  }, [location.pathname, location.search]);

  const deptMeta = DEPARTMENTS[currentDept];

  const unreadNotifications = useMemo(() => {
    if (!data || !user) return 0;
    return data.notifications.filter(
      (n) =>
        (n.department === 'all' || isSuperAdmin || n.department === user.department) &&
        !n.readBy.includes(user.id),
    ).length;
  }, [data, user, isSuperAdmin]);

  const searchResults = useMemo(() => {
    if (!data || !globalQuery.trim()) return [];
    const q = globalQuery.trim().toLowerCase();
    const out: Array<{ label: string; sub: string; path: string; dept: string }> = [];

    if (can('sales', 'view')) {
      for (const e of data.enquiries) {
        if (e.docNo.toLowerCase().includes(q) || e.customerSnapshot.name.toLowerCase().includes(q)) {
          out.push({ label: e.docNo, sub: `${e.customerSnapshot.name} · ${e.status}`, path: `/sales/enquiries/${e.id}`, dept: 'Sales' });
        }
      }
      for (const qt of data.quotations) {
        if (qt.docNo.toLowerCase().includes(q) || qt.customerSnapshot.name.toLowerCase().includes(q)) {
          out.push({ label: qt.docNo, sub: `${qt.customerSnapshot.name} · ${qt.status}`, path: `/sales/quotations`, dept: 'Sales' });
        }
      }
      for (const so of data.salesOrders) {
        if (so.docNo.toLowerCase().includes(q) || so.customerSnapshot.name.toLowerCase().includes(q)) {
          out.push({ label: so.docNo, sub: `${so.customerSnapshot.name} · ${so.fulfillmentStatus}`, path: `/tracking/${so.id}`, dept: 'Order Tracking' });
        }
      }
    }
    if (can('production', 'view')) {
      for (const po of data.productionOrders) {
        if (po.docNo.toLowerCase().includes(q) || po.productName.toLowerCase().includes(q) || po.salesOrderDocNo.toLowerCase().includes(q)) {
          out.push({ label: po.docNo, sub: `${po.productName} · ${po.status}`, path: `/production/orders/${po.id}`, dept: 'Production' });
        }
      }
    }
    if (can('supply_chain', 'view')) {
      for (const mr of data.materialRequests) {
        if (mr.docNo.toLowerCase().includes(q) || mr.productionOrderDocNo.toLowerCase().includes(q)) {
          out.push({ label: mr.docNo, sub: `${mr.productionOrderDocNo} · ${mr.status}`, path: `/supply-chain/material-requests`, dept: 'Supply Chain' });
        }
      }
      for (const mat of data.materials) {
        if (mat.code.toLowerCase().includes(q) || mat.name.toLowerCase().includes(q)) {
          out.push({ label: `${mat.code} — ${mat.name}`, sub: `Stock: ${data.stockMap[mat.id] ?? 0} ${mat.unit}`, path: `/supply-chain/inventory`, dept: 'Inventory' });
        }
      }
    }
    if (can('logistics', 'view')) {
      for (const d of data.deliveryOrders) {
        if (d.docNo.toLowerCase().includes(q) || d.customerName.toLowerCase().includes(q) || (d.trackingNumber || '').toLowerCase().includes(q)) {
          out.push({ label: d.docNo, sub: `${d.customerName} · ${d.status}`, path: `/logistics/delivery-orders`, dept: 'Logistics' });
        }
      }
    }
    return out.slice(0, 12);
  }, [data, globalQuery, can]);

  const activeSearchResults = serverResults.length > 0 ? serverResults : searchResults;

  const breadcrumbs = useMemo(() => {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return [{ label: 'Workspace', path: '/' }];
    const map: Record<string, string> = {
      sales: 'Sales',
      'supply-chain': 'Supply Chain',
      production: 'Production',
      logistics: 'Logistics',
      admin: 'Administration',
      tracking: 'Order Tracking',
      notifications: 'Notifications',
      profile: 'Profile',
      enquiries: 'Enquiries',
      qualified: 'Qualified Enquiries',
      'follow-ups': 'Follow-ups',
      customers: 'Customers',
      products: 'Products',
      quotations: 'Quotations',
      'proforma-invoices': 'Proforma Invoices',
      'customer-pos': 'Customer POs',
      payments: 'Payments',
      'sales-orders': 'Sales Orders',
      'material-requests': 'Material Requests',
      materials: 'Materials',
      inventory: 'Inventory',
      suppliers: 'Suppliers',
      'purchase-orders': 'Purchase Orders',
      grn: 'GRN',
      verification: 'Verification',
      returns: 'Supplier Returns',
      issues: 'Issues',
      'stock-history': 'Stock History',
      'received-orders': 'Received Sales Orders',
      orders: 'Production Orders',
      planning: 'Planning',
      bom: 'BOM & Material Requests',
      'material-receipts': 'Material Receipts',
      active: 'Active Production',
      'daily-updates': 'Daily Updates',
      'quality-check': 'Quality Check',
      rework: 'Rework',
      completed: 'Completed',
      ready: 'Ready for Dispatch',
      'delivery-orders': 'Delivery Orders',
      'in-transit': 'In Transit',
      history: 'History',
      reports: 'Reports',
      employees: 'Employees',
      roles: 'Roles & Permissions',
      company: 'Company Profile',
      settings: 'Settings',
      logs: 'Activity Logs',
    };
    const crumbs: Array<{ label: string; path: string }> = [];
    let acc = '';
    for (const part of parts) {
      acc += `/${part}`;
      let label = map[part];
      if (!label && data) {
        const so = data.salesOrders.find((s) => s.id === part);
        const enq = data.enquiries.find((e) => e.id === part);
        const po = data.productionOrders.find((p) => p.id === part);
        label = so?.docNo || enq?.docNo || po?.docNo || part;
      }
      crumbs.push({ label: label || part, path: acc });
    }
    return crumbs;
  }, [location.pathname, data]);

  const renderSidebarContent = (collapsed: boolean) => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 select-none">
      {/* Brand */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <Link to={deptMeta.basePath} className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-md ${deptMeta.accentBg} flex items-center justify-center text-white shrink-0`}>
            <Snowflake className="w-4 h-4" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm tracking-tight text-white whitespace-nowrap truncate">
              CRYO ERP 2.0
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setSidebarCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:inline-flex p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Super Admin Department Switcher */}
      {isSuperAdmin && !collapsed && (
        <div className="px-3 py-3 border-b border-slate-800 shrink-0">
          <label htmlFor="dept-switcher" className="block text-[11px] font-medium text-slate-400 mb-1.5">
            Department Workspace
          </label>
          <select
            id="dept-switcher"
            value={currentDept}
            onChange={(e) => {
              const next = e.target.value as Department;
              setActiveDept(next);
              navigate(DEPARTMENTS[next].basePath);
            }}
            className="w-full px-2.5 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {OPERATIONAL_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENTS[d].label}
              </option>
            ))}
            <option value="admin">{DEPARTMENTS.admin.label}</option>
          </select>
        </div>
      )}

      {/* Department Indicator (for single-dept users) */}
      {!isSuperAdmin && !collapsed && (
        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-slate-300 truncate">{deptMeta.label}</span>
        </div>
      )}

      {/* Navigation Links */}
      <nav aria-label="Department navigation" className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
        {deptMeta.nav
          .filter((item) => (item.module ? can(item.module, item.action || 'view') : can(deptMeta.id, 'view')))
          .map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === deptMeta.basePath}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0 text-slate-400" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}

        {/* Shared Operations Links */}
        <div className="pt-3 mt-3 border-t border-slate-800 space-y-0.5">
          {!collapsed && (
            <div className="px-2.5 pb-1 text-[11px] font-medium text-slate-500">Cross-Department</div>
          )}
          <NavLink
            to="/tracking"
            title={collapsed ? 'Order Tracking' : undefined}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`
            }
          >
            <Activity className="w-4 h-4 shrink-0 text-slate-400" />
            {!collapsed && <span className="truncate">Order Tracking</span>}
          </NavLink>
          <NavLink
            to="/notifications"
            title={collapsed ? 'Notifications' : undefined}
            className={({ isActive }) =>
              `flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`
            }
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Bell className="w-4 h-4 shrink-0 text-slate-400" />
              {!collapsed && <span className="truncate">Notifications</span>}
            </span>
            {!collapsed && unreadNotifications > 0 && (
              <span className="text-[11px] font-mono tabular-nums text-teal-400">{unreadNotifications}</span>
            )}
          </NavLink>
          {isSuperAdmin && currentDept !== 'admin' && (
            <NavLink
              to="/admin"
              title={collapsed ? 'Administration' : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`
              }
            >
              <Settings className="w-4 h-4 shrink-0 text-slate-400" />
              {!collapsed && <span className="truncate">Administration</span>}
            </NavLink>
          )}
        </div>
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-slate-800 shrink-0">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2">
            <Link to="/profile" className="min-w-0 flex-1 hover:opacity-90">
              <div className="text-xs font-medium text-white truncate">{user?.name}</div>
              <div className="text-[11px] text-slate-400 truncate">{user?.roleName}</div>
            </Link>
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            className="w-full flex justify-center p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r border-slate-800 sticky top-0 h-screen transition-all duration-150 no-print ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        {renderSidebarContent(sidebarCollapsed)}
      </aside>

      {/* Tablet / Mobile Slide-over Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-64 max-w-[82vw] h-full z-10 shadow-xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-3 right-3 z-20 p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarContent(false)}
          </div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="h-14 sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0 truncate">
              {breadcrumbs.map((c, idx) => (
                <React.Fragment key={c.path}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  {idx === breadcrumbs.length - 1 ? (
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{c.label}</span>
                  ) : (
                    <Link
                      to={c.path}
                      className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap shrink-0"
                    >
                      {c.label}
                    </Link>
                  )}
                </React.Fragment>
              ))}
            </nav>
            {data?.company.demoMode && (
              <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                · Demo Data
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Global search"
              className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-md cursor-pointer whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search orders, docs...</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <Link
              to="/notifications"
              aria-label={`Notifications (${unreadNotifications} unread)`}
              className="relative p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded bg-teal-600 text-white text-[10px] font-mono font-semibold flex items-center justify-center">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Link>

            <Link
              to="/profile"
              aria-label="User profile"
              className="hidden sm:inline-flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
            >
              <User className="w-4 h-4 text-slate-500" />
              <span className="max-w-[110px] truncate">{user?.name}</span>
            </Link>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 pb-20 md:pb-8 max-w-[1600px] w-full mx-auto">
          {error && (
            <div className="mb-4">
              <ErrorBanner message={error} onRetry={refresh} />
            </div>
          )}
          {loading && !data ? (
            <LoadingSkeleton />
          ) : (
            <React.Suspense fallback={<LoadingSkeleton />}>
              <Outlet />
            </React.Suspense>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 no-print"
      >
        <Link
          to={deptMeta.basePath}
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
        >
          <Home className="w-4 h-4" />
          <span>Home</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileSheet('work')}
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
        >
          <Briefcase className="w-4 h-4" />
          <span>Work</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileSheet('create')}
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-teal-700 dark:text-teal-400 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Create</span>
        </button>
        <Link
          to="/notifications"
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 relative"
        >
          <Bell className="w-4 h-4" />
          <span>Alerts</span>
          {unreadNotifications > 0 && (
            <span className="absolute top-1.5 right-4 min-w-[14px] h-3.5 px-1 rounded bg-teal-600 text-white text-[9px] font-mono flex items-center justify-center">
              {unreadNotifications}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setMobileSheet('more')}
          className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
        >
          <MoreHorizontal className="w-4 h-4" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile Bottom Sheets */}
      <Modal
        open={mobileSheet === 'work'}
        onClose={() => setMobileSheet(null)}
        title={`${deptMeta.shortLabel} Screens`}
        size="md"
      >
        <div className="grid grid-cols-1 gap-1.5">
          {deptMeta.nav
            .filter((item) => (item.module ? can(item.module, item.action || 'view') : can(deptMeta.id, 'view')))
            .map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileSheet(null)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium"
              >
                <Icon className="w-4 h-4 text-slate-500" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={mobileSheet === 'create'}
        onClose={() => setMobileSheet(null)}
        title={`Quick Create — ${deptMeta.shortLabel}`}
        size="md"
      >
        <div className="grid grid-cols-1 gap-2">
          {deptMeta.quickCreate
            .filter((action) => (action.module ? can(action.module, action.action || 'create') : can(deptMeta.id, 'create')))
            .map((action) => (
            <Link
              key={action.path}
              to={action.path}
              onClick={() => setMobileSheet(null)}
              className="flex items-center justify-between px-3.5 py-3 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium"
            >
              <span>{action.label}</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Link>
          ))}
        </div>
      </Modal>

      <Modal
        open={mobileSheet === 'more'}
        onClose={() => setMobileSheet(null)}
        title="Workspace & Account"
        size="md"
      >
        <div className="space-y-2">
          {isSuperAdmin && (
            <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 mb-2">Switch Department</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[...OPERATIONAL_DEPARTMENTS, 'admin' as Department].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setActiveDept(d);
                      navigate(DEPARTMENTS[d].basePath);
                      setMobileSheet(null);
                    }}
                    className={`px-3 py-2 rounded-md text-xs font-medium border text-left cursor-pointer ${
                      currentDept === d
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-600 dark:border-teal-600'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {DEPARTMENTS[d].shortLabel}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Link
            to="/tracking"
            onClick={() => setMobileSheet(null)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 text-sm font-medium"
          >
            <Activity className="w-4 h-4 text-slate-500" />
            Centralized Order Tracking
          </Link>
          <Link
            to="/profile"
            onClick={() => setMobileSheet(null)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-slate-200 dark:border-slate-800 text-sm font-medium"
          >
            <User className="w-4 h-4 text-slate-500" />
            My Profile ({user?.name})
          </Link>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 text-sm font-medium cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </Modal>

      {/* Global Search Modal */}
      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title="Global Search" size="md">
        <div className="space-y-3">
          <input
            type="search"
            autoFocus
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder="Search by document ID (SO-0001, PROD-0002, ENQ-0001), customer, or material..."
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {globalQuery.trim() && activeSearchResults.length === 0 && (
            <p className="text-xs text-slate-500 py-4 text-center">No matching records found.</p>
          )}
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeSearchResults.map((r, i) => (
              <button
                key={`${r.path}-${i}`}
                type="button"
                onClick={() => {
                  navigate(r.path);
                  setSearchOpen(false);
                  setGlobalQuery('');
                }}
                className="w-full py-2.5 px-2 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium font-mono text-slate-900 dark:text-slate-100">{r.label}</div>
                  <div className="text-xs text-slate-500 truncate">{r.sub}</div>
                </div>
                <span className="text-xs text-slate-500 shrink-0 ml-2">{r.dept}</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
