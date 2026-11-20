import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  Send,
  Truck,
  Wrench,
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
import { formatDate, getAvailableDispatchQty } from '../../utils/erpLogic';
import type { DeliveryIssue, DeliveryOrder, ProductionOrder } from '../../types/erp';

// ==========================================
// 1. LOGISTICS DASHBOARD
// ==========================================

export const LogisticsDashboard: React.FC = () => {
  const { data: db } = useERP();
  const navigate = useNavigate();
  if (!db) return null;

  const readyToDispatch = db.productionOrders.filter(
    (po) => po.status === 'Completed' && getAvailableDispatchQty(po, db.deliveryOrders) > 0,
  );
  const plannedDeliveries = db.deliveryOrders.filter((d) => d.status === 'Planned');
  const inTransit = db.deliveryOrders.filter((d) => d.status === 'In Transit' || d.status === 'Dispatched');
  const delivered = db.deliveryOrders.filter((d) => d.status === 'Delivered');
  const openIssues = db.deliveryIssues.filter((i) => i.status === 'Open');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logistics & Delivery Dashboard"
        subtitle="Manage QC-approved finished goods dispatch via Own Vehicle or Courier and confirm final delivery."
        actions={
          <Button onClick={() => navigate('/logistics/ready')}>
            <PackageCheck className="w-4 h-4" /> Ready for Dispatch ({readyToDispatch.length})
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Ready for Dispatch"
          value={readyToDispatch.length}
          hint="QC-approved orders"
          tone={readyToDispatch.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/logistics/ready')}
        />
        <StatCard
          label="Pending Dispatch"
          value={plannedDeliveries.length}
          hint="Planned delivery orders"
          onClick={() => navigate('/logistics/delivery-orders')}
        />
        <StatCard
          label="In Transit"
          value={inTransit.length}
          hint="Active shipments"
          onClick={() => navigate('/logistics/in-transit')}
        />
        <StatCard
          label="Completed Deliveries"
          value={delivered.length}
          hint="POD confirmed"
          tone="success"
          onClick={() => navigate('/logistics/completed')}
        />
        <StatCard
          label="Open Issues"
          value={openIssues.length}
          hint="Exceptions & delays"
          tone={openIssues.length > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/logistics/issues')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Active Shipments In Transit</h2>
            <Link to="/logistics/in-transit" className="text-xs text-teal-700 dark:text-teal-400 hover:underline">
              View all
            </Link>
          </div>
          {inTransit.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No shipments currently in transit.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {inTransit.slice(0, 5).map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {d.docNo} · {d.salesOrderDocNo}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {d.customerName} — {d.quantity}× {d.productName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {d.transportMethod === 'Own Vehicle'
                        ? `Own Vehicle: ${d.vehicleNumber} (${d.driverName})`
                        : `Courier: ${d.courierCompany} · AWB ${d.trackingNumber}`}
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">QC-Approved Units Awaiting Dispatch</h2>
            <Link to="/logistics/ready" className="text-xs text-teal-700 dark:text-teal-400 hover:underline">
              Create Delivery Order
            </Link>
          </div>
          {readyToDispatch.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">All QC-approved units have been assigned delivery orders.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {readyToDispatch.slice(0, 5).map((po) => {
                const avail = getAvailableDispatchQty(po, db.deliveryOrders);
                return (
                  <div key={po.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {po.docNo} · {po.salesOrderDocNo}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                        {po.customerName} — {po.productName} ({po.model})
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400 shrink-0">
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
        po.productName.toLowerCase().includes(q)
      );
    });
  }, [db.productionOrders, db.deliveryOrders, search]);

  const openCreateModal = (po: ProductionOrder) => {
    const avail = getAvailableDispatchQty(po, db.deliveryOrders);
    const so = db.salesOrders.find((s) => s.id === po.salesOrderId);
    setSelectedPo(po);
    setQuantity(String(avail));
    setDeliveryAddress(so?.deliveryAddress || '');
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
      await erpApi.createDeliveryOrder({
        productionOrderId: selectedPo.id,
        quantity: Number(quantity),
        deliveryAddress,
        transportMethod,
        vehicleNumber: transportMethod === 'Own Vehicle' ? vehicleNumber : undefined,
        driverName: transportMethod === 'Own Vehicle' ? driverName : undefined,
        driverPhone: transportMethod === 'Own Vehicle' ? driverPhone : undefined,
        courierCompany: transportMethod === 'Courier' ? courierCompany : undefined,
        trackingNumber: transportMethod === 'Courier' ? trackingNumber : undefined,
        courierContact: transportMethod === 'Courier' ? courierContact : undefined,
        plannedDispatchDate,
        expectedDeliveryDate,
        remarks,
      });
      await refresh();
      setSelectedPo(null);
      toast(
        'success',
        'Delivery Order created',
        `Planned via ${transportMethod}. Confirm dispatch once loaded.`,
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
      render: (po) => <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{po.serialNumbers.join(', ') || '—'}</span>,
    },
    {
      key: 'qty',
      header: 'QC Approved / Ready',
      align: 'right',
      render: (po) => {
        const avail = getAvailableDispatchQty(po, db.deliveryOrders);
        return (
          <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
            {avail} / {po.qcAcceptedQty}
          </span>
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
                <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">{avail} ready</span>
              </div>
              <div className="text-xs font-medium">{po.customerName}</div>
              <div className="text-xs text-slate-500">
                {po.productName} ({po.model})
              </div>
              {can('logistics', 'create') && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  <Button size="sm" onClick={() => openCreateModal(po)}>
                    Create Delivery Order
                  </Button>
                </div>
              )}
            </div>
          );
        }}
      />

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
                  <option value="Own Vehicle">Own Vehicle</option>
                  <option value="Courier">Courier</option>
                </Select>
              </Field>
            </div>

            {transportMethod === 'Own Vehicle' ? (
              <div className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Vehicle Number" required>
                  <Input
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder="MH-12-CR-4410"
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
                    placeholder="+91 98220 00000"
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
                    placeholder="Blue Dart Industrial / Safexpress"
                    required
                  />
                </Field>
                <Field label="Tracking / AWB Number" hint="Can also be entered at dispatch confirmation">
                  <Input
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="AWB-9928371"
                  />
                </Field>
                <Field label="Courier Contact (optional)">
                  <Input
                    value={courierContact}
                    onChange={(e) => setCourierContact(e.target.value)}
                    placeholder="Branch helpline / agent"
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
                placeholder="Keep upright, shock-watch sensor attached, crane unloading at site..."
              />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
};

// ==========================================
// 3. DELIVERY ORDERS (ALL / IN TRANSIT / COMPLETED / HISTORY)
// ==========================================

export const DeliveryOrdersPage: React.FC<{ mode: 'all' | 'in_transit' | 'completed' | 'history' }> = ({ mode }) => {
  const { data: db, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

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
  const [podFile, setPodFile] = useState<{ name: string; dataUrl: string }>({ name: '', dataUrl: '' });
  const [deliverRemarks, setDeliverRemarks] = useState('');
  const [issueType, setIssueType] = useState<'Failed Attempt' | 'Delay' | 'Damage' | 'Shortage'>('Delay');
  const [issueReason, setIssueReason] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [saving, setSaving] = useState(false);

  if (!db) return null;

  const titleMap = {
    all: 'Delivery Orders',
    in_transit: 'Dispatched / In Transit',
    completed: 'Completed Deliveries',
    history: 'Delivery History',
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.deliveryOrders.filter((d) => {
      if (mode === 'in_transit' && d.status !== 'In Transit' && d.status !== 'Dispatched' && d.status !== 'Partially Delivered') {
        return false;
      }
      if (mode === 'completed' && d.status !== 'Delivered') return false;
      if (mode === 'all' && statusFilter !== 'All' && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.docNo.toLowerCase().includes(q) ||
        d.salesOrderDocNo.toLowerCase().includes(q) ||
        d.customerName.toLowerCase().includes(q) ||
        d.productName.toLowerCase().includes(q) ||
        (d.trackingNumber || '').toLowerCase().includes(q) ||
        (d.vehicleNumber || '').toLowerCase().includes(q)
      );
    });
  }, [db.deliveryOrders, mode, statusFilter, search]);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchTarget) return;
    setSaving(true);
    try {
      await erpApi.confirmDispatch(dispatchTarget.id, {
        deliveryChallanNo: challanNo,
        trackingNumber: trackingInput || undefined,
        remarks: dispatchRemarks,
        attachmentName: dispatchFile.name || undefined,
        attachmentDataUrl: dispatchFile.dataUrl || undefined,
      });
      await refresh();
      setDispatchTarget(null);
      toast(
        'success',
        `Dispatch confirmed for ${dispatchTarget.docNo}`,
        'Shipment moved to In Transit and Sales team notified.',
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
        receivedBy: deliverMode === 'Delivered' ? receivedBy : undefined,
        deliveredQty: deliverMode === 'Delivered' ? Number(deliveredQty) : undefined,
        deliveryCondition: deliverMode === 'Delivered' ? 'Good' : issueType === 'Damage' ? 'Damaged' : 'Good',
        podName: podFile.name || undefined,
        podDataUrl: podFile.dataUrl || undefined,
        remarks: deliverRemarks,
        issueType: deliverMode === 'Delivery Issue' ? issueType : undefined,
        issueReason: deliverMode === 'Delivery Issue' ? issueReason : undefined,
        correctiveAction: deliverMode === 'Delivery Issue' ? correctiveAction : undefined,
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

  const columns: ColumnDef<DeliveryOrder>[] = [
    {
      key: 'docNo',
      header: 'Delivery Order',
      sortable: true,
      sortValue: (d) => d.docNo,
      render: (d) => (
        <div>
          <div className="font-mono font-medium text-slate-900 dark:text-slate-100">{d.docNo}</div>
          <Link to={`/tracking/${d.salesOrderId}`} className="text-xs font-mono text-teal-700 dark:text-teal-400 hover:underline">
            {d.salesOrderDocNo}
          </Link>
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
              {d.vehicleNumber} · {d.driverName} ({d.driverPhone})
            </div>
          ) : (
            <div className="text-slate-500">
              {d.courierCompany} {d.trackingNumber ? `· AWB ${d.trackingNumber}` : ''}
            </div>
          )}
          {d.deliveryChallanNo && <div className="font-mono text-[11px] text-slate-500">Challan: {d.deliveryChallanNo}</div>}
        </div>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      render: (d) => (
        <div className="text-xs font-mono whitespace-nowrap">
          <div>Plan: {formatDate(d.plannedDispatchDate)}</div>
          {d.actualDeliveryDate ? (
            <div className="text-emerald-700 dark:text-emerald-400">Del: {formatDate(d.actualDeliveryDate)}</div>
          ) : (
            <div className="text-slate-500">ETA: {formatDate(d.expectedDeliveryDate)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => (
        <div>
          <StatusBadge status={d.status} />
          {d.receivedBy && <div className="text-[11px] text-slate-500 mt-0.5">Rec: {d.receivedBy}</div>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (d) => (
        <div className="flex items-center justify-end gap-1.5">
          {d.status === 'Planned' && can('logistics', 'edit') && (
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
              <Send className="w-3.5 h-3.5" /> Confirm Dispatch
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
                  setDeliverRemarks('');
                  setIssueReason('');
                  setPodFile({ name: '', dataUrl: '' });
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Delivery
              </Button>
            )}
          <Link to={`/tracking/${d.salesOrderId}`}>
            <Button variant="ghost" size="sm">
              Track
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={titleMap[mode]}
        subtitle="Track dispatches, vehicle/courier transit details, proof of delivery, and final handover."
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search delivery no, SO, customer, vehicle, or AWB..."
        statuses={mode === 'all' ? ['All', 'Planned', 'In Transit', 'Partially Delivered', 'Delivered', 'Issue'] : undefined}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
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
                <div className="font-mono font-semibold text-sm">{d.docNo}</div>
                <div className="text-xs text-slate-500">{d.salesOrderDocNo}</div>
              </div>
              <StatusBadge status={d.status} />
            </div>
            <div className="text-xs font-medium">{d.customerName}</div>
            <div className="text-xs text-slate-500">
              {d.quantity}× {d.productName} · {d.transportMethod}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
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
              Mark Dispatched / In Transit
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
              <Textarea value={dispatchRemarks} onChange={(e) => setDispatchRemarks(e.target.value)} placeholder="Seal number, loading checklist..." />
            </Field>
            <FileUploadInput
              label="Dispatch Challan / LR Copy"
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
                  <Field label="Delivered Quantity" required>
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
                  label="Signed Proof of Delivery (POD)"
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
                  <Select value={issueType} onChange={(e) => setIssueType(e.target.value as any)}>
                    <option value="Delay">Transit Delay</option>
                    <option value="Failed Attempt">Failed Delivery Attempt</option>
                    <option value="Damage">Transit Damage</option>
                    <option value="Shortage">Shortage / Missing Accessories</option>
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
                    placeholder="Rescheduled attempt / claim initiated"
                  />
                </Field>
              </>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
};

// ==========================================
// 4. DELIVERY ISSUES PAGE
// ==========================================

export const DeliveryIssuesPage: React.FC = () => {
  const { data: db, refresh, toast, can } = useERP();
  const [search, setSearch] = useState('');
  const [resolveTarget, setResolveTarget] = useState<DeliveryIssue | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [retryTransit, setRetryTransit] = useState(true);
  const [saving, setSaving] = useState(false);

  if (!db) return null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.deliveryIssues.filter((i) => {
      if (!q) return true;
      return (
        i.deliveryOrderDocNo.toLowerCase().includes(q) ||
        i.customerName.toLowerCase().includes(q) ||
        i.reason.toLowerCase().includes(q)
      );
    });
  }, [db.deliveryIssues, search]);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTarget) return;
    setSaving(true);
    try {
      await erpApi.resolveDeliveryIssue(resolveTarget.id, { resolutionNotes, retryTransit });
      await refresh();
      setResolveTarget(null);
      setResolutionNotes('');
      toast('success', 'Delivery issue resolved');
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
          <div className="font-mono font-medium">{i.deliveryOrderDocNo}</div>
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
            <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Resolution: {i.resolutionNotes}</div>
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
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search delivery order, customer, or reason..." />
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
          <Field label="Resolution Notes" required>
            <Textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Explain how the delivery issue was resolved..."
              required
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={retryTransit}
              onChange={(e) => setRetryTransit(e.target.checked)}
              className="rounded border-slate-300"
            />
            Return Delivery Order back to In Transit for next delivery attempt
          </label>
        </form>
      </Modal>
    </div>
  );
};

// ==========================================
// 5. LOGISTICS REPORTS PAGE
// ==========================================

export const LogisticsReportsPage: React.FC = () => {
  const { data: db } = useERP();
  if (!db) return null;

  const ownCount = db.deliveryOrders.filter((d) => d.transportMethod === 'Own Vehicle').length;
  const courierCount = db.deliveryOrders.filter((d) => d.transportMethod === 'Courier').length;
  const deliveredCount = db.deliveryOrders.filter((d) => d.status === 'Delivered').length;
  const totalUnitsDelivered = db.deliveryOrders.reduce((s, d) => s + (d.deliveredQty || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logistics & Delivery Reports"
        subtitle="Dispatch mix, delivery completion performance, and exception summary."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Delivery Orders" value={db.deliveryOrders.length} />
        <StatCard label="Delivered Orders" value={deliveredCount} tone="success" />
        <StatCard label="Total Units Delivered" value={totalUnitsDelivered} />
        <StatCard label="Delivery Issues Logged" value={db.deliveryIssues.length} tone={db.deliveryIssues.length ? 'warning' : 'default'} />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Transport Method Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500">Own Vehicle Fleet</div>
            <div className="text-2xl font-semibold font-mono mt-1">{ownCount}</div>
            <div className="text-xs text-slate-500 mt-1">Heavy cryogenic equipment & direct site delivery</div>
          </div>
          <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-500">Courier / Freight Partner</div>
            <div className="text-2xl font-semibold font-mono mt-1">{courierCount}</div>
            <div className="text-xs text-slate-500 mt-1">Tracked AWB shipments & regional consignments</div>
          </div>
        </div>
      </div>
    </div>
  );
};
