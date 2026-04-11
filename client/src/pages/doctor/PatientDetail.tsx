import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { DiagnosisModal } from '../../components/doctor/DiagnosisModal';
import { PrescriptionModal } from '../../components/doctor/PrescriptionModal';
import { DoctorDischargeModal } from '../../components/doctor/DoctorDischargeModal';
import { HoldPatientModal } from '../../components/doctor/HoldPatientModal';
import { ExamsPanel, AIQuickOrderPopover } from '../../components/doctor/ExamsPanel';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { AIPreDiagnosisPanel } from '../../components/shared/AIPreDiagnosisPanel';
import { getApi } from '../../services/api';
import { getScoreColor, getScoreLabel } from '../../utils/scoreUtils';
import { formatDateTime } from '../../utils/dateUtils';
import {
  Patient,
  PatientStatus,
  Sex,
  HoldStatus,
  Prescription,
  Diagnosis,
  DiagnosisType,
  DiagnosisSeverity,
  DiagnosisStatus,
  PrescriptionStatus,
  MedicationRoute,
  CreatePrescriptionRequest,
  ComplementaryExam,
  ExamStatus,
  API_ROUTES,
  UnifiedClinicalAnalysis,
  GetUnifiedAnalysisResponse,
  UnifiedPathology,
} from '@ncdss/shared';
import { CLIENT_ROUTES } from '../../routes';
import {
  ArrowLeft,
  ArrowRight,
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
  Edit3,
  Ban,
  UserPlus,
  Stethoscope,
  History,
  Syringe,
  Pause,
  Play,
  Save,
  BedDouble,
  Loader2,
  ChevronDown,
  ChevronUp,
  Shield,
  Zap,
  FlaskConical,
  Brain,
  Wind,
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

const holdStatusLabels: Record<string, string> = {
  waiting_for_treatment: 'En attente de soins au box',
  waiting_for_exams: "En attente d'examens complémentaires",
  waiting_for_specialist: "En attente d'un spécialiste",
  patient_absent: "Patient absent à l'appel",
  treatment_done: 'Soins terminés — prêt à reprendre',
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
  initialData?: Partial<CreatePrescriptionRequest & { administeredInBox?: boolean }>;
}

function PrescriptionEntryModal({ patientId, onClose, onSuccess, initialData }: PrescriptionEntryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreatePrescriptionRequest & { administeredInBox?: boolean }>({
    patientId,
    medicationName: initialData?.medicationName || '',
    dosage: initialData?.dosage || '',
    route: initialData?.route || MedicationRoute.PO,
    frequency: initialData?.frequency || '',
    duration: initialData?.duration || '',
    instructions: initialData?.instructions || '',
    administeredInBox: initialData?.administeredInBox || false,
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
    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.post(API_ROUTES.prescriptions.create, form);
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

// Cancel Prescription Modal
interface CancelPrescriptionModalProps {
  prescription: Prescription;
  onClose: () => void;
  onSuccess: () => void;
}

function CancelPrescriptionModal({ prescription, onClose, onSuccess }: CancelPrescriptionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const handleCancel = async () => {
    if (!reason.trim()) {
      setError('Veuillez indiquer la raison de l\'annulation');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.post(API_ROUTES.prescriptions.cancel(prescription.id), { reason });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de l\'annulation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-red-600">Annuler la Prescription</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium">{prescription.medicationName}</p>
            <p className="text-sm text-gray-600">{prescription.dosage} - {prescription.frequency}</p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label htmlFor="cancelReason">Raison de l'annulation *</Label>
            <textarea
              id="cancelReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Allergie découverte, changement de traitement..."
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Retour
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={loading}
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Annulation...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4 mr-2" />
                  Annuler la prescription
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Transfer Patient Modal
interface TransferModalProps {
  patient: Patient;
  onClose: () => void;
  onSuccess: () => void;
}

function TransferModal({ patient, onClose, onSuccess }: TransferModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<{ id: string; fullName: string }[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const loadDoctors = async () => {
      try {
        const api = await getApi();
        const response = await api.get(API_ROUTES.users.byRole('DOCTOR'));
        setDoctors(response.data);
      } catch (err) {
        console.error('Error loading doctors:', err);
      }
    };
    loadDoctors();
  }, []);

  const handleTransfer = async () => {
    if (!selectedDoctor) {
      setError('Veuillez sélectionner un médecin');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.post(API_ROUTES.patients.transferToDoctor(patient.id), {
        doctorId: selectedDoctor,
        reason: reason || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du transfert');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Transférer le Patient</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label>Transférer à *</Label>
            <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Sélectionner un médecin" />
              </SelectTrigger>
              <SelectContent>
                {doctors
                  .filter(d => d.id !== patient.assignedDoctorId)
                  .map((doctor) => (
                    <SelectItem key={doctor.id} value={doctor.id}>
                      Dr. {doctor.fullName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="transferReason">Raison du transfert</Label>
            <textarea
              id="transferReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Consultation spécialisée requise..."
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
            <Button onClick={handleTransfer} disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Transfert...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Transférer
                </>
              )}
            </Button>
          </div>
        </div>
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
  const [exams, setExams] = useState<ComplementaryExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
  const [editingDiagnosis, setEditingDiagnosis] = useState<Diagnosis | null>(null);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null);
  const [prescriptionToCancel, setPrescriptionToCancel] = useState<Prescription | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [aiRecommendedTests, setAiRecommendedTests] = useState<string[]>([]);
  const [aiPanelQuickOrder, setAiPanelQuickOrder] = useState<string | null>(null);
  const [examsRefreshKey, setExamsRefreshKey] = useState(0);

  // Unified analysis state
  const [unifiedAnalysis, setUnifiedAnalysis] = useState<UnifiedClinicalAnalysis | null>(null);
  const [unifiedAnalysisLoading, setUnifiedAnalysisLoading] = useState(false);

  // Collapsible sections (true = collapsed)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    treatmentNotes: true,
    timeline: true,
  });
  const toggleSection = (key: string): void => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Redirect to treatment box
  const [showRedirectToBoxModal, setShowRedirectToBoxModal] = useState(false);
  const [redirectSuccess, setRedirectSuccess] = useState<string | null>(null);

  // Rabies protocol alert
  const [rabiesAlertDismissed, setRabiesAlertDismissed] = useState(false);
  const [prescriptionInitialData, setPrescriptionInitialData] = useState<
    Partial<CreatePrescriptionRequest & { administeredInBox?: boolean }> | undefined
  >(undefined);

  // Consultation notes auto-save
  const [consultationNotes, setConsultationNotes] = useState('');
  const [notesSaveStatus, setNotesSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const notesInitialized = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aiDiagnosisInitialData, setAiDiagnosisInitialData] = useState<{
    diagnosisCode?: string;
    diagnosisName?: string;
    diagnosisType?: string;
    severity?: string;
    notes?: string;
    aiConfidence?: number;
  } | undefined>(undefined);

  const loadPatient = useCallback(async () => {
    if (!id) return;

    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.patients.byId(id));
      setPatient(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du chargement du patient');
    }
  }, [id]);

  const loadDiagnoses = useCallback(async () => {
    if (!id) return;

    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.diagnoses.byPatient(id));
      setDiagnoses(response.data);
    } catch (err: any) {
      console.error('Error loading diagnoses:', err);
    }
  }, [id]);

  const loadPrescriptions = useCallback(async () => {
    if (!id) return;

    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.prescriptions.byPatient(id));
      setPrescriptions(response.data);
    } catch (err: any) {
      console.error('Error loading prescriptions:', err);
    }
  }, [id]);

  const loadExams = useCallback(async () => {
    if (!id) return;
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.exams.byPatient(id));
      setExams(response.data);
    } catch (err: any) {
      console.error('Error loading exams:', err);
    }
  }, [id]);

  const loadUnifiedAnalysis = useCallback(async () => {
    if (!id) return;
    try {
      const api = await getApi();
      const response = await api.get<GetUnifiedAnalysisResponse>(API_ROUTES.patients.unifiedAnalysis(id));
      if (response.data.exists && response.data.status === 'completed' && response.data.result) {
        setUnifiedAnalysis(response.data.result);
      }
    } catch {
      // Unified analysis may not exist yet
    }
  }, [id]);

  const loadAiRecommendedTests = useCallback(async () => {
    if (!id) return;
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.patients.aiPrediagnosis(id));
      if (response.data?.recommendedTests) {
        const tests = typeof response.data.recommendedTests === 'string'
          ? JSON.parse(response.data.recommendedTests)
          : response.data.recommendedTests;
        if (Array.isArray(tests)) {
          setAiRecommendedTests(tests);
        }
      }
    } catch {
      // AI data may not exist - that's fine
    }
  }, [id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([loadPatient(), loadDiagnoses(), loadPrescriptions(), loadExams(), loadAiRecommendedTests(), loadUnifiedAnalysis()]);
    setLoading(false);
  }, [loadPatient, loadDiagnoses, loadPrescriptions, loadExams, loadAiRecommendedTests, loadUnifiedAnalysis]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Initialize consultation notes from patient data
  useEffect(() => {
    if (patient && !notesInitialized.current) {
      setConsultationNotes(patient.consultationNotes || '');
      notesInitialized.current = true;
    }
  }, [patient]);

  // Auto-save consultation notes with 30s debounce
  const saveConsultationNotes = useCallback(async (notes: string) => {
    if (!id) return;
    setNotesSaveStatus('saving');
    try {
      const api = await getApi();
      await api.put(API_ROUTES.patients.consultationNotes(id), { notes });
      setNotesSaveStatus('saved');
      setTimeout(() => setNotesSaveStatus('idle'), 3000);
    } catch {
      setNotesSaveStatus('idle');
    }
  }, [id]);

  const handleConsultationNotesChange = useCallback((value: string) => {
    setConsultationNotes(value);
    setNotesSaveStatus('idle');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveConsultationNotes(value);
    }, 30000);
  }, [saveConsultationNotes]);

  // Cleanup timer on unmount & flush pending save
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Resume hold handler
  const handleResumeHold = async () => {
    if (!id) return;
    setActionLoading('resume-hold');
    try {
      const api = await getApi();
      await api.post(API_ROUTES.patients.resumeHold(id));
      await loadPatient();
    } catch (err: any) {
      console.error('Error resuming hold:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Redirect to treatment box handler
  const handleRedirectToBox = async (): Promise<void> => {
    try {
      setActionLoading('redirect');
      const api = await getApi();
      await api.post(API_ROUTES.patients.hold(id!), {
        holdStatus: 'waiting_for_treatment',
        holdReason: 'Redirigé vers box de soins',
      });
      setShowRedirectToBoxModal(false);
      setRedirectSuccess('Patient redirigé vers le box de soins avec succès');
      await loadAll();
      setTimeout(() => setRedirectSuccess(null), 5000);
    } catch (err: any) {
      console.error('Error redirecting to treatment:', err);
      setError(err.response?.data?.error || 'Erreur lors de la redirection');
    } finally {
      setActionLoading(null);
    }
  };

  // Computed: whether patient has active prescriptions or pending exams
  const activePrescriptionCount = prescriptions.filter(p => p.status === PrescriptionStatus.ACTIVE).length;
  const pendingExamCount = exams.filter(e => e.status === ExamStatus.REQUESTED || e.status === ExamStatus.IN_PROGRESS).length;
  const hasActiveWork = activePrescriptionCount > 0 || pendingExamCount > 0;

  // Rabies protocol detection
  const rabiesKeywords = [
    'rage', 'rabique', 'morsure animale', 'morsure de chien', 'morsure de chat',
    'morsure animal', 'griffure animale', 'griffure de chat', 'griffure de chien',
    'morsure', 'griffure',
  ];
  const chiefComplaintLower = (patient?.chiefComplaint || '').toLowerCase();
  const hasRabiesChiefComplaint = rabiesKeywords.some(kw => chiefComplaintLower.includes(kw));
  const hasRabiesDiagnosis = diagnoses.some(
    d => d.status !== DiagnosisStatus.RULED_OUT &&
      (d.diagnosisName.toLowerCase().includes('rage') || d.diagnosisName.toLowerCase().includes('rabique'))
  );
  const hasExistingRabiesPrescription = prescriptions.some(
    p => p.status !== PrescriptionStatus.CANCELLED &&
      (p.medicationName.toLowerCase().includes('anti-rabique') ||
       p.medicationName.toLowerCase().includes('vaccin rabique'))
  );
  const showRabiesAlert = (hasRabiesChiefComplaint || hasRabiesDiagnosis) &&
    !hasExistingRabiesPrescription && !rabiesAlertDismissed;

  const handleAddRabiesProtocol = () => {
    setPrescriptionInitialData({
      medicationName: 'Vaccin anti-rabique (protocole Essen)',
      dosage: '1 dose',
      route: MedicationRoute.IM,
      frequency: '',
      instructions: 'Protocole Essen post-exposition: J0, J3, J7, J14, J28. Administrer dans le deltoïde. Vérifier statut SAT (sérum anti-tétanique) et VAT (vaccin anti-tétanique). Nettoyer et désinfecter la plaie.',
      administeredInBox: true,
    });
    setShowPrescriptionModal(true);
  };

  // Handle AI suggestion selection
  const handleUseAISuggestion = (suggestion: {
    diagnosis: string;
    confidence: number;
    reasoning: string;
    urgency: 'routine' | 'urgent' | 'emergent';
    icd10Code?: string;
  }) => {
    // Map urgency to severity
    const severityMap: Record<string, string> = {
      emergent: 'CRITICAL',
      urgent: 'SEVERE',
      routine: 'MODERATE',
    };

    setAiDiagnosisInitialData({
      diagnosisCode: suggestion.icd10Code || '',
      diagnosisName: suggestion.diagnosis,
      diagnosisType: 'DIFFERENTIAL', // AI suggestions start as differential
      severity: severityMap[suggestion.urgency] || '',
      notes: `Suggestion IA: ${suggestion.reasoning}`,
      aiConfidence: suggestion.confidence, // Pass confidence to show indicator in modal
    });
    setShowDiagnosisModal(true);
  };

  // Confirm diagnosis
  const handleConfirmDiagnosis = async (diagnosisId: string) => {
    setActionLoading(`confirm-${diagnosisId}`);
    try {
      const api = await getApi();
      await api.post(API_ROUTES.diagnoses.confirm(diagnosisId));
      await loadDiagnoses();
    } catch (err: any) {
      console.error('Error confirming diagnosis:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Rule out diagnosis
  const handleRuleOutDiagnosis = async (diagnosisId: string) => {
    setActionLoading(`ruleout-${diagnosisId}`);
    try {
      const api = await getApi();
      await api.put(API_ROUTES.diagnoses.update(diagnosisId), { status: DiagnosisStatus.RULED_OUT });
      await loadDiagnoses();
    } catch (err: any) {
      console.error('Error ruling out diagnosis:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Resolve diagnosis
  const handleResolveDiagnosis = async (diagnosisId: string) => {
    setActionLoading(`resolve-${diagnosisId}`);
    try {
      const api = await getApi();
      await api.put(API_ROUTES.diagnoses.update(diagnosisId), { status: 'RESOLVED' });
      await loadDiagnoses();
    } catch (err: any) {
      console.error('Error resolving diagnosis:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Parse JSON-or-CSV string into array
  const parseStringOrJsonArray = (value: string | undefined | null): string[] => {
    if (!value) return [];
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch { /* fall through to CSV */ }
    }
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  };

  // Parse chronic conditions
  const chronicConditions = parseStringOrJsonArray(patient?.chronicConditions);

  // Parse allergies
  const allergies = parseStringOrJsonArray(patient?.allergies);

  // Parse current medications
  const currentMedications = parseStringOrJsonArray(patient?.currentMedications);

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
            onClick={() => navigate(CLIENT_ROUTES.doctor.patients)}
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
      <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center items-start gap-2 justify-between mb-4 sm:mb-6 md:mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate(CLIENT_ROUTES.doctor.patients)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">{patient.fullName}</h1>
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

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6 md:mb-8 p-3 bg-gray-50 rounded-lg">
          <Button
            size="sm"
            onClick={() => {
              setEditingDiagnosis(null);
              setAiDiagnosisInitialData(undefined);
              setShowDiagnosisModal(true);
            }}
          >
            <Stethoscope className="h-4 w-4 mr-2" />
            Ajouter Diagnostic
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPrescriptionModal(true)}
          >
            <Pill className="h-4 w-4 mr-2" />
            Prescrire
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowTransferModal(true)}
            disabled={patient.status === PatientStatus.DISCHARGED}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Transférer
          </Button>
          {(patient.status === PatientStatus.WITH_DOCTOR || patient.status === PatientStatus.IN_TREATMENT) && !patient.holdStatus && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRedirectToBoxModal(true)}
              disabled={!hasActiveWork}
              className="text-indigo-700 border-indigo-300 hover:bg-indigo-50"
              title={!hasActiveWork ? 'Aucune prescription ou examen en cours' : undefined}
            >
              <BedDouble className="h-4 w-4 mr-2" />
              Rediriger vers box de soins
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowHoldModal(true)}
            disabled={patient.status === PatientStatus.DISCHARGED || !!patient.holdStatus}
            className="ml-auto"
          >
            <Pause className="h-4 w-4 mr-2" />
            Mettre en attente
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDischargeModal(true)}
            disabled={patient.status === PatientStatus.DISCHARGED}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sortie
          </Button>
        </div>

        {/* Vitals — compact full-width strip */}
        <div className="mb-3 p-2.5 bg-white border rounded-lg shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {((() => {
              const items: { icon: typeof Thermometer; label: string; value: string; alert?: boolean; warn?: boolean; unit?: string }[] = [
                { icon: Thermometer, label: 'T°', value: patient.temperature ? `${patient.temperature}°C` : '—',
                  alert: !!(patient.temperature && (patient.temperature < 36 || patient.temperature > 38)) },
                { icon: Heart, label: 'FC', value: patient.heartRate ? `${patient.heartRate}` : '—',
                  alert: !!(patient.heartRate && (patient.heartRate < 60 || patient.heartRate > 100)), unit: 'bpm' },
                { icon: Activity, label: 'FR', value: patient.respiratoryRate ? `${patient.respiratoryRate}` : '—',
                  alert: !!(patient.respiratoryRate && (patient.respiratoryRate < 12 || patient.respiratoryRate > 20)), unit: '/min' },
                { icon: Activity, label: 'TA', value: patient.systolicBP && patient.diastolicBP ? `${patient.systolicBP}/${patient.diastolicBP}` : '—', unit: 'mmHg' },
                { icon: Droplets, label: 'SpO2', value: patient.oxygenSaturation ? `${patient.oxygenSaturation}%` : '—',
                  alert: !!(patient.oxygenSaturation && patient.oxygenSaturation < 94) },
                { icon: AlertTriangle, label: 'EVA', value: patient.painLevel !== undefined ? `${patient.painLevel}/10` : '—',
                  alert: !!(patient.painLevel && patient.painLevel >= 7), warn: !!(patient.painLevel && patient.painLevel >= 4 && patient.painLevel < 7) },
              ];
              return items;
            })()).map((v, i) => (
              <div key={i} className="flex items-center gap-1.5" title={v.label}>
                <v.icon className={`h-3.5 w-3.5 ${v.alert ? 'text-red-500' : v.warn ? 'text-amber-500' : 'text-gray-400'}`} />
                <span className="text-[10px] text-gray-400 uppercase">{v.label}</span>
                <span className={`text-sm font-bold ${v.alert ? 'text-red-600' : v.warn ? 'text-amber-600' : 'text-gray-900'}`}>
                  {v.value}
                </span>
                {v.unit && v.value !== '—' && <span className="text-[10px] text-gray-400">{v.unit}</span>}
              </div>
            ))}

            <div className="h-5 w-px bg-gray-200 hidden sm:block" />

            {([
              { label: 'NEWS', score: patient.newsScore, type: 'news' as const },
              { label: 'GCS', score: patient.gcsScore, type: 'gcs' as const },
              { label: 'qSOFA', score: patient.qsofaScore, type: 'qsofa' as const },
            ]).map((s, i) => (
              <div
                key={i}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold ${
                  s.score !== undefined ? getScoreColor(s.score, s.type) : 'bg-gray-50 text-gray-400'
                }`}
                title={s.score !== undefined ? getScoreLabel(s.score, s.type) : undefined}
              >
                <span className="text-[10px] font-medium opacity-70">{s.label}</span>
                <span>{s.score ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ABCDE — compact full-width strip */}
        {(() => {
          const parseABCDE = (json: string | undefined): Record<string, unknown> | null => {
            if (!json) return null;
            try { return JSON.parse(json); } catch { return null; }
          };
          const a = parseABCDE(patient.abcdeAirway);
          const b = parseABCDE(patient.abcdeBreathing);
          const c = parseABCDE(patient.abcdeCirculation);
          const d = parseABCDE(patient.abcdeDisability);
          const e = parseABCDE(patient.abcdeExposure);

          const critA = !!(a && (a.obstructed || a.stridor || a.patent === false));
          const critB = !!(b && (b.cyanosis || (typeof b.oxygenSaturation === 'number' && b.oxygenSaturation < 90) || b.workOfBreathing === 'severe'));
          const critC = !!(c && (c.bleeding || c.skinColor === 'mottled' || c.peripheralPulses === 'absent'));
          const critD = !!(d && ((typeof d.gcsEye === 'number' && typeof d.gcsVerbal === 'number' && typeof d.gcsMotor === 'number' && (d.gcsEye + d.gcsVerbal + d.gcsMotor) < 9) || d.pupils === 'unequal' || d.motorResponse === 'paralysis'));
          const critE = !!(e && (typeof e.temperature === 'number' && (e.temperature < 35 || e.temperature > 40)));

          const hasAny = a || b || c || d || e;
          if (!hasAny) return null;

          const summaryA = !a ? '—' : critA ? (a.obstructed ? 'Obstruées' : a.stridor ? 'Stridor' : 'Non libres') : 'Libres';
          const summaryB = !b ? '—' : [
            typeof b.respiratoryRate === 'number' ? `FR ${b.respiratoryRate}` : null,
            typeof b.oxygenSaturation === 'number' ? `SpO2 ${b.oxygenSaturation}%` : null,
            b.cyanosis ? 'Cyanose' : null,
          ].filter(Boolean).join(' · ') || 'RAS';
          const summaryC = !c ? '—' : [
            typeof c.heartRate === 'number' ? `FC ${c.heartRate}` : null,
            c.bloodPressure ? `TA ${c.bloodPressure}` : null,
            c.bleeding ? 'Saignement' : null,
          ].filter(Boolean).join(' · ') || 'RAS';
          const summaryD = !d ? '—' : [
            (typeof d.gcsEye === 'number' && typeof d.gcsVerbal === 'number' && typeof d.gcsMotor === 'number')
              ? `GCS ${d.gcsEye + d.gcsVerbal + d.gcsMotor}` : null,
            d.pupils ? (d.pupils === 'PEARL' ? 'Pupilles N' : `Pupilles ${d.pupils}`) : null,
          ].filter(Boolean).join(' · ') || 'RAS';
          const summaryE = !e ? '—' : [
            typeof e.temperature === 'number' ? `${e.temperature}°C` : null,
            e.rash ? 'Rash' : null,
            e.wounds ? 'Plaies' : null,
            e.edema ? 'Oedème' : null,
          ].filter(Boolean).join(' · ') || 'RAS';

          const categories: { letter: string; icon: typeof Wind; color: string; summary: string; critical: boolean }[] = [
            { letter: 'A', icon: Wind, color: 'bg-blue-500', summary: summaryA, critical: critA },
            { letter: 'B', icon: Activity, color: 'bg-cyan-500', summary: summaryB, critical: critB },
            { letter: 'C', icon: Heart, color: 'bg-red-500', summary: summaryC, critical: critC },
            { letter: 'D', icon: Brain, color: 'bg-purple-500', summary: summaryD, critical: critD },
            { letter: 'E', icon: Thermometer, color: 'bg-orange-500', summary: summaryE, critical: critE },
          ];

          return (
            <div className="mb-3 p-2 bg-white border rounded-lg shadow-sm">
              <div className="grid grid-cols-5 gap-2">
                {categories.map((cat) => (
                  <div
                    key={cat.letter}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${
                      cat.critical ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50'
                    }`}
                    title={`${cat.letter} — ${cat.summary}`}
                  >
                    <div className={`p-1 rounded ${cat.color} shrink-0`}>
                      <cat.icon className="h-3 w-3 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-gray-700">{cat.letter}</span>
                        {cat.critical && <AlertTriangle className="h-3 w-3 text-red-500" />}
                        {!cat.critical && cat.summary !== '—' && <CheckCircle className="h-3 w-3 text-green-500" />}
                      </div>
                      <p className={`text-[10px] leading-tight truncate ${cat.critical ? 'text-red-700 font-medium' : 'text-gray-500'}`}>
                        {cat.summary}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

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

        {/* Hold Banner */}
        {patient.holdStatus && (() => {
          const isTreatmentDone = patient.holdStatus === 'treatment_done';
          return (
            <div className={`mb-6 p-4 border-2 rounded-lg ${isTreatmentDone ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isTreatmentDone ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <Pause className="h-5 w-5 text-amber-600" />
                  )}
                  <div>
                    <p className={`font-semibold ${isTreatmentDone ? 'text-green-800' : 'text-amber-800'}`}>
                      {isTreatmentDone
                        ? 'Soins terminés — Patient prêt à reprendre la consultation'
                        : `Patient en attente — ${holdStatusLabels[patient.holdStatus] || patient.holdStatus}`}
                    </p>
                    {!isTreatmentDone && patient.holdReason && (
                      <p className="text-sm text-amber-700 mt-0.5">{patient.holdReason}</p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleResumeHold}
                  disabled={actionLoading === 'resume-hold'}
                  className={isTreatmentDone ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}
                >
                  {actionLoading === 'resume-hold' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Reprendre la consultation
                </Button>
              </div>
            </div>
          );
        })()}

        {/* Redirect Success Banner */}
        {redirectSuccess && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              {redirectSuccess}
            </AlertDescription>
          </Alert>
        )}

        {/* Rabies Protocol Alert */}
        {showRabiesAlert && (
          <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800">
                    Protocole vaccinal anti-rabique recommandé
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    Morsure/griffure animale détectée. Le protocole vaccinal anti-rabique post-exposition est recommandé.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={handleAddRabiesProtocol}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  <Syringe className="h-4 w-4 mr-2" />
                  Ajouter le protocole
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRabiesAlertDismissed(true)}
                  className="text-amber-600 hover:text-amber-800 hover:bg-amber-100"
                >
                  Ignorer
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Critical Alerts from Unified Analysis */}
        {unifiedAnalysis && unifiedAnalysis.criticalAlerts.length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-400 rounded-lg">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-red-800 mb-1">Alertes critiques</p>
                <ul className="space-y-1">
                  {unifiedAnalysis.criticalAlerts.map((alert, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-red-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                      {alert}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Main Content - 2 columns on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          {/* Left Column - 2/3 width */}
          <div className="lg:col-span-2 space-y-3 sm:space-y-4 md:space-y-6">
            {/* Chief Complaint & Medical History */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                  Motif de consultation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-gray-900 font-medium">
                    {patient.chiefComplaint || 'Non renseigné'}
                  </p>
                  {patient.symptomOnset && (
                    <p className="text-sm text-gray-500 mt-1">
                      Début des symptômes : {patient.symptomOnset}
                    </p>
                  )}
                </div>

                {/* Orientation Reason from Unified Analysis */}
                {unifiedAnalysis?.orientationReason && (
                  <div className="pt-3 border-t">
                    <p className="text-sm font-medium text-gray-600 mb-1">
                      <Shield className="h-4 w-4 inline mr-1" />
                      Raison de l'orientation ({unifiedAnalysis.orientation})
                    </p>
                    <p className="text-sm text-gray-700">{unifiedAnalysis.orientationReason}</p>
                  </div>
                )}

                {/* Chronic Conditions */}
                {chronicConditions.length > 0 && (
                  <div className="pt-3 border-t">
                    <p className="text-sm font-medium text-gray-600 mb-2">
                      <History className="h-4 w-4 inline mr-1" />
                      Antécédents / Maladies chroniques
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {chronicConditions.map((condition, idx) => (
                        <Badge key={idx} variant="secondary">
                          {condition}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Current Medications */}
                {currentMedications.length > 0 && (
                  <div className="pt-3 border-t">
                    <p className="text-sm font-medium text-gray-600 mb-2">
                      <Pill className="h-4 w-4 inline mr-1" />
                      Traitement en cours
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {currentMedications.map((med, idx) => (
                        <Badge key={idx} variant="secondary">{med}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Clinical Analysis (from Unified Analysis) */}
            {unifiedAnalysis && (
              <Card className="border-purple-200 bg-gradient-to-br from-purple-50/50 to-white">
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Brain className="h-4 w-4 text-purple-600" />
                      Analyse Clinique IA
                    </CardTitle>
                    <span className="text-[10px] text-gray-400">
                      {new Date(unifiedAnalysis.analysisTimestamp).toLocaleString('fr-FR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {/* Medical Interventions — compact bullets */}
                  {unifiedAnalysis.medicalInterventions.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-blue-800 mb-1 flex items-center gap-1">
                        <Stethoscope className="h-3.5 w-3.5" />
                        Interventions médicales
                      </p>
                      <ul className="space-y-0.5">
                        {unifiedAnalysis.medicalInterventions.map((intervention, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 text-xs text-blue-900">
                            <span className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                            {intervention}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Pathology Hypotheses — top 1 expanded, rest compact */}
                  {unifiedAnalysis.pathologies.length > 0 && (
                    <div className="pt-2 border-t border-purple-100">
                      <p className="text-xs font-semibold text-purple-800 mb-1.5 flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5" />
                        Hypothèses diagnostiques ({unifiedAnalysis.pathologies.length})
                      </p>

                      {/* Top pathology — expanded */}
                      {(() => {
                        const top = unifiedAnalysis.pathologies[0];
                        return (
                          <div className="p-2.5 bg-white rounded-lg border border-gray-200 shadow-sm mb-2">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-gray-900 truncate">{top.name}</p>
                                {top.icd10Code && <span className="text-[10px] text-gray-400">{top.icd10Code}</span>}
                              </div>
                              <Badge className={`text-[10px] shrink-0 ${
                                top.urgency === 'emergent' ? 'bg-red-500 text-white' :
                                top.urgency === 'urgent' ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'
                              }`}>
                                {top.urgency === 'emergent' ? 'Emergent' : top.urgency === 'urgent' ? 'Urgent' : 'Routine'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    top.confidence >= 80 ? 'bg-green-500' : top.confidence >= 50 ? 'bg-yellow-500' : 'bg-orange-500'
                                  }`}
                                  style={{ width: `${top.confidence}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-gray-600 w-10 text-right">{top.confidence}%</span>
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-2">{top.reasoning}</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-1.5 w-full h-7 text-xs"
                              onClick={() => handleUseAISuggestion({
                                diagnosis: top.name, confidence: top.confidence,
                                reasoning: top.reasoning, urgency: top.urgency, icd10Code: top.icd10Code,
                              })}
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              Utiliser ce diagnostic
                            </Button>
                          </div>
                        );
                      })()}

                      {/* Remaining pathologies — compact, expandable */}
                      {unifiedAnalysis.pathologies.length > 1 && (
                        <>
                          {!collapsedSections.morePathologies ? (
                            <button
                              type="button"
                              className="w-full text-center text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 py-1.5 rounded-md border border-dashed border-purple-200"
                              onClick={() => toggleSection('morePathologies')}
                            >
                              Voir {unifiedAnalysis.pathologies.length - 1} autre{unifiedAnalysis.pathologies.length > 2 ? 's' : ''} hypothèse{unifiedAnalysis.pathologies.length > 2 ? 's' : ''}
                            </button>
                          ) : (
                            <div className="space-y-1.5">
                              {unifiedAnalysis.pathologies.slice(1).map((pathology, idx) => (
                                <div key={idx} className="p-2 bg-white rounded-lg border border-gray-200">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className="font-medium text-xs text-gray-900 truncate flex-1">{pathology.name}</p>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <Badge className={`text-[10px] px-1.5 py-0 ${
                                        pathology.urgency === 'emergent' ? 'bg-red-500 text-white' :
                                        pathology.urgency === 'urgent' ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'
                                      }`}>
                                        {pathology.urgency === 'emergent' ? 'E' : pathology.urgency === 'urgent' ? 'U' : 'R'}
                                      </Badge>
                                      <span className="text-[10px] font-medium text-gray-500">{pathology.confidence}%</span>
                                    </div>
                                  </div>
                                  <div className="flex-1 bg-gray-200 rounded-full h-1 mb-1">
                                    <div
                                      className={`h-1 rounded-full ${
                                        pathology.confidence >= 80 ? 'bg-green-500' : pathology.confidence >= 50 ? 'bg-yellow-500' : 'bg-orange-500'
                                      }`}
                                      style={{ width: `${pathology.confidence}%` }}
                                    />
                                  </div>
                                  <p className="text-[11px] text-gray-500 line-clamp-1">{pathology.reasoning}</p>
                                  <button
                                    className="mt-1 text-[10px] text-purple-600 hover:text-purple-800 font-medium"
                                    onClick={() => handleUseAISuggestion({
                                      diagnosis: pathology.name, confidence: pathology.confidence,
                                      reasoning: pathology.reasoning, urgency: pathology.urgency, icd10Code: pathology.icd10Code,
                                    })}
                                  >
                                    <Zap className="h-3 w-3 inline mr-0.5" />
                                    Utiliser
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="w-full text-center text-[10px] text-gray-400 hover:text-gray-600 py-1"
                                onClick={() => toggleSection('morePathologies')}
                              >
                                Réduire
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Warnings — collapsible, default closed */}
                  {unifiedAnalysis.warnings.length > 0 && (
                    <div className="pt-2 border-t border-purple-100">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 w-full"
                        onClick={() => toggleSection('aiWarnings')}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Avertissements ({unifiedAnalysis.warnings.length})
                        {collapsedSections.aiWarnings
                          ? <ChevronUp className="h-3 w-3 ml-auto" />
                          : <ChevronDown className="h-3 w-3 ml-auto" />
                        }
                      </button>
                      {collapsedSections.aiWarnings && (
                        <ul className="mt-1 space-y-0.5">
                          {unifiedAnalysis.warnings.map((w, idx) => (
                            <li key={idx} className="flex items-start gap-1.5 text-xs text-amber-800">
                              <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI Pre-Diagnosis Panel (generate/streaming) — shown when no unified analysis */}
            {!unifiedAnalysis && (
              <AIPreDiagnosisPanel
                patientId={patient.id}
                onUseSuggestion={handleUseAISuggestion}
                onRequestExam={(testName) => setAiPanelQuickOrder(testName)}
                requestedExamNames={exams.filter(e => e.status !== ExamStatus.CANCELLED).map(e => e.examName)}
              />
            )}

          </div>

          {/* Right Column - 1/3 width */}
          <div className="space-y-3 sm:space-y-4 md:space-y-6">
            {/* Diagnoses Section */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Diagnostics</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingDiagnosis(null);
                      setAiDiagnosisInitialData(undefined);
                      setShowDiagnosisModal(true);
                    }}
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
                            : diagnosis.status === DiagnosisStatus.RULED_OUT
                              ? 'border-gray-300 bg-gray-100 opacity-75'
                              : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {getTypeIcon(diagnosis.diagnosisType)}
                            <div>
                              <p className={`font-medium ${
                                diagnosis.status === DiagnosisStatus.RULED_OUT
                                  ? 'text-gray-500 line-through'
                                  : 'text-gray-900'
                              }`}>
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
                          {diagnosis.confirmedAt && (
                            <Badge variant="success" className="text-xs">
                              Confirmé
                            </Badge>
                          )}
                        </div>
                        {diagnosis.notes && (
                          <p className="text-sm text-gray-600 mt-2">
                            {diagnosis.notes}
                          </p>
                        )}

                        {/* Action buttons for active diagnoses */}
                        {diagnosis.status === DiagnosisStatus.ACTIVE && !diagnosis.confirmedAt && (
                          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-300 hover:bg-green-50"
                              onClick={() => handleConfirmDiagnosis(diagnosis.id)}
                              disabled={actionLoading === `confirm-${diagnosis.id}`}
                            >
                              {actionLoading === `confirm-${diagnosis.id}` ? (
                                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3 w-3 mr-1" />
                              )}
                              Confirmer
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50"
                              onClick={() => handleRuleOutDiagnosis(diagnosis.id)}
                              disabled={actionLoading === `ruleout-${diagnosis.id}`}
                            >
                              {actionLoading === `ruleout-${diagnosis.id}` ? (
                                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <XCircle className="h-3 w-3 mr-1" />
                              )}
                              Exclure
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingDiagnosis(diagnosis);
                                setAiDiagnosisInitialData(undefined);
                                setShowDiagnosisModal(true);
                              }}
                            >
                              <Edit3 className="h-3 w-3 mr-1" />
                              Modifier
                            </Button>
                          </div>
                        )}

                        {/* Resolve + Edit buttons for confirmed active diagnoses */}
                        {diagnosis.status === DiagnosisStatus.ACTIVE && diagnosis.confirmedAt && (
                          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleResolveDiagnosis(diagnosis.id)}
                              disabled={actionLoading === `resolve-${diagnosis.id}`}
                            >
                              {actionLoading === `resolve-${diagnosis.id}` ? (
                                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3 w-3 mr-1" />
                              )}
                              Marquer résolu
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingDiagnosis(diagnosis);
                                setAiDiagnosisInitialData(undefined);
                                setShowDiagnosisModal(true);
                              }}
                            >
                              <Edit3 className="h-3 w-3 mr-1" />
                              Modifier
                            </Button>
                          </div>
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
                        className={`p-3 rounded-lg border ${
                          prescription.status === PrescriptionStatus.CANCELLED
                            ? 'border-red-200 bg-red-50 opacity-75'
                            : prescription.status === PrescriptionStatus.ON_HOLD
                              ? 'border-amber-200 bg-amber-50'
                              : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <Pill className={`h-4 w-4 mt-0.5 ${
                              prescription.status === PrescriptionStatus.CANCELLED
                                ? 'text-red-400'
                                : 'text-blue-600'
                            }`} />
                            <div>
                              <p className={`font-medium ${
                                prescription.status === PrescriptionStatus.CANCELLED
                                  ? 'text-gray-500 line-through'
                                  : 'text-gray-900'
                              }`}>
                                {prescription.medicationName}
                              </p>
                              <p className="text-sm text-gray-600">
                                {prescription.dosage} - {medicationRouteLabels[prescription.route]}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {prescription.administeredInBox && (
                              <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100 text-xs">
                                <Syringe className="h-3 w-3 mr-1" />
                                Box des soins
                              </Badge>
                            )}
                            {getPrescriptionStatusBadge(prescription.status)}
                          </div>
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

                        {/* Action buttons for active/on-hold prescriptions */}
                        {(prescription.status === PrescriptionStatus.ACTIVE ||
                          prescription.status === PrescriptionStatus.ON_HOLD) && (
                          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingPrescription(prescription)}
                            >
                              <Edit3 className="h-3 w-3 mr-1" />
                              Modifier
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50"
                              onClick={() => setPrescriptionToCancel(prescription)}
                            >
                              <Ban className="h-3 w-3 mr-1" />
                              Annuler
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Recommended Tests (near Exams panel) */}
            {unifiedAnalysis && unifiedAnalysis.recommendedTests.length > 0 && (
              <Card className="border-indigo-100">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5 text-indigo-800">
                    <FlaskConical className="h-3.5 w-3.5" />
                    Examens recommandés (IA)
                    <Badge variant="outline" className="text-[10px] text-indigo-500 border-indigo-200 ml-auto">
                      {unifiedAnalysis.recommendedTests.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-1">
                  <div className="space-y-1">
                    {unifiedAnalysis.recommendedTests.map((test, idx) => {
                      const alreadyRequested = exams
                        .filter(e => e.status !== ExamStatus.CANCELLED)
                        .some(e => e.examName.toLowerCase().trim() === test.toLowerCase().trim());
                      return (
                        <div key={idx} className="flex items-center justify-between py-1 px-2 rounded hover:bg-indigo-50 text-xs">
                          <span className="text-gray-700 truncate mr-2">{test}</span>
                          {alreadyRequested ? (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                              Demandé
                            </Badge>
                          ) : (
                            <button
                              onClick={() => setAiPanelQuickOrder(test)}
                              className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0"
                            >
                              + Demander
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Complementary Exams */}
            <ExamsPanel
              patientId={patient.id}
              aiRecommendedTests={aiRecommendedTests}
              refreshKey={examsRefreshKey}
            />

            {/* Consultation Notes (auto-save) */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Edit3 className="h-5 w-5 text-gray-500" />
                    Notes de consultation
                  </CardTitle>
                  <div className="text-xs text-gray-500">
                    {notesSaveStatus === 'saving' && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Sauvegarde en cours...
                      </span>
                    )}
                    {notesSaveStatus === 'saved' && (
                      <span className="flex items-center gap-1 text-green-600">
                        <Save className="h-3 w-3" />
                        Sauvegardé
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <textarea
                  value={consultationNotes}
                  onChange={(e) => handleConsultationNotesChange(e.target.value)}
                  placeholder="Notes du médecin (sauvegarde automatique)..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                  rows={5}
                  disabled={patient.status === PatientStatus.DISCHARGED}
                />
                <p className="text-xs text-gray-400 mt-1">Sauvegarde automatique après 30 secondes d'inactivité</p>
              </CardContent>
            </Card>

            {/* Treatment Notes (collapsible, default closed) */}
            {(() => {
              // Parse treatment notes: could be JSON array of objects or plain text
              let parsedNotes: { content: string; type?: string; createdAt?: string }[] = [];
              if (patient.treatmentNotes) {
                const trimmed = patient.treatmentNotes.trim();
                if (trimmed.startsWith('[')) {
                  try {
                    const arr = JSON.parse(trimmed);
                    if (Array.isArray(arr)) {
                      parsedNotes = arr.map((n: Record<string, unknown>) => ({
                        content: String(n.content || n.note || n.text || ''),
                        type: n.type ? String(n.type) : undefined,
                        createdAt: n.createdAt ? String(n.createdAt) : undefined,
                      })).filter(n => n.content);
                    }
                  } catch {
                    // Fall through to plain text
                    parsedNotes = trimmed.split('\n\n').filter(Boolean).map(s => ({ content: s }));
                  }
                } else {
                  parsedNotes = trimmed.split('\n\n').filter(Boolean).map(s => ({ content: s }));
                }
              }
              return (
                <Card>
                  <CardHeader
                    className="pb-2 cursor-pointer select-none"
                    onClick={() => toggleSection('treatmentNotes')}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Edit3 className="h-5 w-5 text-gray-500" />
                        Notes de traitement
                        {parsedNotes.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {parsedNotes.length}
                          </Badge>
                        )}
                      </CardTitle>
                      {collapsedSections.treatmentNotes ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </CardHeader>
                  {!collapsedSections.treatmentNotes && (
                    <CardContent>
                      {parsedNotes.length > 0 ? (
                        <div className="space-y-2">
                          {parsedNotes.map((note, idx) => (
                            <div
                              key={idx}
                              className={`p-2 rounded text-sm ${
                                note.type === 'transfer' || note.content.startsWith('[Transfert]')
                                  ? 'bg-blue-50 border-l-2 border-blue-400'
                                  : note.type === 'retriage_request'
                                    ? 'bg-amber-50 border-l-2 border-amber-400'
                                    : 'bg-gray-50'
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{note.content}</p>
                              {note.createdAt && (
                                <p className="text-[10px] text-gray-400 mt-1">
                                  {formatDateTime(note.createdAt)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm italic text-center py-4">
                          Aucune note de traitement
                        </p>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })()}

            {/* Timeline (collapsible, default closed) */}
            <Card>
              <CardHeader
                className="pb-2 cursor-pointer select-none"
                onClick={() => toggleSection('timeline')}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-500" />
                    Chronologie
                  </CardTitle>
                  {collapsedSections.timeline ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </CardHeader>
              {!collapsedSections.timeline && (
                <CardContent>
                  {patient.status === PatientStatus.DISCHARGED && (
                    <div className="p-3 bg-gray-100 rounded-lg text-center mb-3">
                      <p className="text-sm text-gray-600">
                        Patient sorti le {formatDateTime(patient.dischargedAt!)}
                      </p>
                      <p className="text-sm font-medium">
                        {dischargeTypeLabels[patient.dischargeType || 'home']}
                      </p>
                    </div>
                  )}
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
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Modals */}
      <DiagnosisModal
        isOpen={showDiagnosisModal}
        patientId={patient.id}
        onClose={() => {
          setShowDiagnosisModal(false);
          setAiDiagnosisInitialData(undefined);
          setEditingDiagnosis(null);
        }}
        onSuccess={() => {
          loadDiagnoses();
          setEditingDiagnosis(null);
        }}
        initialData={aiDiagnosisInitialData}
        editDiagnosis={editingDiagnosis}
      />

      {showPrescriptionModal && (
        <PrescriptionEntryModal
          patientId={patient.id}
          initialData={prescriptionInitialData}
          onClose={() => {
            setShowPrescriptionModal(false);
            setPrescriptionInitialData(undefined);
          }}
          onSuccess={() => {
            setShowPrescriptionModal(false);
            setPrescriptionInitialData(undefined);
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
          navigate(CLIENT_ROUTES.doctor.patients);
        }}
      />

      <HoldPatientModal
        isOpen={showHoldModal}
        patient={patient}
        onClose={() => setShowHoldModal(false)}
        onSuccess={() => {
          setShowHoldModal(false);
          loadPatient();
        }}
      />

      {showTransferModal && (
        <TransferModal
          patient={patient}
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => {
            setShowTransferModal(false);
            loadPatient();
          }}
        />
      )}

      {editingPrescription && (
        <PrescriptionModal
          isOpen={!!editingPrescription}
          patientId={patient.id}
          editPrescription={editingPrescription}
          onClose={() => setEditingPrescription(null)}
          onSuccess={() => {
            setEditingPrescription(null);
            loadPrescriptions();
          }}
        />
      )}

      {prescriptionToCancel && (
        <CancelPrescriptionModal
          prescription={prescriptionToCancel}
          onClose={() => setPrescriptionToCancel(null)}
          onSuccess={() => {
            setPrescriptionToCancel(null);
            loadPrescriptions();
          }}
        />
      )}

      {aiPanelQuickOrder && (
        <AIQuickOrderPopover
          testName={aiPanelQuickOrder}
          patientId={patient.id}
          onClose={() => setAiPanelQuickOrder(null)}
          onSuccess={() => {
            setAiPanelQuickOrder(null);
            loadExams();
            setExamsRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Redirect to treatment box confirmation dialog */}
      <Dialog open={showRedirectToBoxModal} onOpenChange={(open) => !open && setShowRedirectToBoxModal(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BedDouble className="h-5 w-5 text-indigo-500" />
              Rediriger vers le box de soins
            </DialogTitle>
            <DialogDescription>
              {patient.fullName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              Le patient sera mis en attente et apparaîtra dans la file de soins de l'infirmier(e) de traitement.
            </p>

            <div className="bg-indigo-50 rounded-lg p-3 space-y-1">
              {activePrescriptionCount > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Pill className="h-4 w-4 text-indigo-600" />
                  <span className="text-indigo-800">{activePrescriptionCount} prescription(s) active(s)</span>
                </div>
              )}
              {pendingExamCount > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  <span className="text-indigo-800">{pendingExamCount} examen(s) en attente</span>
                </div>
              )}
              {!hasActiveWork && (
                <p className="text-sm text-amber-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Aucune prescription ou examen en cours.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRedirectToBoxModal(false)} disabled={actionLoading === 'redirect'}>
              Annuler
            </Button>
            <Button
              onClick={handleRedirectToBox}
              disabled={!hasActiveWork || actionLoading === 'redirect'}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {actionLoading === 'redirect' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Redirection...
                </>
              ) : (
                'Confirmer la redirection'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
