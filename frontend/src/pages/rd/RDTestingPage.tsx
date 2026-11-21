import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
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
import type { RDTestRecord } from '../../types/erp';

interface EnrichedTest extends RDTestRecord {
  projectCode: string;
  projectTitle: string;
}

export const RDTestingPage: React.FC = () => {
  const { toast } = useERP();
  const navigate = useNavigate();

  const [tests, setTests] = useState<EnrichedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedTest, setSelectedTest] = useState<EnrichedTest | null>(null);

  const loadTests = async () => {
    try {
      setLoading(true);
      const data = await erpApi.getAllRDTests();
      setTests(data);
    } catch (e: any) {
      toast('error', 'Failed to load testing records', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTests();
  }, []);

  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const matchSearch =
        search === '' ||
        t.testName.toLowerCase().includes(search.toLowerCase()) ||
        t.projectCode.toLowerCase().includes(search.toLowerCase()) ||
        t.projectTitle.toLowerCase().includes(search.toLowerCase()) ||
        t.testedByName.toLowerCase().includes(search.toLowerCase());

      const matchStatus =
        statusFilter === 'All'
          ? true
          : statusFilter === 'Retest Required'
          ? t.retestRequired
          : t.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [tests, search, statusFilter]);

  const columns: ColumnDef<EnrichedTest>[] = [
    {
      header: 'Protocol & Test Name',
      cell: (row) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{row.testName}</p>
          <p className="text-xs font-mono text-slate-500">
            {row.testProtocolNumber ? `Doc: ${row.testProtocolNumber}` : 'Standard Protocol'}
          </p>
        </div>
      ),
    },
    {
      header: 'Project',
      cell: (row) => (
        <div>
          <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            {row.projectCode}
          </span>
          <p className="text-xs text-slate-600 dark:text-slate-400 truncate max-w-xs">
            {row.projectTitle}
          </p>
        </div>
      ),
    },
    {
      header: 'Iteration',
      accessorKey: 'iteration',
      cell: (row) => (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
            row.iteration > 1
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
          }`}
        >
          {row.iteration > 1 && <RefreshCw className="w-3 h-3" />}
          Iter #{row.iteration}
        </span>
      ),
    },
    {
      header: 'Test Date',
      accessorKey: 'testDate',
      cell: (row) => (
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{row.testDate}</span>
      ),
    },
    {
      header: 'Tested By',
      accessorKey: 'testedByName',
      cell: (row) => <span className="text-xs text-slate-800 dark:text-slate-200">{row.testedByName}</span>,
    },
    {
      header: 'Checklist Summary',
      cell: (row) => {
        const total = row.checklist?.length || 0;
        const pass = row.checklist?.filter((c) => c.result === 'Pass').length || 0;
        const fail = row.checklist?.filter((c) => c.result === 'Fail').length || 0;
        const pending = row.checklist?.filter((c) => c.result === 'Pending').length || 0;
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-emerald-600 font-semibold">{pass}P</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-rose-600 font-semibold">{fail}F</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-amber-600 font-semibold">{pending}Pend</span>
            <span className="text-slate-400">({total})</span>
          </div>
        );
      },
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Actions',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setSelectedTest(row)}>
            View Checkpoints
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/rd/projects/${row.rdProjectId}?tab=testing`)}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
          >
            Project <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prototype Testing & Validation Master"
        description="Dynamic inspection checklists, parameter verification (Pass/Fail/Pending), environmental telemetry, and iterative retest records."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by test name, protocol, project code, or engineer..."
      >
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'All', label: 'All Results' },
            { value: 'Passed', label: 'Passed' },
            { value: 'Failed', label: 'Failed' },
            { value: 'In Progress', label: 'In Progress' },
            { value: 'Retest Required', label: 'Retest Required' },
          ]}
        />
      </FilterBar>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={filteredTests}
          loading={loading}
          emptyMessage="No prototype test records found matching current filters."
        />
      </div>

      {/* Checklist Inspection Modal */}
      {selectedTest && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedTest(null)}
          title={`Test Results: ${selectedTest.testName} (Iteration ${selectedTest.iteration})`}
          size="xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs">
              <div>
                <p className="text-slate-500">Project</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedTest.projectTitle}</p>
              </div>
              <div>
                <p className="text-slate-500">Evaluator</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{selectedTest.testedByName}</p>
              </div>
              <div>
                <p className="text-slate-500">Test Date</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{selectedTest.testDate}</p>
              </div>
              <div>
                <p className="text-slate-500">Overall Result</p>
                <StatusBadge status={selectedTest.status} />
              </div>
            </div>

            {selectedTest.retestReason && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 rounded-lg text-xs border border-amber-200 dark:border-amber-800/60">
                <span className="font-semibold">Retest Justification: </span>
                {selectedTest.retestReason}
              </div>
            )}

            {selectedTest.environmentalConditions && (
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Environmental Conditions: </span>
                {selectedTest.environmentalConditions}
              </div>
            )}

            <div className="overflow-x-auto max-h-96 border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Parameter / Inspection Check</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Expected Condition</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Measured Value</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-600 dark:text-slate-300">Result</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {selectedTest.checklist.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        No checklist items recorded.
                      </td>
                    </tr>
                  ) : (
                    selectedTest.checklist.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{item.parameterOrCheck}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{item.expectedCondition}</td>
                        <td className="px-3 py-2 font-mono text-indigo-600 dark:text-indigo-400">{item.measuredValue || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${
                              item.result === 'Pass'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : item.result === 'Fail'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {item.result}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{item.remarks || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {selectedTest.testNotes && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap border border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Engineering Notes: </span>
                {selectedTest.testNotes}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" onClick={() => setSelectedTest(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  const id = selectedTest.rdProjectId;
                  setSelectedTest(null);
                  navigate(`/rd/projects/${id}?tab=testing`);
                }}
              >
                Go to Testing Workspace
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
