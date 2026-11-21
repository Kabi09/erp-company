import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Boxes, CheckCircle2, DollarSign, Layers, Plus } from 'lucide-react';
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
import type { RDBOM } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

interface EnrichedBOM extends RDBOM {
  projectCode: string;
  projectTitle: string;
  projectStatus: string;
  leadEngineerName: string;
}

export const RDBomPage: React.FC = () => {
  const { toast } = useERP();
  const navigate = useNavigate();

  const [boms, setBoms] = useState<EnrichedBOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedBOM, setSelectedBOM] = useState<EnrichedBOM | null>(null);

  const loadBOMs = async () => {
    try {
      setLoading(true);
      const data = await erpApi.getAllRDBOMs();
      setBoms(data);
    } catch (e: any) {
      toast('error', 'Failed to load prototype BOMs', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBOMs();
  }, []);

  const filteredBOMs = useMemo(() => {
    return boms.filter((b) => {
      const matchSearch =
        search === '' ||
        b.projectCode.toLowerCase().includes(search.toLowerCase()) ||
        b.projectTitle.toLowerCase().includes(search.toLowerCase()) ||
        b.items.some((i) => i.name.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = statusFilter === 'All' || b.projectStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [boms, search, statusFilter]);

  const columns: ColumnDef<EnrichedBOM>[] = [
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
      header: 'BOM Version',
      accessorKey: 'version',
      cell: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          v{row.version}
        </span>
      ),
    },
    {
      header: 'Component Items',
      cell: (row) => (
        <div className="flex items-center gap-1.5 text-sm">
          <Boxes className="w-4 h-4 text-slate-400" />
          <span className="font-medium">{row.items?.length || 0} materials</span>
        </div>
      ),
    },
    {
      header: 'Total Est. Cost',
      cell: (row) => (
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {formatCurrency(row.totalEstimatedCost || 0)}
        </span>
      ),
    },
    {
      header: 'Consumption Progress',
      cell: (row) => {
        const totalReq = row.items?.reduce((acc, i) => acc + (i.quantityRequired || 0), 0) || 0;
        const totalConsumed = row.items?.reduce((acc, i) => acc + (i.quantityConsumed || 0), 0) || 0;
        const pct = totalReq > 0 ? Math.min(100, Math.round((totalConsumed / totalReq) * 100)) : 0;
        return (
          <div className="w-36 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>{totalConsumed} consumed</span>
              <span>{pct}%</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-600 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      header: 'Project Status',
      cell: (row) => <StatusBadge status={row.projectStatus} />,
    },
    {
      header: 'Actions',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setSelectedBOM(row)}>
            Quick View
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/rd/projects/${row.rdProjectId}?tab=bom`)}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
          >
            Open BOM <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prototype Bill of Materials (BOM) & Requisitions"
        description="Comprehensive engineering components, inventory requests to Supply Chain, and consumption tracking for prototype builds."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by project code, title, or component name..."
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
          data={filteredBOMs}
          loading={loading}
          emptyMessage="No prototype BOMs found matching current filters."
        />
      </div>

      {/* Quick View Modal */}
      {selectedBOM && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedBOM(null)}
          title={`Prototype BOM: ${selectedBOM.projectCode} (v${selectedBOM.version})`}
          size="xl"
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="text-xs text-slate-500">Project</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedBOM.projectTitle}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Est. Cost</p>
                <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(selectedBOM.totalEstimatedCost || 0)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96 border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Material Name</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Part No.</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Category</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Required</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Est. Unit Cost</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Requested</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Consumed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {selectedBOM.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                        No materials defined in this prototype BOM.
                      </td>
                    </tr>
                  ) : (
                    selectedBOM.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{item.name}</td>
                        <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{item.partNumber || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{item.category}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-200">
                          {item.quantityRequired} {item.unit}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400">
                          {formatCurrency(item.estimatedUnitCost)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-600 dark:text-amber-400">
                          {item.quantityRequested || 0}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                          {item.quantityConsumed || 0}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" onClick={() => setSelectedBOM(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  const id = selectedBOM.rdProjectId;
                  setSelectedBOM(null);
                  navigate(`/rd/projects/${id}?tab=bom`);
                }}
              >
                Open Full BOM Workspace
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
