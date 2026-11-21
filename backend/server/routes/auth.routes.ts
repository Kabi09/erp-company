import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import {
  AuthenticatedRequest,
  authRateLimiter,
  recordAuthFailure,
  requireAuth,
  resetAuthFailure,
  resolveAuthUser,
  signAccessToken,
  signRefreshToken,
} from '../middleware/auth.middleware';
import { checkPermission } from '../utils/rbacLogic';
import {
  ActivityLogModel,
  ApprovalRequestModel,
  ApprovalWorkflowModel,
  BOMModel,
  CompanySettingsModel,
  CustomerModel,
  CustomerPOModel,
  DailyProductionUpdateModel,
  DeliveryIssueModel,
  DeliveryOrderModel,
  EmployeeModel,
  EnquiryModel,
  FollowUpModel,
  GRNModel,
  MaterialIssueModel,
  MaterialModel,
  MaterialRequestModel,
  NotificationModel,
  PaymentEntryModel,
  ProductModel,
  ProductionOrderModel,
  ProductionReturnModel,
  ProformaInvoiceModel,
  QualityCheckModel,
  QuotationModel,
  ReworkOrderModel,
  RoleModel,
  SalesOrderModel,
  SessionModel,
  StockTransactionModel,
  SupplierModel,
  SupplierPOModel,
  SupplierReturnModel,
} from '../models';
import { mongoERPRepository } from '../repositories/MongoERPRepository';
import { generateId, sendError } from '../utils/routeUtils';
import jwt from 'jsonwebtoken';
import { env } from '../config/environment';

export const authRouter = Router();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/login
authRouter.post('/auth/login', authRateLimiter(), async (req, res) => {
  try {
    const { identifier, password } = req.body as { identifier?: string; password?: string };
    if (!identifier?.trim() || !password) {
      res.status(400).json({ error: 'Email / Employee ID and password are required.' });
      return;
    }

    const cleanId = identifier.trim().toLowerCase();
    const emp = await EmployeeModel.findOne({
      $or: [{ email: cleanId }, { employeeId: new RegExp(`^${cleanId}$`, 'i') }],
    }).lean();

    if (!emp) {
      recordAuthFailure(req);
      await mongoERPRepository.addActivity({
        actorId: 'system',
        actorName: 'Anonymous Visitor',
        department: 'admin',
        action: 'Login Failure',
        entityType: 'Authentication',
        entityId: 'auth',
        entityDocNo: cleanId,
        details: `Failed sign-in attempt for non-existent identifier: ${cleanId}. IP: ${req.ip || 'unknown'}`,
      });
      res.status(401).json({ error: 'Invalid email/employee ID or password.' });
      return;
    }

    if (emp.status !== 'Active') {
      res.status(403).json({ error: 'Your employee account is inactive. Please contact your system administrator.' });
      return;
    }

    const valid = emp.passwordHash ? bcrypt.compareSync(password, emp.passwordHash) : false;
    if (!valid) {
      recordAuthFailure(req);
      await mongoERPRepository.addActivity({
        actorId: emp.id,
        actorName: emp.name,
        department: emp.department,
        action: 'Login Failure',
        entityType: 'Authentication',
        entityId: emp.id,
        entityDocNo: emp.employeeId,
        details: `Failed password verification for ${emp.employeeId} (${emp.name}). IP: ${req.ip || 'unknown'}`,
      });
      res.status(401).json({ error: 'Invalid email/employee ID or password.' });
      return;
    }

    const user = await resolveAuthUser(emp.id);
    if (!user) {
      res.status(403).json({ error: 'No valid active role assigned to this employee account.' });
      return;
    }

    // Reset rate limiter on successful authentication
    resetAuthFailure(req);

    const sessionId = generateId('sess');
    const accessToken = signAccessToken(emp.id);
    const refreshToken = signRefreshToken(emp.id, sessionId);
    const refreshTokenHash = hashToken(refreshToken);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await SessionModel.create({
      id: sessionId,
      employeeId: emp.id,
      refreshTokenHash,
      ipAddress: req.ip || req.socket.remoteAddress || '',
      userAgent: req.get('user-agent') || '',
      expiresAt,
      revoked: false,
    });

    await mongoERPRepository.addActivity({
      actorId: emp.id,
      actorName: emp.name,
      department: emp.department,
      action: 'Login Success',
      entityType: 'Authentication',
      entityId: sessionId,
      entityDocNo: emp.employeeId,
      details: `User ${emp.name} signed in successfully. IP: ${req.ip || 'unknown'}`,
    });

    res.json({ token: accessToken, refreshToken, user });
  } catch (err) {
    sendError(res, err, 500);
  }
});

// POST /api/auth/refresh
authRouter.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required.' });
      return;
    }

    let decoded: { sub: string; sid: string; type?: string };
    try {
      decoded = jwt.verify(refreshToken, env.jwtRefreshSecret) as any;
    } catch {
      res.status(401).json({ error: 'Invalid or expired refresh token.' });
      return;
    }

    const session = await SessionModel.findOne({ id: decoded.sid });
    if (!session) {
      res.status(401).json({ error: 'Session not found. Please sign in again.' });
      return;
    }

    // Reuse detection: If session is already revoked, potential token theft!
    if (session.revoked) {
      // Invalidate all sessions for this employee to protect account
      await SessionModel.updateMany({ employeeId: session.employeeId }, { revoked: true });
      res.status(401).json({ error: 'Session revoked. Suspicious activity detected. All sessions invalidated.' });
      return;
    }

    if (session.expiresAt < new Date()) {
      session.revoked = true;
      await session.save();
      res.status(401).json({ error: 'Refresh token expired. Please sign in again.' });
      return;
    }

    const tokenHash = hashToken(refreshToken);
    if (session.refreshTokenHash !== tokenHash) {
      session.revoked = true;
      await session.save();
      res.status(401).json({ error: 'Invalid refresh token token hash match.' });
      return;
    }

    const user = await resolveAuthUser(session.employeeId);
    if (!user) {
      session.revoked = true;
      await session.save();
      res.status(401).json({ error: 'Account deactivated or removed.' });
      return;
    }

    // Refresh Token Rotation: Revoke old session and generate new pair
    session.revoked = true;
    await session.save();

    const newSessionId = generateId('sess');
    const newAccessToken = signAccessToken(user.id);
    const newRefreshToken = signRefreshToken(user.id, newSessionId);
    const newRefreshTokenHash = hashToken(newRefreshToken);

    await SessionModel.create({
      id: newSessionId,
      employeeId: user.id,
      refreshTokenHash: newRefreshTokenHash,
      ipAddress: req.ip || req.socket.remoteAddress || '',
      userAgent: req.get('user-agent') || '',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revoked: false,
    });

    res.json({ token: newAccessToken, refreshToken: newRefreshToken, user });
  } catch (err) {
    sendError(res, err, 500);
  }
});

// POST /api/auth/logout
authRouter.post('/auth/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await SessionModel.updateOne({ refreshTokenHash: tokenHash }, { revoked: true });
    }

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: req.user!.department,
      action: 'Logout',
      entityType: 'Authentication',
      entityId: req.user!.id,
      entityDocNo: req.user!.employeeId,
      details: `User ${req.user!.name} signed out.`,
    });

    res.json({ ok: true, message: 'Logged out successfully.' });
  } catch (err) {
    sendError(res, err, 500);
  }
});

// POST /api/auth/logout-all
authRouter.post('/auth/logout-all', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await SessionModel.updateMany({ employeeId: req.user!.id, revoked: false }, { revoked: true });

    await mongoERPRepository.addActivity({
      actorId: req.user!.id,
      actorName: req.user!.name,
      department: req.user!.department,
      action: 'Logout All Sessions',
      entityType: 'Authentication',
      entityId: req.user!.id,
      entityDocNo: req.user!.employeeId,
      details: `User ${req.user!.name} revoked all active sessions.`,
    });

    res.json({ ok: true, message: 'All active sessions have been revoked.', revokedCount: result.modifiedCount });
  } catch (err) {
    sendError(res, err, 500);
  }
});

// POST /api/auth/change-password
authRouter.post('/auth/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      throw new Error('Current password and new password are required.');
    }

    if (newPassword.trim().length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      throw new Error('New password must contain at least one letter and one number.');
    }

    const emp = await EmployeeModel.findOne({ id: req.user!.id });
    if (!emp) throw new Error('NOT_FOUND:Employee record not found.');

    const isValidCurrent = emp.passwordHash ? bcrypt.compareSync(currentPassword, emp.passwordHash) : false;
    if (!isValidCurrent) {
      throw new Error('Current password is incorrect.');
    }

    emp.passwordHash = bcrypt.hashSync(newPassword.trim(), 10);
    await emp.save();

    // Invalidate all existing sessions on password change
    await SessionModel.updateMany({ employeeId: emp.id, revoked: false }, { revoked: true });

    // Create fresh session for this client
    const sessionId = generateId('sess');
    const newAccessToken = signAccessToken(emp.id);
    const newRefreshToken = signRefreshToken(emp.id, sessionId);
    const refreshTokenHash = hashToken(newRefreshToken);

    await SessionModel.create({
      id: sessionId,
      employeeId: emp.id,
      refreshTokenHash,
      ipAddress: req.ip || req.socket.remoteAddress || '',
      userAgent: req.get('user-agent') || '',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revoked: false,
    });

    await mongoERPRepository.addActivity({
      actorId: emp.id,
      actorName: emp.name,
      department: emp.department,
      action: 'Password Changed',
      entityType: 'Authentication',
      entityId: emp.id,
      entityDocNo: emp.employeeId,
      details: `User ${emp.name} updated account password. All previous sessions revoked.`,
    });

    res.json({
      ok: true,
      message: 'Password updated successfully. Other sessions invalidated.',
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/auth/me
authRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

// PATCH /api/auth/profile
authRouter.patch('/auth/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, phone, currentPassword, newPassword } = req.body as {
      name?: string;
      phone?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const emp = await EmployeeModel.findOne({ id: req.user!.id });
    if (!emp) throw new Error('NOT_FOUND:Employee record not found.');

    if (newPassword && newPassword.trim()) {
      if (!currentPassword) {
        throw new Error('Current password is required to change password.');
      }
      if (newPassword.trim().length < 8) {
        throw new Error('New password must be at least 8 characters long.');
      }
      if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        throw new Error('New password must contain at least one letter and one number.');
      }
      const isValidCurrent = emp.passwordHash ? bcrypt.compareSync(currentPassword, emp.passwordHash) : false;
      if (!isValidCurrent) {
        throw new Error('Current password is incorrect.');
      }
      emp.passwordHash = bcrypt.hashSync(newPassword.trim(), 10);
      // Invalidate existing sessions
      await SessionModel.updateMany({ employeeId: emp.id, revoked: false }, { revoked: true });
    }

    if (name && name.trim()) emp.name = name.trim();
    if (phone !== undefined) emp.phone = phone.trim();

    await emp.save();
    const user = await resolveAuthUser(emp.id);
    res.json({ user });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/erp/bootstrap - Role & Department Scoped Dataset
authRouter.get('/erp/bootstrap', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const dept = user.department;
    const isSuperAdmin = user.roleId === 'role-super-admin' || dept === 'admin';

    // Base shared datasets
    const [companyDoc, rolesDocs, rawEmployees, stockMap] = await Promise.all([
      CompanySettingsModel.findOne({ id: 'company' }).lean(),
      RoleModel.find().lean(),
      EmployeeModel.find().lean(),
      mongoERPRepository.computeStockMap(),
    ]);

    // Strip passwordHash from employees unconditionally
    const sanitizedEmployees = rawEmployees.map(({ passwordHash: _ph, ...rest }) => rest);

    // If Super Admin / Admin, return full database
    if (isSuperAdmin) {
      const state = await mongoERPRepository.getState();
      const safeStateEmployees = state.employees.map(({ passwordHash: _ph, ...rest }) => rest);
      res.json({
        ...state,
        employees: safeStateEmployees,
        stockMap,
        currentUser: user,
      });
      return;
    }

    // Scoped queries based on operational department
    let customers: any[] = [];
    let products: any[] = [];
    let materials: any[] = [];
    let suppliers: any[] = [];
    let enquiries: any[] = [];
    let followUps: any[] = [];
    let quotations: any[] = [];
    let proformaInvoices: any[] = [];
    let customerPOs: any[] = [];
    let payments: any[] = [];
    let salesOrders: any[] = [];
    let productionOrders: any[] = [];
    let boms: any[] = [];
    let materialRequests: any[] = [];
    let materialIssues: any[] = [];
    let supplierPOs: any[] = [];
    let grns: any[] = [];
    let supplierReturns: any[] = [];
    let stockTransactions: any[] = [];
    let dailyUpdates: any[] = [];
    let qualityChecks: any[] = [];
    let reworkOrders: any[] = [];
    let productionReturns: any[] = [];
    let deliveryOrders: any[] = [];
    let deliveryIssues: any[] = [];

    if (dept === 'sales') {
      [customers, products, enquiries, followUps, quotations, proformaInvoices, customerPOs, payments, salesOrders] =
        await Promise.all([
          CustomerModel.find().lean(),
          ProductModel.find().lean(),
          EnquiryModel.find().sort({ createdAt: -1 }).lean(),
          FollowUpModel.find().sort({ createdAt: -1 }).lean(),
          QuotationModel.find().sort({ createdAt: -1 }).lean(),
          ProformaInvoiceModel.find().sort({ createdAt: -1 }).lean(),
          CustomerPOModel.find().sort({ createdAt: -1 }).lean(),
          PaymentEntryModel.find().sort({ createdAt: -1 }).lean(),
          SalesOrderModel.find().sort({ createdAt: -1 }).lean(),
        ]);
      if (!checkPermission(req.user!.permissions, 'payments', 'view')) {
        payments = [];
      }
    } else if (dept === 'supply_chain') {
      [materials, suppliers, materialRequests, materialIssues, supplierPOs, grns, supplierReturns, productionReturns, stockTransactions] =
        await Promise.all([
          MaterialModel.find().lean(),
          SupplierModel.find().lean(),
          MaterialRequestModel.find().sort({ createdAt: -1 }).lean(),
          MaterialIssueModel.find().sort({ createdAt: -1 }).lean(),
          SupplierPOModel.find().sort({ createdAt: -1 }).lean(),
          GRNModel.find().sort({ createdAt: -1 }).lean(),
          SupplierReturnModel.find().sort({ createdAt: -1 }).lean(),
          ProductionReturnModel.find().sort({ createdAt: -1 }).lean(),
          StockTransactionModel.find().sort({ timestamp: -1 }).limit(200).lean(),
        ]);
    } else if (dept === 'production') {
      [productionOrders, boms, materialRequests, dailyUpdates, qualityChecks, reworkOrders, productionReturns, salesOrders, products, materials, materialIssues] =
        await Promise.all([
          ProductionOrderModel.find().sort({ createdAt: -1 }).lean(),
          BOMModel.find().sort({ createdAt: -1 }).lean(),
          MaterialRequestModel.find().sort({ createdAt: -1 }).lean(),
          DailyProductionUpdateModel.find().sort({ createdAt: -1 }).lean(),
          QualityCheckModel.find().sort({ createdAt: -1 }).lean(),
          ReworkOrderModel.find().sort({ createdAt: -1 }).lean(),
          ProductionReturnModel.find().sort({ createdAt: -1 }).lean(),
          SalesOrderModel.find(
            {},
            {
              id: 1,
              docNo: 1,
              customerSnapshot: 1,
              customerPoNumber: 1,
              promisedDeliveryDate: 1,
              priority: 1,
              commercialStatus: 1,
              fulfillmentStatus: 1,
              items: 1,
              deliveryAddress: 1,
              createdAt: 1,
            },
          )
            .sort({ createdAt: -1 })
            .lean(),
          ProductModel.find().lean(),
          MaterialModel.find().lean(),
          MaterialIssueModel.find().sort({ createdAt: -1 }).lean(),
        ]);
    } else if (dept === 'logistics') {
      [deliveryOrders, deliveryIssues, salesOrders, productionOrders, products] = await Promise.all([
        DeliveryOrderModel.find().sort({ createdAt: -1 }).lean(),
        DeliveryIssueModel.find().sort({ createdAt: -1 }).lean(),
        SalesOrderModel.find(
          {},
          {
            id: 1,
            docNo: 1,
            customerSnapshot: 1,
            customerPoNumber: 1,
            deliveryAddress: 1,
            promisedDeliveryDate: 1,
            priority: 1,
            commercialStatus: 1,
            fulfillmentStatus: 1,
            items: 1,
            createdAt: 1,
          },
        )
          .sort({ createdAt: -1 })
          .lean(),
        ProductionOrderModel.find({ status: { $in: ['Completed', 'Ready to Start', 'In Progress'] } })
          .sort({ createdAt: -1 })
          .lean(),
        ProductModel.find().lean(),
      ]);
    }

    const [notifications, activityLogs, approvalWorkflows, approvalRequests] = await Promise.all([
      NotificationModel.find({ $or: [{ department: dept }, { department: 'all' }] })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      ActivityLogModel.find({ department: dept }).sort({ timestamp: -1 }).limit(50).lean(),
      ApprovalWorkflowModel.find().lean(),
      ApprovalRequestModel.find({
        $or: [{ 'submittedBy.id': user.id }, { department: dept }],
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    res.json({
      counters: {
        ENQ: 0, QT: 0, PI: 0, CPO: 0, PAY: 0, SO: 0, PROD: 0, BOM: 0,
        MR: 0, SPO: 0, GRN: 0, MI: 0, SR: 0, QC: 0, RW: 0, DEL: 0,
      },
      company: companyDoc,
      roles: rolesDocs,
      employees: sanitizedEmployees,
      customers,
      products,
      materials,
      suppliers,
      enquiries,
      followUps,
      quotations,
      proformaInvoices,
      customerPOs,
      payments,
      salesOrders,
      productionOrders,
      boms,
      materialRequests,
      materialIssues,
      supplierPOs,
      grns,
      supplierReturns,
      stockTransactions,
      dailyUpdates,
      qualityChecks,
      reworkOrders,
      productionReturns,
      deliveryOrders,
      deliveryIssues,
      notifications,
      activityLogs,
      approvalWorkflows,
      approvalRequests,
      stockMap,
      currentUser: user,
    });
  } catch (err) {
    sendError(res, err, 500);
  }
});

// POST /api/notifications/:id/read
authRouter.post('/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await NotificationModel.updateOne({ id: req.params.id }, { $addToSet: { readBy: req.user!.id } });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});
