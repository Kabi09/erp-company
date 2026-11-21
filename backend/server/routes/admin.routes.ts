import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { env } from '../config/environment';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  ActivityLogModel,
  ApprovalRequestModel,
  ApprovalWorkflowModel,
  CompanySettingsModel,
  DeliveryOrderModel,
  EmployeeModel,
  EnquiryModel,
  MaterialModel,
  MaterialRequestModel,
  ProductionOrderModel,
  RoleModel,
  SalesOrderModel,
  SessionModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { resolveEffectivePermissions } from '../utils/rbacLogic';
import { generateId, sendError } from '../utils/routeUtils';
import { ensureDefaultApprovalWorkflows } from './approval.routes';

export const adminRouter = Router();

// GET /api/admin/summary - Super Admin high-level overview across all 4 departments
adminRouter.get('/admin/summary', requireAuth, requirePerm('admin', 'view'), async (_req, res) => {
  try {
    const [
      activeEmployees,
      totalEmployees,
      pendingEnquiries,
      confirmedSalesOrders,
      activeProductionOrders,
      pendingMaterialRequests,
      qcPending,
      readyForDispatch,
      pendingDeliveries,
      recentActivities,
      materials,
    ] = await Promise.all([
      EmployeeModel.countDocuments({ status: 'Active' }),
      EmployeeModel.countDocuments(),
      EnquiryModel.countDocuments({ status: { $in: ['New', 'Under Review'] } as any }),
      SalesOrderModel.countDocuments(),
      ProductionOrderModel.countDocuments({ status: { $in: ['Planned', 'Ready to Start', 'In Progress'] } as any }),
      MaterialRequestModel.countDocuments({ status: { $in: ['Pending', 'Partially Issued'] } as any }),
      ProductionOrderModel.countDocuments({ status: 'QC Pending' as any }),
      ProductionOrderModel.countDocuments({ status: 'Completed' as any }),
      DeliveryOrderModel.countDocuments({ status: { $in: ['Planned', 'In Transit'] } as any }),
      ActivityLogModel.find().sort({ timestamp: -1 }).limit(10).lean(),
      MaterialModel.find().lean(),
    ]);

    const lowStockMaterials = materials.filter((m) => (m.currentStock || 0) <= m.minStock).length;

    res.json({
      activeEmployees,
      totalEmployees,
      pendingEnquiries,
      confirmedSalesOrders,
      activeProductionOrders,
      pendingMaterialRequests,
      lowStockMaterials,
      qcPending,
      readyForDispatch,
      pendingDeliveries,
      recentActivities,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/employees
adminRouter.post('/admin/employees', requireAuth, requirePerm('admin', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim() || !body.email?.trim()) {
      throw new Error('Employee name and Email are required.');
    }
    const cleanEmail = body.email.trim().toLowerCase();

    // Auto-generate employeeId if omitted
    let cleanEmpId = body.employeeId?.trim().toUpperCase();
    if (!cleanEmpId) {
      cleanEmpId = await mongoERPRepository.getNextDocNo('EMP');
    }

    const existing = await EmployeeModel.findOne({
      $or: [{ email: cleanEmail }, { employeeId: cleanEmpId }],
    }).lean();
    if (existing) {
      throw new Error('An employee with this Email or Employee ID already exists.');
    }

    const initialPassword = body.password?.trim() || 'CryoERP@2026';
    if (initialPassword.length < 8) {
      throw new Error('Initial password must be at least 8 characters long.');
    }

    const emp = {
      id: generateId('emp'),
      employeeId: cleanEmpId,
      name: body.name.trim(),
      email: cleanEmail,
      phone: body.phone?.trim() || '',
      department: body.department || 'sales',
      roleId: body.roleId || 'role-sales-exec',
      designation: body.designation?.trim() || 'Executive',
      status: (body.status === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
      passwordHash: bcrypt.hashSync(initialPassword, 10),
      createdAt: new Date().toISOString(),
    };

    await EmployeeModel.create(emp);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Created Employee',
      entityType: 'Employee',
      entityId: emp.id,
      entityDocNo: emp.employeeId,
      details: `Added employee ${emp.name} (${emp.department}, ${emp.roleId}).`,
    });

    const { passwordHash: _ph, ...safe } = emp;
    res.status(201).json(safe);
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/admin/employees/:id
adminRouter.put('/admin/employees/:id', requireAuth, requirePerm('admin', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const emp = await EmployeeModel.findOne({ id: req.params.id });
    if (!emp) throw new Error('NOT_FOUND:Employee not found.');

    // Safeguard: Prevent self-privilege escalation
    if (emp.id === req.user!.id) {
      if (body.roleId && body.roleId !== req.user!.roleId) {
        throw new Error('FORBIDDEN: You cannot modify your own role or elevate your permissions.');
      }
      if (body.department && body.department !== req.user!.department) {
        throw new Error('FORBIDDEN: You cannot modify your own department.');
      }
      if (body.status === 'Inactive') {
        throw new Error('FORBIDDEN: You cannot deactivate your own account.');
      }
    }

    // Safeguard: Prevent deactivating or demoting the last active Super Admin
    if (
      emp.roleId === 'role-super-admin' &&
      (body.status === 'Inactive' || (body.roleId && body.roleId !== 'role-super-admin'))
    ) {
      const activeSuperAdmins = await EmployeeModel.countDocuments({
        roleId: 'role-super-admin',
        status: 'Active',
      });
      if (activeSuperAdmins <= 1) {
        throw new Error('FORBIDDEN: Cannot deactivate or demote the last active Super Admin in the system.');
      }
    }

    if (body.name?.trim()) emp.name = body.name.trim();
    if (body.phone !== undefined) emp.phone = body.phone.trim();
    if (body.department) emp.department = body.department;
    if (body.roleId) emp.roleId = body.roleId;
    if (body.designation?.trim()) emp.designation = body.designation.trim();

    if (body.status) {
      emp.status = body.status === 'Inactive' ? 'Inactive' : 'Active';
      // If deactivating, revoke all active sessions immediately
      if (emp.status === 'Inactive') {
        await SessionModel.updateMany({ employeeId: emp.id, revoked: false }, { revoked: true });
      }
    }

    if (body.password?.trim()) {
      if (body.password.trim().length < 8) {
        throw new Error('Password must be at least 8 characters long.');
      }
      emp.passwordHash = bcrypt.hashSync(body.password.trim(), 10);
      // Invalidate all active sessions on password change
      await SessionModel.updateMany({ employeeId: emp.id, revoked: false }, { revoked: true });
    }

    await emp.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Updated Employee',
      entityType: 'Employee',
      entityId: emp.id,
      entityDocNo: emp.employeeId,
      details: `Updated employee profile for ${emp.name} (Status: ${emp.status}, Role: ${emp.roleId}).`,
    });

    const obj = emp.toObject() as any;
    delete obj.passwordHash;
    res.json(obj);
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/admin/employees/:id
adminRouter.delete('/admin/employees/:id', requireAuth, requirePerm('admin', 'delete'), async (req: AuthenticatedRequest, res) => {
  try {
    const emp = await EmployeeModel.findOne({ id: req.params.id });
    if (!emp) throw new Error('NOT_FOUND:Employee not found.');

    // Safeguard: Cannot delete self
    if (emp.id === req.user!.id) {
      throw new Error('FORBIDDEN: You cannot delete your own account.');
    }

    // Safeguard: Cannot delete the last active Super Admin
    if (emp.roleId === 'role-super-admin') {
      const activeSuperAdmins = await EmployeeModel.countDocuments({
        roleId: 'role-super-admin',
        status: 'Active',
      });
      if (activeSuperAdmins <= 1) {
        throw new Error('FORBIDDEN: Cannot delete the last active Super Admin in the system.');
      }
    }

    // Soft deactivation policy: block hard delete if employee has historical business records
    const activityCount = await ActivityLogModel.countDocuments({ actorId: emp.id });
    if (activityCount > 0) {
      throw new Error(
        'CONFLICT: Cannot hard-delete employee with existing historical activity records. Please set their status to Inactive instead.',
      );
    }

    await EmployeeModel.deleteOne({ id: emp.id });
    await SessionModel.deleteMany({ employeeId: emp.id });

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Deleted Employee',
      entityType: 'Employee',
      entityId: emp.id,
      entityDocNo: emp.employeeId,
      details: `Permanently removed employee record ${emp.name} (${emp.employeeId}).`,
    });

    res.json({ ok: true, message: `Employee ${emp.name} deleted successfully.` });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/admin/audit-logs
adminRouter.get('/admin/audit-logs', requireAuth, requirePerm('admin', 'view'), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (req.query.department && req.query.department !== 'all') {
      filter.department = req.query.department;
    }
    if (req.query.actorId) {
      filter.actorId = req.query.actorId;
    }
    if (req.query.action) {
      filter.action = req.query.action;
    }
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const s = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ details: s }, { entityDocNo: s }, { actorName: s }, { action: s }];
    }

    const [items, total] = await Promise.all([
      ActivityLogModel.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      ActivityLogModel.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/admin/roles/:id
adminRouter.put('/admin/roles/:id', requireAuth, requirePerm('admin', 'manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const role = await RoleModel.findOne({ id: req.params.id });
    if (!role) throw new Error('NOT_FOUND:Role not found.');
    if (req.body.description !== undefined) role.description = req.body.description;
    if (req.body.permissions) role.permissions = req.body.permissions;

    await role.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Updated Role Permissions',
      entityType: 'Role',
      entityId: role.id,
      entityDocNo: role.name,
      details: `Updated permissions matrix for ${role.name}.`,
    });

    res.json(role.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/admin/company
adminRouter.put('/admin/company', requireAuth, requirePerm('admin', 'manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const updated = await CompanySettingsModel.findOneAndUpdate(
      { id: 'company' },
      { ...req.body, id: 'company' },
      { upsert: true, returnDocument: 'after' },
    ).lean();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Updated Company Profile',
      entityType: 'CompanySettings',
      entityId: 'company',
      entityDocNo: (updated as any)?.companyName || 'Company Profile',
      details: 'Updated organization profile, bank details, and commercial defaults.',
    });

    res.json(updated);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/reset-demo
adminRouter.post('/admin/reset-demo', requireAuth, requirePerm('admin', 'manage'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!env.allowDemoReset) {
      throw new Error('FORBIDDEN:Demo data reset is disabled in production environment.');
    }
    const { mode } = req.body as { mode?: 'seed' | 'clean' };
    res.json({ ok: true, mode: mode || 'seed' });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/admin/roles
adminRouter.get('/admin/roles', requireAuth, requirePerm('admin', 'view'), async (_req, res) => {
  try {
    const roles = await RoleModel.find().lean();
    res.json(roles);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/roles
adminRouter.post('/admin/roles', requireAuth, requirePerm('admin', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { name, department, description, permissions } = req.body;
    if (!name?.trim()) throw new Error('Role name is required.');
    const existing = await RoleModel.findOne({ name: name.trim() });
    if (existing) throw new Error(`A role with name "${name.trim()}" already exists.`);

    const role = {
      id: generateId('role'),
      name: name.trim(),
      department: department || 'sales',
      description: description?.trim() || '',
      permissions: permissions || {},
    };

    await RoleModel.create(role);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Created Role',
      entityType: 'Role',
      entityId: role.id,
      entityDocNo: role.name,
      details: `Created new role ${role.name} for department ${role.department}.`,
    });

    res.status(201).json(role);
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/admin/roles/:id
adminRouter.delete('/admin/roles/:id', requireAuth, requirePerm('admin', 'delete'), async (req: AuthenticatedRequest, res) => {
  try {
    const roleId = req.params.id as string;
    const coreRoles = [
      'role-super-admin',
      'role-sales-manager',
      'role-sales-exec',
      'role-scm-manager',
      'role-stores-exec',
      'role-production-manager',
      'role-prod-planner',
      'role-qc-inspector',
      'role-logistics-manager',
      'role-dispatch-exec',
      'role-service-manager',
      'role-service-coord',
      'role-service-tech',
      'role-rd-manager',
      'role-rd-engineer',
      'role-rd-tester',
    ];
    if (coreRoles.includes(roleId)) {
      throw new Error('FORBIDDEN: Built-in core system roles cannot be deleted.');
    }

    const assignedCount = await EmployeeModel.countDocuments({ roleId });
    if (assignedCount > 0) {
      throw new Error(`CONFLICT: Cannot delete role assigned to ${assignedCount} active employee(s). Reassign them first.`);
    }

    const role = await RoleModel.findOneAndDelete({ id: roleId });
    if (!role) throw new Error('NOT_FOUND:Role not found.');

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Deleted Role',
      entityType: 'Role',
      entityId: role.id,
      entityDocNo: role.name,
      details: `Deleted custom role ${role.name}.`,
    });

    res.json({ ok: true, deletedRoleId: role.id });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/admin/employees/:id/permissions
adminRouter.get('/admin/employees/:id/permissions', requireAuth, requirePerm('admin', 'view'), async (req: AuthenticatedRequest, res) => {
  try {
    const emp = await EmployeeModel.findOne({ id: req.params.id }).lean();
    if (!emp) throw new Error('NOT_FOUND:Employee not found.');

    const role = await RoleModel.findOne({ id: emp.roleId }).lean();
    if (!role) throw new Error('NOT_FOUND:Role not found.');

    const effectivePermissions = resolveEffectivePermissions(role.permissions, emp.permissionOverrides);

    res.json({
      employeeId: emp.id,
      employeeDocNo: emp.employeeId,
      name: emp.name,
      department: emp.department,
      role,
      overrides: emp.permissionOverrides || {},
      effectivePermissions,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/admin/employees/:id/permissions
adminRouter.put('/admin/employees/:id/permissions', requireAuth, requirePerm('admin', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const emp = await EmployeeModel.findOne({ id: req.params.id });
    if (!emp) throw new Error('NOT_FOUND:Employee not found.');

    // Self-escalation check: non-super-admin user cannot edit their own permissions
    if (emp.id === req.user!.id && req.user!.roleId !== 'role-super-admin') {
      throw new Error('FORBIDDEN: You cannot modify your own permission overrides.');
    }

    const { overrides } = req.body;
    emp.permissionOverrides = overrides || {};
    await emp.save();

    const role = await RoleModel.findOne({ id: emp.roleId }).lean();
    const effectivePermissions = resolveEffectivePermissions(role?.permissions || {}, emp.permissionOverrides);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Updated Employee Overrides',
      entityType: 'Employee',
      entityId: emp.id,
      entityDocNo: emp.employeeId,
      details: `Updated permission overrides for employee ${emp.name} (${emp.employeeId}).`,
    });

    res.json({
      ok: true,
      employeeId: emp.id,
      overrides: emp.permissionOverrides,
      effectivePermissions,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/employees/:id/permissions/reset
adminRouter.post('/admin/employees/:id/permissions/reset', requireAuth, requirePerm('admin', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const emp = await EmployeeModel.findOne({ id: req.params.id });
    if (!emp) throw new Error('NOT_FOUND:Employee not found.');

    if (emp.id === req.user!.id && req.user!.roleId !== 'role-super-admin') {
      throw new Error('FORBIDDEN: You cannot reset your own permission overrides.');
    }

    emp.permissionOverrides = {};
    await emp.save();

    const role = await RoleModel.findOne({ id: emp.roleId }).lean();
    const effectivePermissions = resolveEffectivePermissions(role?.permissions || {}, {});

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Reset Employee Overrides',
      entityType: 'Employee',
      entityId: emp.id,
      entityDocNo: emp.employeeId,
      details: `Reset permission overrides to role defaults for ${emp.name} (${emp.employeeId}).`,
    });

    res.json({
      ok: true,
      employeeId: emp.id,
      overrides: {},
      effectivePermissions,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/admin/approval-workflows
adminRouter.get('/admin/approval-workflows', requireAuth, requirePerm('admin', 'view'), async (_req, res) => {
  try {
    const workflows = await ensureDefaultApprovalWorkflows();
    res.json(workflows);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/admin/approval-workflows
adminRouter.post('/admin/approval-workflows', requireAuth, requirePerm('admin', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { name, department, module, triggerAction, description, enabled, allowSelfApproval, approvalLevels } = req.body;
    if (!name?.trim() || !module?.trim()) {
      throw new Error('Workflow name and target module are required.');
    }
    if (!Array.isArray(approvalLevels) || approvalLevels.length === 0) {
      throw new Error('At least one approval level is required.');
    }

    const wf = {
      id: generateId('wf'),
      name: name.trim(),
      department: department || 'sales',
      module: module.trim(),
      triggerAction: triggerAction?.trim() || 'submit',
      description: description?.trim() || '',
      enabled: enabled !== undefined ? Boolean(enabled) : true,
      allowSelfApproval: Boolean(allowSelfApproval),
      approvalLevels: approvalLevels.map((lvl: any, idx: number) => ({
        levelNumber: lvl.levelNumber || idx + 1,
        levelName: lvl.levelName?.trim() || `Level ${idx + 1}`,
        approverType: lvl.approverType || 'role',
        eligibleRoleIds: Array.isArray(lvl.eligibleRoleIds) ? lvl.eligibleRoleIds : [],
        eligibleEmployeeIds: Array.isArray(lvl.eligibleEmployeeIds) ? lvl.eligibleEmployeeIds : [],
        requiredApprovalCount: Number(lvl.requiredApprovalCount) || 1,
      })),
    };

    await ApprovalWorkflowModel.create(wf);

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Created Approval Workflow',
      entityType: 'ApprovalWorkflow',
      entityId: wf.id,
      entityDocNo: wf.name,
      details: `Created approval policy ${wf.name} with ${wf.approvalLevels.length} level(s).`,
    });

    res.status(201).json(wf);
  } catch (err) {
    sendError(res, err);
  }
});

// PUT /api/admin/approval-workflows/:id
adminRouter.put('/admin/approval-workflows/:id', requireAuth, requirePerm('admin', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const wf = await ApprovalWorkflowModel.findOne({ id: req.params.id });
    if (!wf) throw new Error('NOT_FOUND:Approval workflow not found.');

    const body = req.body;
    if (body.name?.trim()) wf.name = body.name.trim();
    if (body.description !== undefined) wf.description = body.description.trim();
    if (body.enabled !== undefined) wf.enabled = Boolean(body.enabled);
    if (body.allowSelfApproval !== undefined) wf.allowSelfApproval = Boolean(body.allowSelfApproval);
    if (Array.isArray(body.approvalLevels) && body.approvalLevels.length > 0) {
      wf.approvalLevels = body.approvalLevels.map((lvl: any, idx: number) => ({
        levelNumber: lvl.levelNumber || idx + 1,
        levelName: lvl.levelName?.trim() || `Level ${idx + 1}`,
        approverType: lvl.approverType || 'role',
        eligibleRoleIds: Array.isArray(lvl.eligibleRoleIds) ? lvl.eligibleRoleIds : [],
        eligibleEmployeeIds: Array.isArray(lvl.eligibleEmployeeIds) ? lvl.eligibleEmployeeIds : [],
        requiredApprovalCount: Number(lvl.requiredApprovalCount) || 1,
      }));
    }

    await wf.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Updated Approval Workflow',
      entityType: 'ApprovalWorkflow',
      entityId: wf.id,
      entityDocNo: wf.name,
      details: `Updated approval policy ${wf.name} (Enabled: ${wf.enabled}, Self-approval: ${wf.allowSelfApproval}).`,
    });

    res.json(wf.toObject());
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/admin/approval-workflows/:id/toggle
adminRouter.patch('/admin/approval-workflows/:id/toggle', requireAuth, requirePerm('admin', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const wf = await ApprovalWorkflowModel.findOne({ id: req.params.id });
    if (!wf) throw new Error('NOT_FOUND:Approval workflow not found.');

    wf.enabled = !wf.enabled;
    await wf.save();

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Toggled Approval Workflow',
      entityType: 'ApprovalWorkflow',
      entityId: wf.id,
      entityDocNo: wf.name,
      details: `${wf.enabled ? 'Enabled' : 'Disabled'} approval workflow ${wf.name}.`,
    });

    res.json({ ok: true, id: wf.id, enabled: wf.enabled });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/admin/approval-workflows/:id
adminRouter.delete('/admin/approval-workflows/:id', requireAuth, requirePerm('admin', 'delete'), async (req: AuthenticatedRequest, res) => {
  try {
    const pendingCount = await ApprovalRequestModel.countDocuments({
      workflowId: req.params.id,
      status: 'pending',
    });
    if (pendingCount > 0) {
      throw new Error(`CONFLICT: Cannot delete workflow with ${pendingCount} active pending approval request(s).`);
    }

    const deleted = await ApprovalWorkflowModel.findOneAndDelete({ id: req.params.id });
    if (!deleted) throw new Error('NOT_FOUND:Approval workflow not found.');

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: 'admin',
      action: 'Deleted Approval Workflow',
      entityType: 'ApprovalWorkflow',
      entityId: deleted.id,
      entityDocNo: deleted.name,
      details: `Deleted approval workflow policy ${deleted.name}.`,
    });

    res.json({ ok: true, deletedId: deleted.id });
  } catch (err) {
    sendError(res, err);
  }
});
