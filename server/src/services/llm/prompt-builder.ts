import type { PreDiagnosisContext, UnifiedAnalysisContext } from './index';

/**
 * Shared prompt building functions for LLM providers.
 * Extracted from LlamaCppProvider so both local and Claude providers
 * use identical clinical prompts.
 */

export interface PromptOptions {
  /** Add /think or /no_think prefix for Qwen3 models */
  thinkingPrefix?: string;
}

// ─── Pre-Diagnosis Prompt ─────────────────────────────────────────────────────

export function buildPreDiagnosisPrompt(
  context: PreDiagnosisContext,
  options?: PromptOptions
): string {
  const prefix = options?.thinkingPrefix ?? '';
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

  return `${prefix}Tu es un assistant médical d'urgence expérimenté travaillant dans un service d'accueil des urgences.

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

// ─── Unified Analysis Prompt ──────────────────────────────────────────────────

export function buildUnifiedAnalysisPrompt(
  context: UnifiedAnalysisContext,
  options?: PromptOptions
): string {
  const prefix = options?.thinkingPrefix ?? '';
  const sex = context.sex === 'MALE' ? 'Homme' : 'Femme';

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

  const scoresText = [
    `- NEWS: ${context.scores.news ?? 'Non calcule'}${context.scores.news !== undefined && context.scores.news >= 7 ? ' CRITIQUE' : ''}`,
    `- GCS: ${context.scores.gcs ?? 'Non calcule'}/15${context.scores.gcs !== undefined && context.scores.gcs < 9 ? ' ALTERATION' : ''}`,
    `- qSOFA: ${context.scores.qsofa ?? 'Non calcule'}/3${context.scores.qsofa !== undefined && context.scores.qsofa >= 2 ? ' SEPSIS?' : ''}`
  ].join('\n');

  const abcdeText = serializeAbcdeFindings(context.abcdeFindings);

  const allergiesText = context.allergies ? `\nALLERGIES: ${context.allergies}` : '';
  const historyText = context.medicalHistory?.length
    ? `\nANTECEDENTS: ${context.medicalHistory.join(', ')}`
    : '';

  return `${prefix}Tu es un assistant medical d'urgence experimente dans un service d'accueil des urgences tunisien.

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
- "nursingInterventions": soins infirmiers specifiques et actionnables, adaptes a la pratique hospitaliere tunisienne avec posologies
- "medicalInterventions": interventions medicales selon les protocoles tunisiens (DCI et posologies disponibles en Tunisie)
- "recommendedTests": examens complementaires recommandes et disponibles en Tunisie
- "warnings": mises en garde cliniques

Exemple de structure attendue:
{"orientation":"MEDICAL","orientationReason":"...","criticalAlerts":[],"pathologies":[{"name":"...","confidence":70,"signs":["..."],"reasoning":"...","urgency":"urgent"}],"nursingInterventions":["..."],"medicalInterventions":["..."],"recommendedTests":["..."],"warnings":["..."]}

Reponds UNIQUEMENT avec un objet JSON valide.`;
}

// ─── Fine-Tuned Prompt (local models only) ────────────────────────────────────

export function buildUnifiedPromptFinetuned(context: UnifiedAnalysisContext): string {
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

  const abcdeText = serializeAbcdeFindings(context.abcdeFindings);

  let prompt = `PATIENT:\n- Age: ${context.age} ans\n- Sexe: ${sex}\n- Motif: ${context.chiefComplaint}\n\nCONSTANTES:\n${vitalsLines.join('\n')}\n\nSCORES:\n${scoresText}\n\nABCDE:\n${abcdeText}`;

  if (context.medicalHistory?.length) {
    prompt += `\n\nATCD: ${context.medicalHistory.join(', ')}`;
  }
  if (context.allergies) {
    prompt += `\nALLERGIES: ${context.allergies}`;
  }

  return prompt;
}

// ─── ABCDE Serialization ──────────────────────────────────────────────────────

export function serializeAbcdeFindings(findings: UnifiedAnalysisContext['abcdeFindings']): string {
  const sections: string[] = [];

  if (findings.airway && Object.keys(findings.airway).length > 0) {
    sections.push(`A (Voies aeriennes): ${serializeAirway(findings.airway)}`);
  }
  if (findings.breathing && Object.keys(findings.breathing).length > 0) {
    sections.push(`B (Respiration): ${serializeBreathing(findings.breathing)}`);
  }
  if (findings.circulation && Object.keys(findings.circulation).length > 0) {
    sections.push(`C (Circulation): ${serializeCirculation(findings.circulation)}`);
  }
  if (findings.disability && Object.keys(findings.disability).length > 0) {
    sections.push(`D (Neurologique): ${serializeDisability(findings.disability)}`);
  }
  if (findings.exposure && Object.keys(findings.exposure).length > 0) {
    sections.push(`E (Exposition): ${serializeExposure(findings.exposure)}`);
  }

  return sections.length > 0 ? sections.join('\n') : 'Aucune evaluation ABCDE disponible';
}

export function serializeAirway(data: Record<string, unknown>): string {
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

  for (const [key, value] of Object.entries(data)) {
    if (!['obstructed', 'patent', 'stridor', 'gurgling', 'snoring', 'edema', 'secretions', 'foreignBody', 'tracheostomy', 'cervicalCollar', 'notes'].includes(key)) {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'RAS';
}

export function serializeBreathing(data: Record<string, unknown>): string {
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

export function serializeCirculation(data: Record<string, unknown>): string {
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

export function serializeDisability(data: Record<string, unknown>): string {
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

export function serializeExposure(data: Record<string, unknown>): string {
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
