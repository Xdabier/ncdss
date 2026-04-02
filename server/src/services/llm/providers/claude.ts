import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, PreDiagnosisContext, PreDiagnosisSuggestion, StreamChunk, UnifiedAnalysisContext, UnifiedAnalysisResult } from '../index';
import { logBenchmark, estimateTokens, validateUnifiedSchema, validatePreDiagnosisSchema } from '../benchmark-logger';
import { buildPreDiagnosisPrompt, buildUnifiedAnalysisPrompt } from '../prompt-builder';
import { parsePreDiagnosisResponse, parseUnifiedAnalysisResponse } from '../response-parser';

const SYSTEM_PROMPT = `Tu es un assistant medical d'urgence experimente travaillant dans un service d'accueil des urgences en Tunisie.

Regles strictes:
- Tu n'es PAS un medecin. Tes suggestions sont des hypotheses a confirmer par un medecin.
- Tu DOIS raisonner et repondre UNIQUEMENT en francais.
- Adapte tes suggestions a la pratique hospitaliere tunisienne (protocoles, medicaments et equipements disponibles en Tunisie).
- Utilise les DCI des medicaments courants en Tunisie avec posologies standard tunisiennes.
- Reponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou apres le JSON.`;

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    this.client = new Anthropic({
      apiKey: this.apiKey || 'placeholder', // SDK requires a value; isAvailable() gates actual calls
    });
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  // ─── Pre-Diagnosis ────────────────────────────────────────────────────────

  async generatePreDiagnosis(context: PreDiagnosisContext): Promise<PreDiagnosisSuggestion> {
    const now = new Date().toISOString();
    const startTime = performance.now();

    if (!await this.isAvailable()) {
      return { available: false, suggestions: [], generatedAt: now, thinkingEnabled: false };
    }

    try {
      const prompt = buildPreDiagnosisPrompt(context);

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 1500,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const fullResponse = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      const result = parsePreDiagnosisResponse(fullResponse, now, undefined);

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
        method: 'generatePreDiagnosis',
        modelFile: `claude-api:${this.model}`,
        promptLengthChars: prompt.length,
        outputLengthChars: fullResponse.length,
        promptTokenEstimate: message.usage?.input_tokens ?? estimateTokens(prompt),
        outputTokenEstimate: message.usage?.output_tokens ?? estimateTokens(fullResponse),
        jsonParseSuccess,
        jsonRepaired: false,
        schemaCompliant,
        available: result.available,
        suggestionCount: result.suggestions.length,
        thinkingEnabled: false,
        response: result.available ? { suggestions: result.suggestions, recommendedTests: result.recommendedTests, warnings: result.warnings } : undefined,
      });

      return result;
    } catch (error) {
      console.error('[Claude] Pre-diagnosis error:', error);
      logBenchmark({
        timestamp: now,
        latencyMs: Math.round(performance.now() - startTime),
        method: 'generatePreDiagnosis',
        modelFile: `claude-api:${this.model}`,
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

  // ─── Pre-Diagnosis Streaming ──────────────────────────────────────────────

  async generatePreDiagnosisStream(
    context: PreDiagnosisContext,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const now = new Date().toISOString();
    const startTime = performance.now();

    if (!await this.isAvailable()) {
      onChunk({ type: 'error', error: 'Service Claude API non disponible (cle API manquante)' });
      return;
    }

    try {
      const prompt = buildPreDiagnosisPrompt(context);
      let fullResponse = '';

      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 1500,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          fullResponse += text;
          onChunk({ type: 'response', content: text });
        }
      }

      const result = parsePreDiagnosisResponse(fullResponse, now, undefined);
      onChunk({ type: 'done', result });

      // Benchmark logging
      const latencyMs = Math.round(performance.now() - startTime);
      const finalMessage = await stream.finalMessage();
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
        modelFile: `claude-api:${this.model}`,
        promptLengthChars: prompt.length,
        outputLengthChars: fullResponse.length,
        promptTokenEstimate: finalMessage.usage?.input_tokens ?? estimateTokens(prompt),
        outputTokenEstimate: finalMessage.usage?.output_tokens ?? estimateTokens(fullResponse),
        jsonParseSuccess,
        jsonRepaired: false,
        schemaCompliant,
        available: result.available,
        suggestionCount: result.suggestions.length,
        thinkingEnabled: false,
        response: result.available ? { suggestions: result.suggestions, recommendedTests: result.recommendedTests, warnings: result.warnings } : undefined,
      });
    } catch (error) {
      console.error('[Claude] Streaming pre-diagnosis error:', error);
      logBenchmark({
        timestamp: now,
        latencyMs: Math.round(performance.now() - startTime),
        method: 'generatePreDiagnosisStream',
        modelFile: `claude-api:${this.model}`,
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
      onChunk({ type: 'error', error: 'Erreur lors de la generation (Claude API)' });
    }
  }

  // ─── Unified Analysis ─────────────────────────────────────────────────────

  async generateUnifiedAnalysis(context: UnifiedAnalysisContext): Promise<UnifiedAnalysisResult> {
    const now = new Date().toISOString();
    const startTime = performance.now();

    if (!await this.isAvailable()) {
      return { available: false, generatedAt: now, thinkingEnabled: false };
    }

    try {
      const prompt = buildUnifiedAnalysisPrompt(context);

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 1500,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const fullResponse = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      const result = parseUnifiedAnalysisResponse(fullResponse, now, undefined, 5);

      // Benchmark logging
      const latencyMs = Math.round(performance.now() - startTime);
      let jsonParseSuccess = false;
      let schemaCompliant = false;
      try {
        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          jsonParseSuccess = true;
          schemaCompliant = validateUnifiedSchema(parsed);
        }
      } catch { /* parse failed */ }

      const analysis = result.analysis;
      logBenchmark({
        timestamp: now,
        latencyMs,
        method: 'generateUnifiedAnalysis',
        modelFile: `claude-api:${this.model}`,
        promptLengthChars: prompt.length,
        outputLengthChars: fullResponse.length,
        promptTokenEstimate: message.usage?.input_tokens ?? estimateTokens(prompt),
        outputTokenEstimate: message.usage?.output_tokens ?? estimateTokens(fullResponse),
        jsonParseSuccess,
        jsonRepaired: false,
        schemaCompliant,
        available: result.available,
        orientation: analysis?.orientation,
        pathologyCount: analysis?.pathologies?.length,
        hasNursingInterventions: analysis ? analysis.nursingInterventions.length > 0 : undefined,
        hasMedicalInterventions: analysis ? analysis.medicalInterventions.length > 0 : undefined,
        hasRecommendedTests: analysis ? analysis.recommendedTests.length > 0 : undefined,
        hasCriticalAlerts: analysis ? analysis.criticalAlerts.length > 0 : undefined,
        thinkingEnabled: false,
        response: analysis ?? undefined,
      });

      return result;
    } catch (error) {
      console.error('[Claude] Unified analysis error:', error);
      logBenchmark({
        timestamp: now,
        latencyMs: Math.round(performance.now() - startTime),
        method: 'generateUnifiedAnalysis',
        modelFile: `claude-api:${this.model}`,
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

  // ─── Unified Analysis Streaming ───────────────────────────────────────────

  async generateUnifiedAnalysisStream(
    context: UnifiedAnalysisContext,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const now = new Date().toISOString();
    const startTime = performance.now();

    if (!await this.isAvailable()) {
      onChunk({ type: 'error', error: 'Service Claude API non disponible (cle API manquante)' });
      return;
    }

    try {
      const prompt = buildUnifiedAnalysisPrompt(context);
      let fullResponse = '';

      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 1500,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          fullResponse += text;
          onChunk({ type: 'response', content: text });
        }
      }

      const result = parseUnifiedAnalysisResponse(fullResponse, now, undefined, 5);
      onChunk({ type: 'done', unifiedResult: result });

      // Benchmark logging
      const latencyMs = Math.round(performance.now() - startTime);
      const finalMessage = await stream.finalMessage();
      const analysis = result.analysis;
      let jsonParseSuccess = false;
      let schemaCompliant = false;
      try {
        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          jsonParseSuccess = true;
          schemaCompliant = validateUnifiedSchema(parsed);
        }
      } catch { /* parse failed */ }

      logBenchmark({
        timestamp: now,
        latencyMs,
        method: 'generateUnifiedAnalysisStream',
        modelFile: `claude-api:${this.model}`,
        promptLengthChars: prompt.length,
        outputLengthChars: fullResponse.length,
        promptTokenEstimate: finalMessage.usage?.input_tokens ?? estimateTokens(prompt),
        outputTokenEstimate: finalMessage.usage?.output_tokens ?? estimateTokens(fullResponse),
        jsonParseSuccess,
        jsonRepaired: false,
        schemaCompliant,
        available: result.available,
        orientation: analysis?.orientation,
        pathologyCount: analysis?.pathologies?.length,
        hasNursingInterventions: analysis ? analysis.nursingInterventions.length > 0 : undefined,
        hasMedicalInterventions: analysis ? analysis.medicalInterventions.length > 0 : undefined,
        hasRecommendedTests: analysis ? analysis.recommendedTests.length > 0 : undefined,
        hasCriticalAlerts: analysis ? analysis.criticalAlerts.length > 0 : undefined,
        thinkingEnabled: false,
        response: analysis ?? undefined,
      });
    } catch (error) {
      console.error('[Claude] Unified analysis streaming error:', error);
      logBenchmark({
        timestamp: now,
        latencyMs: Math.round(performance.now() - startTime),
        method: 'generateUnifiedAnalysisStream',
        modelFile: `claude-api:${this.model}`,
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
      onChunk({ type: 'error', error: 'Erreur lors de la generation de l\'analyse unifiee (Claude API)' });
    }
  }
}
