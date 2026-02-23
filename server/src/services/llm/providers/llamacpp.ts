import path from 'path';
import fs from 'fs/promises';
import { LLMProvider, PreDiagnosisContext, PreDiagnosisSuggestion, StreamChunk, UnifiedAnalysisContext, UnifiedAnalysisResult } from '../index';
import { logBenchmark, estimateTokens, validateUnifiedSchema, validatePreDiagnosisSchema, closeBenchmarkLogger, type BenchmarkEntry } from '../benchmark-logger';

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

/**
 * JSON schema for unified clinical analysis response (base model).
 * Original field order for non-fine-tuned models.
 */
const UNIFIED_ANALYSIS_JSON_SCHEMA_BASE = {
  type: 'object' as const,
  properties: {
    orientation: {
      type: 'string' as const,
      enum: ['SAUV', 'MEDICAL', 'SURGICAL', 'TRAUMA', 'PEDIATRIC']
    },
    orientationReason: { type: 'string' as const },
    criticalAlerts: {
      type: 'array' as const,
      items: { type: 'string' as const }
    },
    pathologies: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          confidence: { type: 'number' as const },
          signs: { type: 'array' as const, items: { type: 'string' as const } },
          reasoning: { type: 'string' as const },
          urgency: { type: 'string' as const, enum: ['routine', 'urgent', 'emergent'] },
          icd10Code: { type: 'string' as const }
        },
        required: ['name', 'confidence', 'signs', 'reasoning', 'urgency'] as const
      },
      minItems: 1,
      maxItems: 5
    },
    nursingInterventions: { type: 'array' as const, items: { type: 'string' as const } },
    medicalInterventions: { type: 'array' as const, items: { type: 'string' as const } },
    recommendedTests: { type: 'array' as const, items: { type: 'string' as const } },
    warnings: { type: 'array' as const, items: { type: 'string' as const } }
  },
  required: ['orientation', 'orientationReason', 'criticalAlerts', 'pathologies',
             'nursingInterventions', 'medicalInterventions', 'recommendedTests', 'warnings'] as const
};

/**
 * JSON schema for unified clinical analysis response (fine-tuned model).
 * Field order optimized so interventions come BEFORE pathologies.
 * This ensures that if the model runs out of tokens, the actionable fields
 * (interventions, tests) are already generated. Pathologies (verbose) come last.
 */
const UNIFIED_ANALYSIS_JSON_SCHEMA_FINETUNED = {
  type: 'object' as const,
  properties: {
    orientation: {
      type: 'string' as const,
      enum: ['SAUV', 'MEDICAL', 'SURGICAL', 'TRAUMA', 'PEDIATRIC']
    },
    orientationReason: { type: 'string' as const },
    nursingInterventions: { type: 'array' as const, items: { type: 'string' as const } },
    medicalInterventions: { type: 'array' as const, items: { type: 'string' as const } },
    recommendedTests: { type: 'array' as const, items: { type: 'string' as const } },
    criticalAlerts: {
      type: 'array' as const,
      items: { type: 'string' as const }
    },
    warnings: { type: 'array' as const, items: { type: 'string' as const } },
    pathologies: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          confidence: { type: 'number' as const },
          signs: { type: 'array' as const, items: { type: 'string' as const } },
          reasoning: { type: 'string' as const },
          urgency: { type: 'string' as const, enum: ['routine', 'urgent', 'emergent'] },
          icd10Code: { type: 'string' as const }
        },
        required: ['name', 'confidence', 'signs', 'reasoning', 'urgency'] as const
      },
      minItems: 1,
      maxItems: 3
    }
  },
  required: ['orientation', 'orientationReason', 'nursingInterventions', 'medicalInterventions',
             'recommendedTests', 'criticalAlerts', 'warnings', 'pathologies'] as const
};

export class LlamaCppProvider implements LLMProvider {
  private llama: LlamaInstance | null = null;
  private model: LlamaModelInstance | null = null;
  private LlamaChatSession: LlamaChatSessionConstructor | null = null;
  private responseGrammar: any | null = null;
  private unifiedResponseGrammar: any | null = null;
  private modelsDir: string;
  private modelPath: string;
  private resolvedModelPath: string = '';
  private enableThinking: boolean;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private isFineTuned: boolean = false;

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

      // LLAMA_MODEL_FILE: resolve a filename against the models directory
      if (!resolvedPath && process.env.LLAMA_MODEL_FILE) {
        resolvedPath = path.join(this.modelsDir, process.env.LLAMA_MODEL_FILE);
      }

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
      this.resolvedModelPath = resolvedPath;

      // Detect fine-tuned model by filename convention
      this.isFineTuned = resolvedPath.includes('ncdss-apollo')
        || resolvedPath.includes('ncdss-qwen')
        || resolvedPath.includes('ncdss-medical')
        || resolvedPath.includes('finetuned');
      if (this.isFineTuned) {
        console.log('[LlamaCpp] Fine-tuned model detected — using optimized prompt and parameters');
      }

      // Resolve GPU layers from env or auto-detect
      const gpuLayersEnv = process.env.LLAMA_GPU_LAYERS;
      const gpuLayers: number | 'auto' = gpuLayersEnv !== undefined
        ? (gpuLayersEnv === '-1' ? 'auto' : parseInt(gpuLayersEnv, 10))
        : 'auto';

      // Load model with GPU configuration
      this.model = await this.llama.loadModel({
        modelPath: resolvedPath,
        gpuLayers,
        onLoadProgress: (progress: number) => {
          if (progress === 1) {
            console.log('[LlamaCpp] Model loaded successfully');
          }
        }
      });

      // Pre-create JSON schema grammars for constrained decoding
      try {
        this.responseGrammar = await this.llama.createGrammarForJsonSchema(PRE_DIAGNOSIS_JSON_SCHEMA);
        const unifiedSchema = this.isFineTuned
          ? UNIFIED_ANALYSIS_JSON_SCHEMA_FINETUNED
          : UNIFIED_ANALYSIS_JSON_SCHEMA_BASE;
        this.unifiedResponseGrammar = await this.llama.createGrammarForJsonSchema(unifiedSchema);
        console.log(`[LlamaCpp] JSON schema grammars created (${this.isFineTuned ? 'fine-tuned' : 'base'} field order)`);
      } catch (grammarError) {
        console.warn('[LlamaCpp] Failed to create JSON grammar, will use unconstrained generation:', grammarError);
        this.responseGrammar = null;
        this.unifiedResponseGrammar = null;
      }

      this.initialized = true;
    } catch (error) {
      console.error('[LlamaCpp] Initialization failed:', error);
      this.initialized = false;
    }
  }

  /** Get model filename for benchmark logs */
  private get modelFileName(): string {
    return this.resolvedModelPath ? path.basename(this.resolvedModelPath) : 'unknown';
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
    const startTime = performance.now();

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

      const result = this.parseResponse(fullResponse, now, undefined);

      // Benchmark logging
      const latencyMs = Math.round(performance.now() - startTime);
      let jsonParseSuccess = false;
      let schemaCompliant = false;
      try {
        const jsonMatch = fullResponse.replace(/<think>[\s\S]*?<\/think>/g, '').match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          jsonParseSuccess = true;
          schemaCompliant = validatePreDiagnosisSchema(parsed);
        }
      } catch { /* parse failed */ }

      logBenchmark({
        timestamp: now,
        latencyMs,
        method: 'generatePreDiagnosis',
        modelFile: this.modelFileName,
        promptLengthChars: prompt.length,
        outputLengthChars: fullResponse.length,
        promptTokenEstimate: estimateTokens(prompt),
        outputTokenEstimate: estimateTokens(fullResponse),
        jsonParseSuccess,
        jsonRepaired: false,
        schemaCompliant,
        available: result.available,
        suggestionCount: result.suggestions.length,
        thinkingEnabled: result.thinkingEnabled,
        thinkingLengthChars: result.thinkingTrace?.length,
        response: result.available ? { suggestions: result.suggestions, recommendedTests: result.recommendedTests, warnings: result.warnings } : undefined,
      });

      return result;
    } catch (error) {
      console.error('[LlamaCpp] Pre-diagnosis error:', error);
      logBenchmark({
        timestamp: now,
        latencyMs: Math.round(performance.now() - startTime),
        method: 'generatePreDiagnosis',
        modelFile: this.modelFileName,
        promptLengthChars: 0,
        outputLengthChars: 0,
        promptTokenEstimate: 0,
        outputTokenEstimate: 0,
        jsonParseSuccess: false,
        jsonRepaired: false,
        schemaCompliant: false,
        available: false,
        thinkingEnabled: false,
        error: String(error),
      });
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
    const startTime = performance.now();

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

      // Benchmark logging
      const latencyMs = Math.round(performance.now() - startTime);
      let jsonParseSuccess = false;
      let schemaCompliant = false;
      try {
        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          jsonParseSuccess = true;
          schemaCompliant = validatePreDiagnosisSchema(parsed);
        }
      } catch { /* parse failed */ }

      logBenchmark({
        timestamp: now,
        latencyMs,
        method: 'generatePreDiagnosisStream',
        modelFile: this.modelFileName,
        promptLengthChars: prompt.length,
        outputLengthChars: fullResponse.length + fullThinking.length,
        promptTokenEstimate: estimateTokens(prompt),
        outputTokenEstimate: estimateTokens(fullResponse) + estimateTokens(fullThinking),
        jsonParseSuccess,
        jsonRepaired: false,
        schemaCompliant,
        available: result.available,
        suggestionCount: result.suggestions.length,
        thinkingEnabled: result.thinkingEnabled,
        thinkingLengthChars: fullThinking.length || undefined,
        response: result.available ? { suggestions: result.suggestions, recommendedTests: result.recommendedTests, warnings: result.warnings } : undefined,
      });

      // Cleanup
      await ctx.dispose();
    } catch (error) {
      console.error('[LlamaCpp] Streaming error:', error);
      logBenchmark({
        timestamp: now,
        latencyMs: Math.round(performance.now() - startTime),
        method: 'generatePreDiagnosisStream',
        modelFile: this.modelFileName,
        promptLengthChars: 0,
        outputLengthChars: 0,
        promptTokenEstimate: 0,
        outputTokenEstimate: 0,
        jsonParseSuccess: false,
        jsonRepaired: false,
        schemaCompliant: false,
        available: false,
        thinkingEnabled: false,
        error: String(error),
      });
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
   * Build French medical prompt for unified clinical analysis
   * Includes ABCDE findings serialization and detailed JSON structure instructions
   */
  private buildUnifiedPrompt(context: UnifiedAnalysisContext): string {
    const thinkingPrefix = this.enableThinking ? '/think\n' : '/no_think\n';
    const sex = context.sex === 'MALE' ? 'Homme' : 'Femme';

    // Vitals with abbreviations
    const vitalsLines: string[] = [];
    vitalsLines.push(`- T: ${context.vitals.temperature ?? 'Non mesuree'} °C`);
    vitalsLines.push(`- FC: ${context.vitals.heartRate ?? 'Non mesuree'} bpm`);
    vitalsLines.push(`- FR: ${context.vitals.respiratoryRate ?? 'Non mesuree'} /min`);
    vitalsLines.push(`- TA: ${context.vitals.bloodPressure || 'Non mesuree'}`);
    vitalsLines.push(`- SpO2: ${context.vitals.oxygenSaturation ?? 'Non mesuree'} %`);
    if (context.vitals.painLevel !== undefined && context.vitals.painLevel !== null) {
      vitalsLines.push(`- EVA douleur: ${context.vitals.painLevel}/10`);
    }
    const vitalsText = vitalsLines.join('\n');

    // Scores with critical flags
    const scoresText = [
      `- NEWS: ${context.scores.news ?? 'Non calcule'}${context.scores.news !== undefined && context.scores.news >= 7 ? ' CRITIQUE' : ''}`,
      `- GCS: ${context.scores.gcs ?? 'Non calcule'}/15${context.scores.gcs !== undefined && context.scores.gcs < 9 ? ' ALTERATION' : ''}`,
      `- qSOFA: ${context.scores.qsofa ?? 'Non calcule'}/3${context.scores.qsofa !== undefined && context.scores.qsofa >= 2 ? ' SEPSIS?' : ''}`
    ].join('\n');

    // ABCDE findings serialization
    const abcdeText = this.serializeAbcdeFindings(context.abcdeFindings);

    const allergiesText = context.allergies ? `\nALLERGIES: ${context.allergies}` : '';
    const historyText = context.medicalHistory?.length
      ? `\nANTECEDENTS: ${context.medicalHistory.join(', ')}`
      : '';

    return `${thinkingPrefix}Tu es un assistant medical d'urgence experimente dans un service d'accueil des urgences tunisien.

PATIENT:
- Age: ${context.age} ans
- Sexe: ${sex}
- Motif de consultation: ${context.chiefComplaint}

CONSTANTES VITALES:
${vitalsText}

SCORES CLINIQUES:
${scoresText}

EVALUATION ABCDE:
${abcdeText}
${allergiesText}${historyText}

INSTRUCTIONS:
Analyse l'ensemble des donnees cliniques et reponds avec un objet JSON contenant:
- "orientation": zone d'orientation parmi ["SAUV", "MEDICAL", "SURGICAL", "TRAUMA", "PEDIATRIC"]
- "orientationReason": justification de l'orientation en une phrase
- "criticalAlerts": alertes critiques immediates (tableau de chaines)
- "pathologies": 2-5 hypotheses diagnostiques classees par probabilite, chacune avec:
  - "name": nom de la pathologie en francais
  - "confidence": 0-100, sois conservateur
  - "signs": signes cliniques retrouves
  - "reasoning": justification basee sur les signes
  - "urgency": "routine", "urgent", ou "emergent"
  - "icd10Code": code CIM-10 si connu (optionnel)
- "nursingInterventions": soins infirmiers specifiques et actionnables
- "medicalInterventions": interventions medicales (inclure posologies si pertinent)
- "recommendedTests": examens complementaires recommandes
- "warnings": mises en garde cliniques

Exemple de structure attendue:
{"orientation":"MEDICAL","orientationReason":"...","criticalAlerts":[],"pathologies":[{"name":"...","confidence":70,"signs":["..."],"reasoning":"...","urgency":"urgent"}],"nursingInterventions":["..."],"medicalInterventions":["..."],"recommendedTests":["..."],"warnings":["..."]}

Reponds UNIQUEMENT avec un objet JSON valide.`;
  }

  /**
   * Build compact prompt for fine-tuned Apollo2-0.5B model.
   * No instructions, no JSON example, no thinking prefix — just raw patient data.
   * The model learned the task from training examples.
   */
  private buildUnifiedPromptFinetuned(context: UnifiedAnalysisContext): string {
    const sex = context.sex === 'MALE' ? 'Homme' : context.sex === 'FEMALE' ? 'Femme' : context.sex;

    const vitalsLines: string[] = [];
    vitalsLines.push(`- T: ${context.vitals.temperature ?? 'NM'} °C`);
    vitalsLines.push(`- FC: ${context.vitals.heartRate ?? 'NM'} bpm`);
    vitalsLines.push(`- FR: ${context.vitals.respiratoryRate ?? 'NM'} /min`);
    vitalsLines.push(`- TA: ${context.vitals.bloodPressure || 'NM'}`);
    vitalsLines.push(`- SpO2: ${context.vitals.oxygenSaturation ?? 'NM'} %`);
    if (context.vitals.painLevel !== undefined && context.vitals.painLevel !== null) {
      vitalsLines.push(`- EVA: ${context.vitals.painLevel}/10`);
    }

    const scoresText = [
      `- NEWS: ${context.scores.news ?? 'NC'}`,
      `- GCS: ${context.scores.gcs ?? 'NC'}/15`,
      `- qSOFA: ${context.scores.qsofa ?? 'NC'}/3`
    ].join('\n');

    const abcdeText = this.serializeAbcdeFindings(context.abcdeFindings);

    let prompt = `PATIENT:\n- Age: ${context.age} ans\n- Sexe: ${sex}\n- Motif: ${context.chiefComplaint}\n\nCONSTANTES:\n${vitalsLines.join('\n')}\n\nSCORES:\n${scoresText}\n\nABCDE:\n${abcdeText}`;

    if (context.medicalHistory?.length) {
      prompt += `\n\nATCD: ${context.medicalHistory.join(', ')}`;
    }
    if (context.allergies) {
      prompt += `\nALLERGIES: ${context.allergies}`;
    }

    return prompt;
  }

  /**
   * Serialize ABCDE findings from Record objects into French clinical descriptions
   */
  private serializeAbcdeFindings(findings: UnifiedAnalysisContext['abcdeFindings']): string {
    const sections: string[] = [];

    if (findings.airway && Object.keys(findings.airway).length > 0) {
      sections.push(`A (Voies aeriennes): ${this.serializeAirway(findings.airway)}`);
    }
    if (findings.breathing && Object.keys(findings.breathing).length > 0) {
      sections.push(`B (Respiration): ${this.serializeBreathing(findings.breathing)}`);
    }
    if (findings.circulation && Object.keys(findings.circulation).length > 0) {
      sections.push(`C (Circulation): ${this.serializeCirculation(findings.circulation)}`);
    }
    if (findings.disability && Object.keys(findings.disability).length > 0) {
      sections.push(`D (Neurologique): ${this.serializeDisability(findings.disability)}`);
    }
    if (findings.exposure && Object.keys(findings.exposure).length > 0) {
      sections.push(`E (Exposition): ${this.serializeExposure(findings.exposure)}`);
    }

    return sections.length > 0 ? sections.join('\n') : 'Aucune evaluation ABCDE disponible';
  }

  private serializeAirway(data: Record<string, unknown>): string {
    const parts: string[] = [];
    if (data.obstructed === true) parts.push('Obstruction des voies aeriennes');
    if (data.patent === true) parts.push('Voies aeriennes libres');
    if (data.stridor === true) parts.push('Stridor');
    if (data.gurgling === true) parts.push('Gargouillement');
    if (data.snoring === true) parts.push('Ronflement');
    if (data.edema === true) parts.push('Oedeme');
    if (data.secretions === true) parts.push('Secretions');
    if (data.foreignBody === true) parts.push('Corps etranger');
    if (data.tracheostomy === true) parts.push('Tracheostomie');
    if (data.cervicalCollar === true) parts.push('Collier cervical');
    if (data.notes && typeof data.notes === 'string') parts.push(data.notes);

    // Handle unknown keys
    for (const [key, value] of Object.entries(data)) {
      if (!['obstructed', 'patent', 'stridor', 'gurgling', 'snoring', 'edema', 'secretions', 'foreignBody', 'tracheostomy', 'cervicalCollar', 'notes'].includes(key)) {
        parts.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'RAS';
  }

  private serializeBreathing(data: Record<string, unknown>): string {
    const parts: string[] = [];
    if (data.dyspnea === true) parts.push('Dyspnee');
    if (data.cyanosis === true) parts.push('Cyanose');
    if (data.tachypnea === true) parts.push('Tachypnee');
    if (data.bradypnea === true) parts.push('Bradypnee');
    if (data.orthopnea === true) parts.push('Orthopnee');
    if (data.wheeze === true) parts.push('Sibilants');
    if (data.crackles === true) parts.push('Crepitants');
    if (data.asymmetric === true) parts.push('Asymetrie auscultatoire');
    if (data.accessoryMuscles === true) parts.push('Tirage');
    if (data.oxygenTherapy === true) parts.push('Oxygenotherapie');
    if (Array.isArray(data.breathSoundsMulti)) {
      parts.push(`Bruits respiratoires: ${(data.breathSoundsMulti as string[]).join(', ')}`);
    }
    if (data.notes && typeof data.notes === 'string') parts.push(data.notes);

    for (const [key, value] of Object.entries(data)) {
      if (!['dyspnea', 'cyanosis', 'tachypnea', 'bradypnea', 'orthopnea', 'wheeze', 'crackles', 'asymmetric', 'accessoryMuscles', 'oxygenTherapy', 'breathSoundsMulti', 'notes'].includes(key)) {
        parts.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'RAS';
  }

  private serializeCirculation(data: Record<string, unknown>): string {
    const parts: string[] = [];
    if (data.tachycardia === true) parts.push('Tachycardie');
    if (data.bradycardia === true) parts.push('Bradycardie');
    if (data.hypotension === true) parts.push('Hypotension');
    if (data.hypertension === true) parts.push('Hypertension');
    if (data.irregularPulse === true) parts.push('Pouls irregulier');
    if (data.weakPulse === true) parts.push('Pouls faible');
    if (data.capillaryRefill && typeof data.capillaryRefill === 'string') {
      parts.push(`Recoloration capillaire: ${data.capillaryRefill}`);
    }
    if (data.paleSkin === true) parts.push('Paleur cutanee');
    if (data.coldExtremities === true) parts.push('Extremites froides');
    if (data.diaphoresis === true) parts.push('Diaphorese');
    if (data.edema === true) parts.push('Oedeme');
    if (data.bleeding === true) parts.push('Hemorragie');
    if (Array.isArray(data.bleedingType)) {
      parts.push(`Type de saignement: ${(data.bleedingType as string[]).join(', ')}`);
    }
    if (data.notes && typeof data.notes === 'string') parts.push(data.notes);

    for (const [key, value] of Object.entries(data)) {
      if (!['tachycardia', 'bradycardia', 'hypotension', 'hypertension', 'irregularPulse', 'weakPulse', 'capillaryRefill', 'paleSkin', 'coldExtremities', 'diaphoresis', 'edema', 'bleeding', 'bleedingType', 'notes'].includes(key)) {
        parts.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'RAS';
  }

  private serializeDisability(data: Record<string, unknown>): string {
    const parts: string[] = [];
    if (data.altered === true) parts.push('Conscience alteree');
    if (data.confused === true) parts.push('Confusion');
    if (data.agitated === true) parts.push('Agitation');
    if (data.drowsy === true) parts.push('Somnolence');
    if (data.unresponsive === true) parts.push('Pas de reponse');
    if (data.seizure === true) parts.push('Convulsions');
    if (data.pupils && typeof data.pupils === 'string') {
      const pupilsMap: Record<string, string> = {
        'equal_reactive': 'Pupilles egales et reactives',
        'unequal': 'Anisocorie',
        'dilated': 'Mydriase',
        'constricted': 'Myosis',
        'fixed': 'Pupilles fixes'
      };
      parts.push(pupilsMap[data.pupils] || `Pupilles: ${data.pupils}`);
    }
    if (data.motorDeficit === true) parts.push('Deficit moteur');
    if (data.sensoryDeficit === true) parts.push('Deficit sensitif');
    if (data.focalSigns === true) parts.push('Signes de localisation');
    if (data.notes && typeof data.notes === 'string') parts.push(data.notes);

    for (const [key, value] of Object.entries(data)) {
      if (!['altered', 'confused', 'agitated', 'drowsy', 'unresponsive', 'seizure', 'pupils', 'motorDeficit', 'sensoryDeficit', 'focalSigns', 'notes'].includes(key)) {
        parts.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'RAS';
  }

  private serializeExposure(data: Record<string, unknown>): string {
    const parts: string[] = [];
    if (data.fever === true) parts.push('Fievre');
    if (data.hypothermia === true) parts.push('Hypothermie');
    if (data.rash === true) parts.push('Eruption cutanee');
    if (data.wounds === true) parts.push('Plaies');
    if (data.burns === true) parts.push('Brulures');
    if (data.fracture === true) parts.push('Fracture suspectee');
    if (data.deformity === true) parts.push('Deformation');
    if (data.swelling === true) parts.push('Tumesfaction');
    if (Array.isArray(data.traumaType)) {
      parts.push(`Type de trauma: ${(data.traumaType as string[]).join(', ')}`);
    }
    if (data.notes && typeof data.notes === 'string') parts.push(data.notes);

    for (const [key, value] of Object.entries(data)) {
      if (!['fever', 'hypothermia', 'rash', 'wounds', 'burns', 'fracture', 'deformity', 'swelling', 'traumaType', 'notes'].includes(key)) {
        parts.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    return parts.length > 0 ? parts.join(', ') : 'RAS';
  }

  /**
   * Generate unified clinical analysis from patient context
   */
  async generateUnifiedAnalysis(context: UnifiedAnalysisContext): Promise<UnifiedAnalysisResult> {
    const now = new Date().toISOString();
    const startTime = performance.now();

    if (!await this.isAvailable()) {
      return { available: false, generatedAt: now, thinkingEnabled: false };
    }

    try {
      const prompt = this.isFineTuned
        ? this.buildUnifiedPromptFinetuned(context)
        : this.buildUnifiedPrompt(context);
      const grammar = this.unifiedResponseGrammar;

      const contextSize = process.env.LLAMA_CONTEXT_SIZE
        ? parseInt(process.env.LLAMA_CONTEXT_SIZE, 10)
        : (this.isFineTuned ? 2048 : 4096);

      const ctx = await this.model!.createContext({
        contextSize
      });

      const fineTunedSystemPrompt = `Tu es un assistant medical d'urgence experimente. Reponds en JSON.
Regles:
- orientationReason: 1 phrase courte maximum
- nursingInterventions et medicalInterventions: specifiques avec posologies
- criticalAlerts: phrases courtes
- pathologies: maximum 3, reasoning 1-2 phrases courtes chacune
- Ordre des champs: orientation, orientationReason, nursingInterventions, medicalInterventions, recommendedTests, criticalAlerts, warnings, pathologies`;

      const session = new this.LlamaChatSession!({
        contextSequence: ctx.getSequence(),
        ...(this.isFineTuned
          ? { systemPrompt: fineTunedSystemPrompt }
          : {})
      });

      let fullResponse = '';

      await session.prompt(prompt, {
        maxTokens: this.isFineTuned ? 1500 : 2048,
        temperature: this.isFineTuned ? 0.1 : 0.3,
        ...(grammar ? { grammar } : {}),
        onTextChunk: (chunk: string) => {
          fullResponse += chunk;
        }
      });

      await ctx.dispose();

      const result = this.parseUnifiedResponse(fullResponse, now, undefined);

      // Benchmark logging
      const latencyMs = Math.round(performance.now() - startTime);
      const benchmarkInfo = this.buildUnifiedBenchmark(fullResponse, result, prompt, now, latencyMs, 'generateUnifiedAnalysis');
      logBenchmark(benchmarkInfo);

      return result;
    } catch (error) {
      console.error('[LlamaCpp] Unified analysis error:', error);
      logBenchmark({
        timestamp: now,
        latencyMs: Math.round(performance.now() - startTime),
        method: 'generateUnifiedAnalysis',
        modelFile: this.modelFileName,
        promptLengthChars: 0,
        outputLengthChars: 0,
        promptTokenEstimate: 0,
        outputTokenEstimate: 0,
        jsonParseSuccess: false,
        jsonRepaired: false,
        schemaCompliant: false,
        available: false,
        thinkingEnabled: false,
        error: String(error),
      });
      return { available: false, generatedAt: now, thinkingEnabled: false };
    }
  }

  /**
   * Generate unified clinical analysis with streaming for real-time UI updates
   */
  async generateUnifiedAnalysisStream(
    context: UnifiedAnalysisContext,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const now = new Date().toISOString();
    const startTime = performance.now();

    if (!await this.isAvailable()) {
      onChunk({ type: 'error', error: 'Service LLM non disponible' });
      return;
    }

    try {
      const prompt = this.isFineTuned
        ? this.buildUnifiedPromptFinetuned(context)
        : this.buildUnifiedPrompt(context);
      const grammar = this.unifiedResponseGrammar;

      const contextSize = process.env.LLAMA_CONTEXT_SIZE
        ? parseInt(process.env.LLAMA_CONTEXT_SIZE, 10)
        : (this.isFineTuned ? 2048 : 4096);

      const ctx = await this.model!.createContext({
        contextSize
      });

      const fineTunedSystemPrompt = `Tu es un assistant medical d'urgence experimente. Reponds en JSON.
Regles:
- orientationReason: 1 phrase courte maximum
- nursingInterventions et medicalInterventions: specifiques avec posologies
- criticalAlerts: phrases courtes
- pathologies: maximum 3, reasoning 1-2 phrases courtes chacune
- Ordre des champs: orientation, orientationReason, nursingInterventions, medicalInterventions, recommendedTests, criticalAlerts, warnings, pathologies`;

      const session = new this.LlamaChatSession!({
        contextSequence: ctx.getSequence(),
        ...(this.isFineTuned
          ? { systemPrompt: fineTunedSystemPrompt }
          : {})
      });

      let fullResponse = '';
      let fullThinking = '';
      let inThinkingBlock = false;

      await session.prompt(prompt, {
        maxTokens: this.isFineTuned ? 1500 : 2048,
        temperature: this.isFineTuned ? 0.1 : 0.3,
        ...(grammar ? { grammar } : {}),
        onTextChunk: (chunk: string) => {
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

      const result = this.parseUnifiedResponse(fullResponse, now, fullThinking || undefined);
      onChunk({ type: 'done', unifiedResult: result });

      // Benchmark logging
      const latencyMs = Math.round(performance.now() - startTime);
      const benchmarkInfo = this.buildUnifiedBenchmark(
        fullResponse, result, prompt, now, latencyMs, 'generateUnifiedAnalysisStream'
      );
      benchmarkInfo.thinkingLengthChars = fullThinking.length || undefined;
      benchmarkInfo.outputLengthChars = fullResponse.length + fullThinking.length;
      benchmarkInfo.outputTokenEstimate = estimateTokens(fullResponse) + estimateTokens(fullThinking);
      logBenchmark(benchmarkInfo);

      await ctx.dispose();
    } catch (error) {
      console.error('[LlamaCpp] Unified analysis streaming error:', error);
      logBenchmark({
        timestamp: now,
        latencyMs: Math.round(performance.now() - startTime),
        method: 'generateUnifiedAnalysisStream',
        modelFile: this.modelFileName,
        promptLengthChars: 0,
        outputLengthChars: 0,
        promptTokenEstimate: 0,
        outputTokenEstimate: 0,
        jsonParseSuccess: false,
        jsonRepaired: false,
        schemaCompliant: false,
        available: false,
        thinkingEnabled: false,
        error: String(error),
      });
      onChunk({ type: 'error', error: 'Erreur lors de la generation de l\'analyse unifiee' });
    }
  }

  /**
   * Build a BenchmarkEntry for unified analysis calls.
   * Detects JSON repair, schema compliance, and extracts result metadata.
   */
  private buildUnifiedBenchmark(
    rawOutput: string,
    result: UnifiedAnalysisResult,
    prompt: string,
    timestamp: string,
    latencyMs: number,
    method: 'generateUnifiedAnalysis' | 'generateUnifiedAnalysisStream'
  ): BenchmarkEntry {
    let jsonParseSuccess = false;
    let jsonRepaired = false;
    let schemaCompliant = false;

    const cleanOutput = rawOutput.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const jsonMatch = cleanOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];
      try {
        JSON.parse(jsonStr);
        jsonParseSuccess = true;
      } catch {
        // Check if repair would have been needed
        const repaired = this.repairTruncatedJson(jsonStr);
        try {
          JSON.parse(repaired);
          jsonParseSuccess = true;
          jsonRepaired = true;
        } catch { /* both failed */ }
      }

      if (jsonParseSuccess) {
        try {
          const parsed = JSON.parse(jsonRepaired ? this.repairTruncatedJson(jsonStr) : jsonStr);
          schemaCompliant = validateUnifiedSchema(parsed);
        } catch { /* validation parse failed */ }
      }
    }

    const analysis = result.analysis;
    return {
      timestamp,
      latencyMs,
      method,
      modelFile: this.modelFileName,
      promptLengthChars: prompt.length,
      outputLengthChars: rawOutput.length,
      promptTokenEstimate: estimateTokens(prompt),
      outputTokenEstimate: estimateTokens(rawOutput),
      jsonParseSuccess,
      jsonRepaired,
      schemaCompliant,
      available: result.available,
      orientation: analysis?.orientation,
      pathologyCount: analysis?.pathologies?.length,
      hasNursingInterventions: analysis ? analysis.nursingInterventions.length > 0 : undefined,
      hasMedicalInterventions: analysis ? analysis.medicalInterventions.length > 0 : undefined,
      hasRecommendedTests: analysis ? analysis.recommendedTests.length > 0 : undefined,
      hasCriticalAlerts: analysis ? analysis.criticalAlerts.length > 0 : undefined,
      thinkingEnabled: result.thinkingEnabled,
      thinkingLengthChars: result.thinkingTrace?.length,
      response: analysis ?? undefined,
    };
  }

  /**
   * Attempt to repair truncated JSON from token-limited LLM output.
   * Closes unclosed strings, arrays, and objects in correct nesting order.
   */
  private repairTruncatedJson(json: string): string {
    let repaired = json.trim();

    // Fast path: already valid
    try { JSON.parse(repaired); return repaired; } catch { /* needs repair */ }

    // Track nesting structure
    const stack: string[] = [];
    let inString = false;
    let escape = false;

    for (const char of repaired) {
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === '{') stack.push('}');
      else if (char === '[') stack.push(']');
      else if ((char === '}' || char === ']') && stack.length > 0) stack.pop();
    }

    // Close unclosed string literal
    if (inString) repaired += '"';

    // Remove trailing comma or incomplete key-value pair before closing
    repaired = repaired.replace(/,\s*$/, '');
    repaired = repaired.replace(/,?\s*"[^"]*"\s*:?\s*$/, '');
    repaired = repaired.replace(/,\s*$/, '');

    // Close all unclosed structures in reverse nesting order
    while (stack.length > 0) {
      repaired += stack.pop();
    }

    return repaired;
  }

  /**
   * Parse unified analysis response and extract JSON
   * Handles thinking model output with <think>...</think> blocks
   */
  private parseUnifiedResponse(
    response: string,
    generatedAt: string,
    thinkingFromApi?: string
  ): UnifiedAnalysisResult {
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
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];

        // Attempt repair if direct parse fails (handles token-truncated output)
        try {
          JSON.parse(jsonStr);
        } catch {
          console.warn('[LlamaCpp] Unified response JSON truncated, attempting repair');
          jsonStr = this.repairTruncatedJson(jsonStr);
        }

        const parsed = JSON.parse(jsonStr);

        // Validate orientation
        const validOrientations = ['SAUV', 'MEDICAL', 'SURGICAL', 'TRAUMA', 'PEDIATRIC'] as const;
        const orientation = validOrientations.includes(parsed.orientation)
          ? parsed.orientation as typeof validOrientations[number]
          : 'MEDICAL' as const;

        // Validate pathologies is a non-empty array
        if (!Array.isArray(parsed.pathologies) || parsed.pathologies.length === 0) {
          console.warn('[LlamaCpp] Unified analysis: pathologies array is empty or missing');
          return {
            available: false,
            generatedAt,
            thinkingTrace,
            thinkingEnabled
          };
        }

        // Normalize pathologies (limit to top 3 for fine-tuned models)
        const maxPathologies = this.isFineTuned ? 3 : 5;
        const pathologies = parsed.pathologies
          .slice(0, maxPathologies)
          .map((p: Record<string, unknown>) => {
            // Validate required fields
            if (!p.name || !p.reasoning) {
              return null;
            }
            const confidence = typeof p.confidence === 'number'
              ? Math.max(0, Math.min(100, p.confidence))
              : 50;
            return {
              name: String(p.name),
              confidence,
              signs: Array.isArray(p.signs) ? p.signs.map(String) : [],
              reasoning: String(p.reasoning),
              urgency: this.normalizeUrgency(p.urgency),
              ...(p.icd10Code ? { icd10Code: String(p.icd10Code) } : {})
            };
          }).filter((p: unknown) => p !== null);

        if (pathologies.length === 0) {
          console.warn('[LlamaCpp] Unified analysis: all pathologies failed validation');
          return {
            available: false,
            generatedAt,
            thinkingTrace,
            thinkingEnabled
          };
        }

        return {
          available: true,
          analysis: {
            orientation,
            orientationReason: String(parsed.orientationReason || ''),
            criticalAlerts: Array.isArray(parsed.criticalAlerts) ? parsed.criticalAlerts.map(String) : [],
            pathologies,
            nursingInterventions: Array.isArray(parsed.nursingInterventions) ? parsed.nursingInterventions.map(String) : [],
            medicalInterventions: Array.isArray(parsed.medicalInterventions) ? parsed.medicalInterventions.map(String) : [],
            recommendedTests: Array.isArray(parsed.recommendedTests) ? parsed.recommendedTests.map(String) : [],
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
            analysisTimestamp: generatedAt,
            locale: 'fr'
          },
          generatedAt,
          thinkingTrace,
          thinkingEnabled
        };
      }
    } catch (e) {
      console.error('[LlamaCpp] Failed to parse unified response:', e);
    }

    return {
      available: false,
      generatedAt,
      thinkingTrace,
      thinkingEnabled
    };
  }

  /**
   * Cleanup resources on shutdown
   */
  async dispose(): Promise<void> {
    closeBenchmarkLogger();
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
    this.unifiedResponseGrammar = null;
  }
}
