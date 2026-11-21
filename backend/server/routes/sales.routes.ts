import { Router } from 'express';
import type { CustomerSnapshot, QuotationItem } from '../../src/types/erp';
import {
  calculatePaymentSummary,
  calculateQuotationTotals,
  normalizeQuotationItems,
  round2,
} from '../../src/utils/erpLogic';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  ApprovalRequestModel,
  ApprovalWorkflowModel,
  CustomerModel,
  CustomerPOModel,
  EnquiryModel,
  FollowUpModel,
  PaymentEntryModel,
  ProductModel,
  ProformaInvoiceModel,
  QuotationModel,
  SalesOrderModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { generateId, sendError } from '../utils/routeUtils';

export const salesRouter = Router();

// --- Phase 3: Paginated Enquiries ---
salesRouter.get('/sales/enquiries', requireAuth, requirePerm('sales', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedEnquiries(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Paginated Quotations ---
salesRouter.get('/sales/quotations', requireAuth, requirePerm('sales', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedQuotations(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Paginated Sales Orders ---
salesRouter.get('/sales/orders', requireAuth, requirePerm('sales', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await mongoERPRepository.getPaginatedSalesOrders(req.query);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Customers Dropdown Options ---
salesRouter.get('/sales/customers/options', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const options = await mongoERPRepository.getCustomerOptions();
    res.json(options);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Products Dropdown Options ---
salesRouter.get('/sales/products/options', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const options = await mongoERPRepository.getProductOptions();
    res.json(options);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Phase 3: Sales Dashboard Summary ---
salesRouter.get('/sales/summary', requireAuth, requirePerm('sales', 'view'), async (_req: AuthenticatedRequest, res) => {
  try {
    const summary = await mongoERPRepository.getSalesSummary();
    res.json(summary);
  } catch (err) {
    sendError(res, err);
  }
});

// --- CUSTOMERS ---

salesRouter.post('/sales/customers', requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim()) throw new Error('Customer / company name is required.');
    const cleanName = body.name.trim();

    const existingByName = await CustomerModel.findOne({
      name: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (existingByName) {
      throw new Error(`Customer "${cleanName}" already exists.`);
    }

    if (body.gstin?.trim()) {
      const cleanGstin = body.gstin.trim().toUpperCase();
      const existingByGstin = await CustomerModel.findOne({ gstin: cleanGstin });
      if (existingByGstin) {
        throw new Error(`Customer with GSTIN "${cleanGstin}" already exists (${existingByGstin.name}).`);
      }
    }

    const now = new Date().toISOString();
    const c = {
      id: generateId('cust'),
      name: cleanName,
      contactPerson: body.contactPerson?.trim() || '',
      phone: body.phone?.trim() || '',
      email: body.email?.trim() || '',
      billingAddress: body.billingAddress?.trim() || '',
      shippingAddress: body.shippingAddress?.trim() || body.billingAddress?.trim() || '',
      gstin: body.gstin?.trim() || '',
      notes: body.notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
    };

    await CustomerModel.create(c);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Created Customer',
      entityType: 'Customer',
      entityId: c.id,
      entityDocNo: c.name,
      details: `Created customer account for ${c.name}.`,
    });

    res.status(201).json(c);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.put('/sales/customers/:id', requireAuth, requirePerm('sales', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const c = await CustomerModel.findOne({ id: req.params.id });
    if (!c) throw new Error('NOT_FOUND:Customer not found.');

    c.name = body.name?.trim() || c.name;
    c.contactPerson = body.contactPerson?.trim() ?? c.contactPerson;
    c.phone = body.phone?.trim() ?? c.phone;
    c.email = body.email?.trim() ?? c.email;
    c.billingAddress = body.billingAddress?.trim() ?? c.billingAddress;
    c.shippingAddress = body.shippingAddress?.trim() ?? c.shippingAddress;
    c.gstin = body.gstin?.trim() ?? c.gstin;
    c.notes = body.notes?.trim() ?? c.notes;
    c.updatedAt = new Date().toISOString();
    await c.save();

    res.json(c.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

// --- PRODUCTS ---

salesRouter.post('/sales/products', requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim() || !body.code?.trim()) throw new Error('Product name and code are required.');
    const cleanCode = body.code.trim().toUpperCase();

    const existing = await ProductModel.findOne({ code: cleanCode });
    if (existing) {
      throw new Error(`Product code ${body.code} already exists.`);
    }

    const prod = {
      id: generateId('prod'),
      code: cleanCode,
      name: body.name.trim(),
      category: body.category?.trim() || 'Cryo Freezers',
      model: body.model?.trim() || '',
      specifications: body.specifications?.trim() || '',
      highlights: Array.isArray(body.highlights) ? body.highlights.filter((h: string) => h.trim()) : [],
      sellingPrice: Math.max(0, Number(body.sellingPrice) || 0),
      unit: body.unit?.trim() || 'Nos',
      description: body.description?.trim() || '',
      status: (body.status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
      bomTemplate: Array.isArray(body.bomTemplate) ? body.bomTemplate : [],
      stages: Array.isArray(body.stages) && body.stages.length > 0 ? body.stages : ['Fabrication', 'Assembly', 'Testing'],
      createdAt: new Date().toISOString(),
    };

    await ProductModel.create(prod);
    res.status(201).json(prod);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.put('/sales/products/:id', requireAuth, requirePerm('sales', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const p = await ProductModel.findOne({ id: req.params.id });
    if (!p) throw new Error('NOT_FOUND:Product not found.');

    p.name = body.name?.trim() || p.name;
    p.category = body.category?.trim() || p.category;
    p.model = body.model?.trim() || p.model;
    p.specifications = body.specifications?.trim() ?? p.specifications;
    if (Array.isArray(body.highlights)) p.highlights = body.highlights.filter((h: string) => h.trim());
    if (body.sellingPrice !== undefined) p.sellingPrice = Math.max(0, Number(body.sellingPrice) || 0);
    if (body.status) p.status = body.status === 'Inactive' ? 'Inactive' : 'Active';
    if (Array.isArray(body.bomTemplate)) p.bomTemplate = body.bomTemplate;
    await p.save();

    res.json(p.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

// --- ENQUIRIES ---

salesRouter.post('/sales/enquiries', requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new Error('At least one product line is required.');
    }
    const now = new Date().toISOString();
    let customerId = body.customerId as string;
    let customerSnapshot: CustomerSnapshot;

    if (body.isNewCustomer || !customerId) {
      if (!body.newCustomer?.name?.trim()) throw new Error('Customer / company name is required.');
      const cleanName = body.newCustomer.name.trim();
      const existingCust = await CustomerModel.findOne({
        name: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (existingCust) {
        customerId = existingCust.id;
        customerSnapshot = {
          name: existingCust.name,
          contactPerson: existingCust.contactPerson,
          phone: existingCust.phone,
          email: existingCust.email,
          billingAddress: existingCust.billingAddress,
          shippingAddress: existingCust.shippingAddress,
          gstin: existingCust.gstin,
        };
      } else {
        const nc = {
          id: generateId('cust'),
          name: cleanName,
          contactPerson: body.newCustomer.contactPerson?.trim() || '',
          phone: body.newCustomer.phone?.trim() || '',
          email: body.newCustomer.email?.trim() || '',
          billingAddress: body.newCustomer.address?.trim() || '',
          shippingAddress: body.newCustomer.address?.trim() || '',
          gstin: body.newCustomer.gstin?.trim() || '',
          notes: '',
          createdAt: now,
          updatedAt: now,
        };
        await CustomerModel.create(nc);
        customerId = nc.id;
        customerSnapshot = {
          name: nc.name,
          contactPerson: nc.contactPerson,
          phone: nc.phone,
          email: nc.email,
          billingAddress: nc.billingAddress,
          shippingAddress: nc.shippingAddress,
          gstin: nc.gstin,
        };
      }
    } else {
      const existing = await CustomerModel.findOne({ id: customerId }).lean();
      if (!existing) throw new Error('Selected customer not found.');
      customerSnapshot = {
        name: existing.name,
        contactPerson: existing.contactPerson,
        phone: existing.phone,
        email: existing.email,
        billingAddress: existing.billingAddress,
        shippingAddress: existing.shippingAddress,
        gstin: existing.gstin,
      };
    }

    const allProducts = await ProductModel.find().lean();
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    const items = body.items.map((it: any) => {
      const prod = productMap.get(it.productId);
      const qty = Number(it.quantity);
      if (!qty || qty <= 0) throw new Error('Product quantity must be greater than zero.');
      return {
        id: generateId('ei'),
        productId: prod?.id || it.productId || '',
        productName: prod?.name || it.productName || 'Custom Product',
        model: it.model?.trim() || prod?.model || '',
        quantity: qty,
        requiredSpecifications: it.requiredSpecifications?.trim() || prod?.specifications || '',
        customerRequirements: it.customerRequirements?.trim() || '',
      };
    });

    const docNo = await mongoERPRepository.getNextDocNo('ENQ');
    const enquiry = {
      id: generateId('enq'),
      docNo,
      customerId,
      customerSnapshot,
      source: body.source || 'Direct',
      items,
      expectedDeliveryDate: body.expectedDeliveryDate || '',
      notes: body.notes?.trim() || '',
      status: 'New' as const,
      assignedTo: body.assignedTo?.trim() || req.user!.name,
      createdBy: req.user!.name,
      createdAt: now,
      updatedAt: now,
    };

    await EnquiryModel.create(enquiry);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Created Enquiry',
      entityType: 'Enquiry',
      entityId: enquiry.id,
      entityDocNo: enquiry.docNo,
      details: `Logged enquiry ${enquiry.docNo} for ${customerSnapshot.name}.`,
    });

    res.status(201).json(enquiry);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post(['/sales/enquiries/:id/status', '/sales/enquiries/:id/qualify'], requireAuth, requirePerm('sales', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const isQualifyRoute = req.originalUrl.includes('/qualify');
    const bodyStatus = (req.body as any)?.status;
    const rejectionReason = (req.body as any)?.rejectionReason;
    const status = bodyStatus || (isQualifyRoute ? 'Qualified' : undefined);
    const enq = await EnquiryModel.findOne({ id: req.params.id });
    if (!enq) throw new Error('NOT_FOUND:Enquiry not found.');
    if (!status) throw new Error('Status is required.');
    if (status === 'Rejected' && !rejectionReason?.trim()) {
      throw new Error('Rejection reason is required when rejecting an enquiry.');
    }

    enq.status = status as any;
    if (status === 'Rejected') {
      enq.rejectionReason = rejectionReason?.trim();
      await FollowUpModel.updateMany(
        { entityType: 'enquiry', entityId: enq.id, status: 'Scheduled' },
        { $set: { status: 'Cancelled' } },
      );
    }
    enq.updatedAt = new Date().toISOString();
    await enq.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: `Enquiry ${status}`,
      entityType: 'Enquiry',
      entityId: enq.id,
      entityDocNo: enq.docNo,
      details: `Updated ${enq.docNo} status to ${status}.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
    });

    res.json(enq.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

// --- FOLLOW-UPS ---

salesRouter.post('/sales/follow-ups', requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.entityType || !body.entityId || !body.discussion?.trim()) {
      throw new Error('Reference document and discussion details are required.');
    }
    if (body.response === 'Rejected' && !body.rejectionReason?.trim()) {
      throw new Error('Rejection reason is required when customer rejects.');
    }

    const now = new Date().toISOString();
    let entityDocNo = '';
    let customerName = '';
    let summary = '';

    if (body.entityType === 'enquiry') {
      const enq = await EnquiryModel.findOne({ id: body.entityId });
      if (!enq) throw new Error('NOT_FOUND:Enquiry not found.');
      entityDocNo = enq.docNo;
      customerName = enq.customerSnapshot.name;
      summary = enq.items.map((i) => `${i.quantity}x ${i.model || i.productName}`).join(', ');
      if (body.response === 'Accepted') {
        enq.status = 'Qualified';
      } else if (body.response === 'Rejected') {
        enq.status = 'Rejected';
        enq.rejectionReason = body.rejectionReason.trim();
      } else if (enq.status === 'New') {
        enq.status = 'Contacted';
      }
      enq.updatedAt = now;
      await enq.save();
    } else {
      const qt = await QuotationModel.findOne({ id: body.entityId });
      if (!qt) throw new Error('NOT_FOUND:Quotation not found.');
      entityDocNo = qt.docNo;
      customerName = qt.customerSnapshot.name;
      summary = qt.items.map((i) => `${i.quantity}x ${i.model || i.productName}`).join(', ');
      if (body.response === 'Accepted') {
        qt.status = 'Accepted';
        qt.acceptedAt = now;
        qt.acceptedBy = req.user!.name;
      } else if (body.response === 'Rejected') {
        qt.status = 'Rejected';
        qt.rejectionReason = body.rejectionReason.trim();
      } else if (body.response === 'Negotiation') {
        qt.status = 'Negotiation';
      } else if (qt.status === 'Sent') {
        qt.status = 'Pending';
      }
      qt.updatedAt = now;
      await qt.save();
    }

    await FollowUpModel.updateMany(
      { entityType: body.entityType, entityId: body.entityId, status: 'Scheduled' },
      { $set: { status: body.response === 'Rejected' ? 'Cancelled' : 'Completed' } },
    );

    const fu = {
      id: generateId('fu'),
      entityType: body.entityType,
      entityId: body.entityId,
      entityDocNo,
      customerName,
      summary,
      followUpDate: body.followUpDate || now.slice(0, 10),
      contactMethod: body.contactMethod || 'Call',
      discussion: body.discussion.trim(),
      nextFollowUpDate: body.response === 'Accepted' || body.response === 'Rejected' ? undefined : body.nextFollowUpDate || undefined,
      response: body.response || 'Pending',
      rejectionReason: body.rejectionReason?.trim() || undefined,
      status: (body.nextFollowUpDate && body.response !== 'Accepted' && body.response !== 'Rejected' ? 'Scheduled' : 'Completed') as
        | 'Scheduled'
        | 'Completed',
      followedBy: req.user!.name,
      createdAt: now,
    };

    await FollowUpModel.create(fu);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Recorded Follow-up',
      entityType: body.entityType === 'enquiry' ? 'Enquiry' : 'Quotation',
      entityId: body.entityId,
      entityDocNo,
      details: `Follow-up via ${fu.contactMethod} — Response: ${fu.response}.`,
    });

    res.status(201).json(fu);
  } catch (err) {
    sendError(res, err);
  }
});

// --- QUOTATIONS ---

salesRouter.post('/sales/quotations', requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const enq = await EnquiryModel.findOne({ id: body.enquiryId });
    if (!enq) throw new Error('NOT_FOUND:Linked qualified enquiry not found.');
    if (enq.status !== 'Qualified') {
      throw new Error('Quotations can only be created from Qualified enquiries.');
    }
    const existingQt = await QuotationModel.findOne({ enquiryId: enq.id });
    if (existingQt) {
      throw new Error(`Quotation already exists for this enquiry (${existingQt.docNo}). Duplicate quotation creation blocked. Use revision instead.`);
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new Error('At least one quotation line item is required.');
    }
    const items: QuotationItem[] = normalizeQuotationItems(
      body.items.map((it: any) => ({
        id: it.id || generateId('qi'),
        productId: it.productId || '',
        productName: it.productName?.trim() || 'Product',
        model: it.model?.trim() || '',
        specifications: it.specifications?.trim() || '',
        quantity: Math.max(1, Number(it.quantity) || 1),
        unitPrice: Math.max(0, Number(it.unitPrice) || 0),
        highlights: Array.isArray(it.highlights) ? it.highlights.filter((h: string) => h.trim()) : [],
      })),
    );
    const discountPercent = Number(body.discountPercent) || 0;
    const taxPercent = Number(body.taxPercent ?? 18);
    const totals = calculateQuotationTotals(items, discountPercent, taxPercent);

    const baseDocNo = await mongoERPRepository.getNextDocNo('QT');
    const now = new Date().toISOString();
    const qt = {
      id: generateId('qt'),
      docNo: `${baseDocNo}-V1`,
      baseDocNo,
      version: 1,
      enquiryId: enq.id,
      enquiryDocNo: enq.docNo,
      customerId: enq.customerId,
      customerSnapshot: enq.customerSnapshot,
      quotationDate: body.quotationDate || now.slice(0, 10),
      validityDate: body.validityDate || now.slice(0, 10),
      items,
      subtotal: totals.subtotal,
      discountPercent,
      discountAmount: totals.discountAmount,
      taxPercent,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      paymentTerms: body.paymentTerms?.trim() || '50% Advance with Purchase Order, 50% prior to dispatch.',
      deliveryTerms: body.deliveryTerms?.trim() || 'Ex-Works Bengaluru. 3–4 weeks from receipt of PO and advance.',
      warranty: body.warranty?.trim() || '24 months comprehensive warranty from date of commissioning.',
      remarks: body.remarks?.trim() || '',
      status: (body.status === 'Sent' ? 'Sent' : 'Draft') as 'Draft' | 'Sent',
      createdBy: req.user!.name,
      createdAt: now,
      updatedAt: now,
    };

    await QuotationModel.create(qt);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Created Quotation',
      entityType: 'Quotation',
      entityId: qt.id,
      entityDocNo: qt.docNo,
      details: `Created ${qt.docNo} from ${enq.docNo} for ${enq.customerSnapshot.name}.`,
    });

    res.status(201).json(qt);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post('/sales/quotations/:id/revise', requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const revised = await mongoERPRepository.reviseQuotation(req.params.id as string, req.body, {
      id: req.user!.id,
      name: req.user!.name,
    });
    res.status(201).json(revised);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post(['/sales/quotations/:id/accept', '/sales/quotations/:id/accepted'], requireAuth, requirePerm('sales', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const qt = await QuotationModel.findOne({ id: req.params.id });
    if (!qt) throw new Error('NOT_FOUND:Quotation not found.');
    if (qt.status === 'Superseded') {
      throw new Error('Superseded quotation versions cannot be accepted.');
    }
    if (qt.status === 'Pending Approval') {
      throw new Error('Quotation cannot be accepted while pending approval.');
    }
    if (qt.status === 'Changes Requested') {
      throw new Error('Quotation cannot be accepted while changes are requested.');
    }
    if (qt.status === 'Accepted') {
      return res.json(qt.toObject());
    }
    const alreadyAccepted = await QuotationModel.findOne({
      baseDocNo: qt.baseDocNo,
      id: { $ne: qt.id },
      status: 'Accepted',
    });
    if (alreadyAccepted) {
      throw new Error(`Another revision (${alreadyAccepted.docNo}) is already accepted.`);
    }
    qt.status = 'Accepted';
    qt.acceptedAt = new Date().toISOString();
    qt.acceptedBy = req.user!.name;
    qt.updatedAt = new Date().toISOString();
    await qt.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Accepted Quotation',
      entityType: 'Quotation',
      entityId: qt.id,
      entityDocNo: qt.docNo,
      details: `Accepted quotation ${qt.docNo}. Ready for Proforma Invoice generation.`,
    });

    res.json(qt.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post(['/sales/quotations/:id/reject', '/sales/quotations/:id/rejected'], requireAuth, requirePerm('sales', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const reason = (req.body.reason || req.body.rejectionReason || '').trim();
    if (!reason) throw new Error('Rejection reason is required.');
    const qt = await QuotationModel.findOne({ id: req.params.id });
    if (!qt) throw new Error('NOT_FOUND:Quotation not found.');
    if (qt.status === 'Superseded') {
      throw new Error('Superseded quotation versions cannot be rejected.');
    }
    qt.status = 'Rejected';
    qt.rejectionReason = reason;
    qt.updatedAt = new Date().toISOString();
    await qt.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Rejected Quotation',
      entityType: 'Quotation',
      entityId: qt.id,
      entityDocNo: qt.docNo,
      details: `Rejected quotation ${qt.docNo}. Reason: ${reason}`,
    });

    res.json(qt.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post('/sales/quotations/:id/submit-approval', requireAuth, requirePerm('sales', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const qt = await QuotationModel.findOne({ id: req.params.id });
    if (!qt) throw new Error('NOT_FOUND:Quotation not found.');
    if (qt.status === 'Superseded') throw new Error('Superseded quotation versions cannot be submitted for approval.');
    if (qt.status === 'Accepted') throw new Error('Quotation is already accepted.');
    if (qt.status === 'Pending Approval') throw new Error('Quotation is already pending approval.');

    const wf = await ApprovalWorkflowModel.findOne({ module: 'quotations', triggerAction: 'submit', enabled: true });

    if (!wf) {
      qt.status = 'Approved';
      qt.updatedAt = new Date().toISOString();
      await qt.save();

      await mongoERPRepository.addActivity({
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Approved Quotation',
        entityType: 'Quotation',
        entityId: qt.id,
        entityDocNo: qt.docNo,
        details: `Quotation ${qt.docNo} approved directly (no workflow active).`,
      });

      res.json({ ok: true, approvalRequired: false, quotation: qt.toObject() });
      return;
    }

    qt.status = 'Pending Approval';
    qt.updatedAt = new Date().toISOString();
    await qt.save();

    const approvalReq = {
      id: generateId('apr'),
      workflowId: wf.id,
      workflowName: wf.name,
      department: 'sales' as const,
      module: 'quotations',
      documentId: qt.id,
      documentDocNo: qt.docNo,
      documentVersion: `V${qt.version}`,
      submittedBy: {
        id: req.user!.id,
        name: req.user!.name,
        employeeId: req.user!.employeeId,
        roleId: req.user!.roleId,
        department: req.user!.department,
      },
      submittedAt: new Date().toISOString(),
      documentSnapshot: {
        docNo: qt.docNo,
        customerName: qt.customerSnapshot?.name,
        subtotal: qt.subtotal,
        discountPercent: qt.discountPercent,
        discountAmount: qt.discountAmount,
        taxPercent: qt.taxPercent,
        taxAmount: qt.taxAmount,
        totalAmount: qt.totalAmount,
        itemsCount: qt.items.length,
        items: qt.items,
        paymentTerms: qt.paymentTerms,
        deliveryTerms: qt.deliveryTerms,
        warranty: qt.warranty,
      },
      currentLevel: 1,
      totalLevels: wf.approvalLevels.length,
      status: 'pending' as const,
      decisions: [],
    };

    await ApprovalRequestModel.create(approvalReq);

    await mongoERPRepository.addNotification({
      title: `Approval Required: Quotation ${qt.docNo}`,
      message: `${req.user!.name} submitted ${qt.docNo} (₹${qt.totalAmount.toLocaleString('en-IN')}) for approval.`,
      department: 'sales',
      severity: 'info',
      link: '/admin/approvals',
      relatedModule: 'quotations',
      relatedDocumentId: qt.id,
    });

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Submitted Quotation for Approval',
      entityType: 'Quotation',
      entityId: qt.id,
      entityDocNo: qt.docNo,
      details: `Submitted quotation ${qt.docNo} for multi-level approval under ${wf.name}.`,
    });

    res.json({ ok: true, approvalRequired: true, quotation: qt.toObject(), approvalRequest: approvalReq });
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post('/sales/quotations/:id/sent', requireAuth, requirePerm('sales', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const qt = await QuotationModel.findOne({ id: req.params.id });
    if (!qt) throw new Error('NOT_FOUND:Quotation not found.');
    if (qt.status === 'Superseded') throw new Error('Superseded quotation versions cannot be modified.');
    if (qt.status === 'Pending Approval') {
      throw new Error('Quotation cannot be sent to customer while pending approval.');
    }
    if (qt.status === 'Changes Requested') {
      throw new Error('Quotation cannot be sent while changes are requested. Please revise and resubmit.');
    }
    qt.status = 'Sent';
    qt.updatedAt = new Date().toISOString();
    await qt.save();
    res.json(qt.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post('/sales/quotations/:id/status', requireAuth, requirePerm('sales', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { status, rejectionReason } = req.body as { status: string; rejectionReason?: string };
    const qt = await QuotationModel.findOne({ id: req.params.id });
    if (!qt) throw new Error('NOT_FOUND:Quotation not found.');
    if (qt.status === 'Superseded') {
      throw new Error('Superseded quotation versions cannot be modified.');
    }
    if (status === 'Rejected' && !rejectionReason?.trim()) {
      throw new Error('Rejection reason is required.');
    }
    if (status === 'Accepted') {
      const alreadyAccepted = await QuotationModel.findOne({
        baseDocNo: qt.baseDocNo,
        id: { $ne: qt.id },
        status: 'Accepted',
      });
      if (alreadyAccepted) {
        throw new Error(`Another revision (${alreadyAccepted.docNo}) is already accepted.`);
      }
      qt.acceptedAt = new Date().toISOString();
      qt.acceptedBy = req.user!.name;
    }
    qt.status = status as any;
    if (rejectionReason) qt.rejectionReason = rejectionReason.trim();
    qt.updatedAt = new Date().toISOString();
    await qt.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: `Quotation ${status}`,
      entityType: 'Quotation',
      entityId: qt.id,
      entityDocNo: qt.docNo,
      details: `Marked ${qt.docNo} as ${status}.`,
    });

    res.json(qt.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

// --- PROFORMA INVOICES ---

salesRouter.post('/sales/proforma-invoices', requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { quotationId, piDate, remarks } = req.body;
    const qt = await QuotationModel.findOne({ id: quotationId });
    if (!qt) throw new Error('NOT_FOUND:Quotation not found.');
    if (qt.status !== 'Accepted') {
      throw new Error('Proforma Invoice can only be generated from an Accepted quotation version.');
    }

    const existingPI = await ProformaInvoiceModel.findOne({
      quotationId: qt.id,
      status: { $ne: 'Cancelled' },
    });
    if (existingPI) {
      throw new Error(`A Proforma Invoice already exists for ${qt.docNo}.`);
    }

    const now = new Date().toISOString();
    const docNo = await mongoERPRepository.getNextDocNo('PI');
    const pi = {
      id: generateId('pi'),
      docNo,
      piDate: piDate || now.slice(0, 10),
      quotationId: qt.id,
      quotationDocNo: qt.docNo,
      enquiryId: qt.enquiryId,
      customerId: qt.customerId,
      customerSnapshot: qt.customerSnapshot,
      items: qt.items,
      subtotal: qt.subtotal,
      discountAmount: qt.discountAmount,
      taxPercent: qt.taxPercent,
      taxAmount: qt.taxAmount,
      totalAmount: qt.totalAmount,
      paymentTerms: qt.paymentTerms,
      deliveryTerms: qt.deliveryTerms,
      bankDetails: {
        bankName: 'HDFC Bank Ltd.',
        accountName: 'CRYO Scientific Systems Pvt. Ltd.',
        accountNumber: '50200048912045',
        ifsc: 'HDFC0000184',
        branch: 'Peenya Industrial Estate, Bengaluru',
      },
      remarks: remarks?.trim() || `Generated from accepted quotation ${qt.docNo}.`,
      status: 'Issued' as const,
      createdBy: req.user!.name,
      createdAt: now,
    };

    await ProformaInvoiceModel.create(pi);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Generated Proforma Invoice',
      entityType: 'ProformaInvoice',
      entityId: pi.id,
      entityDocNo: pi.docNo,
      details: `Generated ${pi.docNo} from ${qt.docNo} for ${pi.customerSnapshot.name}.`,
    });

    res.status(201).json(pi);
  } catch (err) {
    sendError(res, err);
  }
});

// --- CUSTOMER POS ---

salesRouter.post('/sales/customer-pos', requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.piId || !body.customerPoNumber?.trim()) {
      throw new Error('Proforma Invoice reference and Customer PO number are required.');
    }
    const pi = await ProformaInvoiceModel.findOne({ id: body.piId });
    if (!pi) throw new Error('NOT_FOUND:Proforma Invoice not found.');

    const existingCPO = await CustomerPOModel.findOne({ piId: pi.id });
    if (existingCPO) {
      throw new Error(`Customer PO already recorded for ${pi.docNo}.`);
    }

    const now = new Date().toISOString();
    const hasDiscrepancy = Boolean(body.hasDiscrepancy);
    const docNo = await mongoERPRepository.getNextDocNo('CPO');
    const cpo = {
      id: generateId('cpo'),
      docNo,
      piId: pi.id,
      piDocNo: pi.docNo,
      customerId: pi.customerId,
      customerName: pi.customerSnapshot.name,
      customerPoNumber: body.customerPoNumber.trim(),
      receivedDate: body.receivedDate || now.slice(0, 10),
      expectedDeliveryDate: body.expectedDeliveryDate || '',
      attachmentName: body.attachmentName || undefined,
      attachmentDataUrl: body.attachmentDataUrl || undefined,
      hasDiscrepancy,
      discrepancyNotes: hasDiscrepancy ? body.discrepancyNotes?.trim() || 'Terms differ from PI.' : undefined,
      discrepancyResolved: !hasDiscrepancy,
      remarks: body.remarks?.trim() || '',
      createdBy: req.user!.name,
      createdAt: now,
    };

    await CustomerPOModel.create(cpo);

    if (pi.status === 'Issued') {
      pi.status = 'PO Received';
      await pi.save();
    }

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Recorded Customer PO',
      entityType: 'CustomerPO',
      entityId: cpo.id,
      entityDocNo: cpo.docNo,
      details: `Recorded customer PO ${cpo.customerPoNumber} against ${pi.docNo}.`,
    });

    res.status(201).json(cpo);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post(['/sales/customer-pos/:id/resolve', '/sales/customer-pos/:id/resolve-discrepancy'], requireAuth, requirePerm('sales', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const cpo = await CustomerPOModel.findOne({ id: req.params.id });
    if (!cpo) throw new Error('NOT_FOUND:Customer PO not found.');
    cpo.discrepancyResolved = true;
    const notes = typeof req.body === 'string' ? req.body : req.body?.resolutionNotes || req.body?.notes || 'Confirmed aligned with PI';
    cpo.remarks = `${cpo.remarks ? cpo.remarks + ' | ' : ''}Discrepancy resolved by ${req.user!.name}: ${notes}`;
    await cpo.save();
    res.json(cpo.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

// --- PAYMENTS ---

salesRouter.post('/sales/payments', requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const amount = round2(Number(body.amount));
    if (!amount || amount <= 0) throw new Error('Payment amount must be greater than zero.');
    const ref = (body.transactionRef || body.referenceNumber)?.trim();
    if (!ref) throw new Error('Transaction reference is required.');

    const cleanRef = ref.toLowerCase();
    const existingRef = await PaymentEntryModel.findOne({
      transactionRef: new RegExp(`^${cleanRef}$`, 'i'),
      status: { $nin: ['Rejected', 'Reversed'] },
    });
    if (existingRef) {
      throw new Error(`Duplicate transaction reference "${ref}".`);
    }

    const pi = body.piId ? await ProformaInvoiceModel.findOne({ id: body.piId }) : null;
    let so = body.salesOrderId
      ? await SalesOrderModel.findOne({ id: body.salesOrderId })
      : pi
        ? await SalesOrderModel.findOne({ piId: pi.id })
        : null;
    const linkedPi = pi || (so ? await ProformaInvoiceModel.findOne({ id: so.piId }) : null);

    if (!linkedPi && !so) {
      throw new Error('Select a valid Proforma Invoice or Sales Order.');
    }

    const orderTotal = so?.totalAmount ?? linkedPi!.totalAmount;
    const allPayments = await PaymentEntryModel.find().lean();
    const existingSummary = calculatePaymentSummary(orderTotal, allPayments as any, {
      piId: linkedPi?.id,
      salesOrderId: so?.id,
    });
    if (amount > existingSummary.outstandingBalance + 0.01) {
      throw new Error(`Payment amount exceeds outstanding balance (${existingSummary.outstandingBalance}).`);
    }

    const canAutoVerify =
      req.user!.permissions.sales.includes('approve') || req.user!.permissions.sales.includes('manage');
    const now = new Date().toISOString();
    const docNo = await mongoERPRepository.getNextDocNo('PAY');

    const payment = {
      id: generateId('pay'),
      docNo,
      piId: linkedPi?.id,
      piDocNo: linkedPi?.docNo,
      salesOrderId: so?.id,
      salesOrderDocNo: so?.docNo,
      customerId: so?.customerId || linkedPi!.customerId,
      customerName: so?.customerSnapshot.name || linkedPi!.customerSnapshot.name,
      amount,
      paymentDate: body.paymentDate || now.slice(0, 10),
      method: body.method || 'Bank Transfer',
      paymentType: body.paymentType || 'Advance',
      transactionRef: ref,
      proofName: body.proofName || undefined,
      proofDataUrl: body.proofDataUrl || undefined,
      status: (canAutoVerify && body.autoVerify !== false ? 'Verified' : 'Pending') as 'Pending' | 'Verified',
      verifiedBy: canAutoVerify && body.autoVerify !== false ? req.user!.name : undefined,
      verifiedAt: canAutoVerify && body.autoVerify !== false ? now : undefined,
      remarks: body.remarks?.trim() || '',
      createdBy: req.user!.name,
      createdAt: now,
    };

    await PaymentEntryModel.create(payment);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Recorded Payment',
      entityType: 'Payment',
      entityId: payment.id,
      entityDocNo: payment.docNo,
      details: `Recorded ${payment.paymentType} payment of ₹${amount.toLocaleString('en-IN')} (${payment.status}) for ${payment.customerName}.`,
    });

    res.status(201).json(payment);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post('/sales/payments/:id/verify', requireAuth, requirePerm('sales', 'approve'), async (req: AuthenticatedRequest, res) => {
  try {
    const { status, remarks } = req.body as { status: 'Verified' | 'Rejected' | 'Reversed'; remarks?: string };
    const p = await PaymentEntryModel.findOne({ id: req.params.id });
    if (!p) throw new Error('NOT_FOUND:Payment not found.');

    p.status = status || 'Verified';
    p.verifiedBy = req.user!.name;
    p.verifiedAt = new Date().toISOString();
    if (remarks) p.remarks = `${p.remarks ? p.remarks + ' | ' : ''}${remarks}`;
    await p.save();

    res.json(p.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

// --- SALES ORDERS ---

salesRouter.post(['/sales/orders/confirm', '/sales/sales-orders/confirm', '/sales/sales-orders'], requireAuth, requirePerm('sales', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const pi = await ProformaInvoiceModel.findOne({ id: body.piId });
    if (!pi) throw new Error('NOT_FOUND:Proforma Invoice not found.');

    const existingSO = await SalesOrderModel.findOne({
      piId: pi.id,
      commercialStatus: { $ne: 'Cancelled' },
    });
    if (existingSO) {
      throw new Error(`Sales Order already confirmed for ${pi.docNo}. Duplicate conversion blocked.`);
    }

    const cpo = await CustomerPOModel.findOne({ piId: pi.id });
    if (!cpo) {
      throw new Error('A Customer Purchase Order must be recorded against this PI before confirming Sales Order.');
    }
    if (cpo.hasDiscrepancy && !cpo.discrepancyResolved) {
      throw new Error('Customer PO has an unresolved discrepancy against the PI. Resolve it before confirming SO.');
    }

    const qt = await QuotationModel.findOne({ id: pi.quotationId });
    if (!qt || qt.status !== 'Accepted') {
      throw new Error('Linked quotation must be in Accepted status.');
    }

    const payments = await PaymentEntryModel.find({ piId: pi.id }).lean();
    const paySummary = calculatePaymentSummary(pi.totalAmount, payments as any, { piId: pi.id });
    if (paySummary.verifiedReceived <= 0 && !body.allowCreditTerms) {
      throw new Error('At least one verified advance payment is required before confirming SO (or enable agreed credit terms).');
    }

    const now = new Date().toISOString();
    const soDocNo = await mongoERPRepository.getNextDocNo('SO');

    const so = {
      id: generateId('so'),
      docNo: soDocNo,
      enquiryId: qt.enquiryId,
      enquiryDocNo: qt.enquiryDocNo,
      quotationId: qt.id,
      quotationDocNo: qt.docNo,
      piId: pi.id,
      piDocNo: pi.docNo,
      customerPoId: cpo.id,
      customerPoDocNo: cpo.docNo,
      customerPoNumber: cpo.customerPoNumber,
      customerId: pi.customerId,
      customerSnapshot: pi.customerSnapshot,
      items: pi.items,
      subtotal: pi.subtotal,
      discountAmount: pi.discountAmount,
      taxAmount: pi.taxAmount,
      totalAmount: pi.totalAmount,
      paymentTerms: pi.paymentTerms,
      deliveryTerms: pi.deliveryTerms,
      deliveryAddress: body.deliveryAddress?.trim() || pi.customerSnapshot.shippingAddress || pi.customerSnapshot.billingAddress,
      promisedDeliveryDate: body.promisedDeliveryDate || cpo.expectedDeliveryDate || now.slice(0, 10),
      priority: body.priority || 'Normal',
      commercialStatus: 'Confirmed' as const,
      fulfillmentStatus: 'Awaiting Production' as const,
      remarks: body.remarks?.trim() || '',
      createdBy: req.user!.name,
      createdAt: now,
      updatedAt: now,
    };

    await SalesOrderModel.create(so);

    pi.status = 'Converted';
    await pi.save();

    await PaymentEntryModel.updateMany(
      { piId: pi.id, salesOrderId: { $exists: false } },
      { $set: { salesOrderId: so.id, salesOrderDocNo: so.docNo } },
    );

    await mongoERPRepository.addNotification({
      title: `New Confirmed Sales Order: ${so.docNo}`,
      message: `${so.customerSnapshot.name} — ${so.items.map((i) => `${i.quantity}x ${i.model}`).join(', ')}. Ready for Production Order creation.`,
      department: 'production',
      severity: 'info',
      link: '/production/received-orders',
    });

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'sales',
      action: 'Confirmed Sales Order',
      entityType: 'SalesOrder',
      entityId: so.id,
      entityDocNo: so.docNo,
      details: `Confirmed ${so.docNo} from ${pi.docNo} & ${cpo.docNo}. Released to Production.`,
    });

    res.status(201).json(so);
  } catch (err) {
    sendError(res, err);
  }
});
