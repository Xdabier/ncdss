import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../../database';
import { auditLog, users } from '../../database/schema';
import { eq } from 'drizzle-orm';

interface AuditableRequest extends Request {
  user?: { userId: string; role: string };
}

// Resources that can generate audit-worthy actions
const AUDITABLE_RESOURCES = [
  'patients',
  'prescriptions',
  'diagnoses',
  'users',
  'schedule',
  'interventions',
  'box-assignments',
];

// High-priority actions that should always be logged
// Security-critical: authentication, user management
// Clinical-critical: key patient milestones, medication, diagnoses
const HIGH_PRIORITY_ACTIONS = [
  // Patient lifecycle
  'CREATE',           // Patient registration
  'DELETE',           // Patient deletion (rare but critical)
  'DISCHARGE',        // Patient discharge
  'TRIAGE_COMPLETE_TRIAGE', // Triage decision finalized
  'TRIAGE_RETRIAGE',  // Clinical deterioration
  'SET_ESI',          // Severity level set
  // Prescriptions
  'PRESCRIPTION_ADMINISTER', // Medication given
  'PRESCRIPTION_CANCEL',     // Prescription cancelled
  // Diagnoses
  'DIAGNOSIS_CONFIRM',       // Diagnosis confirmed
  // User management (always log for security)
  'RESET_PASSWORD',
];

// Actions that are always logged regardless of resource (security)
const SECURITY_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
];

// Paths to completely exclude from audit
const EXCLUDED_PATHS = [
  '/api/health',
  '/api/audit-log',
  '/api/stats',
];

/**
 * Audit middleware for healthcare compliance.
 * Logs only high-priority actions to avoid database bloat.
 *
 * Logged actions:
 * - Security: login attempts, user management
 * - Clinical: patient registration, discharge, triage completion, ESI
 * - Medication: prescription administration and cancellation
 * - Diagnoses: confirmation
 * - Administrative: schedule, interventions, box-assignments changes
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

  // Only audit write operations on auditable resources
  const isWriteOperation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  if (!isWriteOperation || !AUDITABLE_RESOURCES.includes(resource)) {
    return next();
  }

  // Capture original json method
  const originalJson = res.json.bind(res);

  res.json = function (data: unknown) {
    // Only log successful operations (security failures are handled separately)
    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;

    if (isSuccess) {
      // Determine the action before deciding whether to log
      const action = determineAction(req.method, pathParts);

      // Only log high-priority actions
      if (shouldLogAction(action, resource)) {
        logAuditEntry(req, resource, pathParts, data, res.statusCode, action).catch((err) => {
          console.error('Audit log error:', err);
        });
      }
    }

    return originalJson(data);
  };

  next();
}

/**
 * Determine the action type from request method and path
 */
function determineAction(method: string, pathParts: string[]): string {
  if (method === 'POST') {
    const subAction = pathParts[pathParts.length - 1];
    if (subAction === 'request-retriage') {
      return 'TRIAGE_RETRIAGE';
    } else if (subAction === 'analyze-findings') {
      return 'TRIAGE_ANALYZE';
    } else if (['start-triage', 'complete-triage'].includes(subAction)) {
      return `TRIAGE_${subAction.replace('-', '_').toUpperCase()}`;
    } else if (['administer', 'cancel', 'hold'].includes(subAction)) {
      return `PRESCRIPTION_${subAction.toUpperCase()}`;
    } else if (['confirm', 'resolve'].includes(subAction)) {
      return `DIAGNOSIS_${subAction.toUpperCase()}`;
    } else if (subAction === 'discharge') {
      return 'DISCHARGE';
    } else if (subAction === 'assign-box') {
      return 'ASSIGN_BOX';
    } else if (subAction === 'reset-password') {
      return 'RESET_PASSWORD';
    } else if (subAction === 'import') {
      return 'IMPORT';
    }
    return 'CREATE';
  } else if (method === 'PUT') {
    const subAction = pathParts[pathParts.length - 1];
    if (subAction === 'vitals') {
      return 'UPDATE_VITALS';
    } else if (subAction === 'treatment') {
      return 'UPDATE_TREATMENT';
    } else if (subAction === 'esi') {
      return 'SET_ESI';
    } else if (['abcde', 'airway', 'breathing', 'circulation', 'disability', 'exposure'].includes(subAction)) {
      return `ASSESS_${subAction.toUpperCase()}`;
    }
    return 'UPDATE';
  } else if (method === 'DELETE') {
    return 'DELETE';
  }
  return method;
}

/**
 * Check if an action should be logged based on priority
 */
function shouldLogAction(action: string, resource: string): boolean {
  // Always log high-priority actions
  if (HIGH_PRIORITY_ACTIONS.includes(action)) {
    return true;
  }

  // Always log security actions
  if (SECURITY_ACTIONS.includes(action)) {
    return true;
  }

  // Always log user management (CREATE, UPDATE, DELETE on users)
  if (resource === 'users' && ['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
    return true;
  }

  // Always log prescription and diagnosis creation
  if ((resource === 'prescriptions' || resource === 'diagnoses') && action === 'CREATE') {
    return true;
  }

  // Always log administrative resource changes (schedule, interventions, box-assignments)
  if (['schedule', 'interventions', 'box-assignments'].includes(resource)) {
    if (['CREATE', 'UPDATE', 'DELETE', 'IMPORT'].includes(action)) {
      return true;
    }
  }

  return false;
}

/**
 * Directly log an audit entry (for use in auth routes and other special cases)
 */
export async function logAuditEvent(
  action: string,
  resource: string,
  details: Record<string, unknown> & { resourceId?: string | null },
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
  responseData: unknown,
  statusCode: number,
  action: string
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
    const responseId = typeof responseData === 'object' && responseData !== null
      ? (responseData as { id?: string }).id
      : undefined;
    const resourceId = pathParts[1] || responseId || null;

    // Build details object (minimal for reduced storage)
    const details: Record<string, unknown> = {
      username,
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    };

    // Only include body for critical actions (not IMPORT - too large)
    if (req.body && ['CREATE', 'DELETE', 'RESET_PASSWORD'].includes(action)) {
      details.body = sanitizeBody(req.body);
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
function sanitizeBody(body: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
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
