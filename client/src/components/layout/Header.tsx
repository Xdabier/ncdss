import React, { useEffect } from 'react';
import { Menu } from 'lucide-react';
import { UserRole } from '@ncdss/shared';
import { Button } from '../ui/button';
import { useAuthStore } from '../../stores/auth.store';
import { useNotificationStore } from '../../stores/notification.store';
import { AssignmentSelector } from './AssignmentSelector';
import { DoctorAssignmentSelector } from './DoctorAssignmentSelector';
import { NotificationBell } from '../notifications/NotificationBell';

interface Props {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: Props) {
  const { user } = useAuthStore();
  const { startPolling, stopPolling } = useNotificationStore();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <header className="sticky top-0 z-30 bg-white border-b shadow-sm safe-top">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left side - Menu button (mobile only) */}
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="hidden lg:block">
            <h2 className="text-lg font-semibold text-gray-900">NCDSS</h2>
            <p className="text-xs text-gray-500">Système de Support Décisionnel</p>
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center space-x-3">
          {/* Assignment selector for nurses */}
          {user?.role === UserRole.NURSE && <AssignmentSelector />}

          {/* Box assignment selector for doctors */}
          {user?.role === UserRole.DOCTOR && <DoctorAssignmentSelector />}

          {/* Notifications */}
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
