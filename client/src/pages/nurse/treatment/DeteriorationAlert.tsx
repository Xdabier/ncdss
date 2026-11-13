import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Minus,
  RefreshCw,
  User,
  Phone,
  Stethoscope,
  Activity,
  CheckCircle,
  Loader2,
  Bell,
} from 'lucide-react';
import { getApi } from '../../../services/api';
import { CLIENT_ROUTES } from '../../../routes';
import { Patient, API_ROUTES } from '@ncdss/shared';

// ESI color mapping
const esiColors: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-black',
  4: 'bg-green-500 text-white',
  5: 'bg-blue-500 text-white',
};

// Action checklist items
const actionItems = [
  { id: 'vitals_checked', label: 'Constantes vérifiées', description: 'Toutes les constantes ont été mesurées' },
  { id: 'doctor_notified', label: 'Médecin notifié', description: 'Le médecin responsable a été informé' },
  { id: 'supervisor_notified', label: 'Surveillant notifié', description: 'Le surveillant a été informé' },
  { id: 'oxygen_administered', label: 'Oxygène administré', description: 'Oxygénothérapie mise en place si nécessaire' },
  { id: 'iv_access', label: 'Voie veineuse', description: 'Voie veineuse périphérique posée ou vérifiée' },
  { id: 'monitoring', label: 'Monitoring continu', description: 'Patient placé sous monitoring' },
  { id: 'ecg_done', label: 'ECG réalisé', description: 'Un ECG a été effectué' },
  { id: 'labs_ordered', label: 'Bilans demandés', description: 'Examens biologiques urgents demandés' },
];

// Escalation options
const escalationOptions = [
  { id: 'call_doctor', label: 'Appeler le médecin', icon: Stethoscope, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'request_retriage', label: 'Demander re-triage', icon: RefreshCw, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { id: 'call_supervisor', label: 'Appeler le surveillant', icon: Phone, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { id: 'code_blue', label: 'Alerte urgence vitale', icon: Bell, color: 'text-red-600 bg-red-50 border-red-200' },
];

// Score change indicator component
interface ScoreChangeProps {
  label: string;
  current: number | null | undefined;
  previous?: number | null;
  higherIsBetter?: boolean;
  criticalThreshold?: number;
  criticalDirection?: 'above' | 'below';
}

function ScoreChange({ label, current, previous, higherIsBetter = false, criticalThreshold, criticalDirection }: ScoreChangeProps) {
  const currentVal = current ?? 0;
  const prevVal = previous ?? currentVal;
  const diff = currentVal - prevVal;
  const hasDiff = previous !== undefined && previous !== null && diff !== 0;

  // Determine if current value is critical
  let isCritical = false;
  if (criticalThreshold !== undefined && criticalDirection) {
    isCritical = criticalDirection === 'above'
      ? currentVal >= criticalThreshold
      : currentVal < criticalThreshold;
  }

  // Determine change indicator
  let changeIcon = <Minus className="h-4 w-4 text-gray-400" />;
  let changeColor = 'text-gray-600';
  if (hasDiff) {
    if (diff > 0) {
      changeIcon = <ArrowUp className="h-4 w-4" />;
      changeColor = higherIsBetter ? 'text-green-600' : 'text-red-600';
    } else {
      changeIcon = <ArrowDown className="h-4 w-4" />;
      changeColor = higherIsBetter ? 'text-red-600' : 'text-green-600';
    }
  }

  return (
    <div className={`p-4 rounded-lg border ${isCritical ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-bold ${isCritical ? 'text-red-600' : 'text-gray-900'}`}>
          {current ?? '-'}
        </span>
        {hasDiff && (
          <div className={`flex items-center gap-1 ${changeColor}`}>
            {changeIcon}
            <span className="text-sm font-medium">{Math.abs(diff)}</span>
          </div>
        )}
      </div>
      {hasDiff && (
        <div className="text-xs text-gray-400 mt-1">
          Précédent: {prevVal}
        </div>
      )}
      {isCritical && (
        <div className="text-xs text-red-600 font-medium mt-1">
          Valeur critique
        </div>
      )}
    </div>
  );
}

export default function DeteriorationAlert() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>({});
  const [selectedEscalation, setSelectedEscalation] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const loadPatient = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const api = await getApi();
      const response = await api.get(API_ROUTES.patients.byId(id!));
      setPatient(response.data);
    } catch (err) {
      console.error('Error loading patient:', err);
      setError('Impossible de charger les données du patient');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadPatient();
    }
  }, [id, loadPatient]);

  const handleActionToggle = (actionId: string): void => {
    setCheckedActions((prev) => ({
      ...prev,
      [actionId]: !prev[actionId],
    }));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!id) return;

    try {
      setSubmitting(true);
      setError(null);
      const api = await getApi();

      // Build the alert documentation
      const alertData = {
        note: `[ALERTE DÉTÉRIORATION] ${notes}\n\nActions effectuées:\n${
          Object.entries(checkedActions)
            .filter(([, checked]) => checked)
            .map(([actionId]) => {
              const action = actionItems.find((a) => a.id === actionId);
              return `- ${action?.label || actionId}`;
            })
            .join('\n') || '- Aucune'
        }${selectedEscalation ? `\n\nEscalade: ${escalationOptions.find((e) => e.id === selectedEscalation)?.label}` : ''}`,
        noteType: 'alert',
      };

      // Add note to patient record
      await api.post(API_ROUTES.patients.notes(id!), alertData);

      // If re-triage was requested, do that too
      if (selectedEscalation === 'request_retriage') {
        await api.post(API_ROUTES.patients.requestRetriage(id!), {
          reason: `Alerte détérioration: ${notes}`,
          urgency: 'very_urgent',
        });
      }

      setSubmitted(true);
    } catch (err: unknown) {
      console.error('Error submitting deterioration alert:', err);
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(
        axiosError.response?.data?.error ||
        'Erreur lors de l\'enregistrement de l\'alerte'
      );
    } finally {
      setSubmitting(false);
    }
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
              <p className="text-gray-500 mb-4">Le patient demandé n'existe pas.</p>
              <Button onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.queue)}>Retour à la file</Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Success state
  if (submitted) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Alerte documentée</h2>
              <p className="text-gray-500 mb-6">
                L'alerte de détérioration pour {patient.fullName} a été enregistrée dans le dossier patient.
                {selectedEscalation === 'request_retriage' && (
                  <span className="block mt-2 text-orange-600">
                    Une demande de re-triage urgente a été créée.
                  </span>
                )}
              </p>
              <Button
                className="w-full"
                onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.patientCare(id!))}
              >
                Retour au dossier patient
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Determine if there's a critical condition
  const hasCriticalCondition =
    (patient.newsScore ?? 0) >= 7 ||
    (patient.gcsScore ?? 15) < 9 ||
    (patient.qsofaScore ?? 0) >= 2 ||
    (patient.oxygenSaturation ?? 100) < 90;

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Back button and title */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.patientCare(id!))}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            Alerte Détérioration
          </h1>
        </div>

        {/* Critical alert banner */}
        {hasCriticalCondition && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <div>
                <p className="font-semibold text-red-800">Condition critique détectée</p>
                <p className="text-sm text-red-700">
                  Un ou plusieurs paramètres sont en zone critique. Action immédiate requise.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto space-y-6">
          {/* Patient Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-gray-400" />
                Patient
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{patient.fullName}</h3>
                  <p className="text-gray-500">
                    {patient.age} ans, {patient.sex === 'MALE' ? 'Homme' : 'Femme'}
                  </p>
                  {patient.chiefComplaint && (
                    <p className="text-sm text-gray-600 mt-1">
                      Motif: {patient.chiefComplaint}
                    </p>
                  )}
                </div>
                {patient.esiLevel && (
                  <div className={`px-3 py-2 rounded-lg ${esiColors[patient.esiLevel]}`}>
                    <span className="text-2xl font-bold">{patient.esiLevel}</span>
                    <span className="text-sm font-medium ml-1 opacity-90">ESI</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Score Comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-gray-400" />
                Scores Cliniques
              </CardTitle>
              <CardDescription>
                Comparaison des scores actuels avec les valeurs précédentes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <ScoreChange
                  label="NEWS"
                  current={patient.newsScore}
                  criticalThreshold={7}
                  criticalDirection="above"
                />
                <ScoreChange
                  label="GCS"
                  current={patient.gcsScore}
                  higherIsBetter={true}
                  criticalThreshold={9}
                  criticalDirection="below"
                />
                <ScoreChange
                  label="qSOFA"
                  current={patient.qsofaScore}
                  criticalThreshold={2}
                  criticalDirection="above"
                />
                <ScoreChange
                  label="SpO2 (%)"
                  current={patient.oxygenSaturation}
                  higherIsBetter={true}
                  criticalThreshold={90}
                  criticalDirection="below"
                />
              </div>

              {/* Vitals summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-xs text-gray-500">Température</div>
                  <div className="font-semibold">{patient.temperature ? `${patient.temperature}°C` : '-'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">FC</div>
                  <div className="font-semibold">{patient.heartRate ? `${patient.heartRate} bpm` : '-'}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">TA</div>
                  <div className="font-semibold">
                    {patient.systolicBP && patient.diastolicBP
                      ? `${patient.systolicBP}/${patient.diastolicBP}`
                      : '-'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">FR</div>
                  <div className="font-semibold">{patient.respiratoryRate ? `${patient.respiratoryRate}/min` : '-'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions Checklist */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Actions Effectuées</CardTitle>
              <CardDescription>
                Cochez les actions que vous avez réalisées
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {actionItems.map((action) => (
                  <label
                    key={action.id}
                    htmlFor={`deterioration-action-${action.id}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checkedActions[action.id]
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <Checkbox
                      id={`deterioration-action-${action.id}`}
                      checked={checkedActions[action.id] || false}
                      onCheckedChange={() => handleActionToggle(action.id)}
                    />
                    <div>
                      <p className="font-medium text-gray-900">{action.label}</p>
                      <p className="text-xs text-gray-500">{action.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Escalation Options */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Escalade</CardTitle>
              <CardDescription>
                Sélectionnez une option d'escalade si nécessaire
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {escalationOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setSelectedEscalation(
                        selectedEscalation === option.id ? null : option.id
                      )}
                      className={`p-4 rounded-lg border text-center transition-all ${
                        selectedEscalation === option.id
                          ? `${option.color} ring-2 ring-offset-1`
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className={`h-6 w-6 mx-auto mb-2 ${
                        selectedEscalation === option.id
                          ? ''
                          : 'text-gray-400'
                      }`} />
                      <p className={`text-sm font-medium ${
                        selectedEscalation === option.id
                          ? ''
                          : 'text-gray-700'
                      }`}>
                        {option.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Notes</CardTitle>
              <CardDescription>
                Décrivez la situation et les observations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Décrivez la détérioration observée, le contexte, et toute information pertinente..."
                className="w-full border rounded-lg p-3 min-h-[80px] sm:min-h-[120px] focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                disabled={submitting}
              />

              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.patientCare(id!))}
                  disabled={submitting}
                >
                  Annuler
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Documenter l'alerte
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
