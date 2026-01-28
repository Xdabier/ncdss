import React from 'react';
import { Menu, RefreshCw, Bell } from 'lucide-react';
import { UserRole } from '@ncdss/shared';
import { Button } from '../ui/button';
import { useSyncStore } from '../../stores/sync.store';
import { useAuthStore } from '../../stores/auth.store';
import { AssignmentSelector } from './AssignmentSelector';
import { cn } from '../../lib/utils';

interface Props {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: Props) {
  const { isSyncing, lastSyncAt } = useSyncStore();
  const { user } = useAuthStore();

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Jamais synchronisé';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    return `Il y a ${Math.floor(hours / 24)}j`;
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b shadow-sm">
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

          {/* Sync status */}
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-gray-50 rounded-lg">
            <RefreshCw
              className={cn('h-4 w-4 text-gray-500', isSyncing && 'animate-spin text-blue-600')}
            />
            <div className="text-xs">
              <div className="text-gray-500">{formatLastSync(lastSyncAt)}</div>
            </div>
          </div>

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
          </Button>
        </div>
      </div>
    </header>
  );
}
