import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  User,
  FileText,
  Heart,
  Activity,
  TrendingUp,
  Navigation,
  Edit
} from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { getApi } from '../../../services/api';
import { Patient, Sex, Orientation as OrientationType, OrientationSource } from '@ncdss/shared';
import { getScoreColor, getScoreLabel } from '../../../utils/scoreUtils';

interface LocationState {
  esiLevel?: number;
  suggestedOrientation?: OrientationType;
  orientationSource?: OrientationSource;
  finalOrientation?: OrientationType;
  overrideReason?: string;
}

const ESI_LABELS = [
  { level: 1, label: 'Réanimation immédiate', color: 'bg-red-100 text-red-900 border-red-500' },
  { level: 2, label: 'Urgence vitale', color: 'bg-orange-100 text-orange-900 border-orange-500' },
  { level: 3, label: 'Urgent', color: 'bg-yellow-100 text-yellow-900 border-yellow-500' },
  { level: 4, label: 'Moins urgent', color: 'bg-green-100 text-green-900 border-green-500' },
  { level: 5, label: 'Non urgent', color: 'bg-blue-100 text-blue-900 border-blue-500' },
];

const ORIENTATION_LABELS: Record<OrientationType, string> = {
  [OrientationType.SAUV]: 'SAUV - Salle de déchocage',
  [OrientationType.MEDICAL]: 'MÉDICAL - Box médical',
  [OrientationType.SURGICAL]: 'CHIRURGICAL - Box chirurgical',
  [OrientationType.TRAUMA]: 'TRAUMATO - Box traumatologie',
};

export default function PatientSummary() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get data from route state
  const esiLevel = state?.esiLevel;
  const suggestedOrientation = state?.suggestedOrientation;
  const orientationSource = state?.orientationSource;
  const finalOrientation = state?.finalOrientation;
  const overrideReason = state?.overrideReason;

  // Load patient data
  useEffect(() => {
    const loadPatient = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const api = await getApi();
        const response = await api.get(`/patients/${id}`);
        setPatient(response.data);
      } catch (e: any) {
        setError(e.response?.data?.error || 'Erreur de chargement du patient');
      } finally {
        setLoading(false);
      }
    };

    loadPatient();
  }, [id]);

  const handleCompleteTriage = async () => {
    if (!patient || !id) return;

    // Use ESI from state or patient record
    const finalESILevel = esiLevel || patient.esiLevel;

    // Validation
    if (!finalESILevel) {
      setError('Niveau ESI manquant');
      return;
    }

    if (!finalOrientation) {
      setError('Orientation finale manquante');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const api = await getApi();

      await api.post(`/patients/${id}/complete-triage`, {
        esiLevel: finalESILevel,
        suggestedOrientation,
        orientationSource,
        finalOrientation,
        overrideReason,
      });

      // Success - redirect to triage queue
      navigate('/nurse/triage', {
        state: {
          message: `Triage terminé avec succès pour ${patient.fullName}`
        },
      });
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur lors de la finalisation du triage');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="max-w-5xl mx-auto">
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
          <div className="max-w-5xl mx-auto">
            <Alert variant="destructive">
              <AlertDescription>Patient non trouvé</AlertDescription>
            </Alert>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!finalOrientation) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="max-w-5xl mx-auto">
            <Alert variant="destructive">
              <AlertDescription>
                Orientation manquante. Veuillez retourner à la page d'orientation.
              </AlertDescription>
            </Alert>
            <div className="mt-4">
              <Button onClick={() => navigate(`/nurse/triage/${id}/orientation`)}>
                Retour à l'orientation
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Use ESI from state or patient record
  const finalESILevel = esiLevel || patient.esiLevel;
  const esiInfo = ESI_LABELS.find((e) => e.level === finalESILevel);
  const chronicConditions = patient.chronicConditions
    ? JSON.parse(patient.chronicConditions)
    : [];
  const currentMedications = patient.currentMedications
    ? JSON.parse(patient.currentMedications)
    : [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Résumé du Triage</h1>
            <p className="text-sm text-gray-600">Étape 8/8 - Confirmation finale</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success banner */}
        <Alert className="mb-6 border-blue-500 bg-blue-50">
          <CheckCircle2 className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            Triage complété. Vérifiez les informations ci-dessous avant de confirmer.
          </AlertDescription>
        </Alert>

        {/* Patient Info */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informations Patient
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/nurse/patients/${id}/edit`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Nom complet</p>
                <p className="font-semibold">{patient.fullName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Âge / Sexe</p>
                <p className="font-semibold">
                  {patient.age} ans / {patient.sex === Sex.MALE ? 'Homme' : 'Femme'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">CIN / Passeport</p>
                <p className="font-semibold">{patient.nationalId || 'Non spécifié'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Téléphone</p>
                <p className="font-semibold">{patient.phone || 'Non spécifié'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chief Complaint */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Motif de Consultation
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/nurse/patients/${id}/edit`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Plainte principale</p>
                <p className="font-semibold">{patient.chiefComplaint || 'Non spécifié'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Début des symptômes</p>
                <p className="font-semibold">{patient.symptomOnset || 'Non spécifié'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Medical History */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Antécédents Médicaux
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/nurse/patients/${id}/edit`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Allergies</p>
                <p className="font-semibold">{patient.allergies || 'Aucune allergie connue'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Conditions chroniques</p>
                {chronicConditions.length > 0 ? (
                  <ul className="list-disc list-inside">
                    {chronicConditions.map((condition: string, idx: number) => (
                      <li key={idx} className="font-semibold">
                        {condition}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-semibold">Aucune condition chronique</p>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-600">Médicaments actuels</p>
                {currentMedications.length > 0 ? (
                  <ul className="list-disc list-inside">
                    {currentMedications.map((medication: string, idx: number) => (
                      <li key={idx} className="font-semibold">
                        {medication}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-semibold">Aucun médicament</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vitals */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Constantes Vitales
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/nurse/triage/${id}/vitals`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Température</p>
                <p className="font-semibold">{patient.temperature ? `${patient.temperature}°C` : '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fréquence cardiaque</p>
                <p className="font-semibold">{patient.heartRate ? `${patient.heartRate} bpm` : '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Fréquence respiratoire</p>
                <p className="font-semibold">
                  {patient.respiratoryRate ? `${patient.respiratoryRate} /min` : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Pression artérielle</p>
                <p className="font-semibold">
                  {patient.systolicBP && patient.diastolicBP
                    ? `${patient.systolicBP}/${patient.diastolicBP} mmHg`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">SpO2</p>
                <p className="font-semibold">{patient.oxygenSaturation ? `${patient.oxygenSaturation}%` : '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Glycémie</p>
                <p className="font-semibold">
                  {patient.glucoseLevel ? `${patient.glucoseLevel} mg/dL` : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Douleur</p>
                <p className="font-semibold">{patient.painLevel !== undefined ? `${patient.painLevel}/10` : '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">GCS (E-V-M)</p>
                <p className="font-semibold">
                  {patient.gcsEye && patient.gcsVerbal && patient.gcsMotor
                    ? `${patient.gcsEye}-${patient.gcsVerbal}-${patient.gcsMotor}`
                    : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scores */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Scores Cliniques
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/nurse/triage/${id}/score`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Voir détails
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">NEWS Score</p>
                <Badge
                  className={`text-base px-3 py-1 ${
                    patient.newsScore !== undefined
                      ? getScoreColor(patient.newsScore, 'news')
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {patient.newsScore ?? '—'} - {patient.newsScore !== undefined ? getScoreLabel(patient.newsScore, 'news') : 'Non calculé'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">GCS Score</p>
                <Badge
                  className={`text-base px-3 py-1 ${
                    patient.gcsScore !== undefined
                      ? getScoreColor(patient.gcsScore, 'gcs')
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {patient.gcsScore ?? '—'} - {patient.gcsScore !== undefined ? getScoreLabel(patient.gcsScore, 'gcs') : 'Non calculé'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">qSOFA Score</p>
                <Badge
                  className={`text-base px-3 py-1 ${
                    patient.qsofaScore !== undefined
                      ? getScoreColor(patient.qsofaScore, 'qsofa')
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {patient.qsofaScore ?? '—'} - {patient.qsofaScore !== undefined ? getScoreLabel(patient.qsofaScore, 'qsofa') : 'Non calculé'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ESI Level */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Niveau ESI</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/nurse/triage/${id}/esi`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {esiInfo ? (
              <div className={`p-4 rounded-lg border-2 ${esiInfo.color}`}>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold">{esiInfo.level}</div>
                  <div>
                    <p className="font-semibold">{esiInfo.label}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-600">Niveau ESI non défini</p>
            )}
          </CardContent>
        </Card>

        {/* Orientation */}
        <Card className="mb-6 border-blue-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <Navigation className="h-5 w-5" />
                Orientation Finale
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/nurse/triage/${id}/orientation`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600 mb-2">Orientation choisie</p>
                <Badge className="text-base px-3 py-1 bg-blue-600">
                  {ORIENTATION_LABELS[finalOrientation]}
                </Badge>
              </div>
              {overrideReason && (
                <div>
                  <p className="text-sm text-gray-600">Raison du changement</p>
                  <p className="text-sm bg-orange-50 p-3 rounded border border-orange-200 mt-1">
                    {overrideReason}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour
          </Button>
          <Button
            onClick={handleCompleteTriage}
            disabled={saving}
            className="min-w-[200px] bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {saving ? 'Enregistrement...' : 'Confirmer et terminer le triage'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
