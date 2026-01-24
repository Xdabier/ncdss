import { LLMProvider, PreDiagnosisContext, PreDiagnosisSuggestion, StreamChunk } from '../index';

/**
 * Ollama provider for local LLM inference
 * Runs fully offline using local Llama model
 * Supports thinking models (DeepSeek-R1, Qwen3)
 */
export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;
  private enableThinking: boolean;

  constructor() {
    this.baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'qwen3:latest';
    this.enableThinking = process.env.OLLAMA_ENABLE_THINKING !== 'false';
  }

  /**
   * Check if Ollama service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Generate pre-diagnosis suggestions from patient context
   * Returns available: false if Ollama is not running
   */
  async generatePreDiagnosis(context: PreDiagnosisContext): Promise<PreDiagnosisSuggestion> {
    const now = new Date().toISOString();

    // Check availability first
    const available = await this.isAvailable();
    if (!available) {
      return { available: false, suggestions: [], generatedAt: now, thinkingEnabled: false };
    }

    try {
      const prompt = this.buildPrompt(context);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 180s (3 min) for thinking models

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 2000 // Increased for thinking output
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`Ollama error: ${response.status}`);
        return { available: false, suggestions: [], generatedAt: now, thinkingEnabled: false };
      }

      const data = await response.json();
      // Ollama may return thinking in a separate field (Qwen3) or in the response (DeepSeek-R1)
      const thinkingFromApi = data.thinking || undefined;
      return this.parseResponse(data.response, now, thinkingFromApi);
    } catch (error) {
      console.error('LLM pre-diagnosis error:', error);
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

    // Check availability first
    const available = await this.isAvailable();
    if (!available) {
      onChunk({ type: 'error', error: 'Service Ollama non disponible' });
      return;
    }

    try {
      const prompt = this.buildPrompt(context);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: true,
          options: {
            temperature: 0.3,
            num_predict: 2000
          }
        })
      });

      if (!response.ok || !response.body) {
        onChunk({ type: 'error', error: `Erreur Ollama: ${response.status}` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let fullResponse = '';
      let fullThinking = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete JSON lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line);

            // Accumulate thinking (Qwen3 sends it separately)
            if (chunk.thinking) {
              fullThinking += chunk.thinking;
              onChunk({ type: 'thinking', content: chunk.thinking });
            }

            // Accumulate response
            if (chunk.response) {
              fullResponse += chunk.response;
              onChunk({ type: 'response', content: chunk.response });
            }

            // Check if done
            if (chunk.done) {
              // Parse final result
              const result = this.parseResponse(fullResponse, now, fullThinking || undefined);
              onChunk({ type: 'done', result });
              return;
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      // If we exit loop without done, parse what we have
      const result = this.parseResponse(fullResponse, now, fullThinking || undefined);
      onChunk({ type: 'done', result });

    } catch (error) {
      console.error('LLM streaming error:', error);
      onChunk({ type: 'error', error: 'Erreur lors de la generation' });
    }
  }

  /**
   * Build French medical prompt from patient context
   * Adds thinking prefix for Qwen3 models
   */
  private buildPrompt(context: PreDiagnosisContext): string {
    // Qwen3 thinking toggle - add /think or /no_think prefix
    const isQwen3 = this.model.toLowerCase().includes('qwen3');
    const thinkingPrefix = isQwen3
      ? (this.enableThinking ? '/think\n' : '/no_think\n')
      : '';

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
   * Handles thinking model output:
   * - Ollama API `thinking` field (Qwen3)
   * - Inline <think>...</think> blocks (DeepSeek-R1)
   */
  private parseResponse(response: string, generatedAt: string, thinkingFromApi?: string): PreDiagnosisSuggestion {
    let thinkingTrace: string | undefined = thinkingFromApi;
    let cleanResponse = response;
    let thinkingEnabled = !!thinkingFromApi;

    // Also check for inline <think> blocks (DeepSeek-R1 format)
    const thinkMatch = response.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      // Append to existing thinking or use as primary
      thinkingTrace = thinkingTrace
        ? `${thinkingTrace}\n\n${thinkMatch[1].trim()}`
        : thinkMatch[1].trim();
      thinkingEnabled = true;
      cleanResponse = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    try {
      // Extract JSON from cleaned response (may contain text before/after)
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate and normalize suggestions
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
      console.error('Failed to parse LLM response:', e);
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
}
