import { Router } from 'express';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { getDb } from '../../database';
import { auditLog, users } from '../../database/schema';

const router = Router();

/**
 * GET /audit-log
 * Retrieve audit log entries with filtering and pagination.
 * Only accessible by ADMIN and SUPER_ADMIN.
 */
router.get('/', async (req, res) => {
  try {
    const { role } = (req as any).user;

    // Check role
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { startDate, endDate, userId, action, resource, limit = '50', offset = '0' } = req.query;

    const db = getDb();

    // Build conditions array
    const conditions: any[] = [];

    if (startDate) {
      conditions.push(gte(auditLog.createdAt, startDate as string));
    }

    if (endDate) {
      // Add time to end of day
      const endDateTime = (endDate as string) + 'T23:59:59.999Z';
      conditions.push(lte(auditLog.createdAt, endDateTime));
    }

    if (userId) {
      conditions.push(eq(auditLog.userId, userId as string));
    }

    if (action) {
      // Support filtering by action category
      if (action === 'AUTH') {
        conditions.push(
          sql`${auditLog.action} IN ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT')`
        );
      } else if (action === 'TRIAGE') {
        conditions.push(
          sql`${auditLog.action} LIKE 'TRIAGE_%' OR ${auditLog.action} LIKE 'ASSESS_%' OR ${auditLog.action} = 'SET_ESI'`
        );
      } else {
        conditions.push(eq(auditLog.action, action as string));
      }
    }

    if (resource) {
      conditions.push(eq(auditLog.tableName, resource as string));
    }

    // Build query
    let query = db
      .select({
        id: auditLog.id,
        userId: auditLog.userId,
        action: auditLog.action,
        resource: auditLog.tableName,
        resourceId: auditLog.recordId,
        details: auditLog.newValues,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(parseInt(limit as string, 10))
      .offset(parseInt(offset as string, 10));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const entries = await query;

    // Parse details JSON and add username
    const enrichedEntries = entries.map((entry: typeof entries[number]) => {
      let details: any = {};
      try {
        details = entry.details ? JSON.parse(entry.details) : {};
      } catch {
        details = { raw: entry.details };
      }

      return {
        id: entry.id,
        userId: entry.userId,
        username: details.username || 'inconnu',
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        details: details.body,
        ipAddress: details.ipAddress,
        userAgent: details.userAgent,
        createdAt: entry.createdAt,
      };
    });

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count || 0;

    res.json({
      entries: enrichedEntries,
      pagination: {
        total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /audit-log/users
 * Get list of users for filter dropdown.
 */
router.get('/users', async (req, res) => {
  try {
    const { role } = (req as any).user;

    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const db = getDb();

    const result = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
      })
      .from(users)
      .orderBy(users.fullName);

    res.json(result);
  } catch (error) {
    console.error('Get audit users error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /audit-log/export
 * Export audit log entries as CSV.
 */
router.get('/export', async (req, res) => {
  try {
    const { role } = (req as any).user;

    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { startDate, endDate, userId, action, resource } = req.query;

    const db = getDb();

    // Build conditions
    const conditions: any[] = [];

    if (startDate) {
      conditions.push(gte(auditLog.createdAt, startDate as string));
    }

    if (endDate) {
      const endDateTime = (endDate as string) + 'T23:59:59.999Z';
      conditions.push(lte(auditLog.createdAt, endDateTime));
    }

    if (userId) {
      conditions.push(eq(auditLog.userId, userId as string));
    }

    if (action) {
      conditions.push(eq(auditLog.action, action as string));
    }

    if (resource) {
      conditions.push(eq(auditLog.tableName, resource as string));
    }

    let query = db
      .select({
        id: auditLog.id,
        userId: auditLog.userId,
        action: auditLog.action,
        resource: auditLog.tableName,
        resourceId: auditLog.recordId,
        details: auditLog.newValues,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(10000); // Limit export to 10k entries

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const entries = await query;

    // Generate CSV
    const csvHeaders = [
      'Date/Heure',
      'Utilisateur',
      'Action',
      'Ressource',
      'ID Ressource',
      'Adresse IP',
      'User Agent',
    ];

    const csvRows = entries.map((entry: typeof entries[number]) => {
      let details: any = {};
      try {
        details = entry.details ? JSON.parse(entry.details) : {};
      } catch {
        details = {};
      }

      return [
        entry.createdAt,
        details.username || 'inconnu',
        entry.action,
        entry.resource || '',
        entry.resourceId || '',
        details.ipAddress || '',
        (details.userAgent || '').replace(/"/g, '""'), // Escape quotes
      ]
        .map((field) => `"${field}"`)
        .join(',');
    });

    const csv = [csvHeaders.join(','), ...csvRows].join('\n');

    // Add BOM for Excel UTF-8 compatibility
    const bom = '\uFEFF';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit_log_${new Date().toISOString().split('T')[0]}.csv"`
    );
    res.send(bom + csv);
  } catch (error) {
    console.error('Export audit log error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as auditRouter };
