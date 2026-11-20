import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { EmployeeModel, NotificationModel } from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { requireAuth, resolveAuthUser, signToken, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { sendError } from '../utils/routeUtils';

export const authRouter = Router();

authRouter.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body as { identifier?: string; password?: string };
    if (!identifier || !password) {
      res.status(400).json({ error: 'Email / Employee ID and password are required.' });
      return;
    }
    const cleanId = identifier.trim().toLowerCase();
    const emp = await EmployeeModel.findOne({
      $or: [{ email: cleanId }, { employeeId: new RegExp(`^${cleanId}$`, 'i') }],
    }).lean();
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
    const user = await resolveAuthUser(emp.id);
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

authRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

authRouter.patch('/auth/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, phone, newPassword } = req.body as { name?: string; phone?: string; newPassword?: string };
    if (newPassword && newPassword.trim().length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }
    const updates: Record<string, any> = {};
    if (name && name.trim()) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (newPassword && newPassword.trim().length >= 6) {
      updates.passwordHash = bcrypt.hashSync(newPassword.trim(), 8);
    }
    const emp = await EmployeeModel.findOneAndUpdate({ id: req.user!.id }, updates, { returnDocument: 'after' });
    if (!emp) throw new Error('NOT_FOUND:Employee record not found.');
    const user = await resolveAuthUser(emp.id);
    res.json({ user });
  } catch (err) {
    sendError(res, err);
  }
});

authRouter.get('/erp/bootstrap', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const [state, stockMap] = await Promise.all([
      mongoERPRepository.getState(),
      mongoERPRepository.computeStockMap(),
    ]);
    const sanitizedEmployees = state.employees.map(({ passwordHash: _ph, ...rest }) => rest);
    res.json({
      ...state,
      employees: sanitizedEmployees,
      stockMap,
      currentUser: req.user,
    });
  } catch (err) {
    sendError(res, err, 500);
  }
});

authRouter.post('/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await NotificationModel.updateOne(
      { id: req.params.id },
      { $addToSet: { readBy: req.user!.id } },
    );
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

authRouter.post('/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await NotificationModel.updateMany(
      {},
      { $addToSet: { readBy: req.user!.id } },
    );
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});
