import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Eye, PackageCheck, ShoppingCart } from 'lucide-react';
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
import type { MaterialIssue, MaterialRequest } from '../../types/erp';

export const MaterialRequestsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [issuingMR, setIssuingMR] = useState<MaterialRequest | null>(null);
  const [issueQtys, setIssueQtys] = useState<Record<string, number>>({});
  const [issueRemarks, setIssueRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Shortage breakdown drawer/modal state
  const [shortageDetail, setShortageDetail] = useState<any>(null);
  const [loadingShortage, setLoadingShortage] = useState(false);

  if (!data) return null;

  const openShortageModal = async (mr: MaterialRequest) => {
    setLoadingShortage(true);
    try {
      const res = await erpApi.getMaterialRequestShortage(mr.id);
      setShortageDetail(res);
    } catch (error: any) {
      toast('error', 'Failed to calculate live shortage', error.message);
    } finally {
      setLoadingShortage(false);
    }
  };

  const openIssueModal = (mr: MaterialRequest) => {
    const initial: Record<string, number> = {};
    for (const item of mr.items) {
      const pending = Math.max(0, item.requiredQty - item.issuedQty);
      const avail = data.stockMap[item.materialId] || 0;
      initial[item.materialId] = Math.min(pending, avail);
    }
    setIssueQtys(initial);
    setIssueRemarks('');
    setErr(null);
    setIssuingMR(mr);
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuingMR) return;
    setErr(null);
    setSubmitting(true);
    try {
      const items = Object.entries(issueQtys)
        .filter(([, qty]) => qty > 0)
        .map(([materialId, issuingQty]) => ({ materialId, issuingQty }));
      const mi: any = await erpApi.createMaterialIssue({
        materialRequestId: issuingMR.id,
        version: (issuingMR as MaterialRequest & {__v:number}).__v,
        items,
        remarks: issueRemarks,
      });
      await refresh();
      toast('success', `Material Issue ${mi.issue.docNo} posted`, `Stock ledger updated.`);
      setIssuingMR(null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to post material issue');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    return data.materialRequests.filter((mr) => {
      if (statusFilter !== 'All' && mr.status !== statusFilter) return false;
      const q = search.trim().toLowerCase();
      return (
        !q ||
        mr.docNo.toLowerCase().includes(q) ||
        (mr.sourceDocNo || mr.productionOrderDocNo || '').toLowerCase().includes(q) ||
        mr.productName.toLowerCase().includes(q)
      );
    });
  }, [data.materialRequests, statusFilter, search]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Material Requests (BOM)"
        subtitle="Requests from Production, Service and R&D. Check live store stock, issue available materials partially or fully, or purchase shortages."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search MR number, production order, or product..."
        statuses={['All', 'Pending', 'Partially Issued', 'Fully Issued']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center text-sm text-slate-500">
          No material requests match the current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((mr) => {
            const hasShortage = mr.items.some((it) => {
              const pending = Math.max(0, it.requiredQty - it.issuedQty);
              const avail = data.stockMap[it.materialId] || 0;
              return pending > avail;
            });
            const canIssueAny = mr.items.some((it) => {
              const pending = Math.max(0, it.requiredQty - it.issuedQty);
              const avail = data.stockMap[it.materialId] || 0;
              return pending > 0 && avail > 0;
            });

            return (
              <div
                key={mr.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
              >
                <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">{mr.docNo}</span>
                      <span className="text-xs text-slate-500">
                        · {mr.sourceDocNo || mr.productionOrderDocNo} · {mr.salesOrderDocNo}
                      </span>
                      <StatusBadge status={mr.status} />
                      <StatusBadge status={mr.priority} />
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      {mr.productName} · Requested by {mr.requestedBy} on {mr.requestDate} · Receipt: {mr.receiptStatus}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openShortageModal(mr)}>
                      <Eye className="w-3.5 h-3.5" />
                      Shortage Breakdown
                    </Button>
                    {mr.status !== 'Fully Issued' && canIssueAny && can('supply_chain', 'create') && (!mr.sourceType || can('material_issues','create')) && (
                      <Button size="sm" onClick={() => openIssueModal(mr)}>
                        <PackageCheck className="w-4 h-4" />
                        Issue Available
                      </Button>
                    )}
                    {mr.status !== 'Fully Issued' && hasShortage && can('supply_chain', 'create') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/supply-chain/purchase-orders?create=1&mrId=${mr.id}`)}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Purchase Shortage
                      </Button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="px-4 py-2">Material</th>
                        <th className="px-4 py-2 text-right">Required</th>
                        <th className="px-4 py-2 text-right">Issued</th>
                        <th className="px-4 py-2 text-right">Pending</th>
                        <th className="px-4 py-2 text-right">Available Stock</th>
                        <th className="px-4 py-2 text-right">Shortage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                      {mr.items.map((item) => {
                        const pending = Math.max(0, item.requiredQty - item.issuedQty);
                        const avail = data.stockMap[item.materialId] || 0;
                        const shortage = Math.max(0, pending - avail);
                        return (
                          <tr key={item.materialId}>
                            <td className="px-4 py-2.5">
                              <span className="font-mono text-slate-500 mr-2">{item.materialCode}</span>
                              <span className="font-medium text-slate-900 dark:text-slate-100">{item.materialName}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">{item.requiredQty} {item.unit}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">{item.issuedQty}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{pending}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold">{avail}</td>
                            <td className={`px-4 py-2.5 text-right font-mono font-semibold ${shortage > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-400'}`}>
                              {shortage > 0 ? shortage : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Shortage Breakdown Modal */}
      <Modal
        open={Boolean(shortageDetail)}
        onClose={() => setShortageDetail(null)}
        title={`Shortage & Fulfillment Analysis — ${shortageDetail?.materialRequestDocNo || ''}`}
        subtitle={`${shortageDetail?.productName || ''} · Live computation accounting for stock and open Supplier POs.`}
        size="lg"
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-xs text-slate-500 font-mono">Status: {shortageDetail?.status}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShortageDetail(null)}>Close</Button>
              {can('supply_chain', 'create') && (
                <Button
                  onClick={() => {
                    const mrId = shortageDetail.materialRequestId;
                    setShortageDetail(null);
                    navigate(`/supply-chain/purchase-orders?create=1&mrId=${mrId}`);
                  }}
                >
                  <ShoppingCart className="w-4 h-4" />
                  Create Shortage PO
                </Button>
              )}
            </div>
          </div>
        }
      >
        {shortageDetail && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Required</th>
                  <th className="px-3 py-2 text-right">Issued</th>
                  <th className="px-3 py-2 text-right">Pending</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Open POs</th>
                  <th className="px-3 py-2 text-right font-semibold">Shortage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {shortageDetail.items.map((it: any) => (
                  <tr key={it.materialId}>
                    <td className="px-3 py-2.5 font-medium">
                      <span className="font-mono text-slate-500 mr-1.5">{it.materialCode}</span>
                      {it.materialName}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{it.requiredQty} {it.unit}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{it.issuedQty}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{it.pendingQty}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{it.currentStock}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-600">{it.openPoQty || '—'}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-bold ${it.shortageQty > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {it.shortageQty > 0 ? it.shortageQty : '0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Issue Materials Modal */}
      <Modal
        open={Boolean(issuingMR)}
        onClose={() => setIssuingMR(null)}
        title={`Issue Materials — ${issuingMR?.docNo || ''}`}
        subtitle={`${issuingMR?.sourceDocNo || issuingMR?.productionOrderDocNo || ''} · Stock is deducted atomically; issuing cannot exceed available stock or pending quantity.`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIssuingMR(null)}>Cancel</Button>
            <Button type="submit" form="mi-form" loading={submitting}>Confirm Material Issue</Button>
          </>
        }
      >
        {issuingMR && (
          <form id="mi-form" onSubmit={handleIssueSubmit} className="space-y-4">
            {err && <ErrorBanner message={err} />}
            <div className="space-y-2.5">
              {issuingMR.items.map((item) => {
                const pending = Math.max(0, item.requiredQty - item.issuedQty);
                const avail = data.stockMap[item.materialId] || 0;
                const maxIssuable = Math.min(pending, avail);
                return (
                  <div
                    key={item.materialId}
                    className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.materialName}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        Pending: {pending} {item.unit} · Available: {avail} {item.unit}
                      </div>
                    </div>
                    <div className="w-32 shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={maxIssuable}
                        step={['nos', 'sets', 'rolls', 'pcs', 'pieces', 'boxes'].includes(item.unit.toLowerCase()) ? '1' : '0.01'}
                        disabled={maxIssuable <= 0}
                        value={issueQtys[item.materialId] ?? 0}
                        onChange={(e) =>
                          setIssueQtys((prev) => ({
                            ...prev,
                            [item.materialId]: Number(e.target.value),
                          }))
                        }
                        aria-label={`Issue quantity for ${item.materialName}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <Field label="Issue Remarks">
              <Input value={issueRemarks} onChange={(e) => setIssueRemarks(e.target.value)} placeholder="Store handover note..." />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
};

export const MaterialIssuesPage: React.FC = () => {
  const { data } = useERP();
  const [search, setSearch] = useState('');
  if (!data) return null;

  const filtered = data.materialIssues.filter((mi) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      mi.docNo.toLowerCase().includes(q) ||
      mi.materialRequestDocNo.toLowerCase().includes(q) ||
      (mi.sourceDocNo || mi.productionOrderDocNo || '').toLowerCase().includes(q)
    );
  });

  const exportCSV = () => {
    const headers = ['Issue DocNo', 'Material Request', 'Production Order', 'Issue Date', 'Issued By', 'Items', 'Receipt Acknowledged'];
    const rows = filtered.map((mi) => [
      mi.docNo,
      mi.materialRequestDocNo,
      mi.sourceDocNo || mi.productionOrderDocNo,
      mi.issueDate,
      `"${mi.issuedBy}"`,
      `"${mi.items.map((i) => `${i.materialName}: ${i.issuedQty} ${i.unit}`).join('; ')}"`,
      mi.receiptAcknowledged ? 'Acknowledged' : 'Pending',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Material_Issues_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns: ColumnDef<MaterialIssue>[] = [
    { key: 'docNo', header: 'Issue ID', render: (r) => <span className="font-mono font-semibold text-xs">{r.docNo}</span> },
    {
      key: 'ref',
      header: 'MR / Production Order',
      render: (r) => (
        <div className="font-mono text-xs">
          {r.materialRequestDocNo} · {r.sourceDocNo || r.productionOrderDocNo}
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Issued Materials',
      render: (r) => (
        <div className="text-xs space-y-0.5">
          {r.items.map((i) => (
            <div key={i.materialId}>
              {i.materialName}: <span className="font-mono font-semibold">{i.issuedQty} {i.unit}</span>
            </div>
          ))}
        </div>
      ),
    },
    { key: 'date', header: 'Date / Issued By', render: (r) => <span className="text-xs">{r.issueDate} · {r.issuedBy}</span> },
    {
      key: 'ack',
      header: 'Production Receipt',
      render: (r) => <StatusBadge status={r.receiptAcknowledged ? 'Fully Received' : 'Pending'} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Material Issues"
        subtitle="History of all partial and full material issues posted from store to Production."
        actions={
          <Button variant="secondary" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        }
      />
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search MI number, MR, or production order..." />
      <DataTable
        rows={filtered}
        columns={columns}
        renderMobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-xs">{r.docNo} · {r.sourceDocNo || r.productionOrderDocNo}</span>
              <StatusBadge status={r.receiptAcknowledged ? 'Fully Received' : 'Pending'} />
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {r.items.map((i) => `${i.materialName} (${i.issuedQty} ${i.unit})`).join(', ')}
            </div>
            <div className="text-xs text-slate-500">{r.issueDate} · {r.issuedBy}</div>
          </div>
        )}
      />
    </div>
  );
};
