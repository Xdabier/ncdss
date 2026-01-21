import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Save, ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { getApi } from '../../services/api';
import { Sex } from '@ncdss/shared';
import { cn } from '../../lib/utils';

interface FormData {
  fullName: string;
  age: string;
  sex: string;
  nationalId: string;
  phone: string;
  address: string;
  allergies: string;
  chronicConditions: string[];
  currentMedications: string[];
  chiefComplaint: string;
  symptomOnset: string;
}

interface FormErrors {
  fullName?: string;
  age?: string;
  sex?: string;
}

const chronicConditionOptions = [
  'Diabète', 'Hypertension', 'Asthme', 'BPCO', 'Insuffisance cardiaque',
  'Insuffisance rénale', 'AVC', 'Epilepsie', 'Cancer', 'VIH/SIDA'
];

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
    allergies: '',
    chronicConditions: [],
    currentMedications: [],
    chiefComplaint: '',
    symptomOnset: ''
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [newMedication, setNewMedication] = useState('');

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Le nom est requis';
    }
    
    const age = parseInt(formData.age);
    if (!formData.age || isNaN(age) || age < 0 || age > 150) {
      newErrors.age = 'Âge invalide (0-150)';
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
      await api.post('/patients', {
        ...formData,
        age: parseInt(formData.age),
        chronicConditions: formData.chronicConditions,
        currentMedications: formData.currentMedications
      });
      
      navigate(`/nurse/inscription`);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur d\'enregistrement');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const toggleCondition = (condition: string) => {
    const current = formData.chronicConditions;
    if (current.includes(condition)) {
      updateField('chronicConditions', current.filter(c => c !== condition));
    } else {
      updateField('chronicConditions', [...current, condition]);
    }
  };

  const addMedication = () => {
    if (newMedication.trim()) {
      updateField('currentMedications', [...formData.currentMedications, newMedication.trim()]);
      setNewMedication('');
    }
  };

  const removeMedication = (index: number) => {
    updateField('currentMedications', formData.currentMedications.filter((_, i) => i !== index));
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
          {/* Demographics Section */}
          <Card>
            <CardHeader>
              <CardTitle>👤 Informations Personnelles</CardTitle>
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
                  <Label htmlFor="age">Âge <span className="text-red-500">*</span></Label>
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
                      <SelectValue placeholder="Sélectionner" />
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
                  <Label htmlFor="phone">Téléphone</Label>
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
                  placeholder="Ville, délégation"
                />
              </div>
            </CardContent>
          </Card>

          {/* Medical History Section */}
          <Card>
            <CardHeader>
              <CardTitle>📋 Antécédents Médicaux</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="allergies">Allergies connues</Label>
                <textarea
                  id="allergies"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.allergies}
                  onChange={e => updateField('allergies', e.target.value)}
                  placeholder="Ex: Pénicilline, Aspirine, Latex..."
                  rows={2}
                />
              </div>

              <div className="grid gap-2">
                <Label>Maladies chroniques</Label>
                <div className="flex flex-wrap gap-2">
                  {chronicConditionOptions.map(condition => (
                    <Badge
                      key={condition}
                      variant={formData.chronicConditions.includes(condition) ? "default" : "outline"}
                      className="cursor-pointer hover:bg-primary/90"
                      onClick={() => toggleCondition(condition)}
                    >
                      {condition}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Médicaments en cours</Label>
                <div className="flex gap-2">
                  <Input
                    value={newMedication}
                    onChange={e => setNewMedication(e.target.value)}
                    placeholder="Nom du médicament"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addMedication();
                      }
                    }}
                  />
                  <Button type="button" onClick={addMedication} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.currentMedications.map((med, index) => (
                    <Badge key={index} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1">
                      {med}
                      <button
                        onClick={() => removeMedication(index)}
                        className="ml-1 rounded-full p-0.5 hover:bg-gray-200 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Chief Complaint Section */}
          <Card>
            <CardHeader>
              <CardTitle>🩺 Motif de Consultation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="chiefComplaint">Motif principal</Label>
                <textarea
                  id="chiefComplaint"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.chiefComplaint}
                  onChange={e => updateField('chiefComplaint', e.target.value)}
                  placeholder="Ex: Douleur thoracique, difficulté à respirer..."
                  rows={3}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="symptomOnset">Début des symptômes</Label>
                <Input
                  id="symptomOnset"
                  value={formData.symptomOnset}
                  onChange={e => updateField('symptomOnset', e.target.value)}
                  placeholder="Ex: Depuis ce matin, il y a 2 jours..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
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
