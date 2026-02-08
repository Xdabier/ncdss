import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, CheckCircle2, Info } from 'lucide-react';
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
import { Combobox } from '../../components/ui/Combobox';
import { getApi } from '../../services/api';
import { CLIENT_ROUTES } from '../../routes';
import {
  Sex,
  IdType,
  API_ROUTES,
  calculateAge,
  formatAge,
  LookupPatientResponse,
} from '@ncdss/shared';
import { getCountryList, DEFAULT_NATIONALITY } from '../../utils/countries';

interface FormData {
  idType: 'CIN' | 'PASSPORT';
  nationalId: string;
  nationality: string;
  fullName: string;
  dateOfBirth: string;
  sex: string;
  phone: string;
  address: string;
}

interface FormErrors {
  nationalId?: string;
  fullName?: string;
  dateOfBirth?: string;
  sex?: string;
}

type LookupState = 'idle' | 'searching' | 'found' | 'not_found' | 'error';

export default function PatientRegistration(): React.ReactElement {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [returningPatientIdentityId, setReturningPatientIdentityId] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    idType: 'CIN',
    nationalId: '',
    nationality: DEFAULT_NATIONALITY,
    fullName: '',
    dateOfBirth: '',
    sex: '',
    phone: '',
    address: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countryOptions = React.useMemo(() => {
    return getCountryList().map((c) => ({ value: c.code, label: c.name }));
  }, []);

  // Computed age
  const computedAge = formData.dateOfBirth ? calculateAge(formData.dateOfBirth) : null;
  const computedAgeDisplay = formData.dateOfBirth ? formatAge(formData.dateOfBirth) : '';
  const isTunisianMinor = formData.nationality === 'TN' && computedAge !== null && computedAge < 18;

  const updateField = useCallback((field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  // When nationality changes to non-TN, force idType to PASSPORT
  useEffect(() => {
    if (formData.nationality !== 'TN') {
      setFormData((prev) => ({ ...prev, idType: 'PASSPORT' }));
    }
  }, [formData.nationality]);

  // Debounced lookup
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const { nationalId, idType } = formData;
    const trimmed = nationalId.trim();

    if (!trimmed) {
      setLookupState('idle');
      setReturningPatientIdentityId(null);
      return;
    }

    const isCinValid = idType === 'CIN' && /^\d{8}$/.test(trimmed);
    const isPassportValid = idType === 'PASSPORT' && trimmed.length >= 5;

    if (!isCinValid && !isPassportValid) {
      setLookupState('idle');
      setReturningPatientIdentityId(null);
      return;
    }

    setLookupState('searching');

    debounceRef.current = setTimeout(async () => {
      try {
        const api = await getApi();
        const resp = await api.get<LookupPatientResponse>(API_ROUTES.patients.lookup, {
          params: { idNumber: trimmed, idType },
        });
        const { found, identity } = resp.data;

        if (found && identity) {
          setLookupState('found');
          setReturningPatientIdentityId(identity.id);
          setFormData((prev) => ({
            ...prev,
            fullName: identity.fullName || prev.fullName,
            dateOfBirth: identity.dateOfBirth || prev.dateOfBirth,
            sex: identity.sex || prev.sex,
            nationality: identity.nationality || prev.nationality,
            phone: identity.phone || prev.phone,
            address: identity.address || prev.address,
          }));
        } else {
          setLookupState('not_found');
          setReturningPatientIdentityId(null);
        }
      } catch {
        setLookupState('error');
        setReturningPatientIdentityId(null);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [formData.nationalId, formData.idType]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    const trimmedId = formData.nationalId.trim();
    const isAdult = computedAge !== null && computedAge >= 18;
    const isTN = formData.nationality === 'TN';

    // nationalId validation
    const idRequired = (!isTN || isAdult) && !isTunisianMinor;
    if (idRequired && !trimmedId) {
      newErrors.nationalId = "L'identifiant est requis";
    } else if (trimmedId) {
      if (formData.idType === 'CIN' && !/^\d{8}$/.test(trimmedId)) {
        newErrors.nationalId = 'Le CIN doit contenir exactement 8 chiffres';
      } else if (formData.idType === 'PASSPORT' && !/^[a-zA-Z0-9]{5,20}$/.test(trimmedId)) {
        newErrors.nationalId = 'Le passeport doit contenir 5 à 20 caractères alphanumériques';
      }
    }

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Le nom complet est requis';
    }

    if (!formData.dateOfBirth) {
      newErrors.dateOfBirth = 'La date de naissance est requise';
    } else {
      const dob = new Date(formData.dateOfBirth);
      if (isNaN(dob.getTime())) {
        newErrors.dateOfBirth = 'Date invalide';
      } else if (dob > new Date()) {
        newErrors.dateOfBirth = 'La date ne peut pas être dans le futur';
      } else if (computedAge !== null && computedAge > 150) {
        newErrors.dateOfBirth = 'Age invalide (maximum 150 ans)';
      }
    }

    if (!formData.sex) {
      newErrors.sex = 'Le sexe est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      // Auto-generate ID for Tunisian minors without an ID
      let finalNationalId = formData.nationalId.trim();
      let finalIdType: string = formData.idType;
      if (!finalNationalId && isTunisianMinor) {
        finalNationalId = `TN-MINEUR-${Date.now()}`;
        finalIdType = 'CIN';
      }

      const api = await getApi();
      await api.post(API_ROUTES.patients.create, {
        fullName: formData.fullName.trim(),
        dateOfBirth: formData.dateOfBirth,
        sex: formData.sex,
        nationalId: finalNationalId || undefined,
        idType: finalNationalId ? finalIdType : undefined,
        nationality: formData.nationality,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        patientIdentityId: returningPatientIdentityId || undefined,
      });

      navigate(CLIENT_ROUTES.nurse.inscription.home);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      if (err.response?.status === 409) {
        setError('Un patient avec cet identifiant existe déjà');
      } else {
        setError(err.response?.data?.error || "Erreur d'enregistrement");
      }
    } finally {
      setLoading(false);
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
          {/* Section 1: Identification */}
          <Card>
            <CardHeader>
              <CardTitle>Identification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="idType">Type de pièce</Label>
                  <Select
                    value={formData.idType}
                    onValueChange={(val) => updateField('idType', val)}
                    disabled={formData.nationality !== 'TN'}
                  >
                    <SelectTrigger id="idType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IdType.CIN}>CIN</SelectItem>
                      <SelectItem value={IdType.PASSPORT}>Passeport</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="nationalId">
                    Numéro d'identifiant
                    {!(isTunisianMinor && !formData.nationalId) && (
                      <span className="text-red-500"> *</span>
                    )}
                  </Label>
                  <Input
                    id="nationalId"
                    value={formData.nationalId}
                    onChange={(e) => updateField('nationalId', e.target.value)}
                    placeholder={formData.idType === 'CIN' ? 'Ex: 12345678' : 'Ex: AB123456'}
                    className={errors.nationalId ? 'border-red-500' : ''}
                  />
                  {errors.nationalId && (
                    <span className="text-sm text-red-500">{errors.nationalId}</span>
                  )}
                  {isTunisianMinor && !formData.nationalId && (
                    <span className="text-sm text-muted-foreground">
                      Optionnel pour les mineurs tunisiens
                    </span>
                  )}
                </div>
              </div>

              {/* Lookup status indicator */}
              {lookupState === 'searching' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recherche en cours...
                </div>
              )}
              {lookupState === 'found' && (
                <Alert className="border-green-200 bg-green-50 text-green-800">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    Patient existant retrouvé - Les informations ont été pré-remplies
                  </AlertDescription>
                </Alert>
              )}
              {lookupState === 'not_found' && (
                <Alert className="border-blue-200 bg-blue-50 text-blue-800">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription>Nouveau patient</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Nationalité */}
          <Card>
            <CardHeader>
              <CardTitle>Nationalité</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <Label htmlFor="nationality">Nationalité</Label>
                <Combobox
                  options={countryOptions}
                  value={formData.nationality}
                  onChange={(val) => updateField('nationality', val)}
                  placeholder="Sélectionner un pays..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Identité */}
          <Card>
            <CardHeader>
              <CardTitle>Identité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="fullName">
                  Nom complet <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                  placeholder="Ex: Mohamed Ben Ali"
                  className={errors.fullName ? 'border-red-500' : ''}
                />
                {errors.fullName && (
                  <span className="text-sm text-red-500">{errors.fullName}</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="dateOfBirth">
                    Date de naissance <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => updateField('dateOfBirth', e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${errors.dateOfBirth ? 'border-red-500' : ''}`}
                  />
                  {errors.dateOfBirth && (
                    <span className="text-sm text-red-500">{errors.dateOfBirth}</span>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label>Age</Label>
                  <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm">
                    {computedAgeDisplay || '—'}
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sex">
                  Sexe <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.sex}
                  onValueChange={(val) => updateField('sex', val)}
                >
                  <SelectTrigger id="sex" className={errors.sex ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Sex.MALE}>Homme</SelectItem>
                    <SelectItem value={Sex.FEMALE}>Femme</SelectItem>
                  </SelectContent>
                </Select>
                {errors.sex && (
                  <span className="text-sm text-red-500">{errors.sex}</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="Ex: +216 XX XXX XXX"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder="Ville, délégation"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit buttons */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={loading} className="min-w-[150px]">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Enregistrer
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
