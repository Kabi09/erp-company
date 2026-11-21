import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  MapPin,
  PackageCheck,
  Phone,
  Printer,
  RotateCcw,
  Send,
  Truck,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import {
  Button,
  DataTable,
  Field,
  FileUploadInput,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
  type ColumnDef,
} from '../../components/ui';
import { DocumentPreviewModal, type DocUnion } from '../../components/DocumentPreviewModal';
import { formatDate, getAvailableDispatchQty } from '../../utils/erpLogic';
import type { DeliveryIssue, DeliveryIssueType, DeliveryIssueResolution, DeliveryOrder, ProductionOrder } from '../../types/erp';

// ==========================================
// 1. LOGISTICS DASHBOARD
// ==========================================

export const LogisticsDashboard: React.FC = () => {
  const { data: db } = useERP();
  const navigate = useNavigate();
  if (!db) return null;

  const today = new Date().toISOString().slice(0, 10);

  const readyToDispatch = db.productionOrders.filter(
    (po) => po.status === 'Completed' && getAvailableDispatchQty(po, db.deliveryOrders) > 0,
  );
  const plannedDeliveries = db.deliveryOrders.filter((d) => d.status === 'Planned');
  const scheduledToday = plannedDeliveries.filter((d) => d.plannedDispatchDate === today);
  const inTransit = db.deliveryOrders.filter((d) => d.status === 'In Transit' || d.status === 'Dispatched');
  const partiallyDelivered = db.deliveryOrders.filter((d) => d.status === 'Partially Delivered');
  const delivered = db.deliveryOrders.filter((d) => d.status === 'Delivered');
  const overdueDeliveries = db.deliveryOrders.filter(
    (d) => ['Planned', 'In Transit', 'Dispatched', 'Partially Delivered'].includes(d.status) && d.expectedDeliveryDate < today,
  );
  const openIssues = db.deliveryIssues.filter((i) => i.status === 'Open');

  const exportDeliveryCSV = () => {
    const headers = [
      'Delivery DocNo',
      'Sales Order',
      'Customer',
      'Product',
      'Quantity',
      'Delivered Qty',
      'Transport Method',
      'Carrier / Vehicle',
      'Challan No',
      'Status',
      'Planned Date',
      'Expected Delivery',
      'Actual Delivery',
      'Received By',
    ];
    const rows = db.deliveryOrders.map((d) => [
      d.docNo,
      d.salesOrderDocNo,
      `"${d.customerName}"`,
      `"${d.productName}"`,
      d.quantity,
      d.deliveredQty || 0,
      d.transportMethod,
      d.transportMethod === 'Own Vehicle' ? d.vehicleNumber || '' : `${d.courierCompany || ''} (${d.trackingNumber || ''})`,
      d.deliveryChallanNo || '',
      d.status,
      d.plannedDispatchDate,
      d.expectedDeliveryDate,
      d.actualDeliveryDate || '',
      `"${d.receivedBy || ''}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CRYO-Logistics-Deliveries-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logistics & Delivery Dashboard"
        subtitle="Manage finished goods handoff, vehicle & courier dispatches, proof of delivery, and exception tracking."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={exportDeliveryCSV}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => navigate('/logistics/ready')}>
              <PackageCheck className="w-4 h-4" /> Ready for Dispatch ({readyToDispatch.length})
            </Button>
          </div>
        }
      />

      {/* 8 Operational Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Ready for Dispatch"
          value={readyToDispatch.length}
          hint="QC-approved orders"
          tone={readyToDispatch.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/logistics/ready')}
        />
        <StatCard
          label="Pending Delivery Orders"
          value={plannedDeliveries.length}
          hint="Planned shipments"
          onClick={() => navigate('/logistics/delivery-orders')}
        />
        <StatCard
          label="Scheduled Dispatches"
          value={scheduledToday.length || plannedDeliveries.length}
          hint="Planned for dispatch"
          onClick={() => navigate('/logistics/delivery-orders')}
        />
        <StatCard
          label="In Transit"
          value={inTransit.length}
          hint="Active on road / courier"
          onClick={() => navigate('/logistics/in-transit')}
        />
        <StatCard
          label="Partially Delivered"
          value={partiallyDelivered.length}
          hint="Remaining balance active"
          tone={partiallyDelivered.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/logistics/in-transit')}
        />
        <StatCard
          label="Delivered"
          value={delivered.length}
          hint="POD confirmed"
          tone="success"
          onClick={() => navigate('/logistics/completed')}
        />
        <StatCard
          label="Overdue Deliveries"
          value={overdueDeliveries.length}
          hint="Past expected delivery"
          tone={overdueDeliveries.length > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/logistics/in-transit')}
        />
        <StatCard
          label="Delivery Issues"
          value={openIssues.length}
          hint="Exceptions & delays"
          tone={openIssues.length > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/logistics/issues')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Shipments In Transit */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Active Shipments In Transit</h2>
            </div>
            <Link to="/logistics/in-transit" className="text-xs text-teal-700 dark:text-teal-400 hover:underline">
              View all ({inTransit.length})
            </Link>
          </div>
          {inTransit.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No shipments currently in transit.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {inTransit.slice(0, 5).map((d) => {
                const isOverdue = d.expectedDeliveryDate < today;
                return (
                  <div key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/logistics/delivery-orders/${d.id}`}
                          className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                        >
                          {d.docNo}
                        </Link>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{d.salesOrderDocNo}</span>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950/60 px-1.5 py-0.5 rounded">
                            <Clock className="w-2.5 h-2.5" /> Overdue
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 truncate mt-0.5">
                        {d.customerName} — {d.quantity}× {d.productName}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {d.transportMethod === 'Own Vehicle'
                          ? `Own Vehicle: ${d.vehicleNumber} (${d.driverName})`
                          : `Courier: ${d.courierCompany} · AWB ${d.trackingNumber || 'Pending'}`}
                        {' · '}ETA: {formatDate(d.expectedDeliveryDate)}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <StatusBadge status={d.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* QC-Approved Units Awaiting Dispatch */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">QC-Approved Awaiting Dispatch</h2>
            </div>
            <Link to="/logistics/ready" className="text-xs text-teal-700 dark:text-teal-400 hover:underline">
              Create Delivery Order
            </Link>
          </div>
          {readyToDispatch.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">All QC-approved units have been allocated to delivery orders.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {readyToDispatch.slice(0, 5).map((po) => {
                const avail = getAvailableDispatchQty(po, db.deliveryOrders);
                return (
                  <div key={po.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {po.docNo} · <span className="text-slate-500">{po.salesOrderDocNo}</span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 truncate mt-0.5">
                        {po.customerName} — {po.productName} ({po.model})
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        QC Accepted: {po.qcAcceptedQty} · Already Allocated: {po.qcAcceptedQty - avail}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400 shrink-0 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 px-2 py-1 rounded">
                      {avail} ready
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. READY FOR DISPATCH PAGE
// ==========================================

export const ReadyForDispatchPage: React.FC = () => {
  const { data: db, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [selectedPo, setSelectedPo] = useState<ProductionOrder | null>(null);
  const [saving, setSaving] = useState(false);

  const [quantity, setQuantity] = useState('1');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [transportMethod, setTransportMethod] = useState<'Own Vehicle' | 'Courier'>('Own Vehicle');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [courierCompany, setCourierCompany] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courierContact, setCourierContact] = useState('');
  const [plannedDispatchDate, setPlannedDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  );
  const [remarks, setRemarks] = useState('');

  if (!db) return null;

  const readyRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.productionOrders.filter((po) => {
      if (po.status !== 'Completed') return false;
      if (getAvailableDispatchQty(po, db.deliveryOrders) <= 0) return false;
      if (!q) return true;
      return (
        po.docNo.toLowerCase().includes(q) ||
        po.salesOrderDocNo.toLowerCase().includes(q) ||
        po.customerName.toLowerCase().includes(q) ||
        po.productName.toLowerCase().includes(q) ||
        (po.model || '').toLowerCase().includes(q)
      );
    });
  }, [db.productionOrders, db.deliveryOrders, search]);

  const openCreateModal = (po: ProductionOrder) => {
    const avail = getAvailableDispatchQty(po, db.deliveryOrders);
    const so = db.salesOrders.find((s) => s.id === po.salesOrderId);
    setSelectedPo(po);
    setQuantity(String(avail));
    setDeliveryAddress(so?.deliveryAddress || so?.customerSnapshot?.shippingAddress || '');
    setTransportMethod('Own Vehicle');
    setVehicleNumber('');
    setDriverName('');
    setDriverPhone('');
    setCourierCompany('');
    setTrackingNumber('');
    setCourierContact('');
    setRemarks('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPo) return;
    setSaving(true);
    try {
      const created = (await erpApi.createDeliveryOrder({
        productionOrderId: selectedPo.id,
        quantity: Number(quantity),
        deliveryAddress,
        transportMethod,
        vehicleNumber: transportMethod === 'Own Vehicle' ? vehicleNumber.trim() : undefined,
        driverName: transportMethod === 'Own Vehicle' ? driverName.trim() : undefined,
        driverPhone: transportMethod === 'Own Vehicle' ? driverPhone.trim() : undefined,
        courierCompany: transportMethod === 'Courier' ? courierCompany.trim() : undefined,
        trackingNumber: transportMethod === 'Courier' ? trackingNumber.trim() : undefined,
        courierContact: transportMethod === 'Courier' ? courierContact.trim() : undefined,
        plannedDispatchDate,
        expectedDeliveryDate,
        remarks,
      })) as DeliveryOrder;
      await refresh();
      setSelectedPo(null);
      toast(
        'success',
        `Delivery Order ${created.docNo} created`,
        `Allocated ${quantity} unit(s) via ${transportMethod}. Confirm dispatch once loaded.`,
      );
    } catch (err) {
      toast('error', 'Could not create delivery order', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<ProductionOrder>[] = [
    {
      key: 'po',
      header: 'Production / Sales Order',
      render: (po) => (
        <div>
          <div className="font-mono font-medium text-slate-900 dark:text-slate-100">{po.docNo}</div>
          <Link to={`/tracking/${po.salesOrderId}`} className="text-xs font-mono text-teal-700 dark:text-teal-400 hover:underline">
            {po.salesOrderDocNo}
          </Link>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer & Product',
      render: (po) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">{po.customerName}</div>
          <div className="text-xs text-slate-500">
            {po.productName} ({po.model})
          </div>
        </div>
      ),
    },
    {
      key: 'serials',
      header: 'Serial Numbers',
      render: (po) => (
        <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
          {po.serialNumbers?.length ? po.serialNumbers.join(', ') : '—'}
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'QC Approved / Available',
      align: 'right',
      render: (po) => {
        const avail = getAvailableDispatchQty(po, db.deliveryOrders);
        const allocated = po.qcAcceptedQty - avail;
        return (
          <div className="text-right">
            <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
              {avail} available
            </span>
            <div className="text-[11px] text-slate-500 font-mono">
              QC: {po.qcAcceptedQty} · Alloc: {allocated}
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (po) =>
        can('logistics', 'create') ? (
          <Button size="sm" onClick={() => openCreateModal(po)}>
            <Truck className="w-3.5 h-3.5" /> Create Delivery Order
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Ready for Dispatch"
        subtitle="Only QC-accepted Completed production orders appear here for delivery scheduling."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search production order, sales order, customer, or product..."
      />

      <DataTable
        rows={readyRows}
        columns={columns}
        emptyTitle="No finished goods waiting for dispatch"
        emptyDescription="Production orders appear here automatically after passing Quality Check."
        renderMobileCard={(po) => {
          const avail = getAvailableDispatchQty(po, db.deliveryOrders);
          return (
            <div className="space-y-2">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="font-mono font-semibold text-sm">{po.docNo}</div>
                  <div className="text-xs text-slate-500">{po.salesOrderDocNo}</div>
                </div>
                <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {avail} ready
                </span>
              </div>
              <div className="text-xs font-medium">{po.customerName}</div>
              <div className="text-xs text-slate-500">
                {po.productName} ({po.model})
              </div>
              {can('logistics', 'create') && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  <Button size="sm" onClick={() => openCreateModal(po)}>
                    <Truck className="w-3.5 h-3.5" /> Create Delivery Order
                  </Button>
                </div>
              )}
            </div>
          );
        }}
      />

      {/* Create Delivery Order Modal */}
      <Modal
        open={Boolean(selectedPo)}
        onClose={() => setSelectedPo(null)}
        title={`Create Delivery Order — ${selectedPo?.docNo || ''}`}
        subtitle={`${selectedPo?.customerName || ''} · ${selectedPo?.productName || ''}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedPo(null)}>
              Cancel
            </Button>
            <Button type="submit" form="create-del-form" loading={saving}>
              <Truck className="w-4 h-4" /> Create Delivery Order
            </Button>
          </>
        }
      >
        {selectedPo && (
          <form id="create-del-form" onSubmit={handleCreate} className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-md border border-slate-200 dark:border-slate-800 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-slate-500">Sales Order:</span>
                <div className="font-mono font-semibold">{selectedPo.salesOrderDocNo}</div>
              </div>
              <div>
                <span className="text-slate-500">QC Accepted:</span>
                <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                  {selectedPo.qcAcceptedQty} units
                </div>
              </div>
              <div>
                <span className="text-slate-500">Available:</span>
                <div className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                  {getAvailableDispatchQty(selectedPo, db.deliveryOrders)} units
                </div>
              </div>
              <div>
                <span className="text-slate-500">Serials:</span>
                <div className="font-mono truncate">{selectedPo.serialNumbers?.join(', ') || 'N/A'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Dispatch Quantity"
                required
                hint={`Max ${getAvailableDispatchQty(selectedPo, db.deliveryOrders)} QC-approved unit(s)`}
              >
                <Input
                  type="number"
                  min="1"
                  max={getAvailableDispatchQty(selectedPo, db.deliveryOrders)}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </Field>
              <Field label="Transport Method" required>
                <Select
                  value={transportMethod}
                  onChange={(e) => setTransportMethod(e.target.value as 'Own Vehicle' | 'Courier')}
                >
                  <option value="Own Vehicle">Own Vehicle (Company Fleet)</option>
                  <option value="Courier">Courier / Freight Forwarder</option>
                </Select>
              </Field>
            </div>

            {/* Conditional Transport Fields */}
            {transportMethod === 'Own Vehicle' ? (
              <div className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Vehicle Number" required>
                  <Input
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder="KA-05-CR-9080"
                    required
                  />
                </Field>
                <Field label="Driver Name" required>
                  <Input
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Driver full name"
                    required
                  />
                </Field>
                <Field label="Driver Phone" required>
                  <Input
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="+91 98450 00000"
                    required
                  />
                </Field>
              </div>
            ) : (
              <div className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Courier Company Name" required>
                  <Input
                    value={courierCompany}
                    onChange={(e) => setCourierCompany(e.target.value)}
                    placeholder="Blue Dart / Safexpress / TCI"
                    required
                  />
                </Field>
                <Field label="Tracking / AWB Number" hint="Can also be entered at dispatch confirmation">
                  <Input
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="AWB-892173"
                  />
                </Field>
                <Field label="Courier Helpline / Contact (optional)">
                  <Input
                    value={courierContact}
                    onChange={(e) => setCourierContact(e.target.value)}
                    placeholder="Hub representative contact"
                  />
                </Field>
              </div>
            )}

            <Field label="Delivery Address" required>
              <Textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} required />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Planned Dispatch Date" required>
                <Input
                  type="date"
                  value={plannedDispatchDate}
                  onChange={(e) => setPlannedDispatchDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="Expected Delivery Date" required>
                <Input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  required
                />
              </Field>
            </div>

            <Field label="Handling / Dispatch Remarks">
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Keep upright, nitrogen purge connected, crane unloading at site..."
              />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
};

// ==========================================
// 3. DELIVERY ORDERS LIST PAGE
// ==========================================

export const DeliveryOrdersPage: React.FC<{ mode: 'all' | 'in_transit' | 'completed' | 'history' }> = ({ mode }) => {
  const { data: db, refresh, toast, can } = useERP();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [transportFilter, setTransportFilter] = useState('All');

  // Modals state
  const [dispatchTarget, setDispatchTarget] = useState<DeliveryOrder | null>(null);
  const [challanNo, setChallanNo] = useState('');
  const [trackingInput, setTrackingInput] = useState('');
  const [dispatchRemarks, setDispatchRemarks] = useState('');
  const [dispatchFile, setDispatchFile] = useState<{ name: string; dataUrl: string }>({ name: '', dataUrl: '' });

  const [deliverTarget, setDeliverTarget] = useState<DeliveryOrder | null>(null);
  const [deliverMode, setDeliverMode] = useState<'Delivered' | 'Delivery Issue'>('Delivered');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [receivedBy, setReceivedBy] = useState('');
  const [deliveredQty, setDeliveredQty] = useState('1');
  const [podFile, setPodFile] = useState<{ name: string; dataUrl: string; size?: number; type?: string }>({ name: '', dataUrl: '' });
  const [deliverRemarks, setDeliverRemarks] = useState('');
  const [issueType, setIssueType] = useState<DeliveryIssueType>('Delivery Delayed');
  const [issueReason, setIssueReason] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');

  const [cancelTarget, setCancelTarget] = useState<DeliveryOrder | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const [docPreviewPayload, setDocPreviewPayload] = useState<DocUnion | null>(null);

  const [saving, setSaving] = useState(false);

  if (!db) return null;

  const titleMap = {
    all: 'Delivery Orders',
    in_transit: 'Dispatched / In Transit',
    completed: 'Completed Deliveries',
    history: 'Delivery History',
  };

  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.deliveryOrders.filter((d) => {
      if (mode === 'in_transit' && d.status !== 'In Transit' && d.status !== 'Dispatched' && d.status !== 'Partially Delivered') {
        return false;
      }
      if (mode === 'completed' && d.status !== 'Delivered') return false;
      if (mode === 'all' && statusFilter !== 'All' && d.status !== statusFilter) return false;
      if (transportFilter !== 'All' && d.transportMethod !== transportFilter) return false;
      if (!q) return true;
      return (
        d.docNo.toLowerCase().includes(q) ||
        d.salesOrderDocNo.toLowerCase().includes(q) ||
        d.customerName.toLowerCase().includes(q) ||
        d.productName.toLowerCase().includes(q) ||
        (d.trackingNumber || '').toLowerCase().includes(q) ||
        (d.vehicleNumber || '').toLowerCase().includes(q) ||
        (d.deliveryChallanNo || '').toLowerCase().includes(q) ||
        (d.driverName || '').toLowerCase().includes(q)
      );
    });
  }, [db.deliveryOrders, mode, statusFilter, transportFilter, search]);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchTarget) return;
    setSaving(true);
    try {
      await erpApi.confirmDispatch(dispatchTarget.id, {
        deliveryChallanNo: challanNo.trim(),
        trackingNumber: trackingInput.trim() || undefined,
        remarks: dispatchRemarks.trim(),
        attachmentName: dispatchFile.name || undefined,
        attachmentDataUrl: dispatchFile.dataUrl || undefined,
      });
      await refresh();
      setDispatchTarget(null);
      toast(
        'success',
        `Dispatch confirmed for ${dispatchTarget.docNo}`,
        'Shipment is now In Transit and Sales team has been notified.',
      );
    } catch (err) {
      toast('error', 'Dispatch failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeliver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliverTarget) return;
    setSaving(true);
    try {
      await erpApi.confirmDelivery(deliverTarget.id, {
        result: deliverMode,
        deliveryDate,
        receivedBy: deliverMode === 'Delivered' ? receivedBy.trim() : undefined,
        deliveredQty: deliverMode === 'Delivered' ? Number(deliveredQty) : undefined,
        deliveryCondition: deliverMode === 'Delivered' ? 'Good' : issueType === 'Product Damaged' ? 'Damaged' : 'Good',
        podName: podFile.name || undefined,
        podDataUrl: podFile.dataUrl || undefined,
        podFileType: podFile.name ? podFile.name.split('.').pop()?.toLowerCase() : undefined,
        remarks: deliverRemarks.trim(),
        issueType: deliverMode === 'Delivery Issue' ? issueType : undefined,
        issueReason: deliverMode === 'Delivery Issue' ? issueReason.trim() : undefined,
        correctiveAction: deliverMode === 'Delivery Issue' ? correctiveAction.trim() : undefined,
      });
      await refresh();
      setDeliverTarget(null);
      toast(
        deliverMode === 'Delivered' ? 'success' : 'info',
        deliverMode === 'Delivered'
          ? `Delivery confirmed for ${deliverTarget.docNo}`
          : `Delivery issue logged for ${deliverTarget.docNo}`,
      );
    } catch (err) {
      toast('error', 'Update failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    if (!cancellationReason.trim()) {
      toast('error', 'Reason required', 'Please provide a mandatory cancellation reason.');
      return;
    }
    setSaving(true);
    try {
      await erpApi.cancelDeliveryOrder(cancelTarget.id, cancellationReason.trim());
      await refresh();
      setCancelTarget(null);
      setCancellationReason('');
      toast('success', `Cancelled ${cancelTarget.docNo}`, 'Allocated quantity has been released back to Ready for Dispatch.');
    } catch (err) {
      toast('error', 'Cancellation failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<DeliveryOrder>[] = [
    {
      key: 'docNo',
      header: 'Delivery Order',
      sortable: true,
      sortValue: (d) => d.docNo,
      render: (d) => (
        <div>
          <Link
            to={`/logistics/delivery-orders/${d.id}`}
            className="font-mono font-medium text-teal-700 dark:text-teal-400 hover:underline"
          >
            {d.docNo}
          </Link>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Link to={`/tracking/${d.salesOrderId}`} className="text-xs font-mono text-slate-500 hover:underline">
              {d.salesOrderDocNo}
            </Link>
            {d.deliveryChallanNo && (
              <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-600 dark:text-slate-400">
                {d.deliveryChallanNo}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer & Product',
      render: (d) => (
        <div>
          <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{d.customerName}</div>
          <div className="text-xs text-slate-500">
            {d.quantity}× {d.productName}
          </div>
        </div>
      ),
    },
    {
      key: 'transport',
      header: 'Transport Details',
      render: (d) => (
        <div className="text-xs">
          <div className="font-medium text-slate-800 dark:text-slate-200">{d.transportMethod}</div>
          {d.transportMethod === 'Own Vehicle' ? (
            <div className="text-slate-500">
              {d.vehicleNumber} · {d.driverName}
            </div>
          ) : (
            <div className="text-slate-500">
              {d.courierCompany} {d.trackingNumber ? `· AWB ${d.trackingNumber}` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Dates & Timeline',
      render: (d) => {
        const isOverdue =
          ['Planned', 'In Transit', 'Dispatched', 'Partially Delivered'].includes(d.status) &&
          d.expectedDeliveryDate < today;
        return (
          <div className="text-xs font-mono whitespace-nowrap">
            <div>Plan: {formatDate(d.plannedDispatchDate)}</div>
            {d.actualDeliveryDate ? (
              <div className="text-emerald-700 dark:text-emerald-400">Del: {formatDate(d.actualDeliveryDate)}</div>
            ) : (
              <div className={isOverdue ? 'text-red-700 dark:text-red-400 font-semibold flex items-center gap-1' : 'text-slate-500'}>
                {isOverdue && <Clock className="w-3 h-3" />} ETA: {formatDate(d.expectedDeliveryDate)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status & Completion',
      render: (d) => (
        <div>
          <StatusBadge status={d.status} />
          {d.status === 'Partially Delivered' && (
            <div className="text-[11px] font-mono text-amber-700 dark:text-amber-400 mt-0.5">
              {d.deliveredQty}/{d.quantity} units
            </div>
          )}
          {d.receivedBy && <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[120px]">Rec: {d.receivedBy}</div>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (d) => (
        <div className="flex items-center justify-end gap-1.5 flex-wrap">
          {d.status === 'Planned' && can('logistics', 'edit') && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  setDispatchTarget(d);
                  setChallanNo(`DC-${new Date().getFullYear()}-${d.docNo.slice(-4)}`);
                  setTrackingInput(d.trackingNumber || '');
                  setDispatchRemarks('');
                  setDispatchFile({ name: '', dataUrl: '' });
                }}
              >
                <Send className="w-3.5 h-3.5" /> Dispatch
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                onClick={() => {
                  setCancelTarget(d);
                  setCancellationReason('');
                }}
              >
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </>
          )}

          {(d.status === 'In Transit' || d.status === 'Dispatched' || d.status === 'Partially Delivered') &&
            can('logistics', 'edit') && (
              <Button
                size="sm"
                variant="success"
                onClick={() => {
                  setDeliverTarget(d);
                  setDeliverMode('Delivered');
                  setDeliveredQty(String(Math.max(1, d.quantity - (d.deliveredQty || 0))));
                  setReceivedBy('');
                  setDeliverRemarks('');
                  setIssueReason('');
                  setPodFile({ name: '', dataUrl: '' });
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Delivery
              </Button>
            )}

          {/* Document Preview */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDocPreviewPayload({ kind: 'delivery_challan', doc: d })}
            title="Print / View Delivery Challan"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
          </Button>

          <Button variant="ghost" size="sm" onClick={() => navigate(`/logistics/delivery-orders/${d.id}`)}>
            Details
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={titleMap[mode]}
        subtitle="Manage dispatches, vehicle / courier transit details, proof of delivery, and customer handover."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search delivery no, SO, customer, vehicle, or AWB..."
        statuses={mode === 'all' ? ['All', 'Planned', 'In Transit', 'Partially Delivered', 'Delivered', 'Issue', 'Cancelled'] : undefined}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
        extra={
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 whitespace-nowrap">Transport:</span>
            <select
              value={transportFilter}
              onChange={(e) => setTransportFilter(e.target.value)}
              className="text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-800 dark:text-slate-200"
            >
              <option value="All">All Transport</option>
              <option value="Own Vehicle">Own Vehicle</option>
              <option value="Courier">Courier</option>
            </select>
          </div>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        emptyTitle="No delivery orders found"
        emptyDescription="Create delivery orders from QC-approved orders in Ready for Dispatch."
        renderMobileCard={(d) => (
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  to={`/logistics/delivery-orders/${d.id}`}
                  className="font-mono font-semibold text-sm text-teal-700 dark:text-teal-400 hover:underline"
                >
                  {d.docNo}
                </Link>
                <div className="text-xs text-slate-500">{d.salesOrderDocNo}</div>
              </div>
              <StatusBadge status={d.status} />
            </div>
            <div className="text-xs font-medium text-slate-900 dark:text-slate-100">{d.customerName}</div>
            <div className="text-xs text-slate-500">
              {d.quantity}× {d.productName} · {d.transportMethod}
            </div>
            {d.deliveryChallanNo && (
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                Challan: {d.deliveryChallanNo}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button size="sm" variant="ghost" onClick={() => navigate(`/logistics/delivery-orders/${d.id}`)}>
                Details
              </Button>
              {d.status === 'Planned' && can('logistics', 'edit') && (
                <Button
                  size="sm"
                  onClick={() => {
                    setDispatchTarget(d);
                    setChallanNo(`DC-${new Date().getFullYear()}-${d.docNo.slice(-4)}`);
                    setTrackingInput(d.trackingNumber || '');
                  }}
                >
                  Confirm Dispatch
                </Button>
              )}
              {(d.status === 'In Transit' || d.status === 'Dispatched' || d.status === 'Partially Delivered') &&
                can('logistics', 'edit') && (
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => {
                      setDeliverTarget(d);
                      setDeliverMode('Delivered');
                      setDeliveredQty(String(Math.max(1, d.quantity - (d.deliveredQty || 0))));
                      setReceivedBy('');
                    }}
                  >
                    Confirm Delivery
                  </Button>
                )}
            </div>
          </div>
        )}
      />

      {/* Dispatch Modal */}
      <Modal
        open={Boolean(dispatchTarget)}
        onClose={() => setDispatchTarget(null)}
        title={`Confirm Dispatch — ${dispatchTarget?.docNo || ''}`}
        subtitle={`${dispatchTarget?.customerName || ''} · ${dispatchTarget?.transportMethod || ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDispatchTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="dispatch-confirm-form" loading={saving}>
              <Send className="w-4 h-4" /> Mark Dispatched / In Transit
            </Button>
          </>
        }
      >
        {dispatchTarget && (
          <form id="dispatch-confirm-form" onSubmit={handleDispatch} className="space-y-4">
            <Field label="Delivery Challan Number" required>
              <Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} required />
            </Field>

            {dispatchTarget.transportMethod === 'Courier' && (
              <Field label="Tracking / AWB Number" required>
                <Input
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="Enter courier AWB tracking number"
                  required
                />
              </Field>
            )}

            <Field label="Dispatch Remarks">
              <Textarea
                value={dispatchRemarks}
                onChange={(e) => setDispatchRemarks(e.target.value)}
                placeholder="Seal number, vehicle condition, loading checklist..."
              />
            </Field>

            <FileUploadInput
              label="Dispatch Challan / LR Copy (Max 5MB)"
              fileName={dispatchFile.name}
              onFileSelected={(name, dataUrl) => setDispatchFile({ name, dataUrl })}
            />
          </form>
        )}
      </Modal>

      {/* Delivery Confirmation Modal */}
      <Modal
        open={Boolean(deliverTarget)}
        onClose={() => setDeliverTarget(null)}
        title={`Delivery Confirmation — ${deliverTarget?.docNo || ''}`}
        subtitle={`${deliverTarget?.customerName || ''} · ${deliverTarget?.quantity || 0} unit(s)`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeliverTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="deliver-confirm-form"
              variant={deliverMode === 'Delivered' ? 'success' : 'danger'}
              loading={saving}
            >
              {deliverMode === 'Delivered' ? 'Confirm Final Delivery' : 'Log Delivery Issue'}
            </Button>
          </>
        }
      >
        {deliverTarget && (
          <form id="deliver-confirm-form" onSubmit={handleDeliver} className="space-y-4">
            <Field label="Outcome" required>
              <Select value={deliverMode} onChange={(e) => setDeliverMode(e.target.value as 'Delivered' | 'Delivery Issue')}>
                <option value="Delivered">Delivered Successfully (Good Condition)</option>
                <option value="Delivery Issue">Report Delivery Issue / Delay / Damage</option>
              </Select>
            </Field>

            <Field label="Date" required>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} required />
            </Field>

            {deliverMode === 'Delivered' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Received By (Customer Representative)" required>
                    <Input
                      value={receivedBy}
                      onChange={(e) => setReceivedBy(e.target.value)}
                      placeholder="Full name & designation"
                      required
                    />
                  </Field>
                  <Field
                    label="Delivered Quantity"
                    required
                    hint={`Remaining to deliver: ${Math.max(1, deliverTarget.quantity - (deliverTarget.deliveredQty || 0))} unit(s)`}
                  >
                    <Input
                      type="number"
                      min="1"
                      max={Math.max(1, deliverTarget.quantity - (deliverTarget.deliveredQty || 0))}
                      value={deliveredQty}
                      onChange={(e) => setDeliveredQty(e.target.value)}
                      required
                    />
                  </Field>
                </div>
                <FileUploadInput
                  label="Signed Proof of Delivery (POD) / Receipt Copy (Max 5MB)"
                  fileName={podFile.name}
                  onFileSelected={(name, dataUrl) => setPodFile({ name, dataUrl })}
                />
                <Field label="Delivery Remarks">
                  <Input
                    value={deliverRemarks}
                    onChange={(e) => setDeliverRemarks(e.target.value)}
                    placeholder="Unloaded & handed over in intact condition"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Issue Type" required>
                  <Select value={issueType} onChange={(e) => setIssueType(e.target.value as DeliveryIssueType)}>
                    <option value="Delivery Delayed">Transit Delay</option>
                    <option value="Customer Unavailable">Customer Unavailable</option>
                    <option value="Incorrect Address">Incorrect Address</option>
                    <option value="Vehicle Breakdown">Vehicle Breakdown</option>
                    <option value="Courier Delay">Courier Delay</option>
                    <option value="Product Damaged">Product Damaged</option>
                    <option value="Customer Rejected Delivery">Customer Rejected Delivery</option>
                    <option value="Partial Delivery">Partial Delivery Issue</option>
                    <option value="Other">Other Exception</option>
                  </Select>
                </Field>
                <Field label="Issue Description / Reason" required>
                  <Textarea
                    value={issueReason}
                    onChange={(e) => setIssueReason(e.target.value)}
                    placeholder="Describe the issue reported by carrier or receiver..."
                    required
                  />
                </Field>
                <Field label="Immediate Corrective Action">
                  <Input
                    value={correctiveAction}
                    onChange={(e) => setCorrectiveAction(e.target.value)}
                    placeholder="Rescheduled attempt / carrier inquiry initiated"
                  />
                </Field>
              </>
            )}
          </form>
        )}
      </Modal>

      {/* Cancel Order Modal */}
      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Cancel Delivery Order — ${cancelTarget?.docNo || ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              Keep Order
            </Button>
            <Button type="submit" form="cancel-del-form" variant="danger" loading={saving}>
              Confirm Cancellation
            </Button>
          </>
        }
      >
        {cancelTarget && (
          <form id="cancel-del-form" onSubmit={handleCancel} className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-md border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              Cancelling this planned delivery order will immediately release {cancelTarget.quantity} allocated unit(s)
              back to Ready for Dispatch.
            </div>
            <Field label="Cancellation Reason" required>
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Reason for cancellation (e.g. customer schedule change, shipping address correction)..."
                required
              />
            </Field>
          </form>
        )}
      </Modal>

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        open={Boolean(docPreviewPayload)}
        onClose={() => setDocPreviewPayload(null)}
        company={db.company}
        payload={docPreviewPayload}
      />
    </div>
  );
};

// ==========================================
// 4. CENTRALIZED DELIVERY ORDER DETAIL PAGE
// ==========================================

export const DeliveryOrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: db, refresh, toast, can } = useERP();

  const [docPreviewPayload, setDocPreviewPayload] = useState<DocUnion | null>(null);

  if (!db || !id) return null;

  const del = db.deliveryOrders.find((d) => d.id === id || d.docNo === id);
  if (!del) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Delivery Order Not Found</h2>
        <p className="text-xs text-slate-500">The delivery order reference "{id}" could not be located.</p>
        <Button onClick={() => navigate('/logistics/delivery-orders')}>
          <ArrowLeft className="w-4 h-4" /> Back to Delivery Orders
        </Button>
      </div>
    );
  }

  const linkedIssues = db.deliveryIssues.filter((i) => i.deliveryOrderId === del.id);
  const so = db.salesOrders.find((s) => s.id === del.salesOrderId);
  const po = db.productionOrders.find((p) => p.id === del.productionOrderId);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <button
            onClick={() => navigate('/logistics/delivery-orders')}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Delivery Orders
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100">{del.docNo}</h1>
            <StatusBadge status={del.status} />
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {del.transportMethod}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Customer: <span className="font-semibold text-slate-800 dark:text-slate-200">{del.customerName}</span> · Linked SO:{' '}
            <Link to={`/tracking/${del.salesOrderId}`} className="font-mono text-teal-700 dark:text-teal-400 hover:underline">
              {del.salesOrderDocNo}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDocPreviewPayload({ kind: 'delivery_challan', doc: del })}>
            <Printer className="w-4 h-4" /> Print Challan
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDocPreviewPayload({ kind: 'delivery_order', doc: del })}>
            <FileText className="w-4 h-4" /> Print Delivery Order
          </Button>
          <Link to={`/tracking/${del.salesOrderId}`}>
            <Button variant="ghost" size="sm">
              Centralized Tracking
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Overview & Product */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-teal-600" /> Finished Goods Shipment Details
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-500">Product:</span>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{del.productName}</div>
              </div>
              <div>
                <span className="text-slate-500">Shipment Qty:</span>
                <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{del.quantity} Nos</div>
              </div>
              <div>
                <span className="text-slate-500">Delivered Qty:</span>
                <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {del.deliveredQty || 0} Nos
                </div>
              </div>
              <div>
                <span className="text-slate-500">Condition:</span>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{del.deliveryCondition || 'Pending Delivery'}</div>
              </div>
            </div>

            {/* Serial Numbers */}
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">Assigned Serial Numbers:</div>
              <div className="flex flex-wrap gap-1.5">
                {del.serialNumbers?.length ? (
                  del.serialNumbers.map((s, idx) => (
                    <span
                      key={idx}
                      className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">No specific serial numbers assigned</span>
                )}
              </div>
            </div>

            {/* Consignee & Delivery Address */}
            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-slate-500" /> Delivery Address
              </div>
              <div className="text-slate-800 dark:text-slate-200 pl-5 whitespace-pre-wrap">{del.deliveryAddress}</div>
            </div>
          </div>

          {/* Transport & Dispatch Details */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Truck className="w-4 h-4 text-teal-600" /> Transportation & Carrier Execution
            </h2>

            {del.transportMethod === 'Own Vehicle' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500">Vehicle Number</span>
                  <div className="font-mono font-semibold text-sm mt-0.5">{del.vehicleNumber || '—'}</div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500">Driver Name</span>
                  <div className="font-semibold text-sm mt-0.5">{del.driverName || '—'}</div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500">Driver Contact</span>
                  <div className="font-mono text-sm mt-0.5">{del.driverPhone || '—'}</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500">Courier Company</span>
                  <div className="font-semibold text-sm mt-0.5">{del.courierCompany || '—'}</div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500">AWB / Tracking Number</span>
                  <div className="font-mono font-semibold text-sm mt-0.5 text-teal-700 dark:text-teal-400">
                    {del.trackingNumber || 'Pending'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-500">Courier Helpline</span>
                  <div className="font-mono text-sm mt-0.5">{del.courierContact || '—'}</div>
                </div>
              </div>
            )}

            {/* Challan & Timeline */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
              <div>
                <span className="text-slate-500">Delivery Challan:</span>
                <div className="font-mono font-medium">{del.deliveryChallanNo || 'Not Generated'}</div>
              </div>
              <div>
                <span className="text-slate-500">Planned Dispatch:</span>
                <div className="font-mono">{formatDate(del.plannedDispatchDate)}</div>
              </div>
              <div>
                <span className="text-slate-500">Actual Dispatch:</span>
                <div className="font-mono text-slate-800 dark:text-slate-200">
                  {del.actualDispatchDate ? formatDate(del.actualDispatchDate) : 'Pending'}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Expected Delivery:</span>
                <div className="font-mono font-medium">{formatDate(del.expectedDeliveryDate)}</div>
              </div>
            </div>

            {/* Documents & POD */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 flex flex-wrap gap-3">
              {del.dispatchAttachmentDataUrl && (
                <a
                  href={del.dispatchAttachmentDataUrl}
                  download={del.dispatchAttachmentName || 'challan-copy'}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 px-3 py-1.5 rounded"
                >
                  <FileText className="w-3.5 h-3.5" /> Dispatch LR / Challan Copy
                </a>
              )}
              {del.podDataUrl && (
                <a
                  href={del.podDataUrl}
                  download={del.podName || 'pod-receipt'}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded"
                >
                  <FileCheck className="w-3.5 h-3.5" /> Proof of Delivery (POD)
                </a>
              )}
            </div>
          </div>

          {/* Delivery Issues Log */}
          {linkedIssues.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" /> Reported Delivery Exceptions ({linkedIssues.length})
              </h2>
              <div className="space-y-2">
                {linkedIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-3 bg-red-50/50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-900 text-xs space-y-1"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-red-700 dark:text-red-400">
                        {issue.issueType} ({issue.affectedQty} unit(s))
                      </span>
                      <StatusBadge status={issue.status} />
                    </div>
                    <div className="text-slate-700 dark:text-slate-300">{issue.reason}</div>
                    {issue.resolutionNotes && (
                      <div className="text-emerald-700 dark:text-emerald-400 pt-1 border-t border-red-200 dark:border-red-900">
                        Resolution: {issue.resolutionNotes} ({issue.resolutionOutcome || 'Resolved'})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: History & Metadata (1 Col) */}
        <div className="space-y-6">
          {/* Linked Order Trace */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3 text-xs">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Linked Order Trace</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Sales Order:</span>
                <Link to={`/tracking/${del.salesOrderId}`} className="font-mono text-teal-700 dark:text-teal-400 hover:underline">
                  {del.salesOrderDocNo}
                </Link>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Production Order:</span>
                <span className="font-mono">{del.productionOrderDocNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created By:</span>
                <span>{del.createdBy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created At:</span>
                <span>{formatDate(del.createdAt)}</span>
              </div>
              {del.cancellationReason && (
                <div className="p-2 bg-red-50 dark:bg-red-950/40 rounded border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
                  <span className="font-semibold">Cancellation:</span> {del.cancellationReason} (by {del.cancelledBy})
                </div>
              )}
            </div>
          </div>

          {/* Audit Trail History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" /> Lifecycle History
            </h2>
            <div className="space-y-3">
              {del.history?.length ? (
                del.history.map((h, idx) => (
                  <div key={idx} className="text-xs relative pl-4 border-l-2 border-teal-500 space-y-0.5">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{h.action}</div>
                    <div className="text-slate-500 text-[11px]">{h.details}</div>
                    <div className="text-slate-400 text-[10px]">
                      {formatDate(h.timestamp)} · {h.actorName}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 italic">Created on {formatDate(del.createdAt)}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <DocumentPreviewModal
        open={Boolean(docPreviewPayload)}
        onClose={() => setDocPreviewPayload(null)}
        company={db.company}
        payload={docPreviewPayload}
      />
    </div>
  );
};

// ==========================================
// 5. DELIVERY ISSUES PAGE
// ==========================================

export const DeliveryIssuesPage: React.FC = () => {
  const { data: db, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [resolveTarget, setResolveTarget] = useState<DeliveryIssue | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionOutcome, setResolutionOutcome] = useState<DeliveryIssueResolution>('Retry Delivery');
  const [nextAttemptDate, setNextAttemptDate] = useState(
    new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);

  if (!db) return null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.deliveryIssues.filter((i) => {
      if (statusFilter !== 'All' && i.status !== statusFilter) return false;
      if (!q) return true;
      return (
        i.deliveryOrderDocNo.toLowerCase().includes(q) ||
        i.salesOrderDocNo.toLowerCase().includes(q) ||
        i.customerName.toLowerCase().includes(q) ||
        i.reason.toLowerCase().includes(q) ||
        i.issueType.toLowerCase().includes(q)
      );
    });
  }, [db.deliveryIssues, statusFilter, search]);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTarget) return;
    if (!resolutionNotes.trim()) {
      toast('error', 'Resolution notes required', 'Please explain how this exception was resolved.');
      return;
    }
    setSaving(true);
    try {
      await erpApi.resolveDeliveryIssue(resolveTarget.id, {
        resolutionNotes: resolutionNotes.trim(),
        resolutionOutcome,
        retryTransit: resolutionOutcome === 'Retry Delivery',
        nextAttemptDate: resolutionOutcome === 'Reschedule Delivery' ? nextAttemptDate : undefined,
      });
      await refresh();
      setResolveTarget(null);
      setResolutionNotes('');
      toast('success', 'Delivery issue resolved', `Outcome: ${resolutionOutcome}`);
    } catch (err) {
      toast('error', 'Could not resolve issue', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<DeliveryIssue>[] = [
    {
      key: 'del',
      header: 'Delivery / SO',
      render: (i) => (
        <div>
          <Link
            to={`/logistics/delivery-orders/${i.deliveryOrderId}`}
            className="font-mono font-medium text-teal-700 dark:text-teal-400 hover:underline"
          >
            {i.deliveryOrderDocNo}
          </Link>
          <div className="text-xs font-mono text-slate-500">{i.salesOrderDocNo}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (i) => <span className="font-medium text-sm">{i.customerName}</span>,
    },
    {
      key: 'issue',
      header: 'Issue Details',
      render: (i) => (
        <div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" /> {i.issueType} ({i.affectedQty} qty)
          </span>
          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{i.reason}</div>
          {i.resolutionNotes && (
            <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              Resolution: {i.resolutionNotes} ({i.resolutionOutcome || 'Resolved'})
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Reported',
      render: (i) => <span className="font-mono text-xs">{formatDate(i.reportedDate)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (i) => <StatusBadge status={i.status} />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (i) =>
        i.status === 'Open' && can('logistics', 'edit') ? (
          <Button size="sm" onClick={() => setResolveTarget(i)}>
            <Wrench className="w-3.5 h-3.5" /> Resolve
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Delivery Issues"
        subtitle="Manage failed attempts, transit delays, or damage reports and resume delivery."
      />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search delivery order, customer, or reason..."
        statuses={['All', 'Open', 'Resolved']}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />
      <DataTable
        rows={filtered}
        columns={columns}
        emptyTitle="No delivery issues logged"
        emptyDescription="All dispatches are proceeding cleanly without reported exceptions."
      />

      <Modal
        open={Boolean(resolveTarget)}
        onClose={() => setResolveTarget(null)}
        title={`Resolve Delivery Issue — ${resolveTarget?.deliveryOrderDocNo || ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolveTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="resolve-issue-form" loading={saving}>
              Mark Resolved
            </Button>
          </>
        }
      >
        <form id="resolve-issue-form" onSubmit={handleResolve} className="space-y-4">
          <Field label="Resolution Outcome" required>
            <Select
              value={resolutionOutcome}
              onChange={(e) => setResolutionOutcome(e.target.value as DeliveryIssueResolution)}
            >
              <option value="Retry Delivery">Retry Delivery (Return order to In Transit)</option>
              <option value="Reschedule Delivery">Reschedule Delivery (Update expected delivery date)</option>
              <option value="Delivery Confirmed">Delivery Confirmed (Acknowledge completed handover)</option>
              <option value="Returned to CRYO">Returned to CRYO (Return shipment to warehouse for inspection)</option>
              <option value="Requires Further Action">Requires Further Action (Keep under investigation)</option>
            </Select>
          </Field>

          {resolutionOutcome === 'Reschedule Delivery' && (
            <Field label="New Expected Delivery Date" required>
              <Input
                type="date"
                value={nextAttemptDate}
                onChange={(e) => setNextAttemptDate(e.target.value)}
                required
              />
            </Field>
          )}

          <Field label="Resolution Notes / Corrective Actions" required>
            <Textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Explain how the delivery issue was resolved..."
              required
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
};

// ==========================================
// 6. LOGISTICS REPORTS PAGE
// ==========================================

export const LogisticsReportsPage: React.FC = () => {
  const { data: db } = useERP();
  if (!db) return null;

  const today = new Date().toISOString().slice(0, 10);

  const ownCount = db.deliveryOrders.filter((d) => d.transportMethod === 'Own Vehicle').length;
  const courierCount = db.deliveryOrders.filter((d) => d.transportMethod === 'Courier').length;
  const deliveredCount = db.deliveryOrders.filter((d) => d.status === 'Delivered').length;
  const inTransitCount = db.deliveryOrders.filter((d) => d.status === 'In Transit' || d.status === 'Dispatched').length;
  const plannedCount = db.deliveryOrders.filter((d) => d.status === 'Planned').length;
  const cancelledCount = db.deliveryOrders.filter((d) => d.status === 'Cancelled').length;

  const totalUnitsDispatched = db.deliveryOrders
    .filter((d) => ['In Transit', 'Dispatched', 'Partially Delivered', 'Delivered'].includes(d.status))
    .reduce((s, d) => s + d.quantity, 0);

  const totalUnitsDelivered = db.deliveryOrders.reduce((s, d) => s + (d.deliveredQty || 0), 0);

  const overdueCount = db.deliveryOrders.filter(
    (d) => ['Planned', 'In Transit', 'Dispatched', 'Partially Delivered'].includes(d.status) && d.expectedDeliveryDate < today,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logistics & Delivery Reports"
        subtitle="Operational metrics, fleet vs. courier mix, on-time performance, and exception summaries."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Delivery Orders" value={db.deliveryOrders.length} />
        <StatCard label="Delivered Orders" value={deliveredCount} tone="success" />
        <StatCard label="Dispatched Units" value={totalUnitsDispatched} />
        <StatCard label="Delivered Units" value={totalUnitsDelivered} tone="success" />
        <StatCard label="In Transit Shipments" value={inTransitCount} />
        <StatCard label="Pending Dispatches" value={plannedCount} />
        <StatCard label="Delayed Shipments" value={overdueCount} tone={overdueCount > 0 ? 'danger' : 'default'} />
        <StatCard
          label="Open Issues"
          value={db.deliveryIssues.filter((i) => i.status === 'Open').length}
          tone={db.deliveryIssues.filter((i) => i.status === 'Open').length > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Transport Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transport Method Mix</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">Own Vehicle Fleet</div>
              <div className="text-2xl font-semibold font-mono mt-1 text-teal-700 dark:text-teal-400">{ownCount}</div>
              <div className="text-[11px] text-slate-500 mt-1">Dedicated transport & direct client sites</div>
            </div>
            <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500">Courier / Freight</div>
              <div className="text-2xl font-semibold font-mono mt-1 text-teal-700 dark:text-teal-400">{courierCount}</div>
              <div className="text-[11px] text-slate-500 mt-1">Tracked AWB shipments & air freight</div>
            </div>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Delivery Status Distribution</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500">Planned:</span>
              <div className="font-mono text-base font-semibold mt-0.5">{plannedCount}</div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500">In Transit:</span>
              <div className="font-mono text-base font-semibold mt-0.5">{inTransitCount}</div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500">Delivered:</span>
              <div className="font-mono text-base font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                {deliveredCount}
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500">Cancelled:</span>
              <div className="font-mono text-base font-semibold text-red-700 dark:text-red-400 mt-0.5">
                {cancelledCount}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
