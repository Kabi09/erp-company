import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  PackageCheck,
  Plus,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { Button, PageHeader, StatCard, StatusBadge } from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { ServiceJob, ServiceRequest } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

export const ServiceDashboard: React.FC = () => {
  const { data, refresh, can } = useERP();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalEquipment: 0,
    underWarranty: 0,
    warrantyRate: 0,
    openRequests: 0,
    scheduledJobs: 0,
    inProgressJobs: 0,
    closedJobs: 0,
    pendingExpenses: 0,
    totalRevenueBilled: 0,
  });
  const [scheduledJobs, setScheduledJobs] = useState<ServiceJob[]>([]);
  const [urgentRequests, setUrgentRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const [dashStats, jobs, reqs] = await Promise.all([
          erpApi.getServiceDashboard(),
          erpApi.getServiceJobs({ status: 'Scheduled' }),
          erpApi.getServiceRequests({ status: 'Open' }),
        ]);
        setStats(dashStats);
        setScheduledJobs(jobs.slice(0, 5));
        setUrgentRequests(reqs.filter((r) => r.priority === 'High' || r.priority === 'Urgent').slice(0, 5));
      } catch (err) {
        console.warn('Service dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Management Dashboard"
        description="Field engineering operations, warranty tracking, technician scheduling, and spare parts fulfillment."
        breadcrumbs={[{ label: 'Service' }, { label: 'Dashboard' }]}
        actions={
          <div className="flex items-center gap-2">
            {can('service', 'create') && (
              <Button onClick={() => navigate('/service/requests?create=1')}>
                <Plus className="w-4 h-4 mr-1.5" />
                New Service Request
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/service/delivered-products')}>
              <PackageCheck className="w-4 h-4 mr-1.5" />
              Delivered Machinery
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Equipment Deployed"
          value={stats.totalEquipment}
          subtext={`${stats.underWarranty} under warranty (${stats.warrantyRate}%)`}
          icon={PackageCheck}
        />
        <StatCard
          label="Open Service Requests"
          value={stats.openRequests}
          subtext="Tickets awaiting dispatch / triage"
          icon={AlertTriangle}
        />
        <StatCard
          label="Active Repairs in Field"
          value={stats.inProgressJobs}
          subtext={`${stats.scheduledJobs} visits scheduled today`}
          icon={Wrench}
        />
        <StatCard
          label="Completed Repairs"
          value={stats.closedJobs}
          subtext={`${formatCurrency(stats.totalRevenueBilled)} billed`}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scheduled Field Engineering Visits */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-sm">
              <CalendarClock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Upcoming Scheduled Visits
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/service/schedule')}
              className="text-xs"
            >
              View Schedule →
            </Button>
          </div>

          {!scheduledJobs.length ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              No field visits currently pending schedule.
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledJobs.map((j) => (
                <div
                  key={j.id}
                  onClick={() => navigate(`/service/jobs/${j.id}`)}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 cursor-pointer transition-colors text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                      {j.docNo}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {j.scheduledDate}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 font-medium">{j.customerName}</div>
                  <div className="text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>
                      {j.productName} (S/N: {j.serialNumber})
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      Tech: {j.assignedTechnicianName}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority Service Requests Awaiting Action */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Priority Service Requests
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/service/requests')}
              className="text-xs"
            >
              All Requests →
            </Button>
          </div>

          {!urgentRequests.length ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              No high-priority or urgent service tickets open.
            </div>
          ) : (
            <div className="space-y-3">
              {urgentRequests.map((r) => (
                <div
                  key={r.id}
                  onClick={() => navigate('/service/requests')}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 dark:hover:border-amber-500/50 cursor-pointer transition-colors text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                      {r.docNo}
                    </span>
                    <StatusBadge status={r.priority} />
                  </div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">{r.customerName}</div>
                  <p className="text-slate-600 dark:text-slate-400 line-clamp-1">{r.issueDescription}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span>
                      {r.productName} ({r.serialNumber})
                    </span>
                    <span className="font-medium text-teal-600 dark:text-teal-400">
                      {r.isUnderWarranty ? 'Warranty Claim' : 'Chargeable'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Launchpad */}
      <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Service Management Quick Access
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={() => navigate('/service/requests')}>
            Service Requests
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/service/jobs')}>
            Service Jobs & Check-In
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/service/schedule')}>
            Technician Calendar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/service/materials')}>
            Spare Parts Requisitions
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/service/expenses')}>
            Technician Expenses & Advances
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/service/reports')}>
            Service Reports & SLAs
          </Button>
        </div>
      </div>
    </div>
  );
};
