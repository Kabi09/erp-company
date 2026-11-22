import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileCheck2,
  Layers,
  LogIn,
  LogOut,
  PackageCheck,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  DataTable,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type {
  DeliveredProduct,
  DynamicChecklistItem,
  ServiceBilling,
  ServiceExpense,
  ServiceJob,
  ServiceMaterialRequest,
  ServiceRequest,
  ServiceWorkUpdate,
} from '../../types/erp';
import { formatCurrency } from '../../utils/erpLogic';

export const ServiceJobDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, user, toast, can } = useERP();
  const navigate = useNavigate();

  const [job, setJob] = useState<ServiceJob | null>(null);
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [product, setProduct] = useState<DeliveredProduct | null>(null);
  const [updates, setUpdates] = useState<ServiceWorkUpdate[]>([]);
  const [materialRequests, setMaterialRequests] = useState<ServiceMaterialRequest[]>([]);
  const [expenses, setExpenses] = useState<ServiceExpense[]>([]);
  const [billing, setBilling] = useState<ServiceBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Modals
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [workUpdateOpen, setWorkUpdateOpen] = useState(false);
  const [materialReqOpen, setMaterialReqOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [selectedSmr, setSelectedSmr] = useState<ServiceMaterialRequest | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Forms
  const [checkInLocation, setCheckInLocation] = useState('');
  const [checkInNotes, setCheckInNotes] = useState('');

  const [checkOutForm, setCheckOutForm] = useState({
    resolutionSummary: '',
    customerRepresentativeName: '',
    customerSignatureAck: true,
    rootCause: '',
    correctiveAction: '',
    preventiveAction: '',
  });

  const [completeForm, setCompleteForm] = useState({
    customerFeedbackScore: 5,
    customerFeedbackNotes: 'Servicing completed promptly and equipment restored to normal operation.',
    finalProductCondition: 'Normal Operational Status',
    completionSummary: 'All diagnostic steps, component replacements, and field calibration completed satisfactorily.',
  });

  const [workshopReceiveOpen, setWorkshopReceiveOpen] = useState(false);
  const [workshopReturnOpen, setWorkshopReturnOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);

  const [workshopReceiveForm, setWorkshopReceiveForm] = useState({
    receivedDate: new Date().toISOString().split('T')[0],
    receivedBy: '',
    condition: 'Machinery received at CRYO Workshop with physical integrity intact.',
    notes: '',
  });

  const [workshopReturnForm, setWorkshopReturnForm] = useState({
    returnDate: new Date().toISOString().split('T')[0],
    returnStatus: 'Returned in fully operational verified condition',
    notes: '',
    customerConfirmation: true,
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    paymentMode: 'Bank Transfer',
    referenceDocNo: '',
    notes: '',
  });

  // Work Update Form (Dynamic Checklist + Multiple Highlights)
  const [workUpdateForm, setWorkUpdateForm] = useState({
    stageName: 'Diagnosis & Repair',
    hoursSpent: 2,
    highlights: ['Inspected refrigeration circuit pressure', 'Checked thermal sensor calibration'],
    newHighlightText: '',
    checklist: [
      { id: '1', item: 'Visual check for refrigerant oil stains / leaks', result: 'Pass' as const, remarks: 'No oil leaks observed' },
      { id: '2', item: 'Compressor run current and starting relay', result: 'Pass' as const, remarks: 'Nominal amperage' },
      { id: '3', item: 'Condenser air flow & fan motor bearing', result: 'Pass' as const, remarks: 'Airflow clear' },
      { id: '4', item: 'Door gasket magnetic seal tightness', result: 'Pass' as const, remarks: 'Tight seal verified' },
      { id: '5', item: 'Controller temperature calibration against master PT100', result: 'Pass' as const, remarks: 'Within ±0.5°C' },
    ],
    findingsNotes: '',
  });

  // Material Request Form
  const [spareItems, setSpareItems] = useState([
    { materialName: 'Thermal Expansion Valve R404A', quantityRequested: 1, unit: 'Nos', unitCost: 3200 },
  ]);

  // Reconcile Usage Form
  const [reconcileUsage, setReconcileUsage] = useState<Array<{ quantityUsed: number; quantityReturned: number }>>([]);

  // Expense Form
  const [expenseForm, setExpenseForm] = useState({
    category: 'Travel' as const,
    description: 'Local taxi transport to customer laboratory',
    amount: 650,
    paidBy: 'Technician' as const,
  });

  // Billing Form
  const [billingItems, setBillingItems] = useState<Array<{ description: string; itemType: any; quantity: number; unitPrice: number; totalPrice: number; isWarrantyCovered: boolean }>>([]);

  const loadJobDetail = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await erpApi.getServiceJobDetail(id);
      setJob(res.job);
      setRequest(res.request);
      setProduct(res.product);
      setUpdates(res.updates);
      setMaterialRequests(res.materialRequests);
      setExpenses(res.expenses);
      setBilling(res.billing);
    } catch (e: any) {
      toast('error', 'Failed to load job details', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobDetail();
  }, [id]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.serviceJobCheckIn(job.id, {
        location: checkInLocation || 'Customer Site',
        notes: checkInNotes,
      });
      toast('success', 'Technician Checked In', `Recorded at ${new Date().toLocaleTimeString()}`);
      setCheckInOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Check-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    if (!checkOutForm.resolutionSummary) {
      setErr('Resolution Summary is required.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.serviceJobCheckOut(job.id, checkOutForm);
      toast('success', 'Technician Checked Out', 'Work marked completed.');
      setCheckOutOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Check-out failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.completeServiceJob(job.id, completeForm);
      toast('success', 'Service Job Closed', 'Delivered machinery returned to active status.');
      setCompleteOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Completion failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWorkUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.createServiceWorkUpdate(job.id, {
        stageName: workUpdateForm.stageName,
        hoursSpent: workUpdateForm.hoursSpent,
        highlights: workUpdateForm.highlights,
        checklist: workUpdateForm.checklist,
        findingsNotes: workUpdateForm.findingsNotes,
      });
      toast('success', 'Work Update & Checklist Saved');
      setWorkUpdateOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Failed to save work update.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMaterialRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.createServiceMaterialRequest(job.id, {
        items: spareItems,
      });
      toast('success', 'Spare Parts Indented to Supply Chain');
      setMaterialReqOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Failed to request spare parts.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconcileUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSmr) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.reconcileServiceMaterials(selectedSmr.id, {
        itemsUsage: reconcileUsage,
      });
      toast('success', 'Spare Parts Usage Reconciled');
      setReconcileOpen(false);
      setSelectedSmr(null);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Reconciliation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.createServiceExpense({
        serviceJobId: job.id,
        serviceJobDocNo: job.docNo,
        category: expenseForm.category,
        description: expenseForm.description,
        amount: expenseForm.amount,
        paidBy: expenseForm.paidBy,
      });
      toast('success', 'Expense Claim Submitted');
      setExpenseOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Expense submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.createServiceBilling(job.id, {
        items: billingItems,
        taxPercent: 18,
        discountAmount,
      });
      toast('success', 'Service Billing Generated');
      setBillingOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Billing generation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWorkshopReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.workshopReceiveJob(job.id, {
        ...workshopReceiveForm,
        receivedBy: workshopReceiveForm.receivedBy || user?.name,
      });
      toast('success', 'Machinery Inward Logged at CRYO Workshop');
      setWorkshopReceiveOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Failed to record workshop receipt');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWorkshopReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.workshopReturnJob(job.id, workshopReturnForm);
      toast('success', 'Machinery Return Confirmed to Customer');
      setWorkshopReturnOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Failed to record workshop return');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billing) return;
    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.recordServicePayment(billing.id, paymentForm);
      toast('success', 'Customer Payment Recorded');
      setPaymentModalOpen(false);
      await loadJobDetail();
    } catch (e: any) {
      setErr(e.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadReport = () => {
    if (!job) return;
    erpApi.downloadDocumentPDF('service-report', job.id, `Service_Report_${job.docNo}`);
  };

  if (loading || !job) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading Job Sheet...</div>;
  }

  const tabs = [
    { id: 'overview', label: 'Overview & Diagnosis' },
    { id: 'updates', label: `Work Updates (${updates.length})` },
    { id: 'materials', label: `Spare Parts (${materialRequests.length})` },
    { id: 'expenses', label: `Expenses (${expenses.length})` },
    { id: 'billing', label: 'Billing & Invoice' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/service/jobs')} className="text-xs">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back to Jobs
        </Button>
        <div className="flex items-center gap-2">
          {job.serviceType === 'CRYO Workshop' && job.workshopDetails?.status !== 'Received at Workshop' && job.status !== 'Closed' && (
            <Button size="sm" variant="secondary" onClick={() => setWorkshopReceiveOpen(true)}>
              <Building2 className="w-3.5 h-3.5 mr-1" />
              Workshop Inward
            </Button>
          )}

          {job.serviceType === 'CRYO Workshop' && job.workshopDetails?.status === 'Received at Workshop' && (job.status === 'Work Completed' || job.status === 'In Progress') && can('service', 'confirm') && (
            <Button size="sm" variant="secondary" onClick={() => setWorkshopReturnOpen(true)}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Workshop Return to Customer
            </Button>
          )}

          {(!job.checkIn || Boolean(job.checkOut)) && job.status !== 'Closed' && (
            <Button size="sm" variant="primary" onClick={() => setCheckInOpen(true)}>
              <LogIn className="w-3.5 h-3.5 mr-1" />
              {job.visits && job.visits.length > 0 ? 'Check-In (New Visit)' : 'Technician Check-In'}
            </Button>
          )}

          {job.checkIn && !job.checkOut && (
            <Button size="sm" variant="secondary" onClick={() => setCheckOutOpen(true)}>
              <LogOut className="w-3.5 h-3.5 mr-1" />
              Check-Out & Resolution
            </Button>
          )}

          {(job.status === 'Work Completed' || job.status === 'Billed') && can('service', 'confirm') && (
            <Button size="sm" variant="success" onClick={() => setCompleteOpen(true)}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Mark Closed & Sign-Off
            </Button>
          )}

          <Button size="sm" variant="secondary" onClick={downloadReport}>
            <Download className="w-3.5 h-3.5 mr-1" />
            PDF Service Report
          </Button>
        </div>
      </div>

      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">
                {job.docNo}
              </h2>
              <StatusBadge status={job.status} />
              <StatusBadge status={job.priority} />
              <span className="text-xs text-slate-500 font-medium px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                {job.serviceType}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1">
              Customer: <span className="font-semibold">{job.customerName}</span> • Equipment: <span className="font-semibold">{job.productName}</span> (S/N: <span className="font-mono">{job.serialNumber}</span>)
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
            <div>
              <span className="block text-slate-400 text-[11px]">Assigned Engineer</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{job.assignedTechnicianName}</span>
            </div>
            <div>
              <span className="block text-slate-400 text-[11px]">Scheduled Date</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{job.scheduledDate}</span>
            </div>
            <div>
              <span className="block text-slate-400 text-[11px]">Hours Logged</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{job.totalHoursSpent || 0} hrs</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* TAB 1: OVERVIEW & DIAGNOSIS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer & Machine Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Equipment & Warranty Profile
              </h3>
              <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                <div>
                  <span className="text-slate-500 block">Serial Number</span>
                  <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{job.serialNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Warranty Status</span>
                  <StatusBadge status={product?.warrantyStatus || (request?.isUnderWarranty ? 'Under Warranty' : 'Expired')} />
                </div>
                <div>
                  <span className="text-slate-500 block">Machinery Model</span>
                  <span>{product?.modelNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Warranty End Date</span>
                  <span>{product?.warrantyEndDate || 'N/A'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block">Reported Breakdown Issue</span>
                  <p className="bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-800 mt-1">
                    {request?.issueDescription || 'Cabinet temperature alarm.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Check-In / Check-Out Timestamps */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                On-Site Check-In / Check-Out Logs
              </h3>

              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    <span>Site Check-In</span>
                    <span>{job.checkIn ? new Date(job.checkIn.timestamp).toLocaleString() : 'Pending'}</span>
                  </div>
                  {job.checkIn ? (
                    <div className="text-slate-600 dark:text-slate-400">
                      <div>Location: {job.checkIn.location}</div>
                      <div>Performed by: {job.checkIn.performedBy}</div>
                      {job.checkIn.notes && <div>Notes: {job.checkIn.notes}</div>}
                    </div>
                  ) : (
                    <div className="text-slate-400 italic">Technician has not yet checked in.</div>
                  )}
                </div>

                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    <span>Site Check-Out & Sign-Off</span>
                    <span>{job.checkOut ? new Date(job.checkOut.timestamp).toLocaleString() : 'Pending'}</span>
                  </div>
                  {job.checkOut ? (
                    <div className="text-slate-600 dark:text-slate-400 space-y-1">
                      <div>Resolution: {job.checkOut.resolutionSummary}</div>
                      <div>Customer Rep: {job.checkOut.customerRepresentativeName || 'Signed on site'}</div>
                      <div className="text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Customer Signature Acknowledged
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 italic">Work resolution & check-out pending.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Root Cause & Corrective Action */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Technical Diagnosis & Resolution Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-1">Diagnosis Summary</span>
                <p className="text-slate-600 dark:text-slate-400">{job.diagnosisSummary || 'Awaiting initial diagnostic update.'}</p>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-1">Identified Root Cause</span>
                <p className="text-slate-600 dark:text-slate-400">{job.rootCause || 'Root cause analysis pending.'}</p>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-1">Corrective Action Taken</span>
                <p className="text-slate-600 dark:text-slate-400">{job.correctiveAction || 'Repairs performed as per protocol.'}</p>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-1">Preventive Recommendations</span>
                <p className="text-slate-600 dark:text-slate-400">{job.preventiveAction || 'Maintain clean ambient airflow and monthly condenser dusting.'}</p>
              </div>
            </div>
          </div>

          {/* Workshop Custody Details (CRYO Workshop jobs only) */}
          {job.serviceType === 'CRYO Workshop' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  CRYO Workshop Custody & Overhaul Tracking
                </h3>
                <StatusBadge status={job.workshopDetails?.status || 'Awaiting Workshop Receiving'} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-700 dark:text-slate-300">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 block font-medium">Inward Custody Receiving</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {job.workshopDetails?.receivedDate || 'Pending Inward Log'}
                  </span>
                  {job.workshopDetails?.receivedBy && (
                    <div className="text-[11px] text-slate-500 mt-1">Received by: {job.workshopDetails.receivedBy}</div>
                  )}
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 block font-medium">Receiving Physical Condition</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {job.workshopDetails?.condition || 'Awaiting initial physical inspection'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 block font-medium">Outward Return Handover</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {job.workshopDetails?.returnDate || 'Pending overhaul completion'}
                  </span>
                  {job.workshopDetails?.returnStatus && (
                    <div className="text-[11px] text-emerald-600 font-medium mt-1">{job.workshopDetails.returnStatus}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Technician Multi-Visit Tracking History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Technician Field Visits & Duration Log ({job.visits?.length || 0})
              </h3>
              {job.totalDurationMinutes !== undefined && job.totalDurationMinutes > 0 && (
                <span className="px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-semibold font-mono text-[11px]">
                  Total On-Site Duration: {Math.floor(job.totalDurationMinutes / 60)}h {job.totalDurationMinutes % 60}m
                </span>
              )}
            </div>

            {job.visits && job.visits.length > 0 ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2.5">Visit #</th>
                      <th className="p-2.5">Technician</th>
                      <th className="p-2.5">Check-In Time</th>
                      <th className="p-2.5">Check-Out Time</th>
                      <th className="p-2.5 text-right">Duration</th>
                      <th className="p-2.5">Visit Work Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {job.visits.map((v, i) => (
                      <tr key={i}>
                        <td className="p-2.5 font-bold font-mono text-teal-600">Visit #{v.visitNumber || i + 1}</td>
                        <td className="p-2.5 font-medium">{v.technicianName}</td>
                        <td className="p-2.5 font-mono text-slate-500">{new Date(v.checkInTime).toLocaleString()}</td>
                        <td className="p-2.5 font-mono text-slate-500">
                          {v.checkOutTime ? new Date(v.checkOutTime).toLocaleString() : 'In Progress'}
                        </td>
                        <td className="p-2.5 text-right font-semibold">
                          {v.durationMinutes !== undefined ? `${v.durationMinutes} min` : '-'}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-400">{v.workSummary || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-slate-400 italic p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                {job.checkIn && !job.checkOut
                  ? `Active visit in progress (Checked in at ${new Date(job.checkIn.timestamp).toLocaleTimeString()}).`
                  : 'No field visits completed yet.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: WORK UPDATES & CHECKLIST */}
      {activeTab === 'updates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Daily Technical Work Logs & Inspection Checklists
            </h3>
            <Button size="sm" onClick={() => setWorkUpdateOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Work Update & Checklist
            </Button>
          </div>

          {!updates.length ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              No daily service work updates logged yet. Click &quot;Add Work Update &amp; Checklist&quot; to record activities.
            </div>
          ) : (
            <div className="space-y-4">
              {updates.map((up) => (
                <div
                  key={up.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {up.stageName}
                      </span>
                      <span className="text-slate-500 ml-2">by {up.technicianName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>Date: {up.date}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {up.hoursSpent} hrs
                      </span>
                    </div>
                  </div>

                  {/* Highlights */}
                  {up.highlights && up.highlights.length > 0 && (
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Work Highlights:
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-400">
                        {up.highlights.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Checklist */}
                  {up.checklist && up.checklist.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <span className="font-semibold text-slate-700 dark:text-slate-300 block">
                        Inspection Checklist Results:
                      </span>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="p-2">Inspection Item</th>
                              <th className="p-2 w-28">Result</th>
                              <th className="p-2">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {up.checklist.map((chk) => (
                              <tr key={chk.id}>
                                <td className="p-2 text-slate-800 dark:text-slate-200">{chk.item}</td>
                                <td className="p-2">
                                  <StatusBadge status={chk.result} />
                                </td>
                                <td className="p-2 text-slate-500">{chk.remarks || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SPARE PARTS REQUISITION */}
      {activeTab === 'materials' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Spare Parts Indents & Requisitions
            </h3>
            <Button size="sm" onClick={() => setMaterialReqOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Indent Spare Parts
            </Button>
          </div>

          {!materialRequests.length ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              No spare parts indented for this job sheet.
            </div>
          ) : (
            <div className="space-y-4">
              {materialRequests.map((smr) => (
                <div
                  key={smr.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {smr.docNo}
                      </span>
                      <StatusBadge status={smr.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      {smr.status === 'Issued' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            await erpApi.receiveServiceMaterials(smr.id);
                            toast('success', 'Physical Receipt Confirmed');
                            await loadJobDetail();
                          }}
                        >
                          Acknowledge Physical Receipt
                        </Button>
                      )}
                      {smr.status === 'Received' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setSelectedSmr(smr);
                            setReconcileUsage(
                              smr.items.map((i) => ({ quantityUsed: i.quantityRequested, quantityReturned: 0 })),
                            );
                            setReconcileOpen(true);
                          }}
                        >
                          Reconcile Used &amp; Returned
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="p-2">Spare Part Name</th>
                          <th className="p-2 w-24 text-right">Requested</th>
                          <th className="p-2 w-24 text-right">Issued</th>
                          <th className="p-2 w-24 text-right">Used</th>
                          <th className="p-2 w-24 text-right">Returned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {smr.items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-medium text-slate-800 dark:text-slate-200">{it.materialName}</td>
                            <td className="p-2 text-right">{it.quantityRequested} {it.unit}</td>
                            <td className="p-2 text-right">{it.quantityIssued} {it.unit}</td>
                            <td className="p-2 text-right font-semibold text-emerald-600">{it.quantityUsed} {it.unit}</td>
                            <td className="p-2 text-right text-slate-500">{it.quantityReturned} {it.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EXPENSES & ADVANCES */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Technician Field Expenses & Out-of-Pocket Claims
            </h3>
            <Button size="sm" onClick={() => setExpenseOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Log Field Expense
            </Button>
          </div>

          {!expenses.length ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              No field travel or lodging expenses logged for this job sheet.
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Expense #</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Paid By</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {expenses.map((exp) => (
                    <tr key={exp.id}>
                      <td className="p-3 font-mono font-medium text-slate-900 dark:text-slate-100">{exp.docNo}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{exp.date}</td>
                      <td className="p-3 font-medium text-slate-800 dark:text-slate-200">{exp.category}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{exp.description}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{exp.paidBy}</td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(exp.amount)}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={exp.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: BILLING & INVOICE */}
      {activeTab === 'billing' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Service Billing & Commercial Invoicing
            </h3>
            {!billing && (
              <Button
                size="sm"
                onClick={() => {
                  setBillingItems([
                    {
                      description: 'On-site technical troubleshooting and calibration service',
                      itemType: 'Labor',
                      quantity: 1,
                      unitPrice: request?.isUnderWarranty ? 0 : 2500,
                      totalPrice: request?.isUnderWarranty ? 0 : 2500,
                      isWarrantyCovered: Boolean(request?.isUnderWarranty),
                    },
                  ]);
                  setBillingOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Generate Service Invoice
              </Button>
            )}
          </div>

          {billing ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                    {billing.docNo}
                  </span>
                  <div className="text-slate-500">Billing Date: {billing.billingDate}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={billing.paymentStatus} />
                  {billing.paymentStatus !== 'Paid' && (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => {
                        const due = billing.outstandingAmount !== undefined ? billing.outstandingAmount : Math.max(0, billing.grandTotal - (billing.paidAmount || 0));
                        setPaymentForm({
                          amount: due,
                          paymentMode: 'Bank Transfer',
                          referenceDocNo: '',
                          notes: 'Service invoice settlement payment',
                        });
                        setPaymentModalOpen(true);
                      }}
                    >
                      <CreditCard className="w-3.5 h-3.5 mr-1" />
                      Record Customer Payment
                    </Button>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2.5">Item Description</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5 text-right">Qty</th>
                      <th className="p-2.5 text-right">Rate</th>
                      <th className="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {billing.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">
                          {it.description}
                          {it.isWarrantyCovered && (
                            <span className="ml-2 text-[10px] text-emerald-600 font-semibold">
                              (Under Warranty)
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-500">{it.itemType}</td>
                        <td className="p-2.5 text-right">{it.quantity}</td>
                        <td className="p-2.5 text-right">{formatCurrency(it.unitPrice)}</td>
                        <td className="p-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(it.totalPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <div className="w-72 space-y-1.5 text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-medium">{formatCurrency(billing.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST ({billing.taxPercent}%):</span>
                    <span className="font-medium">{formatCurrency(billing.taxAmount)}</span>
                  </div>
                  {Boolean(billing.discountAmount) && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount Given:</span>
                      <span className="font-medium">-{formatCurrency(billing.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-slate-100 pt-1.5 border-t border-slate-200 dark:border-slate-800">
                    <span>Grand Total:</span>
                    <span>{formatCurrency(billing.grandTotal)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-semibold pt-1">
                    <span>Amount Paid:</span>
                    <span>{formatCurrency(billing.paidAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600 font-bold pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span>Balance Outstanding:</span>
                    <span>
                      {formatCurrency(
                        billing.outstandingAmount !== undefined
                          ? billing.outstandingAmount
                          : Math.max(0, billing.grandTotal - (billing.paidAmount || 0)),
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              No service invoice generated yet. For warranty services, a complimentary ₹0 voucher can be generated.
            </div>
          )}
        </div>
      )}

      {/* Check-In Modal */}
      <Modal open={checkInOpen} onClose={() => setCheckInOpen(false)} title="Technician Site Check-In">
        <form onSubmit={handleCheckIn} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <Field label="Check-In Location / Customer Site" required>
            <Input
              value={checkInLocation}
              onChange={(e) => setCheckInLocation(e.target.value)}
              placeholder="e.g. Biogenix Diagnostic Central Lab 3"
              required
            />
          </Field>
          <Field label="Initial Arrival Notes">
            <Textarea
              value={checkInNotes}
              onChange={(e) => setCheckInNotes(e.target.value)}
              placeholder="Arrived on schedule. Commencing sensor and thermal inspection..."
              rows={2}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setCheckInOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Confirm Check-In
            </Button>
          </div>
        </form>
      </Modal>

      {/* Check-Out Modal */}
      <Modal open={checkOutOpen} onClose={() => setCheckOutOpen(false)} title="Technician Site Check-Out & Resolution" size="lg">
        <form onSubmit={handleCheckOut} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <Field label="Work Resolution Summary" required>
            <Textarea
              value={checkOutForm.resolutionSummary}
              onChange={(e) => setCheckOutForm({ ...checkOutForm, resolutionSummary: e.target.value })}
              placeholder="Summarize the repair work done and confirmed operating state..."
              rows={2}
              required
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Root Cause Analysis">
              <Input
                value={checkOutForm.rootCause}
                onChange={(e) => setCheckOutForm({ ...checkOutForm, rootCause: e.target.value })}
                placeholder="e.g. Condenser coil dust clogging"
              />
            </Field>
            <Field label="Corrective Action Taken">
              <Input
                value={checkOutForm.correctiveAction}
                onChange={(e) => setCheckOutForm({ ...checkOutForm, correctiveAction: e.target.value })}
                placeholder="e.g. Cleaned coil, replaced filter drier, calibrated probe"
              />
            </Field>
          </div>
          <Field label="Customer Representative Name (Sign-off)">
            <Input
              value={checkOutForm.customerRepresentativeName}
              onChange={(e) => setCheckOutForm({ ...checkOutForm, customerRepresentativeName: e.target.value })}
              placeholder="Customer representative who witnessed sign-off..."
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setCheckOutOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Submit Check-Out
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Work Update Modal */}
      <Modal open={workUpdateOpen} onClose={() => setWorkUpdateOpen(false)} title="Log Technical Work Update & Checklist" size="lg">
        <form onSubmit={handleWorkUpdate} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Work Stage / Activity" required>
              <Input
                value={workUpdateForm.stageName}
                onChange={(e) => setWorkUpdateForm({ ...workUpdateForm, stageName: e.target.value })}
                required
              />
            </Field>
            <Field label="Hours Spent" required>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={workUpdateForm.hoursSpent}
                onChange={(e) => setWorkUpdateForm({ ...workUpdateForm, hoursSpent: Number(e.target.value) })}
                required
              />
            </Field>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Inspection Checklist (Dynamic Evaluation)
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {workUpdateForm.checklist.map((chk, idx) => (
                <div key={chk.id} className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-800 dark:text-slate-200 flex-1">{chk.item}</span>
                  <Select
                    value={chk.result}
                    onChange={(e) => {
                      const next = [...workUpdateForm.checklist];
                      next[idx].result = e.target.value as any;
                      setWorkUpdateForm({ ...workUpdateForm, checklist: next });
                    }}
                    className="w-28 text-xs py-1"
                  >
                    <option value="Pass">Pass</option>
                    <option value="Fail">Fail</option>
                    <option value="Pending">Pending</option>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setWorkUpdateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save Work Update
            </Button>
          </div>
        </form>
      </Modal>

      {/* Indent Spare Parts Modal */}
      <Modal open={materialReqOpen} onClose={() => setMaterialReqOpen(false)} title="Indent Spare Parts to Supply Chain" size="lg">
        <form onSubmit={handleMaterialRequest} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="space-y-3">
            {spareItems.map((sp, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6">
                  <Input
                    placeholder="Spare Part Name..."
                    value={sp.materialName}
                    onChange={(e) => {
                      const next = [...spareItems];
                      next[idx].materialName = e.target.value;
                      setSpareItems(next);
                    }}
                    required
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={sp.quantityRequested}
                    onChange={(e) => {
                      const next = [...spareItems];
                      next[idx].quantityRequested = Number(e.target.value);
                      setSpareItems(next);
                    }}
                    required
                  />
                </div>
                <div className="col-span-3 flex items-center gap-1">
                  <Input
                    type="number"
                    placeholder="Est Unit Cost"
                    value={sp.unitCost}
                    onChange={(e) => {
                      const next = [...spareItems];
                      next[idx].unitCost = Number(e.target.value);
                      setSpareItems(next);
                    }}
                  />
                  {spareItems.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSpareItems(spareItems.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setSpareItems([...spareItems, { materialName: '', quantityRequested: 1, unit: 'Nos', unitCost: 0 }])}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Another Spare
          </Button>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setMaterialReqOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Submit Indent
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reconcile Modal */}
      <Modal open={reconcileOpen} onClose={() => setReconcileOpen(false)} title="Reconcile Spare Parts Usage">
        <form onSubmit={handleReconcileUsage} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="space-y-3 text-xs">
            {selectedSmr?.items.map((it, idx) => (
              <div key={idx} className="p-3 border border-slate-200 dark:border-slate-800 rounded-md space-y-2">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                  {it.materialName} (Issued: {it.quantityIssued} {it.unit})
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Qty Consumed / Used">
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
                  <Field label="Qty Returned to Store">
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

      {/* Log Expense Modal */}
      <Modal open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Log Field Service Expense">
        <form onSubmit={handleExpense} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Category" required>
              <Select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as any })}
              >
                <option value="Travel">Travel (Bus / Train / Flight)</option>
                <option value="Local Transport">Local Transport (Taxi / Auto / Fuel)</option>
                <option value="Lodging">Hotel / Lodging</option>
                <option value="Food">Food &amp; Meals</option>
                <option value="Tools/Hardware">Hardware / Consumables</option>
                <option value="Other">Other Miscellaneous</option>
              </Select>
            </Field>

            <Field label="Paid By" required>
              <Select
                value={expenseForm.paidBy}
                onChange={(e) => setExpenseForm({ ...expenseForm, paidBy: e.target.value as any })}
              >
                <option value="Technician">Technician Out-of-Pocket (Reimbursable)</option>
                <option value="Company">Company Prepaid Card / Corporate</option>
              </Select>
            </Field>
          </div>

          <Field label="Amount (₹)" required>
            <Input
              type="number"
              min="1"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
              required
            />
          </Field>

          <Field label="Description" required>
            <Input
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              placeholder="e.g. Metro rail tickets and local auto fares"
              required
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setExpenseOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Submit Expense Claim
            </Button>
          </div>
        </form>
      </Modal>

      {/* Close Service Job Modal */}
      <Modal open={completeOpen} onClose={() => setCompleteOpen(false)} title="Close Service Job & Customer Sign-Off">
        <form onSubmit={handleCompleteJob} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <Field label="Final Equipment Operational Condition" required>
            <Input
              value={completeForm.finalProductCondition}
              onChange={(e) => setCompleteForm({ ...completeForm, finalProductCondition: e.target.value })}
              placeholder="e.g. Normal Operational Status / Tested to -86°C"
              required
            />
          </Field>
          <Field label="Work Resolution & Completion Summary" required>
            <Textarea
              value={completeForm.completionSummary}
              onChange={(e) => setCompleteForm({ ...completeForm, completionSummary: e.target.value })}
              rows={2}
              placeholder="Summary of all repairs, parts replaced, and customer sign-off..."
              required
            />
          </Field>
          <Field label="Customer Satisfaction Score (1 to 5)">
            <Select
              value={completeForm.customerFeedbackScore}
              onChange={(e) => setCompleteForm({ ...completeForm, customerFeedbackScore: Number(e.target.value) })}
            >
              <option value={5}>5 - Excellent (Prompt & Restored Perfectly)</option>
              <option value={4}>4 - Good</option>
              <option value={3}>3 - Satisfactory</option>
              <option value={2}>2 - Poor</option>
              <option value={1}>1 - Unsatisfactory</option>
            </Select>
          </Field>
          <Field label="Customer Feedback Notes">
            <Textarea
              value={completeForm.customerFeedbackNotes}
              onChange={(e) => setCompleteForm({ ...completeForm, customerFeedbackNotes: e.target.value })}
              rows={2}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" loading={submitting}>
              Confirm Job Completion & Close
            </Button>
          </div>
        </form>
      </Modal>

      {/* Generate Billing Modal */}
      <Modal open={billingOpen} onClose={() => setBillingOpen(false)} title="Generate Service Billing" size="lg">
        <form onSubmit={handleCreateBilling} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="space-y-3">
            {billingItems.map((b, idx) => (
              <div key={idx} className="p-3 border border-slate-200 dark:border-slate-800 rounded-md space-y-2">
                <Field label="Item Description">
                  <Input
                    value={b.description}
                    onChange={(e) => {
                      const next = [...billingItems];
                      next[idx].description = e.target.value;
                      setBillingItems(next);
                    }}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Item Type">
                    <Select
                      value={b.itemType}
                      onChange={(e) => {
                        const next = [...billingItems];
                        next[idx].itemType = e.target.value;
                        setBillingItems(next);
                      }}
                    >
                      <option value="Labor">Labor</option>
                      <option value="Spare">Spare</option>
                      <option value="Travel">Travel</option>
                      <option value="Other">Other</option>
                    </Select>
                  </Field>
                  <Field label="Price (₹)">
                    <Input
                      type="number"
                      value={b.unitPrice}
                      onChange={(e) => {
                        const next = [...billingItems];
                        const price = Number(e.target.value);
                        next[idx].unitPrice = price;
                        next[idx].totalPrice = price * next[idx].quantity;
                        setBillingItems(next);
                      }}
                    />
                  </Field>
                  <Field label="Warranty Covered?">
                    <Select
                      value={b.isWarrantyCovered ? 'yes' : 'no'}
                      onChange={(e) => {
                        const next = [...billingItems];
                        next[idx].isWarrantyCovered = e.target.value === 'yes';
                        setBillingItems(next);
                      }}
                    >
                      <option value="no">Chargeable</option>
                      <option value="yes">Warranty Covered (₹0)</option>
                    </Select>
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <Field label="Commercial Discount (₹)">
            <Input
              type="number"
              min="0"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value))}
              placeholder="e.g. 500"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setBillingOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Generate Invoice
            </Button>
          </div>
        </form>
      </Modal>

      {/* Workshop Receive Modal */}
      <Modal open={workshopReceiveOpen} onClose={() => setWorkshopReceiveOpen(false)} title="CRYO Workshop Machinery Inward Custody">
        <form onSubmit={handleWorkshopReceive} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inward Receiving Date" required>
              <Input
                type="date"
                value={workshopReceiveForm.receivedDate}
                onChange={(e) => setWorkshopReceiveForm({ ...workshopReceiveForm, receivedDate: e.target.value })}
                required
              />
            </Field>
            <Field label="Received By Officer" required>
              <Input
                value={workshopReceiveForm.receivedBy || user?.name || ''}
                onChange={(e) => setWorkshopReceiveForm({ ...workshopReceiveForm, receivedBy: e.target.value })}
                required
              />
            </Field>
          </div>
          <Field label="Physical Condition at Receiving" required>
            <Textarea
              value={workshopReceiveForm.condition}
              onChange={(e) => setWorkshopReceiveForm({ ...workshopReceiveForm, condition: e.target.value })}
              rows={2}
              required
            />
          </Field>
          <Field label="Intake Notes / Accessories Received">
            <Input
              value={workshopReceiveForm.notes}
              onChange={(e) => setWorkshopReceiveForm({ ...workshopReceiveForm, notes: e.target.value })}
              placeholder="e.g. Cables, power transformer, master key included"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setWorkshopReceiveOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Confirm Inward Receipt
            </Button>
          </div>
        </form>
      </Modal>

      {/* Workshop Return Modal */}
      <Modal open={workshopReturnOpen} onClose={() => setWorkshopReturnOpen(false)} title="CRYO Workshop Handover to Customer">
        <form onSubmit={handleWorkshopReturn} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Outward Return Date" required>
              <Input
                type="date"
                value={workshopReturnForm.returnDate}
                onChange={(e) => setWorkshopReturnForm({ ...workshopReturnForm, returnDate: e.target.value })}
                required
              />
            </Field>
            <Field label="Return Operational Status" required>
              <Input
                value={workshopReturnForm.returnStatus}
                onChange={(e) => setWorkshopReturnForm({ ...workshopReturnForm, returnStatus: e.target.value })}
                required
              />
            </Field>
          </div>
          <Field label="Return Verification / Customer Acknowledgement Notes">
            <Textarea
              value={workshopReturnForm.notes}
              onChange={(e) => setWorkshopReturnForm({ ...workshopReturnForm, notes: e.target.value })}
              rows={2}
              placeholder="e.g. Tested at -86°C over 48h before client handover"
            />
          </Field>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={workshopReturnForm.customerConfirmation}
              onChange={(e) => setWorkshopReturnForm({ ...workshopReturnForm, customerConfirmation: e.target.checked })}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Customer has confirmed safe receipt of machinery
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setWorkshopReturnOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" loading={submitting}>
              Confirm Customer Return Handover
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} title={`Record Payment for ${billing?.docNo}`}>
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {err && <ErrorBanner message={err} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment Amount (₹)" required>
              <Input
                type="number"
                min="1"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="Payment Mode" required>
              <Select
                value={paymentForm.paymentMode}
                onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
              >
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="UPI">UPI Payment</option>
                <option value="Cheque">Corporate Cheque</option>
                <option value="Cash">Cash Handover</option>
              </Select>
            </Field>
          </div>
          <Field label="Bank Reference / Cheque / UTR #">
            <Input
              value={paymentForm.referenceDocNo}
              onChange={(e) => setPaymentForm({ ...paymentForm, referenceDocNo: e.target.value })}
              placeholder="e.g. UTR-9823419082"
            />
          </Field>
          <Field label="Payment Notes">
            <Input
              value={paymentForm.notes}
              onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              placeholder="e.g. Cleared via HDFC Bank"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" loading={submitting}>
              Save Payment Entry
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
