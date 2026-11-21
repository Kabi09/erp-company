import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CalendarClock, Clock, MapPin, UserCheck, Wrench } from 'lucide-react';
import { Button, PageHeader, StatusBadge } from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { ServiceJob } from '../../types/erp';

export const TechnicianSchedulePage: React.FC = () => {
  const { user, toast } = useERP();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTechId, setSelectedTechId] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const res = await erpApi.getServiceJobs();
      setJobs(res);
    } catch (e: any) {
      toast('error', 'Failed to load technician schedule', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, []);

  const technicians = useMemo(() => {
    const map = new Map<string, string>();
    jobs.forEach((j) => {
      map.set(j.assignedTechnicianId, j.assignedTechnicianName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const matchTech = selectedTechId === 'all' || j.assignedTechnicianId === selectedTechId;
      const matchDate = !dateFilter || j.scheduledDate === dateFilter;
      return matchTech && matchDate;
    });
  }, [jobs, selectedTechId, dateFilter]);

  // Group by scheduled date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, ServiceJob[]> = {};
    filteredJobs.forEach((j) => {
      const d = j.scheduledDate || 'Unscheduled';
      if (!groups[d]) groups[d] = [];
      groups[d].push(j);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredJobs]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Technician Site Visit Schedule"
        description="Daily dispatch calendar, field engineer route allocations, and live site visit schedules."
        breadcrumbs={[{ label: 'Service', path: '/service' }, { label: 'Technician Schedule' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={selectedTechId === user?.id ? 'primary' : 'secondary'}
              onClick={() => setSelectedTechId(selectedTechId === user?.id ? 'all' : (user?.id || 'all'))}
              className="text-xs"
            >
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              {selectedTechId === user?.id ? 'Viewing My Schedule' : 'My Assigned Jobs'}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/service/jobs')} className="text-xs">
              <Wrench className="w-3.5 h-3.5 mr-1" />
              All Job Sheets
            </Button>
          </div>
        }
      />

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg text-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-slate-500 font-medium">Filter Engineer:</span>
          <select
            value={selectedTechId}
            onChange={(e) => setSelectedTechId(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
          >
            <option value="all">All Field Engineers ({technicians.length})</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-slate-500 font-medium">Specific Date:</span>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-teal-600 hover:underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading schedule...</div>
      ) : !groupedByDate.length ? (
        <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500 bg-white dark:bg-slate-900">
          No scheduled field visits match the selected technician and date criteria.
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDate.map(([dateStr, dateJobs]) => (
            <div key={dateStr} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 pb-2">
                <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{dateStr}</span>
                <span className="text-xs font-normal text-slate-500">
                  ({dateJobs.length} site visit{dateJobs.length > 1 ? 's' : ''})
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dateJobs.map((j) => (
                  <div
                    key={j.id}
                    onClick={() => navigate(`/service/jobs/${j.id}`)}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 cursor-pointer transition-colors text-xs space-y-2 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {j.docNo}
                      </span>
                      <StatusBadge status={j.status} />
                    </div>

                    <div className="font-semibold text-slate-900 dark:text-slate-100">{j.customerName}</div>
                    <div className="text-slate-600 dark:text-slate-400">
                      {j.productName} • S/N: <span className="font-mono">{j.serialNumber}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-emerald-600" />
                        {j.assignedTechnicianName}
                      </span>
                      <span>{j.serviceType}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
