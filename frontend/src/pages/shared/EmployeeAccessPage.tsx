import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Info,
  RotateCcw,
  Save,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import {
  Button,
  ConfirmDialog,
  Field,
  FilterBar,
  Input,
  PageHeader,
  Select,
  StatusBadge,
} from '../../components/ui';
import type {
  Department,
  Employee,
  ModuleDef,
  OverrideEffect,
  PermissionAction,
  Role,
} from '../../types/erp';
import { ERP_MODULE_CATALOG } from '../../types/erp';
import { resolveEffectivePermissions } from '../../utils/rbacLogic';

const STANDARD_ACTIONS: PermissionAction[] = [
  'view',
  'create',
  'edit',
  'delete',
  'submit',
  'approve',
  'verify',
  'confirm',
  'export',
];

export const EmployeeAccessPage: React.FC = () => {
  const { data: db, user: currentUser, refresh, toast } = useERP();
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [empData, setEmpData] = useState<{
    employeeId: string;
    employeeDocNo: string;
    name: string;
    department: Department;
    role: Role;
    overrides: Record<string, Record<string, 'allow' | 'deny'>>;
    effectivePermissions: Record<string, PermissionAction[]>;
  } | null>(null);

  const [draftOverrides, setDraftOverrides] = useState<Record<string, Record<string, 'allow' | 'deny'>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deptFilter, setDeptFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Initial selection
  useEffect(() => {
    if (db?.employees?.length && !selectedEmpId) {
      setSelectedEmpId(db.employees[0].id);
    }
  }, [db?.employees, selectedEmpId]);

  // Load employee permissions
  useEffect(() => {
    if (!selectedEmpId) return;
    setLoading(true);
    erpApi
      .getEmployeePermissions(selectedEmpId)
      .then((res) => {
        setEmpData(res);
        setDraftOverrides(JSON.parse(JSON.stringify(res.overrides || {})));
      })
      .catch((err) => {
        toast('error', 'Failed to load employee permissions', (err as Error).message);
      })
      .finally(() => setLoading(false));
  }, [selectedEmpId, toast]);

  const selectedEmployee = useMemo(() => {
    return db?.employees?.find((e) => e.id === selectedEmpId) || null;
  }, [db?.employees, selectedEmpId]);

  // Live effective permissions based on draftOverrides
  const liveEffectivePermissions = useMemo(() => {
    if (!empData?.role) return {};
    return resolveEffectivePermissions(empData.role.permissions, draftOverrides);
  }, [empData?.role, draftOverrides]);

  // Overrides statistics
  const stats = useMemo(() => {
    let allowCount = 0;
    let denyCount = 0;
    for (const modObj of Object.values(draftOverrides)) {
      for (const eff of Object.values(modObj)) {
        if (eff === 'allow') allowCount++;
        if (eff === 'deny') denyCount++;
      }
    }
    return { allowCount, denyCount };
  }, [draftOverrides]);

  const setOverride = (modId: string, action: PermissionAction, effect: OverrideEffect) => {
    setDraftOverrides((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next[modId]) next[modId] = {};
      if (effect === 'inherit') {
        delete next[modId][action];
        if (Object.keys(next[modId]).length === 0) {
          delete next[modId];
        }
      } else {
        next[modId][action] = effect;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedEmpId) return;
    setSaving(true);
    try {
      await erpApi.updateEmployeePermissions(selectedEmpId, draftOverrides);
      await refresh();
      toast('success', 'Employee access overrides saved successfully.');
    } catch (err) {
      toast('error', 'Failed to save overrides', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedEmpId) return;
    setSaving(true);
    try {
      await erpApi.resetEmployeePermissions(selectedEmpId);
      setDraftOverrides({});
      await refresh();
      toast('success', 'Employee overrides reset to base role defaults.');
    } catch (err) {
      toast('error', 'Failed to reset overrides', (err as Error).message);
    } finally {
      setSaving(false);
      setResetConfirmOpen(false);
    }
  };

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ERP_MODULE_CATALOG.filter((mod) => {
      if (deptFilter !== 'All' && mod.department !== deptFilter) return false;
      if (!q) return true;
      return (
        mod.name.toLowerCase().includes(q) ||
        mod.id.toLowerCase().includes(q) ||
        mod.description.toLowerCase().includes(q)
      );
    });
  }, [deptFilter, search]);

  if (!db) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Access & Permission Overrides"
        subtitle="Fine-tune individual employee permissions with granular Inherit, Allow, or Deny rules over base role defaults."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setResetConfirmOpen(true)}
              disabled={stats.allowCount === 0 && stats.denyCount === 0}
            >
              <RotateCcw className="w-4 h-4" /> Reset to Role Defaults
            </Button>
            <Button onClick={handleSave} loading={saving}>
              <Save className="w-4 h-4" /> Save Permission Overrides
            </Button>
          </div>
        }
      />

      {/* Employee Selector Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="w-full md:w-96">
          <label className="block text-xs font-medium text-slate-500 mb-1">Select Employee Account</label>
          <Select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="w-full font-medium"
          >
            {db.employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.employeeId}) — {emp.department.replace('_', ' ')} / {emp.designation}
              </option>
            ))}
          </Select>
        </div>

        {selectedEmployee && empData && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="text-slate-400 mr-1.5">Assigned Role:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{empData.role?.name}</span>
            </div>
            <div className="px-3 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-semibold">
              +{stats.allowCount} Custom Allow
            </div>
            <div className="px-3 py-1.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 font-semibold">
              -{stats.denyCount} Custom Deny
            </div>
            <StatusBadge status={selectedEmployee.status} />
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          {['All', 'sales', 'supply_chain', 'production', 'logistics', 'service', 'rnd', 'admin', 'shared'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDeptFilter(d)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer capitalize whitespace-nowrap ${
                deptFilter === d
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {d.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search module or action..."
            className="pl-8 text-xs h-8"
          />
        </div>
      </div>

      {/* Overrides Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="px-4 py-3 font-semibold w-1/4">Module & Scope</th>
                <th className="px-3 py-3 font-semibold w-24">Action</th>
                <th className="px-3 py-3 font-semibold text-center w-36">Base Role Default</th>
                <th className="px-4 py-3 font-semibold text-center w-56">Employee Override</th>
                <th className="px-4 py-3 font-semibold text-right w-40">Effective Permission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredCatalog.map((mod) => {
                const applicableActions = mod.actions || STANDARD_ACTIONS;
                return applicableActions.map((act, actIdx) => {
                  const roleHas =
                    (empData?.role?.permissions?.[mod.id] || []).includes(act) ||
                    (empData?.role?.permissions?.[mod.department] || []).includes(act) ||
                    (empData?.role?.permissions?.['admin'] || []).includes('manage') ||
                    (empData?.role?.permissions?.[mod.id] || []).includes('manage');

                  const overrideVal: OverrideEffect = draftOverrides?.[mod.id]?.[act] || 'inherit';
                  const effectivePermsForMod = liveEffectivePermissions?.[mod.id] || [];
                  const isEffectiveAllowed =
                    effectivePermsForMod.includes(act) || effectivePermsForMod.includes('manage');

                  return (
                    <tr
                      key={`${mod.id}-${act}`}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors ${
                        actIdx === 0 ? 'border-t border-slate-200 dark:border-slate-700/80' : ''
                      }`}
                    >
                      {actIdx === 0 ? (
                        <td
                          rowSpan={applicableActions.length}
                          className="px-4 py-3 align-top bg-slate-50/40 dark:bg-slate-900/40 border-r border-slate-100 dark:border-slate-800"
                        >
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{mod.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{mod.description}</div>
                          <div className="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                            {mod.department.replace('_', ' ')}
                          </div>
                        </td>
                      ) : null}

                      <td className="px-3 py-2 font-mono font-medium capitalize text-slate-800 dark:text-slate-200">
                        {act}
                      </td>

                      <td className="px-3 py-2 text-center">
                        {roleHas ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3.5 h-3.5" /> Granted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                            <X className="w-3.5 h-3.5" /> Denied
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-2 text-center">
                        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800 text-[11px]">
                          <button
                            type="button"
                            onClick={() => setOverride(mod.id, act, 'inherit')}
                            className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                              overrideVal === 'inherit'
                                ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            Inherit
                          </button>
                          <button
                            type="button"
                            onClick={() => setOverride(mod.id, act, 'allow')}
                            className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                              overrideVal === 'allow'
                                ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                                : 'text-emerald-600 hover:text-emerald-700'
                            }`}
                          >
                            Allow
                          </button>
                          <button
                            type="button"
                            onClick={() => setOverride(mod.id, act, 'deny')}
                            className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                              overrideVal === 'deny'
                                ? 'bg-rose-600 text-white font-semibold shadow-xs'
                                : 'text-rose-600 hover:text-rose-700'
                            }`}
                          >
                            Deny
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-2 text-right">
                        {isEffectiveAllowed ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" /> Permitted
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              {overrideVal === 'allow' ? 'via Override' : 'via Role'}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                              <XCircle className="w-3 h-3" /> Denied
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              {overrideVal === 'deny' ? 'via Override' : 'via Role'}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset Overrides to Role Defaults?"
        message={`This will clear all individual custom Allow and Deny overrides for ${selectedEmployee?.name}. Their access will strictly follow their assigned role (${empData?.role?.name}).`}
        onConfirm={handleReset}
        onClose={() => setResetConfirmOpen(false)}
        confirmLabel="Reset Overrides"
      />
    </div>
  );
};
