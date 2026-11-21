import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Factory,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Inbox,
  Layers,
  LayoutDashboard,
  Package,
  PackageCheck,
  PackagePlus,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Department, PermissionAction, PermissionModule } from '../types/erp';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  badgeKey?: string;
  alternateModules?: string[];
  module?: PermissionModule;
  action?: PermissionAction;
}

export function navModule(item: NavItem, can: (module: string, action?: PermissionAction) => boolean) {
  return [item.module,...(item.alternateModules || [])].find(key => key && can(key,item.action || 'view')) || item.module;
}

export interface DepartmentMeta {
  id: Department;
  label: string;
  shortLabel: string;
  basePath: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  accentDot: string;
  nav: NavItem[];
  quickCreate: Array<{ label: string; path: string; module?: PermissionModule; action?: PermissionAction }>;
}

export const DEPARTMENTS: Record<Department, DepartmentMeta> = {
  service: {
    id: 'service', label: 'Service Management', shortLabel: 'Service', basePath: '/service',
    accentText: 'text-emerald-600 dark:text-emerald-400', accentBg: 'bg-emerald-600',
    accentBorder: 'border-emerald-600/30', accentDot: 'bg-emerald-500',
    nav: [
      { label: 'Dashboard', path: '/service', icon: LayoutDashboard, module: 'service_dashboard' },
      { label: 'Delivered Products', path: '/service/delivered-products', icon: PackageCheck, module: 'service_assets' },
      { label: 'Service Requests', path: '/service/requests', icon: Inbox, module: 'service_requests' },
      { label: 'Service Jobs', path: '/service/jobs', icon: Wrench, module: 'service_jobs' },
      { label: 'My Jobs / Schedule', path: '/service/schedule', icon: CalendarClock, module: 'service_schedule' },
      { label: 'Material Requests', path: '/service/materials', icon: Boxes, module: 'service_parts' },
      { label: 'Expenses & Payments', path: '/service/expenses', icon: CreditCard, module: 'service_expenses', alternateModules:['service_verification','service_billing'] },
      { label: 'Completed Services', path: '/service/completed', icon: CheckCircle2, module: 'service_jobs' },
      { label: 'Reports', path: '/service/reports', icon: BarChart3, module: 'service_reports' },
    ],
    quickCreate: [{label:'New Service Request',path:'/service/requests?create=1', module:'service_requests',action:'create'}],
  },
  rnd: {
    id: 'rnd', label: 'Research & Development', shortLabel: 'R&D', basePath: '/rnd',
    accentText: 'text-indigo-600 dark:text-indigo-400', accentBg: 'bg-indigo-600',
    accentBorder: 'border-indigo-600/30', accentDot: 'bg-indigo-500',
    nav: [
      { label: 'Dashboard', path: '/rnd', icon: LayoutDashboard, module: 'rnd_dashboard' },
      { label: 'R&D Projects', path: '/rnd/projects', icon: Layers, module: 'rnd_projects' },
      { label: 'Product Specifications', path: '/rnd/specifications', icon: FileText, module: 'rnd_specs' },
      { label: 'BOM / Materials', path: '/rnd/materials', icon: Boxes, module: 'rnd_materials' },
      { label: 'Daily Work Updates', path: '/rnd/updates', icon: CalendarClock, module: 'rnd_updates' },
      { label: 'Testing & Inspection', path: '/rnd/testing', icon: ClipboardCheck, module: 'rnd_testing' },
      { label: 'Completed Projects', path: '/rnd/completed', icon: CheckCircle2, module: 'rnd_completion' },
      { label: 'Reports', path: '/rnd/reports', icon: BarChart3, module: 'rnd_reports' },
    ],
    quickCreate: [{label:'New R&D Project',path:'/rnd/projects?create=1', module:'rnd_projects',action:'create'}],
  },
  sales: {
    id: 'sales',
    label: 'Sales Management',
    shortLabel: 'Sales',
    basePath: '/sales',
    accentText: 'text-blue-600 dark:text-blue-400',
    accentBg: 'bg-blue-600',
    accentBorder: 'border-blue-600/30',
    accentDot: 'bg-blue-500',
    nav: [
      { label: 'Dashboard', path: '/sales', icon: LayoutDashboard, module: 'sales' },
      { label: 'Enquiries', path: '/sales/enquiries', icon: Inbox, module: 'enquiries' },
      { label: 'Qualified Enquiries', path: '/sales/qualified', icon: UserCheck, module: 'enquiries' },
      { label: 'Follow-ups', path: '/sales/follow-ups', icon: PhoneCall, module: 'enquiries' },
      { label: 'Customers', path: '/sales/customers', icon: Users, module: 'customers' },
      { label: 'Products', path: '/sales/products', icon: Package, module: 'products' },
      { label: 'Quotations', path: '/sales/quotations', icon: FileText, module: 'quotations' },
      { label: 'Proforma Invoices', path: '/sales/proforma-invoices', icon: FileSpreadsheet, module: 'proforma_invoices' },
      { label: 'Customer POs', path: '/sales/customer-pos', icon: FileCheck2, module: 'customer_pos' },
      { label: 'Payment Entries', path: '/sales/payments', icon: CreditCard, module: 'payments' },
      { label: 'Sales Orders', path: '/sales/sales-orders', icon: ShoppingBag, module: 'sales_orders' },
      { label: 'Reports', path: '/sales/reports', icon: BarChart3, module: 'reports' },
    ],
    quickCreate: [
      { label: 'New Customer Enquiry', path: '/sales/enquiries?create=1', module: 'enquiries', action: 'create' },
      { label: 'Add Follow-up', path: '/sales/follow-ups?create=1', module: 'enquiries', action: 'create' },
      { label: 'Create Quotation', path: '/sales/quotations?create=1', module: 'quotations', action: 'create' },
      { label: 'Record Payment', path: '/sales/payments?create=1', module: 'payments', action: 'create' },
    ],
  },
  supply_chain: {
    id: 'supply_chain',
    label: 'Supply Chain Management',
    shortLabel: 'Supply Chain',
    basePath: '/supply-chain',
    accentText: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-600',
    accentBorder: 'border-amber-600/30',
    accentDot: 'bg-amber-500',
    nav: [
      { label: 'Dashboard', path: '/supply-chain', icon: LayoutDashboard, module: 'supply_chain' },
      { label: 'Material Requests', path: '/supply-chain/material-requests', icon: ClipboardList, module: 'material_requests' },
      { label: 'Materials', path: '/supply-chain/materials', icon: Boxes, module: 'materials' },
      { label: 'Inventory / Stock', path: '/supply-chain/inventory', icon: Warehouse, module: 'materials' },
      { label: 'Suppliers', path: '/supply-chain/suppliers', icon: Building2, module: 'suppliers' },
      { label: 'Purchase Orders', path: '/supply-chain/purchase-orders', icon: ShoppingCart, module: 'supplier_pos' },
      { label: 'GRN', path: '/supply-chain/grn', icon: PackagePlus, module: 'goods_receipts' },
      { label: 'Material Verification', path: '/supply-chain/verification', icon: ClipboardCheck, module: 'goods_receipts' },
      { label: 'Supplier Returns', path: '/supply-chain/returns', icon: RotateCcw, module: 'supplier_returns' },
      { label: 'Material Issues', path: '/supply-chain/issues', icon: PackageCheck, module: 'material_issues' },
      { label: 'Stock History', path: '/supply-chain/stock-history', icon: History, module: 'materials' },
      { label: 'Reports', path: '/supply-chain/reports', icon: BarChart3, module: 'reports' },
    ],
    quickCreate: [
      { label: 'Issue Materials to Production', path: '/supply-chain/material-requests', module: 'material_requests', action: 'approve' },
      { label: 'Create Supplier PO', path: '/supply-chain/purchase-orders?create=1', module: 'supplier_pos', action: 'create' },
      { label: 'Record GRN', path: '/supply-chain/grn?create=1', module: 'goods_receipts', action: 'create' },
      { label: 'Add Raw Material', path: '/supply-chain/materials?create=1', module: 'materials', action: 'create' },
    ],
  },
  production: {
    id: 'production',
    label: 'Production Management',
    shortLabel: 'Production',
    basePath: '/production',
    accentText: 'text-purple-600 dark:text-purple-400',
    accentBg: 'bg-purple-600',
    accentBorder: 'border-purple-600/30',
    accentDot: 'bg-purple-500',
    nav: [
      { label: 'Dashboard', path: '/production', icon: LayoutDashboard, module: 'production' },
      { label: 'Delivered Products', path:'/production/delivered-products',icon:PackageCheck,module:'production_delivered' },
      { label: 'Received Sales Orders', path: '/production/received-orders', icon: Inbox, module: 'production_orders' },
      { label: 'Production Orders', path: '/production/orders', icon: Factory, module: 'production_orders' },
      { label: 'Production Planning', path: '/production/planning', icon: CalendarClock, module: 'production_orders' },
      { label: 'BOM & Material Requests', path: '/production/bom', icon: Layers, module: 'boms' },
      { label: 'Material Receipts', path: '/production/material-receipts', icon: PackageCheck, module: 'material_issues' },
      { label: 'Active Production', path: '/production/active', icon: Wrench, module: 'stage_progress' },
      { label: 'Daily Production Updates', path: '/production/daily-updates', icon: Activity, module: 'stage_progress' },
      { label: 'Quality Check', path: '/production/quality-check', icon: ShieldCheck, module: 'quality_inspections' },
      { label: 'Rework', path: '/production/rework', icon: RefreshCw, module: 'quality_inspections' },
      { label: 'Completed Production', path: '/production/completed', icon: CheckCircle2, module: 'production_orders' },
      { label: 'Reports', path: '/production/reports', icon: BarChart3, module: 'reports' },
    ],
    quickCreate: [
      { label: 'Create Production Order', path: '/production/received-orders', module: 'production_orders', action: 'create' },
      { label: 'Log Daily Work Update', path: '/production/daily-updates?create=1', module: 'stage_progress', action: 'create' },
      { label: 'Record Quality Check', path: '/production/quality-check?create=1', module: 'quality_inspections', action: 'create' },
      { label: 'Acknowledge Material Receipt', path: '/production/material-receipts', module: 'material_issues', action: 'confirm' },
    ],
  },
  logistics: {
    id: 'logistics',
    label: 'Logistics & Delivery',
    shortLabel: 'Logistics',
    basePath: '/logistics',
    accentText: 'text-teal-600 dark:text-teal-400',
    accentBg: 'bg-teal-600',
    accentBorder: 'border-teal-600/30',
    accentDot: 'bg-teal-500',
    nav: [
      { label: 'Dashboard', path: '/logistics', icon: LayoutDashboard, module: 'logistics' },
      { label: 'Ready for Dispatch', path: '/logistics/ready', icon: PackageCheck, module: 'dispatch_notes' },
      { label: 'Delivery Orders', path: '/logistics/delivery-orders', icon: ClipboardList, module: 'dispatch_notes' },
      { label: 'Dispatched / In Transit', path: '/logistics/in-transit', icon: Truck, module: 'delivery_tracking' },
      { label: 'Completed Deliveries', path: '/logistics/completed', icon: CheckCircle2, module: 'epod' },
      { label: 'Delivery Issues', path: '/logistics/issues', icon: AlertTriangle, module: 'delivery_tracking' },
      { label: 'Delivery History', path: '/logistics/history', icon: History, module: 'delivery_tracking' },
      { label: 'Reports', path: '/logistics/reports', icon: BarChart3, module: 'reports' },
    ],
    quickCreate: [
      { label: 'Create Delivery Order', path: '/logistics/ready', module: 'dispatch_notes', action: 'create' },
      { label: 'Confirm Dispatch', path: '/logistics/delivery-orders', module: 'dispatch_notes', action: 'edit' },
      { label: 'Confirm Delivery', path: '/logistics/in-transit', module: 'epod', action: 'create' },
    ],
  },
  admin: {
    id: 'admin',
    label: 'Administration',
    shortLabel: 'Admin',
    basePath: '/admin',
    accentText: 'text-slate-600 dark:text-slate-300',
    accentBg: 'bg-slate-700',
    accentBorder: 'border-slate-500/30',
    accentDot: 'bg-slate-400',
    nav: [
      { label: 'Admin Dashboard', path: '/admin', icon: LayoutDashboard, module: 'admin' },
      { label: 'Employees', path: '/admin/employees', icon: Users, module: 'employees' },
      { label: 'Employee Access', path: '/admin/employee-access', icon: UserCheck, module: 'employee_access' },
      { label: 'Roles & Permissions', path: '/admin/roles', icon: ShieldCheck, module: 'roles' },
      { label: 'Approval Workflows', path: '/admin/approval-workflows', icon: FileCheck2, module: 'approval_workflows' },
      { label: 'Approval Inbox', path: '/admin/approvals', icon: ClipboardCheck, module: 'approval_inbox' },
      { label: 'Company Profile', path: '/admin/company', icon: Building2, module: 'company' },
      { label: 'Application Settings', path: '/admin/settings', icon: Settings, module: 'admin' },
      { label: 'Activity Logs', path: '/admin/logs', icon: History, module: 'audit_logs' },
    ],
    quickCreate: [
      { label: 'Add Employee', path: '/admin/employees?create=1', module: 'employees', action: 'create' },
      { label: 'Company Profile', path: '/admin/company', module: 'company', action: 'edit' },
    ],
  },
};

export const OPERATIONAL_DEPARTMENTS: Department[] = ['sales', 'supply_chain', 'production', 'logistics', 'service', 'rnd'];

export function inferDepartmentFromPath(pathname: string, fallback: Department): Department {
  if (pathname.startsWith('/service')) return 'service';
  if (pathname.startsWith('/rnd')) return 'rnd';
  if (pathname.startsWith('/sales')) return 'sales';
  if (pathname.startsWith('/supply-chain')) return 'supply_chain';
  if (pathname.startsWith('/production')) return 'production';
  if (pathname.startsWith('/logistics')) return 'logistics';
  if (pathname.startsWith('/admin')) return 'admin';
  return fallback;
}

export const SHARED_NAV_LINKS: NavItem[] = [
  { label: 'Approval Inbox', path: '/admin/approvals', icon: ClipboardCheck },
  { label: 'Order Tracking', path: '/tracking', icon: Activity },
  { label: 'Notifications', path: '/notifications', icon: Bell },
];
