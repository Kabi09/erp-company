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
import type { Department } from '../types/erp';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  badgeKey?: string;
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
  quickCreate: Array<{ label: string; path: string }>;
}

export const DEPARTMENTS: Record<Department, DepartmentMeta> = {
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
      { label: 'Dashboard', path: '/sales', icon: LayoutDashboard },
      { label: 'Enquiries', path: '/sales/enquiries', icon: Inbox },
      { label: 'Qualified Enquiries', path: '/sales/qualified', icon: UserCheck },
      { label: 'Follow-ups', path: '/sales/follow-ups', icon: PhoneCall },
      { label: 'Customers', path: '/sales/customers', icon: Users },
      { label: 'Products', path: '/sales/products', icon: Package },
      { label: 'Quotations', path: '/sales/quotations', icon: FileText },
      { label: 'Proforma Invoices', path: '/sales/proforma-invoices', icon: FileSpreadsheet },
      { label: 'Customer POs', path: '/sales/customer-pos', icon: FileCheck2 },
      { label: 'Payment Entries', path: '/sales/payments', icon: CreditCard },
      { label: 'Sales Orders', path: '/sales/sales-orders', icon: ShoppingBag },
      { label: 'Reports', path: '/sales/reports', icon: BarChart3 },
    ],
    quickCreate: [
      { label: 'New Customer Enquiry', path: '/sales/enquiries?create=1' },
      { label: 'Add Follow-up', path: '/sales/follow-ups?create=1' },
      { label: 'Create Quotation', path: '/sales/quotations?create=1' },
      { label: 'Record Payment', path: '/sales/payments?create=1' },
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
      { label: 'Dashboard', path: '/supply-chain', icon: LayoutDashboard },
      { label: 'Material Requests', path: '/supply-chain/material-requests', icon: ClipboardList },
      { label: 'Materials', path: '/supply-chain/materials', icon: Boxes },
      { label: 'Inventory / Stock', path: '/supply-chain/inventory', icon: Warehouse },
      { label: 'Suppliers', path: '/supply-chain/suppliers', icon: Building2 },
      { label: 'Purchase Orders', path: '/supply-chain/purchase-orders', icon: ShoppingCart },
      { label: 'GRN', path: '/supply-chain/grn', icon: PackagePlus },
      { label: 'Material Verification', path: '/supply-chain/verification', icon: ClipboardCheck },
      { label: 'Supplier Returns', path: '/supply-chain/returns', icon: RotateCcw },
      { label: 'Material Issues', path: '/supply-chain/issues', icon: PackageCheck },
      { label: 'Stock History', path: '/supply-chain/stock-history', icon: History },
      { label: 'Reports', path: '/supply-chain/reports', icon: BarChart3 },
    ],
    quickCreate: [
      { label: 'Issue Materials to Production', path: '/supply-chain/material-requests' },
      { label: 'Create Supplier PO', path: '/supply-chain/purchase-orders?create=1' },
      { label: 'Record GRN', path: '/supply-chain/grn?create=1' },
      { label: 'Add Raw Material', path: '/supply-chain/materials?create=1' },
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
      { label: 'Dashboard', path: '/production', icon: LayoutDashboard },
      { label: 'Received Sales Orders', path: '/production/received-orders', icon: Inbox },
      { label: 'Production Orders', path: '/production/orders', icon: Factory },
      { label: 'Production Planning', path: '/production/planning', icon: CalendarClock },
      { label: 'BOM & Material Requests', path: '/production/bom', icon: Layers },
      { label: 'Material Receipts', path: '/production/material-receipts', icon: PackageCheck },
      { label: 'Active Production', path: '/production/active', icon: Wrench },
      { label: 'Daily Production Updates', path: '/production/daily-updates', icon: Activity },
      { label: 'Quality Check', path: '/production/quality-check', icon: ShieldCheck },
      { label: 'Rework', path: '/production/rework', icon: RefreshCw },
      { label: 'Completed Production', path: '/production/completed', icon: CheckCircle2 },
      { label: 'Reports', path: '/production/reports', icon: BarChart3 },
    ],
    quickCreate: [
      { label: 'Create Production Order', path: '/production/received-orders' },
      { label: 'Log Daily Work Update', path: '/production/daily-updates?create=1' },
      { label: 'Record Quality Check', path: '/production/quality-check?create=1' },
      { label: 'Acknowledge Material Receipt', path: '/production/material-receipts' },
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
      { label: 'Dashboard', path: '/logistics', icon: LayoutDashboard },
      { label: 'Ready for Dispatch', path: '/logistics/ready', icon: PackageCheck },
      { label: 'Delivery Orders', path: '/logistics/delivery-orders', icon: ClipboardList },
      { label: 'Dispatched / In Transit', path: '/logistics/in-transit', icon: Truck },
      { label: 'Completed Deliveries', path: '/logistics/completed', icon: CheckCircle2 },
      { label: 'Delivery Issues', path: '/logistics/issues', icon: AlertTriangle },
      { label: 'Delivery History', path: '/logistics/history', icon: History },
      { label: 'Reports', path: '/logistics/reports', icon: BarChart3 },
    ],
    quickCreate: [
      { label: 'Create Delivery Order', path: '/logistics/ready' },
      { label: 'Confirm Dispatch', path: '/logistics/delivery-orders' },
      { label: 'Confirm Delivery', path: '/logistics/in-transit' },
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
      { label: 'Admin Dashboard', path: '/admin', icon: LayoutDashboard },
      { label: 'Employees', path: '/admin/employees', icon: Users },
      { label: 'Employee Access', path: '/admin/employee-access', icon: UserCheck },
      { label: 'Roles & Permissions', path: '/admin/roles', icon: ShieldCheck },
      { label: 'Approval Workflows', path: '/admin/approval-workflows', icon: FileCheck2 },
      { label: 'Approval Inbox', path: '/admin/approvals', icon: ClipboardCheck },
      { label: 'Company Profile', path: '/admin/company', icon: Building2 },
      { label: 'Application Settings', path: '/admin/settings', icon: Settings },
      { label: 'Activity Logs', path: '/admin/logs', icon: History },
    ],
    quickCreate: [
      { label: 'Add Employee', path: '/admin/employees?create=1' },
      { label: 'Company Profile', path: '/admin/company' },
    ],
  },
};

export const OPERATIONAL_DEPARTMENTS: Department[] = ['sales', 'supply_chain', 'production', 'logistics'];

export function inferDepartmentFromPath(pathname: string, fallback: Department): Department {
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
