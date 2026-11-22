import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle, Plus, ShieldAlert, ShieldCheck, Wrench } from 'lucide-react';
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
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import type { DeliveredProduct, ServiceRequest } from '../../types/erp';

export const ServiceRequestsPage: React.FC = () => {
  const { data, refresh, toast, can } = useERP();
  const navigate = useNavigate();
  const location = useLocation();

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [deliveredProducts, setDeliveredProducts] = useState<DeliveredProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);

  // Forms
  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    serviceAddress: '',
    deliveredProductId: '',
    serialNumber: '',
    productName: '',
    modelNumber: '',
    serviceType: 'Customer Site',
    priority: 'Medium',
    issueDescription: '',
    isUnderWarranty: true,
    warrantyRemarks: '',
  });

  const [assignForm, setAssignForm] = useState({
    assignedTechnicianId: '',
    assignedTechnicianName: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '10:00 AM',
    instructions: '',
    serviceType: 'Customer Site',
    priority: 'Medium',
  });

  const [warrantyForm, setWarrantyForm] = useState({
    isUnderWarranty: true,
    warrantyClaimValid: true,
    warrantyRemarks: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reqs, dps] = await Promise.all([
        erpApi.getServiceRequests(),
        erpApi.getDeliveredProducts(),
      ]);
      setRequests(reqs);
      setDeliveredProducts(dps);
    } catch (e: any) {
      toast('error', 'Failed to load service requests', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Pre-fill from query parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('create') === '1') {
      setCreateOpen(true);
      const serial = params.get('serial');
      if (serial && deliveredProducts.length > 0) {
        const dp = deliveredProducts.find((p) => p.serialNumber.toLowerCase() === serial.toLowerCase());
        if (dp) {
          setForm((prev) => ({
            ...prev,
            customerId: dp.customerId,
            customerName: dp.customerName,
            contactPerson: dp.customerContact || '',
            contactPhone: dp.customerPhone || '',
            contactEmail: dp.customerEmail || '',
            serviceAddress: dp.deliveryAddress || '',
            deliveredProductId: dp.id,
            serialNumber: dp.serialNumber,
            productName: dp.productName,
            modelNumber: dp.modelNumber || '',
            isUnderWarranty: dp.warrantyStatus === 'Under Warranty',
            warrantyRemarks: dp.warrantyStatus === 'Under Warranty' ? 'Valid manufacturer warranty' : 'Warranty expired',
          }));
        }
      }
    }
  }, [location.search, deliveredProducts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      const matchSearch =
        !q ||
        r.docNo.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.serialNumber.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'All' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [requests, search, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.issueDescription) {
      setErr('Customer and Issue Description are mandatory.');
      return;
    }

    setSubmitting(true);
    setErr(null);
    try {
      const created = await erpApi.createServiceRequest(form);
      toast('success', 'Service Request Registered', created.docNo);
      setCreateOpen(false);
      setForm({
        customerId: '',
        customerName: '',
        contactPerson: '',
        contactPhone: '',
        contactEmail: '',
        serviceAddress: '',
        deliveredProductId: '',
        serialNumber: '',
        productName: '',
        modelNumber: '',
        serviceType: 'Customer Site',
        priority: 'Medium',
        issueDescription: '',
        isUnderWarranty: true,
        warrantyRemarks: '',
      });
      await loadData();
      await refresh();
    } catch (e: any) {
      setErr(e.message || 'Failed to create service request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !assignForm.assignedTechnicianId) {
      setErr('Technician selection is mandatory.');
      return;
    }

    setSubmitting(true);
    setErr(null);
    try {
      const res = await erpApi.assignTechnicianJob(selectedRequest.id, assignForm);
      toast('success', 'Technician Dispatched', `Job Sheet ${res.serviceJob.docNo} generated.`);
      setAssignOpen(false);
      setSelectedRequest(null);
      await loadData();
      await refresh();
    } catch (e: any) {
      setErr(e.message || 'Failed to assign technician.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWarrantyUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.checkWarrantyClaim(selectedRequest.id, warrantyForm);
      toast('success', 'Warranty Claim Reviewed', selectedRequest.docNo);
      setWarrantyOpen(false);
      setSelectedRequest(null);
      await loadData();
      await refresh();
    } catch (e: any) {
      setErr(e.message || 'Failed to update warranty claim.');
    } finally {
      setSubmitting(false);
    }
  };

  const technicians = useMemo(() => {
    return (data?.employees || []).filter(
      (e) =>
        e.status === 'Active' &&
        (e.department === 'service' ||
          e.designation.toLowerCase().includes('technician') ||
          e.designation.toLowerCase().includes('engineer')),
    );
  }, [data?.employees]);

  const columns: ColumnDef<ServiceRequest>[] = [
    {
      key: 'docNo',
      header: 'Request ID',
      sortable: true,
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900 dark:text-slate-100 font-mono text-xs">
            {r.docNo}
          </span>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{r.requestDate}</div>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer & Machine',
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{r.customerName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {r.productName} • <span className="font-mono">{r.serialNumber}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'serviceType',
      header: 'Mode / Priority',
      sortable: true,
      render: (r) => (
        <div className="space-y-1">
          <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">{r.serviceType}</div>
          <StatusBadge status={r.priority} />
        </div>
      ),
    },
    {
      key: 'warranty',
      header: 'Warranty Status',
      sortable: true,
      render: (r) => (
        <div>
          <StatusBadge status={r.isUnderWarranty ? 'Under Warranty' : 'Expired'} />
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate max-w-xs">
            {r.warrantyRemarks || (r.isUnderWarranty ? 'Covered' : 'Chargeable')}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Ticket Status',
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {r.assignedJobId ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(`/service/jobs/${r.assignedJobId}`)}
              className="text-xs"
            >
              <Wrench className="w-3.5 h-3.5 mr-1" />
              Job Sheet
            </Button>
          ) : (
            can('service', 'edit') && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setSelectedRequest(r);
                  setAssignForm({
                    assignedTechnicianId: '',
                    assignedTechnicianName: '',
                    scheduledDate: new Date().toISOString().split('T')[0],
                    scheduledTime: '10:00 AM',
                    instructions: '',
                    serviceType: r.serviceType,
                    priority: r.priority,
                  });
                  setAssignOpen(true);
                }}
                className="text-xs"
              >
                <CalendarClock className="w-3.5 h-3.5 mr-1" />
                Assign Tech
              </Button>
            )
          )}
          {can('service', 'verify') && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedRequest(r);
                setWarrantyForm({
                  isUnderWarranty: r.isUnderWarranty,
                  warrantyClaimValid: r.warrantyClaimValid,
                  warrantyRemarks: r.warrantyRemarks || '',
                });
                setWarrantyOpen(true);
              }}
              className="text-xs"
            >
              Warranty
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Requests & Breakdown Tickets"
        description="Log customer equipment breakdown tickets, review warranty coverage claims, and assign field technicians."
        breadcrumbs={[{ label: 'Service', path: '/service' }, { label: 'Service Requests' }]}
        actions={
          can('service', 'create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              New Service Request
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by request #, customer, machinery, or serial number..."
        statuses={['All', 'Open', 'Assigned', 'In Progress', 'Completed']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyTitle="No Service Requests"
        emptyDescription="Customer tickets and scheduled maintenance requests will appear here."
      />

      {/* Create Service Request Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Service Request"
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {err && <ErrorBanner message={err} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Customer Account" required>
              <Select
                value={form.customerId}
                onChange={(e) => {
                  const custId = e.target.value;
                  const cust = data?.customers.find((c) => c.id === custId);
                  setForm((prev) => ({
                    ...prev,
                    customerId: custId,
                    customerName: cust?.name || '',
                    contactPerson: cust?.contactPerson || '',
                    contactPhone: cust?.phone || '',
                    contactEmail: cust?.email || '',
                    serviceAddress: cust?.shippingAddress || cust?.billingAddress || '',
                    // Clear previously selected machinery when customer changes
                    deliveredProductId: '',
                    serialNumber: '',
                    productName: '',
                    modelNumber: '',
                    isUnderWarranty: true,
                    warrantyRemarks: '',
                  }));
                }}
                required
              >
                <option value="">Select Customer...</option>
                {data?.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Delivered Machinery (Serial #)">
              <Select
                value={form.deliveredProductId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'custom') {
                    // Unverified / Legacy Machinery manual mode
                    setForm((prev) => ({
                      ...prev,
                      deliveredProductId: '',
                      serialNumber: '',
                      productName: '',
                      modelNumber: '',
                      isUnderWarranty: false,
                      warrantyRemarks: 'Legacy / Unverified Third-Party Machinery (Non-Warranty)',
                    }));
                    return;
                  }
                  const dp = deliveredProducts.find((p) => p.id === val);
                  if (dp) {
                    setForm((prev) => ({
                      ...prev,
                      deliveredProductId: dp.id,
                      serialNumber: dp.serialNumber,
                      productName: dp.productName,
                      modelNumber: dp.modelNumber || '',
                      customerId: dp.customerId,
                      customerName: dp.customerName,
                      contactPerson: dp.customerContact || prev.contactPerson,
                      contactPhone: dp.customerPhone || prev.contactPhone,
                      contactEmail: dp.customerEmail || prev.contactEmail,
                      serviceAddress: dp.deliveryAddress || prev.serviceAddress,
                      isUnderWarranty: dp.warrantyStatus === 'Under Warranty',
                      warrantyRemarks: dp.warrantyStatus === 'Under Warranty' ? 'Valid manufacturer warranty' : 'Warranty expired',
                    }));
                  }
                }}
              >
                <option value="">Select Deployed Equipment...</option>
                <option value="custom">-- Unverified / Legacy Machinery (Manual Entry) --</option>
                {deliveredProducts
                  .filter((p) => !form.customerId || p.customerId === form.customerId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.serialNumber} - {p.productName} ({p.customerName})
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Machinery Name">
              <Input
                placeholder="Equipment name..."
                value={form.productName}
                onChange={(e) => setForm({ ...form, productName: e.target.value })}
              />
            </Field>

            <Field label="Serial Number">
              <Input
                placeholder="Serial number or tag..."
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
              />
            </Field>

            <Field label="Service Location Mode">
              <Select
                value={form.serviceType}
                onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
              >
                <option value="Customer Site">Customer Site Service</option>
                <option value="CRYO Workshop">CRYO Factory / Workshop Service</option>
              </Select>
            </Field>

            <Field label="Ticket Priority">
              <Select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="Low">Low (Routine Check)</option>
                <option value="Medium">Medium (Minor Issue)</option>
                <option value="High">High (Alarm / Temp Drift)</option>
                <option value="Urgent">Urgent (Complete Breakdown)</option>
              </Select>
            </Field>
          </div>

          <Field label="Customer Site Service Address">
            <Input
              value={form.serviceAddress}
              onChange={(e) => setForm({ ...form, serviceAddress: e.target.value })}
              placeholder="Full address where service engineer will visit..."
            />
          </Field>

          <Field label="Issue Description / Breakdown Details" required>
            <Textarea
              value={form.issueDescription}
              onChange={(e) => setForm({ ...form, issueDescription: e.target.value })}
              placeholder="Describe symptoms, alarms sounding, temperature fluctuations, or failure mode..."
              rows={3}
              required
            />
          </Field>

          <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs space-y-1">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Warranty Classification Preview:
            </span>
            <div className="flex items-center gap-2">
              <StatusBadge status={form.isUnderWarranty ? 'Under Warranty' : 'Expired'} />
              <span className="text-slate-600 dark:text-slate-400">
                {form.warrantyRemarks || (form.isUnderWarranty ? 'Eligible for complimentary warranty service.' : 'Chargeable service quotation applies.')}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Submit Service Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* Assign Technician Modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Assign Technician & Schedule: ${selectedRequest?.docNo}`}
      >
        <form onSubmit={handleAssign} className="space-y-4">
          {err && <ErrorBanner message={err} />}

          <Field label="Field Service Technician" required>
            <Select
              value={assignForm.assignedTechnicianId}
              onChange={(e) => {
                const emp = technicians.find((t) => t.id === e.target.value);
                setAssignForm({
                  ...assignForm,
                  assignedTechnicianId: e.target.value,
                  assignedTechnicianName: emp?.name || '',
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Scheduled Date" required>
              <Input
                type="date"
                value={assignForm.scheduledDate}
                onChange={(e) => setAssignForm({ ...assignForm, scheduledDate: e.target.value })}
                required
              />
            </Field>
            <Field label="Scheduled Time">
              <Input
                placeholder="e.g. 10:00 AM"
                value={assignForm.scheduledTime}
                onChange={(e) => setAssignForm({ ...assignForm, scheduledTime: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Service Location Mode">
            <Select
              value={assignForm.serviceType}
              onChange={(e) => setAssignForm({ ...assignForm, serviceType: e.target.value })}
            >
              <option value="Customer Site">Customer Site Service</option>
              <option value="CRYO Workshop">CRYO Factory / Workshop Service</option>
            </Select>
          </Field>

          <Field label="Field Instructions & Site Precautions">
            <Input
              placeholder="e.g. Inspect refrigerant pressure and bring vacuum pump..."
              value={assignForm.instructions}
              onChange={(e) => setAssignForm({ ...assignForm, instructions: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Dispatch Technician
            </Button>
          </div>
        </form>
      </Modal>

      {/* Warranty Review Modal */}
      <Modal
        open={warrantyOpen}
        onClose={() => setWarrantyOpen(false)}
        title={`Review Warranty Claim: ${selectedRequest?.docNo}`}
      >
        <form onSubmit={handleWarrantyUpdate} className="space-y-4">
          {err && <ErrorBanner message={err} />}

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={warrantyForm.isUnderWarranty}
                onChange={(e) => setWarrantyForm({ ...warrantyForm, isUnderWarranty: e.target.checked })}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Equipment is within warranty period
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={warrantyForm.warrantyClaimValid}
                onChange={(e) => setWarrantyForm({ ...warrantyForm, warrantyClaimValid: e.target.checked })}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Warranty claim is valid (no customer misuse or environmental breach)
            </label>
          </div>

          <Field label="Warranty Review Remarks">
            <Textarea
              value={warrantyForm.warrantyRemarks}
              onChange={(e) => setWarrantyForm({ ...warrantyForm, warrantyRemarks: e.target.value })}
              placeholder="e.g. Approved under 24M comprehensive warranty. Compressor and parts covered at no charge."
              rows={3}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setWarrantyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save Warranty Determination
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
