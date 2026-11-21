import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Cpu, Eye, FileText, Layers, ShieldCheck } from 'lucide-react';
import {
  Button,
  Card,
  DataTable,
  FilterBar,
  Modal,
  PageHeader,
  StatusBadge,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { RDProject } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

export const RDCompletedPage: React.FC = () => {
  const { toast } = useERP();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<RDProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<RDProject | null>(null);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const res = await erpApi.getRDProjects();
      setProjects(res.filter((p) => p.status === 'Successfully Completed'));
    } catch (e: any) {
      toast('error', 'Failed to load completed R&D projects', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      return (
        search === '' ||
        p.projectCode.toLowerCase().includes(search.toLowerCase()) ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.leadEngineerName.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [projects, search]);

  const columns: ColumnDef<RDProject>[] = [
    {
      header: 'Project Code',
      accessorKey: 'projectCode',
      cell: (row) => (
        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
          {row.projectCode}
        </span>
      ),
    },
    {
      header: 'Title & Objective',
      cell: (row) => (
        <div className="max-w-md">
          <p className="font-semibold text-slate-900 dark:text-slate-100">{row.title}</p>
          <p className="text-xs text-slate-500 line-clamp-1">{row.objective}</p>
        </div>
      ),
    },
    {
      header: 'Lead Engineer',
      accessorKey: 'leadEngineerName',
      cell: (row) => <span className="text-xs text-slate-800 dark:text-slate-200">{row.leadEngineerName}</span>,
    },
    {
      header: 'Budget Utilized',
      cell: (row) => (
        <div className="text-xs">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(row.budgetUtilized)}
          </span>
          <span className="text-slate-400"> / {formatCurrency(row.budgetEstimated)}</span>
        </div>
      ),
    },
    {
      header: 'Completed At',
      cell: (row) => (
        <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
          {row.completedAt ? new Date(row.completedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Actions',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setSelectedProject(row)}>
            View Conclusion
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/rd/projects/${row.id}`)}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
          >
            Archive View <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Completed R&D Projects Archive"
        description="Preserved experimental knowledge, validation records, and engineering conclusions of successfully concluded research projects."
      />

      <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
          <p className="font-semibold">Architectural Boundary Enforcement:</p>
          <p>
            R&D is an independent experimental workspace. Successfully completed projects are archived with their full prototype bill of materials, test checklists, and engineering conclusions without automated injection into Production Master BOMs or Production Orders.
          </p>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search completed projects by code, title, or lead engineer..."
      />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          emptyMessage="No completed R&D projects in archive."
        />
      </div>

      {/* Conclusion Modal */}
      {selectedProject && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedProject(null)}
          title={`Completed R&D: ${selectedProject.projectCode} - ${selectedProject.title}`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs">
              <div>
                <p className="text-slate-500">Lead Engineer</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedProject.leadEngineerName}</p>
              </div>
              <div>
                <p className="text-slate-500">Date Completed</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {selectedProject.completedAt ? new Date(selectedProject.completedAt).toLocaleString() : '—'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Final Engineering Conclusion:</p>
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200 rounded-lg border border-emerald-100 dark:border-emerald-900/50 whitespace-pre-wrap">
                {selectedProject.finalConclusion || 'Objectives completed and validated successfully.'}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" onClick={() => setSelectedProject(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  const id = selectedProject.id;
                  setSelectedProject(null);
                  navigate(`/rd/projects/${id}`);
                }}
              >
                Inspect Full Project Archive
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
