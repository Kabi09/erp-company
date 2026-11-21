import {
  CustomerModel,
  DeliveryOrderModel,
  ProductionOrderModel,
  QualityCheckModel,
  SalesOrderModel,
  ProductModel,
  QuotationModel,
} from '../models';
import { UnitWarranty } from '../models/department.model';
import type { Values } from '../../../shared/departmentForms';

export function warrantyDates(
  terms: Values,
  deliveryDate?: string,
  today = new Date().toISOString().slice(0, 10),
) {
  const start = (terms.basis === 'Delivery Date' ? deliveryDate : terms.start)?.slice(0, 10);
  const months = terms.duration * (terms.unit === 'Years' ? 12 : 1);
  let end = '';
  if (start && Number.isInteger(months) && months > 0 && months <= 1200) {
    const d = new Date(start.slice(0, 10) + 'T00:00:00Z');
    if (Number.isFinite(d.getTime())) {
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0));
      d.setUTCDate(Math.min(last.getUTCDate(), d.getUTCDate()));
      d.setUTCMonth(d.getUTCMonth() + months);
      end = d.toISOString().slice(0, 10);
    }
  }
  return {
    ...terms,
    start: start || '',
    end,
    status: !end || today < start ? 'Not Configured' : today <= end ? 'Under Warranty' : 'Expired',
  };
}
function quoteTerms(notes = '') {
  const durations = [...notes.matchAll(/\b(\d+)\s*(months?|years?)\b/gi)];
  const duration = durations.length === 1 ? durations[0] : undefined;
  const bases = [
    ...notes.matchAll(
      /\b(?:from|following|after|starting on)\s+(?:the\s+)?(?:date\s+of\s+)?(deliver(?:y|ed)|installation|commissioning|contract)\b/gi,
    ),
  ];
  const term = bases.length === 1 ? bases[0][1].toLowerCase() : '';
  const basis = term.startsWith('deliver')
    ? 'Delivery Date'
    : term === 'contract'
      ? 'Contract Date'
      : term
        ? 'Installation Date'
        : '';
  return {
    notes,
    duration: duration ? Number(duration[1]) : undefined,
    unit: duration ? (/year/i.test(duration[2]) ? 'Years' : 'Months') : '',
    basis,
  };
}
export async function deliveredProducts(deliveryId?: string) {
  const deliveries = await DeliveryOrderModel.find({
    ...(deliveryId ? { id: deliveryId } : {}),
    $or: [{ deliveredQty: { $gt: 0 } }, { status: 'Delivered' }],
  }).lean();
  const prodIds = deliveries.map((d) => d.productionOrderId);
  const [production, sales, customers, qcs] = await Promise.all([
    ProductionOrderModel.find({ id: { $in: prodIds } }).lean(),
    SalesOrderModel.find({ id: { $in: deliveries.map((d) => d.salesOrderId) } }).lean(),
    CustomerModel.find({ id: { $in: deliveries.map((d) => d.customerId) } }).lean(),
    QualityCheckModel.find({ productionOrderId: { $in: prodIds }, finalResult: 'Accepted' })
      .select('productionOrderId docNo')
      .lean(),
  ]);
  const [products, quotes] = await Promise.all([
    ProductModel.find({ id: { $in: production.map((p) => p.productId) } }).lean(),
    QuotationModel.find({ id: { $in: sales.map((s) => s.quotationId) } })
      .select('id warranty')
      .lean(),
  ]);
  const units = deliveries.flatMap((d) => {
    const po = production.find((p) => p.id === d.productionOrderId),
      so = sales.find((s) => s.id === d.salesOrderId);
    const product = products.find((p) => p.id === po?.productId),
      customer = customers.find((c) => c.id === d.customerId);
    const qty = d.deliveredQty || (d.status === 'Delivered' ? d.quantity : 0);
    const serials = [...new Set((d.serialNumbers || []).filter(Boolean))];
    // Partial confirmations store a quantity with no serial identification.
    const verifiedSerials = qty === d.quantity && serials.length <= qty ? serials : [];
    const units = verifiedSerials.map((serial) => ({ serial, quantity: 1 }));
    if (qty > verifiedSerials.length) units.push({ serial: '', quantity: qty - verifiedSerials.length });
    return units.map((unit) => ({
      ...unit,
      id: d.id + '~' + (unit.serial ? 's' + encodeURIComponent(unit.serial) : 'lot'),
      deliveryId: d.id,
      identifiable: Boolean(unit.serial || d.quantity === 1),
      productName: d.productName || po?.productName,
      model: po?.model || product?.model,
      category: product?.category,
      specifications: po?.specifications || product?.specifications,
      productionOrder: po?.docNo || d.productionOrderDocNo,
      manufacturingDate: po?.actualCompletionDate,
      deliveryOrder: d.docNo,
      deliveryDate:
        (d.history || []).filter((h) =>
          ['Delivery Completed', 'Partial Delivery Confirmed'].includes(h.action),
        ).length > 1
          ? undefined
          : d.actualDeliveryDate,
      receivedBy: d.receivedBy,
      salesOrder: so?.docNo || d.salesOrderDocNo,
      qualityChecks: qcs.filter((q) => q.productionOrderId === d.productionOrderId).map((q) => q.docNo),
      customerId: d.customerId,
      customerName: d.customerName || so?.customerSnapshot?.name,
      phone: customer?.phone || so?.customerSnapshot?.phone,
      contact: customer?.contactPerson || so?.customerSnapshot?.contactPerson,
      email: customer?.email || so?.customerSnapshot?.email,
      address: d.deliveryAddress || so?.deliveryAddress,
      terms: quoteTerms(quotes.find((q) => q.id === so?.quotationId)?.warranty || product?.warrantyTerms),
    }));
  });
  const overrides = await UnitWarranty.find({ assetId: { $in: units.map((u) => u.id) } }).lean();
  return units.map(({ terms, ...u }) => ({
    ...u,
    warranty: warrantyDates(overrides.find((w) => w.assetId === u.id) || terms, u.deliveryDate),
  }));
}
export async function findUnit(id: string) {
  return (await deliveredProducts(id.split('~')[0])).find((u) => u.id === id);
}
