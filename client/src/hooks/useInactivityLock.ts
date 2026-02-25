import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { CLIENT_ROUTES } from '../routes';

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function useInactivityLock(): void {
  const navigate = useNavigate();
  const { isAuthenticated, user, isLocked, setLocked } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAtRef = useRef<number | null>(null);

  const shouldMonitor = isAuthenticated && !!user?.hasPin && !isLocked;

  const lock = useCallback(() => {
    setLocked(true);
    navigate(CLIENT_ROUTES.lock, { replace: true });
  }, [setLocked, navigate]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(lock, INACTIVITY_TIMEOUT_MS);
  }, [lock]);

  useEffect(() => {
    if (!shouldMonitor) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'touchmove', 'click'];

    const handleActivity = () => {
      resetTimer();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        if (hiddenAtRef.current && Date.now() - hiddenAtRef.current >= INACTIVITY_TIMEOUT_MS) {
          lock();
        } else {
          resetTimer();
        }
        hiddenAtRef.current = null;
      }
    };

    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Start initial timer
    resetTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [shouldMonitor, resetTimer, lock]);
}
