import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { Button, PageHeader, StatCard, StatusBadge } from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { formatCurrency } from '../../utils/erpLogic';

export const SupplyChainDashboard: React.FC = () => {
  const { data, can } = useERP();
  const navigate = useNavigate();
  if (!data) return null;

  const pendingMR = data.materialRequests.filter((m) => m.status === 'Pending');
  const partialMR = data.materialRequests.filter((m) => m.status === 'Partially Issued');
  const fullMR = data.materialRequests.filter((m) => m.status === 'Fully Issued');
  const lowStock = data.materials.filter((m) => (data.stockMap[m.id] || 0) < m.minStock);
  const pendingPOs = data.supplierPOs.filter((p) => p.status === 'Ordered' || p.status === 'Partially Received');
  const pendingVerif = data.grns.filter((g) => g.verificationStatus === 'Pending');
  const openReturns = data.supplierReturns.filter((r) => r.replacementStatus === 'Pending Replacement');

  const recentMoves = [...data.stockTransactions].reverse().slice(0, 7);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supply Chain Management"
        subtitle="Manage BOM material requests, partial/full issues, supplier procurement, GRN verification, and ledger-backed inventory."
        actions={
          can('supply_chain', 'create') && (
            <>
              <Button variant="secondary" size="sm" onClick={() => navigate('/supply-chain/grn?create=1')}>
                Record GRN
              </Button>
              <Button size="sm" onClick={() => navigate('/supply-chain/purchase-orders?create=1')}>
                <Plus className="w-4 h-4" />
                Supplier PO
              </Button>
            </>
          )
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
    </div>
  );
};

export const SupplyChainReportsPage: React.FC = () => {
  const { data } = useERP();
  if (!data) return null;

  const totalPOValue = data.supplierPOs.reduce((s, p) => s + p.totalAmount, 0);
  const totalRejected = data.grns.reduce((s, g) => s + g.items.reduce((x, i) => x + i.rejectedQty, 0), 0);
  const lowStockCount = data.materials.filter((m) => (data.stockMap[m.id] || 0) < m.minStock).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Supply Chain Reports" subtitle="Procurement spend, inventory health, and incoming quality inspection summary." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Supplier PO Value" value={formatCurrency(totalPOValue)} />
        <StatCard label="Low-Stock SKUs" value={lowStockCount} tone={lowStockCount > 0 ? 'danger' : 'success'} />
        <StatCard label="Total Material Issues" value={data.materialIssues.length} />
        <StatCard label="Incoming Rejected Units" value={totalRejected} tone={totalRejected > 0 ? 'warning' : 'default'} />
      </div>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
          Inventory Stock Status vs Minimum Level
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
