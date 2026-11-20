import { Router } from 'express';
import type { CustomerSnapshot, QuotationItem } from '../../src/types/erp';
import { calculatePaymentSummary, calculateQuotationTotals, normalizeQuotationItems, round2 } from '../../src/utils/erpLogic';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { addActivity, addNotification, dbStore, generateId, nextDocNo } from '../db';
import { sendError } from '../utils/routeUtils';

export const salesRouter = Router();

salesRouter.post('/sales/customers', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim()) throw new Error('Customer / company name is required.');
    const created = dbStore.mutate((draft) => {
      const now = new Date().toISOString();
      const c = {
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
      draft.customers.unshift(c);
      addActivity(draft, {
        actorId: req.user!.id,
        actorName: req.user!.name,
        department: 'sales',
        action: 'Created Customer',
        entityType: 'Customer',
        entityId: c.id,
        entityDocNo: c.name,
        details: `Created customer account for ${c.name}.`,
      });
      return c;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.put('/sales/customers/:id', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const c = draft.customers.find((x) => x.id === req.params.id);
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
      return c;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post('/sales/products', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim() || !body.code?.trim()) throw new Error('Product name and code are required.');
    const created = dbStore.mutate((draft) => {
      if (draft.products.some((p) => p.code.toLowerCase() === body.code.trim().toLowerCase())) {
        throw new Error(`Product code ${body.code} already exists.`);
      }
      const prod = {
        id: generateId('prod'),
        code: body.code.trim().toUpperCase(),
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
      draft.products.unshift(prod);
      return prod;
    });
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.put('/sales/products/:id', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const updated = dbStore.mutate((draft) => {
      const p = draft.products.find((x) => x.id === req.params.id);
      if (!p) throw new Error('NOT_FOUND:Product not found.');
      p.name = body.name?.trim() || p.name;
      p.category = body.category?.trim() || p.category;
      p.model = body.model?.trim() || p.model;
      p.specifications = body.specifications?.trim() ?? p.specifications;
      if (Array.isArray(body.highlights)) p.highlights = body.highlights.filter((h: string) => h.trim());
      if (body.sellingPrice !== undefined) p.sellingPrice = Math.max(0, Number(body.sellingPrice) || 0);
      if (body.status) p.status = body.status === 'Inactive' ? 'Inactive' : 'Active';
      if (Array.isArray(body.bomTemplate)) p.bomTemplate = body.bomTemplate;
      return p;
    });
    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

salesRouter.post('/sales/enquiries', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/enquiries/:id/status', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/follow-ups', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/quotations', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/quotations/:id/revise', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/quotations/:id/status', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/proforma-invoices', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/customer-pos', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/customer-pos/:id/resolve-discrepancy', requireAuth, requirePerm('sales', 'edit'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/payments', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/payments/:id/verify', requireAuth, requirePerm('sales', 'approve'), (req: AuthenticatedRequest, res) => {
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

salesRouter.post('/sales/sales-orders', requireAuth, requirePerm('sales', 'create'), (req: AuthenticatedRequest, res) => {
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
