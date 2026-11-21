import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Cpu, Layers, Plus, ShieldCheck } from 'lucide-react';
import {
  Button,
  DataTable,
  ErrorBanner,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { RDProject } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

export const RDProjectsPage: React.FC = () => {
  const { data, user, toast, can } = useERP();
  const navigate = useNavigate();
  const location = useLocation();

  const [projects, setProjects] = useState<RDProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);

  const [form, setForm] = useState({
    title: '',
    objective: '',
    projectType: 'New Product Development' as const,
    leadEngineerId: user?.id || '',
    leadEngineerName: user?.name || '',
    targetCompletionDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    budgetEstimated: 600000,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const res = await erpApi.getRDProjects();
      setProjects(res);
    } catch (e: any) {
      toast('error', 'Failed to load R&D projects', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('create') === '1') {
      setCreateOpen(true);
    }
  }, [location.search]);

  const engineers = useMemo(() => {
    return (data?.employees || []).filter(
      (e) => e.department === 'rd' || e.designation.toLowerCase().includes('engineer') || e.designation.toLowerCase().includes('director'),
    );
  }, [data?.employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      const matchSearch =
        !q ||
        p.projectCode.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.leadEngineerName.toLowerCase().includes(q) ||
        p.projectType.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'All' || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [projects, search, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.objective) {
      setErr('Title and Objective are mandatory.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const created = await erpApi.createRDProject({
        ...form,
        teamMembers: [{ id: form.leadEngineerId || user?.id, name: form.leadEngineerName || user?.name, role: 'Lead Engineer' }],
      });
      toast('success', 'R&D Project Created', created.projectCode);
      setCreateOpen(false);
      setForm({
        title: '',
        objective: '',
        projectType: 'New Product Development',
        leadEngineerId: user?.id || '',
        leadEngineerName: user?.name || '',
        targetCompletionDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        budgetEstimated: 600000,
      });
      await loadProjects();
    } catch (e: any) {
      setErr(e.message || 'Creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<RDProject>[] = [
    {
      key: 'projectCode',
      header: 'Project Code',
      sortable: true,
      render: (p) => (
        <div>
          <button
            type="button"
            onClick={() => navigate(`/rd/projects/${p.id}`)}
            className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline font-mono text-xs cursor-pointer text-left"
          >
            {p.projectCode}
          </button>
          <div className="text-[11px] text-slate-500 font-sans">{p.projectType}</div>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Title & Objectives',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-slate-100">{p.title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{p.objective}</div>
        </div>
      ),
    },
    {
      key: 'currentStage',
      header: 'Current Stage',
      sortable: true,
      render: (p) => (
        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
          {p.currentStage || 'Concept'}
        </span>
      ),
    },
    {
      key: 'leadEngineerName',
      header: 'Lead Engineer',
      sortable: true,
      render: (p) => <span className="text-xs text-slate-800 dark:text-slate-200">{p.leadEngineerName}</span>,
    },
    {
      key: 'budget',
      header: 'Budget Utilization',
      render: (p) => {
        const burnRate = p.budgetEstimated > 0 ? Math.round((p.budgetUtilized / p.budgetEstimated) * 100) : 0;
        return (
          <div className="w-36 space-y-1">
            <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
              <span>{formatCurrency(p.budgetUtilized)}</span>
              <span>{burnRate}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full"
                style={{ width: `${Math.min(100, burnRate)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (p) => (
        <Button
          size="sm"
          variant="primary"
          onClick={() => navigate(`/rd/projects/${p.id}`)}
          className="text-xs"
        >
          <Cpu className="w-3.5 h-3.5 mr-1" />
          Workspace
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="R&D Projects Master Register"
        description="Engineering innovation initiatives, prototype design specifications, experimental BOMs, and dynamic testing validation."
        breadcrumbs={[{ label: 'R&D', path: '/rd' }, { label: 'Projects' }]}
        actions={
          can('rd', 'create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              New R&D Project
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by project code, title, lead engineer..."
        statuses={['All', 'Initiated', 'Specification Done', 'Prototyping', 'Testing', 'Successfully Completed']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyTitle="No R&D Projects"
        emptyDescription="Create an innovation project to initiate product specifications and prototype BOM requisitions."
      />

      {/* Create Project Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create R&D Innovation Project" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {err && <ErrorBanner message={err} />}

          <Field label="Project Title" required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Ultra-Fast Cryo Cascade Refrigeration Engine (-150°C)"
              required
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Project Classification">
              <Select
                value={form.projectType}
                onChange={(e) => setForm({ ...form, projectType: e.target.value as any })}
              >
                <option value="New Product Development">New Product Development</option>
                <option value="Component Research">Component Research</option>
                <option value="Efficiency Optimization">Efficiency Optimization</option>
                <option value="Custom Prototype">Custom Prototype</option>
              </Select>
            </Field>

            <Field label="Lead R&D Engineer" required>
              <Select
                value={form.leadEngineerId}
                onChange={(e) => {
                  const emp = engineers.find((eng) => eng.id === e.target.value);
                  setForm({
                    ...form,
                    leadEngineerId: e.target.value,
                    leadEngineerName: emp?.name || '',
                  });
                }}
                required
              >
                <option value="">Select Lead Engineer...</option>
                {engineers.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.name} ({eng.designation})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Target Completion Date">
              <Input
                type="date"
                value={form.targetCompletionDate}
                onChange={(e) => setForm({ ...form, targetCompletionDate: e.target.value })}
              />
            </Field>

            <Field label="Estimated Budget Allocation (₹)">
              <Input
                type="number"
                min="10000"
                step="5000"
                value={form.budgetEstimated}
                onChange={(e) => setForm({ ...form, budgetEstimated: Number(e.target.value) })}
              />
            </Field>
          </div>

          <Field label="Project Objectives & Research Scope" required>
            <Textarea
              value={form.objective}
              onChange={(e) => setForm({ ...form, objective: e.target.value })}
              placeholder="Specify the technical challenges, cooling requirements, target temperature gradients, or energy efficiency goals..."
              rows={3}
              required
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Initialize Project
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
