import path from 'path';
import fs from 'fs/promises';
import { LLMProvider, PreDiagnosisContext, PreDiagnosisSuggestion, StreamChunk, UnifiedAnalysisContext, UnifiedAnalysisResult } from '../index';
import { logBenchmark, estimateTokens, validateUnifiedSchema, validatePreDiagnosisSchema, closeBenchmarkLogger, type BenchmarkEntry } from '../benchmark-logger';
import {
  PRE_DIAGNOSIS_JSON_SCHEMA,
  UNIFIED_ANALYSIS_JSON_SCHEMA_BASE,
  UNIFIED_ANALYSIS_JSON_SCHEMA_FINETUNED,
} from '../json-schemas';
import {
  buildPreDiagnosisPrompt,
  buildUnifiedAnalysisPrompt,
  buildUnifiedPromptFinetuned,
} from '../prompt-builder';
import {
  parsePreDiagnosisResponse,
  parseUnifiedAnalysisResponse,
  repairTruncatedJson,
} from '../response-parser';

// Types for node-llama-cpp (dynamically imported)
type LlamaInstance = any;
type LlamaModelInstance = any;
type LlamaChatSessionConstructor = any;

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
   * Check if a local .gguf model file can be found (without full initialization)
   */
  static async hasLocalModel(): Promise<boolean> {
    const modelsDir = process.env.LLAMA_MODELS_DIR || path.join(process.cwd(), 'models');
    const modelPath = process.env.LLAMA_MODEL_PATH || '';

    // Check explicit path first
    if (modelPath) {
      try {
        await fs.access(modelPath);
        return true;
      } catch {
        return false;
      }
    }

    // Check LLAMA_MODEL_FILE
    if (process.env.LLAMA_MODEL_FILE) {
      try {
        await fs.access(path.join(modelsDir, process.env.LLAMA_MODEL_FILE));
        return true;
      } catch {
        return false;
      }
    }

    // Search directories
    const searchDirs = [modelsDir];
    if (process.resourcesPath) {
      searchDirs.push(path.join(process.resourcesPath, 'models'));
    }

    for (const dir of searchDirs) {
      try {
        const files = await fs.readdir(dir);
        if (files.some((f: string) => f.endsWith('.gguf'))) {
          return true;
        }
      } catch {
        // Directory doesn't exist, try next
      }
    }

    return false;
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
      const thinkingPrefix = this.enableThinking ? '/think\n' : '/no_think\n';
      const prompt = buildPreDiagnosisPrompt(context, { thinkingPrefix });
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

      const result = parsePreDiagnosisResponse(fullResponse, now, undefined);

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
      const thinkingPrefix = this.enableThinking ? '/think\n' : '/no_think\n';
      const prompt = buildPreDiagnosisPrompt(context, { thinkingPrefix });
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
      const result = parsePreDiagnosisResponse(fullResponse, now, fullThinking || undefined);
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
   * Generate unified clinical analysis from patient context
   */
  async generateUnifiedAnalysis(context: UnifiedAnalysisContext): Promise<UnifiedAnalysisResult> {
    const now = new Date().toISOString();
    const startTime = performance.now();

    if (!await this.isAvailable()) {
      return { available: false, generatedAt: now, thinkingEnabled: false };
    }

    try {
      const thinkingPrefix = this.enableThinking ? '/think\n' : '/no_think\n';
      const prompt = this.isFineTuned
        ? buildUnifiedPromptFinetuned(context)
        : buildUnifiedAnalysisPrompt(context, { thinkingPrefix });
      const grammar = this.unifiedResponseGrammar;

      const contextSize = process.env.LLAMA_CONTEXT_SIZE
        ? parseInt(process.env.LLAMA_CONTEXT_SIZE, 10)
        : (this.isFineTuned ? 2048 : 4096);

      const ctx = await this.model!.createContext({
        contextSize
      });

      const fineTunedSystemPrompt = `Tu es un assistant medical d'urgence experimente travaillant dans un service d'accueil des urgences en Tunisie. Reponds en JSON.
Contexte:
- Adapte tes suggestions a la pratique hospitaliere tunisienne (protocoles, medicaments et equipements disponibles en Tunisie)
- Utilise les DCI des medicaments courants en Tunisie avec posologies standard tunisiennes
Regles:
- orientationReason: 1 phrase courte maximum
- nursingInterventions: minimum 2, specifiques et actionnables avec posologies adaptees au contexte tunisien
- medicalInterventions: essentielles uniquement, avec posologies selon les protocoles tunisiens
- criticalAlerts: maximum 5, uniquement si urgence vitale
- pathologies: minimum 2, maximum 3, reasoning 1-2 phrases courtes chacune
- warnings: maximum 6, phrases courtes
- Ordre: orientation, orientationReason, nursingInterventions, medicalInterventions, recommendedTests, criticalAlerts, warnings, pathologies`;

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

      const maxPathologies = this.isFineTuned ? 3 : 5;
      const result = parseUnifiedAnalysisResponse(fullResponse, now, undefined, maxPathologies);

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
      const thinkingPrefix = this.enableThinking ? '/think\n' : '/no_think\n';
      const prompt = this.isFineTuned
        ? buildUnifiedPromptFinetuned(context)
        : buildUnifiedAnalysisPrompt(context, { thinkingPrefix });
      const grammar = this.unifiedResponseGrammar;

      const contextSize = process.env.LLAMA_CONTEXT_SIZE
        ? parseInt(process.env.LLAMA_CONTEXT_SIZE, 10)
        : (this.isFineTuned ? 2048 : 4096);

      const ctx = await this.model!.createContext({
        contextSize
      });

      const fineTunedSystemPrompt = `Tu es un assistant medical d'urgence experimente travaillant dans un service d'accueil des urgences en Tunisie. Reponds en JSON.
Contexte:
- Adapte tes suggestions a la pratique hospitaliere tunisienne (protocoles, medicaments et equipements disponibles en Tunisie)
- Utilise les DCI des medicaments courants en Tunisie avec posologies standard tunisiennes
Regles:
- orientationReason: 1 phrase courte maximum
- nursingInterventions: minimum 2, specifiques et actionnables avec posologies adaptees au contexte tunisien
- medicalInterventions: essentielles uniquement, avec posologies selon les protocoles tunisiens
- criticalAlerts: maximum 5, uniquement si urgence vitale
- pathologies: minimum 2, maximum 3, reasoning 1-2 phrases courtes chacune
- warnings: maximum 6, phrases courtes
- Ordre: orientation, orientationReason, nursingInterventions, medicalInterventions, recommendedTests, criticalAlerts, warnings, pathologies`;

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

      const maxPathologies = this.isFineTuned ? 3 : 5;
      const result = parseUnifiedAnalysisResponse(fullResponse, now, fullThinking || undefined, maxPathologies);
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
      const jsonStr = jsonMatch[0];
      try {
        JSON.parse(jsonStr);
        jsonParseSuccess = true;
      } catch {
        const repaired = repairTruncatedJson(jsonStr);
        try {
          JSON.parse(repaired);
          jsonParseSuccess = true;
          jsonRepaired = true;
        } catch { /* both failed */ }
      }

      if (jsonParseSuccess) {
        try {
          const parsed = JSON.parse(jsonRepaired ? repairTruncatedJson(jsonStr) : jsonStr);
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
