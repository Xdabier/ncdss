// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

/**
 * Types of notifications in the system
 */
export enum NotificationType {
  PATIENT_ASSIGNED = 'PATIENT_ASSIGNED',
  CRITICAL_PATIENT = 'CRITICAL_PATIENT',
  SHIFT_ENDING = 'SHIFT_ENDING',
  TRIAGE_COMPLETE = 'TRIAGE_COMPLETE',
  BOX_ASSIGNMENT_CHANGE = 'BOX_ASSIGNMENT_CHANGE',
  RETRIAGE_REQUESTED = 'RETRIAGE_REQUESTED',
  PATIENT_DETERIORATION = 'PATIENT_DETERIORATION',
  ORPHANED_PATIENTS = 'ORPHANED_PATIENTS',
  TREATMENT_COMPLETE = 'TREATMENT_COMPLETE',
  TREATMENT_REDIRECT = 'TREATMENT_REDIRECT',
}

/**
 * Priority levels for notifications
 */
export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Notification record from database
 */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  relatedPatientId: string | null;
  relatedBoxId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Request to create a new notification
 */
export interface CreateNotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  relatedPatientId?: string;
  relatedBoxId?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}

/**
 * Response for unread count endpoint
 */
export interface UnreadCountResponse {
  count: number;
}

/**
 * Query parameters for fetching notifications
 */
export interface NotificationQuery {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
  priority?: NotificationPriority;
  type?: NotificationType;
}
