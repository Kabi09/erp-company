import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { Button, PageHeader, StatCard, StatusBadge } from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { calculatePaymentSummary, formatCurrency } from '../../utils/erpLogic';

export const SalesDashboard: React.FC = () => {
  const { data, can } = useERP();
  const navigate = useNavigate();
  if (!data) return null;

  const today = new Date().toISOString().slice(0, 10);
  const newEnquiries = data.enquiries.filter((e) => e.status === 'New' || e.status === 'Contacted');
  const qualifiedEnquiries = data.enquiries.filter((e) => e.status === 'Qualified');
  const todaysFollowUps = data.followUps.filter(
    (f) => f.status === 'Scheduled' && f.nextFollowUpDate && f.nextFollowUpDate <= today,
  );
  const pendingQuotations = data.quotations.filter(
    (q) => q.status === 'Draft' || q.status === 'Sent' || q.status === 'Pending' || q.status === 'Negotiation',
  );
  const acceptedQuotations = data.quotations.filter((q) => q.status === 'Accepted');
  const confirmedSOs = data.salesOrders.filter((s) => s.commercialStatus === 'Confirmed');

  const totalOutstanding = confirmedSOs.reduce((sum, so) => {
    const summary = calculatePaymentSummary(so.totalAmount, data.payments, { piId: so.piId, salesOrderId: so.id });
    return sum + summary.outstandingBalance;
  }, 0);

  const recentSalesActivity = data.activityLogs.filter((a) => a.department === 'sales').slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Management"
        subtitle="Manage enquiries, follow-ups, commercial quotations, payments, and sales orders."
        actions={
          can('sales', 'create') && (
            <>
              <Button variant="secondary" size="sm" onClick={() => navigate('/sales/follow-ups?create=1')}>
                Add Follow-up
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigate('/sales/payments?create=1')}>
                Record Payment
              </Button>
              <Button variant="primary" size="sm" onClick={() => navigate('/sales/enquiries?create=1')}>
                <Plus className="w-4 h-4" />
                New Enquiry
              </Button>
            </>
          )
        }
      />

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="New / Active Enquiries"
          value={newEnquiries.length}
          hint={`${data.enquiries.length} total logged`}
          onClick={() => navigate('/sales/enquiries')}
        />
        <StatCard
          label="Qualified Enquiries"
          value={qualifiedEnquiries.length}
          hint="Ready for quotation"
          tone="success"
          onClick={() => navigate('/sales/qualified')}
        />
        <StatCard
          label="Today / Due Follow-ups"
          value={todaysFollowUps.length}
          hint="Scheduled actions due"
          tone={todaysFollowUps.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/sales/follow-ups')}
        />
        <StatCard
          label="Pending Quotations"
          value={pendingQuotations.length}
          hint={`${acceptedQuotations.length} accepted versions`}
          onClick={() => navigate('/sales/quotations')}
        />
        <StatCard
          label="Confirmed Sales Orders"
          value={confirmedSOs.length}
          hint="Synced with Production"
          onClick={() => navigate('/sales/sales-orders')}
        />
        <StatCard
          label="Outstanding Payments"
          value={formatCurrency(totalOutstanding, data.company.currencySymbol)}
          hint="Across confirmed orders"
          tone={totalOutstanding > 0 ? 'warning' : 'success'}
          onClick={() => navigate('/sales/payments')}
        />
        <StatCard
          label="Customers"
          value={data.customers.length}
          hint="Active accounts"
          onClick={() => navigate('/sales/customers')}
        />
        <StatCard
          label="Product Catalogue"
          value={data.products.filter((p) => p.status === 'Active').length}
          hint="Active CRYO models"
          onClick={() => navigate('/sales/products')}
        />
      </div>

      {/* Action Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scheduled Follow-ups */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Scheduled Follow-ups</h2>
            <button
              type="button"
              onClick={() => navigate('/sales/follow-ups')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.followUps.filter((f) => f.status === 'Scheduled').slice(0, 5).map((fu) => (
              <div key={fu.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    <span className="font-mono text-xs text-slate-500 mr-2">{fu.entityDocNo}</span>
                    {fu.customerName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{fu.discussion}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Next: <span className="font-mono">{fu.nextFollowUpDate || fu.followUpDate}</span> · {fu.contactMethod} · {fu.followedBy}
                  </div>
                </div>
                <StatusBadge status={fu.response} />
              </div>
            ))}
            {data.followUps.filter((f) => f.status === 'Scheduled').length === 0 && (
              <p className="p-6 text-xs text-slate-500 text-center">No pending scheduled follow-ups.</p>
            )}
          </div>
        </section>

        {/* Recent Sales Activity */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Sales Activity</h2>
            <button
              type="button"
              onClick={() => navigate('/sales/sales-orders')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Sales Orders <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {recentSalesActivity.map((act) => (
              <div key={act.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {act.action} <span className="font-mono text-xs text-slate-500">· {act.entityDocNo}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{act.details}</div>
                </div>
                <span className="text-[11px] font-mono text-slate-400 shrink-0">
                  {act.timestamp.slice(0, 10)}
                </span>
              </div>
            ))}
            {recentSalesActivity.length === 0 && (
              <p className="p-6 text-xs text-slate-500 text-center">No recent activity recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export const SalesReportsPage: React.FC = () => {
  const { data } = useERP();
  if (!data) return null;

  const totalOrderValue = data.salesOrders.reduce((s, so) => s + so.totalAmount, 0);
  const totalCollected = data.payments.filter((p) => p.status === 'Verified').reduce((s, p) => s + p.amount, 0);
  const conversionRate =
    data.enquiries.length > 0
      ? Math.round((data.salesOrders.length / data.enquiries.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Reports"
        subtitle="Commercial pipeline conversion, order values, and collection summary."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Order Value" value={formatCurrency(totalOrderValue, data.company.currencySymbol)} />
        <StatCard label="Verified Collections" value={formatCurrency(totalCollected, data.company.currencySymbol)} tone="success" />
        <StatCard label="Enquiry to SO Rate" value={`${conversionRate}%`} hint={`${data.salesOrders.length} / ${data.enquiries.length} enquiries`} />
        <StatCard label="Quotation Revisions" value={data.quotations.filter((q) => q.version > 1).length} hint={`${data.quotations.length} total versions`} />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
          Sales Order Commercial & Payment Summary
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <th className="px-4 py-2.5">SO Number</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5 text-right">Order Total</th>
                <th className="px-4 py-2.5 text-right">Verified Paid</th>
                <th className="px-4 py-2.5 text-right">Outstanding</th>
                <th className="px-4 py-2.5">Payment</th>
                <th className="px-4 py-2.5">Fulfillment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.salesOrders.map((so) => {
                const pay = calculatePaymentSummary(so.totalAmount, data.payments, { piId: so.piId, salesOrderId: so.id });
                return (
                  <tr key={so.id}>
                    <td className="px-4 py-3 font-mono font-medium">{so.docNo}</td>
                    <td className="px-4 py-3">{so.customerSnapshot.name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(so.totalAmount)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(pay.verifiedReceived)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                      {formatCurrency(pay.outstandingBalance)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={pay.paymentStatus} /></td>
                    <td className="px-4 py-3"><StatusBadge status={so.fulfillmentStatus} /></td>
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
