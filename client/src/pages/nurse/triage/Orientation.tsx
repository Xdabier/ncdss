import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Lightbulb, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { getApi } from '../../../services/api';
import { Patient, Sex, Orientation as OrientationType, OrientationSource } from '@ncdss/shared';

interface OrientationOption {
  value: OrientationType;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const ORIENTATION_OPTIONS: OrientationOption[] = [
  {
    value: OrientationType.SAUV,
    label: 'SAUV',
    description: 'Salle de déchocage',
    color: 'text-red-900',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-500',
  },
  {
    value: OrientationType.MEDICAL,
    label: 'MÉDICAL',
    description: 'Box médical',
    color: 'text-blue-900',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-500',
  },
  {
    value: OrientationType.SURGICAL,
    label: 'CHIRURGICAL',
    description: 'Box chirurgical',
    color: 'text-purple-900',
    bgColor: 'bg-purple-100',
    borderColor: 'border-purple-500',
  },
  {
    value: OrientationType.TRAUMA,
    label: 'TRAUMATO',
    description: 'Box traumatologie',
    color: 'text-orange-900',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-500',
  },
];

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

interface LocationState {
  esiLevel?: number;
}

export default function Orientation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [suggestion, setSuggestion] = useState<OrientationSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrientation, setSelectedOrientation] = useState<OrientationType | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Load patient and suggestion
  useEffect(() => {
    const loadData = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const api = await getApi();

        // Load patient
        const patientResponse = await api.get(`/patients/${id}`);
        setPatient(patientResponse.data);

        // Load orientation suggestion
        const suggestionResponse = await api.get(`/patients/${id}/suggest-orientation`);
        setSuggestion(suggestionResponse.data);

        // Pre-select suggested orientation
        setSelectedOrientation(suggestionResponse.data.suggestion);
      } catch (e: any) {
        setError(e.response?.data?.error || 'Erreur de chargement des données');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  const getSourceLabel = (source: OrientationSource): string => {
    switch (source) {
      case OrientationSource.PATHOLOGY_LOOKUP:
        return 'Pathologie';
      case OrientationSource.SCORE_BASED:
        return 'Scores';
      case OrientationSource.AI_SUGGESTION:
        return 'IA';
      case OrientationSource.MANUAL:
        return 'Manuel';
      default:
        return 'Inconnu';
    }
  };

  const handleContinue = () => {
    if (!selectedOrientation || !id) return;

    // Check if override reason is required
    if (selectedOrientation !== suggestion?.suggestion && !overrideReason.trim()) {
      setError('Veuillez indiquer la raison du changement d\'orientation');
      return;
    }

    // Navigate to summary with orientation data and ESI level
    navigate(`/nurse/triage/${id}/summary`, {
      state: {
        esiLevel: state?.esiLevel,
        suggestedOrientation: suggestion?.suggestion,
        orientationSource: suggestion?.source,
        finalOrientation: selectedOrientation,
        overrideReason: selectedOrientation !== suggestion?.suggestion ? overrideReason : undefined,
      },
    });
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

  if (!patient || !suggestion) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="max-w-5xl mx-auto">
            <Alert variant="destructive">
              <AlertDescription>Patient ou suggestion non trouvé</AlertDescription>
            </Alert>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isOverride = selectedOrientation && selectedOrientation !== suggestion.suggestion;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Orientation Patient</h1>
            <p className="text-sm text-gray-600">Étape 7/8 - Choix de l'orientation</p>
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

        {/* Suggestion Card */}
        <Card className="mb-6 border-blue-500 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Lightbulb className="h-5 w-5" />
              Orientation Suggérée
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-blue-800 font-medium">Orientation:</span>
                <Badge className="text-base px-3 py-1 bg-blue-600">
                  {ORIENTATION_OPTIONS.find((opt) => opt.value === suggestion.suggestion)?.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-blue-800 font-medium">Source:</span>
                <Badge variant="outline" className="border-blue-500 text-blue-800">
                  {getSourceLabel(suggestion.source)}
                </Badge>
              </div>
              <div>
                <span className="text-sm text-blue-800 font-medium">Raison:</span>
                <p className="text-sm text-blue-900 mt-1">{suggestion.reason}</p>
              </div>
              {/* Show scores for reference */}
              <div className="pt-2 border-t border-blue-200">
                <p className="text-xs text-blue-700 mb-2">Scores de référence:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestion.scores.news !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      NEWS: {suggestion.scores.news}
                    </Badge>
                  )}
                  {suggestion.scores.gcs !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      GCS: {suggestion.scores.gcs}
                    </Badge>
                  )}
                  {suggestion.scores.qsofa !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      qSOFA: {suggestion.scores.qsofa}
                    </Badge>
                  )}
                  {suggestion.scores.esi !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      ESI: {suggestion.scores.esi}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orientation Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Sélectionner l'orientation finale</CardTitle>
            <CardDescription>
              Cliquez sur une option pour confirmer ou modifier l'orientation suggérée
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ORIENTATION_OPTIONS.map((option) => (
                <Card
                  key={option.value}
                  className={`cursor-pointer transition-all border-2 ${
                    selectedOrientation === option.value
                      ? `${option.bgColor} ${option.borderColor} shadow-md`
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  } ${
                    suggestion.suggestion === option.value && selectedOrientation !== option.value
                      ? 'ring-2 ring-blue-300'
                      : ''
                  }`}
                  onClick={() => {
                    setSelectedOrientation(option.value);
                    setError(null);
                  }}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-lg font-bold ${option.color}`}>
                        {option.label}
                      </span>
                      {selectedOrientation === option.value && (
                        <Badge className="bg-green-600">Sélectionné</Badge>
                      )}
                      {suggestion.suggestion === option.value && selectedOrientation !== option.value && (
                        <Badge variant="outline" className="border-blue-500 text-blue-600">
                          Suggéré
                        </Badge>
                      )}
                    </div>
                    <p className={`text-sm ${selectedOrientation === option.value ? option.color : 'text-gray-600'}`}>
                      {option.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Override Reason (shown if different from suggestion) */}
        {isOverride && (
          <Card className="mb-6 border-orange-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-900">
                <AlertCircle className="h-5 w-5" />
                Raison du changement d'orientation
              </CardTitle>
              <CardDescription>
                L'orientation sélectionnée est différente de la suggestion. Veuillez expliquer pourquoi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Expliquez la raison du changement d'orientation..."
                value={overrideReason}
                onChange={(e) => {
                  setOverrideReason(e.target.value);
                  setError(null);
                }}
              />
              <p className="text-xs text-gray-500 mt-2">* Champ obligatoire</p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!selectedOrientation}
            className="min-w-[150px]"
          >
            Voir le résumé
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
