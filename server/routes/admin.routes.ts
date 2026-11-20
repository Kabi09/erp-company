import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { requireAuth, requirePerm, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { addActivity, dbStore, generateId } from '../db';
import { sendError } from '../utils/routeUtils';

export const adminRouter = Router();

adminRouter.post('/admin/employees', requireAuth, requirePerm('admin', 'create'), (req: AuthenticatedRequest, res) => {
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

adminRouter.put('/admin/employees/:id', requireAuth, requirePerm('admin', 'edit'), (req: AuthenticatedRequest, res) => {
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

adminRouter.put('/admin/roles/:id', requireAuth, requirePerm('admin', 'manage'), (req: AuthenticatedRequest, res) => {
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

adminRouter.put('/admin/company', requireAuth, requirePerm('admin', 'manage'), (req: AuthenticatedRequest, res) => {
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

adminRouter.post('/admin/reset-demo', requireAuth, requirePerm('admin', 'manage'), (req: AuthenticatedRequest, res) => {
  try {
    const { mode } = req.body as { mode?: 'seed' | 'clean' };
    dbStore.resetDemoData(mode === 'clean');
    res.json({ ok: true, mode: mode || 'seed' });
  } catch (err) {
    sendError(res, err);
  }
});
