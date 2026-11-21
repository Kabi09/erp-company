import { withTransaction } from '../config/database';
import { ResearchProject } from '../models/department.model';
import { Router } from 'express';
import type { ApprovalDecisionType, ApprovalRequest, ApprovalWorkflow } from '../../src/types/erp';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  ApprovalRequestModel,
  ApprovalWorkflowModel,
  DeliveryOrderModel,
  QuotationModel,
  SupplierPOModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { canUserDecideRequest, checkPermission, isUserEligibleForLevel } from '../utils/rbacLogic';
import { sendError } from '../utils/routeUtils';

export const approvalRouter = Router();

// Helper to seed default workflows if none exist
export async function ensureDefaultApprovalWorkflows(): Promise<ApprovalWorkflow[]> {
  const existing = await ApprovalWorkflowModel.find().lean();
  if (existing.length > 0) return existing as ApprovalWorkflow[];

  const defaultWorkflows: Array<Omit<ApprovalWorkflow, 'createdAt' | 'updatedAt'>> = [
    {
      id: 'wf-quotation-approval',
      name: 'Quotation Commercial Approval',
      department: 'sales',
      module: 'quotations',
      triggerAction: 'submit',
      description: 'Sales Manager review and pricing authorization before quotation is sent to customer',
      enabled: true,
      allowSelfApproval: false,
      approvalLevels: [
        {
          levelNumber: 1,
          levelName: 'Sales Manager Review',
          approverType: 'role',
          eligibleRoleIds: ['role-sales-manager', 'role-super-admin'],
          eligibleEmployeeIds: [],
          requiredApprovalCount: 1,
        },
      ],
    },
    {
      id: 'wf-spo-approval',
      name: 'Supplier PO Procurement Approval',
      department: 'supply_chain',
      module: 'supplier_pos',
      triggerAction: 'submit',
      description: 'Sequential two-level verification (SCM Manager + Super Admin) prior to procurement',
      enabled: true,
      allowSelfApproval: false,
      approvalLevels: [
        {
          levelNumber: 1,
          levelName: 'SCM Manager Verification',
          approverType: 'role',
          eligibleRoleIds: ['role-scm-manager', 'role-super-admin'],
          eligibleEmployeeIds: [],
          requiredApprovalCount: 1,
        },
        {
          levelNumber: 2,
          levelName: 'Director / Finance Authorization',
          approverType: 'role',
          eligibleRoleIds: ['role-super-admin'],
          eligibleEmployeeIds: [],
          requiredApprovalCount: 1,
        },
      ],
    },
    {
      id: 'wf-delivery-exception',
      name: 'Delivery Cancellation Approval',
      department: 'logistics',
      module: 'delivery_orders',
      triggerAction: 'cancel',
      description: 'Logistics Head authorization required before cancelling planned delivery order',
      enabled: true,
      allowSelfApproval: false,
      approvalLevels: [
        {
          levelNumber: 1,
          levelName: 'Logistics Manager Authorization',
          approverType: 'role',
          eligibleRoleIds: ['role-logistics-manager', 'role-super-admin'],
          eligibleEmployeeIds: [],
          requiredApprovalCount: 1,
        },
      ],
    },
  ];

  await ApprovalWorkflowModel.insertMany(defaultWorkflows);
  return (await ApprovalWorkflowModel.find().lean()) as ApprovalWorkflow[];
}

// Document synchronization helpers
async function saveDecision(request: any) {
  if (request.module !== 'rnd_completion') {
    await request.save();
    return;
  }
  await withTransaction(async session => {
    const result = await ApprovalRequestModel.updateOne({id: request.id, __v: request.__v, status:'pending'}, {
      $set:{status:request.status,currentLevel:request.currentLevel,decisions:request.decisions},$inc:{__v:1}
    }, {session});
    if (!result.modifiedCount) throw new Error('CONCURRENCY_CONFLICT: Approval was already updated.');
    if (request.status === 'pending') return;
    const updated = await ResearchProject.updateOne({
      id:request.documentId,revision:Number(request.documentVersion),status:'Pending Completion Approval'
    }, {$set:{status:request.status==='approved'?'Successfully Completed':'In Progress'},$inc:{revision:1}}, {session});
    if (!updated.modifiedCount) throw new Error('CONCURRENCY_CONFLICT: Project version changed.');
  }, {requireReplicaSet:true});
}

async function applyApprovedStatusToDocument(reqDoc: any) {
  const now = new Date().toISOString();
  if (reqDoc.module === 'quotations') {
    await QuotationModel.updateOne(
      { id: reqDoc.documentId },
      { status: 'Approved', updatedAt: now },
    );
  } else if (reqDoc.module === 'supplier_pos') {
    await SupplierPOModel.updateOne(
      { id: reqDoc.documentId },
      { status: 'Approved', updatedAt: now },
    );
  } else if (reqDoc.module === 'delivery_orders') {
    await mongoERPRepository.cancelDeliveryOrderTx(
      reqDoc.documentId,
      reqDoc.documentSnapshot?.cancellationReason || 'Approved cancellation request',
      reqDoc.decisions?.[reqDoc.decisions.length - 1]?.decidedBy || { id: 'admin', name: 'System Admin' },
    );
  }
}

async function applyRejectedStatusToDocument(reqDoc: any, reason: string) {
  const now = new Date().toISOString();
  if (reqDoc.module === 'quotations') {
    await QuotationModel.updateOne(
      { id: reqDoc.documentId },
      { status: 'Rejected', rejectionReason: reason, updatedAt: now },
    );
  } else if (reqDoc.module === 'supplier_pos') {
    await SupplierPOModel.updateOne(
      { id: reqDoc.documentId },
      { status: 'Rejected', remarks: reason, updatedAt: now },
    );
  } else if (reqDoc.module === 'delivery_orders') {
    await DeliveryOrderModel.updateOne(
      { id: reqDoc.documentId },
      { status: 'Planned', updatedAt: now },
    );
  }
}

async function applyChangesRequestedStatusToDocument(reqDoc: any, remarks: string) {
  const now = new Date().toISOString();
  if (reqDoc.module === 'quotations') {
    await QuotationModel.updateOne(
      { id: reqDoc.documentId },
      { status: 'Changes Requested', remarks, updatedAt: now },
    );
  } else if (reqDoc.module === 'supplier_pos') {
    await SupplierPOModel.updateOne(
      { id: reqDoc.documentId },
      { status: 'Changes Requested', remarks, updatedAt: now },
    );
  } else if (reqDoc.module === 'delivery_orders') {
    await DeliveryOrderModel.updateOne(
      { id: reqDoc.documentId },
      { status: 'Planned', updatedAt: now },
    );
  }
}

// GET /api/approvals/inbox
approvalRouter.get('/approvals/inbox', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await ensureDefaultApprovalWorkflows();
    const user = req.user!;
    const isSuperAdmin = user.roleId === 'role-super-admin' || user.department === 'admin';

    const [allWorkflows, allRequests] = await Promise.all([
      ApprovalWorkflowModel.find().lean(),
      ApprovalRequestModel.find().sort({ createdAt: -1 }).lean(),
    ]);

    const workflowMap = new Map<string, ApprovalWorkflow>();
    for (const wf of allWorkflows) {
      workflowMap.set(wf.id, wf as ApprovalWorkflow);
    }

    const pendingForMe: ApprovalRequest[] = [];
    const mySubmissions: ApprovalRequest[] = [];
    const history: ApprovalRequest[] = [];

    for (const reqDoc of allRequests as ApprovalRequest[]) {
      if (reqDoc.submittedBy.id === user.id) {
        mySubmissions.push(reqDoc);
      }

      if (reqDoc.status === 'pending') {
        const wf = workflowMap.get(reqDoc.workflowId);
        const check = canUserDecideRequest(reqDoc, wf, user);
        if (check.canDecide) {
          pendingForMe.push(reqDoc);
        }
      } else {
        const wasDecider = reqDoc.decisions?.some((d) => d.decidedBy.id === user.id);
        if (isSuperAdmin || reqDoc.submittedBy.id === user.id || wasDecider) {
          history.push(reqDoc);
        }
      }
    }

    res.json({
      pending: pendingForMe,
      mySubmissions,
      history,
      all: isSuperAdmin ? allRequests : undefined,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/approvals/requests/:id
approvalRouter.get('/approvals/requests/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const request = await ApprovalRequestModel.findOne({ id: req.params.id }).lean();
    if (!request) throw new Error('NOT_FOUND:Approval request not found.');

    const user = req.user!;
    const isSuperAdmin = user.roleId === 'role-super-admin' || user.department === 'admin';
    const isSubmitter = request.submittedBy.id === user.id;
    const workflow = await ApprovalWorkflowModel.findOne({ id: request.workflowId }).lean();
    const isApprover = workflow?.approvalLevels.some((l) => isUserEligibleForLevel(workflow as ApprovalWorkflow, l.levelNumber, user));
    const wasDecider = request.decisions?.some((d) => d.decidedBy.id === user.id);
    const hasModuleView = checkPermission(user.permissions, request.module, 'view');

    if (!isSuperAdmin && !isSubmitter && !isApprover && !wasDecider && !hasModuleView) {
      res.status(403).json({ error: 'FORBIDDEN: You do not have permission to view this approval request.' });
      return;
    }

    // Commercial data redaction for non-commercial staff (Production / Logistics)
    const canViewCommercial =
      isSuperAdmin ||
      checkPermission(user.permissions, 'sales', 'view') ||
      checkPermission(user.permissions, 'quotations', 'view') ||
      checkPermission(user.permissions, 'supply_chain', 'view') ||
      checkPermission(user.permissions, 'supplier_pos', 'view');
    const isCommercialModule = ['quotations', 'supplier_pos', 'payment_entries', 'proforma_invoices'].includes(request.module);

    if (!canViewCommercial && isCommercialModule && request.documentSnapshot) {
      const snap: any = { ...request.documentSnapshot };
      if (snap.subtotal !== undefined) snap.subtotal = '[REDACTED]';
      if (snap.discountAmount !== undefined) snap.discountAmount = '[REDACTED]';
      if (snap.taxAmount !== undefined) snap.taxAmount = '[REDACTED]';
      if (snap.totalAmount !== undefined) snap.totalAmount = '[REDACTED]';
      if (Array.isArray(snap.items)) {
        snap.items = snap.items.map((it: any) => ({
          ...it,
          unitPrice: '[REDACTED]',
          lineTotal: '[REDACTED]',
        }));
      }
      request.documentSnapshot = snap;
    }

    const check = canUserDecideRequest(request as ApprovalRequest, workflow as ApprovalWorkflow, req.user!);

    res.json({
      request,
      workflow,
      canDecide: check.canDecide,
      decideBlockReason: check.reason,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/approvals/requests/:id/decide
approvalRouter.post('/approvals/requests/:id/decide', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { decision, remarks } = req.body as {
      decision: ApprovalDecisionType;
      remarks?: string;
    };

    if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
      throw new Error("Invalid decision. Must be 'approved', 'rejected', or 'changes_requested'.");
    }

    if ((decision === 'rejected' || decision === 'changes_requested') && !remarks?.trim()) {
      throw new Error(`Remarks are required when selecting '${decision.replace('_', ' ')}'.`);
    }

    const request = await ApprovalRequestModel.findOne({ id: req.params.id });
    if (!request) throw new Error('NOT_FOUND:Approval request not found.');

    if (request.status !== 'pending') {
      throw new Error(`Request is already ${request.status}. No further decisions can be made.`);
    }

    const workflow = await ApprovalWorkflowModel.findOne({ id: request.workflowId }).lean();

    // Check self-approval prevention
    if (workflow && !workflow.allowSelfApproval && request.submittedBy.id === req.user!.id) {
      res.status(403).json({
        error: 'FORBIDDEN: Self-approval is disabled for this workflow. Submitter cannot approve their own submission.',
      });
      return;
    }

    // Check approver authorization
    if (workflow) {
      const isEligible = isUserEligibleForLevel(workflow as ApprovalWorkflow, request.currentLevel, req.user!);
      if (!isEligible) {
        res.status(403).json({
          error: `FORBIDDEN: You are not authorized to decide on Level ${request.currentLevel} of this approval workflow.`,
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const currentLevelConfig = workflow?.approvalLevels.find((l) => l.levelNumber === request.currentLevel);
    const levelName = currentLevelConfig ? currentLevelConfig.levelName : `Level ${request.currentLevel}`;

    const decisionRecord = {
      levelNumber: request.currentLevel,
      levelName,
      decidedBy: {
        id: req.user!.id,
        name: req.user!.name,
        employeeId: req.user!.employeeId,
        roleName: req.user!.roleName,
      },
      decision,
      remarks: remarks?.trim() || '',
      decidedAt: now,
    };

    request.decisions.push(decisionRecord);

    if (decision === 'approved') {
      if (request.currentLevel < request.totalLevels) {
        request.currentLevel += 1;
        // Notify next level approvers
        await mongoERPRepository.addNotification({
          title: `Approval Required: ${request.documentDocNo}`,
          message: `${request.documentDocNo} passed ${levelName}. Now awaiting Level ${request.currentLevel} review.`,
          department: request.department,
          severity: 'info',
          link: '/admin/approvals',
          relatedModule: request.module,
          relatedDocumentId: request.documentId,
        });
      } else {
        // Final Level Approved!
        request.status = 'approved';
        await applyApprovedStatusToDocument(request);

        // Notify submitter
        await mongoERPRepository.addNotification({
          title: `Approved: ${request.documentDocNo}`,
          message: `Your ${request.module} ${request.documentDocNo} has been fully approved by ${req.user!.name}.`,
          department: request.department,
          severity: 'success',
          recipientEmployeeId: request.submittedBy.id,
          link: '/admin/approvals',
          relatedModule: request.module,
          relatedDocumentId: request.documentId,
        });
      }
    } else if (decision === 'rejected') {
      request.status = 'rejected';
      await applyRejectedStatusToDocument(request, remarks?.trim() || 'Rejected');

      // Notify submitter
      await mongoERPRepository.addNotification({
        title: `Rejected: ${request.documentDocNo}`,
        message: `Your ${request.module} ${request.documentDocNo} was rejected by ${req.user!.name}. Reason: ${remarks?.trim()}`,
        department: request.department,
        severity: 'error',
        recipientEmployeeId: request.submittedBy.id,
        link: '/admin/approvals',
        relatedModule: request.module,
        relatedDocumentId: request.documentId,
      });
    } else if (decision === 'changes_requested') {
      request.status = 'changes_requested';
      await applyChangesRequestedStatusToDocument(request, remarks?.trim() || 'Changes Requested');

      // Notify submitter
      await mongoERPRepository.addNotification({
        title: `Changes Requested: ${request.documentDocNo}`,
        message: `Changes requested on ${request.documentDocNo} by ${req.user!.name}: ${remarks?.trim()}`,
        department: request.department,
        severity: 'warning',
        recipientEmployeeId: request.submittedBy.id,
        link: '/admin/approvals',
        relatedModule: request.module,
        relatedDocumentId: request.documentId,
      });
    }

    await saveDecision(request);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: request.department,
      action: `Approval Decision: ${decision}`,
      entityType: 'ApprovalRequest',
      entityId: request.id,
      entityDocNo: request.documentDocNo,
      details: `${decision.toUpperCase()} on ${levelName} for ${request.documentDocNo}.${remarks ? ` Remarks: ${remarks}` : ''}`,
    });

    res.json({ ok: true, request: request.toObject() });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/approvals/requests/:id/withdraw
approvalRouter.post('/approvals/requests/:id/withdraw', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const request = await ApprovalRequestModel.findOne({ id: req.params.id });
    if (!request) throw new Error('NOT_FOUND:Approval request not found.');

    if (request.status !== 'pending') {
      throw new Error(`Only pending requests can be withdrawn (Current status: ${request.status}).`);
    }

    const isSubmitter = request.submittedBy.id === req.user!.id;
    const isSuperAdmin = req.user!.roleId === 'role-super-admin';
    if (!isSubmitter && !isSuperAdmin) {
      throw new Error('FORBIDDEN: Only the submitter or Super Admin can withdraw this approval request.');
    }

    request.status = 'withdrawn';
    await saveDecision(request);

    // Revert target document to Draft
    if (request.module === 'quotations') {
      await QuotationModel.updateOne({ id: request.documentId }, { status: 'Draft', updatedAt: new Date().toISOString() });
    } else if (request.module === 'supplier_pos') {
      await SupplierPOModel.updateOne({ id: request.documentId }, { status: 'Draft', updatedAt: new Date().toISOString() });
    } else if (request.module === 'delivery_orders') {
      await DeliveryOrderModel.updateOne({ id: request.documentId }, { status: 'Planned', updatedAt: new Date().toISOString() });
    }

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: request.department,
      action: 'Withdrew Approval Request',
      entityType: 'ApprovalRequest',
      entityId: request.id,
      entityDocNo: request.documentDocNo,
      details: `Withdrew approval request for ${request.documentDocNo}. Returned to Draft status.`,
    });

    res.json({ ok: true, request: request.toObject() });
  } catch (err) {
    sendError(res, err);
  }
});
