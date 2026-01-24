import React, { useState, useEffect, useRef } from 'react';
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

export function AIPreDiagnosisPanel({ patientId, onUseSuggestion }: AIPreDiagnosisPanelProps) {
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [result, setResult] = useState<AIPreDiagnosisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllTests, setShowAllTests] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  // Streaming state
  const [streamingThinking, setStreamingThinking] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  // Check AI availability on mount
  useEffect(() => {
    checkAIStatus();
    // Cleanup EventSource on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [patientId]);

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

  const stopGeneration = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLoading(false);
  };

  const generatePreDiagnosis = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      setStreamingThinking('');
      setStreamingResponse('');
      setShowThinking(true); // Auto-expand thinking while streaming

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
              } else if (data.type === 'response') {
                setStreamingResponse(prev => prev + data.content);
              } else if (data.type === 'done') {
                setResult(data.result);
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

  // Loading state
  if (checkingStatus) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400 mr-2" />
          <span className="text-gray-500">Verification du service IA...</span>
        </CardContent>
      </Card>
    );
  }

  // AI Not Available
  if (aiAvailable === false) {
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
              Verifiez que Ollama est en cours d'execution
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
              Ollama
            </Badge>
            {result?.thinkingEnabled && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                <Brain className="h-3 w-3 mr-1" />
                Mode raisonnement
              </Badge>
            )}
          </CardTitle>
          {result && (
            <Button variant="ghost" size="sm" onClick={generatePreDiagnosis} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!result && !loading && (
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
            {/* Streaming Thinking Display */}
            {streamingThinking && (
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-blue-50">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Brain className="h-4 w-4 animate-pulse" />
                    <span className="font-medium">L'IA reflechit...</span>
                  </div>
                </div>
                <div className="p-3 bg-blue-50/50 border-t border-blue-100 max-h-48 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono leading-relaxed">
                    {streamingThinking}
                    <span className="animate-pulse">|</span>
                  </pre>
                </div>
              </div>
            )}

            {/* Streaming Response Display */}
            {streamingResponse && (
              <div className="border rounded-lg overflow-hidden">
                <div className="p-3 bg-purple-50">
                  <div className="flex items-center gap-2 text-purple-700">
                    <Bot className="h-4 w-4" />
                    <span className="font-medium">Generation de la reponse...</span>
                  </div>
                </div>
                <div className="p-3 bg-purple-50/50 border-t border-purple-100 max-h-32 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                    {streamingResponse}
                    <span className="animate-pulse">|</span>
                  </pre>
                </div>
              </div>
            )}

            {/* Loading indicator when no streaming content yet */}
            {!streamingThinking && !streamingResponse && (
              <div className="flex flex-col items-center py-6">
                <div className="relative">
                  <Bot className="h-10 w-10 text-purple-600" />
                  <RefreshCw className="h-4 w-4 text-purple-600 animate-spin absolute -bottom-1 -right-1" />
                </div>
                <p className="text-sm text-purple-600 mt-3">Connexion au modele...</p>
              </div>
            )}

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
                  {result.warnings.join(' • ')}
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

            {/* Timestamp */}
            <p className="text-xs text-gray-400 text-center pt-2">
              Genere le {new Date(result.generatedAt).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
