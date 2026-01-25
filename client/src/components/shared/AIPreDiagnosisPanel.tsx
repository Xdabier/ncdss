import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { getApi } from '../../services/api';
import { getServerUrl } from '../../services/config';
import { useAuthStore } from '../../stores/auth.store';
import {
  Bot,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  WifiOff,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  Zap,
  Brain,
  StopCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  Stethoscope,
  FileSearch,
  ListChecks,
} from 'lucide-react';

interface AISuggestion {
  diagnosis: string;
  confidence: number;
  reasoning: string;
  urgency: 'routine' | 'urgent' | 'emergent';
  icd10Code?: string;
}

interface AIPreDiagnosisResponse {
  available: boolean;
  suggestions: AISuggestion[];
  recommendedTests?: string[];
  warnings?: string[];
  generatedAt: string;
  thinkingTrace?: string;
  thinkingEnabled: boolean;
}

type SavedPreDiagnosisStatus = 'pending' | 'generating' | 'completed' | 'failed' | null;

interface SavedPreDiagnosis {
  exists: boolean;
  status: SavedPreDiagnosisStatus;
  result: AIPreDiagnosisResponse | null;
  errorMessage: string | null;
  generatedAt: string | null;
  triggerSource: string | null;
}

interface AIPreDiagnosisPanelProps {
  patientId: string;
  onUseSuggestion?: (suggestion: AISuggestion) => void;
}

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

const triggerSourceLabels: Record<string, string> = {
  manual_nurse: 'Infirmier',
  manual_doctor: 'Medecin',
  auto_triage_complete: 'Automatique (fin triage)',
};

// Analysis phases for the loading animation
const analysisPhases = [
  { icon: FileSearch, label: 'Lecture du dossier patient...', duration: 2000 },
  { icon: Activity, label: 'Analyse des signes vitaux...', duration: 3000 },
  { icon: Stethoscope, label: 'Evaluation clinique ABCDE...', duration: 4000 },
  { icon: Brain, label: 'Raisonnement diagnostique...', duration: 5000 },
  { icon: ListChecks, label: 'Generation des suggestions...', duration: 6000 },
];

// Animated loading component
function AILoadingAnimation({
  streamActivity,
  thinkingActive,
  responseActive
}: {
  streamActivity: number;
  thinkingActive: boolean;
  responseActive: boolean;
}) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [dots, setDots] = useState<{ id: number; x: number; y: number; scale: number }[]>([]);
  const [waveOffset, setWaveOffset] = useState(0);
  const dotIdRef = useRef(0);

  // Animate the brain wave
  useEffect(() => {
    const timer = setInterval(() => {
      setWaveOffset(prev => prev + 0.3);
    }, 50);
    return () => clearInterval(timer);
  }, []);

  // Progress through phases based on stream activity
  useEffect(() => {
    if (responseActive && currentPhase < analysisPhases.length - 1) {
      setCurrentPhase(analysisPhases.length - 1);
    } else if (thinkingActive && currentPhase < analysisPhases.length - 2) {
      const timer = setTimeout(() => {
        setCurrentPhase(prev => Math.min(prev + 1, analysisPhases.length - 2));
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [thinkingActive, responseActive, currentPhase]);

  // Create floating dots on stream activity
  useEffect(() => {
    if (streamActivity > 0) {
      const newDot = {
        id: dotIdRef.current++,
        x: Math.random() * 60 + 20,
        y: Math.random() * 40 + 30,
        scale: Math.random() * 0.5 + 0.5,
      };
      setDots(prev => [...prev.slice(-8), newDot]);
    }
  }, [streamActivity]);

  // Clean up old dots
  useEffect(() => {
    const timer = setInterval(() => {
      setDots(prev => prev.slice(1));
    }, 800);
    return () => clearInterval(timer);
  }, []);

  const CurrentIcon = analysisPhases[currentPhase]?.icon || Brain;
  const currentLabel = analysisPhases[currentPhase]?.label || 'Analyse en cours...';

  return (
    <div className="relative py-8 px-4">
      {/* Background glow effect */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`w-32 h-32 rounded-full bg-purple-200 opacity-30 blur-xl transition-all duration-500 ${
          streamActivity > 0 ? 'scale-125' : 'scale-100'
        }`} />
      </div>

      {/* Central icon with pulse rings */}
      <div className="relative flex flex-col items-center">
        {/* Pulse rings */}
        <div className="absolute">
          <div className={`w-20 h-20 rounded-full border-2 border-purple-300 animate-ping opacity-20`} />
        </div>
        <div className="absolute">
          <div
            className={`w-24 h-24 rounded-full border border-purple-200 transition-all duration-300 ${
              streamActivity > 0 ? 'scale-110 opacity-40' : 'scale-100 opacity-20'
            }`}
            style={{ animation: 'pulse 2s ease-in-out infinite' }}
          />
        </div>

        {/* Main icon container */}
        <div className={`relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-purple-700
          flex items-center justify-center shadow-lg transition-transform duration-200 ${
            streamActivity > 0 ? 'scale-110' : 'scale-100'
          }`}
        >
          <CurrentIcon className="h-8 w-8 text-white" />

          {/* Activity indicator */}
          {(thinkingActive || responseActive) && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500
              flex items-center justify-center border-2 border-white">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            </div>
          )}
        </div>

        {/* Floating activity dots */}
        {dots.map(dot => (
          <div
            key={dot.id}
            className="absolute w-2 h-2 rounded-full bg-purple-400 animate-float-up opacity-60"
            style={{
              left: `${dot.x}%`,
              top: `${dot.y}%`,
              transform: `scale(${dot.scale})`,
            }}
          />
        ))}

        {/* Phase label */}
        <div className="mt-6 text-center">
          <p className="text-sm font-medium text-purple-700 transition-all duration-300">
            {currentLabel}
          </p>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mt-3">
            {analysisPhases.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx <= currentPhase
                    ? 'w-4 bg-purple-500'
                    : 'w-1.5 bg-purple-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Subtle brain wave animation at bottom */}
        <div className="mt-4 flex items-center gap-0.5">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-purple-300 rounded-full transition-all duration-75"
              style={{
                height: `${8 + Math.sin(waveOffset + i * 0.5) * 6 + (streamActivity > 0 ? 4 : 0)}px`,
              }}
            />
          ))}
        </div>
      </div>

      {/* CSS for float animation */}
      <style>{`
        @keyframes float-up {
          0% {
            opacity: 0.6;
            transform: translateY(0) scale(var(--scale, 1));
          }
          100% {
            opacity: 0;
            transform: translateY(-30px) scale(0.5);
          }
        }
        .animate-float-up {
          animation: float-up 1s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

export function AIPreDiagnosisPanel({ patientId, onUseSuggestion }: AIPreDiagnosisPanelProps) {
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [result, setResult] = useState<AIPreDiagnosisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllTests, setShowAllTests] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  // Saved pre-diagnosis state
  const [savedPreDiagnosis, setSavedPreDiagnosis] = useState<SavedPreDiagnosis | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(true);

  // Streaming state
  const [streamingThinking, setStreamingThinking] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [streamActivity, setStreamActivity] = useState(0); // Counter for animation reactivity
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved pre-diagnosis on mount
  const loadSavedPreDiagnosis = useCallback(async () => {
    try {
      setLoadingSaved(true);
      const api = await getApi();
      const response = await api.get(`/patients/${patientId}/ai-prediagnosis`);
      setSavedPreDiagnosis(response.data);

      // If we have a completed result, set it
      if (response.data.exists && response.data.status === 'completed' && response.data.result) {
        setResult(response.data.result);
      }

      // If there was a saved error, display it
      if (response.data.exists && response.data.status === 'failed' && response.data.errorMessage) {
        setError(response.data.errorMessage);
      }
    } catch (err) {
      console.error('Failed to load saved pre-diagnosis:', err);
    } finally {
      setLoadingSaved(false);
    }
  }, [patientId]);

  // Check AI availability on mount
  const checkAIStatus = async () => {
    try {
      setCheckingStatus(true);
      const api = await getApi();
      const response = await api.get(`/patients/${patientId}/ai-status`);
      setAiAvailable(response.data.available);
    } catch (err) {
      console.error('Failed to check AI status:', err);
      setAiAvailable(false);
    } finally {
      setCheckingStatus(false);
    }
  };

  // Initial load
  useEffect(() => {
    checkAIStatus();
    loadSavedPreDiagnosis();

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [patientId, loadSavedPreDiagnosis]);

  // Poll when status is 'generating'
  useEffect(() => {
    if (savedPreDiagnosis?.status !== 'generating') {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const pollForResult = async () => {
      try {
        const api = await getApi();
        const response = await api.get(`/patients/${patientId}/ai-prediagnosis`);
        setSavedPreDiagnosis(response.data);

        if (response.data.status !== 'generating') {
          // Generation finished
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          if (response.data.status === 'completed' && response.data.result) {
            setResult(response.data.result);
            setError(null);
          } else if (response.data.status === 'failed') {
            setError(response.data.errorMessage || 'Erreur lors de la generation');
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    // Start polling
    pollingIntervalRef.current = setInterval(pollForResult, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [savedPreDiagnosis?.status, patientId]);

  const stopGeneration = () => {
    setLoading(false);
  };

  const generatePreDiagnosis = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      setStreamingThinking('');
      setStreamingResponse('');
      setStreamActivity(0);
      setShowThinking(false); // Don't auto-expand during streaming

      const serverUrl = await getServerUrl();
      if (!serverUrl) {
        setError('URL du serveur non configuree');
        setLoading(false);
        return;
      }

      const token = await useAuthStore.getState().getAccessToken();

      // Use EventSource for SSE streaming
      const url = `http://${serverUrl}/api/patients/${patientId}/ai-prediagnosis-stream`;

      // EventSource doesn't support headers, so we use fetch with streaming
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

        // Process SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'thinking') {
                setStreamingThinking(prev => prev + data.content);
                setStreamActivity(prev => prev + 1);
              } else if (data.type === 'response') {
                setStreamingResponse(prev => prev + data.content);
                setStreamActivity(prev => prev + 1);
              } else if (data.type === 'done') {
                setResult(data.result);
                // Refresh saved state
                await loadSavedPreDiagnosis();
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
    } catch (err: any) {
      console.error('Streaming error:', err);
      setError('Erreur lors de la generation du pre-diagnostic');
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 50) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  // Loading saved pre-diagnosis state
  if (loadingSaved || checkingStatus) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400 mr-2" />
          <span className="text-gray-500">
            {loadingSaved ? 'Chargement du pre-diagnostic...' : 'Verification du service IA...'}
          </span>
        </CardContent>
      </Card>
    );
  }

  // Background generation in progress (from complete-triage)
  if (savedPreDiagnosis?.status === 'generating' && !loading) {
    return (
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-600" />
            Pre-diagnostic IA
            <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
              En cours
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AILoadingAnimation
            streamActivity={0}
            thinkingActive={true}
            responseActive={false}
          />
          <p className="text-xs text-gray-500 text-center -mt-2">
            Le pre-diagnostic a ete declenche automatiquement
          </p>
        </CardContent>
      </Card>
    );
  }

  // AI Not Available
  if (aiAvailable === false && !result) {
    return (
      <Card className="border-dashed border-gray-300 bg-gray-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-gray-500">
            <Bot className="h-5 w-5" />
            Pre-diagnostic IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <WifiOff className="h-10 w-10 text-gray-400 mb-3" />
            <p className="text-gray-600 font-medium mb-1">Service IA non disponible</p>
            <p className="text-sm text-gray-500 mb-4">
              Verifiez que le modele LLM est en cours d'execution
            </p>
            <Button variant="outline" size="sm" onClick={checkAIStatus}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // AI Available - Show Generate Button or Results
  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-600" />
            Pre-diagnostic IA
            <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
              LLM Local
            </Badge>
            {result?.thinkingEnabled && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                <Brain className="h-3 w-3 mr-1" />
                Mode raisonnement
              </Badge>
            )}
          </CardTitle>
          {result && (
            <Button variant="ghost" size="sm" onClick={generatePreDiagnosis} disabled={loading} title="Regenerer">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Show saved status if failed and no result */}
        {savedPreDiagnosis?.status === 'failed' && !result && !loading && (
          <div className="flex flex-col items-center py-4">
            <XCircle className="h-8 w-8 text-red-400 mb-3" />
            <p className="text-sm text-gray-600 mb-2 text-center">
              La generation precedente a echoue
            </p>
            <Button onClick={generatePreDiagnosis} className="bg-purple-600 hover:bg-purple-700">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reessayer
            </Button>
          </div>
        )}

        {!result && !loading && savedPreDiagnosis?.status !== 'failed' && (
          <div className="flex flex-col items-center py-4">
            <Sparkles className="h-8 w-8 text-purple-400 mb-3" />
            <p className="text-sm text-gray-600 mb-4 text-center">
              Generez des suggestions de pre-diagnostic basees sur l'IA
            </p>
            <Button onClick={generatePreDiagnosis} className="bg-purple-600 hover:bg-purple-700">
              <Sparkles className="h-4 w-4 mr-2" />
              Generer
            </Button>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            {/* Animated loading visualization */}
            <AILoadingAnimation
              streamActivity={streamActivity}
              thinkingActive={streamingThinking.length > 0}
              responseActive={streamingResponse.length > 0}
            />

            {/* Stop button */}
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={stopGeneration} className="text-red-600 border-red-300 hover:bg-red-50">
                <StopCircle className="h-4 w-4 mr-2" />
                Arreter
              </Button>
            </div>
          </div>
        )}

        {result && result.available && !loading && (
          <div className="space-y-4">
            {/* AI Thinking Trace */}
            {result.thinkingTrace && (
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowThinking(!showThinking)}
                  className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <div className="flex items-center gap-2 text-blue-700">
                    <Brain className="h-4 w-4" />
                    <span className="font-medium">Raisonnement de l'IA</span>
                  </div>
                  {showThinking ? <ChevronUp className="h-4 w-4 text-blue-600" /> : <ChevronDown className="h-4 w-4 text-blue-600" />}
                </button>
                {showThinking && (
                  <div className="p-3 bg-blue-50/50 border-t border-blue-100">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono leading-relaxed">
                      {result.thinkingTrace}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Warnings */}
            {result.warnings && result.warnings.length > 0 && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  {result.warnings.join(' - ')}
                </AlertDescription>
              </Alert>
            )}

            {/* Suggestions */}
            {result.suggestions.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Aucune suggestion generee. Reessayez avec plus de donnees cliniques.
              </p>
            ) : (
              <div className="space-y-3">
                {result.suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{suggestion.diagnosis}</p>
                        {suggestion.icd10Code && (
                          <p className="text-xs text-gray-500">{suggestion.icd10Code}</p>
                        )}
                      </div>
                      <Badge className={urgencyColors[suggestion.urgency]}>
                        {urgencyLabels[suggestion.urgency]}
                      </Badge>
                    </div>

                    {/* Confidence Bar */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getConfidenceColor(suggestion.confidence)}`}
                          style={{ width: `${suggestion.confidence}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-12 text-right">
                        {suggestion.confidence}%
                      </span>
                    </div>

                    {/* Reasoning */}
                    <p className="text-sm text-gray-600">{suggestion.reasoning}</p>

                    {/* Use Suggestion Button (for doctor) */}
                    {onUseSuggestion && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        onClick={() => onUseSuggestion(suggestion)}
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Utiliser ce diagnostic
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Recommended Tests */}
            {result.recommendedTests && result.recommendedTests.length > 0 && (
              <div className="pt-3 border-t">
                <button
                  onClick={() => setShowAllTests(!showAllTests)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 hover:text-gray-900"
                >
                  <FlaskConical className="h-4 w-4 text-blue-500" />
                  Examens recommandes ({result.recommendedTests.length})
                  {showAllTests ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showAllTests && (
                  <div className="flex flex-wrap gap-2">
                    {result.recommendedTests.map((test, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {test}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Timestamp and Source */}
            <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  Genere le {new Date(result.generatedAt).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {savedPreDiagnosis?.triggerSource && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{triggerSourceLabels[savedPreDiagnosis.triggerSource] || savedPreDiagnosis.triggerSource}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
