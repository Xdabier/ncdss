import { Router } from 'express';
import { eq, and, desc, sql, isNotNull, lte } from 'drizzle-orm';
import { getDb } from '../../database';
import { notifications } from '../../database/schema';
import { AuthRequest } from '../middleware/auth';
import { cleanupExpiredNotifications } from '../../services/notificationService';

const router = Router();

// ============================================================================
// GET /notifications
// List current user's notifications with optional filters
// Query: ?unreadOnly=true&limit=50&offset=0&priority=CRITICAL&type=PATIENT_ASSIGNED
// ============================================================================

router.get('/', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!;
    const {
      unreadOnly,
      limit = '50',
      offset = '0',
      priority,
      type,
    } = req.query;

    const db = getDb();

    const conditions = [eq(notifications.userId, userId)];

    if (unreadOnly === 'true') {
      conditions.push(eq(notifications.isRead, false));
    }

    if (priority && typeof priority === 'string') {
      conditions.push(eq(notifications.priority, priority));
    }

    if (type && typeof type === 'string') {
      conditions.push(eq(notifications.type, type));
    }

    const result = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    // Parse metadata JSON for each notification
    const parsed = result.map((n: typeof result[number]) => ({
      ...n,
      metadata: n.metadata ? JSON.parse(n.metadata) : null,
    }));

    res.json(parsed);
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// GET /notifications/unread-count
// ============================================================================

router.get('/unread-count', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!;
    const db = getDb();

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        )
      );

    res.json({ count: result?.count ?? 0 });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// PUT /notifications/:id/read
// Mark a single notification as read
// ============================================================================

router.put('/:id/read', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!;
    const { id } = req.params;
    const db = getDb();

    // Verify the notification belongs to the user
    const [notification] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId)
        )
      );

    if (!notification) {
      return res.status(404).json({ error: 'Notification non trouv\u00e9e' });
    }

    if (notification.isRead) {
      return res.json(notification);
    }

    const now = new Date().toISOString();

    await db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(eq(notifications.id, id));

    res.json({
      ...notification,
      isRead: true,
      readAt: now,
      metadata: notification.metadata ? JSON.parse(notification.metadata) : null,
    });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// PUT /notifications/read-all
// Mark all of the user's notifications as read
// ============================================================================

router.put('/read-all', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!;
    const db = getDb();
    const now = new Date().toISOString();

    await db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// DELETE /notifications/:id
// Delete a single notification
// ============================================================================

router.delete('/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!;
    const { id } = req.params;
    const db = getDb();

    // Verify ownership
    const [notification] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId)
        )
      );

    if (!notification) {
      return res.status(404).json({ error: 'Notification non trouv\u00e9e' });
    }

    await db.delete(notifications).where(eq(notifications.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// DELETE /notifications/clear-read
// Delete all read notifications for the current user
// ============================================================================

router.delete('/clear-read', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!;
    const db = getDb();

    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, true)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Clear read notifications error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// POST /notifications/cleanup
// Remove expired notifications (admin/supervisor only)
// ============================================================================

router.post('/cleanup', async (req, res) => {
  try {
    const { role } = (req as AuthRequest).user!;

    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acc\u00e8s non autoris\u00e9' });
    }

    const deleted = await cleanupExpiredNotifications();
    res.json({ deleted });
  } catch (error) {
    console.error('Cleanup notifications error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as notificationsRouter };
