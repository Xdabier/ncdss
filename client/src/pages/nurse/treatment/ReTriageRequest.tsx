import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  User,
  Thermometer,
  Heart,
  Activity,
  Wind,
  Loader2,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';
import { getApi } from '../../../services/api';
import { CLIENT_ROUTES } from '../../../routes';
import { Patient, API_ROUTES } from '@ncdss/shared';

// Urgency options
const urgencyOptions = [
  { value: 'normal', label: 'Normal', description: 'Réévaluation de routine' },
  { value: 'urgent', label: 'Urgent', description: 'Détérioration notable' },
  { value: 'very_urgent', label: 'Très urgent', description: 'Détérioration critique' },
];

// ESI color mapping
const esiColors: Record<number, string> = {
  1: 'bg-red-500 text-white',
  2: 'bg-orange-500 text-white',
  3: 'bg-yellow-500 text-black',
  4: 'bg-green-500 text-white',
  5: 'bg-blue-500 text-white',
};

export default function ReTriageRequest() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [reason, setReason] = useState('');
  const [urgency, setUrgency] = useState('normal');

  useEffect(() => {
    if (id) {
      loadPatient();
    }
  }, [id]);

  const loadPatient = async (): Promise<void> => {
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
  };

  const handleSubmit = async (): Promise<void> => {
    if (!id) return;

    try {
      setSubmitting(true);
      setError(null);
      const api = await getApi();
      await api.post(API_ROUTES.patients.requestRetriage(id!), {
        reason: reason.trim() || undefined,
        urgency,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      console.error('Error requesting re-triage:', err);
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(
        axiosError.response?.data?.error ||
        'Erreur lors de la demande de re-triage'
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
              <h2 className="text-xl font-semibold mb-2">Demande envoyée</h2>
              <p className="text-gray-500 mb-6">
                La demande de re-triage pour {patient.fullName} a été enregistrée.
                Le patient sera réévalué par l'équipe de triage.
              </p>
              <Button
                className="w-full"
                onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.queue)}
              >
                Retour à la file de soins
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        {/* Back button and title */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.patientCare(id!))}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <h1 className="text-2xl font-bold">Demande de Re-Triage</h1>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {/* Patient Info Card */}
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
                    <p className="text-sm text-gray-600 mt-2">
                      <span className="font-medium">Motif:</span> {patient.chiefComplaint}
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

          {/* Current Vitals Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-gray-400" />
                  Constantes Actuelles
                </CardTitle>
                <Link to={`/nurse/treatment/${id}/vitals`}>
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Mettre à jour
                  </Button>
                </Link>
              </div>
              <CardDescription>
                Vérifiez les constantes avant de demander un re-triage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Temperature */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Thermometer className="h-5 w-5 mx-auto text-red-400 mb-1" />
                  <div className="text-xl font-bold">
                    {patient.temperature ? `${patient.temperature}°` : '—'}
                  </div>
                  <div className="text-xs text-gray-500">Temp (°C)</div>
                </div>

                {/* Heart rate */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Heart className="h-5 w-5 mx-auto text-pink-400 mb-1" />
                  <div className="text-xl font-bold">{patient.heartRate ?? '—'}</div>
                  <div className="text-xs text-gray-500">FC (bpm)</div>
                </div>

                {/* Blood pressure */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Activity className="h-5 w-5 mx-auto text-blue-400 mb-1" />
                  <div className="text-xl font-bold">
                    {patient.systolicBP || patient.diastolicBP
                      ? `${patient.systolicBP ?? '—'}/${patient.diastolicBP ?? '—'}`
                      : '—'}
                  </div>
                  <div className="text-xs text-gray-500">TA (mmHg)</div>
                </div>

                {/* Oxygen saturation */}
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <Wind className="h-5 w-5 mx-auto text-cyan-400 mb-1" />
                  <div className="text-xl font-bold">
                    {patient.oxygenSaturation ? `${patient.oxygenSaturation}%` : '—'}
                  </div>
                  <div className="text-xs text-gray-500">SpO2</div>
                </div>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t">
                <div className="text-center">
                  <div
                    className={`text-lg font-bold ${
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
                </div>
                <div className="text-center">
                  <div
                    className={`text-lg font-bold ${
                      (patient.gcsScore ?? 15) < 12 ? 'text-red-600' : 'text-gray-700'
                    }`}
                  >
                    {patient.gcsScore ?? '—'}
                  </div>
                  <div className="text-xs text-gray-500">GCS</div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-lg font-bold ${
                      (patient.qsofaScore ?? 0) >= 2 ? 'text-red-600' : 'text-gray-700'
                    }`}
                  >
                    {patient.qsofaScore ?? '—'}
                  </div>
                  <div className="text-xs text-gray-500">qSOFA</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Re-triage Request Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-orange-500" />
                Formulaire de Demande
              </CardTitle>
              <CardDescription>
                Expliquez pourquoi le patient nécessite une nouvelle évaluation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </div>
              )}

              {/* Urgency selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Niveau d'urgence
                </label>
                <Select value={urgency} onValueChange={setUrgency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {urgencyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div>
                          <span className="font-medium">{option.label}</span>
                          <span className="text-gray-500 ml-2">- {option.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reason textarea */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Motif de la demande (optionnel)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Décrivez les changements observés chez le patient qui justifient une réévaluation..."
                  className="w-full border rounded-lg p-3 min-h-[100px] sm:min-h-[150px] focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500">
                  Incluez les changements cliniques, les nouvelles symptômes, ou toute préoccupation.
                </p>
              </div>

              {/* Warning for urgent/very urgent */}
              {urgency !== 'normal' && (
                <div className={`p-3 rounded-lg border ${
                  urgency === 'very_urgent'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-orange-50 border-orange-200 text-orange-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium">
                      {urgency === 'very_urgent'
                        ? 'Détérioration critique détectée'
                        : 'Détérioration notable'
                      }
                    </span>
                  </div>
                  <p className="text-sm mt-1">
                    {urgency === 'very_urgent'
                      ? 'Le patient sera priorisé pour une réévaluation immédiate.'
                      : 'Le patient sera réévalué en priorité.'
                    }
                  </p>
                </div>
              )}

              {/* Submit buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(CLIENT_ROUTES.nurse.treatment.patientCare(id!))}
                  disabled={submitting}
                >
                  Annuler
                </Button>
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Demander Re-Triage
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
