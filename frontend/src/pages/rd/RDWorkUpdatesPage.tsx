import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, Calendar, Clock, Layers, User } from 'lucide-react';
import {
  Button,
  DataTable,
  ErrorBanner,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { RDWorkUpdate } from '../../types/erp';

interface EnrichedWorkUpdate extends RDWorkUpdate {
  projectCode: string;
  projectTitle: string;
}

export const RDWorkUpdatesPage: React.FC = () => {
  const { toast } = useERP();
  const navigate = useNavigate();

  const [updates, setUpdates] = useState<EnrichedWorkUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('All');
  const [selectedUpdate, setSelectedUpdate] = useState<EnrichedWorkUpdate | null>(null);

  const loadUpdates = async () => {
    try {
      setLoading(true);
      const data = await erpApi.getAllRDWorkUpdates();
      setUpdates(data);
    } catch (e: any) {
      toast('error', 'Failed to load R&D work updates', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUpdates();
  }, []);

  const stagesList = useMemo(() => {
    const set = new Set<string>();
    updates.forEach((u) => {
      u.selectedStages?.forEach((s) => set.add(s));
      if (u.customStage) set.add(u.customStage);
    });
    return Array.from(set);
  }, [updates]);

  const filteredUpdates = useMemo(() => {
    return updates.filter((u) => {
      const matchSearch =
        search === '' ||
        u.projectCode.toLowerCase().includes(search.toLowerCase()) ||
        u.projectTitle.toLowerCase().includes(search.toLowerCase()) ||
        u.engineerName.toLowerCase().includes(search.toLowerCase()) ||
        u.highlights?.some((h) => h.toLowerCase().includes(search.toLowerCase())) ||
        (u.technicalObservations && u.technicalObservations.toLowerCase().includes(search.toLowerCase()));

      const matchStage =
        stageFilter === 'All' ||
        u.selectedStages?.includes(stageFilter) ||
        u.customStage === stageFilter;

      return matchSearch && matchStage;
    });
  }, [updates, search, stageFilter]);

  const columns: ColumnDef<EnrichedWorkUpdate>[] = [
    {
      header: 'Date',
      accessorKey: 'date',
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
          {row.date}
        </span>
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
      header: 'Engineer',
      cell: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200">
          <User className="w-3.5 h-3.5 text-slate-400" />
          <span>{row.engineerName}</span>
        </div>
      ),
    },
    {
      header: 'Stages Worked On',
      cell: (row) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {row.selectedStages?.map((s, idx) => (
            <span
              key={idx}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
            >
              {s}
            </span>
          ))}
          {row.customStage && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
              Custom: {row.customStage}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Hours',
      accessorKey: 'hoursSpent',
      cell: (row) => (
        <div className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{row.hoursSpent} hrs</span>
        </div>
      ),
    },
    {
      header: 'Key Highlights',
      cell: (row) => (
        <div className="max-w-md">
          {row.highlights && row.highlights.length > 0 ? (
            <ul className="list-disc list-inside text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
              {row.highlights.slice(0, 2).map((h, i) => (
                <li key={i} className="truncate">{h}</li>
              ))}
              {row.highlights.length > 2 && (
                <li className="text-[11px] text-slate-400 list-none">+{row.highlights.length - 2} more...</li>
              )}
            </ul>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setSelectedUpdate(row)}>
            Details
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/rd/projects/${row.rdProjectId}?tab=daily-updates`)}
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
        title="Daily R&D Work Updates Master"
        description="Chronological log of engineering activities, multi-stage progress, design highlights, and lab observations across all R&D projects."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search updates by project, engineer, or highlight..."
      >
        <Select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          options={[
            { value: 'All', label: 'All Stages' },
            ...stagesList.map((st) => ({ value: st, label: st })),
          ]}
        />
      </FilterBar>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={filteredUpdates}
          loading={loading}
          emptyMessage="No daily work updates found matching current filters."
        />
      </div>

      {/* Details Modal */}
      {selectedUpdate && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedUpdate(null)}
          title={`R&D Work Log: ${selectedUpdate.projectCode} (${selectedUpdate.date})`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs">
              <div>
                <p className="text-slate-500">Project</p>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{selectedUpdate.projectTitle}</p>
              </div>
              <div>
                <p className="text-slate-500">Engineer</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{selectedUpdate.engineerName}</p>
              </div>
              <div>
                <p className="text-slate-500">Date Logged</p>
                <p className="font-medium text-slate-800 dark:text-slate-200">{selectedUpdate.date}</p>
              </div>
              <div>
                <p className="text-slate-500">Hours Billed</p>
                <p className="font-semibold text-indigo-600 dark:text-indigo-400">{selectedUpdate.hoursSpent} hrs</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Manufacturing & Research Stages Involved:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedUpdate.selectedStages?.map((s, idx) => (
                  <span
                    key={idx}
                    className="inline-flex px-2 py-1 rounded text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                  >
                    {s}
                  </span>
                ))}
                {selectedUpdate.customStage && (
                  <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    Custom Stage: {selectedUpdate.customStage}
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Key Highlights:</p>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <ul className="list-disc list-inside space-y-1 text-xs text-slate-800 dark:text-slate-200">
                  {selectedUpdate.highlights?.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            </div>

            {selectedUpdate.technicalObservations && (
              <div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Technical Observations & Analysis:
                </p>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap border border-slate-100 dark:border-slate-800">
                  {selectedUpdate.technicalObservations}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" onClick={() => setSelectedUpdate(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  const id = selectedUpdate.rdProjectId;
                  setSelectedUpdate(null);
                  navigate(`/rd/projects/${id}?tab=daily-updates`);
                }}
              >
                Go to Project Updates
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
