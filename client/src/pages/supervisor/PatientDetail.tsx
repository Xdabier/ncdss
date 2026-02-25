import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  ArrowLeft,
  User,
  Clock,
  AlertTriangle,
  Loader2,
  Activity,
  Thermometer,
  Heart,
  Wind,
  Eye,
  Stethoscope,
  FileText,
  Calendar,
} from 'lucide-react';
import { getApi } from '../../services/api';
import { Patient, PatientStatus, Sex, Orientation, API_ROUTES } from '@ncdss/shared';

const statusLabels: Record<string, string> = {
  REGISTERED: 'Inscrit',
  IN_TRIAGE: 'En Triage',
  TRIAGED: 'Triagé',
  IN_TREATMENT: 'En Traitement',
  WITH_DOCTOR: 'Avec Médecin',
  DISCHARGED: 'Sorti',
};

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'> = {
  REGISTERED: 'info',
  IN_TRIAGE: 'warning',
  TRIAGED: 'secondary',
  IN_TREATMENT: 'default',
  WITH_DOCTOR: 'success',
  DISCHARGED: 'outline',
};

const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Trauma',
  PEDIATRIC: 'Pédiatrique',
};

const formatDateTime = (isoString: string | null | undefined): string => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getEsiBadgeVariant = (esi: number | null | undefined): 'destructive' | 'warning' | 'default' | 'secondary' | 'success' => {
  if (!esi) return 'secondary';
  switch (esi) {
    case 1: return 'destructive';
    case 2: return 'destructive';
    case 3: return 'warning';
    case 4: return 'default';
    case 5: return 'success';
    default: return 'secondary';
  }
};

export default function SupervisorPatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPatient = async () => {
      if (!id) return;
      try {
        const api = await getApi();
        const response = await api.get(API_ROUTES.patients.byId(id));
        setPatient(response.data);
      } catch (error) {
        console.error('Error loading patient:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPatient();
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <p className="text-gray-500">Patient non trouvé</p>
            <Button variant="link" onClick={() => navigate(-1)} className="mt-2">
              Retour
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isCritical = (patient.esiLevel && patient.esiLevel <= 2) ||
    (patient.newsScore && patient.newsScore >= 7);

  const parseABCDE = (jsonString: string | null | undefined) => {
    if (!jsonString) return null;
    try {
      return JSON.parse(jsonString);
    } catch {
      return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{patient.fullName}</h1>
              {isCritical && (
                <AlertTriangle className="h-6 w-6 text-red-500" />
              )}
              <Badge variant={statusColors[patient.status] || 'default'}>
                {statusLabels[patient.status] || patient.status}
              </Badge>
            </div>
            <p className="text-gray-600">
              {patient.age} ans - {patient.sex === 'MALE' ? 'Homme' : 'Femme'}
              {patient.nationalId && ` - ${patient.nationalId}`}
            </p>
          </div>
        </div>

        {/* Critical Alert */}
        {isCritical && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <AlertTriangle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="font-semibold text-red-700">Patient Critique</p>
                  <p className="text-sm text-red-600">
                    {patient.esiLevel && patient.esiLevel <= 2 && `ESI ${patient.esiLevel}`}
                    {patient.esiLevel && patient.esiLevel <= 2 && patient.newsScore && patient.newsScore >= 7 && ' - '}
                    {patient.newsScore && patient.newsScore >= 7 && `NEWS ${patient.newsScore}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Patient Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informations Patient
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Nom complet</p>
                  <p className="font-medium">{patient.fullName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Age / Sexe</p>
                  <p className="font-medium">{patient.age} ans - {patient.sex === 'MALE' ? 'M' : 'F'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Téléphone</p>
                  <p className="font-medium">{patient.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">CIN</p>
                  <p className="font-medium">{patient.nationalId || '-'}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Adresse</p>
                <p className="font-medium">{patient.address || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Allergies</p>
                <p className="font-medium text-red-600">{patient.allergies || 'Aucune connue'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Antécédents</p>
                <p className="font-medium">{patient.chronicConditions || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Motif de consultation</p>
                <p className="font-medium">{patient.chiefComplaint || '-'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Scores & Orientation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Scores & Orientation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Niveau ESI</p>
                  {patient.esiLevel ? (
                    <Badge variant={getEsiBadgeVariant(patient.esiLevel)} className="text-lg">
                      ESI {patient.esiLevel}
                    </Badge>
                  ) : (
                    <p className="text-gray-400">Non défini</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500">Score NEWS</p>
                  <p className={`text-2xl font-bold ${
                    patient.newsScore && patient.newsScore >= 7 ? 'text-red-600' :
                    patient.newsScore && patient.newsScore >= 5 ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {patient.newsScore ?? '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Score GCS</p>
                  <p className={`text-2xl font-bold ${
                    patient.gcsScore && patient.gcsScore < 9 ? 'text-red-600' :
                    patient.gcsScore && patient.gcsScore < 13 ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {patient.gcsScore ?? '-'}/15
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Score qSOFA</p>
                  <p className={`text-2xl font-bold ${
                    patient.qsofaScore && patient.qsofaScore >= 2 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {patient.qsofaScore ?? '-'}/3
                  </p>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Orientation suggérée</p>
                    <p className="font-medium">
                      {patient.suggestedOrientation
                        ? orientationLabels[patient.suggestedOrientation] || patient.suggestedOrientation
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Orientation finale</p>
                    <p className="font-medium">
                      {patient.finalOrientation
                        ? orientationLabels[patient.finalOrientation] || patient.finalOrientation
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vitals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Signes Vitaux
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Thermometer className="h-5 w-5 mx-auto text-blue-500" />
                  <p className="text-xs text-gray-500 mt-1">Température</p>
                  <p className="font-bold">{patient.temperature ? `${patient.temperature}°C` : '-'}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Heart className="h-5 w-5 mx-auto text-red-500" />
                  <p className="text-xs text-gray-500 mt-1">FC</p>
                  <p className="font-bold">{patient.heartRate ? `${patient.heartRate} bpm` : '-'}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Wind className="h-5 w-5 mx-auto text-green-500" />
                  <p className="text-xs text-gray-500 mt-1">FR</p>
                  <p className="font-bold">{patient.respiratoryRate ? `${patient.respiratoryRate}/min` : '-'}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Activity className="h-5 w-5 mx-auto text-purple-500" />
                  <p className="text-xs text-gray-500 mt-1">TA</p>
                  <p className="font-bold">
                    {patient.systolicBP && patient.diastolicBP
                      ? `${patient.systolicBP}/${patient.diastolicBP}`
                      : '-'}
                  </p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="h-5 w-5 mx-auto text-cyan-500 font-bold text-xs">SpO2</div>
                  <p className="text-xs text-gray-500 mt-1">Saturation</p>
                  <p className="font-bold">{patient.oxygenSaturation ? `${patient.oxygenSaturation}%` : '-'}</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Eye className="h-5 w-5 mx-auto text-orange-500" />
                  <p className="text-xs text-gray-500 mt-1">Douleur</p>
                  <p className="font-bold">{patient.painLevel !== undefined && patient.painLevel !== null ? `${patient.painLevel}/10` : '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Chronologie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <div className="flex-1">
                    <p className="font-medium">Inscription</p>
                    <p className="text-sm text-gray-500">{formatDateTime(patient.createdAt)}</p>
                  </div>
                </div>
                {patient.triageStartedAt && (
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="flex-1">
                      <p className="font-medium">Début Triage</p>
                      <p className="text-sm text-gray-500">{formatDateTime(patient.triageStartedAt)}</p>
                    </div>
                  </div>
                )}
                {patient.triageCompletedAt && (
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <div className="flex-1">
                      <p className="font-medium">Triage Terminé</p>
                      <p className="text-sm text-gray-500">{formatDateTime(patient.triageCompletedAt)}</p>
                    </div>
                  </div>
                )}
                {patient.treatmentStartedAt && (
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    <div className="flex-1">
                      <p className="font-medium">Début Traitement</p>
                      <p className="text-sm text-gray-500">{formatDateTime(patient.treatmentStartedAt)}</p>
                    </div>
                  </div>
                )}
                {patient.doctorAssignedAt && (
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full bg-indigo-500" />
                    <div className="flex-1">
                      <p className="font-medium">Assigné au Médecin</p>
                      <p className="text-sm text-gray-500">{formatDateTime(patient.doctorAssignedAt)}</p>
                    </div>
                  </div>
                )}
                {patient.dischargedAt && (
                  <div className="flex items-center gap-4">
                    <div className="w-3 h-3 rounded-full bg-gray-500" />
                    <div className="flex-1">
                      <p className="font-medium">Sortie</p>
                      <p className="text-sm text-gray-500">{formatDateTime(patient.dischargedAt)}</p>
                      {patient.dischargeType && (
                        <p className="text-xs text-gray-400">Type: {patient.dischargeType}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Treatment Notes */}
        {patient.treatmentNotes && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Notes de Traitement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg">
                {patient.treatmentNotes}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Discharge Notes */}
        {patient.dischargeNotes && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Notes de Sortie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg">
                {patient.dischargeNotes}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
