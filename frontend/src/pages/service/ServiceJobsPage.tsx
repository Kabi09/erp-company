import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clock, Filter, UserCheck, Wrench } from 'lucide-react';
import {
  Button,
  DataTable,
  FilterBar,
  PageHeader,
  StatusBadge,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { ServiceJob } from '../../types/erp';

export const ServiceJobsPage: React.FC = () => {
  const { user, toast } = useERP();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [myJobsOnly, setMyJobsOnly] = useState(false);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const res = await erpApi.getServiceJobs();
      setJobs(res);
    } catch (e: any) {
      toast('error', 'Failed to load service jobs', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      const matchSearch =
        !q ||
        j.docNo.toLowerCase().includes(q) ||
        j.customerName.toLowerCase().includes(q) ||
        j.productName.toLowerCase().includes(q) ||
        j.serialNumber.toLowerCase().includes(q) ||
        j.assignedTechnicianName.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'All' || j.status === statusFilter;

      const matchMyJobs =
        !myJobsOnly ||
        j.assignedTechnicianId === user?.id ||
        j.assignedTechnicianId === user?.employeeId;

      return matchSearch && matchStatus && matchMyJobs;
    });
  }, [jobs, search, statusFilter, myJobsOnly, user]);

  const columns: ColumnDef<ServiceJob>[] = [
    {
      key: 'docNo',
      header: 'Job Sheet #',
      sortable: true,
      render: (j) => (
        <div>
          <button
            type="button"
            onClick={() => navigate(`/service/jobs/${j.id}`)}
            className="font-semibold text-teal-700 dark:text-teal-400 hover:underline font-mono text-xs cursor-pointer text-left"
          >
            {j.docNo}
          </button>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
            Ref: {j.serviceRequestDocNo}
          </div>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer & Equipment',
      sortable: true,
      render: (j) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{j.customerName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {j.productName} • <span className="font-mono">{j.serialNumber}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'assignedTechnicianName',
      header: 'Assigned Engineer',
      sortable: true,
      render: (j) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            {j.assignedTechnicianName}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{j.serviceType}</div>
        </div>
      ),
    },
    {
      key: 'scheduledDate',
      header: 'Schedule / Check-In',
      sortable: true,
      render: (j) => (
        <div>
          <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">{j.scheduledDate}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {j.checkIn ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Checked In</span>
            ) : (
              <span>Not Checked In</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'totalHoursSpent',
      header: 'Hours Logged',
      sortable: true,
      render: (j) => (
        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
          {j.totalHoursSpent ? `${j.totalHoursSpent} hrs` : '0 hrs'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Job Status',
      sortable: true,
      render: (j) => <StatusBadge status={j.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (j) => (
        <Button
          size="sm"
          variant="primary"
          onClick={() => navigate(`/service/jobs/${j.id}`)}
          className="text-xs"
        >
          <Wrench className="w-3.5 h-3.5 mr-1" />
          Open Job Sheet
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Work Orders & Job Sheets"
        description="Technician execution, live check-in/out, diagnosis reports, spare part usage, and service job sign-offs."
        breadcrumbs={[{ label: 'Service', path: '/service' }, { label: 'Service Jobs' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMyJobsOnly(!myJobsOnly)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer flex items-center gap-1.5 ${
                myJobsOnly
                  ? 'bg-emerald-600 text-white border-transparent'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              My Assigned Jobs
            </button>
            <Button onClick={() => navigate('/service/schedule')}>
              <CalendarClock className="w-4 h-4 mr-1.5" />
              View Schedule
            </Button>
          </div>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by job #, customer, technician, serial number..."
        statuses={['All', 'Scheduled', 'In Progress', 'Awaiting Spares', 'Work Completed', 'Closed']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyTitle="No Service Jobs Found"
        emptyDescription="When service tickets are assigned to technicians, job sheets will appear here."
      />
    </div>
  );
};
