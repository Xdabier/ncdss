import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Plus,
  RefreshCw,
  Thermometer,
  Heart,
  Activity,
  Wind,
  X,
  User,
  Stethoscope,
  FileText,
  LogOut,
  Play,
  Pill,
  Loader2,
  CheckCircle,
  XCircle,
  Pause,
  HelpCircle,
  Ban,
  PlayCircle,
  CheckSquare,
  ArrowRightLeft,
} from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { getApi } from '../../../services/api';
import { CLIENT_ROUTES } from '../../../routes';
import { Patient, PatientStatus, Box, User as UserType, Prescription, MedicationRoute, AdministrationStatus, PrescriptionStatus, API_ROUTES } from '@ncdss/shared';
import { formatDateTime } from '../../../utils/dateUtils';
import { ReassignBoxModal } from '../../../components/shared/ReassignBoxModal';

// Treatment note interface
interface TreatmentNote {
  id: string;
  type: string;
  content: string;
  authorId: string;
  createdAt: string;
}

// ESI color mapping
const esiColors: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-black',
  4: 'bg-green-500 text-white',
  5: 'bg-blue-500 text-white',
};

// Orientation labels in French
const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  MEDICAL: 'Médical',
  SURGICAL: 'Chirurgical',
  TRAUMA: 'Traumato',
  PEDIATRIC: 'Pédiatrie',
};

// Note type labels and colors
const noteTypeConfig: Record<string, { label: string; color: string }> = {
  observation: { label: 'Observation', color: 'bg-blue-100 text-blue-800' },
  intervention: { label: 'Intervention', color: 'bg-green-100 text-green-800' },
  medication: { label: 'Médicament', color: 'bg-purple-100 text-purple-800' },
  alert: { label: 'Alerte', color: 'bg-red-100 text-red-800' },
  retriage_request: { label: 'Re-triage', color: 'bg-orange-100 text-orange-800' },
};

// Discharge type labels
const dischargeTypes = [
  { value: 'home', label: 'Retour à domicile' },
  { value: 'admission', label: 'Hospitalisation' },
  { value: 'transfer', label: 'Transfert' },
  { value: 'left_ama', label: 'Sorti contre avis médical' },
  { value: 'deceased', label: 'Décès' },
];

// Medication route labels in French
const routeLabels: Record<MedicationRoute, string> = {
  [MedicationRoute.PO]: 'PO',
  [MedicationRoute.IV]: 'IV',
  [MedicationRoute.IM]: 'IM',
  [MedicationRoute.SC]: 'SC',
  [MedicationRoute.SL]: 'SL',
  [MedicationRoute.INH]: 'INH',
  [MedicationRoute.TOP]: 'TOP',
  [MedicationRoute.PR]: 'PR',
  [MedicationRoute.OPH]: 'OPH',
};

// Administration status labels and colors
const administrationStatusConfig: Record<AdministrationStatus, { label: string; color: string; icon: React.ElementType }> = {
  [AdministrationStatus.GIVEN]: { label: 'Administré', color: 'text-green-600', icon: CheckCircle },
  [AdministrationStatus.REFUSED]: { label: 'Refusé', color: 'text-red-600', icon: XCircle },
  [AdministrationStatus.HELD]: { label: 'Retenu', color: 'text-orange-600', icon: Pause },
  [AdministrationStatus.NOT_AVAILABLE]: { label: 'Non disponible', color: 'text-gray-600', icon: HelpCircle },
};

// Prescription status labels and colors
const prescriptionStatusConfig: Record<PrescriptionStatus, { label: string; bgColor: string; textColor: string }> = {
  [PrescriptionStatus.ACTIVE]: { label: 'Actif', bgColor: 'bg-green-100', textColor: 'text-green-800' },
  [PrescriptionStatus.ON_HOLD]: { label: 'En pause', bgColor: 'bg-amber-100', textColor: 'text-amber-800' },
  [PrescriptionStatus.COMPLETED]: { label: 'Terminé', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
  [PrescriptionStatus.CANCELLED]: { label: 'Annulé', bgColor: 'bg-red-100', textColor: 'text-red-800' },
};

export default function PatientCare() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [successMessage, setSuccessMessage] = useState<string | null>(
    (location.state as { successMessage?: string } | null)?.successMessage || null
  );
  const [patient, setPatient] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<TreatmentNote[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [doctors, setDoctors] = useState<UserType[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('observation');
  const [addingNote, setAddingNote] = useState(false);
  const [showReTriageModal, setShowReTriageModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [showAdministrationModal, setShowAdministrationModal] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [prescriptionActionLoading, setPrescriptionActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  // Auto-dismiss success message after 6 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const loadData = async (): Promise<void> => {
    try {
      setLoading(true);
      const api = await getApi();
      const [patientRes, boxesRes, doctorsRes, activePresRes, holdPresRes] = await Promise.all([
        api.get(API_ROUTES.patients.byId(id!)),
        api.get(API_ROUTES.config.boxes),
        api.get(API_ROUTES.users.byRole('DOCTOR')),
        api.get(API_ROUTES.prescriptions.byPatient(id!), { params: { status: 'ACTIVE' } }),
        api.get(API_ROUTES.prescriptions.byPatient(id!), { params: { status: 'ON_HOLD' } }),
      ]);

      setPatient(patientRes.data);

      // Parse treatment notes from JSON
      if (patientRes.data.treatmentNotes) {
        try {
          setNotes(JSON.parse(patientRes.data.treatmentNotes));
        } catch {
          setNotes([]);
        }
      } else {
        setNotes([]);
      }

      setBoxes(boxesRes.data.filter((b: Box) => b.isActive));
      // API already filters by isActive, no need to filter again
      setDoctors(doctorsRes.data);
      // Combine ACTIVE and ON_HOLD prescriptions
      setPrescriptions([...activePresRes.data, ...holdPresRes.data]);
    } catch (error) {
      console.error('Error loading patient:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (): Promise<void> => {
    if (!newNote.trim() || !id) return;

    try {
      setAddingNote(true);
      const api = await getApi();
      const response = await api.post(API_ROUTES.patients.notes(id!), {
        note: newNote.trim(),
        noteType,
      });

      setNotes([...notes, response.data]);
      setNewNote('');
    } catch (error) {
      console.error('Error adding note:', error);
    } finally {
      setAddingNote(false);
    }
  };

  const handleUpdateVitals = (): void => {
    navigate(CLIENT_ROUTES.nurse.treatment.vitals(id!));
  };

  const handleRequestReTriage = async (reason: string): Promise<void> => {
    if (!id) return;

    try {
      setActionLoading(true);
      const api = await getApi();
      await api.post(API_ROUTES.patients.requestRetriage(id!), { reason: reason.trim() || undefined });
      setShowReTriageModal(false);
      navigate(CLIENT_ROUTES.nurse.treatment.queue);
    } catch (error) {
      console.error('Error requesting re-triage:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDischarge = async (dischargeType: string, dischargeNotes: string): Promise<void> => {
    if (!id) return;

    try {
      setActionLoading(true);
      const api = await getApi();
      await api.post(API_ROUTES.patients.discharge(id!), {
        dischargeType,
        dischargeNotes: dischargeNotes.trim() || null,
      });
      setShowDischargeModal(false);
      navigate(CLIENT_ROUTES.nurse.treatment.queue);
    } catch (error) {
      console.error('Error discharging patient:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartTreatment = async (boxId?: string): Promise<void> => {
    if (!id) return;

    try {
      setActionLoading(true);
      const api = await getApi();
      const response = await api.post(API_ROUTES.patients.startTreatment(id!), { boxId: boxId || null });

      const assignedDoctorName = response.data.assignedDoctorName;
      if (assignedDoctorName) {
        setSuccessMessage(`Dr. ${assignedDoctorName} auto-assigné au patient`);
      }

      await loadData();
    } catch (error) {
      console.error('Error starting treatment:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenAdministration = (prescription: Prescription): void => {
    setSelectedPrescription(prescription);
    setShowAdministrationModal(true);
  };

  const handleAdministrationSuccess = async (): Promise<void> => {
    // Reload prescriptions after administration
    try {
      const api = await getApi();
      const prescriptionsRes = await api.get(API_ROUTES.prescriptions.byPatient(id!), { params: { status: 'ACTIVE' } });
      setPrescriptions(prescriptionsRes.data);
    } catch (error) {
      console.error('Error reloading prescriptions:', error);
    }
  };

  const reloadPrescriptions = async (): Promise<void> => {
    try {
      const api = await getApi();
      // Get both ACTIVE and ON_HOLD prescriptions
      const [activeRes, holdRes] = await Promise.all([
        api.get(API_ROUTES.prescriptions.byPatient(id!), { params: { status: 'ACTIVE' } }),
        api.get(API_ROUTES.prescriptions.byPatient(id!), { params: { status: 'ON_HOLD' } }),
      ]);
      setPrescriptions([...activeRes.data, ...holdRes.data]);
    } catch (error) {
      console.error('Error reloading prescriptions:', error);
    }
  };

  const handleHoldPrescription = async (prescriptionId: string, reason: string): Promise<void> => {
    setPrescriptionActionLoading(prescriptionId);
    try {
      const api = await getApi();
      await api.post(API_ROUTES.prescriptions.hold(prescriptionId), { reason });
      await reloadPrescriptions();
      setShowHoldModal(false);
      setSelectedPrescription(null);
    } catch (error) {
      console.error('Error holding prescription:', error);
    } finally {
      setPrescriptionActionLoading(null);
    }
  };

  const handleResumePrescription = async (prescriptionId: string): Promise<void> => {
    setPrescriptionActionLoading(prescriptionId);
    try {
      const api = await getApi();
      await api.post(API_ROUTES.prescriptions.resume(prescriptionId));
      await reloadPrescriptions();
    } catch (error) {
      console.error('Error resuming prescription:', error);
    } finally {
      setPrescriptionActionLoading(null);
    }
  };

  const handleCompletePrescription = async (prescriptionId: string): Promise<void> => {
    setPrescriptionActionLoading(prescriptionId);
    try {
      const api = await getApi();
      await api.post(API_ROUTES.prescriptions.complete(prescriptionId));
      await reloadPrescriptions();
    } catch (error) {
      console.error('Error completing prescription:', error);
    } finally {
      setPrescriptionActionLoading(null);
    }
  };

  const handleOpenHoldModal = (prescription: Prescription): void => {
    setSelectedPrescription(prescription);
    setShowHoldModal(true);
  };

  // Get last administration time for a prescription
  const getLastAdministration = (prescription: Prescription): string | null => {
    if (!prescription.administrations || prescription.administrations.length === 0) {
      return null;
    }
    // administrations are stored with most recent last
    const lastAdmin = prescription.administrations[prescription.administrations.length - 1];
    return lastAdmin.time;
  };

  // Loading state
  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Patient not found
  if (!patient) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Patient non trouvé</h2>
              <p className="text-gray-500 mb-4">Le patient demandé n'existe pas ou a été supprimé.</p>
              <Button onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.queue)}>Retour à la file</Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Get box name for display
  const assignedBox = boxes.find((b) => b.id === patient.assignedBoxId);

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Back button and title */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.queue)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <h1 className="text-2xl font-bold">Prise en Charge Patient</h1>
        </div>

        {/* Success message from box assignment */}
        {successMessage && (
          <Card className="mb-4 border-green-300 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <p className="font-medium text-green-800">{successMessage}</p>
                </div>
                <button
                  onClick={() => setSuccessMessage(null)}
                  className="text-green-600 hover:text-green-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Re-triage alert */}
        {patient.retriageRequested && (
          <Card className="mb-4 border-orange-300 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-medium text-orange-800">Re-triage demandé</p>
                  {patient.retriageReason && (
                    <p className="text-sm text-orange-700">Raison: {patient.retriageReason}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Patient Info & Vitals (2/3 width) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Patient Header */}
            <Card>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <User className="h-5 w-5 text-gray-400" />
                      {patient.fullName}
                    </h2>
                    <p className="text-gray-500 mt-1">
                      {patient.age} ans, {patient.sex === 'MALE' ? 'Homme' : 'Femme'}
                    </p>
                    {patient.nationalId && (
                      <p className="text-sm text-gray-400 mt-1">CIN: {patient.nationalId}</p>
                    )}
                  </div>
                  <div className="text-right space-y-2">
                    {/* ESI Badge */}
                    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${esiColors[patient.esiLevel ?? 5]}`}>
                      <span className="text-2xl font-bold">{patient.esiLevel ?? '—'}</span>
                      <span className="text-sm font-medium opacity-90">ESI</span>
                    </div>
                    {/* Orientation Badge */}
                    {patient.finalOrientation && (
                      <div>
                        <Badge variant="outline" className="text-sm">
                          {orientationLabels[patient.finalOrientation] || patient.finalOrientation}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chief complaint */}
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-700">
                    <FileText className="h-4 w-4 inline mr-2" />
                    Motif: {patient.chiefComplaint || 'Non spécifié'}
                  </p>
                </div>

                {/* Allergies alert */}
                {patient.allergies && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-700 font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Allergies: {patient.allergies}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vitals Summary */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5 text-gray-400" />
                    Constantes Vitales
                  </CardTitle>
                  <Button size="sm" onClick={handleUpdateVitals}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Mettre à jour
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Main vitals grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Temperature */}
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Thermometer className="h-5 w-5 mx-auto text-red-400 mb-1" />
                    <div className="text-2xl font-bold">
                      {patient.temperature ? `${patient.temperature}°` : '—'}
                    </div>
                    <div className="text-xs text-gray-500">Temp (°C)</div>
                  </div>

                  {/* Heart rate */}
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Heart className="h-5 w-5 mx-auto text-pink-400 mb-1" />
                    <div className="text-2xl font-bold">{patient.heartRate ?? '—'}</div>
                    <div className="text-xs text-gray-500">FC (bpm)</div>
                  </div>

                  {/* Blood pressure */}
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Activity className="h-5 w-5 mx-auto text-blue-400 mb-1" />
                    <div className="text-2xl font-bold">
                      {patient.systolicBP || patient.diastolicBP
                        ? `${patient.systolicBP ?? '—'}/${patient.diastolicBP ?? '—'}`
                        : '—'}
                    </div>
                    <div className="text-xs text-gray-500">TA (mmHg)</div>
                  </div>

                  {/* Oxygen saturation */}
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Wind className="h-5 w-5 mx-auto text-cyan-400 mb-1" />
                    <div className="text-2xl font-bold">
                      {patient.oxygenSaturation ? `${patient.oxygenSaturation}%` : '—'}
                    </div>
                    <div className="text-xs text-gray-500">SpO2</div>
                  </div>
                </div>

                {/* Scores row */}
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
                  {/* NEWS Score */}
                  <div className="text-center">
                    <div
                      className={`text-xl font-bold ${
                        (patient.newsScore ?? 0) >= 7
                          ? 'text-red-600'
                          : (patient.newsScore ?? 0) >= 5
                            ? 'text-orange-600'
                            : 'text-green-600'
                      }`}
                    >
                      {patient.newsScore ?? '—'}
                    </div>
                    <div className="text-xs text-gray-500">NEWS</div>
                    {(patient.newsScore ?? 0) >= 7 && (
                      <Badge variant="destructive" className="mt-1 text-xs">
                        Critique
                      </Badge>
                    )}
                  </div>

                  {/* GCS Score */}
                  <div className="text-center">
                    <div
                      className={`text-xl font-bold ${
                        (patient.gcsScore ?? 15) < 12 ? 'text-red-600' : 'text-gray-700'
                      }`}
                    >
                      {patient.gcsScore ?? '—'}
                    </div>
                    <div className="text-xs text-gray-500">GCS</div>
                    {(patient.gcsScore ?? 15) < 9 && (
                      <Badge variant="destructive" className="mt-1 text-xs">
                        Coma
                      </Badge>
                    )}
                  </div>

                  {/* qSOFA Score */}
                  <div className="text-center">
                    <div
                      className={`text-xl font-bold ${
                        (patient.qsofaScore ?? 0) >= 2 ? 'text-red-600' : 'text-gray-700'
                      }`}
                    >
                      {patient.qsofaScore ?? '—'}
                    </div>
                    <div className="text-xs text-gray-500">qSOFA</div>
                    {(patient.qsofaScore ?? 0) >= 2 && (
                      <Badge variant="destructive" className="mt-1 text-xs">
                        Sepsis
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Treatment Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-gray-400" />
                  Notes de Soins
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Add note form */}
                <div className="flex gap-2 mb-4">
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="observation">Observation</SelectItem>
                      <SelectItem value="intervention">Intervention</SelectItem>
                      <SelectItem value="medication">Médicament</SelectItem>
                      <SelectItem value="alert">Alerte</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Ajouter une note..."
                    className="flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddNote()}
                  />
                  <Button onClick={handleAddNote} disabled={!newNote.trim() || addingNote}>
                    <Plus className="h-4 w-4 mr-1" />
                    Ajouter
                  </Button>
                </div>

                {/* Notes list */}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {notes.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Aucune note</p>
                    </div>
                  ) : (
                    [...notes].reverse().map((note) => {
                      const config = noteTypeConfig[note.type] || {
                        label: note.type,
                        color: 'bg-gray-100 text-gray-800',
                      };
                      return (
                        <div
                          key={note.id}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                        >
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
                            {config.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700">{note.content}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {formatDateTime(note.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Prescriptions Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Pill className="h-5 w-5 text-purple-500" />
                  Prescriptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {prescriptions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Pill className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune prescription</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {prescriptions.map((prescription) => {
                      const lastAdminTime = getLastAdministration(prescription);
                      const statusConfig = prescriptionStatusConfig[prescription.status as PrescriptionStatus] ||
                        prescriptionStatusConfig[PrescriptionStatus.ACTIVE];
                      const isLoading = prescriptionActionLoading === prescription.id;
                      const isActive = prescription.status === PrescriptionStatus.ACTIVE;
                      const isOnHold = prescription.status === PrescriptionStatus.ON_HOLD;

                      return (
                        <div
                          key={prescription.id}
                          className={`p-4 border rounded-lg ${
                            isOnHold ? 'bg-amber-50 border-amber-200' : 'bg-gray-50'
                          }`}
                        >
                          {/* Prescription header */}
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-gray-900">
                                  {prescription.medicationName}
                                </h4>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                                  {statusConfig.label}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">
                                {prescription.dosage} - {routeLabels[prescription.route]}
                              </p>
                              <p className="text-sm text-gray-500">
                                {prescription.frequency}
                                {prescription.duration && ` (${prescription.duration})`}
                              </p>
                            </div>
                            {/* Administrer button only for ACTIVE prescriptions */}
                            {isActive && (
                              <Button
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-700"
                                onClick={() => handleOpenAdministration(prescription)}
                              >
                                <Pill className="h-4 w-4 mr-1" />
                                Administrer
                              </Button>
                            )}
                            {/* Resume button for ON_HOLD prescriptions */}
                            {isOnHold && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-300 text-green-700 hover:bg-green-50"
                                onClick={() => handleResumePrescription(prescription.id)}
                                disabled={isLoading}
                              >
                                {isLoading ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <PlayCircle className="h-4 w-4 mr-1" />
                                )}
                                Reprendre
                              </Button>
                            )}
                          </div>

                          {/* Instructions if any */}
                          {prescription.instructions && (
                            <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                              {prescription.instructions}
                            </div>
                          )}

                          {/* Last administration */}
                          {lastAdminTime && (
                            <div className="text-xs text-gray-500 mb-2">
                              <Clock className="h-3 w-3 inline mr-1" />
                              Dernière administration: {formatDateTime(lastAdminTime)}
                            </div>
                          )}

                          {/* Prescriber info */}
                          <div className="text-xs text-gray-400">
                            Prescrit par {prescription.prescribedByName || 'Médecin'} le{' '}
                            {formatDateTime(prescription.prescribedAt)}
                          </div>

                          {/* Action buttons for ACTIVE prescriptions */}
                          {isActive && (
                            <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                                onClick={() => handleOpenHoldModal(prescription)}
                                disabled={isLoading}
                              >
                                {isLoading ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <Pause className="h-4 w-4 mr-1" />
                                )}
                                Mettre en pause
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                onClick={() => handleCompletePrescription(prescription.id)}
                                disabled={isLoading}
                              >
                                {isLoading ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <CheckSquare className="h-4 w-4 mr-1" />
                                )}
                                Marquer terminé
                              </Button>
                            </div>
                          )}

                          {/* Administration history (last 5) */}
                          {prescription.administrations && prescription.administrations.length > 0 && (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-xs font-medium text-gray-500 mb-2">
                                Historique d'administration:
                              </p>
                              <div className="space-y-1">
                                {prescription.administrations
                                  .slice(-5)
                                  .reverse()
                                  .map((admin) => {
                                    const statusConfig = administrationStatusConfig[admin.status];
                                    const StatusIcon = statusConfig.icon;
                                    return (
                                      <div
                                        key={admin.id}
                                        className="flex items-center gap-2 text-xs"
                                      >
                                        <StatusIcon className={`h-3 w-3 ${statusConfig.color}`} />
                                        <span className={statusConfig.color}>
                                          {statusConfig.label}
                                        </span>
                                        <span className="text-gray-400">
                                          - {formatDateTime(admin.time)}
                                        </span>
                                        {admin.nurseName && (
                                          <span className="text-gray-400">
                                            par {admin.nurseName}
                                          </span>
                                        )}
                                        {admin.notes && (
                                          <span className="text-gray-500 italic truncate max-w-[150px]">
                                            ({admin.notes})
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Status & Actions (1/3 width) */}
          <div className="space-y-4">
            {/* Status Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Statut</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-center py-4 rounded-lg font-medium ${
                    patient.status === PatientStatus.IN_TREATMENT
                      ? 'bg-purple-100 text-purple-800'
                      : patient.status === PatientStatus.WITH_DOCTOR
                        ? 'bg-blue-100 text-blue-800'
                        : patient.status === PatientStatus.TRIAGED
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {patient.status === PatientStatus.IN_TREATMENT
                    ? 'En soins infirmiers'
                    : patient.status === PatientStatus.WITH_DOCTOR
                      ? 'Avec le médecin'
                      : patient.status === PatientStatus.TRIAGED
                        ? 'En attente de soins'
                        : patient.status === PatientStatus.REGISTERED
                          ? 'Inscrit'
                          : patient.status === PatientStatus.IN_TRIAGE
                            ? 'En triage'
                            : patient.status === PatientStatus.DISCHARGED
                              ? 'Sorti'
                              : patient.status}
                </div>

                {/* Assigned box */}
                {assignedBox && (
                  <div className="mt-3 text-center">
                    <p className="text-sm text-gray-500">Box assigné:</p>
                    <Badge variant="outline" className="mt-1">
                      {assignedBox.name}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Start Treatment (for TRIAGED patients) */}
                {patient.status === PatientStatus.TRIAGED && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-500 block mb-2">
                        Assigner un box (optionnel):
                      </label>
                      <Select onValueChange={(boxId) => handleStartTreatment(boxId)} disabled={actionLoading}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un box..." />
                        </SelectTrigger>
                        <SelectContent>
                          {boxes.map((box) => (
                            <SelectItem key={box.id} value={box.id}>
                              {box.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full bg-purple-600 hover:bg-purple-700"
                      onClick={() => handleStartTreatment()}
                      disabled={actionLoading}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Prendre en charge (sans box)
                    </Button>
                  </div>
                )}

                {/* Current doctor display (auto-assigned via box) */}
                {patient.assignedDoctorId && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <Stethoscope className="h-4 w-4 inline mr-1" />
                      Médecin: {doctors.find((d) => d.id === patient.assignedDoctorId)?.fullName || 'Assigné'}
                    </p>
                  </div>
                )}

                {/* Reassign box button (only for IN_TREATMENT or WITH_DOCTOR) */}
                {(patient.status === PatientStatus.IN_TREATMENT ||
                  patient.status === PatientStatus.WITH_DOCTOR) && (
                  <Button
                    variant="outline"
                    className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={() => setShowReassignModal(true)}
                    disabled={actionLoading}
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Réorienter
                  </Button>
                )}

                {/* Re-triage button (only for IN_TREATMENT or WITH_DOCTOR) */}
                {(patient.status === PatientStatus.IN_TREATMENT ||
                  patient.status === PatientStatus.WITH_DOCTOR) && (
                  <Button
                    variant="outline"
                    className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                    onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.retriage(id!))}
                    disabled={actionLoading}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Demander Re-Triage
                  </Button>
                )}

                {/* Deterioration Alert button (only for IN_TREATMENT or WITH_DOCTOR) */}
                {(patient.status === PatientStatus.IN_TREATMENT ||
                  patient.status === PatientStatus.WITH_DOCTOR) && (
                  <Button
                    variant="outline"
                    className="w-full border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.alert(id!))}
                    disabled={actionLoading}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Alerte Détérioration
                  </Button>
                )}

                {/* Discharge button (only for IN_TREATMENT or WITH_DOCTOR) */}
                {(patient.status === PatientStatus.IN_TREATMENT ||
                  patient.status === PatientStatus.WITH_DOCTOR) && (
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => setShowDischargeModal(true)}
                    disabled={actionLoading}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sortie du Patient
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Quick Info Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Informations</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Arrivée:</span>
                  <span>{formatDateTime(patient.createdAt)}</span>
                </div>
                {patient.triageCompletedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Triage:</span>
                    <span>{formatDateTime(patient.triageCompletedAt)}</span>
                  </div>
                )}
                {patient.treatmentStartedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Début soins:</span>
                    <span>{formatDateTime(patient.treatmentStartedAt)}</span>
                  </div>
                )}
                {patient.chronicConditions && (
                  <div className="pt-2 border-t">
                    <span className="text-gray-500 block mb-1">Antécédents:</span>
                    <span className="text-gray-700">
                      {(() => {
                        try {
                          const parsed = JSON.parse(patient.chronicConditions);
                          if (Array.isArray(parsed) && parsed.length > 0) {
                            return parsed.join(', ');
                          }
                          return 'Aucun';
                        } catch {
                          return patient.chronicConditions;
                        }
                      })()}
                    </span>
                  </div>
                )}
                {patient.currentMedications && (
                  <div className="pt-2 border-t">
                    <span className="text-gray-500 block mb-1">Médicaments actuels:</span>
                    <span className="text-gray-700">
                      {(() => {
                        try {
                          const parsed = JSON.parse(patient.currentMedications);
                          if (Array.isArray(parsed) && parsed.length > 0) {
                            return parsed.join(', ');
                          }
                          return 'Aucun';
                        } catch {
                          return patient.currentMedications;
                        }
                      })()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Re-Triage Modal */}
      {showReTriageModal && (
        <ReTriageModal
          onConfirm={handleRequestReTriage}
          onCancel={() => setShowReTriageModal(false)}
          loading={actionLoading}
        />
      )}

      {/* Discharge Modal */}
      {showDischargeModal && (
        <DischargeModal
          onConfirm={handleDischarge}
          onCancel={() => setShowDischargeModal(false)}
          loading={actionLoading}
        />
      )}

      {/* Administration Modal */}
      {showAdministrationModal && selectedPrescription && (
        <AdministrationModal
          prescription={selectedPrescription}
          isOpen={showAdministrationModal}
          onClose={() => {
            setShowAdministrationModal(false);
            setSelectedPrescription(null);
          }}
          onSuccess={handleAdministrationSuccess}
        />
      )}

      {/* Hold Prescription Modal */}
      {showHoldModal && selectedPrescription && (
        <HoldPrescriptionModal
          prescription={selectedPrescription}
          onConfirm={(reason) => handleHoldPrescription(selectedPrescription.id, reason)}
          onCancel={() => {
            setShowHoldModal(false);
            setSelectedPrescription(null);
          }}
          loading={prescriptionActionLoading === selectedPrescription.id}
        />
      )}

      {/* Reassign Box Modal */}
      <ReassignBoxModal
        isOpen={showReassignModal}
        onClose={() => setShowReassignModal(false)}
        onSuccess={() => loadData()}
        patientId={patient.id}
        patientName={patient.fullName}
        currentBoxId={patient.assignedBoxId ?? undefined}
        orientation={patient.finalOrientation ?? undefined}
        esiLevel={patient.esiLevel ?? undefined}
      />
    </DashboardLayout>
  );
}

// Re-Triage Modal Component
interface ReTriageModalProps {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

function ReTriageModal({ onConfirm, onCancel, loading }: ReTriageModalProps) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-orange-500" />
            Demande de Re-Triage
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            Le patient sera remis dans la file de triage pour une nouvelle évaluation. Cette action
            est irréversible.
          </p>
          <label className="block text-sm font-medium mb-2">
            Raison (optionnel)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Décrivez la raison du re-triage..."
            className="w-full border rounded-lg p-3 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-orange-500"
            autoFocus
          />
        </div>
        <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            className="flex-1 bg-orange-500 hover:bg-orange-600"
            onClick={() => onConfirm(reason)}
            disabled={loading}
          >
            {loading ? 'En cours...' : 'Confirmer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Discharge Modal Component
interface DischargeModalProps {
  onConfirm: (type: string, notes: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

function DischargeModal({ onConfirm, onCancel, loading }: DischargeModalProps) {
  const [dischargeType, setDischargeType] = useState('home');
  const [dischargeNotes, setDischargeNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <LogOut className="h-5 w-5 text-green-500" />
            Sortie du Patient
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Type de sortie</label>
            <Select value={dischargeType} onValueChange={setDischargeType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dischargeTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Notes de sortie</label>
            <textarea
              value={dischargeNotes}
              onChange={(e) => setDischargeNotes(e.target.value)}
              placeholder="Notes additionnelles (optionnel)..."
              className="w-full border rounded-lg p-3 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
        <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={() => onConfirm(dischargeType, dischargeNotes)}
            disabled={loading}
          >
            {loading ? 'En cours...' : 'Confirmer Sortie'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Administration Modal Component
interface AdministrationModalProps {
  prescription: Prescription;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function AdministrationModal({ prescription, isOpen, onClose, onSuccess }: AdministrationModalProps) {
  const [status, setStatus] = useState<AdministrationStatus>(AdministrationStatus.GIVEN);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      await api.post(API_ROUTES.prescriptions.administer(prescription.id), {
        status,
        notes: notes.trim() || null,
      });

      // Reset form
      setStatus(AdministrationStatus.GIVEN);
      setNotes('');

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('Error administering prescription:', err);
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(
        axiosError.response?.data?.error ||
        'Erreur lors de l\'enregistrement de l\'administration'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (): void => {
    if (!loading) {
      setStatus(AdministrationStatus.GIVEN);
      setNotes('');
      setError(null);
      onClose();
    }
  };

  // Administration status options with French labels
  const administrationOptions = [
    { value: AdministrationStatus.GIVEN, label: 'Administré', description: 'Le médicament a été donné au patient' },
    { value: AdministrationStatus.REFUSED, label: 'Refusé par le patient', description: 'Le patient a refusé le médicament' },
    { value: AdministrationStatus.HELD, label: 'Retenu (raison médicale)', description: 'Administration reportée pour raison médicale' },
    { value: AdministrationStatus.NOT_AVAILABLE, label: 'Non disponible', description: 'Médicament non disponible en pharmacie' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal Content */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 z-10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Pill className="h-5 w-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold">Administration</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Prescription info */}
        <div className="p-4 bg-gray-50 border-b">
          <h4 className="font-semibold text-gray-900">{prescription.medicationName}</h4>
          <p className="text-sm text-gray-600">
            {prescription.dosage} - {routeLabels[prescription.route]} - {prescription.frequency}
          </p>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Status selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Statut de l'administration <span className="text-red-500">*</span>
            </label>
            {administrationOptions.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  status === option.value
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="administrationStatus"
                  value={option.value}
                  checked={status === option.value}
                  onChange={(e) => setStatus(e.target.value as AdministrationStatus)}
                  className="mt-1 text-purple-600 focus:ring-purple-500"
                  disabled={loading}
                />
                <div>
                  <p className="font-medium text-gray-900">{option.label}</p>
                  <p className="text-sm text-gray-500">{option.description}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Notes (optionnel)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes supplémentaires..."
              className="w-full border rounded-lg p-3 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              disabled={loading}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
          <Button variant="outline" className="flex-1" onClick={handleClose} disabled={loading}>
            Annuler
          </Button>
          <Button
            className="flex-1 bg-purple-600 hover:bg-purple-700"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement...
              </>
            ) : (
              'Confirmer'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Hold Prescription Modal Component
interface HoldPrescriptionModalProps {
  prescription: Prescription;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

function HoldPrescriptionModal({ prescription, onConfirm, onCancel, loading }: HoldPrescriptionModalProps) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Pause className="h-5 w-5 text-amber-500" />
            Mettre en pause la prescription
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600" disabled={loading}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Prescription info */}
        <div className="p-4 bg-gray-50 border-b">
          <h4 className="font-semibold text-gray-900">{prescription.medicationName}</h4>
          <p className="text-sm text-gray-600">
            {prescription.dosage} - {routeLabels[prescription.route]} - {prescription.frequency}
          </p>
        </div>

        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            La prescription sera suspendue jusqu'à ce qu'elle soit reprise. Les administrations ne pourront plus être enregistrées tant que la prescription est en pause.
          </p>
          <label className="block text-sm font-medium mb-2">
            Raison de la suspension <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Attente résultats labo, intolérance suspectée, réévaluation nécessaire..."
            className="w-full border rounded-lg p-3 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-amber-500"
            autoFocus
            disabled={loading}
          />
        </div>

        <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button
            className="flex-1 bg-amber-500 hover:bg-amber-600"
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim() || loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Suspension...
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Suspendre
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
