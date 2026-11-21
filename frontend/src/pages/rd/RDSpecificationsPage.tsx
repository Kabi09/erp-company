import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileText, Layers, Search, ShieldCheck } from 'lucide-react';
import {
  Button,
  DataTable,
  ErrorBanner,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { RDSpecification } from '../../types/erp';

interface EnrichedSpec extends RDSpecification {
  projectCode: string;
  projectTitle: string;
  projectStatus: string;
  leadEngineerName: string;
}

export const RDSpecificationsPage: React.FC = () => {
  const { toast } = useERP();
  const navigate = useNavigate();

  const [specs, setSpecs] = useState<EnrichedSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedSpec, setSelectedSpec] = useState<EnrichedSpec | null>(null);

  const loadSpecs = async () => {
    try {
      setLoading(true);
      const data = await erpApi.getAllRDSpecifications();
      setSpecs(data);
    } catch (e: any) {
      toast('error', 'Failed to load specifications', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSpecs();
  }, []);

  const filteredSpecs = useMemo(() => {
    return specs.filter((s) => {
      const matchSearch =
        search === '' ||
        s.projectCode.toLowerCase().includes(search.toLowerCase()) ||
        s.projectTitle.toLowerCase().includes(search.toLowerCase()) ||
        s.parameters.some(
          (p) =>
            p.parameterName.toLowerCase().includes(search.toLowerCase()) ||
            p.category.toLowerCase().includes(search.toLowerCase()),
        );
      const matchStatus = statusFilter === 'All' || s.projectStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [specs, search, statusFilter]);

  const columns: ColumnDef<EnrichedSpec>[] = [
    {
      header: 'Project Code',
      accessorKey: 'projectCode',
      cell: (row) => (
        <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
          {row.projectCode}
        </span>
      ),
    },
    {
      header: 'Project Title',
      accessorKey: 'projectTitle',
      cell: (row) => (
        <div className="max-w-xs">
          <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{row.projectTitle}</p>
          <p className="text-xs text-slate-500">Lead: {row.leadEngineerName}</p>
        </div>
      ),
    },
    {
      header: 'Spec Version',
      accessorKey: 'version',
      cell: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          v{row.version}
        </span>
      ),
    },
    {
      header: 'Parameters Defined',
      cell: (row) => (
        <div className="flex items-center gap-1.5 text-sm">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="font-medium">{row.parameters?.length || 0} items</span>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.projectStatus} />,
    },
    {
      header: 'Approved By',
      cell: (row) => (
        <div className="text-xs">
          <p className="text-slate-800 dark:text-slate-200">{row.approvedBy || 'Pending'}</p>
          {row.approvedAt && (
            <p className="text-slate-500">{new Date(row.approvedAt).toLocaleDateString()}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedSpec(row)}
          >
            Quick View
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/rd/projects/${row.rdProjectId}?tab=specifications`)}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
          >
            Open Project <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Specifications Master"
        description="Comprehensive technical baselines, engineering parameters, tolerances, and design limits across all R&D projects."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by project, code, or parameter name..."
      >
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'All', label: 'All Project Statuses' },
            { value: 'Initiated', label: 'Initiated' },
            { value: 'Specification Done', label: 'Specification Done' },
            { value: 'Prototyping', label: 'Prototyping' },
            { value: 'Testing', label: 'Testing' },
            { value: 'Successfully Completed', label: 'Successfully Completed' },
          ]}
        />
      </FilterBar>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={filteredSpecs}
          loading={loading}
          emptyMessage="No product specifications found matching current filters."
        />
      </div>

      {/* Quick View Modal */}
      {selectedSpec && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedSpec(null)}
          title={`Specifications: ${selectedSpec.projectCode} - v${selectedSpec.version}`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="text-xs text-slate-500">Project</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedSpec.projectTitle}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Approved By</p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {selectedSpec.approvedBy || 'Pending'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Approval Date</p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {selectedSpec.approvedAt ? new Date(selectedSpec.approvedAt).toLocaleDateString() : '—'}
                </p>
              </div>
            </div>

            {selectedSpec.notes && (
              <div className="p-3 text-xs bg-indigo-50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                <span className="font-semibold">Engineering Notes: </span>
                {selectedSpec.notes}
              </div>
            )}

            <div className="overflow-x-auto max-h-96 border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Category</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Parameter</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Target Value</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Tolerance</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Unit</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Criticality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {selectedSpec.parameters.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        No parameters defined in this specification baseline.
                      </td>
                    </tr>
                  ) : (
                    selectedSpec.parameters.map((param) => (
                      <tr key={param.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{param.category}</td>
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100 font-semibold">{param.parameterName}</td>
                        <td className="px-3 py-2 font-mono text-indigo-600 dark:text-indigo-400">{param.targetValue}</td>
                        <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{param.tolerance || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{param.unit || '—'}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              param.isCritical
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {param.isCritical ? 'Critical' : 'Standard'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" onClick={() => setSelectedSpec(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  const id = selectedSpec.rdProjectId;
                  setSelectedSpec(null);
                  navigate(`/rd/projects/${id}?tab=specifications`);
                }}
              >
                Open Project Editor
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
