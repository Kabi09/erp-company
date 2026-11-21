import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  Layers,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button, Card, DataTable, ErrorBanner, PageHeader, StatusBadge, type ColumnDef } from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import { formatCurrency } from '../../utils/erpLogic';

export const RDReportsPage: React.FC = () => {
  const { toast } = useERP();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadReports = async () => {
    try {
      setLoading(true);
      const res = await erpApi.getRDReports();
      setData(res);
    } catch (e: any) {
      toast('error', 'Failed to load R&D reports', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const projectColumns: ColumnDef<any>[] = [
    {
      header: 'Code',
      accessorKey: 'code',
      cell: (row) => <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{row.code}</span>,
    },
    {
      header: 'Project Title',
      accessorKey: 'title',
      cell: (row) => <span className="font-medium text-slate-900 dark:text-slate-100">{row.title}</span>,
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Current Stage',
      accessorKey: 'stage',
      cell: (row) => <span className="text-xs text-slate-700 dark:text-slate-300">{row.stage}</span>,
    },
    {
      header: 'Budget Est.',
      cell: (row) => <span className="text-xs">{formatCurrency(row.budgetEstimated)}</span>,
    },
    {
      header: 'Utilized',
      cell: (row) => (
        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
          {formatCurrency(row.budgetUtilized)}
        </span>
      ),
    },
    {
      header: 'Burn Rate',
      cell: (row) => (
        <div className="w-28 space-y-1">
          <div className="flex justify-between text-xs font-semibold">
            <span className={row.burnRate > 90 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}>
              {row.burnRate}%
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                row.burnRate > 90 ? 'bg-rose-500' : row.burnRate > 70 ? 'bg-amber-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.min(100, row.burnRate)}%` }}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="R&D Performance & Analytics"
        description="Engineering innovation metrics, prototype expenditure vs budgets, test pass-rates, and stage velocity."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              const jsonStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
              const downloadAnchor = document.createElement('a');
              downloadAnchor.setAttribute('href', jsonStr);
              downloadAnchor.setAttribute('download', `RD_Analytics_Report_${new Date().toISOString().split('T')[0]}.json`);
              document.body.appendChild(downloadAnchor);
              downloadAnchor.click();
              downloadAnchor.remove();
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Analytics
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>R&D Projects</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {data?.summary?.totalProjects || 0}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="text-indigo-600 font-semibold">{data?.summary?.activeProjects || 0} Active</span>
            <span>•</span>
            <span className="text-emerald-600 font-semibold">{data?.summary?.completedProjects || 0} Done</span>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Budget Utilization</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {formatCurrency(data?.summary?.totalUtilizedBudget || 0)}
          </p>
          <p className="text-xs text-slate-500">
            of {formatCurrency(data?.summary?.totalEstimatedBudget || 0)} ({data?.summary?.budgetBurnRate || 0}%)
          </p>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Test Pass Rate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {data?.summary?.passRate || 0}%
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="text-emerald-600 font-semibold">{data?.summary?.passedTests || 0} Passed</span>
            <span>•</span>
            <span className="text-rose-600 font-semibold">{data?.summary?.failedTests || 0} Failed</span>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Engineering Hours</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {data?.summary?.totalEngineeringHours || 0} hrs
          </p>
          <p className="text-xs text-slate-500">
            {data?.summary?.retestIterations || 0} Retest Iterations Executed
          </p>
        </Card>
      </div>

      {/* Stage Breakdown & Testing Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            Active Projects Stage Breakdown
          </h2>
          <div className="space-y-3">
            {data?.stageBreakdown &&
              Object.entries(data.stageBreakdown).map(([stage, count]: [string, any]) => (
                <div key={stage} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{stage}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{count} project(s)</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((count / (data?.summary?.totalProjects || 1)) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Testing & Verification Distribution
          </h2>
          <div className="grid grid-cols-3 gap-3 text-center py-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Passed</p>
              <p className="text-xl font-bold text-emerald-800 dark:text-emerald-200 mt-1">
                {data?.summary?.passedTests || 0}
              </p>
            </div>
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-100 dark:border-rose-900/50">
              <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">Failed</p>
              <p className="text-xl font-bold text-rose-800 dark:text-rose-200 mt-1">
                {data?.summary?.failedTests || 0}
              </p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-100 dark:border-amber-900/50">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">In Progress</p>
              <p className="text-xl font-bold text-amber-800 dark:text-amber-200 mt-1">
                {data?.summary?.inProgressTests || 0}
              </p>
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Prototype BOM Component Investment: </span>
              {formatCurrency(data?.summary?.totalBOMCost || 0)}
            </p>
            <p>
              <span className="font-semibold text-slate-800 dark:text-slate-200">Retesting Multiplier: </span>
              {data?.summary?.retestIterations || 0} iterative retest cycles logged to achieve target tolerance baselines.
            </p>
          </div>
        </Card>
      </div>

      {/* Projects Financial & Stage Portfolio Table */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          R&D Project Portfolio & Financial Burn
        </h2>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <DataTable
            columns={projectColumns}
            data={data?.projectList || []}
            loading={loading}
            emptyMessage="No project records available."
          />
        </div>
      </Card>
    </div>
  );
};
