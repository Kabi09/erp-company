import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Download, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button, Modal, PageHeader, StatCard, StatusBadge } from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import { formatCurrency } from '../../utils/erpLogic';

export const SupplyChainDashboard: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const navigate = useNavigate();

  const [reconOpen, setReconOpen] = useState(false);
  const [reconData, setReconData] = useState<any>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  if (!data) return null;

  const pendingMR = data.materialRequests.filter((m) => m.status === 'Pending');
  const partialMR = data.materialRequests.filter((m) => m.status === 'Partially Issued');
  const fullMR = data.materialRequests.filter((m) => m.status === 'Fully Issued');
  const lowStock = data.materials.filter((m) => (data.stockMap[m.id] || 0) < m.minStock);
  const pendingPOs = data.supplierPOs.filter((p) => p.status === 'Ordered' || p.status === 'Partially Received');
  const pendingVerif = data.grns.filter((g) => g.verificationStatus === 'Pending');
  const openReturns = data.supplierReturns.filter((r) => r.replacementStatus === 'Pending Replacement');

  const recentMoves = [...data.stockTransactions].reverse().slice(0, 7);

  const openReconciliation = async () => {
    setReconOpen(true);
    setReconLoading(true);
    try {
      const res: any = await erpApi.getStockReconciliation();
      setReconData(res);
    } catch (err: any) {
      toast('error', 'Failed to load reconciliation report', err.message);
    } finally {
      setReconLoading(false);
    }
  };

  const handleRunReconcile = async () => {
    setReconciling(true);
    try {
      const res: any = await erpApi.reconcileStock();
      await refresh();
      setReconData(res);
      toast('success', 'Stock Reconciled', `Aligned ${res.reconciledCount || 0} material(s) to transaction ledger.`);
    } catch (err: any) {
      toast('error', 'Reconciliation failed', err.message);
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supply Chain Management"
        subtitle="Manage BOM material requests, partial/full issues, supplier procurement, GRN verification, and ledger-backed inventory."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={openReconciliation}>
              <RefreshCw className="w-4 h-4" />
              Stock Audit
            </Button>
            {can('supply_chain', 'create') && (
              <>
                <Button variant="secondary" size="sm" onClick={() => navigate('/supply-chain/grn?create=1')}>
                  Record GRN
                </Button>
                <Button size="sm" onClick={() => navigate('/supply-chain/purchase-orders?create=1')}>
                  <Plus className="w-4 h-4" />
                  Supplier PO
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Pending Material Requests"
          value={pendingMR.length}
          hint={`${partialMR.length} partially issued`}
          tone={pendingMR.length + partialMR.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/supply-chain/material-requests')}
        />
        <StatCard
          label="Fully Issued Requests"
          value={fullMR.length}
          tone="success"
          onClick={() => navigate('/supply-chain/material-requests')}
        />
        <StatCard
          label="Low-Stock Materials"
          value={lowStock.length}
          hint={`Below minimum stock level`}
          tone={lowStock.length > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/supply-chain/inventory')}
        />
        <StatCard
          label="Pending Supplier POs"
          value={pendingPOs.length}
          hint="Ordered / Partially Received"
          onClick={() => navigate('/supply-chain/purchase-orders')}
        />
        <StatCard
          label="Pending GRN Verification"
          value={pendingVerif.length}
          hint="Unverified incoming goods"
          tone={pendingVerif.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/supply-chain/verification')}
        />
        <StatCard
          label="Pending Replacements"
          value={openReturns.length}
          hint="Rejected supplier returns"
          onClick={() => navigate('/supply-chain/returns')}
        />
        <StatCard
          label="Active Materials"
          value={data.materials.length}
          onClick={() => navigate('/supply-chain/materials')}
        />
        <StatCard
          label="Active Suppliers"
          value={data.suppliers.length}
          onClick={() => navigate('/supply-chain/suppliers')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Material Requests */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Active Material Requests from Production</h2>
            <button
              type="button"
              onClick={() => navigate('/supply-chain/material-requests')}
              className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Manage <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.materialRequests.filter((m) => m.status !== 'Fully Issued').slice(0, 5).map((mr) => (
              <div key={mr.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    <span className="font-mono text-xs mr-2">{mr.docNo}</span>
                    {mr.productionOrderDocNo}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{mr.productName}</div>
                </div>
                <StatusBadge status={mr.status} />
              </div>
            ))}
            {data.materialRequests.filter((m) => m.status !== 'Fully Issued').length === 0 && (
              <p className="p-6 text-xs text-slate-500 text-center">All material requests are fully issued.</p>
            )}
          </div>
        </section>

        {/* Recent Stock Movements */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent Stock Movements</h2>
            <button
              type="button"
              onClick={() => navigate('/supply-chain/stock-history')}
              className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Full Ledger <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {recentMoves.map((tx) => (
              <div key={tx.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {tx.materialName} <span className="font-mono text-slate-500">({tx.linkedDocNo})</span>
                  </div>
                  <div className="text-slate-500">{tx.type} · {tx.performedBy}</div>
                </div>
                <div className="text-right font-mono shrink-0">
                  <div className={tx.quantityDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-red-700 dark:text-red-400 font-semibold'}>
                    {tx.quantityDelta >= 0 ? `+${tx.quantityDelta}` : tx.quantityDelta} {tx.unit}
                  </div>
                  <div className="text-slate-500">Bal: {tx.balanceAfter}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Stock Reconciliation Modal */}
      <Modal
        open={reconOpen}
        onClose={() => setReconOpen(false)}
        title="Inventory Stock Reconciliation"
        subtitle="Verification between operational stock balances and the immutable transaction ledger."
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500">
              {reconData?.matched ? 'All material balances match ledger.' : `${reconData?.discrepanciesCount || 0} discrepancy(ies) detected.`}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setReconOpen(false)}>Close</Button>
              {!reconData?.matched && can('supply_chain', 'approve') && (
                <Button onClick={handleRunReconcile} loading={reconciling}>
                  Align with Ledger
                </Button>
              )}
            </div>
          </div>
        }
      >
        {reconLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Running reconciliation audit...</div>
        ) : reconData ? (
          <div className="space-y-4">
            <div className={`p-3.5 rounded-lg border flex items-center gap-3 ${reconData.matched ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'}`}>
              {reconData.matched ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
              <div className="text-xs">
                <div className="font-semibold text-sm">{reconData.matched ? 'Ledger & Stock Perfectly Synchronized' : 'Discrepancy Detected'}</div>
                <div>Audited {reconData.totalMaterials} materials against the immutable transaction ledger.</div>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {(reconData.materials || []).map((m: any) => (
                <div key={m.materialId} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-semibold mr-1.5">{m.materialCode}</span>
                    <span>{m.materialName}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-slate-500">Stock: {m.currentStock} {m.unit}</span>
                    <span className="text-slate-500">Ledger: {m.ledgerBalance} {m.unit}</span>
                    <StatusBadge status={m.status === 'MATCHED' ? 'Accepted' : 'Issue'} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export const SupplyChainReportsPage: React.FC = () => {
  const { data } = useERP();
  if (!data) return null;

  const totalPOValue = data.supplierPOs.reduce((s, p) => s + p.totalAmount, 0);
  const totalRejected = data.grns.reduce((s, g) => s + g.items.reduce((x, i) => x + i.rejectedQty, 0), 0);
  const lowStockCount = data.materials.filter((m) => (data.stockMap[m.id] || 0) < m.minStock).length;

  const exportCSV = () => {
    const headers = ['Code', 'Material', 'Category', 'Unit', 'Location', 'Available Stock', 'Min Stock', 'Health'];
    const rows = data.materials.map((m) => {
      const avail = data.stockMap[m.id] || 0;
      const isLow = avail < m.minStock;
      return [
        m.code,
        `"${m.name.replace(/"/g, '""')}"`,
        m.category,
        m.unit,
        `"${m.storageLocation}"`,
        avail,
        m.minStock,
        isLow ? 'Low Stock' : 'Healthy',
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Inventory_Status_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supply Chain Reports"
        subtitle="Procurement spend, inventory health, and incoming quality inspection summary."
        actions={
          <Button variant="secondary" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Supplier PO Value" value={formatCurrency(totalPOValue)} />
        <StatCard label="Low-Stock SKUs" value={lowStockCount} tone={lowStockCount > 0 ? 'danger' : 'success'} />
        <StatCard label="Total Material Issues" value={data.materialIssues.length} />
        <StatCard label="Incoming Rejected Units" value={totalRejected} tone={totalRejected > 0 ? 'warning' : 'default'} />
      </div>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm font-semibold">
          <span>Inventory Stock Status vs Minimum Level</span>
          <Button variant="ghost" size="sm" onClick={exportCSV}>
            <Download className="w-3.5 h-3.5" />
            Download
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Material</th>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5 text-right">Available</th>
                <th className="px-4 py-2.5 text-right">Min Stock</th>
                <th className="px-4 py-2.5">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.materials.map((m) => {
                const avail = data.stockMap[m.id] || 0;
                const isLow = avail < m.minStock;
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">{m.code}</td>
                    <td className="px-4 py-2.5 font-medium">{m.name}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{m.storageLocation}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{avail} {m.unit}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500">{m.minStock} {m.unit}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={isLow ? 'Issue' : 'Active'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
