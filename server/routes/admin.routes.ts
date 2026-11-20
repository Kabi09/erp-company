import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { env } from '../config/environment';
import { CompanySettingsModel, EmployeeModel, RoleModel } from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { generateId, sendError } from '../utils/routeUtils';

export const adminRouter = Router();

adminRouter.post('/admin/employees', requireAuth, requirePerm('admin', 'create'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.name?.trim() || !body.email?.trim() || !body.employeeId?.trim()) {
      throw new Error('Employee name, Employee ID, and Email are required.');
    }
    const cleanEmail = body.email.trim().toLowerCase();
    const cleanEmpId = body.employeeId.trim().toUpperCase();

    const existing = await EmployeeModel.findOne({
      $or: [{ email: cleanEmail }, { employeeId: cleanEmpId }],
    }).lean();
    if (existing) {
      throw new Error('An employee with this Email or Employee ID already exists.');
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
      passwordHash: bcrypt.hashSync(body.password?.trim() || 'cryo123', 8),
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
      details: `Added employee ${emp.name} (${emp.department}).`,
    });

    const { passwordHash: _ph, ...safe } = emp;
    res.status(201).json(safe);
  } catch (err) {
    sendError(res, err);
  }
});

adminRouter.put('/admin/employees/:id', requireAuth, requirePerm('admin', 'edit'), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    const emp = await EmployeeModel.findOne({ id: req.params.id });
    if (!emp) throw new Error('NOT_FOUND:Employee not found.');
    if (emp.id === req.user!.id && body.status === 'Inactive') {
      throw new Error('You cannot deactivate your own Super Admin account.');
    }

    if (body.name?.trim()) emp.name = body.name.trim();
    if (body.phone !== undefined) emp.phone = body.phone.trim();
    if (body.department) emp.department = body.department;
    if (body.roleId) emp.roleId = body.roleId;
    if (body.designation?.trim()) emp.designation = body.designation.trim();
    if (body.status) emp.status = body.status === 'Inactive' ? 'Inactive' : 'Active';
    if (body.password?.trim() && body.password.trim().length >= 6) {
      emp.passwordHash = bcrypt.hashSync(body.password.trim(), 8);
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
      details: `Updated employee profile for ${emp.name}.`,
    });

    const obj = emp.toObject() as any;
    delete obj.passwordHash;
    res.json(obj);
  } catch (err) {
    sendError(res, err);
  }
});

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
