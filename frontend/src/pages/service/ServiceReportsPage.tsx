import React, { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, Clock, Download, ShieldCheck, Wrench } from 'lucide-react';
import { Button, PageHeader, StatCard } from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { ServiceJob, ServiceRequest } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

export const ServiceReportsPage: React.FC = () => {
  const { toast } = useERP();
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
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReports = async () => {
      try {
        setLoading(true);
        const [dash, jobList, reqList] = await Promise.all([
          erpApi.getServiceDashboard(),
          erpApi.getServiceJobs(),
          erpApi.getServiceRequests(),
        ]);
        setStats(dash);
        setJobs(jobList);
        setRequests(reqList);
      } catch (e: any) {
        toast('error', 'Failed to load service reports', e.message);
      } finally {
        setLoading(false);
      }
    };
    loadReports();
  }, []);

  const totalHoursLogged = jobs.reduce((acc, curr) => acc + (curr.totalHoursSpent || 0), 0);
  const avgSatisfaction = jobs.filter((j) => j.customerFeedbackScore).length > 0
    ? (
        jobs.reduce((acc, curr) => acc + (curr.customerFeedbackScore || 0), 0) /
        jobs.filter((j) => j.customerFeedbackScore).length
      ).toFixed(1)
    : '5.0';

  const warrantyTickets = requests.filter((r) => r.isUnderWarranty).length;
  const chargeableTickets = requests.filter((r) => !r.isUnderWarranty).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Operations Reports & Analytics"
        description="Warranty claim volumes, field technician utilization hours, customer CSAT ratings, and service revenue."
        breadcrumbs={[{ label: 'Service', path: '/service' }, { label: 'Reports' }]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Deployed Machinery"
          value={stats.totalEquipment}
          subtext={`${stats.warrantyRate}% under active warranty`}
          icon={ShieldCheck}
        />
        <StatCard
          label="Total Engineering Hours"
          value={`${totalHoursLogged} hrs`}
          subtext="Logged on diagnostic & repairs"
          icon={Clock}
        />
        <StatCard
          label="Customer Satisfaction"
          value={`${avgSatisfaction} / 5.0`}
          subtext="Based on client sign-offs"
          icon={CheckCircle2}
        />
        <StatCard
          label="Billed Service Revenue"
          value={formatCurrency(stats.totalRevenueBilled)}
          subtext="Chargeable parts & labor fees"
          icon={BarChart3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Warranty vs Chargeable Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
            Warranty Claim vs Chargeable Service Volume
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between font-medium mb-1">
                <span className="text-emerald-700 dark:text-emerald-400">
                  Warranty Service Tickets ({warrantyTickets})
                </span>
                <span>
                  {requests.length > 0 ? Math.round((warrantyTickets / requests.length) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{
                    width: `${requests.length > 0 ? (warrantyTickets / requests.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-medium mb-1">
                <span className="text-amber-700 dark:text-amber-400">
                  Chargeable / Out-of-Warranty Tickets ({chargeableTickets})
                </span>
                <span>
                  {requests.length > 0 ? Math.round((chargeableTickets / requests.length) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-600 rounded-full"
                  style={{
                    width: `${requests.length > 0 ? (chargeableTickets / requests.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Technician Workload Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
            Field Technician Job Allocation
          </h3>
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                <span className="font-medium text-slate-800 dark:text-slate-200 font-mono">{j.docNo}</span>
                <span className="text-slate-600 dark:text-slate-400">{j.assignedTechnicianName}</span>
                <span className="text-slate-500">{j.scheduledDate}</span>
                <span className="font-semibold text-emerald-600">{j.totalHoursSpent || 0} hrs</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
