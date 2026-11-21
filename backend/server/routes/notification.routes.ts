import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware';
import { NotificationModel } from '../models';
import { generateId, sendError } from '../utils/routeUtils';

export const notificationRouter = Router();

// GET /api/notifications - List notifications scoped to user's department
notificationRouter.get('/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.department === 'admin';
    const filter = req.query.filter as string; // 'all' | 'unread'
    const department = req.query.department as string;

    const query: Record<string, any> = {};

    // Department scoping
    if (!isSuperAdmin) {
      query.$or = [{ department: user.department }, { department: 'all' }, { recipientEmployeeId: user.id }];
    } else if (department && department !== 'all') {
      query.$or = [{ department }, { department: 'all' }];
    }

    if (filter === 'unread') {
      query.readBy = { $ne: user.id };
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const skip = (page - 1) * limit;

    const [items, total, unreadCount] = await Promise.all([
      NotificationModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      NotificationModel.countDocuments(query),
      NotificationModel.countDocuments({
        ...query,
        readBy: { $ne: user.id },
      }),
    ]);

    res.json({
      items,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST & PATCH /api/notifications/:id/read - Mark single notification as read
const handleMarkRead = async (req: AuthenticatedRequest, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const updated = await NotificationModel.findOneAndUpdate(
      { id },
      { $addToSet: { readBy: userId } },
      { returnDocument: 'after' },
    ).lean();

    if (!updated) {
      throw new Error('NOT_FOUND: Notification not found.');
    }

    res.json({ ok: true, notification: updated });
  } catch (err) {
    sendError(res, err);
  }
};

notificationRouter.post('/notifications/:id/read', requireAuth, handleMarkRead);
notificationRouter.patch('/notifications/:id/read', requireAuth, handleMarkRead);

// POST /api/notifications/read-all - Mark all accessible notifications as read for current user
notificationRouter.post('/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.department === 'admin';

    const query: Record<string, any> = {
      readBy: { $ne: user.id },
    };

    if (!isSuperAdmin) {
      query.$or = [{ department: user.department }, { department: 'all' }, { recipientEmployeeId: user.id }];
    }

    const result = await NotificationModel.updateMany(query, {
      $addToSet: { readBy: user.id },
    });

    res.json({
      ok: true,
      modifiedCount: result.modifiedCount,
      message: 'All notifications marked as read.',
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/notifications - Create notification with deduplication safeguard
notificationRouter.post('/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body;
    if (!body.title?.trim() || !body.message?.trim()) {
      throw new Error('Title and message are required for notification.');
    }

    // Deduplication check: prevent creating duplicate notifications for repeated / retried actions
    if (body.dedupKey?.trim()) {
      const existing = await NotificationModel.findOne({ dedupKey: body.dedupKey.trim() }).lean();
      if (existing) {
        return res.status(200).json({ ok: true, notification: existing, deduplicated: true });
      }
    }

    const notification = {
      id: generateId('notif'),
      title: body.title.trim(),
      message: body.message.trim(),
      department: body.department || 'all',
      severity: body.severity || 'info',
      link: body.link || '',
      readBy: [],
      recipientEmployeeId: body.recipientEmployeeId || '',
      relatedModule: body.relatedModule || '',
      relatedDocumentId: body.relatedDocumentId || '',
      dedupKey: body.dedupKey?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    await NotificationModel.create(notification);
    res.status(201).json({ ok: true, notification });
  } catch (err) {
    sendError(res, err);
  }
});
