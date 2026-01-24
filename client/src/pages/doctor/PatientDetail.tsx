import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { ABCDEReviewComponent } from '../../components/doctor/ABCDEReview';
import { DiagnosisModal } from '../../components/doctor/DiagnosisModal';
import { DoctorDischargeModal } from '../../components/doctor/DoctorDischargeModal';
import { getApi } from '../../services/api';
import { getScoreColor, getScoreLabel } from '../../utils/scoreUtils';
import { formatDateTime } from '../../utils/dateUtils';
import {
  Patient,
  PatientStatus,
  Sex,
  Prescription,
  Diagnosis,
  DiagnosisType,
  DiagnosisSeverity,
  DiagnosisStatus,
  PrescriptionStatus,
  MedicationRoute,
  CreatePrescriptionRequest,
} from '@ncdss/shared';
import {
  ArrowLeft,
  RefreshCw,
  User,
  AlertTriangle,
  Thermometer,
  Heart,
  Activity,
  Droplets,
  Plus,
  X,
  FileText,
  Pill,
  LogOut,
  Clock,
  CheckCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';

// French labels
const diagnosisTypeLabels: Record<DiagnosisType, string> = {
  [DiagnosisType.PRIMARY]: 'Principal',
  [DiagnosisType.SECONDARY]: 'Secondaire',
  [DiagnosisType.DIFFERENTIAL]: 'Différentiel',
};

const diagnosisSeverityLabels: Record<DiagnosisSeverity, string> = {
  [DiagnosisSeverity.MILD]: 'Léger',
  [DiagnosisSeverity.MODERATE]: 'Modéré',
  [DiagnosisSeverity.SEVERE]: 'Sévère',
  [DiagnosisSeverity.CRITICAL]: 'Critique',
};

const diagnosisStatusLabels: Record<DiagnosisStatus, string> = {
  [DiagnosisStatus.ACTIVE]: 'Actif',
  [DiagnosisStatus.RESOLVED]: 'Résolu',
  [DiagnosisStatus.RULED_OUT]: 'Écarté',
};

const prescriptionStatusLabels: Record<PrescriptionStatus, string> = {
  [PrescriptionStatus.ACTIVE]: 'Actif',
  [PrescriptionStatus.COMPLETED]: 'Terminé',
  [PrescriptionStatus.CANCELLED]: 'Annulé',
  [PrescriptionStatus.ON_HOLD]: 'En pause',
};

const medicationRouteLabels: Record<MedicationRoute, string> = {
  [MedicationRoute.PO]: 'Per os (PO)',
  [MedicationRoute.IV]: 'Intraveineux (IV)',
  [MedicationRoute.IM]: 'Intramusculaire (IM)',
  [MedicationRoute.SC]: 'Sous-cutané (SC)',
  [MedicationRoute.SL]: 'Sublingual (SL)',
  [MedicationRoute.INH]: 'Inhalation (INH)',
  [MedicationRoute.TOP]: 'Topique (TOP)',
  [MedicationRoute.PR]: 'Per rectum (PR)',
  [MedicationRoute.OPH]: 'Ophtalmique (OPH)',
};

const dischargeTypeLabels: Record<string, string> = {
  'home': 'Retour à domicile',
  'admission': 'Hospitalisation',
  'transfer': 'Transfert',
  'left_ama': 'Sortie contre avis médical',
  'deceased': 'Décès',
};

// ESI colors
const esiColors: Record<number, string> = {
  1: 'bg-red-600 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-white',
  4: 'bg-green-500 text-white',
  5: 'bg-blue-500 text-white',
};

// Prescription Entry Modal
interface PrescriptionEntryModalProps {
  patientId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function PrescriptionEntryModal({ patientId, onClose, onSuccess }: PrescriptionEntryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreatePrescriptionRequest>({
    patientId,
    medicationName: '',
    dosage: '',
    route: MedicationRoute.PO,
    frequency: '',
    duration: '',
    instructions: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.medicationName.trim()) {
      setError('Le nom du médicament est requis');
      return;
    }
    if (!form.dosage.trim()) {
      setError('La posologie est requise');
      return;
    }
    if (!form.frequency.trim()) {
      setError('La fréquence est requise');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.post('/prescriptions', form);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de la création de la prescription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Nouvelle Prescription</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="medicationName">Médicament *</Label>
            <Input
              id="medicationName"
              value={form.medicationName}
              onChange={(e) => setForm({ ...form, medicationName: e.target.value })}
              placeholder="Ex: Paracétamol"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dosage">Posologie *</Label>
              <Input
                id="dosage"
                value={form.dosage}
                onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                placeholder="Ex: 1g"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Voie d'administration</Label>
              <Select
                value={form.route}
                onValueChange={(v) => setForm({ ...form, route: v as MedicationRoute })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(medicationRouteLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="frequency">Fréquence *</Label>
              <Input
                id="frequency"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                placeholder="Ex: 3x/jour"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="duration">Durée</Label>
              <Input
                id="duration"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="Ex: 5 jours"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="instructions">Instructions particulières</Label>
            <textarea
              id="instructions"
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder="Ex: À prendre pendant les repas..."
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Prescrire'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);

  const loadPatient = useCallback(async () => {
    if (!id) return;

    try {
      const api = await getApi();
      const response = await api.get(`/patients/${id}`);
      setPatient(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du chargement du patient');
    }
  }, [id]);

  const loadDiagnoses = useCallback(async () => {
    if (!id) return;

    try {
      const api = await getApi();
      const response = await api.get(`/diagnoses/patient/${id}`);
      setDiagnoses(response.data);
    } catch (err: any) {
      console.error('Error loading diagnoses:', err);
    }
  }, [id]);

  const loadPrescriptions = useCallback(async () => {
    if (!id) return;

    try {
      const api = await getApi();
      const response = await api.get(`/prescriptions/patient/${id}`);
      setPrescriptions(response.data);
    } catch (err: any) {
      console.error('Error loading prescriptions:', err);
    }
  }, [id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([loadPatient(), loadDiagnoses(), loadPrescriptions()]);
    setLoading(false);
  }, [loadPatient, loadDiagnoses, loadPrescriptions]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Check if patient has at least one PRIMARY diagnosis that is ACTIVE or CONFIRMED
  const hasPrimaryDiagnosis = diagnoses.some(
    d => d.diagnosisType === DiagnosisType.PRIMARY &&
         (d.status === DiagnosisStatus.ACTIVE || d.confirmedAt)
  );

  // Parse allergies
  const allergies = patient?.allergies ? patient.allergies.split(',').map(a => a.trim()).filter(Boolean) : [];

  // Get status badge
  const getStatusBadge = (status: DiagnosisStatus) => {
    switch (status) {
      case DiagnosisStatus.ACTIVE:
        return <Badge variant="info">{diagnosisStatusLabels[status]}</Badge>;
      case DiagnosisStatus.RESOLVED:
        return <Badge variant="success">{diagnosisStatusLabels[status]}</Badge>;
      case DiagnosisStatus.RULED_OUT:
        return <Badge variant="secondary">{diagnosisStatusLabels[status]}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTypeIcon = (type: DiagnosisType) => {
    switch (type) {
      case DiagnosisType.PRIMARY:
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case DiagnosisType.SECONDARY:
        return <FileText className="h-4 w-4 text-blue-600" />;
      case DiagnosisType.DIFFERENTIAL:
        return <HelpCircle className="h-4 w-4 text-amber-600" />;
      default:
        return null;
    }
  };

  const getPrescriptionStatusBadge = (status: PrescriptionStatus) => {
    switch (status) {
      case PrescriptionStatus.ACTIVE:
        return <Badge variant="success">{prescriptionStatusLabels[status]}</Badge>;
      case PrescriptionStatus.COMPLETED:
        return <Badge variant="secondary">{prescriptionStatusLabels[status]}</Badge>;
      case PrescriptionStatus.CANCELLED:
        return <Badge variant="destructive">{prescriptionStatusLabels[status]}</Badge>;
      case PrescriptionStatus.ON_HOLD:
        return <Badge variant="warning">{prescriptionStatusLabels[status]}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !patient) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/doctor/patients')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <Card>
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Patient non trouvé</h2>
              <p className="text-gray-600">{error || 'Le patient demandé n\'existe pas.'}</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/doctor/patients')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{patient.fullName}</h1>
              <p className="text-gray-600">
                {patient.age} ans, {patient.sex === Sex.MALE ? 'Homme' : 'Femme'}
                {patient.nationalId && ` | CIN: ${patient.nationalId}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {patient.esiLevel && (
              <div className={`px-4 py-2 rounded-lg ${esiColors[patient.esiLevel]}`}>
                <span className="text-xl font-bold">ESI {patient.esiLevel}</span>
              </div>
            )}
            {patient.finalOrientation && (
              <Badge variant="outline" className="text-sm py-1.5">
                {patient.finalOrientation}
              </Badge>
            )}
            <Button onClick={loadAll} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Allergies Alert */}
        {allergies.length > 0 && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-semibold">Allergies :</span>{' '}
              {allergies.join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Re-triage Alert */}
        {patient.retriageRequested && (
          <Alert variant="warning" className="mb-6 bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <span className="font-semibold">Re-triage demandé :</span>{' '}
              {patient.retriageReason || 'Raison non spécifiée'}
            </AlertDescription>
          </Alert>
        )}

        {/* Main Content - 2 columns on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - 2/3 width */}
          <div className="lg:col-span-2 space-y-6">
            {/* Chief Complaint */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                  Motif de consultation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-900">
                  {patient.chiefComplaint || 'Non renseigné'}
                </p>
                {patient.symptomOnset && (
                  <p className="text-sm text-gray-500 mt-1">
                    Début des symptômes : {patient.symptomOnset}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Vitals Grid */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Constantes Vitales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <Thermometer className="h-4 w-4" />
                      <span className="text-xs">Température</span>
                    </div>
                    <span className={`text-lg font-semibold ${
                      patient.temperature && (patient.temperature < 36 || patient.temperature > 38)
                        ? 'text-red-600'
                        : ''
                    }`}>
                      {patient.temperature ? `${patient.temperature}°C` : '—'}
                    </span>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <Heart className="h-4 w-4" />
                      <span className="text-xs">Fréquence cardiaque</span>
                    </div>
                    <span className={`text-lg font-semibold ${
                      patient.heartRate && (patient.heartRate < 60 || patient.heartRate > 100)
                        ? 'text-amber-600'
                        : ''
                    }`}>
                      {patient.heartRate ? `${patient.heartRate} bpm` : '—'}
                    </span>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <Activity className="h-4 w-4" />
                      <span className="text-xs">Fréquence respiratoire</span>
                    </div>
                    <span className={`text-lg font-semibold ${
                      patient.respiratoryRate && (patient.respiratoryRate < 12 || patient.respiratoryRate > 20)
                        ? 'text-amber-600'
                        : ''
                    }`}>
                      {patient.respiratoryRate ? `${patient.respiratoryRate} /min` : '—'}
                    </span>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <Activity className="h-4 w-4" />
                      <span className="text-xs">Tension artérielle</span>
                    </div>
                    <span className="text-lg font-semibold">
                      {patient.systolicBP && patient.diastolicBP
                        ? `${patient.systolicBP}/${patient.diastolicBP} mmHg`
                        : '—'}
                    </span>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <Droplets className="h-4 w-4" />
                      <span className="text-xs">Saturation O2</span>
                    </div>
                    <span className={`text-lg font-semibold ${
                      patient.oxygenSaturation && patient.oxygenSaturation < 94
                        ? 'text-red-600'
                        : ''
                    }`}>
                      {patient.oxygenSaturation ? `${patient.oxygenSaturation}%` : '—'}
                    </span>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs">Douleur (EVA)</span>
                    </div>
                    <span className={`text-lg font-semibold ${
                      patient.painLevel && patient.painLevel >= 7
                        ? 'text-red-600'
                        : patient.painLevel && patient.painLevel >= 4
                          ? 'text-amber-600'
                          : ''
                    }`}>
                      {patient.painLevel !== undefined ? `${patient.painLevel}/10` : '—'}
                    </span>
                  </div>
                </div>

                {/* Scores Row */}
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className={`p-3 rounded-lg border-2 ${
                    patient.newsScore !== undefined
                      ? getScoreColor(patient.newsScore, 'news')
                      : 'bg-gray-50'
                  }`}>
                    <div className="text-xs text-gray-600 mb-1">NEWS</div>
                    <div className="text-xl font-bold">
                      {patient.newsScore ?? '—'}
                    </div>
                    {patient.newsScore !== undefined && (
                      <div className="text-xs mt-1">
                        {getScoreLabel(patient.newsScore, 'news')}
                      </div>
                    )}
                  </div>

                  <div className={`p-3 rounded-lg border-2 ${
                    patient.gcsScore !== undefined
                      ? getScoreColor(patient.gcsScore, 'gcs')
                      : 'bg-gray-50'
                  }`}>
                    <div className="text-xs text-gray-600 mb-1">GCS</div>
                    <div className="text-xl font-bold">
                      {patient.gcsScore ?? '—'}
                    </div>
                    {patient.gcsScore !== undefined && (
                      <div className="text-xs mt-1">
                        {getScoreLabel(patient.gcsScore, 'gcs')}
                      </div>
                    )}
                  </div>

                  <div className={`p-3 rounded-lg border-2 ${
                    patient.qsofaScore !== undefined
                      ? getScoreColor(patient.qsofaScore, 'qsofa')
                      : 'bg-gray-50'
                  }`}>
                    <div className="text-xs text-gray-600 mb-1">qSOFA</div>
                    <div className="text-xl font-bold">
                      {patient.qsofaScore ?? '—'}
                    </div>
                    {patient.qsofaScore !== undefined && (
                      <div className="text-xs mt-1">
                        {getScoreLabel(patient.qsofaScore, 'qsofa')}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ABCDE Review */}
            <ABCDEReviewComponent patient={patient} />
          </div>

          {/* Right Column - 1/3 width */}
          <div className="space-y-6">
            {/* Diagnoses Section */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Diagnostics</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setShowDiagnosisModal(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {diagnoses.length === 0 ? (
                  <p className="text-gray-500 text-sm italic text-center py-4">
                    Aucun diagnostic enregistré
                  </p>
                ) : (
                  <div className="space-y-3">
                    {diagnoses.map((diagnosis) => (
                      <div
                        key={diagnosis.id}
                        className={`p-3 rounded-lg border ${
                          diagnosis.diagnosisType === DiagnosisType.PRIMARY
                            ? 'border-green-200 bg-green-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {getTypeIcon(diagnosis.diagnosisType)}
                            <div>
                              <p className="font-medium text-gray-900">
                                {diagnosis.diagnosisName}
                              </p>
                              {diagnosis.diagnosisCode && (
                                <p className="text-xs text-gray-500">
                                  {diagnosis.diagnosisCode}
                                </p>
                              )}
                            </div>
                          </div>
                          {getStatusBadge(diagnosis.status)}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {diagnosisTypeLabels[diagnosis.diagnosisType]}
                          </Badge>
                          {diagnosis.severity && (
                            <Badge
                              variant={
                                diagnosis.severity === DiagnosisSeverity.CRITICAL
                                  ? 'destructive'
                                  : diagnosis.severity === DiagnosisSeverity.SEVERE
                                    ? 'warning'
                                    : 'secondary'
                              }
                              className="text-xs"
                            >
                              {diagnosisSeverityLabels[diagnosis.severity]}
                            </Badge>
                          )}
                        </div>
                        {diagnosis.notes && (
                          <p className="text-sm text-gray-600 mt-2">
                            {diagnosis.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Prescriptions Section */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Prescriptions</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => setShowPrescriptionModal(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {prescriptions.length === 0 ? (
                  <p className="text-gray-500 text-sm italic text-center py-4">
                    Aucune prescription
                  </p>
                ) : (
                  <div className="space-y-3">
                    {prescriptions.map((prescription) => (
                      <div
                        key={prescription.id}
                        className="p-3 rounded-lg border border-gray-200 bg-gray-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <Pill className="h-4 w-4 text-blue-600 mt-0.5" />
                            <div>
                              <p className="font-medium text-gray-900">
                                {prescription.medicationName}
                              </p>
                              <p className="text-sm text-gray-600">
                                {prescription.dosage} - {medicationRouteLabels[prescription.route]}
                              </p>
                            </div>
                          </div>
                          {getPrescriptionStatusBadge(prescription.status)}
                        </div>
                        <div className="mt-2 text-sm text-gray-600">
                          <p>{prescription.frequency}</p>
                          {prescription.duration && (
                            <p>Durée : {prescription.duration}</p>
                          )}
                        </div>
                        {prescription.instructions && (
                          <p className="text-sm text-gray-500 mt-2 italic">
                            {prescription.instructions}
                          </p>
                        )}
                        {prescription.administrations && prescription.administrations.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">
                              Administrations ({prescription.administrations.length})
                            </p>
                            <div className="text-xs text-gray-600">
                              Dernière : {formatDateTime(prescription.administrations[prescription.administrations.length - 1].time)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions Section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => setShowDischargeModal(true)}
                  disabled={patient.status === PatientStatus.DISCHARGED}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sortie du Patient
                  {!hasPrimaryDiagnosis && (
                    <span className="ml-auto text-xs text-amber-600">
                      (diagnostic requis)
                    </span>
                  )}
                </Button>

                {patient.status === PatientStatus.DISCHARGED && (
                  <div className="p-3 bg-gray-100 rounded-lg text-center">
                    <p className="text-sm text-gray-600">
                      Patient sorti le {formatDateTime(patient.dischargedAt!)}
                    </p>
                    <p className="text-sm font-medium">
                      {dischargeTypeLabels[patient.dischargeType || 'home']}
                    </p>
                  </div>
                )}

                {/* Timeline Info */}
                <div className="pt-3 border-t">
                  <p className="text-xs font-medium text-gray-500 mb-2">Chronologie</p>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      <span>Arrivée : {formatDateTime(patient.createdAt)}</span>
                    </div>
                    {patient.triageCompletedAt && (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span>Triage : {formatDateTime(patient.triageCompletedAt)}</span>
                      </div>
                    )}
                    {patient.doctorAssignedAt && (
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-blue-500" />
                        <span>Médecin : {formatDateTime(patient.doctorAssignedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modals */}
      <DiagnosisModal
        isOpen={showDiagnosisModal}
        patientId={patient.id}
        onClose={() => setShowDiagnosisModal(false)}
        onSuccess={loadDiagnoses}
      />

      {showPrescriptionModal && (
        <PrescriptionEntryModal
          patientId={patient.id}
          onClose={() => setShowPrescriptionModal(false)}
          onSuccess={() => {
            setShowPrescriptionModal(false);
            loadPrescriptions();
          }}
        />
      )}

      <DoctorDischargeModal
        isOpen={showDischargeModal}
        patient={patient}
        diagnoses={diagnoses}
        onClose={() => setShowDischargeModal(false)}
        onSuccess={() => {
          setShowDischargeModal(false);
          loadPatient();
          navigate('/doctor/patients');
        }}
      />
    </DashboardLayout>
  );
}
