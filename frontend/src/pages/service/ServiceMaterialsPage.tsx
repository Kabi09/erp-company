import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ClipboardList, PackageCheck, Wrench } from 'lucide-react';
import {
  Button,
  DataTable,
  ErrorBanner,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  StatusBadge,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { ServiceMaterialRequest } from '../../types/erp';

export const ServiceMaterialsPage: React.FC = () => {
  const { toast } = useERP();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<ServiceMaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedSmr, setSelectedSmr] = useState<ServiceMaterialRequest | null>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileUsage, setReconcileUsage] = useState<Array<{ quantityUsed: number; quantityReturned: number }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const res = await erpApi.getServiceMaterialRequests();
      setRequests(res);
    } catch (e: any) {
      toast('error', 'Failed to load spare parts requests', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      const matchSearch =
        !q ||
        r.docNo.toLowerCase().includes(q) ||
        r.serviceJobDocNo.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.items.some((i) => i.materialName.toLowerCase().includes(q));

      const matchStatus = statusFilter === 'All' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [requests, search, statusFilter]);

  const handleAcknowledge = async (id: string) => {
    try {
      await erpApi.receiveServiceMaterials(id);
      toast('success', 'Physical Receipt Confirmed', 'Spare parts acknowledged into field kit.');
      await loadRequests();
    } catch (e: any) {
      toast('error', 'Acknowledgement failed', e.message);
    }
  };

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSmr) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.reconcileServiceMaterials(selectedSmr.id, {
        itemsUsage: reconcileUsage,
      });
      toast('success', 'Parts Reconciled', 'Consumed vs returned parts recorded.');
      setReconcileOpen(false);
      setSelectedSmr(null);
      await loadRequests();
    } catch (e: any) {
      setErr(e.message || 'Reconciliation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<ServiceMaterialRequest>[] = [
    {
      key: 'docNo',
      header: 'Indent #',
      sortable: true,
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-xs">
            {r.docNo}
          </span>
          <div className="text-[11px] text-slate-500 font-sans mt-0.5">Date: {r.requestDate}</div>
        </div>
      ),
    },
    {
      key: 'serviceJobDocNo',
      header: 'Linked Job / Customer',
      sortable: true,
      render: (r) => (
        <div>
          <button
            type="button"
            onClick={() => navigate(`/service/jobs/${r.serviceJobId}`)}
            className="font-medium text-teal-700 dark:text-teal-400 hover:underline font-mono text-xs cursor-pointer text-left"
          >
            {r.serviceJobDocNo}
          </button>
          <div className="text-xs text-slate-600 dark:text-slate-400 font-sans">{r.customerName}</div>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Indented Parts List',
      render: (r) => (
        <div className="text-xs space-y-1">
          {r.items.map((it, i) => (
            <div key={i} className="text-slate-700 dark:text-slate-300">
              <span className="font-medium">{it.materialName}</span>: {it.quantityRequested} {it.unit}
              {it.quantityUsed > 0 && (
                <span className="text-emerald-600 ml-1.5 font-semibold">({it.quantityUsed} used)</span>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'requestedBy',
      header: 'Technician',
      sortable: true,
      render: (r) => <span className="text-xs text-slate-700 dark:text-slate-300">{r.requestedBy}</span>,
    },
    {
      key: 'status',
      header: 'Requisition Status',
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {r.status === 'Issued' && (
            <Button size="sm" variant="secondary" onClick={() => handleAcknowledge(r.id)} className="text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Receipt
            </Button>
          )}
          {r.status === 'Received' && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setSelectedSmr(r);
                setReconcileUsage(
                  r.items.map((i) => ({ quantityUsed: i.quantityRequested, quantityReturned: 0 })),
                );
                setReconcileOpen(true);
              }}
              className="text-xs"
            >
              <PackageCheck className="w-3.5 h-3.5 mr-1" />
              Reconcile
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/service/jobs/${r.serviceJobId}`)}
            className="text-xs"
          >
            Job Sheet →
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Spare Parts Requisitions & Indents"
        description="Technician spare parts indents to Supply Chain stores, store delivery acknowledgements, and consumed/returned parts reconciliation."
        breadcrumbs={[{ label: 'Service', path: '/service' }, { label: 'Spare Parts' }]}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by indent #, job #, customer, spare part name..."
        statuses={['All', 'Pending', 'Issued', 'Received', 'Reconciled']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyTitle="No Spare Parts Indents"
        emptyDescription="When technicians indent replacement components on job sheets, requisitions will appear here."
      />

      {/* Reconcile Modal */}
      <Modal open={reconcileOpen} onClose={() => setReconcileOpen(false)} title="Reconcile Spare Parts Usage" size="lg">
        <form onSubmit={handleReconcile} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="space-y-3 text-xs">
            {selectedSmr?.items.map((it, idx) => (
              <div key={idx} className="p-3 border border-slate-200 dark:border-slate-800 rounded-md space-y-2">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                  {it.materialName} (Issued: {it.quantityIssued} {it.unit})
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Qty Consumed / Replaced">
                    <Input
                      type="number"
                      min="0"
                      max={it.quantityIssued}
                      value={reconcileUsage[idx]?.quantityUsed ?? it.quantityIssued}
                      onChange={(e) => {
                        const next = [...reconcileUsage];
                        next[idx].quantityUsed = Number(e.target.value);
                        setReconcileUsage(next);
                      }}
                    />
                  </Field>
                  <Field label="Qty Unused / Returned">
                    <Input
                      type="number"
                      min="0"
                      value={reconcileUsage[idx]?.quantityReturned ?? 0}
                      onChange={(e) => {
                        const next = [...reconcileUsage];
                        next[idx].quantityReturned = Number(e.target.value);
                        setReconcileUsage(next);
                      }}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setReconcileOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save Reconciliation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
