import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Check,
  CheckCircle2,
  Database,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
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
import { ERP_MODULE_CATALOG } from '../../types/erp';

// ==========================================
// 1. ADMIN DASHBOARD
// ==========================================

export const AdminDashboard: React.FC = () => {
  const { data: db } = useERP();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    erpApi.getAdminSummary().then((res) => setSummary(res)).catch(() => {});
  }, []);

  if (!db) return null;

  const activeEmployees = summary?.activeEmployees ?? db.employees.filter((e) => e.status === 'Active').length;
  const totalEmployees = summary?.totalEmployees ?? db.employees.length;
  const lowStockCount = summary?.lowStockMaterials ?? db.materials.filter((m) => (db.stockMap[m.id] || 0) <= m.minStock).length;
  const confirmedOrders = summary?.confirmedSalesOrders ?? db.salesOrders.length;
  const activeProd = summary?.activeProductionOrders ?? db.productionOrders.filter((p) => p.status === 'In Progress' || p.status === 'Ready to Start').length;
  const pendingMRs = summary?.pendingMaterialRequests ?? db.materialRequests.filter((m) => m.status === 'Pending').length;
  const qcPending = summary?.qcPending ?? db.productionOrders.filter((p) => p.status === 'QC Pending').length;
  const readyDispatch = summary?.readyForDispatch ?? db.productionOrders.filter((p) => p.status === 'Completed').length;
  const pendingDeliveries = summary?.pendingDeliveries ?? db.deliveryOrders.filter((d) => ['Planned', 'In Transit'].includes(d.status)).length;

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
          value={`${activeEmployees} / ${totalEmployees}`}
          hint="Across 4 departments + Admin"
          onClick={() => navigate('/admin/employees')}
        />
        <StatCard
          label="Confirmed Sales Orders"
          value={confirmedOrders}
          hint={`${activeProd} production orders active`}
          onClick={() => navigate('/tracking')}
        />
        <StatCard
          label="Pending Material Requests"
          value={pendingMRs}
          tone={pendingMRs > 0 ? 'warning' : 'default'}
          hint="Awaiting store issue"
          onClick={() => navigate('/supply-chain/material-requests')}
        />
        <StatCard
          label="Low Stock Materials"
          value={lowStockCount}
          tone={lowStockCount > 0 ? 'warning' : 'success'}
          hint="Below reorder threshold"
          onClick={() => navigate('/supply-chain/inventory')}
        />
        <StatCard
          label="Active Production Orders"
          value={activeProd}
          hint="Floor manufacturing running"
          onClick={() => navigate('/production/active')}
        />
        <StatCard
          label="Quality Checks Pending"
          value={qcPending}
          tone={qcPending > 0 ? 'warning' : 'default'}
          hint="Awaiting technical inspection"
          onClick={() => navigate('/production/quality-check')}
        />
        <StatCard
          label="Ready for Dispatch"
          value={readyDispatch}
          tone="success"
          hint="QC accepted finished goods"
          onClick={() => navigate('/logistics/ready')}
        />
        <StatCard
          label="Deliveries In Progress"
          value={pendingDeliveries}
          hint="Planned / in transit shipments"
          onClick={() => navigate('/logistics/delivery-orders')}
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

const ALL_ACTIONS: PermissionAction[] = [
  'view',
  'create',
  'edit',
  'delete',
  'submit',
  'approve',
  'verify',
  'confirm',
  'export',
  'manage',
];

export const RolesPermissionsPage: React.FC = () => {
  const { data: db, refresh, toast } = useERP();
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [draftPerms, setDraftPerms] = useState<Role['permissions'] | null>(null);
  const [saving, setSaving] = useState(false);
  const [deptFilter, setDeptFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Custom Role Creation Modal
  const [createRoleModalOpen, setCreateRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDept, setNewRoleDept] = useState<Department>('sales');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [templateRoleId, setTemplateRoleId] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);

  // Delete Role Confirm
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<Role | null>(null);

  if (!db) return null;

  const activeRole = db.roles.find((r) => r.id === selectedRoleId) || db.roles[0];
  const currentPerms = draftPerms || activeRole?.permissions || {};

  const selectRole = (role: Role) => {
    setSelectedRoleId(role.id);
    setDraftPerms(JSON.parse(JSON.stringify(role.permissions || {})));
  };

  const togglePerm = (mod: string, action: PermissionAction) => {
    if (!activeRole) return;
    const base = draftPerms
      ? JSON.parse(JSON.stringify(draftPerms))
      : JSON.parse(JSON.stringify(activeRole.permissions || {}));
    const list: PermissionAction[] = base[mod] || [];
    base[mod] = list.includes(action) ? list.filter((a) => a !== action) : [...list, action];
    setDraftPerms(base);
  };

  const toggleRowAll = (mod: string, actions: PermissionAction[]) => {
    const base = draftPerms
      ? JSON.parse(JSON.stringify(draftPerms))
      : JSON.parse(JSON.stringify(activeRole.permissions || {}));
    const currentList: PermissionAction[] = base[mod] || [];
    const allSelected = actions.every((a) => currentList.includes(a));

    if (allSelected) {
      base[mod] = [];
    } else {
      base[mod] = Array.from(new Set([...currentList, ...actions]));
    }
    setDraftPerms(base);
  };

  const selectAllForRole = () => {
    const next: Record<string, PermissionAction[]> = {};
    for (const mod of ERP_MODULE_CATALOG) {
      next[mod.id] = [...mod.actions, 'manage'];
    }
    // Also include coarse department keys
    for (const dept of ['sales', 'supply_chain', 'production', 'logistics', 'admin', 'tracking', 'reports']) {
      next[dept] = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'];
    }
    setDraftPerms(next as any);
  };

  const clearAllForRole = () => {
    setDraftPerms({} as any);
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

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return toast('error', 'Role name is required');
    setCreatingRole(true);
    try {
      let initialPerms = {};
      if (templateRoleId) {
        const t = db.roles.find((r) => r.id === templateRoleId);
        if (t) initialPerms = JSON.parse(JSON.stringify(t.permissions || {}));
      }

      const created = await erpApi.createRole({
        name: newRoleName.trim(),
        department: newRoleDept,
        description: newRoleDesc.trim(),
        permissions: initialPerms,
      });

      await refresh();
      setSelectedRoleId(created.id);
      setDraftPerms(null);
      setCreateRoleModalOpen(false);
      setNewRoleName('');
      setNewRoleDesc('');
      toast('success', `Created custom role ${created.name}`);
    } catch (err) {
      toast('error', 'Role creation failed', (err as Error).message);
    } finally {
      setCreatingRole(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!deleteRoleTarget) return;
    try {
      await erpApi.deleteRole(deleteRoleTarget.id);
      await refresh();
      setSelectedRoleId(db.roles[0]?.id || '');
      setDraftPerms(null);
      toast('success', `Deleted role ${deleteRoleTarget.name}`);
    } catch (err) {
      toast('error', 'Failed to delete role', (err as Error).message);
    } finally {
      setDeleteRoleTarget(null);
    }
  };

  const isCoreRole = (roleId: string) => {
    const core = [
      'role-super-admin',
      'role-sales-manager',
      'role-sales-exec',
      'role-scm-manager',
      'role-stores-exec',
      'role-production-manager',
      'role-prod-planner',
      'role-qc-inspector',
      'role-logistics-manager',
      'role-dispatch-exec',
    ];
    return core.includes(roleId);
  };

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ERP_MODULE_CATALOG.filter((m) => {
      if (deptFilter !== 'All' && m.department !== deptFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    });
  }, [deptFilter, search]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Departments & Role Permissions Matrix"
        subtitle="Manage base access roles and configure operational module actions (View, Create, Edit, Delete, Submit, Approve, Verify, Confirm, Export, Manage)."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setCreateRoleModalOpen(true)}>
              <Plus className="w-4 h-4" /> Create Custom Role
            </Button>
            <Button onClick={saveRole} loading={saving} disabled={!draftPerms}>
              <Save className="w-4 h-4" /> Save Permission Matrix
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Roles Sidebar */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 font-semibold text-xs text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>Roles ({db.roles.length})</span>
            <Button size="sm" variant="ghost" onClick={() => setCreateRoleModalOpen(true)} className="h-6 px-1.5 text-xs">
              + New
            </Button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[640px] overflow-y-auto">
            {db.roles.map((r) => {
              const isSel = r.id === activeRole?.id;
              const isCore = isCoreRole(r.id);
              return (
                <div
                  key={r.id}
                  onClick={() => selectRole(r)}
                  className={`w-full p-3 transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                    isSel ? 'bg-teal-50 dark:bg-teal-950/40 border-l-4 border-teal-600' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{r.name}</span>
                      {isCore && (
                        <span title="Core System Role">
                          <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 capitalize mt-0.5">{r.department.replace('_', ' ')}</div>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{r.description}</p>
                  </div>

                  {!isCore && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteRoleTarget(r);
                      }}
                      className="text-slate-300 hover:text-rose-500 p-1"
                      title="Delete Role"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Matrix Area */}
        <div className="lg:col-span-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-xs flex flex-col">
          {/* Header Bar */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/30">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{activeRole?.name}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 capitalize">
                  {activeRole?.department.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{activeRole?.description}</p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Button size="sm" variant="secondary" onClick={selectAllForRole}>
                Select All
              </Button>
              <Button size="sm" variant="secondary" onClick={clearAllForRole}>
                Clear All
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              {['All', 'sales', 'supply_chain', 'production', 'logistics', 'admin', 'shared'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDeptFilter(d)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors capitalize whitespace-nowrap ${
                    deptFilter === d
                      ? 'bg-teal-600 text-white font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {d.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search module..."
                className="pl-8 text-xs h-7"
              />
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="px-4 py-2.5 font-semibold w-52">Operational Module</th>
                  {ALL_ACTIONS.map((act) => (
                    <th key={act} className="px-2 py-2.5 text-center font-semibold capitalize w-14">
                      {act}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-semibold w-16">All</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCatalog.map((mod) => {
                  const modActions = (currentPerms?.[mod.id] || []) as PermissionAction[];
                  const deptActions = (currentPerms?.[mod.department] || []) as PermissionAction[];
                  const adminActions = (currentPerms?.['admin'] || []) as PermissionAction[];
                  const isWildcardActive = modActions.includes('manage') || adminActions.includes('manage');

                  return (
                    <tr key={mod.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{mod.name}</div>
                        <div className="text-[10px] text-slate-400">{mod.description}</div>
                      </td>

                      {ALL_ACTIONS.map((act) => {
                        const isApplicable = mod.actions.includes(act) || act === 'manage';
                        const isDirectChecked = modActions.includes(act);
                        const isInheritedChecked = deptActions.includes(act) || isWildcardActive;
                        const isChecked = isDirectChecked || isInheritedChecked;

                        return (
                          <td key={act} className="px-2 py-2.5 text-center">
                            {isApplicable ? (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePerm(mod.id, act)}
                                aria-label={`${mod.name} ${act}`}
                                className="w-4 h-4 rounded border-slate-300 text-teal-600 cursor-pointer focus:ring-teal-500"
                              />
                            ) : (
                              <span className="text-slate-200 dark:text-slate-700 select-none">—</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleRowAll(mod.id, mod.actions)}
                          className="text-[10px] font-semibold text-teal-600 hover:text-teal-700 cursor-pointer"
                        >
                          Toggle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Custom Role Modal */}
      <Modal
        open={createRoleModalOpen}
        onClose={() => setCreateRoleModalOpen(false)}
        title="Create Custom Access Role"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateRoleModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-role-form" loading={creatingRole}>
              Create Role
            </Button>
          </>
        }
      >
        <form id="create-role-form" onSubmit={handleCreateRole} className="space-y-4">
          <Field label="Role Name" required>
            <Input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="e.g. Quality Assurance Specialist"
              required
            />
          </Field>

          <Field label="Department" required>
            <Select value={newRoleDept} onChange={(e) => setNewRoleDept(e.target.value as Department)}>
              <option value="sales">Sales Management</option>
              <option value="supply_chain">Supply Chain Management</option>
              <option value="production">Production Management</option>
              <option value="logistics">Logistics & Delivery</option>
              <option value="admin">Administration</option>
            </Select>
          </Field>

          <Field label="Clone Permissions Template (Optional)">
            <Select value={templateRoleId} onChange={(e) => setTemplateRoleId(e.target.value)}>
              <option value="">Start Empty</option>
              {db.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  Copy from: {r.name} ({r.department})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Description">
            <Textarea
              value={newRoleDesc}
              onChange={(e) => setNewRoleDesc(e.target.value)}
              placeholder="Responsibilities and permission boundaries..."
              rows={2}
            />
          </Field>
        </form>
      </Modal>

      {/* Delete Role Confirm */}
      <ConfirmDialog
        open={Boolean(deleteRoleTarget)}
        title="Delete Custom Role?"
        message={`Are you sure you want to permanently delete role "${deleteRoleTarget?.name}"? Employees assigned to this role must be reassigned first.`}
        onConfirm={handleDeleteRole}
        onClose={() => setDeleteRoleTarget(null)}
        confirmLabel="Delete Role"
      />
    </div>
  );
};

// Re-export new modular administration pages
export { EmployeeAccessPage } from './EmployeeAccessPage';
export { ApprovalWorkflowsPage } from './ApprovalWorkflowsPage';
export { ApprovalInboxPage } from './ApprovalInboxPage';

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
          <Field label="State & Country">
            <Input
              value={`${form.state || ''}${form.country ? `, ${form.country}` : ''}`}
              placeholder="e.g. Karnataka, India"
              onChange={(e) => {
                const parts = e.target.value.split(',').map((p) => p.trim());
                setForm({ ...form, state: parts[0] || '', country: parts[1] || 'India' });
              }}
            />
          </Field>
        </div>
        <Field label="Registered Factory / Office Address">
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bank Details & Digital Remittance</h2>
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
          <Field label="UPI ID (VPA)">
            <Input value={form.upiId || ''} placeholder="e.g. cryo@sbi" onChange={(e) => setForm({ ...form, upiId: e.target.value })} />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Authorized Signatory Name">
            <Input
              value={form.authorizedSignatoryName || ''}
              placeholder="e.g. Rajesh Sharma"
              onChange={(e) => setForm({ ...form, authorizedSignatoryName: e.target.value })}
            />
          </Field>
          <Field label="Authorized Signatory Designation">
            <Input
              value={form.authorizedSignatoryDesignation || ''}
              placeholder="e.g. Managing Director"
              onChange={(e) => setForm({ ...form, authorizedSignatoryDesignation: e.target.value })}
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
