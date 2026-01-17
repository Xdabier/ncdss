import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, X, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { getApi } from '../../services/api';
import { UserRole } from '@ncdss/shared';

const roleOptions = [
  { value: UserRole.NURSE, label: 'Infirmier(ère)' },
  { value: UserRole.NURSE_SUPERVISOR, label: 'Surveillant(e)' },
  { value: UserRole.DOCTOR, label: 'Médecin' },
  { value: UserRole.ADMIN, label: 'Administrateur' },
];

interface FormData {
  username: string;
  password: string;
  fullName: string;
  role: string;
}

interface FormErrors {
  username?: string;
  password?: string;
  fullName?: string;
  role?: string;
}

export default function UserForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = id && id !== 'new';

  const [formData, setFormData] = useState<FormData>({
    username: '',
    password: '',
    fullName: '',
    role: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [loadingUser, setLoadingUser] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) {
      loadUser();
    }
  }, [id]);

  const loadUser = async () => {
    try {
      const api = await getApi();
      const response = await api.get(`/users/${id}`);
      const user = response.data;
      setFormData({
        username: user.username,
        password: '',
        fullName: user.fullName,
        role: user.role,
      });
    } catch (e) {
      setError('Erreur de chargement');
    } finally {
      setLoadingUser(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Le nom complet est requis';
    }

    if (!formData.username.trim()) {
      newErrors.username = "L'identifiant est requis";
    } else if (formData.username.length < 3) {
      newErrors.username = "L'identifiant doit contenir au moins 3 caractères";
    }

    if (!isEditing && !formData.password) {
      newErrors.password = 'Le mot de passe est requis';
    } else if (!isEditing && formData.password.length < 6) {
      newErrors.password = 'Le mot de passe doit contenir au moins 6 caractères';
    }

    if (!formData.role) {
      newErrors.role = 'Le rôle est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();

      if (isEditing) {
        await api.put(`/users/${id}`, {
          fullName: formData.fullName,
          role: formData.role,
        });
      } else {
        await api.post('/users', formData);
      }

      navigate(-1);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur de sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
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

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              {isEditing ? 'Modifier Utilisateur' : 'Nouvel Utilisateur'}
            </h1>
            <p className="text-gray-600 mt-2">
              {isEditing
                ? "Modifiez les informations de l'utilisateur"
                : 'Créez un nouveau compte utilisateur'}
            </p>
          </div>

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
              <CardTitle>Informations de l'utilisateur</CardTitle>
              <CardDescription>Remplissez tous les champs obligatoires</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="fullName">
                  Nom complet <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                  placeholder="Ex: Marie Dupont"
                  className={errors.fullName ? 'border-red-500' : ''}
                />
                {errors.fullName && <p className="text-sm text-red-600">{errors.fullName}</p>}
              </div>

              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username">
                  Identifiant <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => updateField('username', e.target.value)}
                  placeholder="Ex: mdupont"
                  disabled={isEditing}
                  className={errors.username ? 'border-red-500' : ''}
                />
                {errors.username && <p className="text-sm text-red-600">{errors.username}</p>}
                {isEditing && (
                  <p className="text-sm text-gray-500">L'identifiant ne peut pas être modifié</p>
                )}
              </div>

              {/* Password (only for new users) */}
              {!isEditing && (
                <div className="space-y-2">
                  <Label htmlFor="password">
                    Mot de passe <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    placeholder="Minimum 6 caractères"
                    className={errors.password ? 'border-red-500' : ''}
                  />
                  {errors.password && <p className="text-sm text-red-600">{errors.password}</p>}
                </div>
              )}

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="role">
                  Rôle <span className="text-red-500">*</span>
                </Label>
                <Select value={formData.role} onValueChange={(value) => updateField('role', value)}>
                  <SelectTrigger className={errors.role ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Sélectionner un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.role && <p className="text-sm text-red-600">{errors.role}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="mt-6 flex gap-4 justify-end">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <X className="h-4 w-4 mr-2" />
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
