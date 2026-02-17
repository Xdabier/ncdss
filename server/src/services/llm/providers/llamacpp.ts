import path from 'path';
import fs from 'fs/promises';
import { LLMProvider, PreDiagnosisContext, PreDiagnosisSuggestion, StreamChunk } from '../index';

// Types for node-llama-cpp (dynamically imported)
type LlamaInstance = any;
type LlamaModelInstance = any;
type LlamaChatSessionConstructor = any;
/**
 * JSON schema for the pre-diagnosis response.
 * Used by LlamaJsonSchemaGrammar to constrain model output
 * so it ONLY generates valid JSON matching this structure.
 * This eliminates wasted tokens on formatting and guarantees parseable output.
 */
const PRE_DIAGNOSIS_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    suggestions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          diagnosis: { type: 'string' as const },
          confidence: { type: 'number' as const },
          reasoning: { type: 'string' as const },
          urgency: { type: 'string' as const, enum: ['routine', 'urgent', 'emergent'] },
          icd10Code: { type: 'string' as const }
        },
        required: ['diagnosis', 'confidence', 'reasoning', 'urgency']
      },
      minItems: 1,
      maxItems: 4
    },
    recommendedTests: {
      type: 'array' as const,
      items: { type: 'string' as const }
    },
    warnings: {
      type: 'array' as const,
      items: { type: 'string' as const }
    }
  },
  required: ['suggestions', 'recommendedTests', 'warnings']
};

export class LlamaCppProvider implements LLMProvider {
  private llama: LlamaInstance | null = null;
  private model: LlamaModelInstance | null = null;
  private LlamaChatSession: LlamaChatSessionConstructor | null = null;
  private responseGrammar: any | null = null;
  private modelsDir: string;
  private modelPath: string;
  private enableThinking: boolean;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.modelsDir = process.env.LLAMA_MODELS_DIR || path.join(process.cwd(), 'models');
    this.modelPath = process.env.LLAMA_MODEL_PATH || '';
    this.enableThinking = process.env.LLAMA_ENABLE_THINKING !== 'false';
  }

  /**
   * Initialize llama.cpp and load model (lazy, one-time)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize();
    await this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Dynamic import of ESM module (required for CommonJS compatibility)
      const nodeLlamaCpp = await import('node-llama-cpp');
      const { getLlama, LlamaChatSession } = nodeLlamaCpp;

      // Store class reference for later use
      this.LlamaChatSession = LlamaChatSession;

      // Get llama instance (auto-detects GPU)
      this.llama = await getLlama();

      // Log GPU info
      console.log(`[LlamaCpp] GPU: ${this.llama.gpu || 'CPU only'}`);
      console.log(`[LlamaCpp] GPU offloading: ${this.llama.supportsGpuOffloading}`);

      // Resolve model path
      let resolvedPath = this.modelPath;
      if (!resolvedPath) {
        // Search directories in priority order:
        // 1. Env-configured or cwd-based modelsDir
        // 2. Electron packaged app extraResources (process.resourcesPath/models)
        const searchDirs = [this.modelsDir];
        if (process.resourcesPath) {
          searchDirs.push(path.join(process.resourcesPath, 'models'));
        }

        for (const dir of searchDirs) {
          try {
            const files = await fs.readdir(dir);
            const ggufFile = files.find((f: string) => f.endsWith('.gguf'));
            if (ggufFile) {
              resolvedPath = path.join(dir, ggufFile);
              break;
            }
          } catch {
            // Directory doesn't exist, try next
          }
        }
      }

      if (!resolvedPath) {
        console.warn('[LlamaCpp] No model file found. AI features disabled.');
        console.warn(`[LlamaCpp] Place a .gguf model in: ${this.modelsDir}`);
        return;
      }

      console.log(`[LlamaCpp] Loading model: ${resolvedPath}`);

      // Load model with GPU auto-configuration
      this.model = await this.llama.loadModel({
        modelPath: resolvedPath,
        gpuLayers: 'auto', // Automatically use GPU layers based on VRAM
        onLoadProgress: (progress: number) => {
          if (progress === 1) {
            console.log('[LlamaCpp] Model loaded successfully');
          }
        }
      });

      // Pre-create JSON schema grammar for constrained decoding
      try {
        this.responseGrammar = await this.llama.createGrammarForJsonSchema(PRE_DIAGNOSIS_JSON_SCHEMA);
        console.log('[LlamaCpp] JSON schema grammar created for constrained output');
      } catch (grammarError) {
        console.warn('[LlamaCpp] Failed to create JSON grammar, will use unconstrained generation:', grammarError);
        this.responseGrammar = null;
      }

      this.initialized = true;
    } catch (error) {
      console.error('[LlamaCpp] Initialization failed:', error);
      this.initialized = false;
    }
  }

  /**
   * Check if the LLM is available (model loaded)
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.initialize();
      return this.model !== null;
    } catch {
      return false;
    }
  }

  /**
   * Generate pre-diagnosis suggestions from patient context
   */
  async generatePreDiagnosis(context: PreDiagnosisContext): Promise<PreDiagnosisSuggestion> {
    const now = new Date().toISOString();

    if (!await this.isAvailable()) {
      return { available: false, suggestions: [], generatedAt: now, thinkingEnabled: false };
    }

    try {
      const prompt = this.buildPrompt(context);
      const grammar = this.responseGrammar;

      // Create context and session for this request
      const ctx = await this.model!.createContext({
        contextSize: 4096
      });

      const session = new this.LlamaChatSession!({
        contextSequence: ctx.getSequence()
      });

      let fullResponse = '';

      // Generate response with grammar constraint for faster, reliable JSON output
      await session.prompt(prompt, {
        maxTokens: 800,
        temperature: 0.3,
        ...(grammar ? { grammar } : {}),
        onTextChunk: (chunk: string) => {
          fullResponse += chunk;
        }
      });

      // Dispose context after use
      await ctx.dispose();

      return this.parseResponse(fullResponse, now, undefined);
    } catch (error) {
      console.error('[LlamaCpp] Pre-diagnosis error:', error);
      return { available: false, suggestions: [], generatedAt: now, thinkingEnabled: false };
    }
  }

  /**
   * Generate pre-diagnosis with streaming for real-time UI updates
   */
  async generatePreDiagnosisStream(
    context: PreDiagnosisContext,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const now = new Date().toISOString();

    if (!await this.isAvailable()) {
      onChunk({ type: 'error', error: 'Service LLM non disponible' });
      return;
    }

    try {
      const prompt = this.buildPrompt(context);
      const grammar = this.responseGrammar;

      // Create context and session
      const ctx = await this.model!.createContext({
        contextSize: 4096
      });

      const session = new this.LlamaChatSession!({
        contextSequence: ctx.getSequence()
      });

      let fullResponse = '';
      let fullThinking = '';
      let inThinkingBlock = false;

      // Stream response with grammar constraint
      await session.prompt(prompt, {
        maxTokens: 800,
        temperature: 0.3,
        ...(grammar ? { grammar } : {}),
        onTextChunk: (chunk: string) => {
          // Detect thinking blocks (<think>...</think>)
          if (chunk.includes('<think>')) {
            inThinkingBlock = true;
          }

          if (inThinkingBlock) {
            fullThinking += chunk;
            onChunk({ type: 'thinking', content: chunk });

            if (chunk.includes('</think>')) {
              inThinkingBlock = false;
            }
          } else {
            fullResponse += chunk;
            onChunk({ type: 'response', content: chunk });
          }
        }
      });

      // Parse final result
      const result = this.parseResponse(fullResponse, now, fullThinking || undefined);
      onChunk({ type: 'done', result });

      // Cleanup
      await ctx.dispose();
    } catch (error) {
      console.error('[LlamaCpp] Streaming error:', error);
      onChunk({ type: 'error', error: 'Erreur lors de la generation' });
    }
  }

  /**
   * Build French medical prompt from patient context
   * Adds /think prefix for Qwen3 thinking mode
   */
  private buildPrompt(context: PreDiagnosisContext): string {
    // Qwen3 thinking toggle - add /think or /no_think prefix
    const thinkingPrefix = this.enableThinking ? '/think\n' : '/no_think\n';
    const sex = context.sex === 'MALE' ? 'Homme' : 'Femme';

    const vitalsText = [
      `- Température: ${context.vitals.temperature ?? 'Non mesurée'} °C`,
      `- Fréquence cardiaque: ${context.vitals.heartRate ?? 'Non mesurée'} bpm`,
      `- Fréquence respiratoire: ${context.vitals.respiratoryRate ?? 'Non mesurée'} /min`,
      `- Tension artérielle: ${context.vitals.bloodPressure || 'Non mesurée'}`,
      `- SpO2: ${context.vitals.oxygenSaturation ?? 'Non mesurée'} %`
    ].join('\n');

    const scoresText = [
      `- NEWS: ${context.scores.news ?? 'Non calculé'}${context.scores.news !== undefined && context.scores.news >= 7 ? ' ⚠️ CRITIQUE' : ''}`,
      `- GCS: ${context.scores.gcs ?? 'Non calculé'}/15${context.scores.gcs !== undefined && context.scores.gcs < 9 ? ' ⚠️ ALTÉRATION' : ''}`,
      `- qSOFA: ${context.scores.qsofa ?? 'Non calculé'}/3${context.scores.qsofa !== undefined && context.scores.qsofa >= 2 ? ' ⚠️ SEPSIS?' : ''}`
    ].join('\n');

    const allergiesText = context.allergies ? `\nALLERGIES: ${context.allergies}` : '';
    const historyText = context.medicalHistory?.length
      ? `\nANTÉCÉDENTS: ${context.medicalHistory.join(', ')}`
      : '';

    return `${thinkingPrefix}Tu es un assistant médical d'urgence expérimenté travaillant dans un service d'accueil des urgences.

IMPORTANT:
- Tu n'es PAS un médecin. Tes suggestions sont des hypothèses à confirmer par un médecin.
- Tu DOIS raisonner et répondre UNIQUEMENT en français.

PATIENT:
- Âge: ${context.age} ans
- Sexe: ${sex}
- Motif de consultation: ${context.chiefComplaint}

CONSTANTES VITALES:
${vitalsText}

SCORES CLINIQUES:
${scoresText}
${allergiesText}${historyText}

Analyse ces données et réponds UNIQUEMENT avec un objet JSON valide (pas de texte avant ou après le JSON):
{
  "suggestions": [
    {
      "diagnosis": "Nom du diagnostic en français",
      "confidence": 75,
      "reasoning": "Justification basée sur les signes cliniques",
      "urgency": "urgent"
    }
  ],
  "recommendedTests": ["Examen 1", "Examen 2"],
  "warnings": ["Alerte si urgence vitale"]
}

Règles:
- 2-4 diagnostics différentiels, classés par probabilité
- Urgency: "routine", "urgent", ou "emergent"
- Confidence: 0-100, sois conservateur`;
  }

  /**
   * Parse LLM response and extract JSON
   * Handles thinking model output with <think>...</think> blocks
   */
  private parseResponse(response: string, generatedAt: string, thinkingFromApi?: string): PreDiagnosisSuggestion {
    let thinkingTrace: string | undefined = thinkingFromApi;
    let cleanResponse = response;
    let thinkingEnabled = !!thinkingFromApi;

    // Check for inline <think> blocks
    const thinkMatch = response.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      thinkingTrace = thinkingTrace
        ? `${thinkingTrace}\n\n${thinkMatch[1].trim()}`
        : thinkMatch[1].trim();
      thinkingEnabled = true;
      cleanResponse = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    try {
      // Extract JSON from response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const suggestions = Array.isArray(parsed.suggestions)
          ? parsed.suggestions.map((s: Record<string, unknown>) => ({
              diagnosis: String(s.diagnosis || ''),
              confidence: typeof s.confidence === 'number' ? s.confidence : 50,
              reasoning: String(s.reasoning || ''),
              urgency: this.normalizeUrgency(s.urgency),
              icd10Code: s.icd10Code ? String(s.icd10Code) : undefined
            }))
          : [];

        return {
          available: true,
          suggestions,
          recommendedTests: Array.isArray(parsed.recommendedTests)
            ? parsed.recommendedTests.map(String)
            : [],
          warnings: Array.isArray(parsed.warnings)
            ? parsed.warnings.map(String)
            : [],
          generatedAt,
          thinkingTrace,
          thinkingEnabled
        };
      }
    } catch (e) {
      console.error('[LlamaCpp] Failed to parse response:', e);
    }

    return {
      available: true,
      suggestions: [],
      warnings: ['Impossible d\'analyser la réponse du modèle'],
      generatedAt,
      thinkingTrace,
      thinkingEnabled
    };
  }

  /**
   * Normalize urgency value to valid enum
   */
  private normalizeUrgency(value: unknown): 'routine' | 'urgent' | 'emergent' {
    const normalized = String(value).toLowerCase();
    if (normalized === 'emergent' || normalized === 'émergent') return 'emergent';
    if (normalized === 'urgent') return 'urgent';
    return 'routine';
  }

  /**
   * Cleanup resources on shutdown
   */
  async dispose(): Promise<void> {
    if (this.model) {
      this.model = null;
    }
    if (this.llama) {
      await this.llama.dispose();
      this.llama = null;
    }
    this.initialized = false;
    this.initPromise = null;
    this.LlamaChatSession = null;
    this.responseGrammar = null;
  }
}
