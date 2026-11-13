import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { AlertCircle, Key, X, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { getApi } from '../../services/api';
import { User, API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';
import { getApiErrorMessage } from '../../utils/apiError';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [user, setUser] = useState<User | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.users.byId(id!));
      setUser(response.data);
    } catch {
      setError("Erreur de chargement de l'utilisateur");
    } finally {
      setLoadingUser(false);
    }
  }, [id]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleSubmit = async () => {
    setError(null);

    if (!password) {
      setError('Le mot de passe est requis');
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);

    try {
      const api = await getApi();
      await api.post(API_ROUTES.users.resetPassword(id!), { password });
      setSuccess(true);
      setTimeout(() => {
        navigate(CLIENT_ROUTES.admin.users);
      }, 2000);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Erreur de réinitialisation'));
    } finally {
      setLoading(false);
    }
  };

  if (loadingUser) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-500">Chargement...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Utilisateur non trouvé</AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Réinitialiser le Mot de Passe</h1>
            <p className="text-gray-600 mt-2">
              Définir un nouveau mot de passe pour <strong>{user.fullName}</strong>
            </p>
          </div>

          {/* Success Alert */}
          {success && (
            <Alert className="mb-6 border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Mot de passe réinitialisé avec succès. Redirection...
              </AlertDescription>
            </Alert>
          )}

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Nouveau Mot de Passe
              </CardTitle>
              <CardDescription>
                Entrez un nouveau mot de passe sécurisé (minimum 6 caractères)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* User Info */}
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Utilisateur:</span>
                  <span className="font-medium">{user.fullName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Identifiant:</span>
                  <span className="font-medium">{user.username}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Rôle:</span>
                  <span className="font-medium">{user.role}</span>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">
                  Nouveau Mot de Passe <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 caractères"
                    disabled={loading || success}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  Confirmer le Mot de Passe <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Retapez le mot de passe"
                    disabled={loading || success}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="mt-6 flex gap-4 justify-end">
            <Button
              variant="outline"
              onClick={() => navigate(CLIENT_ROUTES.admin.users)}
              disabled={loading || success}
            >
              <X className="h-4 w-4 mr-2" />
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || success || !password || !confirmPassword}
            >
              <Key className="h-4 w-4 mr-2" />
              {loading ? 'Réinitialisation...' : 'Réinitialiser'}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
