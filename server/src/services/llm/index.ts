import { LlamaCppProvider } from './providers/llamacpp';
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

// Singleton provider instance
let providerInstance: LlamaCppProvider | null = null;

/**
 * Get the LLM provider instance (singleton)
 * Uses local node-llama-cpp (fully offline, GPU-accelerated)
 */
export function getLLMProvider(): LLMProvider {
  if (!providerInstance) {
    providerInstance = new LlamaCppProvider();
  }
  return providerInstance;
}

/**
 * Dispose the LLM provider (cleanup on app shutdown)
 * Call this when the application is closing to free resources
 */
export async function disposeLLMProvider(): Promise<void> {
  if (providerInstance) {
    await providerInstance.dispose();
    providerInstance = null;
  }
}
