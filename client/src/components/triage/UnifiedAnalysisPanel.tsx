import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getApi } from '../../services/api';
import { getServerUrl } from '../../services/config';
import { useAuthStore } from '../../stores/auth.store';
import { AILoadingAnimation } from '../shared/AIPreDiagnosisPanel';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  UnifiedClinicalAnalysis,
  GetUnifiedAnalysisResponse,
  API_ROUTES,
} from '@ncdss/shared';
import {
  AlertTriangle,
  Bot,
  MapPin,
  ListChecks,
  Stethoscope,
  FlaskConical,
  Brain,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  WifiOff,
  Square,
  CheckSquare,
  StopCircle,
} from 'lucide-react';

interface UnifiedAnalysisPanelProps {
  patientId: string;
  onAnalysisReady?: (analysis: UnifiedClinicalAnalysis) => void;
}

const orientationColors: Record<string, string> = {
  SAUV: 'bg-red-600 text-white',
  TRAUMA: 'bg-orange-500 text-white',
  SURGICAL: 'bg-purple-500 text-white',
  MEDICAL: 'bg-blue-500 text-white',
  PEDIATRIC: 'bg-green-500 text-white',
};

const orientationLabels: Record<string, string> = {
  SAUV: 'SAUV',
  TRAUMA: 'Traumatologie',
  SURGICAL: 'Chirurgical',
  MEDICAL: 'Medical',
  PEDIATRIC: 'Pediatrie',
};

const urgencyColors: Record<string, string> = {
  emergent: 'bg-red-500 text-white',
  urgent: 'bg-orange-500 text-white',
  routine: 'bg-green-500 text-white',
};

const urgencyLabels: Record<string, string> = {
  emergent: 'Emergent',
  urgent: 'Urgent',
  routine: 'Routine',
};

/** Ensure all array fields are present (guards against partial/repaired JSON) */
function normalizeAnalysis(raw: UnifiedClinicalAnalysis): UnifiedClinicalAnalysis {
  return {
    ...raw,
    criticalAlerts: raw.criticalAlerts ?? [],
    pathologies: raw.pathologies ?? [],
    nursingInterventions: raw.nursingInterventions ?? [],
    medicalInterventions: raw.medicalInterventions ?? [],
    recommendedTests: raw.recommendedTests ?? [],
    warnings: raw.warnings ?? [],
  };
}

export function UnifiedAnalysisPanel({ patientId, onAnalysisReady }: UnifiedAnalysisPanelProps): React.ReactElement {
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<UnifiedClinicalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [streamActivity, setStreamActivity] = useState(0);
  const [checkedInterventions, setCheckedInterventions] = useState<Set<number>>(new Set());
  const [showMedical, setShowMedical] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [showPathologies, setShowPathologies] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onAnalysisReadyRef = useRef(onAnalysisReady);
  onAnalysisReadyRef.current = onAnalysisReady;

  const checkAiStatus = useCallback(async (): Promise<void> => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.patients.aiStatus(patientId));
      setAiAvailable(response.data.available);
    } catch {
      setAiAvailable(false);
    }
  }, [patientId]);

  const loadSaved = useCallback(async (): Promise<void> => {
    try {
      const api = await getApi();
      const response = await api.get<GetUnifiedAnalysisResponse>(
        API_ROUTES.patients.unifiedAnalysis(patientId)
      );
      const data = response.data;
      setStatus(data.status);

      if (data.exists && data.status === 'completed' && data.result) {
        const normalized = normalizeAnalysis(data.result);
        setResult(normalized);
        setError(null);
        onAnalysisReadyRef.current?.(normalized);
      } else if (data.exists && data.status === 'failed' && data.errorMessage) {
        setError(data.errorMessage);
      }
    } catch {
      // Silently fail on load — user can trigger manually
    }
  }, [patientId]);

  // Initial load
  useEffect(() => {
    const init = async (): Promise<void> => {
      await Promise.all([checkAiStatus(), loadSaved()]);
      setInitialLoading(false);
    };
    init();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [checkAiStatus, loadSaved]);

  // Poll when generating
  useEffect(() => {
    if (status !== 'generating' || loading) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const api = await getApi();
        const response = await api.get<GetUnifiedAnalysisResponse>(
          API_ROUTES.patients.unifiedAnalysis(patientId)
        );
        const data = response.data;
        setStatus(data.status);

        if (data.status !== 'generating') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          if (data.status === 'completed' && data.result) {
            const normalized = normalizeAnalysis(data.result);
            setResult(normalized);
            setError(null);
            onAnalysisReadyRef.current?.(normalized);
          } else if (data.status === 'failed') {
            setError(data.errorMessage || 'Erreur lors de la generation');
          }
        }
      } catch {
        // Continue polling
      }
    }, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [status, loading, patientId]);

  const generateStream = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      setStreamActivity(0);
      setCheckedInterventions(new Set());

      const serverUrl = await getServerUrl();
      if (!serverUrl) {
        setError('URL du serveur non configuree');
        setLoading(false);
        return;
      }

      const token = await useAuthStore.getState().getAccessToken();
      const url = `http://${serverUrl}/api${API_ROUTES.patients.unifiedAnalysisStream(patientId)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
      });

      if (!response.ok || !response.body) {
        setError('Erreur de connexion au service IA');
        setLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'response') {
                setStreamActivity(prev => prev + 1);
              } else if (data.type === 'thinking') {
                setStreamActivity(prev => prev + 1);
              } else if (data.type === 'done') {
                const raw = data.unifiedResult?.analysis as UnifiedClinicalAnalysis | undefined;
                if (raw) {
                  const normalized = normalizeAnalysis(raw);
                  setResult(normalized);
                  setStatus('completed');
                  onAnalysisReadyRef.current?.(normalized);
                }
                setLoading(false);
                return;
              } else if (data.type === 'error') {
                setError(data.error);
                setLoading(false);
                return;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      setLoading(false);
    } catch {
      setError('Erreur lors de la generation de l\'analyse');
      setLoading(false);
    }
  };

  const toggleIntervention = (index: number): void => {
    setCheckedInterventions(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 50) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  // Initial loading state
  if (initialLoading) {
    return (
      <div className="border rounded-lg border-dashed p-6 flex items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-500">Chargement de l'analyse...</span>
      </div>
    );
  }

  // Background generation in progress (polling)
  if (status === 'generating' && !loading) {
    return (
      <div className="border rounded-lg border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bot className="h-5 w-5 text-purple-600" />
          <span className="font-semibold text-sm">Analyse IA</span>
          <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
            En cours
          </Badge>
        </div>
        <AILoadingAnimation
          streamActivity={0}
          thinkingActive={true}
          responseActive={false}
        />
        <p className="text-xs text-gray-500 text-center -mt-2">
          L'analyse a ete declenchee automatiquement
        </p>
      </div>
    );
  }

  // AI unavailable
  if (aiAvailable === false && !result) {
    return (
      <div className="border rounded-lg border-dashed border-gray-300 bg-gray-50 p-6">
        <div className="flex flex-col items-center justify-center text-center">
          <WifiOff className="h-10 w-10 text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium mb-1">Service IA non disponible</p>
          <p className="text-sm text-gray-500 mb-4">
            Verifiez que le modele LLM est en cours d'execution
          </p>
          <Button variant="outline" size="sm" onClick={checkAiStatus}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reessayer
          </Button>
        </div>
      </div>
    );
  }

  // Loading state (streaming)
  if (loading && !result) {
    return (
      <div className="border rounded-lg border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bot className="h-5 w-5 text-purple-600" />
          <span className="font-semibold text-sm">Analyse IA</span>
          <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
            Generation
          </Badge>
        </div>
        <AILoadingAnimation
          streamActivity={streamActivity}
          thinkingActive={streamActivity > 0}
          responseActive={streamActivity > 5}
        />
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLoading(false)}
            className="text-gray-500"
          >
            <StopCircle className="h-4 w-4 mr-2" />
            Arreter
          </Button>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !result) {
    return (
      <div className="border rounded-lg border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800 text-sm">Erreur d'analyse</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={generateStream}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reessayer
          </Button>
        </div>
      </div>
    );
  }

  // Empty state — no result yet
  if (!result) {
    return (
      <div className="border rounded-lg border-dashed border-purple-200 bg-purple-50/30 p-6">
        <div className="flex flex-col items-center justify-center text-center">
          <Sparkles className="h-10 w-10 text-purple-400 mb-3" />
          <p className="text-sm text-gray-600 mb-4">
            Lancez l'analyse IA unifiee pour obtenir les orientations, interventions et hypotheses diagnostiques
          </p>
          <Button onClick={generateStream} className="bg-purple-600 hover:bg-purple-700">
            <Sparkles className="h-4 w-4 mr-2" />
            Lancer l'analyse
          </Button>
        </div>
      </div>
    );
  }

  // Result display
  return (
    <div className="space-y-3 px-8 py-2">
      {/* 1. Critical Alerts */}
      {result.criticalAlerts.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-r-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="font-bold text-red-800 text-sm">Alertes critiques</span>
          </div>
          <div className="space-y-1">
            {result.criticalAlerts.map((alert, i) => (
              <p key={i} className="text-sm text-red-700 flex items-start gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                {alert}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 2. AI Header + Orientation */}
      <div className="border rounded-lg border-purple-200 bg-gradient-to-br from-purple-50 to-white p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-600" />
            <span className="font-semibold text-sm">Analyse IA</span>
          </div>
          <div className="flex items-center gap-2">
            {result.analysisTimestamp && (
              <span className="text-xs text-gray-400">
                {new Date(result.analysisTimestamp).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={generateStream}
              disabled={loading}
              title="Re-analyser"
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Orientation card */}
        <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-gray-100">
          <Badge className={orientationColors[result.orientation] || 'bg-gray-500 text-white'}>
            {orientationLabels[result.orientation] || result.orientation}
          </Badge>
          <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-700">{result.orientationReason}</span>
        </div>
      </div>

      {/* 3. Nursing Interventions (always expanded) */}
      {result.nursingInterventions.length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-sm">Actions infirmieres</span>
            <Badge variant="secondary" className="text-xs">
              {result.nursingInterventions.length}
            </Badge>
          </div>
          <div className="space-y-1.5">
            {result.nursingInterventions.map((intervention, index) => (
              <button
                key={index}
                onClick={() => toggleIntervention(index)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                  checkedInterventions.has(index)
                    ? 'bg-green-50 border-green-300'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                {checkedInterventions.has(index) ? (
                  <CheckSquare className="h-4 w-4 text-green-600 flex-shrink-0" />
                ) : (
                  <Square className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span
                  className={`text-sm ${
                    checkedInterventions.has(index)
                      ? 'text-green-800 line-through'
                      : 'text-gray-700'
                  }`}
                >
                  {intervention}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Medical Interventions (collapsible, default collapsed) */}
      {result.medicalInterventions.length > 0 && (
        <div className="border rounded-lg">
          <button
            onClick={() => setShowMedical(!showMedical)}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-sm">Pour le medecin</span>
              <Badge variant="secondary" className="text-xs">
                {result.medicalInterventions.length}
              </Badge>
            </div>
            {showMedical ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {showMedical && (
            <div className="px-3 pb-3 space-y-1">
              {result.medicalInterventions.map((intervention, i) => (
                <p key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                  {intervention}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Recommended Tests (collapsible, default collapsed) */}
      {result.recommendedTests.length > 0 && (
        <div className="border rounded-lg">
          <button
            onClick={() => setShowTests(!showTests)}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-indigo-600" />
              <span className="font-semibold text-sm">Examens recommandes</span>
              <Badge variant="secondary" className="text-xs">
                {result.recommendedTests.length}
              </Badge>
            </div>
            {showTests ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {showTests && (
            <div className="px-3 pb-3 flex flex-wrap gap-2">
              {result.recommendedTests.map((test, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {test}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Diagnostic Hypotheses (collapsible, default collapsed) */}
      {result.pathologies.length > 0 && (
        <div className="border rounded-lg">
          <button
            onClick={() => setShowPathologies(!showPathologies)}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              <span className="font-semibold text-sm">Hypotheses diagnostiques</span>
              <Badge variant="secondary" className="text-xs">
                {result.pathologies.length}
              </Badge>
            </div>
            {showPathologies ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {showPathologies && (
            <div className="px-3 pb-3 space-y-3">
              {result.pathologies.map((pathology, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 text-sm">{pathology.name}</p>
                      {pathology.icd10Code && (
                        <p className="text-xs text-gray-400">{pathology.icd10Code}</p>
                      )}
                    </div>
                    <Badge className={urgencyColors[pathology.urgency]}>
                      {urgencyLabels[pathology.urgency]}
                    </Badge>
                  </div>

                  {/* Confidence bar */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getConfidenceColor(pathology.confidence)}`}
                        style={{ width: `${pathology.confidence}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-12 text-right">
                      {pathology.confidence}%
                    </span>
                  </div>

                  {/* Signs */}
                  {pathology.signs.length > 0 && (
                    <p className="text-sm text-gray-500 mb-1">
                      {pathology.signs.join(', ')}
                    </p>
                  )}

                  {/* Reasoning */}
                  {pathology.reasoning && (
                    <p className="text-sm italic text-gray-600">{pathology.reasoning}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. Warnings */}
      {result.warnings.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-r-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span className="font-semibold text-amber-800 text-sm">Mises en garde</span>
          </div>
          <div className="space-y-1">
            {result.warnings.map((warning, i) => (
              <p key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                {warning}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
