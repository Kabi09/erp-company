import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Layers, PackageCheck, Plus, Send, Trash2 } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import {
  Button,
  DataTable,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { formatDate, round2 } from '../../utils/erpLogic';
import type { BOM, MaterialIssue, MaterialRequest } from '../../types/erp';

interface DraftBomLine {
  materialId: string;
  qtyPerUnit: number;
  remarks: string;
}

export const BomMaterialRequestsPage: React.FC = () => {
  const { data: db, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [lines, setLines] = useState<DraftBomLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  if (!db) return null;

  const eligiblePOs = useMemo(
    () =>
      db.productionOrders.filter((po) => {
        const existingBom = db.boms.find((b) => b.productionOrderId === po.id);
        return (!existingBom || !existingBom.requestSent) && po.status !== 'Completed';
      }),
    [db.productionOrders, db.boms],
  );

  const selectedPo = db.productionOrders.find((p) => p.id === selectedPoId);

  const hasDuplicateMaterials = useMemo(
    () => new Set(lines.map((l) => l.materialId)).size !== lines.length,
    [lines],
  );

  const loadForProductionOrder = (poId: string) => {
    setSelectedPoId(poId);
    const po = db.productionOrders.find((p) => p.id === poId);
    if (!po) {
      setLines([]);
      return;
    }
    const existingBom = db.boms.find((b) => b.productionOrderId === po.id);
    if (existingBom) {
      setLines(
        existingBom.items.map((it) => ({
          materialId: it.materialId,
          qtyPerUnit: it.qtyPerUnit,
          remarks: it.remarks || '',
        })),
      );
      return;
    }
    const product = db.products.find((pr) => pr.id === po.productId);
    if (product && product.bomTemplate.length > 0) {
      setLines(
        product.bomTemplate.map((t) => ({
          materialId: t.materialId,
          qtyPerUnit: t.quantityPerUnit,
          remarks: t.remarks || '',
        })),
      );
    } else if (db.materials[0]) {
      setLines([{ materialId: db.materials[0].id, qtyPerUnit: 1, remarks: '' }]);
    } else {
      setLines([]);
    }
  };

  const openBuilder = (poId?: string) => {
    const targetId = poId || eligiblePOs[0]?.id || '';
    loadForProductionOrder(targetId);
    setModalOpen(true);
  };

  const handleSaveBom = async (sendRequest: boolean) => {
    if (!selectedPoId || lines.length === 0) return;
    setSaving(true);
    try {
      await erpApi.saveBOM({
        productionOrderId: selectedPoId,
        items: lines.map((l) => ({
          materialId: l.materialId,
          qtyPerUnit: Number(l.qtyPerUnit),
          remarks: l.remarks,
        })),
        sendRequest,
      });
      await refresh();
      setModalOpen(false);
      toast(
        'success',
        sendRequest ? 'BOM saved & Material Request sent to Supply Chain' : 'Draft BOM saved',
      );
    } catch (err) {
      toast('error', 'BOM submission failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendExisting = async (bom: BOM) => {
    setSendingId(bom.id);
    try {
      await erpApi.sendBOMRequest(bom.id);
      await refresh();
      toast(
        'success',
        `Material Request sent for ${bom.docNo}`,
        'Supply Chain has been notified to check stock and issue materials.',
      );
    } catch (err) {
      toast('error', 'Could not send request', (err as Error).message);
    } finally {
      setSendingId(null);
    }
  };

  const filteredBoms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.boms.filter((bom) => {
      const mr = db.materialRequests.find((m) => m.id === bom.materialRequestId);
      const effectiveStatus = bom.requestSent ? mr?.status || 'Pending' : 'Draft';
      if (statusFilter !== 'All' && effectiveStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        bom.docNo.toLowerCase().includes(q) ||
        bom.productionOrderDocNo.toLowerCase().includes(q) ||
        bom.productName.toLowerCase().includes(q) ||
        (bom.materialRequestDocNo || '').toLowerCase().includes(q)
      );
    });
  }, [db.boms, db.materialRequests, search, statusFilter]);

  const columns: ColumnDef<BOM>[] = [
    {
      key: 'docNo',
      header: 'BOM / Request',
      sortable: true,
      sortValue: (b) => b.docNo,
      render: (b) => (
        <div>
          <div className="font-mono font-medium text-slate-900 dark:text-slate-100">{b.docNo}</div>
          {b.materialRequestDocNo ? (
            <div className="text-xs font-mono text-purple-700 dark:text-purple-400">{b.materialRequestDocNo}</div>
          ) : (
            <div className="text-xs text-slate-500">Not requested yet</div>
          )}
        </div>
      ),
    },
    {
      key: 'po',
      header: 'Production Order',
      render: (b) => (
        <div>
          <Link
            to={`/production/orders/${b.productionOrderId}`}
            className="font-mono text-teal-700 dark:text-teal-400 hover:underline font-medium"
          >
            {b.productionOrderDocNo}
          </Link>
          <div className="text-xs text-slate-500 truncate max-w-[220px]">{b.productName}</div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Order Qty',
      align: 'right',
      render: (b) => <span className="font-mono">{b.productionQty}</span>,
    },
    {
      key: 'items',
      header: 'Material Lines',
      render: (b) => (
        <div className="space-y-0.5 text-xs">
          {b.items.slice(0, 3).map((it) => (
            <div key={it.materialId} className="text-slate-700 dark:text-slate-300">
              <span className="font-mono text-slate-500">{it.materialCode}</span> {it.materialName} —{' '}
              <span className="font-mono font-medium">
                {it.totalRequiredQty} {it.unit}
              </span>
            </div>
          ))}
          {b.items.length > 3 && <div className="text-slate-500">+{b.items.length - 3} more materials</div>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Fulfillment',
      render: (b) => {
        const mr = db.materialRequests.find((m) => m.id === b.materialRequestId);
        if (!b.requestSent) return <StatusBadge status="Draft" />;
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={mr?.status || 'Pending'} />
            {mr && <span className="text-[11px] text-slate-500">Receipt: {mr.receiptStatus}</span>}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (b) =>
        !b.requestSent && can('production', 'edit') ? (
          <div className="flex items-center justify-end gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => openBuilder(b.productionOrderId)}>
              Edit BOM
            </Button>
            <Button size="sm" loading={sendingId === b.id} onClick={() => handleSendExisting(b)}>
              <Send className="w-3.5 h-3.5" /> Send Request
            </Button>
          </div>
        ) : (
          <Link to={`/production/orders/${b.productionOrderId}`}>
            <Button variant="ghost" size="sm">
              View Order
            </Button>
          </Link>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="BOM & Material Requests"
        subtitle="Load reusable product BOM templates, calculate production material quantities, and submit requests to Supply Chain."
        actions={
          can('production', 'create') && (
            <Button onClick={() => openBuilder()} disabled={eligiblePOs.length === 0}>
              <Layers className="w-4 h-4" /> Prepare Order BOM
            </Button>
          )
        }
      />

      {eligiblePOs.length > 0 && (
        <div className="mb-4 p-3.5 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs text-purple-900 dark:text-purple-200">
            <span className="font-semibold">{eligiblePOs.length} planned production order(s)</span> awaiting BOM submission to Supply Chain:{' '}
            <span className="font-mono">{eligiblePOs.map((p) => p.docNo).join(', ')}</span>
          </div>
          {can('production', 'create') && (
            <Button size="sm" variant="secondary" onClick={() => openBuilder(eligiblePOs[0].id)}>
              Prepare {eligiblePOs[0].docNo} BOM
            </Button>
          )}
        </div>
      )}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search BOM, MR, Production Order, or product..."
        statuses={['All', 'Draft', 'Pending', 'Partially Issued', 'Fully Issued']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filteredBoms}
        columns={columns}
        emptyTitle="No BOM records found"
        emptyDescription="Create a Production Order first, then prepare its Bill of Materials."
        renderMobileCard={(b) => {
          const mr = db.materialRequests.find((m) => m.id === b.materialRequestId);
          return (
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">{b.docNo}</div>
                  <div className="text-xs text-slate-500">
                    {b.productionOrderDocNo} · Qty {b.productionQty}
                  </div>
                </div>
                <StatusBadge status={b.requestSent ? mr?.status || 'Pending' : 'Draft'} />
              </div>
              <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{b.productName}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {b.items.length} material line(s) {b.materialRequestDocNo ? `· ${b.materialRequestDocNo}` : ''}
              </div>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                {!b.requestSent && can('production', 'edit') ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => openBuilder(b.productionOrderId)}>
                      Edit
                    </Button>
                    <Button size="sm" loading={sendingId === b.id} onClick={() => handleSendExisting(b)}>
                      Send to Supply Chain
                    </Button>
                  </>
                ) : (
                  <Link to={`/production/orders/${b.productionOrderId}`}>
                    <Button variant="secondary" size="sm">
                      Open Order
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Prepare Production BOM & Material Request"
        subtitle="Product BOM templates load automatically and scale by order quantity. You may customize lines before submitting."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              loading={saving}
              disabled={!selectedPoId || lines.length === 0 || hasDuplicateMaterials}
              onClick={() => handleSaveBom(false)}
            >
              Save Draft BOM
            </Button>
            <Button
              loading={saving}
              disabled={!selectedPoId || lines.length === 0 || hasDuplicateMaterials}
              onClick={() => handleSaveBom(true)}
            >
              <Send className="w-4 h-4" /> Save & Send to Supply Chain
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {hasDuplicateMaterials && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 font-medium">
              Duplicate raw material lines detected. Each material must appear only once in the BOM.
            </div>
          )}
          <Field label="Select Production Order" required>
            <Select value={selectedPoId} onChange={(e) => loadForProductionOrder(e.target.value)}>
              <option value="">-- Select Production Order --</option>
              {eligiblePOs.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.docNo} — {po.productName} ({po.model}) × {po.quantity} [{po.salesOrderDocNo}]
                </option>
              ))}
            </Select>
          </Field>

          {selectedPo && (
            <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <div className="text-slate-500">Customer</div>
                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{selectedPo.customerName}</div>
              </div>
              <div>
                <div className="text-slate-500">Product</div>
                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{selectedPo.model}</div>
              </div>
              <div>
                <div className="text-slate-500">Order Qty</div>
                <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">{selectedPo.quantity} Units</div>
              </div>
              <div>
                <div className="text-slate-500">Planned Start</div>
                <div className="font-mono text-slate-900 dark:text-slate-100">{formatDate(selectedPo.plannedStartDate)}</div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">BOM Material Lines</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLines((prev) => [...prev, { materialId: db.materials[0]?.id || '', qtyPerUnit: 1, remarks: '' }])
                }
              >
                <Plus className="w-3.5 h-3.5" /> Add Material
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => {
                const mat = db.materials.find((m) => m.id === line.materialId);
                const totalReq = round2((Number(line.qtyPerUnit) || 0) * (selectedPo?.quantity || 1));
                const availStock = db.stockMap[line.materialId] || 0;
                const shortage = Math.max(0, round2(totalReq - availStock));
                return (
                  <div
                    key={`${idx}-${line.materialId}`}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 items-end"
                  >
                    <div className="sm:col-span-5">
                      <Field label="Raw Material">
                        <Select
                          value={line.materialId}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, materialId: e.target.value } : l)),
                            )
                          }
                        >
                          {db.materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.code} — {m.name} ({m.unit})
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Qty / Unit">
                        <Input
                          type="number"
                          min="0.01"
                          step="any"
                          value={line.qtyPerUnit}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, qtyPerUnit: Number(e.target.value) } : l)),
                            )
                          }
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs font-medium text-slate-500 mb-1">Total Required</div>
                      <div className="px-2.5 py-2 text-sm font-mono font-semibold bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                        {totalReq} {mat?.unit || ''}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs font-medium text-slate-500 mb-1">Store Stock</div>
                      <div
                        className={`px-2.5 py-2 text-xs font-mono rounded border ${
                          shortage > 0
                            ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        }`}
                      >
                        {availStock} {shortage > 0 ? `(Short ${shortage})` : 'OK'}
                      </div>
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={lines.length <= 1}
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove BOM line"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

interface AckReceiptLine {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  issuedQty: number;
  receivedQty: number;
  discrepancyNotes?: string;
}

export const MaterialReceiptsPage: React.FC = () => {
  const { data: db, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [ackTarget, setAckTarget] = useState<MaterialIssue | null>(null);
  const [ackLines, setAckLines] = useState<AckReceiptLine[]>([]);
  const [discrepancyNotes, setDiscrepancyNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [remoteIssues, setRemoteIssues] = useState<MaterialIssue[] | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      const res = await erpApi.getMaterialReceipts();
      if (Array.isArray(res)) {
        setRemoteIssues(res);
      }
    } catch {
      // fallback to db.materialIssues
    }
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  if (!db) return null;

  const openAck = (m: MaterialIssue) => {
    setAckTarget(m);
    setDiscrepancyNotes('');
    setAckLines(
      m.items.map((it) => ({
        materialId: it.materialId,
        materialCode: it.materialCode,
        materialName: it.materialName,
        unit: it.unit,
        issuedQty: it.issuedQty,
        receivedQty: it.issuedQty,
        discrepancyNotes: '',
      })),
    );
  };

  const issuesSource = remoteIssues || (db.materialIssues || []).filter(i=>!i.sourceType);

  const filteredIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issuesSource.filter((mi) => {
      const st = mi.receiptAcknowledged ? 'Acknowledged' : 'Pending Receipt';
      if (statusFilter !== 'All' && st !== statusFilter) return false;
      if (!q) return true;
      return (
        mi.docNo.toLowerCase().includes(q) ||
        mi.productionOrderDocNo.toLowerCase().includes(q) ||
        mi.materialRequestDocNo.toLowerCase().includes(q)
      );
    });
  }, [issuesSource, search, statusFilter]);

  const handleAcknowledge = async () => {
    if (!ackTarget) return;
    setSaving(true);
    try {
      await erpApi.acknowledgeMaterialReceipt(ackTarget.id, {
        items: ackLines.map((l) => ({
          materialId: l.materialId,
          receivedQty: Number(l.receivedQty) || 0,
          discrepancyNotes: l.discrepancyNotes?.trim() || undefined,
        })),
        discrepancyNotes,
      });
      await refresh();
      await fetchIssues();
      setAckTarget(null);
      setDiscrepancyNotes('');
      setAckLines([]);
      toast(
        'success',
        `Receipt confirmed for ${ackTarget.docNo}`,
        'Production Order readiness updated automatically.',
      );
    } catch (err) {
      toast('error', 'Receipt confirmation failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<MaterialIssue>[] = [
    {
      key: 'docNo',
      header: 'Issue Voucher',
      sortable: true,
      sortValue: (m) => m.docNo,
      render: (m) => (
        <div>
          <div className="font-mono font-medium text-slate-900 dark:text-slate-100">{m.docNo}</div>
          <div className="text-xs text-slate-500">{formatDate(m.issueDate)}</div>
        </div>
      ),
    },
    {
      key: 'po',
      header: 'Production Order / MR',
      render: (m) => (
        <div>
          <Link
            to={`/production/orders/${m.productionOrderId}`}
            className="font-mono text-teal-700 dark:text-teal-400 hover:underline font-medium"
          >
            {m.productionOrderDocNo}
          </Link>
          <div className="text-xs font-mono text-slate-500">{m.materialRequestDocNo}</div>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Issued Materials',
      render: (m) => (
        <div className="space-y-0.5 text-xs">
          {m.items.map((it) => (
            <div key={it.materialId}>
              <span className="font-mono text-slate-500">{it.materialCode}</span> {it.materialName}:{' '}
              <span className="font-mono font-medium">
                {it.issuedQty} {it.unit}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'issuedBy',
      header: 'Issued By',
      render: (m) => <span className="text-xs">{m.issuedBy}</span>,
    },
    {
      key: 'status',
      header: 'Receipt Status',
      render: (m) =>
        m.receiptAcknowledged ? (
          <div>
            <StatusBadge status="Fully Received" />
            <div className="text-[11px] text-slate-500 mt-0.5">By {m.acknowledgedBy}</div>
          </div>
        ) : (
          <StatusBadge status="Pending" />
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (m) =>
        !m.receiptAcknowledged && can('production', 'edit') ? (
          <Button size="sm" onClick={() => openAck(m)}>
            <PackageCheck className="w-3.5 h-3.5" /> Confirm Receipt
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
          </span>
        ),
    },
  ];

  // Also show summary of Material Requests & pending items
  const activeMRs: MaterialRequest[] = db.materialRequests.filter((mr) => !mr.sourceType && mr.receiptStatus !== 'Fully Received');

  return (
    <div>
      <PageHeader
        title="Material Receipts"
        subtitle="Verify physical receipt of materials issued by Supply Chain. Orders move to Ready to Start once all BOM materials are received."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search issue voucher, production order, or MR..."
        statuses={['All', 'Pending Receipt', 'Acknowledged']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filteredIssues}
        columns={columns}
        emptyTitle="No material issue vouchers yet"
        emptyDescription="Issued materials from Supply Chain will appear here for shop-floor acknowledgement."
        renderMobileCard={(m) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono font-semibold text-sm">{m.docNo}</div>
                <div className="text-xs text-slate-500">
                  {m.productionOrderDocNo} · {formatDate(m.issueDate)}
                </div>
              </div>
              <StatusBadge status={m.receiptAcknowledged ? 'Fully Received' : 'Pending'} />
            </div>
            <div className="text-xs space-y-0.5 text-slate-700 dark:text-slate-300">
              {m.items.map((it) => (
                <div key={it.materialId}>
                  {it.materialName}:{' '}
                  <span className="font-mono font-medium">
                    {it.issuedQty} {it.unit}
                  </span>
                </div>
              ))}
            </div>
            {!m.receiptAcknowledged && can('production', 'edit') && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <Button size="sm" onClick={() => openAck(m)}>
                  Confirm Physical Receipt
                </Button>
              </div>
            )}
          </div>
        )}
      />

      {activeMRs.length > 0 && (
        <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Material Request Fulfillment Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeMRs.map((mr) => (
              <div
                key={mr.id}
                className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {mr.docNo} · {mr.productionOrderDocNo}
                  </span>
                  <StatusBadge status={mr.status} />
                </div>
                <div className="space-y-1 text-xs">
                  {mr.items.map((it) => {
                    const pending = round2(it.requiredQty - it.receivedQty);
                    return (
                      <div key={it.materialId} className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300">
                        <span className="truncate">{it.materialName}</span>
                        <span className="font-mono shrink-0 text-[11px]">
                          Rec {it.receivedQty}/{it.requiredQty} {it.unit}
                          {pending > 0 ? ` (Pend ${pending})` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(ackTarget)}
        onClose={() => setAckTarget(null)}
        title={`Confirm Physical Receipt — ${ackTarget?.docNo || ''}`}
        subtitle={`Verify actual shop-floor counts received from Supply Chain (${ackTarget?.productionOrderDocNo || ''}).`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAckTarget(null)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={handleAcknowledge}>
              Confirm Materials Received
            </Button>
          </>
        }
      >
        {ackTarget && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Material Line Verification (Line-Level Partial Receipt Supported)
              </div>
              {ackLines.map((line) => {
                const isShort = line.receivedQty < line.issuedQty;
                return (
                  <div
                    key={line.materialId}
                    className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {line.materialCode} — {line.materialName}
                      </span>
                      <span className="font-mono text-slate-500">
                        Issued: {line.issuedQty} {line.unit}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                      <Field label={`Physical Received Qty (${line.unit})`}>
                        <Input
                          type="number"
                          min={0}
                          max={line.issuedQty}
                          step="any"
                          value={line.receivedQty}
                          onChange={(e) => {
                            const val = Math.min(line.issuedQty, Math.max(0, Number(e.target.value) || 0));
                            setAckLines((prev) =>
                              prev.map((l) => (l.materialId === line.materialId ? { ...l, receivedQty: val } : l)),
                            );
                          }}
                        />
                      </Field>
                      {isShort && (
                        <Field label="Line Discrepancy Note">
                          <Input
                            placeholder="Damaged in transit / short package count"
                            value={line.discrepancyNotes || ''}
                            onChange={(e) => {
                              const note = e.target.value;
                              setAckLines((prev) =>
                                prev.map((l) => (l.materialId === line.materialId ? { ...l, discrepancyNotes: note } : l)),
                              );
                            }}
                          />
                        </Field>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <Field label="Discrepancy / Handover Notes (optional)">
              <Textarea
                value={discrepancyNotes}
                onChange={(e) => setDiscrepancyNotes(e.target.value)}
                placeholder="Overall receiving notes, packaging conditions, or floor handover comments..."
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
};
