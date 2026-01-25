import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Activity, AlertTriangle, TrendingUp, TrendingDown, Minus, CheckCircle } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { getApi } from '../../../services/api';
import { Patient, Sex } from '@ncdss/shared';

interface PreviousScores {
  newsScore: number | null;
  gcsScore: number | null;
  qsofaScore: number | null;
}

interface ScoreChange {
  name: string;
  previous: number | null;
  current: number | null;
  change: number;
  isWorse: boolean; // For NEWS/qSOFA higher is worse, for GCS lower is worse
}

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

// ESI color mapping
const esiColors: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-black',
  4: 'bg-green-500 text-white',
  5: 'bg-blue-500 text-white',
};

export default function VitalsUpdate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [previousScores, setPreviousScores] = useState<PreviousScores | null>(null);
  const [scoreChanges, setScoreChanges] = useState<ScoreChange[]>([]);

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
        const response = await api.get(`/patients/${id}`);
        const patientData: Patient = response.data;
        setPatient(patientData);

        // Store previous scores for comparison after update
        setPreviousScores({
          newsScore: patientData.newsScore ?? null,
          gcsScore: patientData.gcsScore ?? null,
          qsofaScore: patientData.qsofaScore ?? null,
        });

        // Pre-fill existing vitals
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
      } catch (e: unknown) {
        const error = e as { response?: { data?: { error?: string } } };
        setError(error.response?.data?.error || 'Erreur de chargement du patient');
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

  const updateField = (field: keyof VitalsFormData, value: string | number): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setShowComparison(false);
  };

  // Calculate score changes for display
  const calculateScoreChanges = (newPatient: Patient): ScoreChange[] => {
    const changes: ScoreChange[] = [];

    // NEWS: higher is worse
    const newNews = newPatient.newsScore ?? null;
    const prevNews = previousScores?.newsScore ?? null;
    if (newNews !== null || prevNews !== null) {
      const change = (newNews ?? 0) - (prevNews ?? 0);
      changes.push({
        name: 'NEWS',
        previous: prevNews,
        current: newNews,
        change,
        isWorse: change > 0,
      });
    }

    // GCS: lower is worse
    const newGcs = newPatient.gcsScore ?? null;
    const prevGcs = previousScores?.gcsScore ?? null;
    if (newGcs !== null || prevGcs !== null) {
      const change = (newGcs ?? 15) - (prevGcs ?? 15);
      changes.push({
        name: 'GCS',
        previous: prevGcs,
        current: newGcs,
        change,
        isWorse: change < 0,
      });
    }

    // qSOFA: higher is worse
    const newQsofa = newPatient.qsofaScore ?? null;
    const prevQsofa = previousScores?.qsofaScore ?? null;
    if (newQsofa !== null || prevQsofa !== null) {
      const change = (newQsofa ?? 0) - (prevQsofa ?? 0);
      changes.push({
        name: 'qSOFA',
        previous: prevQsofa,
        current: newQsofa,
        change,
        isWorse: change > 0,
      });
    }

    return changes;
  };

  // Check if there's significant deterioration
  const hasSignificantDeterioration = (): boolean => {
    const newsChange = scoreChanges.find(s => s.name === 'NEWS');
    if (newsChange) {
      // NEWS increased by 3+ or now >= 7
      if (newsChange.change >= 3 || (newsChange.current ?? 0) >= 7) {
        return true;
      }
    }
    const gcsChange = scoreChanges.find(s => s.name === 'GCS');
    if (gcsChange && gcsChange.change <= -3) {
      return true;
    }
    const qsofaChange = scoreChanges.find(s => s.name === 'qSOFA');
    if (qsofaChange && (qsofaChange.current ?? 0) >= 2) {
      return true;
    }
    return false;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!id) return;

    setSaving(true);
    setError(null);
    setShowComparison(false);

    try {
      const api = await getApi();

      // Build request with only non-empty values
      const vitalsData: Record<string, number> = {
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

      // PUT to update vitals (recalculates scores on server)
      const response = await api.put(`/patients/${id}/vitals`, vitalsData);

      // Update patient with response data
      const updatedPatient = response.data as Patient;
      setPatient(updatedPatient);

      // Calculate and show score changes
      const changes = calculateScoreChanges(updatedPatient);
      setScoreChanges(changes);
      setShowComparison(true);

      // Update previous scores for future comparisons
      setPreviousScores({
        newsScore: updatedPatient.newsScore ?? null,
        gcsScore: updatedPatient.gcsScore ?? null,
        qsofaScore: updatedPatient.qsofaScore ?? null,
      });
    } catch (e: unknown) {
      const error = e as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Erreur d\'enregistrement des constantes');
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
              <AlertTriangle className="h-4 w-4" />
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
          <Button variant="ghost" size="icon" onClick={() => navigate(`/nurse/treatment/${id}/care`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Mise à Jour des Constantes</h1>
            <p className="text-sm text-gray-600">Soins - Actualisation des constantes vitales</p>
          </div>
        </div>

        {/* Patient Header */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <div>
                <p className="text-sm text-gray-600">ESI</p>
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${esiColors[patient.esiLevel ?? 5]}`}>
                  {patient.esiLevel ?? '—'}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">NEWS actuel</p>
                <p className={`font-semibold ${(patient.newsScore ?? 0) >= 7 ? 'text-red-600' : (patient.newsScore ?? 0) >= 5 ? 'text-orange-600' : 'text-green-600'}`}>
                  {patient.newsScore ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">GCS actuel</p>
                <p className={`font-semibold ${(patient.gcsScore ?? 15) < 12 ? 'text-red-600' : ''}`}>
                  {patient.gcsScore ?? '—'}/15
                </p>
              </div>
            </div>
            {patient.chiefComplaint && (
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-sm text-gray-600">Motif: <span className="font-medium text-gray-900">{patient.chiefComplaint}</span></p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Score Comparison After Save */}
        {showComparison && (
          <Card className={`mb-6 ${hasSignificantDeterioration() ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-200'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                {hasSignificantDeterioration() ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <span className="text-red-700">Détérioration Détectée</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-green-700">Constantes Mises à Jour</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Score Changes Display */}
              <div className="space-y-3">
                {scoreChanges.map((score) => {
                  const changeText = score.change === 0
                    ? 'stable'
                    : score.change > 0
                      ? `+${score.change}`
                      : `${score.change}`;

                  const changeColor = score.change === 0
                    ? 'text-gray-600'
                    : score.isWorse
                      ? 'text-red-600'
                      : 'text-green-600';

                  const ChangeIcon = score.change === 0
                    ? Minus
                    : score.isWorse
                      ? TrendingUp
                      : TrendingDown;

                  // For GCS, trending down is worse
                  const actualIcon = score.name === 'GCS'
                    ? (score.change === 0 ? Minus : score.isWorse ? TrendingDown : TrendingUp)
                    : ChangeIcon;

                  return (
                    <div
                      key={score.name}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        score.isWorse && score.change !== 0 ? 'bg-red-100' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">{score.name}</span>
                        <span className="text-gray-500">
                          {score.previous ?? '—'} → {score.current ?? '—'}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1 font-semibold ${changeColor}`}>
                        {React.createElement(actualIcon, { className: 'h-4 w-4' })}
                        <span>({changeText})</span>
                        {score.isWorse && score.change !== 0 && (
                          <span className="ml-2 text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded">
                            {score.name === 'NEWS' && (score.current ?? 0) >= 7 ? 'CRITIQUE' : 'DÉTÉRIORATION'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Deterioration Alert */}
              {hasSignificantDeterioration() && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Attention:</strong> Une détérioration significative a été détectée.
                    Envisagez d'alerter le médecin ou de demander une ré-évaluation.
                  </AlertDescription>
                </Alert>
              )}

              {/* Navigation Buttons */}
              <div className="flex gap-3 mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowComparison(false)}
                  className="flex-1"
                >
                  Modifier à nouveau
                </Button>
                <Button
                  onClick={() => navigate(`/nurse/treatment/${id}/care`)}
                  className={`flex-1 ${hasSignificantDeterioration() ? 'bg-red-600 hover:bg-red-700' : ''}`}
                >
                  Retourner aux soins
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
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

        {/* Actions - Hide when showing comparison */}
        {!showComparison && (
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => navigate(`/nurse/treatment/${id}/care`)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={saving} className="min-w-[180px]">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Enregistrement...' : 'Enregistrer les Constantes'}
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
