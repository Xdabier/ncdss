import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Lock, LogOut, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { getApi } from '../services/api';
import { API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../routes';
import { useAuthStore } from '../stores/auth.store';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrateur',
  ADMIN: 'Administrateur',
  NURSE_SUPERVISOR: 'Infirmier(ère) Superviseur',
  NURSE: 'Infirmier(ère)',
  DOCTOR: 'Médecin',
};

const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;

export default function LockScreen() {
  const navigate = useNavigate();
  const { isAuthenticated, isLocked, user, setLocked, clearAuth } = useAuthStore();

  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleVerify = useCallback(async (pin: string) => {
    if (cooldownRemaining > 0) return;

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.post(API_ROUTES.profile.verifyPin, { pin });

      setFailedAttempts(0);
      await setLocked(false);
      navigate(CLIENT_ROUTES.dashboard, { replace: true });
    } catch {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      setDigits(['', '', '', '']);
      inputRefs.current[0]?.focus();

      if (newAttempts >= MAX_ATTEMPTS) {
        setCooldownRemaining(COOLDOWN_SECONDS);
        setError(`Trop de tentatives. Réessayez dans ${COOLDOWN_SECONDS} secondes.`);
        setFailedAttempts(0);
      } else {
        setError(`PIN incorrect (${MAX_ATTEMPTS - newAttempts} tentative(s) restante(s))`);
      }
    } finally {
      setLoading(false);
    }
  }, [cooldownRemaining, failedAttempts, setLocked, navigate]);

  const handleDigitChange = useCallback((index: number, value: string) => {
    if (cooldownRemaining > 0) return;

    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);

    setDigits((prev) => {
      const newDigits = [...prev];
      newDigits[index] = digit;

      // Auto-advance
      if (digit && index < 3) {
        setTimeout(() => inputRefs.current[index + 1]?.focus(), 0);
      }

      // Auto-submit when 4th digit entered
      if (digit && index === 3) {
        const pin = newDigits.join('');
        if (pin.length === 4) {
          setTimeout(() => handleVerify(pin), 50);
        }
      }

      return newDigits;
    });

    setError(null);
  }, [cooldownRemaining, handleVerify]);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setDigits((prev) => {
        const newDigits = [...prev];
        newDigits[index - 1] = '';
        return newDigits;
      });
    }
  }, [digits]);

  const handleUnlock = () => {
    const pin = digits.join('');
    if (pin.length === 4) {
      handleVerify(pin);
    }
  };

  const handleSwitchUser = async () => {
    await clearAuth();
    navigate(CLIENT_ROUTES.login, { replace: true });
  };

  // Guards
  if (!isAuthenticated) {
    return <Navigate to={CLIENT_ROUTES.login} replace />;
  }

  if (isAuthenticated && !isLocked) {
    return <Navigate to={CLIENT_ROUTES.dashboard} replace />;
  }

  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <Lock className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-xl">Session verrouillée</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* User info */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-bold">
              {initials}
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-900">{user?.fullName}</p>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {user?.role ? ROLE_LABELS[user.role] || user.role : ''}
              </span>
            </div>
          </div>

          {/* PIN input */}
          <div>
            <p className="text-sm text-center text-gray-500 mb-3">Entrez votre PIN pour déverrouiller</p>
            <div className="flex justify-center gap-3">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el; }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={loading || cooldownRemaining > 0}
                  className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none disabled:opacity-50 disabled:bg-gray-50"
                />
              ))}
            </div>
          </div>

          {/* Error / Cooldown */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {cooldownRemaining > 0
                  ? `Trop de tentatives. Réessayez dans ${cooldownRemaining}s.`
                  : error}
              </AlertDescription>
            </Alert>
          )}

          {/* Unlock button */}
          <Button
            className="w-full"
            onClick={handleUnlock}
            disabled={loading || digits.join('').length !== 4 || cooldownRemaining > 0}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Vérification...' : 'Déverrouiller'}
          </Button>

          {/* Separator */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-400">ou</span>
            </div>
          </div>

          {/* Switch user */}
          <Button
            variant="ghost"
            className="w-full text-gray-500 hover:text-gray-700"
            onClick={handleSwitchUser}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Changer d'utilisateur
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
