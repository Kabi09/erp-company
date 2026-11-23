import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUser, PermissionAction, PermissionModule } from '../../src/types/erp';
import { env } from '../config/environment';
import { EmployeeModel, RoleModel } from '../models';
import { checkPermission, resolveEffectivePermissions } from '../utils/rbacLogic';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function signAccessToken(employeeId: string): string {
  return jwt.sign({ sub: employeeId, type: 'access' }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as any,
  });
}

export function signRefreshToken(employeeId: string, sessionId: string): string {
  return jwt.sign({ sub: employeeId, sid: sessionId, type: 'refresh' }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn as any,
  });
}

// Backward compatibility alias
export function signToken(employeeId: string): string {
  return signAccessToken(employeeId);
}

export async function resolveAuthUser(employeeDbId: string): Promise<AuthUser | null> {
  const emp = await EmployeeModel.findOne({ id: employeeDbId }).lean();
  if (!emp || emp.status !== 'Active') return null;
  const role = await RoleModel.findOne({ id: emp.roleId }).lean();
  if (!role) return null;

  const effectivePermissions = resolveEffectivePermissions(role.permissions, emp.permissionOverrides);

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
    permissions: effectivePermissions as any,
    effectivePermissions,
    permissionOverrides: emp.permissionOverrides,
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  let token = '';
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (typeof req.query?.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as { sub: string; type?: string };
    if (decoded.type && decoded.type !== 'access') {
      res.status(401).json({ error: 'Invalid token type for API access.' });
      return;
    }
    const user = await resolveAuthUser(decoded.sub);
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
    const isAllowed = checkPermission(user.permissions, module, action);
    if (!isAllowed) {
      res.status(403).json({
        error: `Access denied: missing '${action}' permission for ${module.replace('_', ' ')} module.`,
      });
      return;
    }
    next();
  };
}

// --- SECURITY MIDDLEWARE ---

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (env.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const rawOrigin = req.headers.origin;
  const reqOrigin = rawOrigin ? rawOrigin.replace(/\/+$/, '') : '';
  const allowed = env.corsOrigin
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin || '*');
  } else if (reqOrigin && allowed.includes(reqOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
  } else if (allowed.length > 0) {
    res.setHeader('Access-Control-Allow-Origin', allowed[0]);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

function hasInvalidKey(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (hasInvalidKey(obj[key])) return true;
    }
  }
  return false;
}

export function noSqlSanitizer(req: Request, res: Response, next: NextFunction): void {
  if (hasInvalidKey(req.body) || hasInvalidKey(req.query) || hasInvalidKey(req.params)) {
    res.status(400).json({ error: 'Malformed request: property names cannot start with $ or contain .' });
    return;
  }
  next();
}

// In-memory sliding rate limiter for authentication endpoints
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const authAttempts = new Map<string, RateLimitEntry>();

export function authRateLimiter(windowMs: number = 15 * 60 * 1000, maxAttempts: number = 10) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const identifier = (req.body?.identifier || '').trim().toLowerCase();
    const key = `${ip}:${identifier || 'general'}`;
    const now = Date.now();

    const entry = authAttempts.get(key);
    if (entry) {
      if (now > entry.resetAt) {
        authAttempts.delete(key);
      } else if (entry.count >= maxAttempts) {
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        res.set('Retry-After', String(retryAfterSeconds));
        res.status(429).json({
          error: `Too many login attempts. Account temporarily locked for security. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
        });
        return;
      }
    }
    next();
  };
}

export function recordAuthFailure(req: Request, windowMs: number = 15 * 60 * 1000): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const identifier = (req.body?.identifier || '').trim().toLowerCase();
  const key = `${ip}:${identifier || 'general'}`;
  const now = Date.now();

  const entry = authAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
  }
}

export function resetAuthFailure(req: Request): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const identifier = (req.body?.identifier || '').trim().toLowerCase();
  const key = `${ip}:${identifier || 'general'}`;
  authAttempts.delete(key);
}
