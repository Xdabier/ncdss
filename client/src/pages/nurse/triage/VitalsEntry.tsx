import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Activity } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { getApi } from '../../../services/api';
import { CLIENT_ROUTES } from '../../../routes';
import { Patient, Sex, API_ROUTES } from '@ncdss/shared';

interface VitalsFormData {
  temperature: string;
  heartRate: string;
  respiratoryRate: string;
  systolicBP: string;
  diastolicBP: string;
  oxygenSaturation: string;
  painLevel: string;
  glucoseLevel: string;
  gcsEye: number;
  gcsVerbal: number;
  gcsMotor: number;
}

export default function VitalsEntry() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<VitalsFormData>({
    temperature: '',
    heartRate: '',
    respiratoryRate: '',
    systolicBP: '',
    diastolicBP: '',
    oxygenSaturation: '',
    painLevel: '',
    glucoseLevel: '',
    gcsEye: 4,
    gcsVerbal: 5,
    gcsMotor: 6,
  });

  // Load patient data
  useEffect(() => {
    const loadPatient = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const api = await getApi();
        const response = await api.get(API_ROUTES.patients.byId(id));
        const patientData: Patient = response.data;
        setPatient(patientData);

        // Pre-fill existing vitals if any
        setFormData({
          temperature: patientData.temperature?.toString() || '',
          heartRate: patientData.heartRate?.toString() || '',
          respiratoryRate: patientData.respiratoryRate?.toString() || '',
          systolicBP: patientData.systolicBP?.toString() || '',
          diastolicBP: patientData.diastolicBP?.toString() || '',
          oxygenSaturation: patientData.oxygenSaturation?.toString() || '',
          painLevel: patientData.painLevel?.toString() || '',
          glucoseLevel: patientData.glucoseLevel?.toString() || '',
          gcsEye: patientData.gcsEye || 4,
          gcsVerbal: patientData.gcsVerbal || 5,
          gcsMotor: patientData.gcsMotor || 6,
        });
      } catch (e: any) {
        setError(e.response?.data?.error || 'Erreur de chargement du patient');
      } finally {
        setLoading(false);
      }
    };

    loadPatient();
  }, [id]);

  // Calculate GCS total
  const gcsTotal = useMemo(() => {
    return formData.gcsEye + formData.gcsVerbal + formData.gcsMotor;
  }, [formData.gcsEye, formData.gcsVerbal, formData.gcsMotor]);

  const updateField = (field: keyof VitalsFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!id) return;

    setSaving(true);
    setError(null);

    try {
      const api = await getApi();

      // Build request with only non-empty values
      const vitalsData: any = {
        gcsEye: formData.gcsEye,
        gcsVerbal: formData.gcsVerbal,
        gcsMotor: formData.gcsMotor,
      };

      if (formData.temperature) vitalsData.temperature = parseFloat(formData.temperature);
      if (formData.heartRate) vitalsData.heartRate = parseInt(formData.heartRate);
      if (formData.respiratoryRate) vitalsData.respiratoryRate = parseInt(formData.respiratoryRate);
      if (formData.systolicBP) vitalsData.systolicBP = parseInt(formData.systolicBP);
      if (formData.diastolicBP) vitalsData.diastolicBP = parseInt(formData.diastolicBP);
      if (formData.oxygenSaturation) vitalsData.oxygenSaturation = parseFloat(formData.oxygenSaturation);
      if (formData.painLevel) vitalsData.painLevel = parseInt(formData.painLevel);
      if (formData.glucoseLevel) vitalsData.glucoseLevel = parseFloat(formData.glucoseLevel);

      await api.put(API_ROUTES.patients.vitals(id), vitalsData);

      // Navigate to ABCDE assessment
      navigate(CLIENT_ROUTES.nurse.triage.abcde(id!));
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur d\'enregistrement des constantes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600">Chargement...</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            <Alert variant="destructive">
              <AlertDescription>Patient non trouvé</AlertDescription>
            </Alert>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Saisie des Constantes</h1>
            <p className="text-sm text-gray-600">Étape 1/6 - Constantes vitales</p>
          </div>
        </div>

        {/* Patient Header */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Patient</p>
                <p className="font-semibold">{patient.fullName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Âge / Sexe</p>
                <p className="font-semibold">
                  {patient.age} ans / {patient.sex === Sex.MALE ? 'H' : 'F'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-600">Motif</p>
                <p className="font-semibold">{patient.chiefComplaint || 'Non spécifié'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Vitals Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Constantes Vitales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Temperature */}
              <div className="grid gap-2">
                <Label htmlFor="temperature">Température (°C)</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  value={formData.temperature}
                  onChange={e => updateField('temperature', e.target.value)}
                  placeholder="36.5"
                />
              </div>

              {/* Heart Rate */}
              <div className="grid gap-2">
                <Label htmlFor="heartRate">Fréquence cardiaque (bpm)</Label>
                <Input
                  id="heartRate"
                  type="number"
                  value={formData.heartRate}
                  onChange={e => updateField('heartRate', e.target.value)}
                  placeholder="75"
                />
              </div>

              {/* Respiratory Rate */}
              <div className="grid gap-2">
                <Label htmlFor="respiratoryRate">Fréquence respiratoire (/min)</Label>
                <Input
                  id="respiratoryRate"
                  type="number"
                  value={formData.respiratoryRate}
                  onChange={e => updateField('respiratoryRate', e.target.value)}
                  placeholder="16"
                />
              </div>

              {/* Oxygen Saturation */}
              <div className="grid gap-2">
                <Label htmlFor="oxygenSaturation">Saturation O₂ (%)</Label>
                <Input
                  id="oxygenSaturation"
                  type="number"
                  step="0.1"
                  value={formData.oxygenSaturation}
                  onChange={e => updateField('oxygenSaturation', e.target.value)}
                  placeholder="98"
                />
              </div>

              {/* Systolic BP */}
              <div className="grid gap-2">
                <Label htmlFor="systolicBP">Pression systolique (mmHg)</Label>
                <Input
                  id="systolicBP"
                  type="number"
                  value={formData.systolicBP}
                  onChange={e => updateField('systolicBP', e.target.value)}
                  placeholder="120"
                />
              </div>

              {/* Diastolic BP */}
              <div className="grid gap-2">
                <Label htmlFor="diastolicBP">Pression diastolique (mmHg)</Label>
                <Input
                  id="diastolicBP"
                  type="number"
                  value={formData.diastolicBP}
                  onChange={e => updateField('diastolicBP', e.target.value)}
                  placeholder="80"
                />
              </div>

              {/* Pain Level */}
              <div className="grid gap-2">
                <Label htmlFor="painLevel">Niveau de douleur (0-10)</Label>
                <Input
                  id="painLevel"
                  type="number"
                  min="0"
                  max="10"
                  value={formData.painLevel}
                  onChange={e => updateField('painLevel', e.target.value)}
                  placeholder="0"
                />
              </div>

              {/* Glucose Level */}
              <div className="grid gap-2">
                <Label htmlFor="glucoseLevel">Glycémie (mg/dL)</Label>
                <Input
                  id="glucoseLevel"
                  type="number"
                  step="0.1"
                  value={formData.glucoseLevel}
                  onChange={e => updateField('glucoseLevel', e.target.value)}
                  placeholder="100"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GCS Section */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Score de Glasgow (GCS)</CardTitle>
              <Badge
                variant={gcsTotal <= 8 ? "destructive" : gcsTotal <= 12 ? "default" : "secondary"}
                className="text-lg px-4 py-1"
              >
                Total: {gcsTotal}/15
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Eye Response */}
              <div className="grid gap-2">
                <Label htmlFor="gcsEye">Ouverture des yeux (1-4)</Label>
                <select
                  id="gcsEye"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.gcsEye}
                  onChange={e => updateField('gcsEye', parseInt(e.target.value))}
                >
                  <option value={4}>4 - Spontanée</option>
                  <option value={3}>3 - À la voix</option>
                  <option value={2}>2 - À la douleur</option>
                  <option value={1}>1 - Aucune</option>
                </select>
              </div>

              {/* Verbal Response */}
              <div className="grid gap-2">
                <Label htmlFor="gcsVerbal">Réponse verbale (1-5)</Label>
                <select
                  id="gcsVerbal"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.gcsVerbal}
                  onChange={e => updateField('gcsVerbal', parseInt(e.target.value))}
                >
                  <option value={5}>5 - Orientée</option>
                  <option value={4}>4 - Confuse</option>
                  <option value={3}>3 - Mots inappropriés</option>
                  <option value={2}>2 - Sons incompréhensibles</option>
                  <option value={1}>1 - Aucune</option>
                </select>
              </div>

              {/* Motor Response */}
              <div className="grid gap-2">
                <Label htmlFor="gcsMotor">Réponse motrice (1-6)</Label>
                <select
                  id="gcsMotor"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.gcsMotor}
                  onChange={e => updateField('gcsMotor', parseInt(e.target.value))}
                >
                  <option value={6}>6 - Sur commande</option>
                  <option value={5}>5 - Localisée</option>
                  <option value={4}>4 - Évitement</option>
                  <option value={3}>3 - Flexion anormale</option>
                  <option value={2}>2 - Extension</option>
                  <option value={1}>1 - Aucune</option>
                </select>
              </div>
            </div>

            {/* GCS Interpretation */}
            <div className="mt-4 p-4 rounded-lg bg-gray-50">
              <p className="text-sm font-medium mb-2">Interprétation:</p>
              <p className="text-sm text-gray-700">
                {gcsTotal <= 8 && "GCS ≤ 8: Coma sévère - Intubation requise"}
                {gcsTotal > 8 && gcsTotal <= 12 && "GCS 9-12: Coma modéré - Surveillance étroite"}
                {gcsTotal > 12 && "GCS 13-15: Conscience normale à légèrement altérée"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate(-1)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="min-w-[150px]">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Enregistrement...' : 'Enregistrer et Continuer'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
