import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  FileText,
  Layers,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { Button, PageHeader, StatCard, StatusBadge } from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { RDProject } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

export const RDDashboard: React.FC = () => {
  const { can } = useERP();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    prototypingCount: 0,
    testingCount: 0,
    completedProjects: 0,
    totalBudget: 0,
    totalUtilized: 0,
    budgetBurnRate: 0,
  });
  const [projects, setProjects] = useState<RDProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const [dash, projList] = await Promise.all([
          erpApi.getRDDashboard(),
          erpApi.getRDProjects(),
        ]);
        setStats(dash);
        setProjects(projList);
      } catch (err) {
        console.warn('R&D Dashboard error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Research & Development (R&D) Dashboard"
        description="Innovation pipeline, prototype manufacturing logs, dynamic testing iterations, and experimental budget tracking."
        breadcrumbs={[{ label: 'R&D' }, { label: 'Dashboard' }]}
        actions={
          <div className="flex items-center gap-2">
            {can('rd', 'create') && (
              <Button onClick={() => navigate('/rd/projects?create=1')}>
                <Plus className="w-4 h-4 mr-1.5" />
                New R&D Project
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/rd/testing')}>
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              Testing &amp; Validation
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total R&D Projects"
          value={stats.totalProjects}
          subtext={`${stats.activeProjects} active engineering initiatives`}
          icon={Layers}
        />
        <StatCard
          label="Prototypes Fabricating"
          value={stats.prototypingCount}
          subtext={`${stats.testingCount} undergoing testing`}
          icon={Cpu}
        />
        <StatCard
          label="Completed Innovations"
          value={stats.completedProjects}
          subtext="Validated prototypes archive"
          icon={CheckCircle2}
        />
        <StatCard
          label="R&D Budget Utilized"
          value={formatCurrency(stats.totalUtilized)}
          subtext={`of ${formatCurrency(stats.totalBudget)} allocated (${stats.budgetBurnRate}%)`}
          icon={DollarSign}
        />
      </div>

      {/* Active Prototype Pipeline */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-sm">
            <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Active Experimental &amp; Prototype Projects
          </h3>
          <Button size="sm" variant="ghost" onClick={() => navigate('/rd/projects')} className="text-xs">
            View All Projects →
          </Button>
        </div>

        {!projects.length ? (
          <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
            No R&D prototype projects currently active.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.slice(0, 6).map((p) => {
              const burnRate = p.budgetEstimated > 0 ? Math.round((p.budgetUtilized / p.budgetEstimated) * 100) : 0;
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/rd/projects/${p.id}`)}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 cursor-pointer transition-colors text-xs space-y-2 bg-white dark:bg-slate-900 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {p.projectCode}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>

                  <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">{p.title}</div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] line-clamp-1">
                    Stage: <span className="font-medium text-slate-700 dark:text-slate-300">{p.currentStage}</span>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                      <span>Budget: {formatCurrency(p.budgetUtilized)}</span>
                      <span>{burnRate}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${Math.min(100, burnRate)}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Lead: {p.leadEngineerName}</span>
                    <span>Due: {p.targetCompletionDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Launchpad */}
      <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          R&D Operations Quick Links
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={() => navigate('/rd/projects')}>
            R&D Projects
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/rd/specifications')}>
            Product Specifications
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/rd/bom')}>
            Prototype BOM &amp; Stores Requisition
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/rd/daily-updates')}>
            Daily Fabrication Logs
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/rd/testing')}>
            Prototype Testing &amp; Validation
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/rd/completed')}>
            Completed R&D Archive
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/rd/reports')}>
            R&D Reports
          </Button>
        </div>
      </div>
    </div>
  );
};
