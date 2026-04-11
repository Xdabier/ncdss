/**
 * JSON schema constants for LLM response validation.
 * Used by LlamaCppProvider for grammar-constrained decoding,
 * and by ClaudeProvider for response format instructions.
 */

export const PRE_DIAGNOSIS_JSON_SCHEMA = {
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

export const UNIFIED_ANALYSIS_JSON_SCHEMA_BASE = {
  type: 'object' as const,
  properties: {
    orientation: {
      type: 'string' as const,
      enum: ['SAUV', 'DECHOCAGE', 'MEDICAL', 'SURGICAL', 'TRAUMA', 'PEDIATRIC']
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

export const UNIFIED_ANALYSIS_JSON_SCHEMA_FINETUNED = {
  type: 'object' as const,
  properties: {
    orientation: {
      type: 'string' as const,
      enum: ['SAUV', 'DECHOCAGE', 'MEDICAL', 'SURGICAL', 'TRAUMA', 'PEDIATRIC']
    },
    orientationReason: { type: 'string' as const },
    nursingInterventions: { type: 'array' as const, items: { type: 'string' as const }, minItems: 2 },
    medicalInterventions: { type: 'array' as const, items: { type: 'string' as const } },
    recommendedTests: { type: 'array' as const, items: { type: 'string' as const } },
    criticalAlerts: {
      type: 'array' as const,
      items: { type: 'string' as const },
      maxItems: 5
    },
    warnings: { type: 'array' as const, items: { type: 'string' as const }, maxItems: 6 },
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
      minItems: 2,
      maxItems: 3
    }
  },
  required: ['orientation', 'orientationReason', 'nursingInterventions', 'medicalInterventions',
             'recommendedTests', 'criticalAlerts', 'warnings', 'pathologies'] as const
};
