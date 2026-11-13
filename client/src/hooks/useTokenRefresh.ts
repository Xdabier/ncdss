import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { silentRefresh } from '../services/api';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (tokens expire at 15 min)

/**
 * Proactively refreshes the access token before it expires.
 * Runs every 10 minutes while the user is authenticated.
 * Works regardless of lock state - keeps the session alive silently.
 */
export function useTokenRefresh(): void {
  const { isAuthenticated } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Refresh immediately on mount (covers app restart with stale token)
    silentRefresh();

    // Then refresh periodically
    intervalRef.current = setInterval(() => {
      silentRefresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated]);
}
