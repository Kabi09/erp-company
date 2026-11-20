import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import type {
  BOMItem,
  CustomerSnapshot,
  ERPDatabase,
  GRNItem,
  MaterialRequestItem,
  QuotationItem,
  SupplierPOItem,
} from '../src/types/erp';
import {
  calculateDurationDays,
  calculatePaymentSummary,
  calculateQuotationTotals,
  computeMaterialStockMap,
  deriveMaterialRequestStatus,
  deriveSalesOrderFulfillment,
  getAvailableDispatchQty,
  getRemainingSOAllocatableQty,
  normalizeQuotationItems,
  round2,
  validateMaterialIssueLine,
} from '../src/utils/erpLogic';
import { requireAuth, requirePerm, resolveAuthUser, signToken, type AuthenticatedRequest } from './auth';
import { addActivity, addNotification, dbStore, generateId, nextDocNo } from './db';

export const apiRouter = Router();

function sendError(res: Response, err: unknown, defaultStatus = 400): void {
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  const status = message.startsWith('FORBIDDEN:') ? 403 : message.startsWith('NOT_FOUND:') ? 404 : defaultStatus;
  res.status(status).json({ error: message.replace(/^(FORBIDDEN|NOT_FOUND):/, '').trim() });
}

function syncSOFulfillment(draft: ERPDatabase, salesOrderId: string): void {
  const so = draft.salesOrders.find((s) => s.id === salesOrderId);
  if (!so) return;
  so.fulfillmentStatus = deriveSalesOrderFulfillment(so, draft.productionOrders, draft.deliveryOrders);
  so.updatedAt = new Date().toISOString();
}

// ==========================================
// AUTHENTICATION & PROFILE
// ==========================================

apiRouter.post('/auth/login', (req, res) => {
  try {
    const { identifier, password } = req.body as { identifier?: string; password?: string };
    if (!identifier || !password) {
      res.status(400).json({ error: 'Email / Employee ID and password are required.' });
      return;
    }
    const cleanId = identifier.trim().toLowerCase();
    const state = dbStore.getState();
    const emp = state.employees.find(
      (e) => e.email.toLowerCase() === cleanId || e.employeeId.toLowerCase() === cleanId,
    );
    if (!emp) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }
    if (emp.status !== 'Active') {
      res.status(403).json({ error: 'Your employee account is inactive. Contact Administration.' });
      return;
    }
    const valid = emp.passwordHash ? bcrypt.compareSync(password, emp.passwordHash) : false;
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }
    const user = resolveAuthUser(emp.id);
    if (!user) {
      res.status(403).json({ error: 'No valid role assigned to this account.' });
      return;
    }
    const token = signToken(emp.id);
    res.json({ token, user });
  } catch (err) {
    sendError(res, err, 500);
  }
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

apiRouter.patch('/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { name, phone, newPassword } = req.body as { name?: string; phone?: string; newPassword?: string };
    const updatedUser = dbStore.mutate((draft) => {
      const emp = draft.employees.find((e) => e.id === req.user!.id);
      if (!emp) throw new Error('NOT_FOUND:Employee record not found.');
      if (name && name.trim()) emp.name = name.trim();
      if (phone !== undefined) emp.phone = phone.trim();
      if (newPassword && newPassword.trim().length >= 6) {
        emp.passwordHash = bcrypt.hashSync(newPassword.trim(), 8);
      }
      return emp.id;
    });
    res.json({ user: resolveAuthUser(updatedUser) });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// BOOTSTRAP SNAPSHOT (Authenticated)
// ==========================================

apiRouter.get('/erp/bootstrap', requireAuth, (req: AuthenticatedRequest, res) => {
  const state = dbStore.getState();
  const sanitizedEmployees = state.employees.map(({ passwordHash: _ph, ...rest }) => rest);
  const stockMap = computeMaterialStockMap(state.stockTransactions);
  res.json({
    ...state,
    employees: sanitizedEmployees,
    stockMap,
    currentUser: req.user,
  });
});

// ==========================================
// NOTIFICATIONS
// ==========================================

apiRouter.post('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    dbStore.mutate((draft) => {
      const n = draft.notifications.find((x) => x.id === req.params.id);
      if (n && !n.readBy.includes(req.user!.id)) {
        n.readBy.push(req.user!.id);
      }
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    dbStore.mutate((draft) => {
      for (const n of draft.notifications) {
        if (!n.readBy.includes(req.user!.id)) {
          n.readBy.push(req.user!.id);
        }
      }
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// DEPARTMENT 1: SALES MANAGEMENT
// ==========================================

apiRouter.post('/sales/customers', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim()) throw new Error('Customer / company name is required.');
    const customer = dbStore.mutate((draft) => {
      const dup = draft.customers.find(
        (c) =>
          c.name.toLowerCase() === body.name.trim().toLowerCase() ||
          (body.gstin?.trim() && c.gstin && c.gstin.toLowerCase() === body.gstin.trim().toLowerCase()),
      );
      if (dup && !body.allowDuplicate) {
        throw new Error(`Customer "${dup.name}" already exists with matching name or GSTIN.`);
      }
      const now = new Date().toISOString();
      const created = {
        id: generateId('cust'),
        name: body.name.trim(),
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
      draft.customers.unshift(created);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Created Customer',
        entityType: 'Customer',
        entityId: created.id,
        entityDocNo: created.name,
        details: `Added customer ${created.name}.`,
      });
      return created;
    });
    res.status(201).json(customer);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.put('/sales/customers/:id', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const c = draft.customers.find((x) => x.id === req.params.id);
      if (!c) throw new Error('NOT_FOUND:Customer not found.');
      if (!body.name?.trim()) throw new Error('Customer name is required.');
      c.name = body.name.trim();
      c.contactPerson = body.contactPerson?.trim() || '';
      c.phone = body.phone?.trim() || '';
      c.email = body.email?.trim() || '';
      c.billingAddress = body.billingAddress?.trim() || '';
      c.shippingAddress = body.shippingAddress?.trim() || '';
      c.gstin = body.gstin?.trim() || '';
      c.notes = body.notes?.trim() || '';
      c.updatedAt = new Date().toISOString();
      return c;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/products', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim() || !body.code?.trim()) throw new Error('Product name and code are required.');
    const created = dbStore.mutate((draft) => {
      if (draft.products.some((p) => p.code.toLowerCase() === body.code.trim().toLowerCase())) {
        throw new Error(`Product code ${body.code} already exists.`);
      }
      const product = {
        id: generateId('prod-cat'),
        code: body.code.trim().toUpperCase(),
        name: body.name.trim(),
        category: body.category?.trim() || 'Scientific Equipment',
        model: body.model?.trim() || '',
        specifications: body.specifications?.trim() || '',
        highlights: Array.isArray(body.highlights) ? body.highlights.filter((h: string) => h.trim()) : [],
        sellingPrice: Number(body.sellingPrice) || 0,
        unit: body.unit?.trim() || 'Unit',
        description: body.description?.trim() || '',
        status: (body.status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
        bomTemplate: Array.isArray(body.bomTemplate) ? body.bomTemplate : [],
        stages: Array.isArray(body.stages) && body.stages.length > 0
          ? body.stages
          : ['Cabinet Fabrication', 'Cooling & Mechanical Assembly', 'Electrical & Controller Wiring', 'Final Assembly & Testing'],
        createdAt: new Date().toISOString(),
      };
      draft.products.unshift(product);
      return product;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.put('/sales/products/:id', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const p = draft.products.find((x) => x.id === req.params.id);
      if (!p) throw new Error('NOT_FOUND:Product not found.');
      p.name = body.name?.trim() || p.name;
      p.category = body.category?.trim() || p.category;
      p.model = body.model?.trim() || p.model;
      p.specifications = body.specifications?.trim() || p.specifications;
      p.highlights = Array.isArray(body.highlights) ? body.highlights.filter((h: string) => h.trim()) : p.highlights;
      p.sellingPrice = Number(body.sellingPrice ?? p.sellingPrice);
      p.unit = body.unit?.trim() || p.unit;
      p.description = body.description?.trim() ?? p.description;
      p.status = body.status === 'Inactive' ? 'Inactive' : 'Active';
      if (Array.isArray(body.bomTemplate)) p.bomTemplate = body.bomTemplate;
      return p;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/enquiries', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new Error('At least one product line is required.');
    }
    const created = dbStore.mutate((draft) => {
      const now = new Date().toISOString();
      let customerId = body.customerId as string;
      let customerSnapshot: CustomerSnapshot;

      if (body.isNewCustomer || !customerId) {
        if (!body.newCustomer?.name?.trim()) throw new Error('Customer / company name is required.');
        const nc = {
          id: generateId('cust'),
          name: body.newCustomer.name.trim(),
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
        draft.customers.unshift(nc);
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
      } else {
        const existing = draft.customers.find((c) => c.id === customerId);
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

      const items = body.items.map((it: any) => {
        const prod = draft.products.find((p) => p.id === it.productId);
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

      const docNo = nextDocNo(draft, 'ENQ');
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
      draft.enquiries.unshift(enquiry);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Created Enquiry',
        entityType: 'Enquiry',
        entityId: enquiry.id,
        entityDocNo: enquiry.docNo,
        details: `Logged enquiry ${enquiry.docNo} for ${customerSnapshot.name}.`,
      });
      return enquiry;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/enquiries/:id/status', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { status, rejectionReason } = req.body as { status: string; rejectionReason?: string };
    const updated = dbStore.mutate((draft) => {
      const enq = draft.enquiries.find((e) => e.id === req.params.id);
      if (!enq) throw new Error('NOT_FOUND:Enquiry not found.');
      if (status === 'Rejected' && !rejectionReason?.trim()) {
        throw new Error('Rejection reason is required when rejecting an enquiry.');
      }
      enq.status = status as any;
      if (status === 'Rejected') {
        enq.rejectionReason = rejectionReason?.trim();
        for (const fu of draft.followUps) {
          if (fu.entityType === 'enquiry' && fu.entityId === enq.id && fu.status === 'Scheduled') {
            fu.status = 'Cancelled';
          }
        }
      }
      enq.updatedAt = new Date().toISOString();
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: `Enquiry ${status}`,
        entityType: 'Enquiry',
        entityId: enq.id,
        entityDocNo: enq.docNo,
        details: `Updated ${enq.docNo} status to ${status}.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
      });
      return enq;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/follow-ups', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.entityType || !body.entityId || !body.discussion?.trim()) {
      throw new Error('Reference document and discussion details are required.');
    }
    if (body.response === 'Rejected' && !body.rejectionReason?.trim()) {
      throw new Error('Rejection reason is required when customer rejects.');
    }
    const created = dbStore.mutate((draft) => {
      const now = new Date().toISOString();
      let entityDocNo = '';
      let customerName = '';
      let summary = '';

      if (body.entityType === 'enquiry') {
        const enq = draft.enquiries.find((e) => e.id === body.entityId);
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
      } else {
        const qt = draft.quotations.find((q) => q.id === body.entityId);
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
      }

      // Mark previous scheduled follow-ups for this entity as completed
      for (const prev of draft.followUps) {
        if (prev.entityType === body.entityType && prev.entityId === body.entityId && prev.status === 'Scheduled') {
          prev.status = body.response === 'Rejected' ? 'Cancelled' : 'Completed';
        }
      }

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
      draft.followUps.unshift(fu);

      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Recorded Follow-up',
        entityType: body.entityType === 'enquiry' ? 'Enquiry' : 'Quotation',
        entityId: body.entityId,
        entityDocNo,
        details: `Follow-up via ${fu.contactMethod} — Response: ${fu.response}.`,
      });
      return fu;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/quotations', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const enq = draft.enquiries.find((e) => e.id === body.enquiryId);
      if (!enq) throw new Error('NOT_FOUND:Linked qualified enquiry not found.');
      if (enq.status !== 'Qualified') {
        throw new Error('Quotations can only be created from Qualified enquiries.');
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
      const taxPercent = Number(body.taxPercent ?? draft.company.defaultTaxPercent);
      const totals = calculateQuotationTotals(items, discountPercent, taxPercent);

      const baseDocNo = nextDocNo(draft, 'QT');
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
        paymentTerms: body.paymentTerms?.trim() || draft.company.defaultPaymentTerms,
        deliveryTerms: body.deliveryTerms?.trim() || draft.company.defaultDeliveryTerms,
        warranty: body.warranty?.trim() || draft.company.defaultWarranty,
        remarks: body.remarks?.trim() || '',
        status: (body.status === 'Sent' ? 'Sent' : 'Draft') as 'Draft' | 'Sent',
        createdBy: req.user!.name,
        createdAt: now,
        updatedAt: now,
      };
      draft.quotations.unshift(qt);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Created Quotation',
        entityType: 'Quotation',
        entityId: qt.id,
        entityDocNo: qt.docNo,
        details: `Created ${qt.docNo} from ${enq.docNo} for ${enq.customerSnapshot.name}.`,
      });
      return qt;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/quotations/:id/revise', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const revised = dbStore.mutate((draft) => {
      const prev = draft.quotations.find((q) => q.id === req.params.id);
      if (!prev) throw new Error('NOT_FOUND:Quotation not found.');
      if (prev.status === 'Accepted' || prev.status === 'Superseded') {
        throw new Error(`Cannot revise a quotation in ${prev.status} state.`);
      }
      const family = draft.quotations.filter((q) => q.baseDocNo === prev.baseDocNo);
      const nextVersion = Math.max(...family.map((q) => q.version)) + 1;

      prev.status = 'Superseded';
      prev.updatedAt = new Date().toISOString();

      const items: QuotationItem[] = normalizeQuotationItems(
        (body.items || prev.items).map((it: any) => ({
          id: generateId('qi'),
          productId: it.productId || '',
          productName: it.productName?.trim() || 'Product',
          model: it.model?.trim() || '',
          specifications: it.specifications?.trim() || '',
          quantity: Math.max(1, Number(it.quantity) || 1),
          unitPrice: Math.max(0, Number(it.unitPrice) || 0),
          highlights: Array.isArray(it.highlights) ? it.highlights.filter((h: string) => h.trim()) : [],
        })),
      );
      const discountPercent = Number(body.discountPercent ?? prev.discountPercent);
      const taxPercent = Number(body.taxPercent ?? prev.taxPercent);
      const totals = calculateQuotationTotals(items, discountPercent, taxPercent);
      const now = new Date().toISOString();

      const newQt = {
        ...prev,
        id: generateId('qt'),
        docNo: `${prev.baseDocNo}-V${nextVersion}`,
        version: nextVersion,
        quotationDate: body.quotationDate || now.slice(0, 10),
        validityDate: body.validityDate || prev.validityDate,
        items,
        subtotal: totals.subtotal,
        discountPercent,
        discountAmount: totals.discountAmount,
        taxPercent,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        paymentTerms: body.paymentTerms?.trim() || prev.paymentTerms,
        deliveryTerms: body.deliveryTerms?.trim() || prev.deliveryTerms,
        warranty: body.warranty?.trim() || prev.warranty,
        remarks: body.remarks?.trim() || `Revision V${nextVersion} following negotiation.`,
        status: 'Sent' as const,
        acceptedAt: undefined,
        acceptedBy: undefined,
        rejectionReason: undefined,
        createdBy: req.user!.name,
        createdAt: now,
        updatedAt: now,
      };
      draft.quotations.unshift(newQt);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Revised Quotation',
        entityType: 'Quotation',
        entityId: newQt.id,
        entityDocNo: newQt.docNo,
        details: `Created revision ${newQt.docNo} superseding ${prev.docNo}.`,
      });
      return newQt;
    });
    res.status(201).json(revised);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/quotations/:id/status', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { status, rejectionReason } = req.body as { status: string; rejectionReason?: string };
    const updated = dbStore.mutate((draft) => {
      const qt = draft.quotations.find((q) => q.id === req.params.id);
      if (!qt) throw new Error('NOT_FOUND:Quotation not found.');
      if (qt.status === 'Superseded') {
        throw new Error('Superseded quotation versions cannot be modified.');
      }
      if (status === 'Rejected' && !rejectionReason?.trim()) {
        throw new Error('Rejection reason is required.');
      }
      if (status === 'Accepted') {
        const alreadyAccepted = draft.quotations.find(
          (q) => q.baseDocNo === qt.baseDocNo && q.id !== qt.id && q.status === 'Accepted',
        );
        if (alreadyAccepted) {
          throw new Error(`Another revision (${alreadyAccepted.docNo}) is already accepted.`);
        }
        qt.acceptedAt = new Date().toISOString();
        qt.acceptedBy = req.user!.name;
      }
      qt.status = status as any;
      if (rejectionReason) qt.rejectionReason = rejectionReason.trim();
      qt.updatedAt = new Date().toISOString();
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: `Quotation ${status}`,
        entityType: 'Quotation',
        entityId: qt.id,
        entityDocNo: qt.docNo,
        details: `Marked ${qt.docNo} as ${status}.`,
      });
      return qt;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/proforma-invoices', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const { quotationId, piDate, remarks } = req.body;
    const created = dbStore.mutate((draft) => {
      const qt = draft.quotations.find((q) => q.id === quotationId);
      if (!qt) throw new Error('NOT_FOUND:Quotation not found.');
      if (qt.status !== 'Accepted') {
        throw new Error('Proforma Invoice can only be generated from an Accepted quotation version.');
      }
      if (draft.proformaInvoices.some((p) => p.quotationId === qt.id && p.status !== 'Cancelled')) {
        throw new Error(`A Proforma Invoice already exists for ${qt.docNo}.`);
      }
      const now = new Date().toISOString();
      const pi = {
        id: generateId('pi'),
        docNo: nextDocNo(draft, 'PI'),
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
          bankName: draft.company.bankName,
          accountName: draft.company.bankAccountName,
          accountNumber: draft.company.bankAccountNumber,
          ifsc: draft.company.bankIfsc,
          branch: draft.company.bankBranch,
        },
        remarks: remarks?.trim() || `Generated from accepted quotation ${qt.docNo}.`,
        status: 'Issued' as const,
        createdBy: req.user!.name,
        createdAt: now,
      };
      draft.proformaInvoices.unshift(pi);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Generated Proforma Invoice',
        entityType: 'ProformaInvoice',
        entityId: pi.id,
        entityDocNo: pi.docNo,
        details: `Generated ${pi.docNo} from ${qt.docNo} for ${pi.customerSnapshot.name}.`,
      });
      return pi;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/customer-pos', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.piId || !body.customerPoNumber?.trim()) {
      throw new Error('Proforma Invoice reference and Customer PO number are required.');
    }
    const created = dbStore.mutate((draft) => {
      const pi = draft.proformaInvoices.find((p) => p.id === body.piId);
      if (!pi) throw new Error('NOT_FOUND:Proforma Invoice not found.');
      if (draft.customerPOs.some((c) => c.piId === pi.id)) {
        throw new Error(`Customer PO already recorded for ${pi.docNo}.`);
      }
      const now = new Date().toISOString();
      const hasDiscrepancy = Boolean(body.hasDiscrepancy);
      const cpo = {
        id: generateId('cpo'),
        docNo: nextDocNo(draft, 'CPO'),
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
      draft.customerPOs.unshift(cpo);
      if (pi.status === 'Issued') pi.status = 'PO Received';
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Recorded Customer PO',
        entityType: 'CustomerPO',
        entityId: cpo.id,
        entityDocNo: cpo.docNo,
        details: `Recorded customer PO ${cpo.customerPoNumber} against ${pi.docNo}.`,
      });
      return cpo;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/customer-pos/:id/resolve-discrepancy', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const updated = dbStore.mutate((draft) => {
      const cpo = draft.customerPOs.find((c) => c.id === req.params.id);
      if (!cpo) throw new Error('NOT_FOUND:Customer PO not found.');
      cpo.discrepancyResolved = true;
      cpo.remarks = `${cpo.remarks ? cpo.remarks + ' | ' : ''}Discrepancy resolved by ${req.user!.name}: ${req.body.resolutionNotes || 'Confirmed aligned with PI'}`;
      return cpo;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/payments', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const amount = round2(Number(body.amount));
    if (!amount || amount <= 0) throw new Error('Payment amount must be greater than zero.');
    if (!body.transactionRef?.trim()) throw new Error('Transaction reference is required.');
    const created = dbStore.mutate((draft) => {
      if (
        draft.payments.some(
          (p) => p.transactionRef.toLowerCase() === body.transactionRef.trim().toLowerCase() && p.status !== 'Rejected' && p.status !== 'Reversed',
        )
      ) {
        throw new Error(`Duplicate transaction reference "${body.transactionRef.trim()}".`);
      }

      const pi = body.piId ? draft.proformaInvoices.find((p) => p.id === body.piId) : undefined;
      const so = body.salesOrderId
        ? draft.salesOrders.find((s) => s.id === body.salesOrderId)
        : pi
          ? draft.salesOrders.find((s) => s.piId === pi.id)
          : undefined;
      const linkedPi = pi || (so ? draft.proformaInvoices.find((p) => p.id === so.piId) : undefined);

      if (!linkedPi && !so) {
        throw new Error('Select a valid Proforma Invoice or Sales Order.');
      }

      const orderTotal = so?.totalAmount ?? linkedPi!.totalAmount;
      const existingSummary = calculatePaymentSummary(orderTotal, draft.payments, {
        piId: linkedPi?.id,
        salesOrderId: so?.id,
      });
      if (amount > existingSummary.outstandingBalance + 0.01) {
        throw new Error(`Payment amount exceeds outstanding balance (${existingSummary.outstandingBalance}).`);
      }

      const canAutoVerify =
        req.user!.permissions.sales.includes('approve') || req.user!.permissions.sales.includes('manage');
      const now = new Date().toISOString();
      const payment = {
        id: generateId('pay'),
        docNo: nextDocNo(draft, 'PAY'),
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
        transactionRef: body.transactionRef.trim(),
        proofName: body.proofName || undefined,
        proofDataUrl: body.proofDataUrl || undefined,
        status: (canAutoVerify && body.autoVerify !== false ? 'Verified' : 'Pending') as 'Pending' | 'Verified',
        verifiedBy: canAutoVerify && body.autoVerify !== false ? req.user!.name : undefined,
        verifiedAt: canAutoVerify && body.autoVerify !== false ? now : undefined,
        remarks: body.remarks?.trim() || '',
        createdBy: req.user!.name,
        createdAt: now,
      };
      draft.payments.unshift(payment);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Recorded Payment',
        entityType: 'Payment',
        entityId: payment.id,
        entityDocNo: payment.docNo,
        details: `Recorded ${payment.paymentType} payment of ₹${amount.toLocaleString('en-IN')} (${payment.status}) for ${payment.customerName}.`,
      });
      return payment;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/payments/:id/verify', requireAuth, requirePerm('sales', 'approve'), (req: AuthenticatedRequest, res) => {
  try {
    const { status, remarks } = req.body as { status: 'Verified' | 'Rejected' | 'Reversed'; remarks?: string };
    const updated = dbStore.mutate((draft) => {
      const p = draft.payments.find((x) => x.id === req.params.id);
      if (!p) throw new Error('NOT_FOUND:Payment not found.');
      p.status = status;
      p.verifiedBy = req.user!.name;
      p.verifiedAt = new Date().toISOString();
      if (remarks) p.remarks = `${p.remarks ? p.remarks + ' | ' : ''}${remarks}`;
      return p;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/sales/sales-orders', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const pi = draft.proformaInvoices.find((p) => p.id === body.piId);
      if (!pi) throw new Error('NOT_FOUND:Proforma Invoice not found.');
      if (draft.salesOrders.some((s) => s.piId === pi.id && s.commercialStatus !== 'Cancelled')) {
        throw new Error(`Sales Order already confirmed for ${pi.docNo}. Duplicate conversion blocked.`);
      }
      const cpo = draft.customerPOs.find((c) => c.piId === pi.id);
      if (!cpo) {
        throw new Error('A Customer Purchase Order must be recorded against this PI before confirming Sales Order.');
      }
      if (cpo.hasDiscrepancy && !cpo.discrepancyResolved) {
        throw new Error('Customer PO has an unresolved discrepancy against the PI. Resolve it before confirming SO.');
      }
      const qt = draft.quotations.find((q) => q.id === pi.quotationId);
      if (!qt || qt.status !== 'Accepted') {
        throw new Error('Linked quotation must be in Accepted status.');
      }
      const paySummary = calculatePaymentSummary(pi.totalAmount, draft.payments, { piId: pi.id });
      if (paySummary.verifiedReceived <= 0 && !body.allowCreditTerms) {
        throw new Error('At least one verified advance payment is required before confirming SO (or enable agreed credit terms).');
      }

      const now = new Date().toISOString();
      const so = {
        id: generateId('so'),
        docNo: nextDocNo(draft, 'SO'),
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
      draft.salesOrders.unshift(so);
      pi.status = 'Converted';

      // Link existing PI payments to the new SO
      for (const p of draft.payments) {
        if (p.piId === pi.id && !p.salesOrderId) {
          p.salesOrderId = so.id;
          p.salesOrderDocNo = so.docNo;
        }
      }

      addNotification(draft, {
        title: `New Confirmed Sales Order: ${so.docNo}`,
        message: `${so.customerSnapshot.name} — ${so.items.map((i) => `${i.quantity}x ${i.model}`).join(', ')}. Ready for Production Order creation.`,
        department: 'production',
        severity: 'info',
        link: '/production/received-orders',
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Confirmed Sales Order',
        entityType: 'SalesOrder',
        entityId: so.id,
        entityDocNo: so.docNo,
        details: `Confirmed ${so.docNo} from ${pi.docNo} & ${cpo.docNo}. Released to Production.`,
      });
      return so;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// DEPARTMENT 2: SUPPLY CHAIN MANAGEMENT
// ==========================================

apiRouter.post('/supply-chain/materials', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim() || !body.code?.trim()) throw new Error('Material name and code are required.');
    const created = dbStore.mutate((draft) => {
      if (draft.materials.some((m) => m.code.toLowerCase() === body.code.trim().toLowerCase())) {
        throw new Error(`Material code ${body.code} already exists.`);
      }
      const now = new Date().toISOString();
      const mat = {
        id: generateId('mat'),
        code: body.code.trim().toUpperCase(),
        name: body.name.trim(),
        category: body.category?.trim() || 'Components',
        specification: body.specification?.trim() || '',
        unit: body.unit?.trim() || 'Nos',
        minStock: Math.max(0, Number(body.minStock) || 0),
        storageLocation: body.storageLocation?.trim() || 'Main Store',
        preferredSupplierId: body.preferredSupplierId || undefined,
        active: true,
        createdAt: now,
      };
      draft.materials.unshift(mat);
      const openingQty = Number(body.openingStock) || 0;
      if (openingQty > 0) {
        draft.stockTransactions.push({
          id: generateId('st'),
          materialId: mat.id,
          materialCode: mat.code,
          materialName: mat.name,
          unit: mat.unit,
          type: 'Opening Balance',
          quantityDelta: openingQty,
          balanceAfter: openingQty,
          linkedDocType: 'Opening',
          linkedDocId: mat.id,
          linkedDocNo: mat.code,
          remarks: 'Initial stock balance on material creation',
          performedBy: req.user!.name,
          timestamp: now,
        });
      }
      return mat;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/supply-chain/stock-adjustment', requireAuth, requirePerm('supply_chain', 'approve'), (req: AuthenticatedRequest, res) => {
  try {
    const { materialId, quantityDelta, remarks } = req.body as {
      materialId: string;
      quantityDelta: number;
      remarks: string;
    };
    if (!materialId || !quantityDelta || !remarks?.trim()) {
      throw new Error('Material, non-zero quantity delta, and reason are required.');
    }
    const tx = dbStore.mutate((draft) => {
      const mat = draft.materials.find((m) => m.id === materialId);
      if (!mat) throw new Error('NOT_FOUND:Material not found.');
      const current = computeMaterialStockMap(draft.stockTransactions)[mat.id] || 0;
      const nextBal = round2(current + Number(quantityDelta));
      if (nextBal < 0) {
        throw new Error(`Adjustment would result in negative stock (${nextBal}).`);
      }
      const entry = {
        id: generateId('st'),
        materialId: mat.id,
        materialCode: mat.code,
        materialName: mat.name,
        unit: mat.unit,
        type: 'Stock Adjustment' as const,
        quantityDelta: Number(quantityDelta),
        balanceAfter: nextBal,
        linkedDocType: 'Adjustment',
        linkedDocId: generateId('adj'),
        linkedDocNo: `ADJ-${Date.now().toString().slice(-4)}`,
        remarks: remarks.trim(),
        performedBy: req.user!.name,
        timestamp: new Date().toISOString(),
      };
      draft.stockTransactions.push(entry);
      return entry;
    });
    res.status(201).json(tx);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/supply-chain/suppliers', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim()) throw new Error('Supplier name is required.');
    const created = dbStore.mutate((draft) => {
      const sup = {
        id: generateId('sup'),
        name: body.name.trim(),
        contactPerson: body.contactPerson?.trim() || '',
        phone: body.phone?.trim() || '',
        email: body.email?.trim() || '',
        address: body.address?.trim() || '',
        gstin: body.gstin?.trim() || '',
        suppliedMaterialIds: Array.isArray(body.suppliedMaterialIds) ? body.suppliedMaterialIds : [],
        notes: body.notes?.trim() || '',
        active: true,
        createdAt: new Date().toISOString(),
      };
      draft.suppliers.unshift(sup);
      return sup;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/supply-chain/material-issues', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const { materialRequestId, issueDate, items, remarks } = req.body as {
      materialRequestId: string;
      issueDate?: string;
      items: Array<{ materialId: string; issuingQty: number }>;
      remarks?: string;
    };
    const created = dbStore.mutate((draft) => {
      const mr = draft.materialRequests.find((m) => m.id === materialRequestId);
      if (!mr) throw new Error('NOT_FOUND:Material request not found.');
      if (mr.status === 'Fully Issued' || mr.status === 'Cancelled') {
        throw new Error(`Material request ${mr.docNo} is already ${mr.status}.`);
      }
      const stockMap = computeMaterialStockMap(draft.stockTransactions);
      const validLines = (items || []).filter((i) => Number(i.issuingQty) > 0);
      if (validLines.length === 0) {
        throw new Error('Enter a positive issuing quantity for at least one material.');
      }

      const issueItems = [];
      for (const line of validLines) {
        const mrItem = mr.items.find((x) => x.materialId === line.materialId);
        if (!mrItem) throw new Error(`Material ${line.materialId} is not on ${mr.docNo}.`);
        const available = stockMap[mrItem.materialId] || 0;
        const check = validateMaterialIssueLine({
          requiredQty: mrItem.requiredQty,
          alreadyIssuedQty: mrItem.issuedQty,
          availableStock: available,
          issuingQty: Number(line.issuingQty),
        });
        if (!check.valid) throw new Error(`${mrItem.materialName}: ${check.error}`);
        stockMap[mrItem.materialId] = check.stockAfter;
        mrItem.issuedQty = round2(mrItem.issuedQty + Number(line.issuingQty));
        issueItems.push({
          materialId: mrItem.materialId,
          materialCode: mrItem.materialCode,
          materialName: mrItem.materialName,
          unit: mrItem.unit,
          issuedQty: Number(line.issuingQty),
          receivedQty: 0,
        });
      }

      const now = new Date().toISOString();
      const mi = {
        id: generateId('mi'),
        docNo: nextDocNo(draft, 'MI'),
        materialRequestId: mr.id,
        materialRequestDocNo: mr.docNo,
        productionOrderId: mr.productionOrderId,
        productionOrderDocNo: mr.productionOrderDocNo,
        issueDate: issueDate || now.slice(0, 10),
        items: issueItems,
        receiptAcknowledged: false,
        issuedBy: req.user!.name,
        remarks: remarks?.trim() || '',
        createdAt: now,
      };
      draft.materialIssues.unshift(mi);

      // Post ledger deductions atomically
      const runningMap = computeMaterialStockMap(draft.stockTransactions);
      for (const ii of issueItems) {
        const bal = round2((runningMap[ii.materialId] || 0) - ii.issuedQty);
        runningMap[ii.materialId] = bal;
        draft.stockTransactions.push({
          id: generateId('st'),
          materialId: ii.materialId,
          materialCode: ii.materialCode,
          materialName: ii.materialName,
          unit: ii.unit,
          type: 'Material Issue',
          quantityDelta: -ii.issuedQty,
          balanceAfter: bal,
          linkedDocType: 'MI',
          linkedDocId: mi.id,
          linkedDocNo: mi.docNo,
          remarks: `Issued against ${mr.docNo} (${mr.productionOrderDocNo})`,
          performedBy: req.user!.name,
          timestamp: now,
        });
      }

      const derived = deriveMaterialRequestStatus(mr);
      mr.status = derived.status;
      mr.receiptStatus = derived.receiptStatus;
      mr.updatedAt = now;

      addNotification(draft, {
        title: `Materials Issued (${mi.docNo})`,
        message: `${mr.status} for ${mr.productionOrderDocNo}. Please acknowledge physical receipt in Production.`,
        department: 'production',
        severity: mr.status === 'Fully Issued' ? 'success' : 'info',
        link: '/production/material-receipts',
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: 'Issued Materials',
        entityType: 'MaterialIssue',
        entityId: mi.id,
        entityDocNo: mi.docNo,
        details: `Issued ${issueItems.length} material line(s) for ${mr.docNo} (${mr.status}).`,
      });
      return mi;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/supply-chain/supplier-pos', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.supplierId || !Array.isArray(body.items) || body.items.length === 0) {
      throw new Error('Supplier and at least one material line are required.');
    }
    const created = dbStore.mutate((draft) => {
      const sup = draft.suppliers.find((s) => s.id === body.supplierId);
      if (!sup) throw new Error('NOT_FOUND:Supplier not found.');
      const mr = body.materialRequestId
        ? draft.materialRequests.find((m) => m.id === body.materialRequestId)
        : undefined;

      const items: SupplierPOItem[] = body.items.map((it: any) => {
        const mat = draft.materials.find((m) => m.id === it.materialId);
        if (!mat) throw new Error('Invalid material selected.');
        const qty = Number(it.orderedQty);
        const price = Number(it.unitPrice);
        if (!qty || qty <= 0) throw new Error(`Quantity for ${mat.name} must be positive.`);
        return {
          materialId: mat.id,
          materialCode: mat.code,
          materialName: mat.name,
          unit: mat.unit,
          orderedQty: qty,
          receivedQty: 0,
          acceptedQty: 0,
          rejectedQty: 0,
          unitPrice: Math.max(0, price || 0),
          lineTotal: round2(qty * Math.max(0, price || 0)),
        };
      });

      const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
      const taxPercent = Number(body.taxPercent ?? draft.company.defaultTaxPercent);
      const taxAmount = round2((subtotal * taxPercent) / 100);
      const totalAmount = round2(subtotal + taxAmount);
      const now = new Date().toISOString();

      const spo = {
        id: generateId('spo'),
        docNo: nextDocNo(draft, 'SPO'),
        supplierId: sup.id,
        supplierName: sup.name,
        purchaseType: (body.purchaseType === 'Request-Based' ? 'Request-Based' : 'Normal') as
          | 'Request-Based'
          | 'Normal',
        materialRequestId: mr?.id,
        materialRequestDocNo: mr?.docNo,
        poDate: body.poDate || now.slice(0, 10),
        expectedDeliveryDate: body.expectedDeliveryDate || now.slice(0, 10),
        items,
        subtotal,
        taxPercent,
        taxAmount,
        totalAmount,
        status: 'Ordered' as const,
        remarks: body.remarks?.trim() || '',
        createdBy: req.user!.name,
        createdAt: now,
        updatedAt: now,
      };
      draft.supplierPOs.unshift(spo);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: 'Created Supplier PO',
        entityType: 'SupplierPO',
        entityId: spo.id,
        entityDocNo: spo.docNo,
        details: `Created ${spo.purchaseType} PO ${spo.docNo} to ${sup.name}.`,
      });
      return spo;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/supply-chain/grns', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.supplierPoId || !body.invoiceOrChallanNo?.trim()) {
      throw new Error('Supplier PO reference and invoice / delivery challan number are required.');
    }
    const created = dbStore.mutate((draft) => {
      const spo = draft.supplierPOs.find((s) => s.id === body.supplierPoId);
      if (!spo) throw new Error('NOT_FOUND:Supplier PO not found.');
      const supReturn = body.supplierReturnId
        ? draft.supplierReturns.find((r) => r.id === body.supplierReturnId)
        : undefined;
      const isReplacement = Boolean(supReturn);

      const grnItems: GRNItem[] = [];
      for (const line of body.items || []) {
        const recQty = Number(line.receivedQty);
        if (!recQty || recQty <= 0) continue;
        const poLine = spo.items.find((i) => i.materialId === line.materialId);
        if (!poLine) throw new Error('Material not found on selected Supplier PO.');

        if (isReplacement && supReturn) {
          if (recQty > supReturn.returnQty) {
            throw new Error(`Replacement receipt (${recQty}) cannot exceed returned qty (${supReturn.returnQty}).`);
          }
        } else {
          const remaining = round2(poLine.orderedQty - poLine.receivedQty);
          if (recQty > remaining && !body.authorizeExcess) {
            throw new Error(
              `Received qty (${recQty}) for ${poLine.materialName} exceeds remaining PO qty (${remaining}).`,
            );
          }
          poLine.receivedQty = round2(poLine.receivedQty + recQty);
        }

        grnItems.push({
          materialId: poLine.materialId,
          materialCode: poLine.materialCode,
          materialName: poLine.materialName,
          unit: poLine.unit,
          orderedQty: poLine.orderedQty,
          previouslyReceivedQty: isReplacement ? poLine.receivedQty : round2(poLine.receivedQty - recQty),
          receivedQty: recQty,
          acceptedQty: 0,
          rejectedQty: 0,
          verified: false,
        });
      }

      if (grnItems.length === 0) throw new Error('Enter a received quantity for at least one material.');

      if (!isReplacement) {
        const allReceived = spo.items.every((i) => i.receivedQty >= i.orderedQty);
        spo.status = allReceived ? 'Received' : 'Partially Received';
        spo.updatedAt = new Date().toISOString();
      }

      const now = new Date().toISOString();
      const grn = {
        id: generateId('grn'),
        docNo: nextDocNo(draft, 'GRN'),
        supplierPoId: spo.id,
        supplierPoDocNo: spo.docNo,
        supplierId: spo.supplierId,
        supplierName: spo.supplierName,
        isReplacement,
        supplierReturnId: supReturn?.id,
        supplierReturnDocNo: supReturn?.docNo,
        receivedDate: body.receivedDate || now.slice(0, 10),
        invoiceOrChallanNo: body.invoiceOrChallanNo.trim(),
        items: grnItems,
        attachmentName: body.attachmentName || undefined,
        attachmentDataUrl: body.attachmentDataUrl || undefined,
        verificationStatus: 'Pending' as const,
        remarks: body.remarks?.trim() || '',
        createdBy: req.user!.name,
        createdAt: now,
      };
      draft.grns.unshift(grn);

      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: isReplacement ? 'Created Replacement GRN' : 'Created GRN',
        entityType: 'GRN',
        entityId: grn.id,
        entityDocNo: grn.docNo,
        details: `Recorded ${grn.docNo} against ${spo.docNo} (${grn.invoiceOrChallanNo}). Pending verification.`,
      });
      return grn;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/supply-chain/grns/:id/verify', requireAuth, requirePerm('supply_chain', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { items, verificationRemarks } = req.body as {
      items: Array<{ materialId: string; acceptedQty: number; rejectedQty: number; rejectionReason?: string }>;
      verificationRemarks?: string;
    };
    const updated = dbStore.mutate((draft) => {
      const grn = draft.grns.find((g) => g.id === req.params.id);
      if (!grn) throw new Error('NOT_FOUND:GRN not found.');
      if (grn.verificationStatus !== 'Pending') {
        throw new Error(`GRN ${grn.docNo} has already been verified (${grn.verificationStatus}).`);
      }
      const spo = draft.supplierPOs.find((s) => s.id === grn.supplierPoId);
      const stockMap = computeMaterialStockMap(draft.stockTransactions);
      const now = new Date().toISOString();

      let totalAccepted = 0;
      let totalRejected = 0;

      for (const grnItem of grn.items) {
        const input = (items || []).find((x) => x.materialId === grnItem.materialId);
        if (!input) throw new Error(`Missing verification input for ${grnItem.materialName}.`);
        const acc = round2(Number(input.acceptedQty) || 0);
        const rej = round2(Number(input.rejectedQty) || 0);
        if (acc < 0 || rej < 0 || Math.abs(acc + rej - grnItem.receivedQty) > 0.001) {
          throw new Error(
            `${grnItem.materialName}: Accepted (${acc}) + Rejected (${rej}) must equal Received (${grnItem.receivedQty}).`,
          );
        }
        if (rej > 0 && !input.rejectionReason?.trim()) {
          throw new Error(`Rejection reason is required for rejected ${grnItem.materialName}.`);
        }

        grnItem.acceptedQty = acc;
        grnItem.rejectedQty = rej;
        grnItem.rejectionReason = input.rejectionReason?.trim() || undefined;
        grnItem.verified = true;
        totalAccepted += acc;
        totalRejected += rej;

        // Update PO counters
        const poLine = spo?.items.find((i) => i.materialId === grnItem.materialId);
        if (poLine) {
          poLine.acceptedQty = round2(poLine.acceptedQty + acc);
          poLine.rejectedQty = round2(poLine.rejectedQty + rej);
        }

        // ONLY accepted materials enter usable stock
        if (acc > 0) {
          const nextBal = round2((stockMap[grnItem.materialId] || 0) + acc);
          stockMap[grnItem.materialId] = nextBal;
          draft.stockTransactions.push({
            id: generateId('st'),
            materialId: grnItem.materialId,
            materialCode: grnItem.materialCode,
            materialName: grnItem.materialName,
            unit: grnItem.unit,
            type: 'GRN Accepted',
            quantityDelta: acc,
            balanceAfter: nextBal,
            linkedDocType: 'GRN',
            linkedDocId: grn.id,
            linkedDocNo: grn.docNo,
            remarks: grn.isReplacement
              ? `Replacement GRN verified (${grn.supplierReturnDocNo})`
              : `Incoming verification accepted (${rej} rejected)`,
            performedBy: req.user!.name,
            timestamp: now,
          });
        }
      }

      grn.verificationStatus =
        totalRejected === 0 ? 'Accepted' : totalAccepted === 0 ? 'Rejected' : 'Partially Accepted';
      grn.verifiedBy = req.user!.name;
      grn.verifiedAt = now;
      grn.verificationRemarks = verificationRemarks?.trim() || '';

      if (grn.isReplacement && grn.supplierReturnId) {
        const sr = draft.supplierReturns.find((r) => r.id === grn.supplierReturnId);
        if (sr) {
          sr.replacementStatus = totalAccepted >= sr.returnQty ? 'Replacement Received' : 'Pending Replacement';
          sr.replacementGrnId = grn.id;
          sr.replacementGrnDocNo = grn.docNo;
        }
      }

      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: 'Verified Material GRN',
        entityType: 'GRN',
        entityId: grn.id,
        entityDocNo: grn.docNo,
        details: `${grn.docNo}: ${grn.verificationStatus} (${totalAccepted} accepted into stock, ${totalRejected} rejected).`,
      });
      return grn;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/supply-chain/supplier-returns', requireAuth, requirePerm('supply_chain', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const grn = draft.grns.find((g) => g.id === body.grnId);
      if (!grn) throw new Error('NOT_FOUND:GRN not found.');
      const grnItem = grn.items.find((i) => i.materialId === body.materialId);
      if (!grnItem || grnItem.rejectedQty <= 0) {
        throw new Error('Selected material has no rejected quantity on this GRN.');
      }
      const alreadyReturned = draft.supplierReturns
        .filter((r) => r.grnId === grn.id && r.materialId === grnItem.materialId)
        .reduce((s, r) => s + r.returnQty, 0);
      const eligible = round2(grnItem.rejectedQty - alreadyReturned);
      const returnQty = round2(Number(body.returnQty));
      if (!returnQty || returnQty <= 0 || returnQty > eligible) {
        throw new Error(`Return qty must be between 1 and ${eligible} (eligible rejected units).`);
      }

      const now = new Date().toISOString();
      const replacementRequired = Boolean(body.replacementRequired);
      const sr = {
        id: generateId('sr'),
        docNo: nextDocNo(draft, 'SR'),
        grnId: grn.id,
        grnDocNo: grn.docNo,
        supplierPoId: grn.supplierPoId,
        supplierPoDocNo: grn.supplierPoDocNo,
        supplierId: grn.supplierId,
        supplierName: grn.supplierName,
        materialId: grnItem.materialId,
        materialCode: grnItem.materialCode,
        materialName: grnItem.materialName,
        unit: grnItem.unit,
        returnQty,
        reason: body.reason?.trim() || grnItem.rejectionReason || 'Rejected in incoming verification',
        returnDate: body.returnDate || now.slice(0, 10),
        replacementRequired,
        replacementStatus: (replacementRequired ? 'Pending Replacement' : 'Not Required') as
          | 'Pending Replacement'
          | 'Not Required',
        attachmentName: body.attachmentName || undefined,
        remarks: body.remarks?.trim() || '',
        createdBy: req.user!.name,
        createdAt: now,
      };
      draft.supplierReturns.unshift(sr);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'supply_chain',
        action: 'Created Supplier Return',
        entityType: 'SupplierReturn',
        entityId: sr.id,
        entityDocNo: sr.docNo,
        details: `Returned ${sr.returnQty} ${sr.unit} of ${sr.materialName} from ${grn.docNo} to ${sr.supplierName}.`,
      });
      return sr;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// DEPARTMENT 3: PRODUCTION MANAGEMENT
// ==========================================

apiRouter.post('/production/orders', requireAuth, requirePerm('production', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const so = draft.salesOrders.find((s) => s.id === body.salesOrderId);
      if (!so) throw new Error('NOT_FOUND:Confirmed Sales Order not found.');
      if (so.commercialStatus !== 'Confirmed') {
        throw new Error('Cannot create production order for an unconfirmed Sales Order.');
      }
      const soItem = so.items.find((i) => i.productId === body.productId) || so.items[0];
      if (!soItem) throw new Error('Sales order has no product items.');

      const remaining = getRemainingSOAllocatableQty(so, soItem.productId, draft.productionOrders);
      const qty = Number(body.quantity);
      if (!qty || qty <= 0) throw new Error('Production quantity must be greater than zero.');
      if (qty > remaining) {
        throw new Error(
          `Cannot allocate ${qty} unit(s); only ${remaining} unit(s) remaining on ${so.docNo}.`,
        );
      }
      const duration = calculateDurationDays(body.plannedStartDate, body.plannedEndDate);
      if (duration <= 0) {
        throw new Error('Planned completion date must be on or after planned start date.');
      }

      const now = new Date().toISOString();
      const po = {
        id: generateId('po'),
        docNo: nextDocNo(draft, 'PROD'),
        salesOrderId: so.id,
        salesOrderDocNo: so.docNo,
        customerId: so.customerId,
        customerName: so.customerSnapshot.name,
        productId: soItem.productId,
        productName: soItem.productName,
        model: soItem.model,
        specifications: soItem.specifications,
        highlights: soItem.highlights,
        quantity: qty,
        plannedStartDate: body.plannedStartDate,
        plannedEndDate: body.plannedEndDate,
        plannedDurationDays: duration,
        productionInCharge: body.productionInCharge?.trim() || req.user!.name,
        assignedEmployees: Array.isArray(body.assignedEmployees) ? body.assignedEmployees : [],
        priority: body.priority || so.priority,
        instructions: body.instructions?.trim() || '',
        status: 'Planned' as const,
        completedManufacturingQty: 0,
        serialNumbers: [],
        qcAcceptedQty: 0,
        qcRejectedQty: 0,
        dispatchedQty: 0,
        deliveredQty: 0,
        createdBy: req.user!.name,
        createdAt: now,
        updatedAt: now,
      };
      draft.productionOrders.unshift(po);
      syncSOFulfillment(draft, so.id);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Created Production Order',
        entityType: 'ProductionOrder',
        entityId: po.id,
        entityDocNo: po.docNo,
        details: `Scheduled ${po.docNo} for ${qty}x ${po.productName} (${so.docNo}), duration ${duration} days.`,
      });
      return po;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/production/boms', requireAuth, requirePerm('production', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const { productionOrderId, items, sendRequest } = req.body as {
      productionOrderId: string;
      items: Array<{ materialId: string; qtyPerUnit: number; remarks?: string }>;
      sendRequest?: boolean;
    };
    const result = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Add at least one raw material to the BOM.');
      }
      const existingBom = draft.boms.find((b) => b.productionOrderId === po.id);
      if (existingBom && existingBom.requestSent) {
        throw new Error(`BOM ${existingBom.docNo} has already been submitted to Supply Chain.`);
      }

      const bomItems: BOMItem[] = items.map((it) => {
        const mat = draft.materials.find((m) => m.id === it.materialId);
        if (!mat) throw new Error('Invalid material in BOM.');
        const perUnit = Number(it.qtyPerUnit);
        if (!perUnit || perUnit <= 0) throw new Error(`Quantity per unit for ${mat.name} must be positive.`);
        return {
          materialId: mat.id,
          materialCode: mat.code,
          materialName: mat.name,
          unit: mat.unit,
          qtyPerUnit: perUnit,
          totalRequiredQty: round2(perUnit * po.quantity),
          remarks: it.remarks?.trim() || undefined,
        };
      });

      const now = new Date().toISOString();
      let bom = existingBom;
      if (bom) {
        bom.items = bomItems;
        bom.updatedAt = now;
      } else {
        bom = {
          id: generateId('bom'),
          docNo: nextDocNo(draft, 'BOM'),
          productionOrderId: po.id,
          productionOrderDocNo: po.docNo,
          productName: `${po.productName} (${po.model})`,
          productionQty: po.quantity,
          items: bomItems,
          requestSent: false,
          createdBy: req.user!.name,
          createdAt: now,
          updatedAt: now,
        };
        draft.boms.unshift(bom);
      }

      if (sendRequest) {
        const mrItems: MaterialRequestItem[] = bom.items.map((bi) => ({
          materialId: bi.materialId,
          materialCode: bi.materialCode,
          materialName: bi.materialName,
          unit: bi.unit,
          requiredQty: bi.totalRequiredQty,
          issuedQty: 0,
          receivedQty: 0,
        }));
        const mr = {
          id: generateId('mr'),
          docNo: nextDocNo(draft, 'MR'),
          bomId: bom.id,
          bomDocNo: bom.docNo,
          productionOrderId: po.id,
          productionOrderDocNo: po.docNo,
          salesOrderId: po.salesOrderId,
          salesOrderDocNo: po.salesOrderDocNo,
          productName: bom.productName,
          priority: po.priority,
          items: mrItems,
          status: 'Pending' as const,
          receiptStatus: 'Pending' as const,
          requestedBy: req.user!.name,
          requestDate: now.slice(0, 10),
          createdAt: now,
          updatedAt: now,
        };
        draft.materialRequests.unshift(mr);
        bom.requestSent = true;
        bom.materialRequestId = mr.id;
        bom.materialRequestDocNo = mr.docNo;
        po.status = 'Awaiting Materials';
        po.updatedAt = now;

        addNotification(draft, {
          title: `New BOM Material Request: ${mr.docNo}`,
          message: `${po.docNo} (${bom.productName}) requires ${mrItems.length} material line(s).`,
          department: 'supply_chain',
          severity: po.priority === 'Urgent' ? 'warning' : 'info',
          link: '/supply-chain/material-requests',
        });
        addActivity(draft, {
          actorId: req.user!.id,
          actorName: req.user!.name,
          department: 'production',
          action: 'Submitted BOM Material Request',
          entityType: 'MaterialRequest',
          entityId: mr.id,
          entityDocNo: mr.docNo,
          details: `Sent ${mr.docNo} (${bom.docNo}) for ${po.docNo} to Supply Chain.`,
        });
      }

      return bom;
    });
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/production/boms/:id/send-request', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const result = dbStore.mutate((draft) => {
      const bom = draft.boms.find((b) => b.id === req.params.id);
      if (!bom) throw new Error('NOT_FOUND:BOM not found.');
      if (bom.requestSent) throw new Error('Material request already sent for this BOM.');
      const po = draft.productionOrders.find((p) => p.id === bom.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      const now = new Date().toISOString();
      const mr = {
        id: generateId('mr'),
        docNo: nextDocNo(draft, 'MR'),
        bomId: bom.id,
        bomDocNo: bom.docNo,
        productionOrderId: po.id,
        productionOrderDocNo: po.docNo,
        salesOrderId: po.salesOrderId,
        salesOrderDocNo: po.salesOrderDocNo,
        productName: bom.productName,
        priority: po.priority,
        items: bom.items.map((bi) => ({
          materialId: bi.materialId,
          materialCode: bi.materialCode,
          materialName: bi.materialName,
          unit: bi.unit,
          requiredQty: bi.totalRequiredQty,
          issuedQty: 0,
          receivedQty: 0,
        })),
        status: 'Pending' as const,
        receiptStatus: 'Pending' as const,
        requestedBy: req.user!.name,
        requestDate: now.slice(0, 10),
        createdAt: now,
        updatedAt: now,
      };
      draft.materialRequests.unshift(mr);
      bom.requestSent = true;
      bom.materialRequestId = mr.id;
      bom.materialRequestDocNo = mr.docNo;
      po.status = 'Awaiting Materials';
      po.updatedAt = now;
      addNotification(draft, {
        title: `New BOM Material Request: ${mr.docNo}`,
        message: `${po.docNo} (${bom.productName}) requires materials from store.`,
        department: 'supply_chain',
        severity: 'info',
        link: '/supply-chain/material-requests',
      });
      return mr;
    });
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/production/material-receipts/:issueId/acknowledge', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { discrepancyNotes } = req.body as { discrepancyNotes?: string };
    const updated = dbStore.mutate((draft) => {
      const mi = draft.materialIssues.find((x) => x.id === req.params.issueId);
      if (!mi) throw new Error('NOT_FOUND:Material issue record not found.');
      if (mi.receiptAcknowledged) {
        throw new Error(`Material issue ${mi.docNo} receipt has already been acknowledged.`);
      }
      const mr = draft.materialRequests.find((m) => m.id === mi.materialRequestId);
      if (!mr) throw new Error('NOT_FOUND:Linked material request not found.');

      const now = new Date().toISOString();
      for (const ii of mi.items) {
        ii.receivedQty = ii.issuedQty;
        const mrItem = mr.items.find((x) => x.materialId === ii.materialId);
        if (mrItem) {
          mrItem.receivedQty = round2(Math.min(mrItem.issuedQty, mrItem.receivedQty + ii.receivedQty));
        }
      }
      mi.receiptAcknowledged = true;
      mi.acknowledgedBy = req.user!.name;
      mi.acknowledgedAt = now;
      if (discrepancyNotes?.trim()) mi.receiptDiscrepancyNotes = discrepancyNotes.trim();

      const derived = deriveMaterialRequestStatus(mr);
      mr.status = derived.status;
      mr.receiptStatus = derived.receiptStatus;
      mr.updatedAt = now;

      const po = draft.productionOrders.find((p) => p.id === mi.productionOrderId);
      if (po && po.status === 'Awaiting Materials' && mr.receiptStatus === 'Fully Received') {
        po.status = 'Ready to Start';
        po.updatedAt = now;
        addNotification(draft, {
          title: `${po.docNo} Ready to Start Production`,
          message: `All BOM materials for ${po.docNo} (${po.productName}) have been received by Production.`,
          department: 'production',
          severity: 'success',
          link: `/production/orders/${po.id}`,
        });
      }

      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Acknowledged Material Receipt',
        entityType: 'MaterialIssue',
        entityId: mi.id,
        entityDocNo: mi.docNo,
        details: `Confirmed physical receipt of ${mi.docNo} for ${mi.productionOrderDocNo}.`,
      });
      return mi;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/production/orders/:id/start', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === req.params.id);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'Ready to Start') {
        throw new Error(`Cannot start production when order status is "${po.status}". All required materials must be received first.`);
      }
      const now = new Date().toISOString();
      po.actualStartDate = body.actualStartDate || now.slice(0, 10);
      if (body.productionInCharge?.trim()) po.productionInCharge = body.productionInCharge.trim();
      if (Array.isArray(body.assignedEmployees) && body.assignedEmployees.length > 0) {
        po.assignedEmployees = body.assignedEmployees;
      }
      po.status = 'In Progress';
      po.updatedAt = now;
      syncSOFulfillment(draft, po.salesOrderId);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Started Production',
        entityType: 'ProductionOrder',
        entityId: po.id,
        entityDocNo: po.docNo,
        details: `Started manufacturing ${po.docNo} on ${po.actualStartDate}.`,
      });
      return po;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/production/daily-updates', requireAuth, requirePerm('production', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.productionOrderId || !body.stage?.trim() || !body.workCompleted?.trim()) {
      throw new Error('Production order, process stage, and work completed description are required.');
    }
    const created = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === body.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'In Progress' && po.status !== 'Rework') {
        throw new Error(`Daily updates can only be added for Active or Rework orders (current: ${po.status}).`);
      }
      const now = new Date().toISOString();
      const du = {
        id: generateId('du'),
        productionOrderId: po.id,
        productionOrderDocNo: po.docNo,
        workDate: body.workDate || now.slice(0, 10),
        stage: body.stage.trim(),
        workCompleted: body.workCompleted.trim(),
        completedQty: Math.min(po.quantity, Math.max(0, Number(body.completedQty) || 0)),
        workHours: Math.max(0, Number(body.workHours) || 0),
        stageStatus: body.stageStatus || 'In Progress',
        issues: body.issues?.trim() || '',
        remarks: body.remarks?.trim() || '',
        photoName: body.photoName || undefined,
        photoDataUrl: body.photoDataUrl || undefined,
        employeeName: req.user!.name,
        createdAt: now,
      };
      draft.dailyUpdates.unshift(du);
      po.updatedAt = now;
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Logged Daily Update',
        entityType: 'ProductionOrder',
        entityId: po.id,
        entityDocNo: po.docNo,
        details: `${du.stage} (${du.stageStatus}): ${du.workCompleted.slice(0, 80)}`,
      });
      return du;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/production/orders/:id/complete-manufacturing', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === req.params.id);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'In Progress') {
        throw new Error('Only orders In Progress can be marked manufacturing completed.');
      }
      const hasUpdates = draft.dailyUpdates.some((d) => d.productionOrderId === po.id);
      if (!hasUpdates) {
        throw new Error('Record at least one daily production update before completing manufacturing.');
      }
      const qty = Number(body.completedQty ?? po.quantity);
      if (!qty || qty <= 0 || qty > po.quantity) {
        throw new Error(`Completed quantity must be between 1 and ${po.quantity}.`);
      }
      const serials = Array.isArray(body.serialNumbers)
        ? body.serialNumbers.map((s: string) => s.trim()).filter(Boolean)
        : typeof body.serialNumbers === 'string'
          ? body.serialNumbers.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];

      const now = new Date().toISOString();
      po.completedManufacturingQty = qty;
      po.actualCompletionDate = body.actualCompletionDate || now.slice(0, 10);
      po.serialNumbers =
        serials.length > 0
          ? serials
          : Array.from({ length: qty }, (_, idx) => `CRYO-${po.model.replace(/[^A-Z0-9]/gi, '')}-${po.docNo.slice(-3)}${idx + 1}`);
      po.status = 'QC Pending';
      po.updatedAt = now;
      syncSOFulfillment(draft, po.salesOrderId);

      addNotification(draft, {
        title: `Quality Check Pending: ${po.docNo}`,
        message: `Manufacturing finished for ${po.docNo} (${qty}x ${po.productName}). Ready for QC inspection.`,
        department: 'production',
        severity: 'warning',
        link: '/production/quality-check',
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Completed Manufacturing',
        entityType: 'ProductionOrder',
        entityId: po.id,
        entityDocNo: po.docNo,
        details: `Completed manufacturing of ${qty} unit(s) (${po.serialNumbers.join(', ')}). Moved to QC Pending.`,
      });
      return po;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/production/quality-checks', requireAuth, requirePerm('production', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === body.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'QC Pending') {
        throw new Error(`Order ${po.docNo} is not in QC Pending state (current: ${po.status}).`);
      }
      const remainingToAccept = po.quantity - po.qcAcceptedQty;
      if (remainingToAccept <= 0) {
        throw new Error('All units on this production order have already passed QC.');
      }

      const finalResult = body.finalResult === 'Accepted' ? 'Accepted' : 'Rejected';
      if (finalResult === 'Rejected' && !body.rejectionReason?.trim()) {
        throw new Error('Rejection reason is required when rejecting in Quality Check.');
      }

      const prevAttempts = draft.qualityChecks.filter((q) => q.productionOrderId === po.id).length;
      const now = new Date().toISOString();
      const qcId = generateId('qc');
      const qcDocNo = nextDocNo(draft, 'QC');
      const acceptedQty = finalResult === 'Accepted' ? remainingToAccept : 0;
      const rejectedQty = finalResult === 'Rejected' ? remainingToAccept : 0;

      let reworkId: string | undefined;
      let reworkDocNo: string | undefined;

      if (finalResult === 'Rejected') {
        reworkId = generateId('rw');
        reworkDocNo = nextDocNo(draft, 'RW');
        draft.reworkOrders.unshift({
          id: reworkId,
          docNo: reworkDocNo,
          productionOrderId: po.id,
          productionOrderDocNo: po.docNo,
          qcId,
          qcDocNo,
          affectedQty: rejectedQty,
          affectedSerialNumbers: po.serialNumbers,
          rejectionReason: body.rejectionReason.trim(),
          requiredCorrection: body.requiredCorrection?.trim() || body.rejectionReason.trim(),
          assignedEmployee: body.assignedEmployee?.trim() || po.assignedEmployees[0] || po.productionInCharge,
          expectedCompletionDate: body.expectedCompletionDate || now.slice(0, 10),
          status: 'Open',
          remarks: body.remarks?.trim() || '',
          createdBy: req.user!.name,
          createdAt: now,
          updatedAt: now,
        });
        po.status = 'Rework';
        po.qcRejectedQty = rejectedQty;
        addNotification(draft, {
          title: `QC Rejected: ${po.docNo} (${qcDocNo})`,
          message: `Rework ${reworkDocNo} created — Reason: ${body.rejectionReason.trim()}`,
          department: 'production',
          severity: 'error',
          link: '/production/rework',
        });
      } else {
        po.qcAcceptedQty = round2(po.qcAcceptedQty + acceptedQty);
        po.qcRejectedQty = 0;
        po.status = 'Completed';
        addNotification(draft, {
          title: `Ready for Dispatch: ${po.docNo}`,
          message: `${po.quantity}x ${po.productName} for ${po.customerName} passed QC (${qcDocNo}) and is ready for dispatch.`,
          department: 'logistics',
          severity: 'success',
          link: '/logistics/ready',
        });
      }

      const qc = {
        id: qcId,
        docNo: qcDocNo,
        attemptNumber: prevAttempts + 1,
        productionOrderId: po.id,
        productionOrderDocNo: po.docNo,
        productName: `${po.productName} (${po.model})`,
        inspectedQty: remainingToAccept,
        acceptedQty,
        rejectedQty,
        serialNumbers: po.serialNumbers,
        inspectionDate: body.inspectionDate || now.slice(0, 10),
        inspector: body.inspector?.trim() || req.user!.name,
        checks: Array.isArray(body.checks) ? body.checks : [],
        finalResult: finalResult as 'Accepted' | 'Rejected',
        rejectionReason: finalResult === 'Rejected' ? body.rejectionReason.trim() : undefined,
        reworkId,
        reworkDocNo,
        remarks: body.remarks?.trim() || '',
        reportName: body.reportName || undefined,
        reportDataUrl: body.reportDataUrl || undefined,
        createdAt: now,
      };
      draft.qualityChecks.unshift(qc);
      po.updatedAt = now;
      syncSOFulfillment(draft, po.salesOrderId);

      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: `QC ${finalResult}`,
        entityType: 'QualityCheck',
        entityId: qc.id,
        entityDocNo: qc.docNo,
        details: `${qc.docNo} (Attempt #${qc.attemptNumber}) for ${po.docNo}: ${finalResult}.`,
      });
      return qc;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/production/rework/:id/complete', requireAuth, requirePerm('production', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { completedWork, remarks, assignedEmployee } = req.body as {
      completedWork: string;
      remarks?: string;
      assignedEmployee?: string;
    };
    if (!completedWork?.trim()) throw new Error('Completed corrective work description is required.');
    const updated = dbStore.mutate((draft) => {
      const rw = draft.reworkOrders.find((r) => r.id === req.params.id);
      if (!rw) throw new Error('NOT_FOUND:Rework order not found.');
      if (rw.status === 'Reinspection' || rw.status === 'Completed') {
        throw new Error('This rework has already been sent back for QC reinspection.');
      }
      const po = draft.productionOrders.find((p) => p.id === rw.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      const now = new Date().toISOString();
      rw.completedWork = completedWork.trim();
      if (assignedEmployee?.trim()) rw.assignedEmployee = assignedEmployee.trim();
      if (remarks?.trim()) rw.remarks = remarks.trim();
      rw.actualCompletionDate = now.slice(0, 10);
      rw.status = 'Reinspection';
      rw.updatedAt = now;

      po.status = 'QC Pending';
      po.updatedAt = now;
      syncSOFulfillment(draft, po.salesOrderId);

      addNotification(draft, {
        title: `Rework Complete — Reinspection Required (${po.docNo})`,
        message: `${rw.docNo} completed. ${po.docNo} returned to Quality Check queue.`,
        department: 'production',
        severity: 'warning',
        link: '/production/quality-check',
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'production',
        action: 'Completed Rework',
        entityType: 'ReworkOrder',
        entityId: rw.id,
        entityDocNo: rw.docNo,
        details: `Completed rework ${rw.docNo} for ${po.docNo}. Sent back to QC for reinspection.`,
      });
      return rw;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// DEPARTMENT 4: LOGISTICS & DELIVERY
// ==========================================

apiRouter.post('/logistics/delivery-orders', requireAuth, requirePerm('logistics', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const created = dbStore.mutate((draft) => {
      const po = draft.productionOrders.find((p) => p.id === body.productionOrderId);
      if (!po) throw new Error('NOT_FOUND:Production order not found.');
      if (po.status !== 'Completed' || po.qcAcceptedQty <= 0) {
        throw new Error('Only QC-accepted Completed production orders can be dispatched.');
      }
      const available = getAvailableDispatchQty(po, draft.deliveryOrders);
      const qty = Number(body.quantity);
      if (!qty || qty <= 0 || qty > available) {
        throw new Error(`Delivery quantity must be between 1 and ${available} (available QC-approved units).`);
      }

      const transportMethod = body.transportMethod === 'Courier' ? 'Courier' : 'Own Vehicle';
      if (transportMethod === 'Own Vehicle') {
        if (!body.vehicleNumber?.trim() || !body.driverName?.trim() || !body.driverPhone?.trim()) {
          throw new Error('Vehicle number, driver name, and driver phone are required for Own Vehicle.');
        }
      } else {
        if (!body.courierCompany?.trim()) {
          throw new Error('Courier company name is required for Courier transport.');
        }
      }

      const so = draft.salesOrders.find((s) => s.id === po.salesOrderId);
      const now = new Date().toISOString();
      const del = {
        id: generateId('del'),
        docNo: nextDocNo(draft, 'DEL'),
        salesOrderId: po.salesOrderId,
        salesOrderDocNo: po.salesOrderDocNo,
        productionOrderId: po.id,
        productionOrderDocNo: po.docNo,
        customerId: po.customerId,
        customerName: po.customerName,
        productName: `${po.productName} (${po.model})`,
        quantity: qty,
        serialNumbers: Array.isArray(body.serialNumbers) && body.serialNumbers.length > 0
          ? body.serialNumbers
          : po.serialNumbers.slice(0, qty),
        deliveryAddress: body.deliveryAddress?.trim() || so?.deliveryAddress || '',
        transportMethod: transportMethod as 'Own Vehicle' | 'Courier',
        vehicleNumber: transportMethod === 'Own Vehicle' ? body.vehicleNumber.trim() : undefined,
        driverName: transportMethod === 'Own Vehicle' ? body.driverName.trim() : undefined,
        driverPhone: transportMethod === 'Own Vehicle' ? body.driverPhone.trim() : undefined,
        courierCompany: transportMethod === 'Courier' ? body.courierCompany.trim() : undefined,
        trackingNumber: transportMethod === 'Courier' ? body.trackingNumber?.trim() || '' : undefined,
        courierContact: transportMethod === 'Courier' ? body.courierContact?.trim() || '' : undefined,
        plannedDispatchDate: body.plannedDispatchDate || now.slice(0, 10),
        expectedDeliveryDate: body.expectedDeliveryDate || now.slice(0, 10),
        deliveredQty: 0,
        status: 'Planned' as const,
        remarks: body.remarks?.trim() || '',
        createdBy: req.user!.name,
        createdAt: now,
        updatedAt: now,
      };
      draft.deliveryOrders.unshift(del);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'logistics',
        action: 'Created Delivery Order',
        entityType: 'DeliveryOrder',
        entityId: del.id,
        entityDocNo: del.docNo,
        details: `Created ${del.docNo} (${transportMethod}) for ${qty}x ${del.productName}.`,
      });
      return del;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/logistics/delivery-orders/:id/dispatch', requireAuth, requirePerm('logistics', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const del = draft.deliveryOrders.find((d) => d.id === req.params.id);
      if (!del) throw new Error('NOT_FOUND:Delivery order not found.');
      if (del.status !== 'Planned' && del.status !== 'Issue') {
        throw new Error(`Delivery order ${del.docNo} cannot be dispatched from status "${del.status}".`);
      }
      if (!body.deliveryChallanNo?.trim()) {
        throw new Error('Delivery challan number is required to confirm dispatch.');
      }
      if (del.transportMethod === 'Courier' && !(body.trackingNumber?.trim() || del.trackingNumber?.trim())) {
        throw new Error('Tracking / AWB number is required at dispatch for Courier shipments.');
      }

      const now = new Date().toISOString();
      const wasPlanned = del.status === 'Planned';
      if (body.trackingNumber?.trim()) del.trackingNumber = body.trackingNumber.trim();
      del.actualDispatchDate = body.actualDispatchDate || now;
      del.deliveryChallanNo = body.deliveryChallanNo.trim();
      del.dispatchAttachmentName = body.attachmentName || del.dispatchAttachmentName;
      del.dispatchAttachmentDataUrl = body.attachmentDataUrl || del.dispatchAttachmentDataUrl;
      del.dispatchRemarks = body.remarks?.trim() || '';
      del.status = 'In Transit';
      del.updatedAt = now;

      const po = draft.productionOrders.find((p) => p.id === del.productionOrderId);
      if (po && wasPlanned) {
        po.dispatchedQty = round2(po.dispatchedQty + del.quantity);
        po.updatedAt = now;
      }
      syncSOFulfillment(draft, del.salesOrderId);

      addNotification(draft, {
        title: `Dispatched: ${del.docNo} (${del.salesOrderDocNo})`,
        message: `${del.quantity}x ${del.productName} for ${del.customerName} is now In Transit via ${del.transportMethod}.`,
        department: 'sales',
        severity: 'info',
        link: `/tracking/${del.salesOrderId}`,
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'logistics',
        action: 'Confirmed Dispatch',
        entityType: 'DeliveryOrder',
        entityId: del.id,
        entityDocNo: del.docNo,
        details: `Dispatched ${del.docNo} (Challan: ${del.deliveryChallanNo}) — In Transit.`,
      });
      return del;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/logistics/delivery-orders/:id/deliver', requireAuth, requirePerm('logistics', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const del = draft.deliveryOrders.find((d) => d.id === req.params.id);
      if (!del) throw new Error('NOT_FOUND:Delivery order not found.');
      if (del.status === 'Delivered') {
        throw new Error(`Delivery ${del.docNo} has already been confirmed delivered.`);
      }
      if (del.status !== 'In Transit' && del.status !== 'Dispatched' && del.status !== 'Partially Delivered') {
        throw new Error(`Delivery must be In Transit before confirming delivery (current: ${del.status}).`);
      }
      const now = new Date().toISOString();

      if (body.result === 'Delivery Issue' || body.deliveryCondition === 'Damaged') {
        if (!body.issueReason?.trim()) throw new Error('Issue reason is required when recording a delivery issue.');
        del.status = 'Issue';
        del.deliveryCondition = body.deliveryCondition || 'Damaged';
        del.deliveryRemarks = body.remarks?.trim() || '';
        del.updatedAt = now;
        draft.deliveryIssues.unshift({
          id: generateId('di'),
          deliveryOrderId: del.id,
          deliveryOrderDocNo: del.docNo,
          salesOrderDocNo: del.salesOrderDocNo,
          customerName: del.customerName,
          issueType: body.issueType || (body.deliveryCondition === 'Damaged' ? 'Damage' : 'Failed Attempt'),
          affectedQty: Number(body.affectedQty) || del.quantity,
          reason: body.issueReason.trim(),
          reportedDate: body.deliveryDate || now.slice(0, 10),
          responsibleEmployee: req.user!.name,
          correctiveAction: body.correctiveAction?.trim() || 'Investigating with carrier / driver',
          nextAttemptDate: body.nextAttemptDate || undefined,
          status: 'Open',
          createdAt: now,
        });
        addActivity(draft, {
          actorId: req.user!.id,
          actorName: req.user!.name,
          department: 'logistics',
          action: 'Logged Delivery Issue',
          entityType: 'DeliveryOrder',
          entityId: del.id,
          entityDocNo: del.docNo,
          details: `Delivery issue on ${del.docNo}: ${body.issueReason.trim()}`,
        });
        return del;
      }

      if (!body.receivedBy?.trim()) throw new Error('Receiver name is required to confirm delivery.');
      const deliveredNow = Number(body.deliveredQty ?? del.quantity);
      if (!deliveredNow || deliveredNow <= 0 || deliveredNow > del.quantity) {
        throw new Error(`Delivered quantity must be between 1 and ${del.quantity}.`);
      }

      const prevDelivered = del.deliveredQty || 0;
      const newDelivered = round2(Math.min(del.quantity, prevDelivered + deliveredNow));
      const delta = round2(newDelivered - prevDelivered);

      del.actualDeliveryDate = body.deliveryDate || now.slice(0, 10);
      del.receivedBy = body.receivedBy.trim();
      del.deliveredQty = newDelivered;
      del.deliveryCondition = 'Good';
      del.podName = body.podName || undefined;
      del.podDataUrl = body.podDataUrl || undefined;
      del.deliveryRemarks = body.remarks?.trim() || '';
      del.status = newDelivered >= del.quantity ? 'Delivered' : 'Partially Delivered';
      del.updatedAt = now;

      const po = draft.productionOrders.find((p) => p.id === del.productionOrderId);
      if (po) {
        po.deliveredQty = round2(po.deliveredQty + delta);
        po.updatedAt = now;
      }
      // Automatically updates SO fulfillment status while keeping payment balance untouched!
      syncSOFulfillment(draft, del.salesOrderId);

      addNotification(draft, {
        title: `Delivered: ${del.docNo} (${del.salesOrderDocNo})`,
        message: `${del.deliveredQty}x ${del.productName} delivered to ${del.customerName} (Received by ${del.receivedBy}).`,
        department: 'sales',
        severity: 'success',
        link: `/tracking/${del.salesOrderId}`,
      });
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'logistics',
        action: 'Confirmed Delivery',
        entityType: 'DeliveryOrder',
        entityId: del.id,
        entityDocNo: del.docNo,
        details: `Confirmed delivery of ${del.deliveredQty}/${del.quantity} units for ${del.salesOrderDocNo} (Received by ${del.receivedBy}).`,
      });
      return del;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/logistics/delivery-issues/:id/resolve', requireAuth, requirePerm('logistics', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const { resolutionNotes, retryTransit } = req.body as { resolutionNotes?: string; retryTransit?: boolean };
    const updated = dbStore.mutate((draft) => {
      const issue = draft.deliveryIssues.find((i) => i.id === req.params.id);
      if (!issue) throw new Error('NOT_FOUND:Delivery issue not found.');
      issue.status = 'Resolved';
      issue.resolutionNotes = resolutionNotes?.trim() || 'Resolved';
      if (retryTransit) {
        const del = draft.deliveryOrders.find((d) => d.id === issue.deliveryOrderId);
        if (del && del.status === 'Issue') {
          del.status = 'In Transit';
          del.updatedAt = new Date().toISOString();
        }
      }
      return issue;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// ADMINISTRATION MODULE
// ==========================================

apiRouter.post('/admin/employees', requireAuth, requirePerm('admin', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim() || !body.email?.trim() || !body.employeeId?.trim()) {
      throw new Error('Employee name, Employee ID, and Email are required.');
    }
    const created = dbStore.mutate((draft) => {
      if (
        draft.employees.some(
          (e) =>
            e.email.toLowerCase() === body.email.trim().toLowerCase() ||
            e.employeeId.toLowerCase() === body.employeeId.trim().toLowerCase(),
        )
      ) {
        throw new Error('An employee with this Email or Employee ID already exists.');
      }
      const emp = {
        id: generateId('emp'),
        employeeId: body.employeeId.trim().toUpperCase(),
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        phone: body.phone?.trim() || '',
        department: body.department || 'sales',
        roleId: body.roleId || 'role-sales-exec',
        designation: body.designation?.trim() || 'Executive',
        status: (body.status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
        passwordHash: bcrypt.hashSync(body.password?.trim() || 'cryo123', 8),
        createdAt: new Date().toISOString(),
      };
      draft.employees.push(emp);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'admin',
        action: 'Created Employee',
        entityType: 'Employee',
        entityId: emp.id,
        entityDocNo: emp.employeeId,
        details: `Added employee ${emp.name} (${emp.department}).`,
      });
      const { passwordHash: _ph, ...safe } = emp;
      return safe;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.put('/admin/employees/:id', requireAuth, requirePerm('admin', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const emp = draft.employees.find((e) => e.id === req.params.id);
      if (!emp) throw new Error('NOT_FOUND:Employee not found.');
      if (emp.id === req.user!.id && body.status === 'Inactive') {
        throw new Error('You cannot deactivate your own Super Admin account.');
      }
      emp.name = body.name?.trim() || emp.name;
      emp.phone = body.phone?.trim() ?? emp.phone;
      emp.department = body.department || emp.department;
      emp.roleId = body.roleId || emp.roleId;
      emp.designation = body.designation?.trim() || emp.designation;
      emp.status = body.status === 'Inactive' ? 'Inactive' : 'Active';
      if (body.password?.trim() && body.password.trim().length >= 6) {
        emp.passwordHash = bcrypt.hashSync(body.password.trim(), 8);
      }
      const { passwordHash: _ph, ...safe } = emp;
      return safe;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.put('/admin/roles/:id', requireAuth, requirePerm('admin', 'manage'), (req: AuthenticatedRequest, res) => {
  try {
    const updated = dbStore.mutate((draft) => {
      const role = draft.roles.find((r) => r.id === req.params.id);
      if (!role) throw new Error('NOT_FOUND:Role not found.');
      if (req.body.description !== undefined) role.description = req.body.description;
      if (req.body.permissions) role.permissions = req.body.permissions;
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'admin',
        action: 'Updated Role Permissions',
        entityType: 'Role',
        entityId: role.id,
        entityDocNo: role.name,
        details: `Updated permissions matrix for ${role.name}.`,
      });
      return role;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.put('/admin/company', requireAuth, requirePerm('admin', 'manage'), (req: AuthenticatedRequest, res) => {
  try {
    const updated = dbStore.mutate((draft) => {
      draft.company = { ...draft.company, ...req.body };
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'admin',
        action: 'Updated Company Profile',
        entityType: 'CompanySettings',
        entityId: 'company',
        entityDocNo: draft.company.companyName,
        details: 'Updated organization profile, bank details, and commercial defaults.',
      });
      return draft.company;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

apiRouter.post('/admin/reset-demo', requireAuth, requirePerm('admin', 'manage'), (req: AuthenticatedRequest, res) => {
  try {
    const { mode } = req.body as { mode?: 'seed' | 'clean' };
    dbStore.resetDemoData(mode === 'clean');
    res.json({ ok: true, mode: mode || 'seed' });
  } catch (err) {
    sendError(res, err);
  }
});
