import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { computeMaterialStockMap } from '../../src/utils/erpLogic';
import { requireAuth, resolveAuthUser, signToken, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { dbStore } from '../db';
import { sendError } from '../utils/routeUtils';

export const authRouter = Router();

authRouter.post('/auth/login', (req, res) => {
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

authRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

authRouter.patch('/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { name, phone, newPassword } = req.body as { name?: string; phone?: string; newPassword?: string };
    if (newPassword && newPassword.trim().length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }
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

authRouter.get('/erp/bootstrap', requireAuth, (req: AuthenticatedRequest, res) => {
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

authRouter.post('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    dbStore.mutate((draft) => {
      const notif = draft.notifications.find((n) => n.id === req.params.id);
      if (notif && !notif.readBy.includes(req.user!.id)) {
        notif.readBy.push(req.user!.id);
      }
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

authRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
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
