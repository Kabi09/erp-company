import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, PackageCheck, Plus, Wrench } from 'lucide-react';
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
import type { DeliveredProduct, ServiceJob, ServiceRequest } from '../../types/erp';

interface DeliveredProductsPageProps {
  sourceDept?: 'service' | 'production';
}

export const DeliveredProductsPage: React.FC<DeliveredProductsPageProps> = ({ sourceDept = 'service' }) => {
  const { data, refresh, toast, can } = useERP();
  const navigate = useNavigate();

  const [products, setProducts] = useState<DeliveredProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [warrantyFilter, setWarrantyFilter] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<DeliveredProduct | null>(null);
  const [productDetail, setProductDetail] = useState<{
    product: DeliveredProduct;
    serviceHistory: { requests: ServiceRequest[]; jobs: ServiceJob[] };
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [form, setForm] = useState({
    serialNumber: '',
    productId: '',
    productName: '',
    modelNumber: '',
    customerId: '',
    customerName: '',
    customerContact: '',
    customerPhone: '',
    customerEmail: '',
    deliveryAddress: '',
    deliveredDate: new Date().toISOString().split('T')[0],
    warrantyPeriodMonths: 24,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadDeliveredProducts = async () => {
    try {
      setLoading(true);
      const res = await erpApi.getDeliveredProducts();
      setProducts(res);
    } catch (e: any) {
      toast('error', 'Failed to load delivered products', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeliveredProducts();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchSearch =
        !q ||
        p.serialNumber.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q) ||
        (p.modelNumber && p.modelNumber.toLowerCase().includes(q));

      const matchWarranty =
        warrantyFilter === 'All' || p.warrantyStatus === warrantyFilter;

      return matchSearch && matchWarranty;
    });
  }, [products, search, warrantyFilter]);

  const handleSelectProduct = async (p: DeliveredProduct) => {
    setSelectedProduct(p);
    try {
      setDetailLoading(true);
      const detail = await erpApi.getDeliveredProductDetail(p.id);
      setProductDetail(detail);
    } catch (e: any) {
      toast('error', 'Could not load service history', e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serialNumber || !form.productName || !form.customerId) {
      setErr('Serial Number, Product Name, and Customer are mandatory.');
      return;
    }

    setSubmitting(true);
    setErr(null);
    try {
      await erpApi.createDeliveredProduct(form);
      toast('success', 'Delivered Machinery Registered', `S/N: ${form.serialNumber}`);
      setCreateOpen(false);
      setForm({
        serialNumber: '',
        productId: '',
        productName: '',
        modelNumber: '',
        customerId: '',
        customerName: '',
        customerContact: '',
        customerPhone: '',
        customerEmail: '',
        deliveryAddress: '',
        deliveredDate: new Date().toISOString().split('T')[0],
        warrantyPeriodMonths: 24,
        notes: '',
      });
      await loadDeliveredProducts();
      await refresh();
    } catch (e: any) {
      setErr(e.message || 'Failed to register product.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<DeliveredProduct>[] = [
    {
      key: 'serialNumber',
      header: 'Serial Number / ID',
      sortable: true,
      render: (p) => (
        <div>
          <button
            type="button"
            onClick={() => handleSelectProduct(p)}
            className="font-medium text-teal-700 dark:text-teal-400 hover:underline text-left cursor-pointer font-mono text-xs"
          >
            {p.serialNumber}
          </button>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">{p.id}</div>
        </div>
      ),
    },
    {
      key: 'productName',
      header: 'Machinery / Model',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{p.productName}</div>
          {p.modelNumber && <div className="text-xs text-slate-500 dark:text-slate-400">Model: {p.modelNumber}</div>}
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer & Site',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-medium text-slate-900 dark:text-slate-100">{p.customerName}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">{p.deliveryAddress}</div>
        </div>
      ),
    },
    {
      key: 'deliveredDate',
      header: 'Delivered Date',
      sortable: true,
      render: (p) => <span className="text-slate-700 dark:text-slate-300 text-xs">{p.deliveredDate}</span>,
    },
    {
      key: 'warrantyStatus',
      header: 'Warranty Status',
      sortable: true,
      render: (p) => (
        <div>
          <StatusBadge status={p.warrantyStatus} />
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Expires: {p.warrantyEndDate}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Operational Status',
      sortable: true,
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleSelectProduct(p)}
            className="text-xs"
          >
            <History className="w-3.5 h-3.5 mr-1" />
            History
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => navigate(`/service/requests?create=1&serial=${encodeURIComponent(p.serialNumber)}`)}
            className="text-xs"
          >
            <Wrench className="w-3.5 h-3.5 mr-1" />
            Service Ticket
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivered Products Register"
        description="Unified master register of deployed cryogenic equipment, serial numbers, warranty lifecycles, and field service records."
        breadcrumbs={[
          { label: sourceDept === 'production' ? 'Production' : 'Service', path: sourceDept === 'production' ? '/production' : '/service' },
          { label: 'Delivered Products' },
        ]}
        actions={
          can('service', 'create') || can('production', 'create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Register Delivered Machinery
            </Button>
          ) : undefined
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by serial number, machinery, or customer..."
        statuses={['All', 'Under Warranty', 'Expired']}
        activeStatus={warrantyFilter}
        onStatusChange={setWarrantyFilter}
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyTitle="No Delivered Products Found"
        emptyDescription="Machinery dispatched and delivered through Logistics Challans automatically populate here."
      />

      {/* Register Delivered Machinery Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Register Delivered Machinery"
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {err && <ErrorBanner message={err} />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Serial Number" required>
              <Input
                placeholder="e.g. CRYO-ULT-2026-089"
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                required
              />
            </Field>

            <Field label="Customer Account" required>
              <Select
                value={form.customerId}
                onChange={(e) => {
                  const cust = data?.customers.find((c) => c.id === e.target.value);
                  setForm({
                    ...form,
                    customerId: e.target.value,
                    customerName: cust?.name || '',
                    customerContact: cust?.contactPerson || '',
                    customerPhone: cust?.phone || '',
                    customerEmail: cust?.email || '',
                    deliveryAddress: cust?.shippingAddress || cust?.billingAddress || '',
                  });
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

            <Field label="Product / Equipment Name" required>
              <Input
                placeholder="e.g. Ultra-Low Temperature Freezer -86°C"
                value={form.productName}
                onChange={(e) => setForm({ ...form, productName: e.target.value })}
                required
              />
            </Field>

            <Field label="Model Number">
              <Input
                placeholder="e.g. ULT-86-400"
                value={form.modelNumber}
                onChange={(e) => setForm({ ...form, modelNumber: e.target.value })}
              />
            </Field>

            <Field label="Delivery / Commissioning Date" required>
              <Input
                type="date"
                value={form.deliveredDate}
                onChange={(e) => setForm({ ...form, deliveredDate: e.target.value })}
                required
              />
            </Field>

            <Field label="Warranty Period (Months)">
              <Select
                value={form.warrantyPeriodMonths}
                onChange={(e) => setForm({ ...form, warrantyPeriodMonths: Number(e.target.value) })}
              >
                <option value={12}>12 Months (1 Year Standard)</option>
                <option value={24}>24 Months (2 Years Comprehensive)</option>
                <option value={36}>36 Months (3 Years Extended)</option>
                <option value={60}>60 Months (5 Years Institutional)</option>
              </Select>
            </Field>
          </div>

          <Field label="Installation Site / Delivery Address">
            <Input
              placeholder="Facility address or laboratory wing..."
              value={form.deliveryAddress}
              onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
            />
          </Field>

          <Field label="Onboarding Notes">
            <Textarea
              placeholder="Installation specifics, ambient room notes, or warranty terms..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Register Equipment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Equipment Detail & Service History Modal */}
      <Modal
        open={Boolean(selectedProduct)}
        onClose={() => {
          setSelectedProduct(null);
          setProductDetail(null);
        }}
        title={`Equipment Detail & Service History: ${selectedProduct?.serialNumber}`}
        size="lg"
      >
        {selectedProduct && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Machinery</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedProduct.productName}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Model</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedProduct.modelNumber || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Customer</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedProduct.customerName}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Warranty Status</span>
                <StatusBadge status={selectedProduct.warrantyStatus} />
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Delivery Date</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{selectedProduct.deliveredDate}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Warranty End</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{selectedProduct.warrantyEndDate}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Source Challan</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{selectedProduct.deliveryOrderDocNo || 'Manual Onboarding'}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block">Operational State</span>
                <StatusBadge status={selectedProduct.status} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <History className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  Service & Maintenance History
                </h4>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    navigate(`/service/requests?create=1&serial=${encodeURIComponent(selectedProduct.serialNumber)}`);
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Raise Service Request
                </Button>
              </div>

              {detailLoading ? (
                <div className="p-6 text-center text-xs text-slate-500">Loading service history records...</div>
              ) : !productDetail?.serviceHistory.requests.length && !productDetail?.serviceHistory.jobs.length ? (
                <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-500">
                  No breakdown or repair requests recorded for this equipment. Operating satisfactorily.
                </div>
              ) : (
                <div className="space-y-3">
                  {productDetail?.serviceHistory.jobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <span className="font-mono text-teal-600 dark:text-teal-400">{job.docNo}</span>
                          <span>•</span>
                          <span>{job.serviceType}</span>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        {job.diagnosisSummary || 'Diagnostic inspection performed.'}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span>Technician: {job.assignedTechnicianName}</span>
                        <span>Date: {job.scheduledDate}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedProduct(null);
                            navigate(`/service/jobs/${job.id}`);
                          }}
                          className="text-xs h-6 px-2 text-teal-600 dark:text-teal-400 hover:underline"
                        >
                          View Job Sheet →
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
