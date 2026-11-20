import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { env } from '../config/environment';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { ActivityLogModel, CompanySettingsModel, EmployeeModel, RoleModel, SessionModel } from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { generateId, sendError } from '../utils/routeUtils';

export const adminRouter = Router();

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
