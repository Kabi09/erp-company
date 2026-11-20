import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUser, PermissionAction, PermissionModule } from '../../src/types/erp';
import { env } from '../config/environment';
import { dbStore } from '../db';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function signToken(employeeId: string): string {
  return jwt.sign({ sub: employeeId }, env.jwtSecret, { expiresIn: env.tokenTtl as any });
}

export function resolveAuthUser(employeeDbId: string): AuthUser | null {
  const state = dbStore.getState();
  const emp = state.employees.find((e) => e.id === employeeDbId);
  if (!emp || emp.status !== 'Active') return null;
  const role = state.roles.find((r) => r.id === emp.roleId);
  if (!role) return null;
  return {
    id: emp.id,
    employeeId: emp.employeeId,
    name: emp.name,
    email: emp.email,
    phone: emp.phone,
    department: emp.department,
    roleId: role.id,
    roleName: role.name,
    designation: emp.designation,
    permissions: role.permissions,
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as { sub: string };
    const user = resolveAuthUser(decoded.sub);
    if (!user) {
      res.status(401).json({ error: 'Session expired or account deactivated.' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function requirePerm(module: PermissionModule, action: PermissionAction) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const allowed = user.permissions[module] || [];
    if (!allowed.includes(action) && !allowed.includes('manage')) {
      res.status(403).json({
        error: `Access denied: missing '${action}' permission for ${module.replace('_', ' ')} module.`,
      });
      return;
    }
    next();
  };
}
