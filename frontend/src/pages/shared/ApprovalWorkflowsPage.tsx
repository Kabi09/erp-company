import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileCheck2,
  Lock,
  Plus,
  Shield,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '../../components/ui';
import type {
  ApprovalLevelConfig,
  ApprovalWorkflow,
  Department,
} from '../../types/erp';

export const ApprovalWorkflowsPage: React.FC = () => {
  const { data: db, toast } = useERP();
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWf, setEditingWf] = useState<ApprovalWorkflow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalWorkflow | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<Department>('sales');
  const [module, setModule] = useState('quotations');
  const [triggerAction, setTriggerAction] = useState('submit');
  const [description, setDescription] = useState('');
  const [allowSelfApproval, setAllowSelfApproval] = useState(false);
  const [levels, setLevels] = useState<ApprovalLevelConfig[]>([
    {
      levelNumber: 1,
      levelName: 'Level 1: Manager Review',
      approverType: 'role',
      eligibleRoleIds: ['role-sales-manager', 'role-super-admin'],
      eligibleEmployeeIds: [],
      requiredApprovalCount: 1,
    },
  ]);

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const data = await erpApi.getApprovalWorkflows();
      setWorkflows(data);
    } catch (err) {
      toast('error', 'Failed to load approval workflows', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  const openCreateModal = () => {
    setEditingWf(null);
    setName('');
    setDepartment('sales');
    setModule('quotations');
    setTriggerAction('submit');
    setDescription('');
    setAllowSelfApproval(false);
    setLevels([
      {
        levelNumber: 1,
        levelName: 'Level 1: Manager Review',
        approverType: 'role',
        eligibleRoleIds: ['role-sales-manager', 'role-super-admin'],
        eligibleEmployeeIds: [],
        requiredApprovalCount: 1,
      },
    ]);
    setModalOpen(true);
  };

  const openEditModal = (wf: ApprovalWorkflow) => {
    setEditingWf(wf);
    setName(wf.name);
    setDepartment(wf.department);
    setModule(wf.module);
    setTriggerAction(wf.triggerAction);
    setDescription(wf.description || '');
    setAllowSelfApproval(wf.allowSelfApproval);
    setLevels(JSON.parse(JSON.stringify(wf.approvalLevels)));
    setModalOpen(true);
  };

  const addLevel = () => {
    const nextNum = levels.length + 1;
    setLevels([
      ...levels,
      {
        levelNumber: nextNum,
        levelName: `Level ${nextNum}: Executive Sign-off`,
        approverType: 'role',
        eligibleRoleIds: ['role-super-admin'],
        eligibleEmployeeIds: [],
        requiredApprovalCount: 1,
      },
    ]);
  };

  const removeLevel = (index: number) => {
    if (levels.length <= 1) return;
    const next = levels
      .filter((_, idx) => idx !== index)
      .map((lvl, idx) => ({ ...lvl, levelNumber: idx + 1 }));
    setLevels(next);
  };

  const updateLevelRole = (levelIndex: number, roleId: string) => {
    setLevels((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const targetRoles: string[] = next[levelIndex].eligibleRoleIds;
      if (targetRoles.includes(roleId)) {
        next[levelIndex].eligibleRoleIds = targetRoles.filter((r) => r !== roleId);
      } else {
        next[levelIndex].eligibleRoleIds.push(roleId);
      }
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast('error', 'Workflow name is required');
    if (levels.length === 0) return toast('error', 'At least one approval level is required');
    for (const lvl of levels) {
      if (lvl.eligibleRoleIds.length === 0) {
        return toast('error', `Please assign at least one eligible role for ${lvl.levelName}`);
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        department,
        module,
        triggerAction,
        description: description.trim(),
        allowSelfApproval,
        approvalLevels: levels,
      };

      if (editingWf) {
        await erpApi.updateApprovalWorkflow(editingWf.id, payload);
        toast('success', `Updated workflow ${payload.name}`);
      } else {
        await erpApi.createApprovalWorkflow(payload);
        toast('success', `Created approval workflow ${payload.name}`);
      }
      setModalOpen(false);
      await loadWorkflows();
    } catch (err) {
      toast('error', 'Failed to save workflow', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (wf: ApprovalWorkflow) => {
    try {
      const res = await erpApi.toggleApprovalWorkflow(wf.id);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === wf.id ? { ...w, enabled: res.enabled } : w)),
      );
      toast('info', `${wf.name} ${res.enabled ? 'Enabled' : 'Disabled'}`);
    } catch (err) {
      toast('error', 'Failed to toggle workflow', (err as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await erpApi.deleteApprovalWorkflow(deleteTarget.id);
      setWorkflows((prev) => prev.filter((w) => w.id !== deleteTarget.id));
      toast('success', `Deleted approval policy ${deleteTarget.name}`);
    } catch (err) {
      toast('error', 'Failed to delete workflow', (err as Error).message);
    } finally {
      setDeleteTarget(null);
    }
  };

  if (!db) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurable Approval Workflows"
        subtitle="Configure multi-level sequential authorization policies, eligible approver roles, and self-approval gates across all departments."
        actions={
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4" /> Create Approval Workflow
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{wf.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 capitalize">
                      {wf.department.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {wf.module} · {wf.triggerAction}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggle(wf)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    wf.enabled ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={wf.enabled}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      wf.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <p className="text-xs text-slate-500 line-clamp-2">{wf.description}</p>

              {/* Self Approval Badge */}
              <div className="flex items-center gap-1.5 text-[11px]">
                {wf.allowSelfApproval ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    <Unlock className="w-3 h-3" /> Self-Approval Allowed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                    <Lock className="w-3 h-3" /> Self-Approval Blocked
                  </span>
                )}
              </div>

              {/* Multi-level Sequence */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Sequential Approval Steps ({wf.approvalLevels.length})
                </div>
                <div className="space-y-1.5">
                  {wf.approvalLevels.map((lvl, idx) => (
                    <div
                      key={lvl.levelNumber}
                      className="p-2 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {lvl.levelName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Step {lvl.levelNumber}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {lvl.eligibleRoleIds.map((rId) => {
                          const roleObj = db.roles.find((r) => r.id === rId);
                          return (
                            <span
                              key={rId}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                            >
                              {roleObj?.name || rId}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
              <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(wf)}>
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              </Button>
              <Button size="sm" variant="secondary" onClick={() => openEditModal(wf)}>
                Configure
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal for Create / Edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingWf ? `Configure Workflow — ${editingWf.name}` : 'New Approval Policy'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="wf-form" loading={saving}>
              {editingWf ? 'Save Changes' : 'Create Workflow'}
            </Button>
          </>
        }
      >
        <form id="wf-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Workflow Name" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Quotation Commercial Approval"
                required
              />
            </Field>
            <Field label="Department" required>
              <Select value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                <option value="sales">Sales Management</option>
                <option value="supply_chain">Supply Chain Management</option>
                <option value="production">Production Management</option>
                <option value="logistics">Logistics & Delivery</option>
                <option value="admin">Administration</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Target Module" required>
              <Select value={module} onChange={(e) => setModule(e.target.value)}>
                <option value="quotations">Quotations (Sales)</option>
                <option value="supplier_pos">Supplier POs (Supply Chain)</option>
                <option value="delivery_orders">Delivery Orders (Logistics)</option>
                <option value="material_requests">Material Requests (Supply Chain)</option>
              </Select>
            </Field>
            <Field label="Trigger Action" required>
              <Select value={triggerAction} onChange={(e) => setTriggerAction(e.target.value)}>
                <option value="submit">On Submit (Standard Approval)</option>
                <option value="cancel">On Cancellation Request</option>
                <option value="override">On Price / Discount Override</option>
              </Select>
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Business rule explanation and criteria for review..."
              rows={2}
            />
          </Field>

          {/* Self Approval Prevention */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 flex items-start gap-3">
            <input
              type="checkbox"
              id="self-approval-check"
              checked={allowSelfApproval}
              onChange={(e) => setAllowSelfApproval(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-teal-600 cursor-pointer"
            />
            <label htmlFor="self-approval-check" className="text-xs cursor-pointer">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Allow Self-Approval by Submitter
              </span>
              <span className="text-slate-500 block mt-0.5">
                When unchecked (recommended), the user who created or submitted the document is strictly blocked from approving their own request.
              </span>
            </label>
          </div>

          {/* Sequential Approval Levels */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Sequential Approval Levels ({levels.length})
                </h4>
                <p className="text-[11px] text-slate-500">Each level must be satisfied before progressing to the next.</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addLevel}>
                <Plus className="w-3.5 h-3.5" /> Add Level
              </Button>
            </div>

            <div className="space-y-3">
              {levels.map((lvl, index) => (
                <div
                  key={index}
                  className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-teal-600">Level {index + 1}</span>
                    {levels.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLevel(index)}
                        className="text-rose-500 hover:text-rose-600 text-xs h-7 px-2"
                      >
                        Remove Step
                      </Button>
                    )}
                  </div>

                  <Field label="Level Name / Purpose" required>
                    <Input
                      value={lvl.levelName}
                      onChange={(e) => {
                        const next = [...levels];
                        next[index].levelName = e.target.value;
                        setLevels(next);
                      }}
                      placeholder="e.g. Sales Manager Review"
                      required
                    />
                  </Field>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Eligible Approver Roles (Any of selected can approve)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {db.roles.map((r) => {
                        const isChecked = lvl.eligibleRoleIds.includes(r.id);
                        return (
                          <label
                            key={r.id}
                            className={`flex items-center gap-2 p-2 rounded border text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-200 font-medium'
                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => updateLevelRole(index, r.id)}
                              className="w-3.5 h-3.5 rounded text-teal-600 cursor-pointer"
                            />
                            <span className="truncate">{r.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Approval Policy?"
        message={`Are you sure you want to permanently delete "${deleteTarget?.name}"? Any currently pending requests under this policy must be resolved first.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        confirmLabel="Delete Policy"
      />
    </div>
  );
};
