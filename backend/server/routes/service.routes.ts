import { Router } from 'express';
import {
  CustomerModel,
  DeliveredProductModel,
  MaterialModel,
  MaterialRequestModel,
  ProductModel,
  ServiceBillingModel,
  ServiceExpenseModel,
  ServiceJobModel,
  ServiceMaterialRequestModel,
  ServiceRequestModel,
  ServiceWorkUpdateModel,
  TechnicianAdvanceModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { generateId, sendError } from '../utils/routeUtils';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';

export const serviceRouter = Router();

// ==========================================
// SHARED DELIVERED PRODUCTS REGISTER
// Accessible to both Service and Production
// ==========================================

async function handleGetDeliveredProducts(req: AuthenticatedRequest, res: any) {
  try {
    const { customerId, productId, serialNumber, warrantyStatus, status, search } = req.query;
    const filter: Record<string, any> = {};

    if (customerId) filter.customerId = customerId;
    if (productId) filter.productId = productId;
    if (serialNumber) filter.serialNumber = new RegExp(String(serialNumber), 'i');
    if (warrantyStatus) filter.warrantyStatus = warrantyStatus;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { serialNumber: new RegExp(String(search), 'i') },
        { productName: new RegExp(String(search), 'i') },
        { customerName: new RegExp(String(search), 'i') },
        { modelNumber: new RegExp(String(search), 'i') },
      ];
    }

    const items = await DeliveredProductModel.find(filter).sort({ deliveredDate: -1 }).lean();
    res.json(items);
  } catch (err) {
    sendError(res, err);
  }
}

async function handleGetDeliveredProductById(req: AuthenticatedRequest, res: any) {
  try {
    const { id } = req.params;
    const item = await DeliveredProductModel.findOne({ $or: [{ id }, { serialNumber: id }] }).lean();
    if (!item) {
      throw new Error(`NOT_FOUND: Delivered product '${id}' not found.`);
    }

    // Include service history for this product
    const [requests, jobs] = await Promise.all([
      ServiceRequestModel.find({
        $or: [{ deliveredProductId: item.id }, { serialNumber: item.serialNumber }],
      })
        .sort({ createdAt: -1 })
        .lean(),
      ServiceJobModel.find({
        $or: [{ deliveredProductId: item.id }, { serialNumber: item.serialNumber }],
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({
      product: item,
      serviceHistory: {
        requests,
        jobs,
      },
    });
  } catch (err) {
    sendError(res, err);
  }
}

// Service routes
serviceRouter.get('/service/delivered-products', requireAuth, handleGetDeliveredProducts);
serviceRouter.get('/service/delivered-products/:id', requireAuth, handleGetDeliveredProductById);

// Production department shared alias
serviceRouter.get('/production/delivered-products', requireAuth, handleGetDeliveredProducts);
serviceRouter.get('/production/delivered-products/:id', requireAuth, handleGetDeliveredProductById);

// Create Delivered Product (Manual or Onboarding)
serviceRouter.post('/service/delivered-products', requireAuth, requirePerm('service', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.serialNumber || !body.productName || !body.customerId) {
      throw new Error('serialNumber, productName, and customerId are required.');
    }

    const existing = await DeliveredProductModel.findOne({ serialNumber: body.serialNumber.trim() });
    if (existing) {
      throw new Error(`Delivered product with serial number '${body.serialNumber}' already exists.`);
    }

    const customer = await CustomerModel.findOne({ id: body.customerId }).lean();
    const deliveredDate = body.deliveredDate || new Date().toISOString().split('T')[0];
    const warrantyMonths = Number(body.warrantyPeriodMonths) || 12;

    const startDate = new Date(deliveredDate);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + warrantyMonths);
    const isUnderWarranty = new Date() <= endDate;

    const doc = await DeliveredProductModel.create({
      id: generateId('DP'),
      serialNumber: body.serialNumber.trim(),
      productId: body.productId || 'prod-custom',
      productName: body.productName.trim(),
      modelNumber: body.modelNumber || '',
      customerId: body.customerId,
      customerName: customer?.name || body.customerName || 'Customer',
      customerContact: customer?.contactPerson || body.customerContact || '',
      customerPhone: customer?.phone || body.customerPhone || '',
      customerEmail: customer?.email || body.customerEmail || '',
      deliveryAddress: body.deliveryAddress || body.installedAddress || customer?.shippingAddress || customer?.billingAddress || 'Installed Site Location',
      salesOrderId: body.salesOrderId,
      salesOrderDocNo: body.salesOrderDocNo,
      productionOrderId: body.productionOrderId,
      productionOrderDocNo: body.productionOrderDocNo,
      deliveryOrderId: body.deliveryOrderId,
      deliveryOrderDocNo: body.deliveryOrderDocNo,
      deliveredDate,
      warrantyPeriodMonths: warrantyMonths,
      warrantyStartDate: deliveredDate,
      warrantyEndDate: endDate.toISOString().split('T')[0],
      warrantyStatus: body.warrantyStatus || (isUnderWarranty ? 'Under Warranty' : 'Expired'),
      status: body.status || 'Active',
      notes: body.notes || '',
    });

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'service',
      action: 'Registered Delivered Product',
      entityType: 'DeliveredProduct',
      entityId: doc.id,
      entityDocNo: doc.serialNumber,
      details: `Registered delivered machinery ${doc.productName} (S/N: ${doc.serialNumber}) for ${doc.customerName}`,
    });

    res.status(201).json(doc);
  } catch (err) {
    sendError(res, err);
  }
});

// Update Delivered Product
serviceRouter.put('/service/delivered-products/:id', requireAuth, requirePerm('service', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const item = await DeliveredProductModel.findOne({ id });
    if (!item) throw new Error(`NOT_FOUND: Delivered product '${id}' not found.`);

    Object.assign(item, body);
    item.updatedAt = new Date().toISOString() as any;
    await item.save();

    res.json(item);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// SERVICE REQUESTS (SRV-xxxx)
// ==========================================

serviceRouter.get('/service/requests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, customerId, priority, serviceType } = req.query;
    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (priority) filter.priority = priority;
    if (serviceType) filter.serviceType = serviceType;

    const items = await ServiceRequestModel.find(filter).sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.get('/service/requests/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const item = await ServiceRequestModel.findOne({
      $or: [{ id: req.params.id }, { docNo: req.params.id }],
    }).lean();
    if (!item) throw new Error(`NOT_FOUND: Service request '${req.params.id}' not found.`);
    res.json(item);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.post('/service/requests', requireAuth, requirePerm('service', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    let dp: any = null;
    if (body.deliveredProductId) {
      dp = await DeliveredProductModel.findOne({ id: body.deliveredProductId }).lean();
    } else if (body.serialNumber) {
      dp = await DeliveredProductModel.findOne({ serialNumber: body.serialNumber.trim() }).lean();
    }

    const customerId = body.customerId || dp?.customerId;
    if (!customerId || !body.issueDescription) {
      throw new Error('customerId and issueDescription are required.');
    }

    const docNo = await mongoERPRepository.getNextDocNo('SRV');
    const customer = await CustomerModel.findOne({ id: customerId }).lean();

    const isUnderWarranty = dp ? dp.warrantyStatus === 'Under Warranty' : Boolean(body.isUnderWarranty);

    const doc = await ServiceRequestModel.create({
      id: generateId('SRV'),
      docNo,
      requestDate: body.requestDate || new Date().toISOString().split('T')[0],
      customerId,
      customerName: customer?.name || body.customerName || 'Customer',
      contactPerson: body.contactPerson || customer?.contactPerson || '',
      contactPhone: body.contactPhone || customer?.phone || '',
      contactEmail: body.contactEmail || customer?.email || '',
      serviceAddress: body.serviceAddress || dp?.deliveryAddress || customer?.shippingAddress || '',
      deliveredProductId: dp?.id || body.deliveredProductId || 'DP-MANUAL',
      serialNumber: dp?.serialNumber || body.serialNumber || 'N/A',
      productName: dp?.productName || body.productName || 'Equipment',
      modelNumber: dp?.modelNumber || body.modelNumber || '',
      serviceType: body.serviceType || 'Customer Site',
      priority: body.priority || 'Medium',
      issueDescription: body.issueDescription,
      isUnderWarranty,
      warrantyClaimValid: isUnderWarranty,
      warrantyRemarks: body.warrantyRemarks || (isUnderWarranty ? 'Covered under warranty period' : 'Warranty expired or not applicable'),
      status: 'Open',
      createdBy: req.user!.name,
    });

    if (dp) {
      await DeliveredProductModel.updateOne({ id: dp.id }, { $set: { status: 'Under Service' } });
    }

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'service',
      action: 'Created Service Request',
      entityType: 'ServiceRequest',
      entityId: doc.id,
      entityDocNo: doc.docNo,
      details: `Logged Service Request ${doc.docNo} for ${doc.customerName} (${doc.productName} S/N: ${doc.serialNumber})`,
    });

    res.status(201).json(doc);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.patch('/service/requests/:id/warranty-check', requireAuth, requirePerm('service', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { isUnderWarranty, warrantyClaimValid, warrantyRemarks, warrantyStatus } = req.body;
    const reqDoc = await ServiceRequestModel.findOne({ id });
    if (!reqDoc) throw new Error(`NOT_FOUND: Service request '${id}' not found.`);

    if (typeof isUnderWarranty === 'boolean') reqDoc.isUnderWarranty = isUnderWarranty;
    if (warrantyStatus) reqDoc.isUnderWarranty = warrantyStatus === 'Under Warranty';
    if (typeof warrantyClaimValid === 'boolean') reqDoc.warrantyClaimValid = warrantyClaimValid;
    if (warrantyRemarks !== undefined) reqDoc.warrantyRemarks = warrantyRemarks;
    await reqDoc.save();

    res.json({
      ...reqDoc.toObject(),
      warrantyStatus: reqDoc.isUnderWarranty ? 'Under Warranty' : 'Expired',
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Assign Technician & Schedule -> Creates or updates ServiceJob
serviceRouter.post('/service/requests/:id/assign', requireAuth, requirePerm('service', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { assignedTechnicianId, assignedTechnicianName, scheduledDate, serviceType, priority, technicianId, technicianName } = req.body;
    const techId = assignedTechnicianId || technicianId;
    const techName = assignedTechnicianName || technicianName;

    if (!techId || !techName || !scheduledDate) {
      throw new Error('assignedTechnicianId, assignedTechnicianName, and scheduledDate are required.');
    }

    const srv = await ServiceRequestModel.findOne({ id });
    if (!srv) throw new Error(`NOT_FOUND: Service request '${id}' not found.`);

    srv.assignedTechnicianId = techId;
    srv.assignedTechnicianName = techName;
    srv.scheduledDate = scheduledDate;
    srv.status = 'Assigned';

    // Check if Job already exists
    let job = await ServiceJobModel.findOne({ serviceRequestId: srv.id });
    if (!job) {
      const jobDocNo = await mongoERPRepository.getNextDocNo('JOB');
      job = await ServiceJobModel.create({
        id: generateId('JOB'),
        docNo: jobDocNo,
        serviceRequestId: srv.id,
        serviceRequestDocNo: srv.docNo,
        customerId: srv.customerId,
        customerName: srv.customerName,
        deliveredProductId: srv.deliveredProductId,
        serialNumber: srv.serialNumber,
        productName: srv.productName,
        serviceType: serviceType || srv.serviceType,
        priority: priority || srv.priority,
        assignedTechnicianId: techId,
        assignedTechnicianName: techName,
        scheduledDate,
        status: 'Scheduled',
        isChargeable: !srv.warrantyClaimValid,
      });
      srv.assignedJobId = job.id;
    } else {
      job.assignedTechnicianId = assignedTechnicianId;
      job.assignedTechnicianName = assignedTechnicianName;
      job.scheduledDate = scheduledDate;
      job.serviceType = serviceType || job.serviceType;
      await job.save();
    }

    await srv.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'service',
      action: 'Dispatched Service Job',
      entityType: 'ServiceJob',
      entityId: job.id,
      entityDocNo: job.docNo,
      details: `Dispatched Job ${job.docNo} to ${assignedTechnicianName} for ${scheduledDate}`,
    });

    res.json({ serviceRequest: srv, serviceJob: job });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// SERVICE JOBS (JOB-xxxx)
// ==========================================

serviceRouter.get('/service/jobs', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, technicianId, myJobs, serviceType } = req.query;
    const filter: Record<string, any> = {};

    if (status) filter.status = status;
    if (serviceType) filter.serviceType = serviceType;
    if (technicianId) filter.assignedTechnicianId = technicianId;
    if (myJobs === 'true') {
      filter.$or = [{ assignedTechnicianId: req.user!.id }, { assignedTechnicianId: req.user!.employeeId }];
    }

    const items = await ServiceJobModel.find(filter).sort({ scheduledDate: -1, createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.get('/service/jobs/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const job = await ServiceJobModel.findOne({ $or: [{ id }, { docNo: id }] }).lean();
    if (!job) throw new Error(`NOT_FOUND: Service job '${id}' not found.`);

    const [request, product, updates, materialRequests, expenses, billing] = await Promise.all([
      ServiceRequestModel.findOne({ id: job.serviceRequestId }).lean(),
      DeliveredProductModel.findOne({ id: job.deliveredProductId }).lean(),
      ServiceWorkUpdateModel.find({ serviceJobId: job.id }).sort({ date: -1, createdAt: -1 }).lean(),
      ServiceMaterialRequestModel.find({ serviceJobId: job.id }).sort({ createdAt: -1 }).lean(),
      ServiceExpenseModel.find({ serviceJobId: job.id }).sort({ date: -1 }).lean(),
      ServiceBillingModel.findOne({ serviceJobId: job.id }).lean(),
    ]);

    res.json({
      job,
      request,
      product,
      updates,
      materialRequests,
      expenses,
      billing,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Technician Check-In
serviceRouter.post('/service/jobs/:id/check-in', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { location, notes } = req.body;
    const job = await ServiceJobModel.findOne({ id });
    if (!job) throw new Error(`NOT_FOUND: Service job '${id}' not found.`);

    const checkInTimestamp = new Date().toISOString();
    job.checkIn = {
      timestamp: checkInTimestamp,
      performedBy: req.user!.name,
      location: location || 'Customer Site',
      notes: notes || '',
    };
    (job as any).checkInTime = checkInTimestamp;
    job.status = 'In Progress';
    await job.save();

    await ServiceRequestModel.updateOne({ id: job.serviceRequestId }, { $set: { status: 'In Progress' } });

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'service',
      action: 'Technician Check-In',
      entityType: 'ServiceJob',
      entityId: job.id,
      entityDocNo: job.docNo,
      details: `Technician ${req.user!.name} checked in for Job ${job.docNo}`,
    });

    res.json({
      ...job.toObject(),
      checkInTime: checkInTimestamp,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Technician Check-Out
serviceRouter.post('/service/jobs/:id/check-out', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const {
      resolutionSummary,
      customerRepresentativeName,
      customerSignatoryName,
      customerSignatoryDesignation,
      customerSignatureAck,
      customerFeedbackRating,
      customerFeedbackComments,
      rootCause,
      correctiveAction,
      preventiveAction,
    } = req.body;
    if (!resolutionSummary) {
      throw new Error('resolutionSummary is required for technician check-out.');
    }

    const job = await ServiceJobModel.findOne({ id });
    if (!job) throw new Error(`NOT_FOUND: Service job '${id}' not found.`);

    const checkOutTimestamp = new Date().toISOString();
    job.checkOut = {
      timestamp: checkOutTimestamp,
      performedBy: req.user!.name,
      resolutionSummary,
      customerRepresentativeName: customerSignatoryName || customerRepresentativeName || '',
      customerSignatureAck: Boolean(customerSignatureAck),
    };
    (job as any).checkOutTime = checkOutTimestamp;
    if (customerFeedbackRating) job.customerFeedbackScore = Number(customerFeedbackRating);
    if (customerFeedbackComments) job.customerFeedbackNotes = customerFeedbackComments;
    if (rootCause) job.rootCause = rootCause;
    if (correctiveAction) job.correctiveAction = correctiveAction;
    if (preventiveAction) job.preventiveAction = preventiveAction;
    job.status = 'Work Completed';
    await job.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'service',
      action: 'Technician Check-Out',
      entityType: 'ServiceJob',
      entityId: job.id,
      entityDocNo: job.docNo,
      details: `Technician ${req.user!.name} checked out for Job ${job.docNo}`,
    });

    res.json({
      ...job.toObject(),
      checkOutTime: checkOutTimestamp,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Daily Work Update with Dynamic Checklist & Multiple Highlights
serviceRouter.post('/service/jobs/:id/work-updates', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { date, stageName, stage, hoursSpent, highlights, checklist, findingsNotes, workSummary } = req.body;

    const job = await ServiceJobModel.findOne({ id });
    if (!job) throw new Error(`NOT_FOUND: Service job '${id}' not found.`);

    const mappedChecklist = Array.isArray(checklist)
      ? checklist.map((c: any, idx: number) => ({
          id: c.id || `CHK-${Date.now()}-${idx + 1}`,
          item: c.item || `Inspection item ${idx + 1}`,
          result: c.result || 'Pending',
          remarks: c.remarks || c.notes || '',
          notes: c.notes || c.remarks || '',
        }))
      : [];

    const updateDoc = await ServiceWorkUpdateModel.create({
      id: generateId('SWU'),
      serviceJobId: job.id,
      date: date || new Date().toISOString().split('T')[0],
      technicianId: req.user!.id,
      technicianName: req.user!.name,
      stageName: stageName || stage || 'Diagnostic & Repair',
      hoursSpent: Number(hoursSpent) || 1,
      highlights: Array.isArray(highlights) ? highlights : [],
      checklist: mappedChecklist,
      findingsNotes: findingsNotes || workSummary || '',
      createdAt: new Date().toISOString(),
    });

    // Accumulate total hours
    job.totalHoursSpent = (job.totalHoursSpent || 0) + (Number(hoursSpent) || 1);
    await job.save();

    res.status(201).json(updateDoc);
  } catch (err) {
    sendError(res, err);
  }
});

// Service Completion Gate
serviceRouter.post('/service/jobs/:id/complete', requireAuth, requirePerm('service', 'confirm'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { customerFeedbackScore, customerFeedbackNotes } = req.body;

    const job = await ServiceJobModel.findOne({ id });
    if (!job) throw new Error(`NOT_FOUND: Service job '${id}' not found.`);

    job.status = 'Closed';
    job.completionDate = new Date().toISOString();
    if (customerFeedbackScore) job.customerFeedbackScore = Number(customerFeedbackScore);
    if (customerFeedbackNotes) job.customerFeedbackNotes = customerFeedbackNotes;
    await job.save();

    await ServiceRequestModel.updateOne(
      { id: job.serviceRequestId },
      { $set: { status: 'Completed', updatedAt: new Date().toISOString() } },
    );

    // Release delivered product back to Active status
    await DeliveredProductModel.updateOne(
      { id: job.deliveredProductId },
      { $set: { status: 'Active' } },
    );

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'service',
      action: 'Completed Service Job',
      entityType: 'ServiceJob',
      entityId: job.id,
      entityDocNo: job.docNo,
      details: `Completed and closed Service Job ${job.docNo}`,
    });

    res.json({ ok: true, job });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// SPARE PARTS & MATERIAL REQUESTS
// ==========================================

serviceRouter.get('/service/material-requests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const items = await ServiceMaterialRequestModel.find().sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.post('/service/jobs/:id/material-requests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { items, notes } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('At least one spare material item is required.');
    }

    const job = await ServiceJobModel.findOne({ id });
    if (!job) throw new Error(`NOT_FOUND: Service job '${id}' not found.`);

    const docNo = await mongoERPRepository.getNextDocNo('SMR');

    // Create Service Material Request
    const smr = await ServiceMaterialRequestModel.create({
      id: generateId('SMR'),
      docNo,
      serviceJobId: job.id,
      serviceJobDocNo: job.docNo,
      customerId: job.customerId,
      customerName: job.customerName,
      requestedBy: req.user!.name,
      requestDate: new Date().toISOString().split('T')[0],
      items: items.map((i: any) => {
        const cost = Number(i.unitCost ?? i.estimatedCost) || 0;
        const qty = Number(i.quantityRequested) || 1;
        return {
          materialId: i.materialId,
          materialName: i.materialName,
          partNumber: i.partNumber || '',
          quantityRequested: qty,
          quantityIssued: 0,
          quantityUsed: 0,
          quantityReturned: 0,
          unit: i.unit || 'Nos',
          unitCost: cost,
          totalCost: qty * cost,
        };
      }),
      status: 'Requested',
      notes: notes || '',
    });

    // Also link/create into Supply Chain Material Request queue so Stores can issue it directly
    const mrDocNo = await mongoERPRepository.getNextDocNo('MR');
    const scMr = await MaterialRequestModel.create({
      id: generateId('MR'),
      docNo: mrDocNo,
      productionOrderId: job.id, // Reference to job
      productionOrderDocNo: `SERVICE-${job.docNo}`,
      salesOrderId: `SRV-${job.id}`,
      salesOrderDocNo: job.docNo,
      bomId: smr.id,
      bomDocNo: smr.docNo,
      productName: job.productName || 'Cryo Equipment Spare',
      requestedBy: req.user!.name,
      department: 'service',
      requestDate: smr.requestDate,
      requiredByDate: smr.requestDate,
      priority: 'High',
      status: 'Pending',
      receiptStatus: 'Pending',
      items: smr.items.map((i, idx) => ({
        materialId: i.materialId || `mat-spare-${idx}`,
        materialCode: i.partNumber || `SPARE-${idx + 1}`,
        materialName: i.materialName,
        requiredQty: i.quantityRequested,
        issuedQty: 0,
        receivedQty: 0,
        returnedQty: 0,
        unit: i.unit || 'Nos',
      })),
      notes: `Service Spare Parts Indent for ${job.customerName} (Job: ${job.docNo})`,
    });

    smr.linkedMaterialRequestId = scMr.id;
    await smr.save();

    job.status = 'Awaiting Spares';
    await job.save();

    res.status(201).json(smr);
  } catch (err) {
    sendError(res, err);
  }
});

// Acknowledge receipt of spare parts
serviceRouter.patch('/service/material-requests/:id/receive', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const smr = await ServiceMaterialRequestModel.findOne({ id });
    if (!smr) throw new Error(`NOT_FOUND: Service material request '${id}' not found.`);

    smr.status = 'Received';
    smr.receivedDate = new Date().toISOString();
    // Default issued quantity to requested if not yet explicitly marked
    smr.items.forEach((i) => {
      if (!i.quantityIssued) i.quantityIssued = i.quantityRequested;
    });
    await smr.save();

    // Revert job back to In Progress
    await ServiceJobModel.updateOne({ id: smr.serviceJobId }, { $set: { status: 'In Progress' } });

    res.json(smr);
  } catch (err) {
    sendError(res, err);
  }
});

// Reconcile consumed and returned parts
serviceRouter.post('/service/material-requests/:id/reconcile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { itemsUsage, items } = req.body;
    const smr = await ServiceMaterialRequestModel.findOne({ id });
    if (!smr) throw new Error(`NOT_FOUND: Service material request '${id}' not found.`);

    const list = itemsUsage || items;
    if (Array.isArray(list)) {
      list.forEach((usage: any, idx: number) => {
        const item = smr.items.find((x) => x.id === usage.id || x.materialName === usage.materialName) || smr.items[idx];
        if (item) {
          item.quantityUsed = Number(usage.quantityUsed ?? usage.quantityConsumed) || 0;
          item.quantityReturned = Number(usage.quantityReturned) || 0;
        }
      });
    }

    smr.status = 'Reconciled';
    smr.reconciledDate = new Date().toISOString();
    await smr.save();

    res.json(smr);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// TECHNICIAN ADVANCES & EXPENSES
// ==========================================

serviceRouter.get('/service/advances', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { technicianId } = req.query;
    const filter: Record<string, any> = {};
    if (technicianId) filter.technicianId = technicianId;

    const items = await TechnicianAdvanceModel.find(filter).sort({ advanceDate: -1, createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.post('/service/advances', requireAuth, requirePerm('service', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { technicianId, technicianName, amount, advanceDate, paymentMode, purpose, serviceJobId, serviceJobDocNo } = req.body;
    if (!technicianId || !amount || !purpose) {
      throw new Error('technicianId, amount, and purpose are required.');
    }

    const docNo = await mongoERPRepository.getNextDocNo('ADV');
    const doc = await TechnicianAdvanceModel.create({
      id: generateId('ADV'),
      docNo,
      technicianId,
      technicianName: technicianName || 'Technician',
      serviceJobId,
      serviceJobDocNo,
      amount: Number(amount),
      advanceDate: advanceDate || new Date().toISOString().split('T')[0],
      paymentMode: paymentMode || 'Bank Transfer',
      purpose,
      status: 'Disbursed',
      approvedBy: req.user!.name,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json(doc);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.get('/service/expenses', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { technicianId, serviceJobId, status } = req.query;
    const filter: Record<string, any> = {};
    if (technicianId) filter.technicianId = technicianId;
    if (serviceJobId) filter.serviceJobId = serviceJobId;
    if (status) filter.status = status;

    const items = await ServiceExpenseModel.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.post('/service/expenses', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { technicianId, technicianName, serviceJobId, serviceJobDocNo, date, category, description, amount, paidBy, receiptAttachment } = req.body;
    if (!category || !description || !amount) {
      throw new Error('category, description, and amount are required.');
    }

    const docNo = await mongoERPRepository.getNextDocNo('EXP');
    const doc = await ServiceExpenseModel.create({
      id: generateId('EXP'),
      docNo,
      serviceJobId,
      serviceJobDocNo,
      technicianId: technicianId || req.user!.id,
      technicianName: technicianName || req.user!.name,
      date: date || new Date().toISOString().split('T')[0],
      category,
      description,
      amount: Number(amount),
      paidBy: paidBy || 'Technician',
      receiptAttachment,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    });

    res.status(201).json(doc);
  } catch (err) {
    sendError(res, err);
  }
});

// Verify Expense
serviceRouter.patch('/service/expenses/:id/verify', requireAuth, requirePerm('service', 'verify'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    if (!['Verified', 'Rejected'].includes(status)) {
      throw new Error("status must be 'Verified' or 'Rejected'.");
    }

    const exp = await ServiceExpenseModel.findOne({ id });
    if (!exp) throw new Error(`NOT_FOUND: Service expense '${id}' not found.`);

    exp.status = status;
    exp.verifiedBy = req.user!.name;
    exp.verifiedAt = new Date().toISOString();
    if (rejectionReason) exp.rejectionReason = rejectionReason;
    await exp.save();

    res.json(exp);
  } catch (err) {
    sendError(res, err);
  }
});

// Settlement summary calculation
serviceRouter.get('/service/expenses/settlement-summary/:technicianId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { technicianId } = req.params;

    const [expenses, advances] = await Promise.all([
      ServiceExpenseModel.find({ technicianId, status: 'Verified' }).lean(),
      TechnicianAdvanceModel.find({ technicianId, status: 'Disbursed' }).lean(),
    ]);

    const employeePaid = expenses
      .filter((e) => e.paidBy === 'Technician')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const companyPaid = expenses
      .filter((e) => e.paidBy === 'Company')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const totalExpenses = employeePaid + companyPaid;
    const advancePaid = advances.reduce((acc, curr) => acc + curr.amount, 0);

    const reimbursementDue = Math.max(0, employeePaid - advancePaid);
    const advanceToReturn = Math.max(0, advancePaid - employeePaid);

    const settlementStatus =
      reimbursementDue > 0
        ? 'Reimbursement Due'
        : advanceToReturn > 0
          ? 'Advance Return Due'
          : 'Balanced';

    res.json({
      technicianId,
      totalExpenses,
      employeePaid,
      companyPaid,
      advancePaid,
      reimbursementDue,
      advanceToReturn,
      settlementStatus,
      verifiedExpensesCount: expenses.length,
      advancesCount: advances.length,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Settle expenses and advances
serviceRouter.post('/service/expenses/settle', requireAuth, requirePerm('service', 'confirm'), async (req: AuthenticatedRequest, res) => {
  try {
    const { technicianId } = req.body;
    if (!technicianId) throw new Error('technicianId is required.');

    await TechnicianAdvanceModel.updateMany(
      { technicianId, status: 'Disbursed' },
      { $set: { status: 'Settled', settledDate: new Date().toISOString() } },
    );

    res.json({ ok: true, message: `Advances for technician ${technicianId} settled.` });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// SERVICE BILLING (SBL-xxxx)
// ==========================================

serviceRouter.get('/service/billings', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const items = await ServiceBillingModel.find().sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.post('/service/jobs/:id/billing', requireAuth, requirePerm('service', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { items, taxPercent, notes } = req.body;

    const job = await ServiceJobModel.findOne({ id });
    if (!job) throw new Error(`NOT_FOUND: Service job '${id}' not found.`);

    const billingItems = (Array.isArray(items) ? items : []).map((item: any) => {
      const unitPrice = Number(item.unitPrice ?? item.unitRate) || 0;
      const quantity = Number(item.quantity) || 1;
      const totalPrice = Number(item.totalPrice ?? item.amount) ?? (unitPrice * quantity);
      const isWarrantyCovered = Boolean(item.isWarrantyCovered ?? item.warrantyCovered);
      return {
        description: item.description || 'Service Item',
        itemType: item.itemType || 'Labor',
        quantity,
        unitPrice,
        totalPrice,
        isWarrantyCovered,
      };
    });

    const subtotal = billingItems.reduce(
      (acc: number, curr: any) => acc + (curr.isWarrantyCovered ? 0 : curr.totalPrice),
      0,
    );

    const taxRate = Number(taxPercent) ?? 18;
    const taxAmount = Math.round((subtotal * taxRate) / 100);
    const grandTotal = subtotal + taxAmount;

    const docNo = await mongoERPRepository.getNextDocNo('SBL');
    const billingDoc = await ServiceBillingModel.create({
      id: generateId('SBL'),
      docNo,
      serviceJobId: job.id,
      serviceJobDocNo: job.docNo,
      customerId: job.customerId,
      customerName: job.customerName,
      billingDate: new Date().toISOString().split('T')[0],
      items: billingItems,
      subtotal,
      taxPercent: taxRate,
      taxAmount,
      grandTotal,
      paymentStatus: grandTotal === 0 ? 'Waived' : 'Pending',
      notes: notes || (grandTotal === 0 ? 'Complimentary warranty service' : ''),
    });

    job.billingId = billingDoc.id;
    job.status = 'Billed';
    await job.save();

    res.status(201).json(billingDoc);
  } catch (err) {
    sendError(res, err);
  }
});

serviceRouter.patch('/service/billings/:id/payment', requireAuth, requirePerm('service', 'confirm'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentMode, paymentReference } = req.body;

    const bill = await ServiceBillingModel.findOne({ id });
    if (!bill) throw new Error(`NOT_FOUND: Service billing '${id}' not found.`);

    bill.paymentStatus = paymentStatus || 'Paid';
    bill.paymentMode = paymentMode || 'Bank Transfer';
    bill.paymentReference = paymentReference || '';
    bill.paymentDate = new Date().toISOString();
    await bill.save();

    res.json(bill);
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// SERVICE DASHBOARD KPIS
// ==========================================

serviceRouter.get('/service/dashboard', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const [
      totalEquipment,
      underWarranty,
      openRequests,
      scheduledJobs,
      inProgressJobs,
      closedJobs,
      pendingExpenses,
      billings,
    ] = await Promise.all([
      DeliveredProductModel.countDocuments(),
      DeliveredProductModel.countDocuments({ warrantyStatus: 'Under Warranty' }),
      ServiceRequestModel.countDocuments({ status: { $in: ['Open', 'Assigned'] } }),
      ServiceJobModel.countDocuments({ status: 'Scheduled' }),
      ServiceJobModel.countDocuments({ status: { $in: ['In Progress', 'Awaiting Spares'] } }),
      ServiceJobModel.countDocuments({ status: 'Closed' }),
      ServiceExpenseModel.countDocuments({ status: 'Pending' }),
      ServiceBillingModel.find({ paymentStatus: 'Paid' }).lean(),
    ]);

    const totalRevenueBilled = billings.reduce((acc, curr) => acc + curr.grandTotal, 0);

    res.json({
      totalEquipment,
      underWarranty,
      warrantyRate: totalEquipment > 0 ? Math.round((underWarranty / totalEquipment) * 100) : 0,
      openRequests,
      scheduledJobs,
      inProgressJobs,
      closedJobs,
      pendingExpenses,
      totalRevenueBilled,
    });
  } catch (err) {
    sendError(res, err);
  }
});
