import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { CLIENT_ROUTES } from '../routes';

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, user, isLocked, loadAuth } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  if (!isAuthenticated) {
    return <Navigate to={CLIENT_ROUTES.login} replace />;
  }

  // Redirect to lock screen if session is locked
  if (isLocked) {
    return <Navigate to={CLIENT_ROUTES.lock} replace />;
  }

  // Redirect to profile page if profile not completed (unless already there)
  if (user && !user.profileCompleted && location.pathname !== CLIENT_ROUTES.profile) {
    return <Navigate to={CLIENT_ROUTES.profile} replace />;
  }

  // Redirect to profile page if PIN not created (unless already there)
  if (user && user.profileCompleted && !user.hasPin && location.pathname !== CLIENT_ROUTES.profile) {
    return <Navigate to={CLIENT_ROUTES.profile} replace />;
  }

  return <>{children}</>;
}
