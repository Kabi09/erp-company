import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Button,
  DataTable,
  ErrorBanner,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { ExpenseSettlementSummary, ServiceExpense, TechnicianAdvance } from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

export const ServiceExpensesPage: React.FC = () => {
  const { data, user, toast, can } = useERP();
  const navigate = useNavigate();

  const [expenses, setExpenses] = useState<ServiceExpense[]>([]);
  const [advances, setAdvances] = useState<TechnicianAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expenses');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ServiceExpense | null>(null);
  const [selectedTechSummary, setSelectedTechSummary] = useState<ExpenseSettlementSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Forms
  const [advanceForm, setAdvanceForm] = useState({
    technicianId: '',
    technicianName: '',
    amount: 5000,
    advanceDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Bank Transfer' as const,
    purpose: 'Outstation site commissioning travel and local expenses',
  });

  const [expenseForm, setExpenseForm] = useState({
    category: 'Travel' as const,
    description: '',
    amount: 1200,
    paidBy: 'Technician' as const,
  });

  const [verifyForm, setVerifyForm] = useState<{
    status: 'Verified' | 'Rejected';
    rejectionReason: string;
  }>({
    status: 'Verified',
    rejectionReason: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [expList, advList] = await Promise.all([
        erpApi.getServiceExpenses(),
        erpApi.getTechnicianAdvances(),
      ]);
      setExpenses(expList);
      setAdvances(advList);
    } catch (e: any) {
      toast('error', 'Failed to load expenses', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const technicians = useMemo(() => {
    return (data?.employees || []).filter(
      (e) => e.department === 'service' || e.designation.toLowerCase().includes('technician') || e.designation.toLowerCase().includes('engineer'),
    );
  }, [data?.employees]);

  // Aggregate stats
  const verifiedExpenses = useMemo(() => expenses.filter((e) => e.status === 'Verified'), [expenses]);
  const employeePaid = useMemo(
    () => verifiedExpenses.filter((e) => e.paidBy === 'Technician').reduce((sum, e) => sum + e.amount, 0),
    [verifiedExpenses],
  );
  const companyPaid = useMemo(
    () => verifiedExpenses.filter((e) => e.paidBy === 'Company').reduce((sum, e) => sum + e.amount, 0),
    [verifiedExpenses],
  );
  const totalAdvances = useMemo(
    () => advances.filter((a) => a.status === 'Disbursed').reduce((sum, a) => sum + a.amount, 0),
    [advances],
  );

  const netReimbursementDue = Math.max(0, employeePaid - totalAdvances);
  const netAdvanceReturnDue = Math.max(0, totalAdvances - employeePaid);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchSearch =
        !q ||
        e.docNo.toLowerCase().includes(q) ||
        e.technicianName.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'All' || e.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [expenses, search, statusFilter]);

  const handleDisburseAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceForm.technicianId || !advanceForm.amount) {
      setErr('Technician and Amount are required.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.createTechnicianAdvance(advanceForm);
      toast('success', 'Technician Advance Disbursed', `${formatCurrency(advanceForm.amount)} to ${advanceForm.technicianName}`);
      setAdvanceOpen(false);
      await loadData();
    } catch (e: any) {
      setErr(e.message || 'Advance disbursement failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.verifyServiceExpense(selectedExpense.id, verifyForm);
      toast('success', `Expense Claim ${verifyForm.status}`, selectedExpense.docNo);
      setVerifyOpen(false);
      setSelectedExpense(null);
      await loadData();
    } catch (e: any) {
      setErr(e.message || 'Verification update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenTechSummary = async (techId: string) => {
    try {
      setSummaryLoading(true);
      const res = await erpApi.getTechnicianSettlementSummary(techId);
      setSelectedTechSummary(res);
    } catch (e: any) {
      toast('error', 'Could not compute settlement summary', e.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSettleExpenses = async (techId: string) => {
    try {
      await erpApi.settleTechnicianExpenses({ technicianId: techId });
      toast('success', 'Technician Advances Marked Settled');
      setSelectedTechSummary(null);
      await loadData();
    } catch (e: any) {
      toast('error', 'Settlement failed', e.message);
    }
  };

  const expenseColumns: ColumnDef<ServiceExpense>[] = [
    {
      key: 'docNo',
      header: 'Expense #',
      sortable: true,
      render: (e) => (
        <div>
          <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-xs">
            {e.docNo}
          </span>
          <div className="text-[11px] text-slate-500 font-sans">{e.date}</div>
        </div>
      ),
    },
    {
      key: 'technicianName',
      header: 'Technician',
      sortable: true,
      render: (e) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{e.technicianName}</div>
          {e.serviceJobDocNo && <div className="text-[11px] text-teal-600 font-mono">{e.serviceJobDocNo}</div>}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category / Purpose',
      sortable: true,
      render: (e) => (
        <div>
          <span className="font-semibold text-slate-800 dark:text-slate-200">{e.category}</span>
          <div className="text-slate-500 dark:text-slate-400 line-clamp-1">{e.description}</div>
        </div>
      ),
    },
    {
      key: 'paidBy',
      header: 'Paid By',
      sortable: true,
      render: (e) => (
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
            e.paidBy === 'Technician'
              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
              : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
          }`}
        >
          {e.paidBy}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      align: 'right',
      render: (e) => (
        <span className="font-bold text-slate-900 dark:text-slate-100">
          {formatCurrency(e.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Verification Status',
      sortable: true,
      render: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (e) => (
        can('service', 'verify') && e.status === 'Pending' ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelectedExpense(e);
              setVerifyForm({ status: 'Verified', rejectionReason: '' });
              setVerifyOpen(true);
            }}
            className="text-xs"
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            Verify / Reject
          </Button>
        ) : null
      ),
    },
  ];

  const advanceColumns: ColumnDef<TechnicianAdvance>[] = [
    {
      key: 'docNo',
      header: 'Advance #',
      sortable: true,
      render: (a) => (
        <div>
          <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-xs">
            {a.docNo}
          </span>
          <div className="text-[11px] text-slate-500 font-sans">{a.advanceDate}</div>
        </div>
      ),
    },
    {
      key: 'technicianName',
      header: 'Technician',
      sortable: true,
      render: (a) => <span className="font-medium text-slate-900 dark:text-slate-100">{a.technicianName}</span>,
    },
    {
      key: 'purpose',
      header: 'Purpose / Job',
      render: (a) => (
        <div>
          <div className="text-slate-800 dark:text-slate-200">{a.purpose}</div>
          {a.serviceJobDocNo && <div className="text-[11px] text-teal-600 font-mono">Job: {a.serviceJobDocNo}</div>}
        </div>
      ),
    },
    {
      key: 'paymentMode',
      header: 'Mode',
      sortable: true,
      render: (a) => <span className="text-slate-600 dark:text-slate-400">{a.paymentMode}</span>,
    },
    {
      key: 'amount',
      header: 'Disbursed Amount',
      sortable: true,
      align: 'right',
      render: (a) => (
        <span className="font-bold text-slate-900 dark:text-slate-100">
          {formatCurrency(a.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (a) => <StatusBadge status={a.status} />,
    },
  ];

  const tabs = [
    { id: 'expenses', label: `Expense Claims (${expenses.length})` },
    { id: 'advances', label: `Travel Advances (${advances.length})` },
    { id: 'settlements', label: 'Technician Settlements' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Technician Expenses & Advances"
        description="Out-of-pocket field repair claims, travel advance disbursements, managerial verification, and settlement balancing."
        breadcrumbs={[{ label: 'Service', path: '/service' }, { label: 'Expenses & Advances' }]}
        actions={
          <div className="flex items-center gap-2">
            {can('service', 'create') && (
              <Button onClick={() => setAdvanceOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Disburse Advance
              </Button>
            )}
          </div>
        }
      />

      {/* Settlement Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">Verified Claims</span>
          <span className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 block">
            {formatCurrency(employeePaid + companyPaid)}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Technician: {formatCurrency(employeePaid)} | Corporate: {formatCurrency(companyPaid)}
          </span>
        </div>

        <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">Disbursed Advances</span>
          <span className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 block">
            {formatCurrency(totalAdvances)}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Active float across field engineers
          </span>
        </div>

        <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">Reimbursement Due</span>
          <span className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 block">
            {formatCurrency(netReimbursementDue)}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Owed to engineers for out-of-pocket
          </span>
        </div>

        <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">Advance to Return</span>
          <span className="text-lg font-bold text-purple-600 dark:text-purple-400 mt-1 block">
            {formatCurrency(netAdvanceReturnDue)}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Unspent company advance balance
          </span>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by expense #, technician, category, description..."
            statuses={['All', 'Pending', 'Verified', 'Rejected']}
            activeStatus={statusFilter}
            onStatusChange={setStatusFilter}
          />

          <DataTable
            columns={expenseColumns}
            data={filteredExpenses}
            loading={loading}
            emptyTitle="No Expense Claims"
            emptyDescription="Submitted field service travel and lodging receipts will appear here."
          />
        </div>
      )}

      {activeTab === 'advances' && (
        <div className="space-y-4">
          <DataTable
            columns={advanceColumns}
            data={advances}
            loading={loading}
            emptyTitle="No Advances Disbursed"
            emptyDescription="Disbursed field advances will appear here."
          />
        </div>
      )}

      {activeTab === 'settlements' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {technicians.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm block">
                      {t.name}
                    </span>
                    <span className="text-slate-500">{t.designation}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleOpenTechSummary(t.id)}
                    className="text-xs"
                  >
                    View Balance
                  </Button>
                </div>

                <div className="text-slate-600 dark:text-slate-400">
                  Click &quot;View Balance&quot; to calculate the exact net reconciliation between verified out-of-pocket expenses and disbursed advances.
                </div>
              </div>
            ))}
          </div>

          {selectedTechSummary && (
            <Modal
              open={Boolean(selectedTechSummary)}
              onClose={() => setSelectedTechSummary(null)}
              title={`Expense Settlement Reconciliation: ${technicians.find((t) => t.id === selectedTechSummary.technicianId)?.name || 'Technician'}`}
            >
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-slate-500 block">Verified Claims Count</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedTechSummary.verifiedExpensesCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Total Claims Value</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(selectedTechSummary.totalExpenses)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Technician Out-of-Pocket</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(selectedTechSummary.employeePaid)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Advance Disbursed</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(selectedTechSummary.advancePaid)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Settlement Status:</span>
                    <StatusBadge status={selectedTechSummary.settlementStatus} />
                  </div>

                  {selectedTechSummary.reimbursementDue > 0 && (
                    <div className="text-amber-700 dark:text-amber-400 font-semibold text-sm">
                      Company owes reimbursement: {formatCurrency(selectedTechSummary.reimbursementDue)}
                    </div>
                  )}

                  {selectedTechSummary.advanceToReturn > 0 && (
                    <div className="text-purple-700 dark:text-purple-400 font-semibold text-sm">
                      Technician to return unused float: {formatCurrency(selectedTechSummary.advanceToReturn)}
                    </div>
                  )}

                  {selectedTechSummary.settlementStatus === 'Balanced' && (
                    <div className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                      Expenses and advances are perfectly balanced (₹0 due).
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <Button variant="secondary" onClick={() => setSelectedTechSummary(null)}>
                    Close
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => handleSettleExpenses(selectedTechSummary.technicianId)}
                  >
                    Confirm Settlement
                  </Button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* Disburse Advance Modal */}
      <Modal open={advanceOpen} onClose={() => setAdvanceOpen(false)} title="Disburse Travel Advance">
        <form onSubmit={handleDisburseAdvance} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <Field label="Technician" required>
            <Select
              value={advanceForm.technicianId}
              onChange={(e) => {
                const emp = technicians.find((t) => t.id === e.target.value);
                setAdvanceForm({
                  ...advanceForm,
                  technicianId: e.target.value,
                  technicianName: emp?.name || '',
                });
              }}
              required
            >
              <option value="">Select Technician...</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.designation})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Advance Amount (₹)" required>
            <Input
              type="number"
              min="500"
              step="500"
              value={advanceForm.amount}
              onChange={(e) => setAdvanceForm({ ...advanceForm, amount: Number(e.target.value) })}
              required
            />
          </Field>

          <Field label="Payment Mode">
            <Select
              value={advanceForm.paymentMode}
              onChange={(e) => setAdvanceForm({ ...advanceForm, paymentMode: e.target.value as any })}
            >
              <option value="Bank Transfer">Bank Transfer (NEFT / IMPS)</option>
              <option value="UPI">Company UPI</option>
              <option value="Company Card">Company Forex / Corporate Card</option>
              <option value="Cash">Petty Cash</option>
            </Select>
          </Field>

          <Field label="Purpose" required>
            <Input
              value={advanceForm.purpose}
              onChange={(e) => setAdvanceForm({ ...advanceForm, purpose: e.target.value })}
              required
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setAdvanceOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Disburse Advance
            </Button>
          </div>
        </form>
      </Modal>

      {/* Verify Expense Modal */}
      <Modal open={verifyOpen} onClose={() => setVerifyOpen(false)} title={`Verify Expense Claim: ${selectedExpense?.docNo}`}>
        <form onSubmit={handleVerifyExpense} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-950 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Technician:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedExpense?.technicianName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(selectedExpense?.amount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Category:</span>
              <span>{selectedExpense?.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Description:</span>
              <span>{selectedExpense?.description}</span>
            </div>
          </div>

          <Field label="Verification Decision" required>
            <Select
              value={verifyForm.status}
              onChange={(e) => setVerifyForm({ ...verifyForm, status: e.target.value as any })}
            >
              <option value="Verified">Verified &amp; Approved</option>
              <option value="Rejected">Rejected</option>
            </Select>
          </Field>

          {verifyForm.status === 'Rejected' && (
            <Field label="Rejection Reason" required>
              <Input
                value={verifyForm.rejectionReason}
                onChange={(e) => setVerifyForm({ ...verifyForm, rejectionReason: e.target.value })}
                placeholder="Reason for rejecting claim (e.g. Missing receipt, exceeds per diem)..."
                required
              />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setVerifyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Submit Decision
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
