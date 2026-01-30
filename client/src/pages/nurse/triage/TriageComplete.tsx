import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Lightbulb,
  AlertCircle,
  AlertTriangle,
  Activity,
  Brain,
  Heart,
  Thermometer,
  Wind,
  Eye,
  Shield,
} from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { getApi } from '../../../services/api';
import { CLIENT_ROUTES } from '../../../routes';
import { Patient, Sex, Orientation as OrientationType, OrientationSource, API_ROUTES } from '@ncdss/shared';
import { suggestESI, getScoreColor, getScoreLabel } from '../../../utils/scoreUtils';

// --- ESI Levels ---

interface ESILevel {
  level: number;
  label: string;
  shortLabel: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  selectedBg: string;
}

const ESI_LEVELS: ESILevel[] = [
  {
    level: 1,
    label: 'Réanimation immédiate',
    shortLabel: '1',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-500',
    textColor: 'text-red-900',
    selectedBg: 'bg-red-500 text-white',
  },
  {
    level: 2,
    label: 'Urgence vitale',
    shortLabel: '2',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-500',
    textColor: 'text-orange-900',
    selectedBg: 'bg-orange-500 text-white',
  },
  {
    level: 3,
    label: 'Urgent',
    shortLabel: '3',
    bgColor: 'bg-yellow-100',
    borderColor: 'border-yellow-500',
    textColor: 'text-yellow-900',
    selectedBg: 'bg-yellow-500 text-white',
  },
  {
    level: 4,
    label: 'Moins urgent',
    shortLabel: '4',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-500',
    textColor: 'text-green-900',
    selectedBg: 'bg-green-500 text-white',
  },
  {
    level: 5,
    label: 'Non urgent',
    shortLabel: '5',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-500',
    textColor: 'text-blue-900',
    selectedBg: 'bg-blue-500 text-white',
  },
];

// --- Orientation Options ---

interface OrientationOption {
  value: OrientationType;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  selectedBg: string;
}

const ORIENTATION_OPTIONS: OrientationOption[] = [
  {
    value: OrientationType.SAUV,
    label: 'SAUV',
    description: 'Salle de dechocage',
    color: 'text-red-900',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-500',
    selectedBg: 'bg-red-500 text-white',
  },
  {
    value: OrientationType.MEDICAL,
    label: 'Médical',
    description: 'Box médical',
    color: 'text-blue-900',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-500',
    selectedBg: 'bg-blue-500 text-white',
  },
  {
    value: OrientationType.SURGICAL,
    label: 'Chirurgical',
    description: 'Box chirurgical',
    color: 'text-purple-900',
    bgColor: 'bg-purple-100',
    borderColor: 'border-purple-500',
    selectedBg: 'bg-purple-500 text-white',
  },
  {
    value: OrientationType.TRAUMA,
    label: 'Traumato',
    description: 'Box traumatologie',
    color: 'text-orange-900',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-500',
    selectedBg: 'bg-orange-500 text-white',
  },
  {
    value: OrientationType.PEDIATRIC,
    label: 'Pédiatrie',
    description: 'Box pediatrique',
    color: 'text-green-900',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-500',
    selectedBg: 'bg-green-500 text-white',
  },
];

const PEDIATRIC_AGE_THRESHOLD = 15;

// --- Orientation Suggestion ---

interface OrientationSuggestion {
  suggestion: OrientationType;
  source: OrientationSource;
  reason: string;
  scores: {
    news?: number;
    gcs?: number;
    qsofa?: number;
    esi?: number;
  };
}

// --- ABCDE Helpers ---

interface ABCDEStatus {
  label: string;
  icon: React.ReactNode;
  status: 'normal' | 'warning' | 'critical' | 'empty';
  findings: string[];
}

function parseABCDEField(json: string | undefined | null): { findings?: string[]; interventions?: string[]; patent?: boolean } | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getABCDEStatus(patient: Patient): ABCDEStatus[] {
  const statuses: ABCDEStatus[] = [];

  // Airway
  const airway = parseABCDEField(patient.abcdeAirway);
  if (airway) {
    const hasFindings = airway.findings && airway.findings.length > 0;
    const isPatent = airway.patent !== false;
    statuses.push({
      label: 'A - Voies aériennes',
      icon: <Wind className="h-4 w-4" />,
      status: !isPatent ? 'critical' : hasFindings ? 'warning' : 'normal',
      findings: airway.findings || [],
    });
  } else {
    statuses.push({ label: 'A - Voies aériennes', icon: <Wind className="h-4 w-4" />, status: 'empty', findings: [] });
  }

  // Breathing
  const breathing = parseABCDEField(patient.abcdeBreathing);
  if (breathing) {
    const hasFindings = breathing.findings && breathing.findings.length > 0;
    statuses.push({
      label: 'B - Respiration',
      icon: <Activity className="h-4 w-4" />,
      status: hasFindings ? 'warning' : 'normal',
      findings: breathing.findings || [],
    });
  } else {
    statuses.push({ label: 'B - Respiration', icon: <Activity className="h-4 w-4" />, status: 'empty', findings: [] });
  }

  // Circulation
  const circulation = parseABCDEField(patient.abcdeCirculation);
  if (circulation) {
    const hasFindings = circulation.findings && circulation.findings.length > 0;
    statuses.push({
      label: 'C - Circulation',
      icon: <Heart className="h-4 w-4" />,
      status: hasFindings ? 'warning' : 'normal',
      findings: circulation.findings || [],
    });
  } else {
    statuses.push({ label: 'C - Circulation', icon: <Heart className="h-4 w-4" />, status: 'empty', findings: [] });
  }

  // Disability
  const disability = parseABCDEField(patient.abcdeDisability);
  if (disability) {
    const hasFindings = disability.findings && disability.findings.length > 0;
    statuses.push({
      label: 'D - Neurologique',
      icon: <Brain className="h-4 w-4" />,
      status: hasFindings ? 'warning' : 'normal',
      findings: disability.findings || [],
    });
  } else {
    statuses.push({ label: 'D - Neurologique', icon: <Brain className="h-4 w-4" />, status: 'empty', findings: [] });
  }

  // Exposure
  const exposure = parseABCDEField(patient.abcdeExposure);
  if (exposure) {
    const hasFindings = exposure.findings && exposure.findings.length > 0;
    statuses.push({
      label: 'E - Exposition',
      icon: <Eye className="h-4 w-4" />,
      status: hasFindings ? 'warning' : 'normal',
      findings: exposure.findings || [],
    });
  } else {
    statuses.push({ label: 'E - Exposition', icon: <Eye className="h-4 w-4" />, status: 'empty', findings: [] });
  }

  return statuses;
}

function getStatusIcon(status: 'normal' | 'warning' | 'critical' | 'empty'): React.ReactNode {
  switch (status) {
    case 'normal':
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    case 'critical':
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'empty':
      return <span className="h-4 w-4 text-gray-400">—</span>;
  }
}

// --- Alerts ---

function getCriticalAlerts(patient: Patient): string[] {
  const alerts: string[] = [];

  if (patient.heartRate && patient.heartRate > 120) alerts.push('Tachycardie');
  if (patient.heartRate && patient.heartRate < 50) alerts.push('Bradycardie');
  if (patient.temperature && patient.temperature >= 38.5) alerts.push('Fievre');
  if (patient.temperature && patient.temperature < 35) alerts.push('Hypothermie');
  if (patient.oxygenSaturation && patient.oxygenSaturation < 92) alerts.push('Desaturation');
  if (patient.respiratoryRate && patient.respiratoryRate > 25) alerts.push('Tachypnee');
  if (patient.respiratoryRate && patient.respiratoryRate < 10) alerts.push('Bradypnee');
  if (patient.systolicBP && patient.systolicBP < 90) alerts.push('Hypotension');
  if (patient.systolicBP && patient.systolicBP > 180) alerts.push('Hypertension severe');
  if (patient.gcsScore && patient.gcsScore < 9) alerts.push('GCS < 9');
  if (patient.newsScore && patient.newsScore >= 7) alerts.push('NEWS >= 7');
  if (patient.qsofaScore && patient.qsofaScore >= 2) alerts.push('qSOFA >= 2');

  return alerts;
}

// --- Source Label ---

function getSourceLabel(source: OrientationSource): string {
  switch (source) {
    case OrientationSource.PATHOLOGY_LOOKUP:
      return 'Pathologie';
    case OrientationSource.SCORE_BASED:
      return 'Scores cliniques';
    case OrientationSource.AI_SUGGESTION:
      return 'IA';
    case OrientationSource.MANUAL:
      return 'Manuel';
    default:
      return 'Inconnu';
  }
}

// =============================================================================
// Main Component
// =============================================================================

export default function TriageComplete() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESI
  const [suggestedESI, setSuggestedESI] = useState<number | null>(null);
  const [selectedESI, setSelectedESI] = useState<number | null>(null);

  // Orientation
  const [suggestion, setSuggestion] = useState<OrientationSuggestion | null>(null);
  const [selectedOrientation, setSelectedOrientation] = useState<OrientationType | null>(null);
  const [isOverriding, setIsOverriding] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    loadPatientAndSuggestions();
  }, [id]);

  const loadPatientAndSuggestions = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const api = await getApi();

      const [patientRes, suggestionRes] = await Promise.all([
        api.get(API_ROUTES.patients.byId(id)),
        api.get(API_ROUTES.patients.suggestOrientation(id)),
      ]);

      const patientData: Patient = patientRes.data;
      const suggestionData: OrientationSuggestion = suggestionRes.data;

      setPatient(patientData);
      setSuggestion(suggestionData);

      // Calculate suggested ESI
      const esi = suggestESI({
        newsScore: patientData.newsScore,
        gcsScore: patientData.gcsScore,
        qsofaScore: patientData.qsofaScore,
        painLevel: patientData.painLevel,
      });
      setSuggestedESI(esi);

      // Pre-select values
      setSelectedESI(patientData.esiLevel || esi);
      setSelectedOrientation(suggestionData.suggestion);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur de chargement des donnees');
    } finally {
      setLoading(false);
    }
  };

  // Detect if orientation is being overridden
  const isOrientationOverride = selectedOrientation !== null && suggestion !== null && selectedOrientation !== suggestion.suggestion;

  const handleComplete = async () => {
    if (!selectedESI || !selectedOrientation || !id) return;

    // Validate override reason
    if (isOrientationOverride && !overrideReason.trim()) {
      setError("Veuillez indiquer la raison du changement d'orientation");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const api = await getApi();

      // Save ESI level first
      await api.put(API_ROUTES.patients.esi(id), {
        esiLevel: selectedESI,
      });

      // Complete triage
      await api.post(API_ROUTES.patients.completeTriage(id), {
        esiLevel: selectedESI,
        suggestedOrientation: suggestion?.suggestion,
        orientationSource: suggestion?.source,
        finalOrientation: selectedOrientation,
        overrideReason: isOrientationOverride ? overrideReason : null,
      });

      navigate(CLIENT_ROUTES.nurse.triage.queue, {
        state: { message: `Triage termine avec succes pour ${patient?.fullName}` },
      });
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur lors de la finalisation du triage');
    } finally {
      setSaving(false);
    }
  };

  // --- Loading ---

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
              <AlertDescription>Patient non trouve</AlertDescription>
            </Alert>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // --- Derived data ---

  const abcdeStatuses = getABCDEStatus(patient);
  const criticalAlerts = getCriticalAlerts(patient);
  const availableOrientations = ORIENTATION_OPTIONS.filter((opt) => {
    if (opt.value === OrientationType.PEDIATRIC) {
      return patient.age < PEDIATRIC_AGE_THRESHOLD;
    }
    return true;
  });

  const canConfirm = selectedESI !== null && selectedOrientation !== null && (!isOrientationOverride || overrideReason.trim().length > 0);

  // --- Render ---

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Finaliser le Triage</h1>
            <p className="text-sm text-gray-600">
              {patient.fullName} - {patient.age} ans / {patient.sex === Sex.MALE ? 'H' : 'F'} - {patient.chiefComplaint || 'Motif non specifie'}
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Critical alerts banner */}
        {criticalAlerts.length > 0 && (
          <Alert className="mb-6 bg-red-50 border-red-300">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <span className="font-semibold">Alertes: </span>
              {criticalAlerts.join(' - ')}
            </AlertDescription>
          </Alert>
        )}

        {/* ESI + Orientation side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* ESI Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5" />
                Niveau de Gravite (ESI)
              </CardTitle>
              {suggestedESI && (
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <Lightbulb className="h-4 w-4" />
                  <span>
                    Suggestion: <strong>ESI {suggestedESI}</strong>
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                {ESI_LEVELS.map((esi) => (
                  <button
                    key={esi.level}
                    onClick={() => setSelectedESI(esi.level)}
                    className={`flex-1 py-3 px-2 rounded-lg border-2 font-bold text-lg transition-all ${
                      selectedESI === esi.level
                        ? `${esi.selectedBg} ${esi.borderColor} shadow-md`
                        : `${esi.bgColor} ${esi.borderColor} ${esi.textColor} hover:opacity-80`
                    } ${suggestedESI === esi.level && selectedESI !== esi.level ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                  >
                    {esi.level}
                  </button>
                ))}
              </div>
              {selectedESI && (
                <div className={`p-3 rounded-lg ${ESI_LEVELS[selectedESI - 1].bgColor} ${ESI_LEVELS[selectedESI - 1].borderColor} border`}>
                  <p className={`text-sm font-medium ${ESI_LEVELS[selectedESI - 1].textColor}`}>
                    ESI {selectedESI}: {ESI_LEVELS[selectedESI - 1].label}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Orientation Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Thermometer className="h-5 w-5" />
                Orientation
              </CardTitle>
              {suggestion && (
                <div className="flex items-center gap-2 text-sm text-blue-700">
                  <Lightbulb className="h-4 w-4" />
                  <span>
                    Suggestion: <strong>{ORIENTATION_OPTIONS.find((o) => o.value === suggestion.suggestion)?.label}</strong>
                    {' '}({getSourceLabel(suggestion.source)})
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {availableOrientations.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setSelectedOrientation(opt.value);
                      if (opt.value === suggestion?.suggestion) {
                        setIsOverriding(false);
                        setOverrideReason('');
                      } else {
                        setIsOverriding(true);
                      }
                      setError(null);
                    }}
                    className={`py-3 px-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                      selectedOrientation === opt.value
                        ? `${opt.selectedBg} ${opt.borderColor} shadow-md`
                        : `${opt.bgColor} ${opt.borderColor} ${opt.color} hover:opacity-80`
                    } ${suggestion?.suggestion === opt.value && selectedOrientation !== opt.value ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Override reason */}
              {isOrientationOverride && (
                <div className="border border-orange-300 rounded-lg p-3 bg-orange-50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-medium text-orange-900">
                      Raison du changement d'orientation
                    </span>
                  </div>
                  <textarea
                    className="w-full px-3 py-2 border border-orange-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    rows={2}
                    placeholder="Expliquez la raison du changement..."
                    value={overrideReason}
                    onChange={(e) => {
                      setOverrideReason(e.target.value);
                      setError(null);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Section */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Resume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Vitals Card */}
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Signes vitaux
                </h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">T:</span>
                    <span className={`font-medium ${patient.temperature && (patient.temperature >= 38.5 || patient.temperature < 35) ? 'text-red-600' : ''}`}>
                      {patient.temperature ? `${patient.temperature}\u00B0C` : '\u2014'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">FC:</span>
                    <span className={`font-medium ${patient.heartRate && (patient.heartRate > 120 || patient.heartRate < 50) ? 'text-red-600' : ''}`}>
                      {patient.heartRate ? `${patient.heartRate} bpm` : '\u2014'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">FR:</span>
                    <span className={`font-medium ${patient.respiratoryRate && (patient.respiratoryRate > 25 || patient.respiratoryRate < 10) ? 'text-red-600' : ''}`}>
                      {patient.respiratoryRate ? `${patient.respiratoryRate}/min` : '\u2014'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">PA:</span>
                    <span className={`font-medium ${patient.systolicBP && (patient.systolicBP < 90 || patient.systolicBP > 180) ? 'text-red-600' : ''}`}>
                      {patient.systolicBP && patient.diastolicBP ? `${patient.systolicBP}/${patient.diastolicBP}` : '\u2014'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">SpO2:</span>
                    <span className={`font-medium ${patient.oxygenSaturation && patient.oxygenSaturation < 92 ? 'text-red-600' : ''}`}>
                      {patient.oxygenSaturation ? `${patient.oxygenSaturation}%` : '\u2014'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ABCDE Card */}
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  ABCDE
                </h4>
                <div className="space-y-1.5 text-sm">
                  {abcdeStatuses.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {getStatusIcon(s.status)}
                      <span className={`${s.status === 'critical' ? 'text-red-700 font-medium' : s.status === 'warning' ? 'text-yellow-700' : 'text-gray-600'}`}>
                        {s.label.split(' - ')[0]}
                      </span>
                      {s.status === 'warning' && s.findings.length > 0 && (
                        <span className="text-xs text-yellow-600 truncate" title={s.findings.join(', ')}>
                          ({s.findings.length})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Scores Card */}
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Scores
                </h4>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-500">NEWS</span>
                      <span className="font-medium">{patient.newsScore ?? '\u2014'}</span>
                    </div>
                    {patient.newsScore !== undefined && patient.newsScore !== null && (
                      <Badge className={`text-xs ${getScoreColor(patient.newsScore, 'news')}`}>
                        {getScoreLabel(patient.newsScore, 'news')}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-500">GCS</span>
                      <span className="font-medium">{patient.gcsScore ?? '\u2014'}</span>
                    </div>
                    {patient.gcsScore !== undefined && patient.gcsScore !== null && (
                      <Badge className={`text-xs ${getScoreColor(patient.gcsScore, 'gcs')}`}>
                        {getScoreLabel(patient.gcsScore, 'gcs')}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-500">qSOFA</span>
                      <span className="font-medium">{patient.qsofaScore ?? '\u2014'}</span>
                    </div>
                    {patient.qsofaScore !== undefined && patient.qsofaScore !== null && (
                      <Badge className={`text-xs ${getScoreColor(patient.qsofaScore, 'qsofa')}`}>
                        {getScoreLabel(patient.qsofaScore, 'qsofa')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Alerts Card */}
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Alertes
                </h4>
                {criticalAlerts.length > 0 ? (
                  <div className="space-y-1.5">
                    {criticalAlerts.map((alert, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <span className="text-red-500">\u26A0</span>
                        <span className="text-red-700">{alert}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Aucune alerte</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <Button variant="outline" onClick={() => navigate(CLIENT_ROUTES.nurse.triage.abcde(id!))}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour au triage
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!canConfirm || saving}
            className="min-w-[220px] bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {saving ? 'Enregistrement...' : 'Confirmer et terminer'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
