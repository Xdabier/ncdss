import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getApi } from '../../services/api';
import { getServerUrl } from '../../services/config';
import { useAuthStore } from '../../stores/auth.store';
import { AILoadingAnimation } from '../shared/AIPreDiagnosisPanel';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  UnifiedClinicalAnalysis,
  UnifiedPathology,
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
import {
  parseIncremental,
  IncrementalParseResult,
  FieldStatus,
  AnalysisFieldKey,
} from '../../utils/incremental-json-parser';

interface UnifiedAnalysisPanelProps {
  patientId: string;
  onAnalysisReady?: (analysis: UnifiedClinicalAnalysis) => void;
  /** Called as soon as orientation is parsed from the stream (before full completion) */
  onOrientationSuggested?: (orientation: string, reason?: string) => void;
  /** Called when loading state changes (for parent to show spinner on re-analyze button) */
  onLoadingChange?: (loading: boolean) => void;
  /** Called once on mount with a stable handle to trigger regeneration or stop from parent */
  onReady?: (handle: { regenerate: () => void; stop: () => void }) => void;
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

/** Section display configuration */
interface SectionConfig {
  key: AnalysisFieldKey;
  /** Some sections combine multiple field keys */
  extraKeys?: AnalysisFieldKey[];
  icon: React.ElementType;
  iconColor: string;
  title: string;
}

const SECTION_ORDER: SectionConfig[] = [
  { key: 'orientation', extraKeys: ['orientationReason'], icon: MapPin, iconColor: 'text-purple-600', title: 'Orientation' },
  { key: 'nursingInterventions', icon: ListChecks, iconColor: 'text-green-600', title: 'Interventions infirmieres' },
  { key: 'medicalInterventions', icon: Stethoscope, iconColor: 'text-blue-600', title: 'Interventions medicales' },
  { key: 'recommendedTests', icon: FlaskConical, iconColor: 'text-indigo-600', title: 'Examens recommandes' },
  { key: 'criticalAlerts', icon: AlertTriangle, iconColor: 'text-red-600', title: 'Alertes critiques' },
  { key: 'warnings', icon: AlertTriangle, iconColor: 'text-amber-600', title: 'Mises en garde' },
  { key: 'pathologies', icon: Brain, iconColor: 'text-purple-600', title: 'Hypotheses diagnostiques' },
];

/** Interleaved split for desktop masonry: even indices → left column, odd → right column.
 *  Reading left-to-right per row gives the same order as SECTION_ORDER. */
const LEFT_COLUMN = SECTION_ORDER.filter((_, i) => i % 2 === 0);
const RIGHT_COLUMN = SECTION_ORDER.filter((_, i) => i % 2 !== 0);

/** Throttle interval for incremental parsing (ms) */
const PARSE_THROTTLE_MS = 200;

/** Bouncing dots indicator for active sections */
function BouncingDots(): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-0.5 ml-2">
      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

/** Skeleton placeholder for a section being generated or not yet started */
function SectionSkeleton({
  config,
  status,
}: {
  config: SectionConfig;
  status: FieldStatus;
}): React.ReactElement {
  const Icon = config.icon;
  const isActive = status === 'active';

  return (
    <div
      className={`border rounded-lg p-3 transition-all ${
        isActive ? 'border-purple-200 bg-purple-50/30' : 'border-gray-100 bg-gray-50/30'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${isActive ? config.iconColor : 'text-gray-300'}`} />
        <span className={`font-semibold text-sm ${isActive ? 'text-gray-700' : 'text-gray-300'}`}>
          {config.title}
        </span>
        {isActive && <BouncingDots />}
      </div>
      {isActive && (
        <div className="mt-2 space-y-2">
          <div className="h-3 bg-purple-100 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-purple-100 rounded animate-pulse w-1/2" />
        </div>
      )}
    </div>
  );
}

// ─── Section render helpers (shared between streaming & final views) ──────────

function renderCriticalAlerts(alerts: string[], streaming: boolean): React.ReactElement | null {
  if (alerts.length === 0) return null;
  return (
    <div className={`bg-red-50 border-l-4 border-red-500 rounded-r-lg p-3 ${streaming ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <span className="font-bold text-red-800 text-sm">Alertes critiques</span>
      </div>
      <div className="space-y-1">
        {alerts.map((alert, i) => (
          <p key={i} className="text-sm text-red-700 flex items-start gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
            {alert}
          </p>
        ))}
      </div>
    </div>
  );
}

function renderOrientationBlock(
  data: Record<string, unknown>,
  fieldStatuses: Record<AnalysisFieldKey, FieldStatus>,
  streaming: boolean,
): React.ReactElement {
  const orientation = data.orientation as string | undefined;
  const orientationReason = data.orientationReason as string | undefined;
  const orientationComplete = fieldStatuses.orientation === 'complete';
  const reasonComplete = fieldStatuses.orientationReason === 'complete';

  return (
    <div className={`border rounded-lg border-purple-200 bg-gradient-to-br from-purple-50 to-white p-3 ${streaming ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-5 w-5 text-purple-600" />
        <span className="font-semibold text-sm">Orientation</span>
      </div>
      <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-gray-100">
        {orientationComplete && orientation ? (
          <Badge className={orientationColors[orientation] || 'bg-gray-500 text-white'}>
            {orientationLabels[orientation] || orientation}
          </Badge>
        ) : (
          <div className="h-5 w-20 bg-purple-100 rounded animate-pulse" />
        )}
        {reasonComplete && orientationReason ? (
          <span className="text-sm text-gray-700">{orientationReason}</span>
        ) : (
          <div className="h-3 bg-gray-100 rounded animate-pulse flex-1" />
        )}
      </div>
    </div>
  );
}

function renderNursingInterventions(
  interventions: string[],
  checkedInterventions: Set<number>,
  toggleIntervention: (index: number) => void,
  streaming: boolean,
): React.ReactElement | null {
  if (interventions.length === 0) return null;
  return (
    <div className={`border rounded-lg p-3 ${streaming ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <ListChecks className="h-5 w-5 text-green-600" />
        <span className="font-semibold text-sm">Interventions infirmieres</span>
        <Badge variant="secondary" className="text-xs">
          {interventions.length}
        </Badge>
      </div>
      <div className="space-y-1.5">
        {interventions.map((intervention, index) => (
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
  );
}

function renderBulletList(
  items: string[],
  icon: React.ElementType,
  iconColor: string,
  title: string,
  dotColor: string,
  textColor: string,
  collapsible: boolean,
  expanded: boolean,
  onToggle: () => void,
  streaming: boolean,
): React.ReactElement | null {
  if (items.length === 0) return null;
  const Icon = icon;

  if (!collapsible) {
    return (
      <div className={`border rounded-lg p-3 ${streaming ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}`}>
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        <div className="space-y-1">
          {items.map((item, i) => (
            <p key={i} className={`text-sm ${textColor} flex items-start gap-2`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5 flex-shrink-0`} />
              {item}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg ${streaming ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          <span className="font-semibold text-sm">{title}</span>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {items.map((item, i) => (
            <p key={i} className={`text-sm ${textColor} flex items-start gap-2`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5 flex-shrink-0`} />
              {item}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function renderTestBadges(
  tests: string[],
  expanded: boolean,
  onToggle: () => void,
  streaming: boolean,
): React.ReactElement | null {
  if (tests.length === 0) return null;
  return (
    <div className={`border rounded-lg ${streaming ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-indigo-600" />
          <span className="font-semibold text-sm">Examens recommandes</span>
          <Badge variant="secondary" className="text-xs">{tests.length}</Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 flex flex-wrap gap-2">
          {tests.map((test, i) => (
            <Badge key={i} variant="secondary" className="text-xs">{test}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function renderPathologies(
  pathologies: UnifiedPathology[],
  expanded: boolean,
  onToggle: () => void,
  getConfidenceColor: (c: number) => string,
  streaming: boolean,
): React.ReactElement | null {
  if (pathologies.length === 0) return null;
  return (
    <div className={`border rounded-lg ${streaming ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-600" />
          <span className="font-semibold text-sm">Hypotheses diagnostiques</span>
          <Badge variant="secondary" className="text-xs">{pathologies.length}</Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {pathologies.map((pathology, i) => (
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
              {pathology.signs.length > 0 && (
                <p className="text-sm text-gray-500 mb-1">{pathology.signs.join(', ')}</p>
              )}
              {pathology.reasoning && (
                <p className="text-sm italic text-gray-600">{pathology.reasoning}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderWarnings(warnings: string[], streaming: boolean): React.ReactElement | null {
  if (warnings.length === 0) return null;
  return (
    <div className={`bg-amber-50 border-l-4 border-amber-500 rounded-r-lg p-3 ${streaming ? 'animate-in fade-in slide-in-from-bottom-2 duration-300' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        <span className="font-semibold text-amber-800 text-sm">Mises en garde</span>
      </div>
      <div className="space-y-1">
        {warnings.map((warning, i) => (
          <p key={i} className="text-sm text-amber-700 flex items-start gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
            {warning}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function UnifiedAnalysisPanel({
  patientId,
  onAnalysisReady,
  onOrientationSuggested,
  onLoadingChange,
  onReady,
}: UnifiedAnalysisPanelProps): React.ReactElement {
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<UnifiedClinicalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [incrementalResult, setIncrementalResult] = useState<IncrementalParseResult | null>(null);
  const [checkedInterventions, setCheckedInterventions] = useState<Set<number>>(new Set());
  const [showMedical, setShowMedical] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [showPathologies, setShowPathologies] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const rawJsonRef = useRef<string>('');
  const lastParseTimeRef = useRef<number>(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const completedFieldsRef = useRef<Set<string>>(new Set());
  const lastPartialRef = useRef<Record<string, unknown> | null>(null);
  const generateStreamRef = useRef<() => Promise<void>>();
  const stopStreamRef = useRef<() => void>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const onAnalysisReadyRef = useRef(onAnalysisReady);
  onAnalysisReadyRef.current = onAnalysisReady;
  const onOrientationSuggestedRef = useRef(onOrientationSuggested);
  onOrientationSuggestedRef.current = onOrientationSuggested;
  const orientationFiredRef = useRef(false);

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
      abortControllerRef.current?.abort();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [checkAiStatus, loadSaved]);

  // Expose regenerate + stop handle to parent
  useEffect(() => {
    onReady?.({
      regenerate: () => { generateStreamRef.current?.(); },
      stop: () => { stopStreamRef.current?.(); },
    });
  }, [onReady]);

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

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
    // Abort previous stream if still running
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      setResult(null);
      setIncrementalResult(null);
      setCheckedInterventions(new Set());
      rawJsonRef.current = '';
      lastParseTimeRef.current = 0;
      completedFieldsRef.current = new Set();
      lastPartialRef.current = null;
      orientationFiredRef.current = false;

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
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        setError('Erreur de connexion au service IA');
        setLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let thinkingPhase = true;

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
                thinkingPhase = false;
                rawJsonRef.current += data.content;

                // Throttled incremental parse
                const now = Date.now();
                if (now - lastParseTimeRef.current >= PARSE_THROTTLE_MS) {
                  lastParseTimeRef.current = now;
                  const parsed = parseIncremental(rawJsonRef.current);
                  setIncrementalResult(parsed);

                  // Fire early orientation suggestion as soon as the field is complete
                  if (
                    !orientationFiredRef.current &&
                    parsed.fieldStatuses.orientation === 'complete' &&
                    parsed.partial?.orientation
                  ) {
                    orientationFiredRef.current = true;
                    onOrientationSuggestedRef.current?.(
                      parsed.partial.orientation as string,
                      parsed.partial.orientationReason as string | undefined,
                    );
                  }
                }
              } else if (data.type === 'thinking') {
                // Still in thinking phase — no JSON yet
              } else if (data.type === 'done') {
                const raw = data.unifiedResult?.analysis as UnifiedClinicalAnalysis | undefined;

                // All state updates are batched by React 18, so clearing
                // incrementalResult and setting result happen in the same
                // render — no flash back to the loading spinner.
                if (raw) {
                  const normalized = normalizeAnalysis(raw);
                  setResult(normalized);
                  setStatus('completed');
                  onAnalysisReadyRef.current?.(normalized);
                }
                setIncrementalResult(null);
                rawJsonRef.current = '';
                setLoading(false);
                return;
              } else if (data.type === 'error') {
                setError(data.error);
                setIncrementalResult(null);
                rawJsonRef.current = '';
                setLoading(false);
                return;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      // Stream ended without done event — connection interrupted
      setError('L\'analyse a ete interrompue. Veuillez relancer.');
      setIncrementalResult(null);
      rawJsonRef.current = '';
      lastPartialRef.current = null;
      setLoading(false);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Stream was intentionally stopped — don't set error
        return;
      }
      setError('Erreur lors de la generation de l\'analyse');
      setIncrementalResult(null);
      rawJsonRef.current = '';
      lastPartialRef.current = null;
      setLoading(false);
    }
  };
  generateStreamRef.current = generateStream;

  const stopStream = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    setIncrementalResult(null);
    rawJsonRef.current = '';
    lastPartialRef.current = null;
  }, []);
  stopStreamRef.current = stopStream;

  const handleStop = (): void => {
    setLoading(false);
    setIncrementalResult(null);
    rawJsonRef.current = '';
    lastPartialRef.current = null;
    // Restore previous saved result from database
    loadSaved();
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

  // ─── Render helpers for progressive streaming view ─────────────────────────

  const renderStreamingSection = (
    config: SectionConfig,
    fieldStatuses: Record<AnalysisFieldKey, FieldStatus>,
    partial: Record<string, unknown> | null,
  ): React.ReactElement | null => {
    // Monotonic: once a field reaches 'complete', prevent regression to 'active'
    // (the incremental parser can oscillate due to nested closing braces)
    let primaryStatus = fieldStatuses[config.key];
    if (completedFieldsRef.current.has(config.key)) {
      primaryStatus = 'complete';
    }

    // Use cached partial as fallback when current parse failed
    const effectivePartial = partial ?? lastPartialRef.current;

    if (primaryStatus === 'not_started') {
      return <SectionSkeleton key={config.key} config={config} status="not_started" />;
    }

    if (primaryStatus === 'active') {
      // Special case: orientation block — show partial data while active
      if (config.key === 'orientation' && effectivePartial) {
        return (
          <div key={config.key}>
            {renderOrientationBlock(effectivePartial, fieldStatuses, true)}
          </div>
        );
      }
      return <SectionSkeleton key={config.key} config={config} status="active" />;
    }

    // Status is 'complete'
    if (!effectivePartial) {
      return <SectionSkeleton key={config.key} config={config} status="active" />;
    }

    // Only animate entry the first time a field transitions to 'complete'
    const shouldAnimate = !completedFieldsRef.current.has(config.key);
    if (shouldAnimate) {
      completedFieldsRef.current.add(config.key);
    }

    switch (config.key) {
      case 'criticalAlerts': {
        const alerts = (effectivePartial.criticalAlerts as string[]) ?? [];
        return alerts.length > 0
          ? <div key={config.key}>{renderCriticalAlerts(alerts, shouldAnimate)}</div>
          : null;
      }
      case 'orientation':
        return (
          <div key={config.key}>
            {renderOrientationBlock(effectivePartial, fieldStatuses, shouldAnimate)}
          </div>
        );
      case 'nursingInterventions': {
        const interventions = (effectivePartial.nursingInterventions as string[]) ?? [];
        return interventions.length > 0
          ? <div key={config.key}>{renderNursingInterventions(interventions, checkedInterventions, toggleIntervention, shouldAnimate)}</div>
          : null;
      }
      case 'medicalInterventions': {
        const items = (effectivePartial.medicalInterventions as string[]) ?? [];
        return items.length > 0
          ? <div key={config.key}>{renderBulletList(items, Stethoscope, 'text-blue-600', 'Interventions medicales', 'bg-blue-400', 'text-gray-700', true, showMedical, () => setShowMedical(!showMedical), shouldAnimate)}</div>
          : null;
      }
      case 'recommendedTests': {
        const tests = (effectivePartial.recommendedTests as string[]) ?? [];
        return tests.length > 0
          ? <div key={config.key}>{renderTestBadges(tests, showTests, () => setShowTests(!showTests), shouldAnimate)}</div>
          : null;
      }
      case 'pathologies': {
        const pathologies = (effectivePartial.pathologies as UnifiedPathology[]) ?? [];
        return pathologies.length > 0
          ? <div key={config.key}>{renderPathologies(pathologies, showPathologies, () => setShowPathologies(!showPathologies), getConfidenceColor, shouldAnimate)}</div>
          : null;
      }
      case 'warnings': {
        const warnings = (effectivePartial.warnings as string[]) ?? [];
        return warnings.length > 0
          ? <div key={config.key}>{renderWarnings(warnings, shouldAnimate)}</div>
          : null;
      }
      default:
        return null;
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

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

  // Loading state (streaming) with progressive rendering
  if (loading) {
    // Thinking phase or no incremental data yet — show the animated spinner
    if (!incrementalResult || !incrementalResult.started) {
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
            streamActivity={rawJsonRef.current.length > 0 ? 10 : 0}
            thinkingActive={true}
            responseActive={rawJsonRef.current.length > 0}
          />
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStop}
              className="text-gray-500"
            >
              <StopCircle className="h-4 w-4 mr-2" />
              Arreter
            </Button>
          </div>
        </div>
      );
    }

    // Progressive rendering — JSON generation has started
    const { partial, fieldStatuses } = incrementalResult;

    // Cache latest successful partial data for stability
    if (partial) {
      lastPartialRef.current = partial;
    }

    return (
      <div className="px-4 lg:px-8 py-2 max-w-6xl mx-auto">
        {/* Mobile: single column in stream order */}
        <div className="flex flex-col gap-3 lg:hidden">
          {SECTION_ORDER.map((config) =>
            renderStreamingSection(config, fieldStatuses, partial)
          )}
        </div>

        {/* Desktop: masonry two-column (interleaved for L→R row reading) */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-3 items-start">
          <div className="space-y-3">
            {LEFT_COLUMN.map((config) =>
              renderStreamingSection(config, fieldStatuses, partial)
            )}
          </div>
          <div className="space-y-3">
            {RIGHT_COLUMN.map((config) =>
              renderStreamingSection(config, fieldStatuses, partial)
            )}
          </div>
        </div>

        {/* Stop button */}
        <div className="flex justify-center pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStop}
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

  // ─── Final section renderer (shared by mobile & desktop layouts) ─────────────

  const renderFinalSection = (config: SectionConfig): React.ReactElement | null => {
    switch (config.key) {
      case 'orientation':
        return (
          <div className="border rounded-lg border-purple-200 bg-gradient-to-br from-purple-50 to-white p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-purple-600" />
                <span className="font-semibold text-sm">Orientation</span>
              </div>
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
            </div>
            <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-gray-100">
              <Badge className={orientationColors[result.orientation] || 'bg-gray-500 text-white'}>
                {orientationLabels[result.orientation] || result.orientation}
              </Badge>
              <span className="text-sm text-gray-700">{result.orientationReason}</span>
            </div>
          </div>
        );
      case 'nursingInterventions':
        return renderNursingInterventions(result.nursingInterventions, checkedInterventions, toggleIntervention, false);
      case 'medicalInterventions':
        return renderBulletList(
          result.medicalInterventions,
          Stethoscope, 'text-blue-600', 'Interventions medicales',
          'bg-blue-400', 'text-gray-700',
          true, showMedical, () => setShowMedical(!showMedical),
          false,
        );
      case 'recommendedTests':
        return renderTestBadges(result.recommendedTests, showTests, () => setShowTests(!showTests), false);
      case 'criticalAlerts':
        return renderCriticalAlerts(result.criticalAlerts, false);
      case 'warnings':
        return renderWarnings(result.warnings, false);
      case 'pathologies':
        return renderPathologies(result.pathologies, showPathologies, () => setShowPathologies(!showPathologies), getConfidenceColor, false);
      default:
        return null;
    }
  };

  // Final result display
  return (
    <div className="px-4 lg:px-8 py-2 max-w-6xl mx-auto">
      {/* Mobile: single column in stream order */}
      <div className="flex flex-col gap-3 lg:hidden">
        {SECTION_ORDER.map((config) => (
          <React.Fragment key={config.key}>
            {renderFinalSection(config)}
          </React.Fragment>
        ))}
      </div>

      {/* Desktop: masonry two-column (interleaved for L→R row reading) */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-3 items-start">
        <div className="space-y-3">
          {LEFT_COLUMN.map((config) => (
            <React.Fragment key={config.key}>
              {renderFinalSection(config)}
            </React.Fragment>
          ))}
        </div>
        <div className="space-y-3">
          {RIGHT_COLUMN.map((config) => (
            <React.Fragment key={config.key}>
              {renderFinalSection(config)}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
