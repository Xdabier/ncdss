import fs from 'fs';
import path from 'path';

/**
 * Benchmark log entry for a single LLM inference call.
 * Written as one JSONL line per call to server/benchmark-logs/.
 */
export interface BenchmarkEntry {
  // Timing
  timestamp: string;
  latencyMs: number;

  // Method info
  method: 'generatePreDiagnosis' | 'generatePreDiagnosisStream' | 'generateUnifiedAnalysis' | 'generateUnifiedAnalysisStream';
  modelFile: string;

  // Token estimates (approximate — based on output string length / 4)
  promptLengthChars: number;
  outputLengthChars: number;
  promptTokenEstimate: number;
  outputTokenEstimate: number;

  // Quality signals
  jsonParseSuccess: boolean;
  jsonRepaired: boolean;
  schemaCompliant: boolean;
  available: boolean;

  // Unified analysis specifics (null for pre-diagnosis calls)
  orientation?: string;
  pathologyCount?: number;
  hasNursingInterventions?: boolean;
  hasMedicalInterventions?: boolean;
  hasRecommendedTests?: boolean;
  hasCriticalAlerts?: boolean;

  // Pre-diagnosis specifics (null for unified calls)
  suggestionCount?: number;

  // Thinking mode
  thinkingEnabled: boolean;
  thinkingLengthChars?: number;

  // Full response content (the parsed JSON object sent to the client)
  response?: unknown;

  // Error info
  error?: string;
}

const LOG_DIR = path.join(process.cwd(), 'benchmark-logs');

let logStream: fs.WriteStream | null = null;
let currentLogDate: string | null = null;

/**
 * Get or create a write stream for today's log file.
 * Rotates daily: benchmark-2026-02-17.jsonl
 */
function getLogStream(): fs.WriteStream {
  const today = new Date().toISOString().slice(0, 10);

  if (logStream && currentLogDate === today) {
    return logStream;
  }

  // Close previous stream if date changed
  if (logStream) {
    logStream.end();
  }

  // Ensure directory exists
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  const logFile = path.join(LOG_DIR, `benchmark-${today}.jsonl`);
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  currentLogDate = today;

  console.log(`[Benchmark] Logging to ${logFile}`);
  return logStream;
}

/**
 * Write a benchmark entry to the JSONL log.
 * Non-blocking, fire-and-forget — never throws.
 */
export function logBenchmark(entry: BenchmarkEntry): void {
  try {
    const stream = getLogStream();
    stream.write(JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[Benchmark] Failed to write log entry:', err);
  }
}

/**
 * Estimate token count from character length.
 * Rough heuristic: ~4 chars per token for multilingual models.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Validate unified analysis schema compliance.
 * Checks required fields, enum values, and array constraints.
 */
export function validateUnifiedSchema(parsed: Record<string, unknown>): boolean {
  const validOrientations = ['SAUV', 'MEDICAL', 'SURGICAL', 'TRAUMA', 'PEDIATRIC'];
  const validUrgencies = ['routine', 'urgent', 'emergent'];

  // Required top-level fields
  if (!validOrientations.includes(parsed.orientation as string)) return false;
  if (typeof parsed.orientationReason !== 'string') return false;
  if (!Array.isArray(parsed.criticalAlerts)) return false;
  if (!Array.isArray(parsed.pathologies)) return false;
  if (!Array.isArray(parsed.nursingInterventions)) return false;
  if (!Array.isArray(parsed.medicalInterventions)) return false;
  if (!Array.isArray(parsed.recommendedTests)) return false;
  if (!Array.isArray(parsed.warnings)) return false;

  // Pathologies constraints
  const pathologies = parsed.pathologies as Array<Record<string, unknown>>;
  if (pathologies.length < 1 || pathologies.length > 5) return false;

  for (const p of pathologies) {
    if (typeof p.name !== 'string' || !p.name) return false;
    if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 100) return false;
    if (!Array.isArray(p.signs)) return false;
    if (typeof p.reasoning !== 'string' || !p.reasoning) return false;
    if (!validUrgencies.includes(p.urgency as string)) return false;
  }

  return true;
}

/**
 * Validate pre-diagnosis schema compliance.
 */
export function validatePreDiagnosisSchema(parsed: Record<string, unknown>): boolean {
  const validUrgencies = ['routine', 'urgent', 'emergent'];

  if (!Array.isArray(parsed.suggestions)) return false;
  if (!Array.isArray(parsed.recommendedTests)) return false;
  if (!Array.isArray(parsed.warnings)) return false;

  const suggestions = parsed.suggestions as Array<Record<string, unknown>>;
  if (suggestions.length < 1 || suggestions.length > 4) return false;

  for (const s of suggestions) {
    if (typeof s.diagnosis !== 'string' || !s.diagnosis) return false;
    if (typeof s.confidence !== 'number') return false;
    if (typeof s.reasoning !== 'string') return false;
    if (!validUrgencies.includes(s.urgency as string)) return false;
  }

  return true;
}

/**
 * Close the log stream. Call on app shutdown.
 */
export function closeBenchmarkLogger(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
    currentLogDate = null;
  }
}
