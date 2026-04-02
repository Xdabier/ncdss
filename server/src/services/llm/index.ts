import { LlamaCppProvider } from './providers/llamacpp';
import { ClaudeProvider } from './providers/claude';
import type { UnifiedClinicalAnalysis } from '@ncdss/shared';

/**
 * Streaming chunk for real-time UI updates
 */
export interface StreamChunk {
  type: 'thinking' | 'response' | 'done' | 'error';
  content?: string;
  result?: PreDiagnosisSuggestion;
  unifiedResult?: UnifiedAnalysisResult;
  error?: string;
}

/**
 * Patient context for unified LLM clinical analysis
 */
export interface UnifiedAnalysisContext {
  chiefComplaint: string;
  age: number;
  sex: string;
  vitals: {
    temperature?: number;
    heartRate?: number;
    respiratoryRate?: number;
    bloodPressure?: string;
    oxygenSaturation?: number;
    painLevel?: number;
  };
  abcdeFindings: {
    airway?: Record<string, unknown>;
    breathing?: Record<string, unknown>;
    circulation?: Record<string, unknown>;
    disability?: Record<string, unknown>;
    exposure?: Record<string, unknown>;
  };
  scores: { news?: number; gcs?: number; qsofa?: number };
  medicalHistory?: string[];
  allergies?: string;
}

/**
 * Unified LLM analysis result combining orientation, pathologies, interventions, tests, and warnings
 */
export interface UnifiedAnalysisResult {
  available: boolean;
  analysis?: UnifiedClinicalAnalysis;
  generatedAt: string;
  thinkingTrace?: string;
  thinkingEnabled: boolean;
}

/**
 * LLM Provider interface for AI-assisted pre-diagnosis
 * This is ADDITIVE to existing clinical decision support (symptomMapper, pathologyMatcher)
 */
export interface LLMProvider {
  generatePreDiagnosis(context: PreDiagnosisContext): Promise<PreDiagnosisSuggestion>;
  generatePreDiagnosisStream(
    context: PreDiagnosisContext,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void>;
  generateUnifiedAnalysis(context: UnifiedAnalysisContext): Promise<UnifiedAnalysisResult>;
  generateUnifiedAnalysisStream(
    context: UnifiedAnalysisContext,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void>;
  isAvailable(): Promise<boolean>;
}

/**
 * Patient context for LLM pre-diagnosis generation
 */
export interface PreDiagnosisContext {
  chiefComplaint: string;
  age: number;
  sex: string;
  vitals: {
    temperature?: number;
    heartRate?: number;
    respiratoryRate?: number;
    bloodPressure?: string;
    oxygenSaturation?: number;
  };
  abcdeFindings: {
    airway?: Record<string, unknown>;
    breathing?: Record<string, unknown>;
    circulation?: Record<string, unknown>;
    disability?: Record<string, unknown>;
    exposure?: Record<string, unknown>;
  };
  scores: {
    news?: number;
    gcs?: number;
    qsofa?: number;
  };
  medicalHistory?: string[];
  allergies?: string;
}

/**
 * LLM pre-diagnosis suggestion result
 */
export interface PreDiagnosisSuggestion {
  /** true if LLM responded successfully, false if unavailable */
  available: boolean;
  /** List of suggested pre-diagnoses */
  suggestions: Array<{
    diagnosis: string;
    confidence: number; // 0-100
    reasoning: string;
    urgency: 'routine' | 'urgent' | 'emergent';
    icd10Code?: string;
  }>;
  /** Recommended diagnostic tests */
  recommendedTests?: string[];
  /** Clinical warnings or alerts */
  warnings?: string[];
  /** ISO timestamp when generated */
  generatedAt: string;
  /** Raw thinking trace from <think> blocks (for reasoning models) */
  thinkingTrace?: string;
  /** Whether thinking mode was used */
  thinkingEnabled: boolean;
}

// ─── Provider Manager ─────────────────────────────────────────────────────────

export type LLMProviderType = 'local' | 'claude';

export interface LLMProviderStatus {
  activeType: LLMProviderType;
  localAvailable: boolean;
  claudeAvailable: boolean;
}

let activeProviderType: LLMProviderType = 'local';
let providerInstance: LLMProvider | null = null;

/**
 * Get the active LLM provider instance.
 * Creates a new instance on first call or after switchProvider().
 */
export function getLLMProvider(): LLMProvider {
  if (!providerInstance) {
    providerInstance = activeProviderType === 'claude'
      ? new ClaudeProvider()
      : new LlamaCppProvider();
  }
  return providerInstance;
}

/**
 * Switch to a different LLM provider at runtime.
 * Disposes the current provider before creating the new one.
 */
export async function switchProvider(type: LLMProviderType): Promise<void> {
  if (type === activeProviderType && providerInstance) {
    return; // Already using this provider
  }

  // Dispose current provider if it has a dispose method
  if (providerInstance && 'dispose' in providerInstance && typeof (providerInstance as any).dispose === 'function') {
    await (providerInstance as any).dispose();
  }
  providerInstance = null;

  activeProviderType = type;
  console.log(`[LLM] Switched to provider: ${type}`);

  // Eagerly create the new provider
  getLLMProvider();
}

/**
 * Get the currently active provider type.
 */
export function getActiveProviderType(): LLMProviderType {
  return activeProviderType;
}

/**
 * Check if a local .gguf model file is available (without loading it).
 */
export async function checkLocalModelAvailable(): Promise<boolean> {
  return LlamaCppProvider.hasLocalModel();
}

/**
 * Get full provider status for the UI.
 */
export async function getProviderStatus(): Promise<LLMProviderStatus> {
  const localAvailable = await checkLocalModelAvailable();
  const claudeAvailable = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0);

  return {
    activeType: activeProviderType,
    localAvailable,
    claudeAvailable,
  };
}

/**
 * Dispose the LLM provider (cleanup on app shutdown)
 * Call this when the application is closing to free resources
 */
export async function disposeLLMProvider(): Promise<void> {
  if (providerInstance && 'dispose' in providerInstance && typeof (providerInstance as any).dispose === 'function') {
    await (providerInstance as any).dispose();
  }
  providerInstance = null;
}

/**
 * Auto-detect the best provider on startup.
 * If no local model is found and Claude API key is set, auto-switch to Claude.
 * Respects LLM_PROVIDER env var override.
 */
export async function autoDetectProvider(): Promise<void> {
  // Check for explicit env var preference
  const envProvider = process.env.LLM_PROVIDER?.toLowerCase();
  if (envProvider === 'claude') {
    const claudeAvailable = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0);
    if (claudeAvailable) {
      await switchProvider('claude');
      console.log('[LLM] Auto-detect: LLM_PROVIDER=claude, using Claude API');
      return;
    }
    console.warn('[LLM] Auto-detect: LLM_PROVIDER=claude but ANTHROPIC_API_KEY not set, falling back to local');
  } else if (envProvider === 'local') {
    console.log('[LLM] Auto-detect: LLM_PROVIDER=local, using local LLM');
    return;
  }

  // Auto-detect: check local model availability
  const localAvailable = await checkLocalModelAvailable();
  if (localAvailable) {
    console.log('[LLM] Auto-detect: Local model found, using local LLM');
    return;
  }

  // No local model — try Claude
  const claudeAvailable = !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0);
  if (claudeAvailable) {
    await switchProvider('claude');
    console.log('[LLM] Auto-detect: No local model found, ANTHROPIC_API_KEY set — switching to Claude API');
    return;
  }

  console.warn('[LLM] Auto-detect: No local model and no ANTHROPIC_API_KEY — AI features disabled');
}
