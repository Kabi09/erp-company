import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Database,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import {
  Button,
  ConfirmDialog,
  DataTable,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { formatDateTime } from '../../utils/erpLogic';
import type {
  ActivityLog,
  Department,
  Employee,
  PermissionAction,
  PermissionModule,
  Role,
} from '../../types/erp';

// ==========================================
// 1. ADMIN DASHBOARD
// ==========================================

export const AdminDashboard: React.FC = () => {
  const { data: db } = useERP();
  const navigate = useNavigate();
  if (!db) return null;

  const activeEmployees = db.employees.filter((e) => e.status === 'Active').length;
  const lowStockCount = db.materials.filter((m) => (db.stockMap[m.id] || 0) <= m.minStock).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration Overview"
        subtitle="Enterprise user management, RBAC permissions, company configuration, and audit controls."
        actions={
          <Button onClick={() => navigate('/admin/employees')}>
            <UserPlus className="w-4 h-4" /> Manage Employees
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Active Employees"
          value={`${activeEmployees} / ${db.employees.length}`}
          hint="Across 4 departments + Admin"
          onClick={() => navigate('/admin/employees')}
        />
        <StatCard
          label="Configured Roles"
          value={db.roles.length}
          hint="RBAC permission sets"
          onClick={() => navigate('/admin/roles')}
        />
        <StatCard
          label="Confirmed Orders"
          value={db.salesOrders.length}
          hint={`${db.productionOrders.length} production orders`}
          onClick={() => navigate('/tracking')}
        />
        <StatCard
          label="Low Stock Materials"
          value={lowStockCount}
          tone={lowStockCount > 0 ? 'warning' : 'success'}
          hint="Monitor in Supply Chain"
          onClick={() => navigate('/supply-chain/inventory')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Department Headcount</h2>
            <span className="text-xs text-slate-500">4 Operational Departments</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {(['sales', 'supply_chain', 'production', 'logistics', 'admin'] as Department[]).map((dept) => {
              const count = db.employees.filter((e) => e.department === dept && e.status === 'Active').length;
              return (
                <div key={dept} className="py-2.5 flex items-center justify-between">
                  <span className="font-medium capitalize text-slate-800 dark:text-slate-200">
                    {dept.replace('_', ' ')}
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{count} active</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Audit Activity</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/logs')}>
              View Full Log
            </Button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {db.activityLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="py-2 flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {log.action} · <span className="font-mono text-teal-700 dark:text-teal-400">{log.entityDocNo}</span>
                  </div>
                  <div className="text-slate-500 truncate">{log.details}</div>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{log.actorName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. EMPLOYEES PAGE
// ==========================================

export const EmployeesPage: React.FC = () => {
  const { data: db, refresh, toast } = useERP();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);

  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState<Department>('sales');
  const [roleId, setRoleId] = useState('role-sales-exec');
  const [designation, setDesignation] = useState('');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [password, setPassword] = useState('');

  if (!db) return null;

  const openCreate = () => {
    setEditing(null);
    setEmployeeId(`CRYO-${String(db.employees.length + 1).padStart(3, '0')}`);
    setName('');
    setEmail('');
    setPhone('');
    setDepartment('sales');
    setRoleId('role-sales-exec');
    setDesignation('Executive');
    setStatus('Active');
    setPassword('cryo123');
    setModalOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setEmployeeId(emp.employeeId);
    setName(emp.name);
    setEmail(emp.email);
    setPhone(emp.phone);
    setDepartment(emp.department);
    setRoleId(emp.roleId);
    setDesignation(emp.designation);
    setStatus(emp.status);
    setPassword('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await erpApi.updateEmployee(editing.id, {
          name,
          phone,
          department,
          roleId,
          designation,
          status,
          password: password || undefined,
        });
      } else {
        await erpApi.createEmployee({
          employeeId,
          name,
          email,
          phone,
          department,
          roleId,
          designation,
          status,
          password: password || 'cryo123',
        });
      }
      await refresh();
      setModalOpen(false);
      toast('success', editing ? 'Employee updated' : 'Employee created');
    } catch (err) {
      toast('error', 'Save failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.employees.filter((e) => {
      if (deptFilter !== 'All' && e.department !== deptFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.employeeId.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q)
      );
    });
  }, [db.employees, search, deptFilter]);

  const columns: ColumnDef<Employee>[] = [
    {
      key: 'id',
      header: 'Employee',
      sortable: true,
      sortValue: (e) => e.name,
      render: (e) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{e.name}</div>
          <div className="text-xs font-mono text-slate-500">
            {e.employeeId} · {e.email}
          </div>
        </div>
      ),
    },
    {
      key: 'dept',
      header: 'Department & Designation',
      render: (e) => (
        <div className="text-xs">
          <div className="font-medium capitalize">{e.department.replace('_', ' ')}</div>
          <div className="text-slate-500">{e.designation}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (e) => {
        const role = db.roles.find((r) => r.id === e.roleId);
        return <span className="text-xs font-medium">{role?.name || e.roleId}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (e) => (
        <Button size="sm" variant="secondary" onClick={() => openEdit(e)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Create user accounts, assign departments and RBAC roles, and activate or deactivate access."
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add Employee
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, Employee ID, email, or designation..."
        statuses={['All', 'sales', 'supply_chain', 'production', 'logistics', 'admin']}
        activeStatus={deptFilter}
        onStatusChange={setDeptFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(e) => (
          <div className="space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-sm">{e.name}</div>
                <div className="text-xs font-mono text-slate-500">{e.employeeId}</div>
              </div>
              <StatusBadge status={e.status} />
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {e.email} · <span className="capitalize">{e.department.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-end pt-1 border-t border-slate-100 dark:border-slate-800">
              <Button size="sm" variant="secondary" onClick={() => openEdit(e)}>
                Edit Account
              </Button>
            </div>
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Employee — ${editing.employeeId}` : 'Add New Employee'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="employee-form" loading={saving}>
              {editing ? 'Save Changes' : 'Create Employee'}
            </Button>
          </>
        }
      >
        <form id="employee-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Employee ID" required>
              <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={Boolean(editing)} required />
            </Field>
            <Field label="Full Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email Address" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(editing)} required />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Department" required>
              <Select value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                <option value="sales">Sales Management</option>
                <option value="supply_chain">Supply Chain Management</option>
                <option value="production">Production Management</option>
                <option value="logistics">Logistics & Delivery</option>
                <option value="admin">Administration</option>
              </Select>
            </Field>
            <Field label="Assigned Role" required>
              <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {db.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" required>
              <Select value={status} onChange={(e) => setStatus(e.target.value as 'Active' | 'Inactive')}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Designation" required>
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} required />
            </Field>
            <Field
              label={editing ? 'Reset Password (optional)' : 'Initial Password'}
              hint={editing ? 'Leave blank to keep existing password' : 'Default: cryo123'}
            >
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// ==========================================
// 3. DEPARTMENTS & ROLES / PERMISSIONS MATRIX
// ==========================================

const ALL_MODULES: PermissionModule[] = [
  'sales',
  'supply_chain',
  'production',
  'logistics',
  'tracking',
  'reports',
  'admin',
];
const ALL_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'];

export const RolesPermissionsPage: React.FC = () => {
  const { data: db, refresh, toast } = useERP();
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [draftPerms, setDraftPerms] = useState<Role['permissions'] | null>(null);
  const [saving, setSaving] = useState(false);

  if (!db) return null;

  const activeRole = db.roles.find((r) => r.id === selectedRoleId) || db.roles[0];
  const currentPerms = draftPerms || activeRole?.permissions;

  const selectRole = (role: Role) => {
    setSelectedRoleId(role.id);
    setDraftPerms(JSON.parse(JSON.stringify(role.permissions)));
  };

  const togglePerm = (mod: PermissionModule, action: PermissionAction) => {
    if (!activeRole) return;
    const base = draftPerms ? JSON.parse(JSON.stringify(draftPerms)) : JSON.parse(JSON.stringify(activeRole.permissions));
    const list: PermissionAction[] = base[mod] || [];
    base[mod] = list.includes(action) ? list.filter((a) => a !== action) : [...list, action];
    setDraftPerms(base);
  };

  const saveRole = async () => {
    if (!activeRole || !currentPerms) return;
    setSaving(true);
    try {
      await erpApi.updateRole(activeRole.id, { permissions: currentPerms });
      await refresh();
      setDraftPerms(null);
      toast('success', `Saved permissions for ${activeRole.name}`);
    } catch (err) {
      toast('error', 'Update failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Departments & Role Permissions"
        subtitle="Configure module-level RBAC matrices (View, Create, Edit, Delete, Approve, Export, Manage)."
        actions={
          <Button onClick={saveRole} loading={saving} disabled={!draftPerms}>
            <Save className="w-4 h-4" /> Save Permission Matrix
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
          {db.roles.map((r) => {
            const isSel = r.id === activeRole?.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => selectRole(r)}
                className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                  isSel ? 'bg-teal-50/70 dark:bg-teal-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.name}</span>
                  <ShieldCheck className={`w-4 h-4 ${isSel ? 'text-teal-600' : 'text-slate-400'}`} />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{activeRole?.name}</div>
              <div className="text-xs text-slate-500">{activeRole?.description}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="px-4 py-2.5 text-left font-medium">Module</th>
                  {ALL_ACTIONS.map((act) => (
                    <th key={act} className="px-2 py-2.5 text-center font-medium capitalize">
                      {act}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {ALL_MODULES.map((mod) => (
                  <tr key={mod}>
                    <td className="px-4 py-3 font-medium uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      {mod.replace('_', ' ')}
                    </td>
                    {ALL_ACTIONS.map((act) => {
                      const checked = (currentPerms?.[mod] || []).includes(act);
                      return (
                        <td key={act} className="px-2 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePerm(mod, act)}
                            aria-label={`${mod} ${act}`}
                            className="w-4 h-4 rounded border-slate-300 text-teal-600 cursor-pointer"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 4. COMPANY PROFILE PAGE
// ==========================================

export const CompanyProfilePage: React.FC = () => {
  const { data: db, refresh, toast } = useERP();
  const [form, setForm] = useState(db?.company || null);
  const [saving, setSaving] = useState(false);

  if (!db || !form) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await erpApi.updateCompany(form);
      await refresh();
      toast('success', 'Company profile & bank details saved');
    } catch (err) {
      toast('error', 'Save failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl">
      <PageHeader
        title="Company Profile & Commercial Defaults"
        subtitle="Details shown on Quotations, Proforma Invoices, and Supplier Purchase Orders."
        actions={
          <Button type="submit" loading={saving}>
            <Building2 className="w-4 h-4" /> Save Profile
          </Button>
        }
      />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Organization Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company Display Name" required>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
          </Field>
          <Field label="Legal Entity Name" required>
            <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} required />
          </Field>
          <Field label="GSTIN" required>
            <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} required />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Official Email">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </Field>
        </div>
        <Field label="Registered Factory / Office Address">
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bank Details (Printed on Proforma Invoices)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Bank Name">
            <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </Field>
          <Field label="Account Name">
            <Input value={form.bankAccountName} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} />
          </Field>
          <Field label="Account Number">
            <Input value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} />
          </Field>
          <Field label="IFSC Code">
            <Input value={form.bankIfsc} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })} />
          </Field>
          <Field label="Branch">
            <Input value={form.bankBranch} onChange={(e) => setForm({ ...form, bankBranch: e.target.value })} />
          </Field>
          <Field label="Default GST / Tax (%)">
            <Input
              type="number"
              min="0"
              max="50"
              value={form.defaultTaxPercent}
              onChange={(e) => setForm({ ...form, defaultTaxPercent: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Default Payment Terms">
            <Input value={form.defaultPaymentTerms} onChange={(e) => setForm({ ...form, defaultPaymentTerms: e.target.value })} />
          </Field>
          <Field label="Default Delivery Terms">
            <Input value={form.defaultDeliveryTerms} onChange={(e) => setForm({ ...form, defaultDeliveryTerms: e.target.value })} />
          </Field>
          <Field label="Default Warranty">
            <Input value={form.defaultWarranty} onChange={(e) => setForm({ ...form, defaultWarranty: e.target.value })} />
          </Field>
        </div>
      </div>
    </form>
  );
};

// ==========================================
// 5. APPLICATION SETTINGS & DEMO DATA RESET
// ==========================================

export const AppSettingsPage: React.FC = () => {
  const { data: db, refresh, toast } = useERP();
  const [confirmMode, setConfirmMode] = useState<'seed' | 'clean' | null>(null);
  const [working, setWorking] = useState(false);

  if (!db) return null;

  const handleReset = async () => {
    if (!confirmMode) return;
    setWorking(true);
    try {
      await erpApi.resetDemoData(confirmMode);
      await refresh();
      setConfirmMode(null);
      toast(
        'success',
        confirmMode === 'seed' ? 'Demo data restored to initial snapshot' : 'Operational transactions cleared',
      );
    } catch (err) {
      toast('error', 'Operation failed', (err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="Application Settings & Data Management"
        subtitle="Control demo datasets, clean-slate resets, and persistent storage status."
      />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Demo Data Lifecycle Controls</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Resetting restores the complete interconnected CRYO sample dataset across all 4 departments. Clearing
              operational data keeps your employees, roles, customers, products, materials, and suppliers while removing
              transactional records for fresh testing.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button variant="secondary" onClick={() => setConfirmMode('seed')}>
            <RotateCcw className="w-4 h-4" /> Restore Full Demo Data
          </Button>
          <Button variant="danger" onClick={() => setConfirmMode('clean')}>
            <Trash2 className="w-4 h-4" /> Clear Operational Transactions
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmMode)}
        onClose={() => setConfirmMode(null)}
        onConfirm={handleReset}
        loading={working}
        variant={confirmMode === 'clean' ? 'danger' : 'primary'}
        title={confirmMode === 'seed' ? 'Restore Full Demo Dataset?' : 'Clear All Operational Records?'}
        message={
          confirmMode === 'seed'
            ? 'This replaces all current operational records with the standard CRYO Enterprise ERP 2.0 interconnected demo dataset.'
            : 'This removes all enquiries, quotations, PIs, payments, orders, BOMs, GRNs, QC checks, and deliveries while preserving master catalogs and user accounts.'
        }
        confirmLabel={confirmMode === 'seed' ? 'Restore Demo Data' : 'Clear Operational Data'}
      />
    </div>
  );
};

// ==========================================
// 6. ACTIVITY LOGS PAGE
// ==========================================

export const ActivityLogsPage: React.FC = () => {
  const { data: db } = useERP();
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');

  if (!db) return null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.activityLogs.filter((l) => {
      if (deptFilter !== 'All' && l.department !== deptFilter) return false;
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        l.entityDocNo.toLowerCase().includes(q) ||
        l.actorName.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q)
      );
    });
  }, [db.activityLogs, search, deptFilter]);

  const columns: ColumnDef<ActivityLog>[] = [
    {
      key: 'time',
      header: 'Timestamp',
      sortable: true,
      sortValue: (l) => l.timestamp,
      render: (l) => <span className="font-mono text-xs text-slate-500">{formatDateTime(l.timestamp)}</span>,
    },
    {
      key: 'actor',
      header: 'Actor / Dept',
      render: (l) => (
        <div className="text-xs">
          <div className="font-medium text-slate-900 dark:text-slate-100">{l.actorName}</div>
          <div className="capitalize text-slate-500">{l.department.replace('_', ' ')}</div>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action & Reference',
      render: (l) => (
        <div className="text-xs">
          <div className="font-medium text-slate-900 dark:text-slate-100">{l.action}</div>
          <div className="font-mono text-teal-700 dark:text-teal-400">
            {l.entityType} · {l.entityDocNo}
          </div>
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Audit Details',
      render: (l) => <span className="text-xs text-slate-600 dark:text-slate-400">{l.details}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Audit & Activity Logs"
        subtitle="Chronological immutable trail of operational transitions across all CRYO departments."
      />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search action, document number, user, or details..."
        statuses={['All', 'sales', 'supply_chain', 'production', 'logistics', 'admin']}
        activeStatus={deptFilter}
        onStatusChange={setDeptFilter}
      />
      <DataTable rows={filtered} columns={columns} pageSize={15} />
    </div>
  );
};
