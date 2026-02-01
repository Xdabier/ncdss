import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { getApi } from '../../services/api';
import { CLIENT_ROUTES } from '../../routes';
import { Sex, API_ROUTES } from '@ncdss/shared';

interface FormData {
  fullName: string;
  age: string;
  sex: string;
  nationalId: string;
  phone: string;
  address: string;
}

interface FormErrors {
  fullName?: string;
  age?: string;
  sex?: string;
}

export default function PatientRegistration() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    age: '',
    sex: '',
    nationalId: '',
    phone: '',
    address: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Le nom est requis';
    }

    const age = parseInt(formData.age);
    if (!formData.age || isNaN(age) || age < 0 || age > 150) {
      newErrors.age = 'Age invalide (0-150)';
    }

    if (!formData.sex) {
      newErrors.sex = 'Le sexe est requis';
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
      await api.post(API_ROUTES.patients.create, {
        fullName: formData.fullName,
        age: parseInt(formData.age),
        sex: formData.sex,
        nationalId: formData.nationalId || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
      });

      navigate(CLIENT_ROUTES.nurse.inscription.home);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur d\'enregistrement');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Nouveau Patient</h1>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations Personnelles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="fullName">Nom complet <span className="text-red-500">*</span></Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={e => updateField('fullName', e.target.value)}
                  placeholder="Ex: Mohamed Ben Ali"
                  className={errors.fullName ? "border-red-500" : ""}
                />
                {errors.fullName && <span className="text-sm text-red-500">{errors.fullName}</span>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="age">Age <span className="text-red-500">*</span></Label>
                  <Input
                    id="age"
                    type="number"
                    value={formData.age}
                    onChange={e => updateField('age', e.target.value)}
                    placeholder="Ex: 45"
                    className={errors.age ? "border-red-500" : ""}
                  />
                  {errors.age && <span className="text-sm text-red-500">{errors.age}</span>}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="sex">Sexe <span className="text-red-500">*</span></Label>
                  <Select
                    value={formData.sex}
                    onValueChange={val => updateField('sex', val)}
                  >
                    <SelectTrigger id="sex" className={errors.sex ? "border-red-500" : ""}>
                      <SelectValue placeholder="Selectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={Sex.MALE}>Homme</SelectItem>
                      <SelectItem value={Sex.FEMALE}>Femme</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.sex && <span className="text-sm text-red-500">{errors.sex}</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nationalId">CIN / Passeport</Label>
                  <Input
                    id="nationalId"
                    value={formData.nationalId}
                    onChange={e => updateField('nationalId', e.target.value)}
                    placeholder="Ex: 12345678"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phone">Telephone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    placeholder="Ex: +216 XX XXX XXX"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="address">Adresse</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={e => updateField('address', e.target.value)}
                  placeholder="Ville, delegation"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="min-w-[150px]">
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
