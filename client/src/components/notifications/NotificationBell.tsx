import React, { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Notification, UserRole } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';
import { Button } from '../ui/button';
import { useNotificationStore } from '../../stores/notification.store';
import { useAuthStore } from '../../stores/auth.store';
import { NotificationItem } from './NotificationItem';
import { cn } from '../../lib/utils';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotificationStore();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleNavigate = (notification: Notification) => {
    setIsOpen(false);
    if (notification.relatedPatientId) {
      // Navigate based on user role
      const role = user?.role;
      if (role === UserRole.DOCTOR || role === UserRole.SUPER_ADMIN) {
        navigate(CLIENT_ROUTES.doctor.patientDetail(notification.relatedPatientId));
      } else if (role === UserRole.NURSE || role === UserRole.NURSE_SUPERVISOR) {
        navigate(CLIENT_ROUTES.nurse.treatment.patientCare(notification.relatedPatientId));
      } else {
        navigate(CLIENT_ROUTES.shared.patientTimeline(notification.relatedPatientId));
      }
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={handleToggle}
        aria-label="Notifications"
      >
        <Bell className={cn('h-5 w-5', isOpen && 'text-blue-600')} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Tout marquer lu
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <Bell className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Aucune notification</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={markAsRead}
                  onNavigate={handleNavigate}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
