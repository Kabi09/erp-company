import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileCheck2,
  Filter,
  History,
  Info,
  Lock,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import {
  Button,
  ConfirmDialog,
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
import { formatCurrency, formatDateTime } from '../../utils/erpLogic';
import type {
  ApprovalDecisionType,
  ApprovalRequest,
  ApprovalWorkflow,
  Department,
} from '../../types/erp';
import { canUserDecideRequest } from '../../utils/rbacLogic';

export const ApprovalInboxPage: React.FC = () => {
  const { data: db, user: currentUser, refresh, toast } = useERP();
  const [inbox, setInbox] = useState<{
    pending: ApprovalRequest[];
    mySubmissions: ApprovalRequest[];
    history: ApprovalRequest[];
    all?: ApprovalRequest[];
  }>({ pending: [], mySubmissions: [], history: [] });

  const [activeTab, setActiveTab] = useState<'pending' | 'mySubmissions' | 'history' | 'all'>('pending');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');

  // Detail Modal
  const [selectedReq, setSelectedReq] = useState<ApprovalRequest | null>(null);
  const [activeWf, setActiveWf] = useState<ApprovalWorkflow | undefined>(undefined);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Decision Modal
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<ApprovalDecisionType>('approved');
  const [remarks, setRemarks] = useState('');
  const [deciding, setDeciding] = useState(false);

  // Withdraw
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);

  const loadInbox = async () => {
    setLoading(true);
    try {
      const data = await erpApi.getApprovalInbox();
      setInbox(data);
    } catch (err) {
      toast('error', 'Failed to load approvals', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, []);

  const openDetail = (reqDoc: ApprovalRequest) => {
    setSelectedReq(reqDoc);
    const wf = db?.approvalWorkflows?.find((w) => w.id === reqDoc.workflowId);
    setActiveWf(wf);
    setDetailModalOpen(true);
  };

  const openDecisionDialog = (type: ApprovalDecisionType) => {
    setDecisionType(type);
    setRemarks('');
    setDecisionModalOpen(true);
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    if ((decisionType === 'rejected' || decisionType === 'changes_requested') && !remarks.trim()) {
      return toast('error', `Remarks are required when selecting '${decisionType.replace('_', ' ')}'`);
    }

    setDeciding(true);
    try {
      const res = await erpApi.decideApprovalRequest(selectedReq.id, decisionType, remarks.trim());
      toast('success', `Approval decision recorded: ${decisionType.toUpperCase()}`);
      setDecisionModalOpen(false);
      setDetailModalOpen(false);
      await loadInbox();
      await refresh();
    } catch (err) {
      toast('error', 'Decision failed', (err as Error).message);
    } finally {
      setDeciding(false);
    }
  };

  const handleWithdraw = async () => {
    if (!selectedReq) return;
    setDeciding(true);
    try {
      await erpApi.withdrawApprovalRequest(selectedReq.id);
      toast('info', `Withdrew submission for ${selectedReq.documentDocNo}`);
      setWithdrawConfirmOpen(false);
      setDetailModalOpen(false);
      await loadInbox();
      await refresh();
    } catch (err) {
      toast('error', 'Withdrawal failed', (err as Error).message);
    } finally {
      setDeciding(false);
    }
  };

  const currentTabItems = useMemo(() => {
    const list = inbox[activeTab] || [];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (deptFilter !== 'All' && r.department !== deptFilter) return false;
      if (!q) return true;
      return (
        r.documentDocNo.toLowerCase().includes(q) ||
        r.module.toLowerCase().includes(q) ||
        r.submittedBy.name.toLowerCase().includes(q) ||
        r.submittedBy.employeeId.toLowerCase().includes(q) ||
        r.workflowName.toLowerCase().includes(q)
      );
    });
  }, [inbox, activeTab, search, deptFilter]);

  const decisionCheck = useMemo(() => {
    if (!selectedReq || !currentUser) return { canDecide: false };
    return canUserDecideRequest(selectedReq, activeWf, currentUser);
  }, [selectedReq, activeWf, currentUser]);

  const columns: ColumnDef<ApprovalRequest>[] = [
    {
      key: 'docNo',
      header: 'Document & Version',
      render: (r) => (
        <div className="text-xs">
          <div className="font-mono font-bold text-teal-700 dark:text-teal-400">
            {r.documentDocNo}
            <span className="ml-1.5 px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-sans text-[10px]">
              {r.documentVersion}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{r.workflowName}</div>
        </div>
      ),
    },
    {
      key: 'module',
      header: 'Module / Dept',
      render: (r) => (
        <div className="text-xs">
          <span className="font-medium text-slate-800 dark:text-slate-200 capitalize">
            {r.module.replace('_', ' ')}
          </span>
          <div className="text-[10px] text-slate-500 capitalize">{r.department.replace('_', ' ')}</div>
        </div>
      ),
    },
    {
      key: 'submittedBy',
      header: 'Submitter',
      render: (r) => (
        <div className="text-xs">
          <div className="font-medium text-slate-900 dark:text-slate-100">{r.submittedBy.name}</div>
          <div className="text-[10px] text-slate-400 font-mono">
            {r.submittedBy.employeeId} · {formatDateTime(r.submittedAt)}
          </div>
        </div>
      ),
    },
    {
      key: 'level',
      header: 'Workflow Stage',
      render: (r) => (
        <div className="text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Step {r.currentLevel} of {r.totalLevels}
          </span>
          <div className="text-[10px] text-slate-400 truncate max-w-44">
            {activeWf?.approvalLevels?.find((l) => l.levelNumber === r.currentLevel)?.levelName || 'Awaiting Review'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        let badgeVariant = 'default';
        if (r.status === 'approved') badgeVariant = 'success';
        if (r.status === 'rejected') badgeVariant = 'danger';
        if (r.status === 'pending') badgeVariant = 'warning';
        if (r.status === 'changes_requested') badgeVariant = 'warning';

        return (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
              r.status === 'approved'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : r.status === 'rejected'
                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                : r.status === 'changes_requested'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                : r.status === 'withdrawn'
                ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
            }`}
          >
            {r.status.replace('_', ' ')}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) => {
        const canDecide = currentUser && canUserDecideRequest(r, activeWf, currentUser).canDecide;
        return (
          <Button
            size="sm"
            variant={canDecide && r.status === 'pending' ? 'primary' : 'secondary'}
            onClick={() => openDetail(r)}
          >
            {canDecide && r.status === 'pending' ? 'Review & Decide' : 'View Details'}
          </Button>
        );
      },
    },
  ];

  if (!db) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Universal Approval Inbox"
        subtitle="Review, authorize, request changes, or track submissions across Sales, Supply Chain, Production, Logistics, and Administration."
        actions={
          <Button variant="secondary" onClick={loadInbox} loading={loading}>
            <RefreshCw className="w-4 h-4" /> Refresh Inbox
          </Button>
        }
      />

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 font-semibold transition-colors cursor-pointer ${
            activeTab === 'pending'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Pending My Decision</span>
          {inbox.pending.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-bold">
              {inbox.pending.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('mySubmissions')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 font-semibold transition-colors cursor-pointer ${
            activeTab === 'mySubmissions'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>My Submissions</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
            {inbox.mySubmissions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 font-semibold transition-colors cursor-pointer ${
            activeTab === 'history'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Approval History</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
            {inbox.history.length}
          </span>
        </button>

        {inbox.all && (
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`pb-3 px-4 flex items-center gap-2 border-b-2 font-semibold transition-colors cursor-pointer ${
              activeTab === 'all'
                ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>All Enterprise Requests</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {inbox.all.length}
            </span>
          </button>
        )}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search document number, submitter name, or workflow..."
        statuses={['All', 'sales', 'supply_chain', 'production', 'logistics', 'service', 'rnd', 'admin']}
        activeStatus={deptFilter}
        onStatusChange={setDeptFilter}
      />

      <DataTable
        rows={currentTabItems}
        columns={columns}
        emptyTitle={`No approval requests found under ${activeTab.replace('_', ' ')}.`}
      />

      {/* Detail & Review Modal */}
      {selectedReq && (
        <Modal
          open={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Approval Request: ${selectedReq.documentDocNo} (${selectedReq.documentVersion})`}
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <div>
                {selectedReq.submittedBy.id === currentUser?.id && selectedReq.status === 'pending' && (
                  <Button
                    variant="ghost"
                    onClick={() => setWithdrawConfirmOpen(true)}
                    className="text-rose-600 hover:text-rose-700"
                  >
                    Withdraw Submission
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>
                  Close
                </Button>
                {selectedReq.status === 'pending' && decisionCheck.canDecide && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => openDecisionDialog('changes_requested')}
                      className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50"
                    >
                      Request Changes
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => openDecisionDialog('rejected')}
                      className="border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-400 hover:bg-rose-50"
                    >
                      Reject
                    </Button>
                    <Button onClick={() => openDecisionDialog('approved')} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      Approve Request
                    </Button>
                  </>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-6">
            {/* Self-approval or authorization warning if blocked */}
            {selectedReq.status === 'pending' && !decisionCheck.canDecide && (
              <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    Decision Action Unavailable
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    {decisionCheck.reason || 'You are not authorized to make a decision at this approval step.'}
                  </p>
                </div>
              </div>
            )}

            {/* Stepper progress */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Workflow Progress ({selectedReq.workflowName})
              </h4>
              <div className="flex items-center justify-between">
                {Array.from({ length: selectedReq.totalLevels }, (_, idx) => {
                  const stepNum = idx + 1;
                  const isPassed =
                    selectedReq.status === 'approved' ||
                    (selectedReq.status === 'pending' && stepNum < selectedReq.currentLevel);
                  const isCurrent = selectedReq.status === 'pending' && stepNum === selectedReq.currentLevel;
                  const isRejected = selectedReq.status === 'rejected' && stepNum === selectedReq.currentLevel;

                  return (
                    <React.Fragment key={stepNum}>
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs transition-colors ${
                            isPassed
                              ? 'bg-emerald-600 text-white'
                              : isCurrent
                              ? 'bg-teal-600 text-white ring-4 ring-teal-100 dark:ring-teal-950'
                              : isRejected
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                          }`}
                        >
                          {isPassed ? <Check className="w-4 h-4" /> : stepNum}
                        </div>
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 mt-1.5 text-center">
                          Step {stepNum}
                        </span>
                      </div>
                      {stepNum < selectedReq.totalLevels && (
                        <div
                          className={`flex-1 h-0.5 mx-3 ${
                            isPassed ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Document Snapshot */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Document Snapshot (At Submission Time)
                </span>
                <span className="text-xs font-mono text-slate-500">
                  Submitted {formatDateTime(selectedReq.submittedAt)}
                </span>
              </div>

              {selectedReq.documentSnapshot && (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Party / Customer</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {selectedReq.documentSnapshot.customerName ||
                          selectedReq.documentSnapshot.supplierName ||
                          'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Total Items</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {selectedReq.documentSnapshot.itemsCount ||
                          selectedReq.documentSnapshot.items?.length ||
                          0}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Total Value</span>
                      <span className="font-semibold font-mono text-teal-600 dark:text-teal-400 text-sm">
                        {formatCurrency(selectedReq.documentSnapshot.totalAmount || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Submitter</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {selectedReq.submittedBy.name}
                      </span>
                    </div>
                  </div>

                  {Array.isArray(selectedReq.documentSnapshot.items) && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Item Description</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Rate</th>
                            <th className="px-3 py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {selectedReq.documentSnapshot.items.map((it: any, idx: number) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 font-medium">
                                {it.productName || it.materialName || 'Item'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {it.quantity || it.orderedQty}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {formatCurrency(it.unitPrice || 0)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-medium">
                                {formatCurrency(it.lineTotal || (it.quantity || 1) * (it.unitPrice || 0))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {selectedReq.documentSnapshot.paymentTerms && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-400">
                      <strong className="text-slate-700 dark:text-slate-300">Payment Terms: </strong>
                      {selectedReq.documentSnapshot.paymentTerms}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Past Decisions Timeline */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Decision Audit Trail ({selectedReq.decisions?.length || 0})
              </h4>
              {selectedReq.decisions && selectedReq.decisions.length > 0 ? (
                <div className="space-y-2">
                  {selectedReq.decisions.map((d, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 text-xs flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold capitalize ${
                              d.decision === 'approved'
                                ? 'text-emerald-600'
                                : d.decision === 'rejected'
                                ? 'text-rose-600'
                                : 'text-amber-600'
                            }`}
                          >
                            {d.decision.replace('_', ' ')}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{d.levelName}</span>
                        </div>
                        <div className="text-slate-500 mt-1">
                          Decided by <strong className="text-slate-700 dark:text-slate-300">{d.decidedBy.name}</strong> (
                          {d.decidedBy.roleName}) on {formatDateTime(d.decidedAt)}
                        </div>
                        {d.remarks && (
                          <div className="mt-1.5 p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                            "{d.remarks}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No decisions recorded yet. Awaiting initial review.</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Remarks Decision Modal */}
      <Modal
        open={decisionModalOpen}
        onClose={() => setDecisionModalOpen(false)}
        title={`Record Decision: ${decisionType.toUpperCase().replace('_', ' ')}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecisionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="decision-form"
              loading={deciding}
              className={
                decisionType === 'approved'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : decisionType === 'rejected'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }
            >
              Confirm {decisionType.replace('_', ' ')}
            </Button>
          </>
        }
      >
        <form id="decision-form" onSubmit={handleDecisionSubmit} className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {decisionType === 'approved' &&
              `You are authorizing ${selectedReq?.documentDocNo}. If this is the final step, the document will become Approved.`}
            {decisionType === 'changes_requested' &&
              `You are requesting modifications on ${selectedReq?.documentDocNo}. Please detail what needs to be changed.`}
            {decisionType === 'rejected' &&
              `You are permanently rejecting ${selectedReq?.documentDocNo}. Rejection reason is mandatory.`}
          </p>

          <Field
            label="Decision Remarks / Reason"
            required={decisionType === 'rejected' || decisionType === 'changes_requested'}
          >
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={
                decisionType === 'approved'
                  ? 'Optional approval comments...'
                  : 'Specify reasons or requested modifications...'
              }
              rows={4}
              required={decisionType === 'rejected' || decisionType === 'changes_requested'}
            />
          </Field>
        </form>
      </Modal>

      {/* Withdraw Confirm Dialog */}
      <ConfirmDialog
        open={withdrawConfirmOpen}
        title="Withdraw Submission?"
        message={`Are you sure you want to withdraw ${selectedReq?.documentDocNo}? The approval request will be cancelled and the document returned to editable Draft status.`}
        onConfirm={handleWithdraw}
        onClose={() => setWithdrawConfirmOpen(false)}
        confirmLabel="Withdraw Submission"
      />
    </div>
  );
};
