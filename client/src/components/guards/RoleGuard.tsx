import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { UserRole, NurseAssignment } from '@ncdss/shared';

interface Props {
  children: ReactNode;
  allowedRoles: UserRole[];
  allowedAssignments?: NurseAssignment[];
  redirectTo?: string;
}

export function RoleGuard({
  children,
  allowedRoles,
  allowedAssignments,
  redirectTo = '/dashboard',
}: Props) {
  const { user, todayAssignment, isAuthenticated } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Check role
  if (!allowedRoles.includes(user.role as UserRole)) {
    return <Navigate to={redirectTo} replace />;
  }

  // For nurses, also check assignment
  if (user.role === UserRole.NURSE && allowedAssignments) {
    if (!todayAssignment || !allowedAssignments.includes(todayAssignment)) {
      return <Navigate to={redirectTo} replace />;
    }
  }

  return <>{children}</>;
}
