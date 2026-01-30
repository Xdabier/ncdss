import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { UserRole, NurseAssignment } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';

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
  redirectTo = CLIENT_ROUTES.dashboard,
}: Props) {
  const { user, todayAssignment, isAuthenticated } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to={CLIENT_ROUTES.login} replace />;
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
