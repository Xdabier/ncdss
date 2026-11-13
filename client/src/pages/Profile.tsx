import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import {
  AlertTriangle,
  User,
  Key,
  Lock,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { getApi } from '../services/api';
import { API_ROUTES } from '@ncdss/shared';
import { CLIENT_ROUTES } from '../routes';
import { useAuthStore } from '../stores/auth.store';
import { getApiErrorMessage } from '../utils/apiError';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrateur',
  ADMIN: 'Administrateur',
  NURSE_SUPERVISOR: 'Infirmier(ère) Superviseur',
  NURSE: 'Infirmier(ère)',
  DOCTOR: 'Médecin',
};

export default function Profile() {
  const navigate = useNavigate();
  const { user: authUser, updateUser } = useAuthStore();

  // Profile form state
  const [cin, setCin] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // PIN form state
  const [pinValue, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinPassword, setPinPassword] = useState('');
  const [showPinPassword, setShowPinPassword] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [showPinSection, setShowPinSection] = useState(false);
  const pinSectionRef = React.useRef<HTMLDivElement>(null);

  const isFirstTime = !authUser?.profileCompleted;
  const needsPin = authUser?.profileCompleted && !authUser?.hasPin;

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.profile.me);
      const { profile } = response.data;
      if (profile) {
        setCin(profile.cin || '');
        setFirstName(profile.firstName || '');
        setLastName(profile.lastName || '');
        setBirthDate(profile.birthDate || '');
        setAddress(profile.address || '');
      } else if (authUser?.fullName) {
        // Pre-fill first/last name from admin-set fullName for first-time users
        const parts = authUser.fullName.trim().split(/\s+/);
        if (parts.length >= 2) {
          setFirstName(parts[0]);
          setLastName(parts.slice(1).join(' '));
        } else {
          setLastName(parts[0]);
        }
      }
    } catch {
      // Profile may not exist yet, that's fine
    } finally {
      setLoadingProfile(false);
    }
  };

  const validateProfile = (): boolean => {
    const errors: Record<string, string> = {};
    if (!cin.trim()) {
      errors.cin = 'Le CIN est requis';
    } else if (!/^\d{8}$/.test(cin.trim())) {
      errors.cin = 'Le CIN doit contenir exactement 8 chiffres';
    }
    if (!firstName.trim()) errors.firstName = 'Le prénom est requis';
    if (!lastName.trim()) errors.lastName = 'Le nom est requis';
    if (!birthDate.trim()) errors.birthDate = 'La date de naissance est requise';
    if (!address.trim()) errors.address = "L'adresse est requise";

    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      errors.birthDate = 'Format de date invalide';
    }

    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProfileSubmit = async () => {
    setProfileError(null);
    setProfileSuccess(false);

    if (!validateProfile()) return;

    setProfileLoading(true);
    try {
      const api = await getApi();
      const response = await api.put(API_ROUTES.profile.me, {
        cin: cin.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate,
        address: address.trim(),
      });

      // Update auth store with the new user data
      await updateUser(response.data.user);

      setProfileSuccess(true);

      // If first time and no PIN yet, show PIN section instead of redirecting
      if (isFirstTime) {
        if (!response.data.user.hasPin) {
          setShowPinSection(true);
          setTimeout(() => {
            pinSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 300);
        } else {
          setTimeout(() => {
            navigate(CLIENT_ROUTES.dashboard, { replace: true });
          }, 1500);
        }
      }
    } catch (e) {
      const fieldErrors = axios.isAxiosError<{ errors?: Record<string, string> }>(e)
        ? e.response?.data?.errors
        : undefined;
      if (fieldErrors) {
        setProfileErrors(fieldErrors);
      } else {
        setProfileError(getApiErrorMessage(e, 'Erreur de sauvegarde du profil'));
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword) {
      setPasswordError('Le mot de passe actuel est requis');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas');
      return;
    }

    setPasswordLoading(true);
    try {
      const api = await getApi();
      await api.post(API_ROUTES.profile.changePassword, {
        currentPassword,
        newPassword,
      });

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setPasswordError(getApiErrorMessage(e, 'Erreur de changement de mot de passe'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handlePinSubmit = async () => {
    setPinError(null);
    setPinSuccess(false);

    if (!pinValue || !/^\d{4}$/.test(pinValue)) {
      setPinError('Le PIN doit contenir exactement 4 chiffres');
      return;
    }
    if (pinValue !== pinConfirm) {
      setPinError('Les PIN ne correspondent pas');
      return;
    }
    if (!pinPassword) {
      setPinError('Le mot de passe actuel est requis');
      return;
    }

    setPinLoading(true);
    try {
      const api = await getApi();
      const response = await api.post(API_ROUTES.profile.createPin, {
        pin: pinValue,
        currentPassword: pinPassword,
      });

      await updateUser(response.data.user);

      setPinSuccess(true);
      setPinValue('');
      setPinConfirm('');
      setPinPassword('');

      // If this was the first-time flow, redirect to dashboard
      if (isFirstTime || needsPin) {
        setTimeout(() => {
          navigate(CLIENT_ROUTES.dashboard, { replace: true });
        }, 1500);
      }
    } catch (e) {
      setPinError(getApiErrorMessage(e, 'Erreur de création du PIN'));
    } finally {
      setPinLoading(false);
    }
  };

  if (loadingProfile) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Profil Utilisateur</h1>
            <p className="text-gray-600 mt-1">Gérez vos informations personnelles et votre mot de passe</p>
          </div>

          {/* First-time warning banner */}
          {isFirstTime && (
            <Alert className="border-orange-400 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                Veuillez compléter votre profil et créer un PIN de verrouillage avant de continuer.
              </AlertDescription>
            </Alert>
          )}

          {/* PIN required banner (profile complete but no PIN) */}
          {needsPin && !isFirstTime && (
            <Alert className="border-orange-400 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                Veuillez créer un PIN de verrouillage pour sécuriser votre session.
              </AlertDescription>
            </Alert>
          )}

          {/* Read-only user info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5" />
                Informations du Compte
              </CardTitle>
              <CardDescription>Ces informations sont gérées par l'administrateur</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded-lg grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-500">Identifiant</span>
                  <p className="font-medium">{authUser?.username}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Rôle</span>
                  <p className="font-medium">
                    {authUser?.role ? ROLE_LABELS[authUser.role] || authUser.role : '-'}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-gray-500">Nom complet</span>
                  <p className="font-medium">{authUser?.fullName}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Save className="h-5 w-5" />
                Informations Personnelles
              </CardTitle>
              <CardDescription>
                {isFirstTime
                  ? 'Remplissez tous les champs pour activer votre compte'
                  : 'Modifiez vos informations personnelles'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profileSuccess && (
                <Alert className="border-green-500 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Profil enregistré avec succès.
                    {isFirstTime && !showPinSection && ' Redirection vers le tableau de bord...'}
                    {showPinSection && ' Veuillez maintenant créer votre PIN de verrouillage.'}
                  </AlertDescription>
                </Alert>
              )}

              {profileError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{profileError}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">
                    Prénom <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setProfileErrors((prev) => ({ ...prev, firstName: '' }));
                    }}
                    placeholder="Votre prénom"
                    disabled={profileLoading}
                    className={profileErrors.firstName ? 'border-red-500' : ''}
                  />
                  {profileErrors.firstName && (
                    <p className="text-sm text-red-500">{profileErrors.firstName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName">
                    Nom <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      setProfileErrors((prev) => ({ ...prev, lastName: '' }));
                    }}
                    placeholder="Votre nom"
                    disabled={profileLoading}
                    className={profileErrors.lastName ? 'border-red-500' : ''}
                  />
                  {profileErrors.lastName && (
                    <p className="text-sm text-red-500">{profileErrors.lastName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cin">
                    CIN <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="cin"
                    value={cin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setCin(val);
                      setProfileErrors((prev) => ({ ...prev, cin: '' }));
                    }}
                    placeholder="8 chiffres"
                    maxLength={8}
                    inputMode="numeric"
                    disabled={profileLoading}
                    className={profileErrors.cin ? 'border-red-500' : ''}
                  />
                  {profileErrors.cin && (
                    <p className="text-sm text-red-500">{profileErrors.cin}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birthDate">
                    Date de Naissance <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="birthDate"
                    type="date"
                    value={birthDate}
                    onChange={(e) => {
                      setBirthDate(e.target.value);
                      setProfileErrors((prev) => ({ ...prev, birthDate: '' }));
                    }}
                    disabled={profileLoading}
                    className={profileErrors.birthDate ? 'border-red-500' : ''}
                  />
                  {profileErrors.birthDate && (
                    <p className="text-sm text-red-500">{profileErrors.birthDate}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">
                  Adresse <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setProfileErrors((prev) => ({ ...prev, address: '' }));
                  }}
                  placeholder="Votre adresse"
                  disabled={profileLoading}
                  className={profileErrors.address ? 'border-red-500' : ''}
                />
                {profileErrors.address && (
                  <p className="text-sm text-red-500">{profileErrors.address}</p>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleProfileSubmit} disabled={profileLoading}>
                  {profileLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {profileLoading ? 'Enregistrement...' : 'Enregistrer le Profil'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Password change card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Key className="h-5 w-5" />
                Changer le Mot de Passe
              </CardTitle>
              <CardDescription>
                Modifiez votre mot de passe (minimum 6 caractères)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {passwordSuccess && (
                <Alert className="border-green-500 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Mot de passe modifié avec succès.
                  </AlertDescription>
                </Alert>
              )}

              {passwordError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="currentPassword">
                  Mot de Passe Actuel <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Votre mot de passe actuel"
                    disabled={passwordLoading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">
                    Nouveau Mot de Passe <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 caractères"
                      disabled={passwordLoading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      tabIndex={-1}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmNewPassword">
                    Confirmer le Nouveau Mot de Passe <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmNewPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Retapez le mot de passe"
                      disabled={passwordLoading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handlePasswordSubmit}
                  disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                >
                  {passwordLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  {passwordLoading ? 'Modification...' : 'Changer le Mot de Passe'}
                </Button>
              </div>
            </CardContent>
          </Card>
          {/* PIN card - shown when: needsPin, showPinSection (first-time flow), or user wants to change PIN */}
          {(needsPin || showPinSection || authUser?.hasPin) && (
            <div ref={pinSectionRef}>
              <Card className={needsPin || showPinSection ? 'ring-2 ring-blue-400' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Lock className="h-5 w-5" />
                    {authUser?.hasPin ? 'Modifier votre PIN de verrouillage' : 'Créer votre PIN de verrouillage'}
                  </CardTitle>
                  <CardDescription>
                    {authUser?.hasPin
                      ? 'Changez votre PIN à 4 chiffres pour le verrouillage de session'
                      : 'Créez un PIN à 4 chiffres pour verrouiller votre session automatiquement'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pinSuccess && (
                    <Alert className="border-green-500 bg-green-50">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        {authUser?.hasPin ? 'PIN modifié avec succès.' : 'PIN créé avec succès.'}
                        {(needsPin || showPinSection) && ' Redirection vers le tableau de bord...'}
                      </AlertDescription>
                    </Alert>
                  )}

                  {pinError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{pinError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pinValue">
                        Nouveau PIN <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="pinValue"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={pinValue}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setPinValue(val);
                          setPinError(null);
                        }}
                        placeholder="4 chiffres"
                        disabled={pinLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pinConfirm">
                        Confirmer le PIN <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="pinConfirm"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={pinConfirm}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setPinConfirm(val);
                          setPinError(null);
                        }}
                        placeholder="Retapez le PIN"
                        disabled={pinLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pinPassword">
                      Mot de Passe Actuel <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="pinPassword"
                        type={showPinPassword ? 'text' : 'password'}
                        value={pinPassword}
                        onChange={(e) => setPinPassword(e.target.value)}
                        placeholder="Confirmez votre identité"
                        disabled={pinLoading}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPinPassword(!showPinPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        tabIndex={-1}
                      >
                        {showPinPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handlePinSubmit}
                      disabled={pinLoading || !pinValue || !pinConfirm || !pinPassword}
                    >
                      {pinLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Lock className="h-4 w-4 mr-2" />
                      )}
                      {pinLoading
                        ? 'Enregistrement...'
                        : authUser?.hasPin
                          ? 'Modifier le PIN'
                          : 'Créer le PIN'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
