import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { CLIENT_ROUTES } from '../routes';

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, loadAuth } = useAuthStore();

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  if (!isAuthenticated) {
    return <Navigate to={CLIENT_ROUTES.login} replace />;
  }

  return <>{children}</>;
}
