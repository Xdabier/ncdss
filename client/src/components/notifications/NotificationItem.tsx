import React from 'react';
import { Notification, NotificationPriority } from '@ncdss/shared';
import { cn } from '../../lib/utils';
import {
  UserPlus,
  AlertTriangle,
  Clock,
  CheckCircle,
  ArrowRightLeft,
  RotateCcw,
  TrendingDown,
  Users,
  BedDouble,
  Play,
} from 'lucide-react';

interface Props {
  notification: Notification;
  onRead: (id: string) => void;
  onNavigate: (notification: Notification) => void;
}

const PRIORITY_STYLES: Record<string, string> = {
  [NotificationPriority.CRITICAL]: 'border-l-red-600',
  [NotificationPriority.HIGH]: 'border-l-orange-500',
  [NotificationPriority.MEDIUM]: 'border-l-yellow-500',
  [NotificationPriority.LOW]: 'border-l-gray-300',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  PATIENT_ASSIGNED: <UserPlus className="h-4 w-4 text-blue-600" />,
  CRITICAL_PATIENT: <AlertTriangle className="h-4 w-4 text-red-600" />,
  SHIFT_ENDING: <Clock className="h-4 w-4 text-orange-600" />,
  TRIAGE_COMPLETE: <CheckCircle className="h-4 w-4 text-green-600" />,
  BOX_ASSIGNMENT_CHANGE: <ArrowRightLeft className="h-4 w-4 text-purple-600" />,
  RETRIAGE_REQUESTED: <RotateCcw className="h-4 w-4 text-yellow-600" />,
  PATIENT_DETERIORATION: <TrendingDown className="h-4 w-4 text-red-600" />,
  ORPHANED_PATIENTS: <Users className="h-4 w-4 text-red-500" />,
  TREATMENT_COMPLETE: <Play className="h-4 w-4 text-green-600" />,
  TREATMENT_REDIRECT: <BedDouble className="h-4 w-4 text-indigo-600" />,
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Il y a ${diffDays}j`;
}

export function NotificationItem({ notification, onRead, onNavigate }: Props) {
  const handleClick = () => {
    if (!notification.isRead) {
      onRead(notification.id);
    }
    onNavigate(notification);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-l-4 transition-colors hover:bg-gray-50',
        PRIORITY_STYLES[notification.priority] || 'border-l-gray-300',
        !notification.isRead && 'bg-blue-50/50'
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <div className="mt-0.5 shrink-0">
          {TYPE_ICONS[notification.type] || <AlertTriangle className="h-4 w-4 text-gray-400" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {!notification.isRead && (
              <span className="shrink-0 h-2 w-2 rounded-full bg-blue-600" />
            )}
            <span
              className={cn(
                'text-sm truncate block',
                !notification.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
              )}
            >
              {notification.title}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
          <span className="text-xs text-gray-400 mt-1 block">
            {formatTimeAgo(notification.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}
