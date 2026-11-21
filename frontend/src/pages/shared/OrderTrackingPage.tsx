import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import {
  Button,
  DataTable,
  FilterBar,
  PageHeader,
  StatusBadge,
  type ColumnDef,
} from '../../components/ui';
import { calculatePaymentSummary, formatCurrency, formatDate } from '../../utils/erpLogic';
import type { SalesOrder } from '../../types/erp';

interface LifecycleStep {
  key: string;
  label: string;
  department: string;
  state: 'completed' | 'active' | 'pending' | 'blocked';
  docNo?: string;
  summary: string;
  date?: string;
  link?: string;
  canLink?: boolean;
}

export const OrderTrackingPage: React.FC = () => {
  const { data: db } = useERP();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  if (!db) return null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.salesOrders.filter((so) => {
      if (statusFilter !== 'All' && so.fulfillmentStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        so.docNo.toLowerCase().includes(q) ||
        so.customerSnapshot.name.toLowerCase().includes(q) ||
        so.enquiryDocNo.toLowerCase().includes(q) ||
        so.quotationDocNo.toLowerCase().includes(q) ||
        so.customerPoNumber.toLowerCase().includes(q)
      );
    });
  }, [db.salesOrders, search, statusFilter]);

  const columns: ColumnDef<SalesOrder>[] = [
    {
      key: 'docNo',
      header: 'Sales Order',
      sortable: true,
      sortValue: (s) => s.docNo,
      render: (s) => (
        <div>
          <Link to={`/tracking/${s.id}`} className="font-mono font-semibold text-teal-700 dark:text-teal-400 hover:underline">
            {s.docNo}
          </Link>
          <div className="text-xs font-mono text-slate-500">
            {s.enquiryDocNo} → {s.quotationDocNo}
          </div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer & Items',
      render: (s) => (
        <div>
          <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{s.customerSnapshot.name}</div>
          <div className="text-xs text-slate-500">
            {s.items.map((i) => `${i.quantity}× ${i.model || i.productName}`).join(', ')}
          </div>
        </div>
      ),
    },
    {
      key: 'payment',
      header: 'Commercial / Payment',
      align: 'right',
      render: (s) => {
        const pay = calculatePaymentSummary(s.totalAmount, db.payments, { piId: s.piId, salesOrderId: s.id });
        return (
          <div className="text-right">
            <div className="font-mono text-xs font-semibold">{formatCurrency(s.totalAmount, db.company.currencySymbol)}</div>
            <div className="mt-0.5">
              <StatusBadge status={pay.paymentStatus} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'prod',
      header: 'Production',
      render: (s) => {
        const pos = db.productionOrders.filter((p) => p.salesOrderId === s.id);
        if (pos.length === 0) return <span className="text-xs text-slate-500">Not scheduled</span>;
        return (
          <div className="space-y-0.5">
            {pos.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 text-xs">
                <span className="font-mono">{p.docNo}</span>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: 'fulfillment',
      header: 'Fulfillment Stage',
      render: (s) => <StatusBadge status={s.fulfillmentStatus} />,
    },
    {
      key: 'actions',
      header: 'Timeline',
      align: 'right',
      render: (s) => (
        <Link to={`/tracking/${s.id}`}>
          <Button size="sm" variant="secondary">
            Track Order
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Centralized End-to-End Order Tracking"
        subtitle="Trace every confirmed order across Sales, Supply Chain, Production, Quality Check, and Logistics."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search SO, Enquiry, Quotation, Customer, or Customer PO..."
        statuses={[
          'All',
          'Awaiting Production',
          'In Production',
          'QC Pending',
          'Ready for Dispatch',
          'In Transit',
          'Delivered',
        ]}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        emptyTitle="No confirmed orders to track"
        emptyDescription="Confirmed Sales Orders automatically appear in centralized tracking."
        renderMobileCard={(s) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link to={`/tracking/${s.id}`} className="font-mono font-semibold text-sm text-teal-700 dark:text-teal-400">
                  {s.docNo}
                </Link>
                <div className="text-xs text-slate-500">{s.customerSnapshot.name}</div>
              </div>
              <StatusBadge status={s.fulfillmentStatus} />
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {s.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="font-mono text-xs font-medium">{formatCurrency(s.totalAmount, db.company.currencySymbol)}</span>
              <Link to={`/tracking/${s.id}`}>
                <Button size="sm" variant="secondary">
                  View Lifecycle
                </Button>
              </Link>
            </div>
          </div>
        )}
      />
    </div>
  );
};

export const OrderTrackingDetailPage: React.FC = () => {
  const { soId } = useParams<{ soId: string }>();
  const { data: db, can } = useERP();
  const [remoteData, setRemoteData] = useState<any>(null);
  const [previewSO, setPreviewSO] = useState<SalesOrder | null>(null);

  useEffect(() => {
    if (soId) {
      erpApi.getOrderTrackingDetail(soId)
        .then((res) => setRemoteData(res))
        .catch(() => {});
    }
  }, [soId]);

  if (!db) return null;

  const so = db.salesOrders.find((s) => s.id === soId);
  if (!so) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-center space-y-3">
        <p className="text-sm font-medium">Sales Order not found.</p>
        <Link to="/tracking">
          <Button variant="secondary">Back to Order Tracking</Button>
        </Link>
      </div>
    );
  }

  const enquiry = db.enquiries.find((e) => e.id === so.enquiryId);
  const quotation = db.quotations.find((q) => q.id === so.quotationId);
  const pi = db.proformaInvoices.find((p) => p.id === so.piId);
  const cpo = db.customerPOs.find((c) => c.id === so.customerPoId);
  const paySummary = calculatePaymentSummary(so.totalAmount, db.payments, { piId: so.piId, salesOrderId: so.id });

  const prodOrders = db.productionOrders.filter((p) => p.salesOrderId === so.id);
  const primaryPo = prodOrders[0];
  const boms = db.boms.filter((b) => prodOrders.some((p) => p.id === b.productionOrderId));
  const mrs = db.materialRequests.filter((m) => m.salesOrderId === so.id);
  const issues = db.materialIssues.filter((mi) => mrs.some((m) => m.id === mi.materialRequestId));
  const updates = db.dailyUpdates.filter((du) => prodOrders.some((p) => p.id === du.productionOrderId));
  const qcs = db.qualityChecks.filter((q) => prodOrders.some((p) => p.id === q.productionOrderId));
  const reworks = db.reworkOrders.filter((r) => prodOrders.some((p) => p.id === r.productionOrderId));
  const deliveries = db.deliveryOrders.filter((d) => d.salesOrderId === so.id);

  const allMaterialsIssued = mrs.length > 0 && mrs.every((m) => m.status === 'Fully Issued');
  const allMaterialsReceived = mrs.length > 0 && mrs.every((m) => m.receiptStatus === 'Fully Received');
  const anyReworkActive = prodOrders.some((p) => p.status === 'Rework');
  const allQcPassed = prodOrders.length > 0 && prodOrders.every((p) => p.status === 'Completed');
  const anyDispatched = deliveries.some((d) => ['Dispatched', 'In Transit', 'Partially Delivered', 'Delivered'].includes(d.status));
  const allDelivered = so.fulfillmentStatus === 'Delivered';

  const steps: LifecycleStep[] = [
    {
      key: 'enquiry',
      label: 'Customer Enquiry & Qualification',
      department: 'Sales',
      state: 'completed',
      docNo: so.enquiryDocNo,
      summary: enquiry ? `${enquiry.source} enquiry — Qualified` : 'Qualified enquiry linked',
      date: enquiry?.createdAt,
      link: `/sales/enquiries/${so.enquiryId}`,
      canLink: can('sales', 'view'),
    },
    {
      key: 'quotation',
      label: 'Quotation & Acceptance',
      department: 'Sales',
      state: 'completed',
      docNo: so.quotationDocNo,
      summary: quotation ? `Version V${quotation.version} accepted (${formatCurrency(quotation.totalAmount, db.company.currencySymbol)})` : 'Accepted',
      date: quotation?.acceptedAt || quotation?.quotationDate,
      link: '/sales/quotations',
      canLink: can('sales', 'view'),
    },
    {
      key: 'pi_cpo',
      label: 'Proforma Invoice & Customer PO',
      department: 'Sales',
      state: 'completed',
      docNo: `${so.piDocNo} / ${so.customerPoDocNo}`,
      summary: cpo ? `Customer PO #${cpo.customerPoNumber} verified against ${so.piDocNo}` : so.piDocNo,
      date: cpo?.receivedDate || pi?.piDate,
      link: '/sales/customer-pos',
      canLink: can('sales', 'view'),
    },
    {
      key: 'payment',
      label: 'Commercial Payments',
      department: 'Sales',
      state: paySummary.paymentStatus === 'Paid' ? 'completed' : paySummary.verifiedReceived > 0 ? 'active' : 'pending',
      docNo: paySummary.paymentStatus,
      summary: `Verified ${formatCurrency(paySummary.verifiedReceived, db.company.currencySymbol)} of ${formatCurrency(so.totalAmount, db.company.currencySymbol)} (Balance: ${formatCurrency(paySummary.outstandingBalance, db.company.currencySymbol)})`,
      link: '/sales/payments',
      canLink: can('sales', 'view'),
    },
    {
      key: 'so',
      label: 'Sales Order Confirmed',
      department: 'Sales',
      state: 'completed',
      docNo: so.docNo,
      summary: `Promised delivery: ${formatDate(so.promisedDeliveryDate)} · Priority: ${so.priority}`,
      date: so.createdAt,
      link: '/sales/sales-orders',
      canLink: can('sales', 'view'),
    },
    {
      key: 'prod_plan',
      label: 'Production Order & Duration Plan',
      department: 'Production',
      state: prodOrders.length > 0 ? 'completed' : 'active',
      docNo: prodOrders.map((p) => p.docNo).join(', ') || undefined,
      summary: primaryPo
        ? `${primaryPo.plannedDurationDays} days planned (${formatDate(primaryPo.plannedStartDate)} → ${formatDate(primaryPo.plannedEndDate)})`
        : 'Awaiting Production Order creation',
      date: primaryPo?.createdAt,
      link: primaryPo ? `/production/orders/${primaryPo.id}` : '/production/received-orders',
      canLink: can('production', 'view'),
    },
    {
      key: 'bom_mr',
      label: 'BOM & Supply Chain Material Request',
      department: 'Production → Supply Chain',
      state: mrs.length > 0 ? 'completed' : prodOrders.length > 0 ? 'active' : 'pending',
      docNo: mrs.map((m) => m.docNo).join(', ') || boms.map((b) => b.docNo).join(', ') || undefined,
      summary: mrs.length > 0 ? `${mrs.length} material request(s) sent to Supply Chain` : 'Pending BOM submission',
      date: mrs[0]?.requestDate,
      link: '/production/bom',
      canLink: can('production', 'view'),
    },
    {
      key: 'sc_issue',
      label: 'Material Issue & Shop-Floor Receipt',
      department: 'Supply Chain → Production',
      state:
        allMaterialsIssued && allMaterialsReceived
          ? 'completed'
          : mrs.length > 0
            ? 'active'
            : 'pending',
      docNo: issues.map((i) => i.docNo).join(', ') || undefined,
      summary:
        mrs.length === 0
          ? 'Waiting for BOM request'
          : allMaterialsReceived
            ? `All BOM materials issued & physically received (${issues.length} voucher(s))`
            : `MR status: ${mrs.map((m) => `${m.docNo} ${m.status} / Receipt ${m.receiptStatus}`).join('; ')}`,
      date: issues[0]?.issueDate,
      link: can('supply_chain', 'view') ? '/supply-chain/material-requests' : '/production/material-receipts',
      canLink: can('supply_chain', 'view') || can('production', 'view'),
    },
    {
      key: 'mfg',
      label: 'Manufacturing & Daily Updates',
      department: 'Production',
      state:
        allQcPassed || prodOrders.some((p) => p.status === 'QC Pending')
          ? 'completed'
          : anyReworkActive
            ? 'blocked'
            : prodOrders.some((p) => p.status === 'In Progress' || p.status === 'Ready to Start')
              ? 'active'
              : 'pending',
      docNo: `${updates.length} log(s)`,
      summary:
        updates.length > 0
          ? `Latest: ${updates[0].stage} (${updates[0].stageStatus}) on ${formatDate(updates[0].workDate)}`
          : primaryPo
            ? `Current status: ${primaryPo.status}`
            : 'Not started',
      link: primaryPo ? `/production/orders/${primaryPo.id}` : '/production/active',
      canLink: can('production', 'view'),
    },
    {
      key: 'qc',
      label: 'Quality Check & Rework',
      department: 'Production QC',
      state: allQcPassed
        ? 'completed'
        : anyReworkActive
          ? 'blocked'
          : prodOrders.some((p) => p.status === 'QC Pending')
            ? 'active'
            : 'pending',
      docNo: qcs[0]?.docNo || reworks[0]?.docNo || undefined,
      summary: allQcPassed
        ? `Passed QC (${qcs.filter((q) => q.finalResult === 'Accepted').map((q) => q.docNo).join(', ')})`
        : anyReworkActive
          ? `QC Rejected — Active rework ${reworks[0]?.docNo || ''}`
          : qcs.length > 0
            ? `${qcs.length} QC attempt(s) logged`
            : 'Pending manufacturing completion',
      link: '/production/quality-check',
      canLink: can('production', 'view'),
    },
    {
      key: 'dispatch',
      label: 'Logistics Dispatch',
      department: 'Logistics',
      state: anyDispatched
        ? 'completed'
        : deliveries.some((d) => d.status === 'Issue')
          ? 'blocked'
          : allQcPassed
            ? 'active'
            : 'pending',
      docNo: deliveries.map((d) => d.docNo).join(', ') || undefined,
      summary:
        deliveries.length > 0
          ? deliveries
              .map((d) => `${d.docNo}: ${d.transportMethod} (${d.status})${d.trackingNumber ? ` AWB ${d.trackingNumber}` : ''}`)
              .join(' | ')
          : allQcPassed
            ? 'QC approved — Ready in Logistics queue'
            : 'Locked until QC acceptance',
      link: '/logistics/delivery-orders',
      canLink: can('logistics', 'view'),
    },
    {
      key: 'delivery',
      label: 'Final Delivery Completion',
      department: 'Logistics',
      state: allDelivered ? 'completed' : anyDispatched ? 'active' : 'pending',
      docNo: so.fulfillmentStatus,
      summary: allDelivered
        ? `Delivered on ${formatDate(deliveries[0]?.actualDeliveryDate)} (Received by ${deliveries[0]?.receivedBy || 'Customer'})`
        : 'Awaiting final customer handover & POD',
      link: '/logistics/completed',
      canLink: can('logistics', 'view'),
    },
  ];

  const displaySteps = useMemo(() => {
    if (remoteData?.stages && Array.isArray(remoteData.stages)) {
      return remoteData.stages.map((s: any) => ({
        key: `stage-${s.stageIndex}`,
        label: `${s.stageIndex}. ${s.name}`,
        department: s.department,
        state: (s.status.toLowerCase() === 'in progress' ? 'active' : s.status.toLowerCase()) as any,
        docNo: s.docNo,
        summary: s.summary,
        date: s.date,
        link: s.link,
        canLink: true,
      }));
    }
    return steps;
  }, [remoteData, steps]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/tracking">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" /> All Tracked Orders
          </Button>
        </Link>
      </div>

      <PageHeader
        title={`Order Lifecycle — ${so.docNo}`}
        subtitle={`${so.customerSnapshot.name} · Customer PO #${so.customerPoNumber} · Promised ${formatDate(so.promisedDeliveryDate)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={so.fulfillmentStatus} />
            <StatusBadge status={paySummary.paymentStatus} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPreviewSO(so)}
            >
              <FileText className="w-4 h-4" />
              View SO PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => erpApi.downloadDocumentPDF('sales-order', so.id, so.docNo)}
            >
              <Download className="w-4 h-4" />
              Download SO PDF
            </Button>
          </div>
        }
      />

      {/* Commercial & Item Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="text-xs text-slate-500">Order Value & Payment</div>
          {remoteData?.isCommercialRedacted ? (
            <div className="text-sm font-medium text-slate-500 mt-2 italic">Commercial data redacted</div>
          ) : (
            <>
              <div className="text-xl font-mono font-semibold text-slate-900 dark:text-slate-100 mt-1">
                {formatCurrency(remoteData?.salesOrder?.totalAmount ?? so.totalAmount, db.company.currencySymbol)}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-mono">
                Paid: {formatCurrency(remoteData?.paymentSummary?.verifiedReceived ?? paySummary.verifiedReceived, db.company.currencySymbol)} · Bal:{' '}
                {formatCurrency(remoteData?.paymentSummary?.outstandingBalance ?? paySummary.outstandingBalance, db.company.currencySymbol)}
              </div>
            </>
          )}
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="text-xs text-slate-500">Ordered Equipment</div>
          <div className="mt-1 space-y-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">
            {so.items.map((it) => (
              <div key={it.id}>
                <span className="font-mono">{it.quantity}×</span> {it.productName} ({it.model})
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="text-xs text-slate-500">Delivery Destination</div>
          <div className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">{so.deliveryAddress}</div>
        </div>
      </div>

      {/* Vertical Lifecycle Timeline */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
          End-to-End Fulfillment Timeline (15 Stages)
        </h2>
        <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
          {displaySteps.map((step: any) => {
            const Icon =
              step.state === 'completed'
                ? CheckCircle2
                : step.state === 'blocked'
                  ? AlertCircle
                  : step.state === 'active'
                    ? Clock
                    : Circle;
            const iconTone =
              step.state === 'completed'
                ? 'text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900'
                : step.state === 'blocked'
                  ? 'text-red-600 dark:text-red-400 bg-white dark:bg-slate-900'
                  : step.state === 'active'
                    ? 'text-teal-600 dark:text-teal-400 bg-white dark:bg-slate-900'
                    : 'text-slate-300 dark:text-slate-700 bg-white dark:bg-slate-900';

            return (
              <li key={step.key} className="relative pl-8">
                <Icon className={`w-6 h-6 absolute left-0 top-0.5 ${iconTone}`} />
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80 last:border-b-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step.label}</span>
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {step.department}
                      </span>
                      {step.docNo && (
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{step.docNo}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{step.summary}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {step.date && <span className="text-xs font-mono text-slate-500">{formatDate(step.date)}</span>}
                    {step.link && step.canLink && (
                      <Link
                        to={step.link}
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        Open <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <DocumentPreviewModal
        open={Boolean(previewSO)}
        onClose={() => setPreviewSO(null)}
        company={db.company}
        payload={previewSO ? { kind: 'so', doc: previewSO } : null}
      />
    </div>
  );
};
