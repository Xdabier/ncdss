import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { auditLog, users } from '../../database/schema';
import { eq } from 'drizzle-orm';

interface AuditableRequest extends Request {
  user?: { userId: string; role: string };
}

// All resources to audit for write operations (POST, PUT, DELETE)
const WRITE_AUDITABLE_RESOURCES = [
  'patients',
  'prescriptions',
  'diagnoses',
  'users',
  'config',
  'schedule',
  'pathologies',
  'interventions',
  'box-assignments',
  'sync',
];

// Resources to audit for read operations (GET) - sensitive data
const READ_AUDITABLE_RESOURCES = [
  'patients',
  'prescriptions',
  'diagnoses',
];

// Actions that should be excluded from audit (to avoid noise)
const EXCLUDED_PATHS = [
  '/api/health',
  '/api/audit-log',
  '/api/stats',
];

/**
 * Audit middleware for healthcare compliance.
 * Logs all write operations and sensitive data access.
 */
export async function auditMiddleware(
  req: AuditableRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip excluded paths
  const fullPath = req.baseUrl + req.path;
  if (EXCLUDED_PATHS.some(excluded => fullPath.startsWith(excluded))) {
    return next();
  }

  // Extract resource from path (e.g., /patients/123 -> patients)
  const pathParts = req.path.split('/').filter(Boolean);
  const resource = pathParts[0] || 'unknown';

  // Determine if this action should be audited
  const isWriteOperation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  const isReadOperation = req.method === 'GET';

  const shouldAuditWrite = isWriteOperation && WRITE_AUDITABLE_RESOURCES.includes(resource);
  const shouldAuditRead = isReadOperation && READ_AUDITABLE_RESOURCES.includes(resource);

  // Only audit specific resource access for GET (not list operations)
  const isSpecificResourceAccess = pathParts.length > 1 && pathParts[1] !== 'export';

  if (!shouldAuditWrite && !(shouldAuditRead && isSpecificResourceAccess)) {
    return next();
  }

  // Capture original json method
  const originalJson = res.json.bind(res);

  res.json = function (data: any) {
    // Log after response (both success and some failures for security)
    const shouldLog = res.statusCode >= 200 && res.statusCode < 300;
    const isSecurityRelevant = res.statusCode === 401 || res.statusCode === 403;

    if (shouldLog || isSecurityRelevant) {
      logAuditEntry(req, resource, pathParts, data, res.statusCode).catch((err) => {
        console.error('Audit log error:', err);
      });
    }

    return originalJson(data);
  };

  next();
}

/**
 * Directly log an audit entry (for use in auth routes and other special cases)
 */
export async function logAuditEvent(
  action: string,
  resource: string,
  details: Record<string, any>,
  userId?: string | null,
  username?: string
): Promise<void> {
  try {
    const db = getDb();

    // Get username from userId if not provided
    let resolvedUsername = username || 'anonymous';
    if (!username && userId) {
      const [userRecord] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, userId));
      if (userRecord) {
        resolvedUsername = userRecord.username;
      }
    }

    const auditDetails = {
      ...details,
      username: resolvedUsername,
    };

    await db.insert(auditLog).values({
      id: randomUUID(),
      userId: userId || null,
      action,
      tableName: resource,
      recordId: details.resourceId || null,
      oldValues: null,
      newValues: JSON.stringify(auditDetails),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

async function logAuditEntry(
  req: AuditableRequest,
  resource: string,
  pathParts: string[],
  responseData: any,
  statusCode: number
): Promise<void> {
  try {
    const db = getDb();

    // Get username from userId
    let username = 'anonymous';
    if (req.user?.userId) {
      const [userRecord] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, req.user.userId));
      if (userRecord) {
        username = userRecord.username;
      }
    }

    // Determine resource ID
    const resourceId = pathParts[1] || responseData?.id || null;

    // Determine action type with more detail
    let action = req.method;
    if (req.method === 'GET') {
      action = 'VIEW';
    } else if (req.method === 'POST') {
      // Check for special sub-actions
      const subAction = pathParts[pathParts.length - 1];
      if (['start-triage', 'complete-triage', 'analyze', 'retriage'].includes(subAction)) {
        action = `TRIAGE_${subAction.replace('-', '_').toUpperCase()}`;
      } else if (['administer', 'cancel', 'hold'].includes(subAction)) {
        action = `PRESCRIPTION_${subAction.toUpperCase()}`;
      } else if (['confirm', 'resolve'].includes(subAction)) {
        action = `DIAGNOSIS_${subAction.toUpperCase()}`;
      } else if (subAction === 'discharge') {
        action = 'DISCHARGE';
      } else if (subAction === 'assign-box') {
        action = 'ASSIGN_BOX';
      } else if (subAction === 'reset-password') {
        action = 'RESET_PASSWORD';
      } else if (subAction === 'import') {
        action = 'IMPORT';
      } else {
        action = 'CREATE';
      }
    } else if (req.method === 'PUT') {
      const subAction = pathParts[pathParts.length - 1];
      if (subAction === 'vitals') {
        action = 'UPDATE_VITALS';
      } else if (subAction === 'treatment') {
        action = 'UPDATE_TREATMENT';
      } else if (subAction === 'esi') {
        action = 'SET_ESI';
      } else if (['abcde', 'airway', 'breathing', 'circulation', 'disability', 'exposure'].includes(subAction)) {
        action = `ASSESS_${subAction.toUpperCase()}`;
      } else {
        action = 'UPDATE';
      }
    } else if (req.method === 'DELETE') {
      action = 'DELETE';
    }

    // Build details object
    const details: Record<string, any> = {
      path: req.path,
      method: req.method,
      statusCode,
      username,
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    };

    // Only include body for write operations (not GET)
    if (req.method !== 'GET' && req.body) {
      details.body = sanitizeBody(req.body);
    }

    // Include query params if present
    if (Object.keys(req.query).length > 0) {
      details.query = req.query;
    }

    await db.insert(auditLog).values({
      id: randomUUID(),
      userId: req.user?.userId || null,
      action,
      tableName: resource,
      recordId: resourceId,
      oldValues: null,
      newValues: JSON.stringify(details),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    // Don't throw - audit errors should not break the request
    console.error('Failed to write audit log:', error);
  }
}

/**
 * Remove sensitive data from audit logs
 */
function sanitizeBody(body: any): any {
  if (!body) return null;

  const sanitized = { ...body };
  const sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'secret',
    'apiKey',
    'refreshToken',
    'accessToken',
    'currentPassword',
    'newPassword',
    'confirmPassword',
  ];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}
