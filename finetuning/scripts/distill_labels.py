"""Phase 1.3 — Distill unified ground-truth labels via Claude Sonnet.

For each synthetic patient profile, calls Claude Sonnet to produce the unified
JSON output (orientation, pathologies, interventions, tests, warnings) that the
fine-tuned model will learn to reproduce.

Supports two modes:
- **Batch mode** (default): Uses the Anthropic Message Batches API for ~50%
  cost savings.  Requests are submitted as a batch, polled until completion,
  then validated with automatic retries.
- **Real-time mode** (``--realtime``): Uses ``client.messages.create()`` with
  async concurrency — the original behavior, useful for debugging or small runs.

Usage:
    python -m scripts.distill_labels
    python -m scripts.distill_labels --categories cardiac,trauma --language fr
    python -m scripts.distill_labels --dosage-mode
    python -m scripts.distill_labels --dry-run
    python -m scripts.distill_labels --resume
    python -m scripts.distill_labels --realtime
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
from tqdm import tqdm

from scripts.common import (
    get_anthropic_client,
    get_data_dir,
    load_categories,
    load_env,
    load_prompt_template,
    load_unified_schema,
    logger,
    save_jsonl,
    validate_against_schema,
)

MODEL = "claude-sonnet-4-5-20250929"
MAX_TOKENS = 8192
TEMPERATURE = 0.3
MAX_RETRIES = 3
VALID_ORIENTATIONS = {"SAUV", "MEDICAL", "SURGICAL", "TRAUMA", "PEDIATRIC"}
VALID_URGENCIES = {"routine", "urgent", "emergent"}
ICD10_PATTERN = re.compile(r"^[A-Z]\d{2}(\.\d{1,2})?$")

# Common words used for language detection heuristic
FRENCH_WORDS = {
    "le", "la", "les", "de", "du", "des", "un", "une", "et", "est", "en",
    "au", "aux", "ce", "cette", "il", "elle", "nous", "vous", "avec", "pour",
    "pas", "dans", "sur", "par", "que", "qui", "son", "sa", "ses",
}
ENGLISH_WORDS = {
    "the", "a", "an", "is", "are", "of", "in", "to", "and", "for", "with",
    "on", "at", "by", "this", "that", "it", "he", "she", "we", "you", "from",
    "was", "has", "had", "not", "but", "or", "as", "be", "no",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Distill unified ground-truth labels via Claude Sonnet"
    )
    parser.add_argument(
        "--input-dir",
        type=str,
        default=None,
        help="Path to patients directory (default: {DATA_DIR}/patients)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Path for labels output (default: {DATA_DIR}/labels)",
    )
    parser.add_argument(
        "--categories",
        type=str,
        default=None,
        help="Comma-separated category IDs to process (default: all)",
    )
    parser.add_argument(
        "--language",
        type=str,
        choices=["fr", "en", "both"],
        default="both",
        help="Language to process: fr, en, or both (default: both)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print one prompt and exit without calling the API",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip patients that already have labels",
    )
    parser.add_argument(
        "--max-concurrent",
        type=int,
        default=None,
        help="Max concurrent API calls (default: from env or 5; ignored in batch mode)",
    )
    parser.add_argument(
        "--dosage-mode",
        action="store_true",
        help="Use the dosage-focused prompt template instead",
    )
    parser.add_argument(
        "--realtime",
        action="store_true",
        help="Use real-time API calls instead of the batch API (for debugging/small runs)",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Patient formatting
# ---------------------------------------------------------------------------

ABCDE_HEADERS_FR = {
    "airway": "A - Voies aeriennes",
    "breathing": "B - Respiration",
    "circulation": "C - Circulation",
    "disability": "D - Neurologique",
    "exposure": "E - Exposition",
}

ABCDE_HEADERS_EN = {
    "airway": "A - Airway",
    "breathing": "B - Breathing",
    "circulation": "C - Circulation",
    "disability": "D - Disability",
    "exposure": "E - Exposure",
}


def format_abcde(findings: dict[str, Any], language: str) -> str:
    """Format ABCDE findings into a readable text block."""
    headers = ABCDE_HEADERS_FR if language == "fr" else ABCDE_HEADERS_EN
    sections: list[str] = []

    for category in ("airway", "breathing", "circulation", "disability", "exposure"):
        data = findings.get(category)
        if not data or not isinstance(data, dict):
            continue
        lines = [f"{headers[category]}:"]
        for key, value in data.items():
            if value is not None and value != "" and value is not False:
                lines.append(f"  - {key}: {value}")
        if len(lines) > 1:
            sections.append("\n".join(lines))

    return "\n".join(sections) if sections else "Aucune donnee ABCDE" if language == "fr" else "No ABCDE data"


def format_patient_prompt(patient: dict, language: str) -> str:
    """Build the patient data block matching the plan's prompt format."""
    vitals = patient.get("vitals", {})
    scores = patient.get("scores", {})
    abcde = patient.get("abcdeFindings", {})
    medical_history = patient.get("medicalHistory", [])
    allergies = patient.get("allergies", "")

    if language == "fr":
        sex_label = "Homme" if patient.get("sex") == "MALE" else "Femme"
        lines = [
            "PATIENT:",
            f"- Age: {patient.get('age', 'NR')} ans",
            f"- Sexe: {sex_label}",
            f"- Motif: {patient.get('chiefComplaint', 'NR')}",
            "",
            "CONSTANTES:",
            f"- Temperature: {vitals.get('temperature', 'NM')} °C",
            f"- FC: {vitals.get('heartRate', 'NM')} bpm",
            f"- FR: {vitals.get('respiratoryRate', 'NM')} /min",
            f"- TA: {vitals.get('bloodPressure', 'NM')}",
            f"- SpO2: {vitals.get('oxygenSaturation', 'NM')} %",
            f"- EVA douleur: {vitals.get('painLevel', 'NM')}/10",
            "",
            "SCORES:",
            f"- NEWS: {scores.get('news', 'NC')}",
            f"- GCS: {scores.get('gcs', 'NC')}/15",
            f"- qSOFA: {scores.get('qsofa', 'NC')}/3",
            "",
            "EVALUATION ABCDE:",
            format_abcde(abcde, language),
        ]

        if isinstance(medical_history, list) and medical_history:
            lines.append(f"\nANTECEDENTS: {', '.join(str(h) for h in medical_history)}")
        elif isinstance(medical_history, str) and medical_history:
            lines.append(f"\nANTECEDENTS: {medical_history}")
        else:
            lines.append("\nANTECEDENTS: Aucun")

        if allergies:
            lines.append(f"ALLERGIES: {allergies}")
        else:
            lines.append("ALLERGIES: Aucune connue")
    else:
        sex_label = "Male" if patient.get("sex") == "MALE" else "Female"
        lines = [
            "PATIENT:",
            f"- Age: {patient.get('age', 'NR')} years",
            f"- Sex: {sex_label}",
            f"- Chief complaint: {patient.get('chiefComplaint', 'NR')}",
            "",
            "VITALS:",
            f"- Temperature: {vitals.get('temperature', 'NM')} °C",
            f"- HR: {vitals.get('heartRate', 'NM')} bpm",
            f"- RR: {vitals.get('respiratoryRate', 'NM')} /min",
            f"- BP: {vitals.get('bloodPressure', 'NM')}",
            f"- SpO2: {vitals.get('oxygenSaturation', 'NM')} %",
            f"- Pain (VAS): {vitals.get('painLevel', 'NM')}/10",
            "",
            "SCORES:",
            f"- NEWS: {scores.get('news', 'NC')}",
            f"- GCS: {scores.get('gcs', 'NC')}/15",
            f"- qSOFA: {scores.get('qsofa', 'NC')}/3",
            "",
            "ABCDE ASSESSMENT:",
            format_abcde(abcde, language),
        ]

        if isinstance(medical_history, list) and medical_history:
            lines.append(f"\nMEDICAL HISTORY: {', '.join(str(h) for h in medical_history)}")
        elif isinstance(medical_history, str) and medical_history:
            lines.append(f"\nMEDICAL HISTORY: {medical_history}")
        else:
            lines.append("\nMEDICAL HISTORY: None")

        if allergies:
            lines.append(f"ALLERGIES: {allergies}")
        else:
            lines.append("ALLERGIES: No known allergies")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def detect_language(text: str) -> str | None:
    """Heuristic: check first ~5 words against French/English word lists."""
    words = re.findall(r"[a-zA-Zéèêëàâùûôîïç]+", text.lower())[:5]
    if not words:
        return None
    fr_count = sum(1 for w in words if w in FRENCH_WORDS)
    en_count = sum(1 for w in words if w in ENGLISH_WORDS)
    if fr_count > en_count:
        return "fr"
    if en_count > fr_count:
        return "en"
    return None


def validate_label(label: dict, patient: dict, schema: dict, expected_language: str) -> list[str]:
    """Validate a distilled label against schema and clinical rules.

    Returns a list of error messages (empty if valid).
    """
    errors: list[str] = []

    # 1. Schema validation
    schema_errors = validate_against_schema(label, schema)
    if schema_errors:
        errors.extend(schema_errors)
        # If schema fails badly, skip detailed checks
        if len(schema_errors) > 5:
            return errors

    # 2. Orientation enum
    orientation = label.get("orientation")
    if orientation not in VALID_ORIENTATIONS:
        errors.append(f"Invalid orientation: {orientation}")

    # 3. Pathologies validation
    pathologies = label.get("pathologies", [])
    if not (1 <= len(pathologies) <= 5):
        errors.append(f"Expected 1-5 pathologies, got {len(pathologies)}")

    for i, path in enumerate(pathologies):
        if not isinstance(path, dict):
            errors.append(f"pathologies[{i}]: not a dict")
            continue

        # Urgency enum
        urgency = path.get("urgency")
        if urgency not in VALID_URGENCIES:
            errors.append(f"pathologies[{i}].urgency: invalid value '{urgency}'")

        # Confidence range
        confidence = path.get("confidence")
        if isinstance(confidence, (int, float)):
            if not (0 <= confidence <= 100):
                errors.append(f"pathologies[{i}].confidence: {confidence} not in 0-100")
        else:
            errors.append(f"pathologies[{i}].confidence: not a number")

        # ICD-10 code format
        icd10 = path.get("icd10Code")
        if icd10:
            if not ICD10_PATTERN.match(icd10):
                errors.append(f"pathologies[{i}].icd10Code: '{icd10}' does not match pattern")
        else:
            errors.append(f"pathologies[{i}].icd10Code: missing")

    # 4. Intervention minimums
    nursing = label.get("nursingInterventions", [])
    if len(nursing) < 2:
        errors.append(f"nursingInterventions: expected >= 2, got {len(nursing)}")

    medical = label.get("medicalInterventions", [])
    if len(medical) < 2:
        errors.append(f"medicalInterventions: expected >= 2, got {len(medical)}")

    # 5. Language match heuristic
    orientation_reason = label.get("orientationReason", "")
    detected = detect_language(orientation_reason)
    if detected and detected != expected_language:
        errors.append(
            f"Language mismatch: expected {expected_language}, detected {detected} "
            f"in orientationReason"
        )

    # 6. SAUV consistency check
    scores = patient.get("scores", {})
    vitals = patient.get("vitals", {})
    news = scores.get("news")
    gcs = scores.get("gcs")
    qsofa = scores.get("qsofa")
    spo2 = vitals.get("oxygenSaturation")

    requires_sauv = False
    sauv_reasons: list[str] = []
    if isinstance(news, (int, float)) and news >= 7:
        requires_sauv = True
        sauv_reasons.append(f"NEWS={news}>=7")
    if isinstance(gcs, (int, float)) and gcs < 9:
        requires_sauv = True
        sauv_reasons.append(f"GCS={gcs}<9")
    if isinstance(qsofa, (int, float)) and qsofa >= 2:
        requires_sauv = True
        sauv_reasons.append(f"qSOFA={qsofa}>=2")
    if isinstance(spo2, (int, float)) and spo2 < 85:
        requires_sauv = True
        sauv_reasons.append(f"SpO2={spo2}<85%")

    if requires_sauv and orientation != "SAUV":
        errors.append(
            f"SAUV consistency: orientation is '{orientation}' but must be SAUV "
            f"({', '.join(sauv_reasons)})"
        )

    return errors


# ---------------------------------------------------------------------------
# Patient file loading
# ---------------------------------------------------------------------------


def load_patients_file(filepath: str | Path) -> list[dict]:
    """Load patient records from a file, handling both JSONL and pretty-printed JSON.

    Supports:
    - Standard JSONL (one JSON object per line)
    - Pretty-printed JSON objects concatenated back-to-back
    - A JSON array of objects
    """
    path = Path(filepath)
    if not path.exists():
        return []

    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []

    # Try line-by-line JSONL first
    lines = text.splitlines()
    first_line = lines[0].strip()
    if first_line.startswith("{") and first_line.endswith("}"):
        # Looks like proper JSONL — each line is a complete object
        records = []
        for line in lines:
            line = line.strip()
            if line:
                records.append(json.loads(line))
        return records

    # Try as a single JSON array
    if first_line.startswith("["):
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return data
        except json.JSONDecodeError:
            pass

    # Pretty-printed concatenated objects: use a streaming decoder
    records = []
    decoder = json.JSONDecoder()
    idx = 0
    while idx < len(text):
        # Skip whitespace between objects
        while idx < len(text) and text[idx] in " \t\n\r":
            idx += 1
        if idx >= len(text):
            break
        try:
            obj, end_idx = decoder.raw_decode(text, idx)
            records.append(obj)
            idx = end_idx
        except json.JSONDecodeError:
            break

    return records


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------


def _fix_json(text: str) -> str:
    """Fix common LLM JSON errors: trailing commas and missing commas."""
    # 1. Remove trailing commas before } or ]
    text = re.sub(r",\s*([}\]])", r"\1", text)
    # 2. Insert missing commas between any JSON value end and the next key.
    #    Matches: ", ], }, digits, true, false, null — followed by newline + indent + "
    text = re.sub(
        r'(["\]\}]|true|false|null|\d)\s*\n(\s*")',
        r"\1,\n\2",
        text,
    )
    return text


def extract_json_object(text: str) -> dict:
    """Extract a JSON object from response text, handling markdown fences and JSON fixups."""
    # Strip markdown code fences if present
    code_block = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if code_block:
        text = code_block.group(1).strip()

    # Find the first { and last }
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise json.JSONDecodeError("No JSON object found in response", text, 0)

    raw = text[start : end + 1]

    # Try parsing as-is first
    saved_err_pos = 0
    try:
        return json.loads(raw)
    except json.JSONDecodeError as first_err:
        saved_err_pos = first_err.pos or 0

    # Retry after fixing common LLM JSON errors
    try:
        return json.loads(_fix_json(raw))
    except json.JSONDecodeError:
        # Log the problematic region for debugging
        pos = saved_err_pos
        context_start = max(0, pos - 80)
        context_end = min(len(raw), pos + 80)
        snippet = raw[context_start:context_end]
        raise json.JSONDecodeError(
            f"JSON fix failed. Near char {pos}: ...{snippet!r}...",
            raw,
            pos,
        )


# ---------------------------------------------------------------------------
# Real-time API call + retry (used by --realtime and other scripts)
# ---------------------------------------------------------------------------


async def distill_label(
    client: anthropic.AsyncAnthropic,
    patient: dict,
    prompt_template: str,
    schema: dict,
    language: str,
    patient_id: str,
) -> tuple[dict | None, int, str | None]:
    """Call Claude to produce a unified label for one patient.

    Returns (label_dict | None, retries_used, last_error_message | None).
    """
    patient_data = format_patient_prompt(patient, language)
    filled_prompt = prompt_template.replace("{PATIENT_DATA}", patient_data)

    messages: list[dict[str, str]] = [{"role": "user", "content": filled_prompt}]
    last_error: str | None = None

    for attempt in range(MAX_RETRIES):
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                temperature=TEMPERATURE,
                messages=messages,
            )
            text = response.content[0].text

            # Parse JSON
            try:
                label = extract_json_object(text)
            except (json.JSONDecodeError, TypeError) as e:
                last_error = f"JSON parse error: {str(e)[:200]}"
                if attempt < MAX_RETRIES - 1:
                    logger.warning(
                        "[%s] JSON parse failed (attempt %d): %s",
                        patient_id, attempt + 1, last_error,
                    )
                    messages = [
                        {"role": "user", "content": filled_prompt},
                        {"role": "assistant", "content": text},
                        {
                            "role": "user",
                            "content": (
                                "The previous response could not be parsed as JSON. "
                                "Please respond with ONLY a valid JSON object, "
                                "no markdown, no extra text."
                            ),
                        },
                    ]
                    continue
                return None, attempt + 1, last_error

            # Validate
            validation_errors = validate_label(label, patient, schema, language)
            if not validation_errors:
                return label, attempt, None

            last_error = "; ".join(validation_errors[:5])
            if attempt < MAX_RETRIES - 1:
                logger.warning(
                    "[%s] Validation failed (attempt %d): %s",
                    patient_id, attempt + 1, last_error,
                )
                error_list = "\n".join(f"- {e}" for e in validation_errors)
                messages = [
                    {"role": "user", "content": filled_prompt},
                    {"role": "assistant", "content": text},
                    {
                        "role": "user",
                        "content": (
                            f"The previous response had validation errors:\n{error_list}\n\n"
                            "Please fix and respond with valid JSON only."
                        ),
                    },
                ]
                continue

            return None, attempt + 1, last_error

        except anthropic.RateLimitError:
            backoff = 2 ** (2 * attempt + 1)  # 2s, 8s, 32s
            logger.warning(
                "[%s] Rate limited, retrying in %ds (attempt %d/%d)",
                patient_id, backoff, attempt + 1, MAX_RETRIES,
            )
            await asyncio.sleep(backoff)

        except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            backoff = 2 ** (2 * attempt + 1)
            logger.warning(
                "[%s] Network error (%s), retrying in %ds (attempt %d/%d)",
                patient_id, type(e).__name__, backoff, attempt + 1, MAX_RETRIES,
            )
            await asyncio.sleep(backoff)

        except anthropic.APIStatusError as e:
            backoff = 2 ** (2 * attempt + 1)
            logger.error(
                "[%s] API error %d (%s), retrying in %ds",
                patient_id, e.status_code, str(e)[:100], backoff,
            )
            await asyncio.sleep(backoff)

    return None, MAX_RETRIES, last_error or "max_retries_exceeded"


# ---------------------------------------------------------------------------
# Error logging
# ---------------------------------------------------------------------------


def log_distillation_error(
    error_log_path: Path,
    patient_id: str,
    errors: str,
    last_response: str | None = None,
) -> None:
    """Append an error entry to the distillation errors JSONL file."""
    error_log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "patient_id": patient_id,
        "errors": errors,
        "last_response": (last_response or "")[:500],
    }
    with open(error_log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# Core processing — real-time mode (--realtime)
# ---------------------------------------------------------------------------


async def process_patient(
    client: anthropic.AsyncAnthropic,
    patient: dict,
    patient_id: str,
    prompt_template: str,
    schema: dict,
    language: str,
    category: str,
    semaphore: asyncio.Semaphore,
    error_log_path: Path,
) -> dict | None:
    """Process a single patient: distill label and return output record."""
    async with semaphore:
        label, retries, error = await distill_label(
            client, patient, prompt_template, schema, language, patient_id,
        )

    if label is None:
        log_distillation_error(error_log_path, patient_id, error or "unknown")
        return None

    return {
        "patient_id": patient_id,
        "category": category,
        "language": language,
        "patient": patient,
        "label": label,
        "distilled_at": datetime.now(timezone.utc).isoformat(),
        "retries": retries,
    }


def build_patient_id(category: str, language: str, index: int) -> str:
    """Build a deterministic patient ID: {category}_{language}_{zero-padded-index}."""
    return f"{category}_{language}_{index:03d}"


def load_existing_ids(output_path: Path) -> set[str]:
    """Load patient IDs from an existing labels JSONL file."""
    ids: set[str] = set()
    if not output_path.exists():
        return ids
    with open(output_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                pid = record.get("patient_id")
                if pid:
                    ids.add(pid)
            except json.JSONDecodeError:
                continue
    return ids


def discover_patient_files(
    input_dir: Path,
    category_ids: set[str] | None,
    languages: list[str],
) -> list[tuple[str, str, Path]]:
    """Find patient JSONL files and return (category, language, path) tuples."""
    results: list[tuple[str, str, Path]] = []
    if not input_dir.exists():
        return results

    for filepath in sorted(input_dir.glob("patients_*_*.jsonl")):
        # Parse filename: patients_{category}_{language}.jsonl
        stem = filepath.stem  # e.g. "patients_cardiac_fr"
        parts = stem.split("_", 1)  # ["patients", "cardiac_fr"]
        if len(parts) < 2:
            continue
        remainder = parts[1]  # "cardiac_fr"

        # Language is the last segment after the final underscore
        last_underscore = remainder.rfind("_")
        if last_underscore == -1:
            continue
        cat_id = remainder[:last_underscore]
        lang = remainder[last_underscore + 1 :]

        if lang not in ("fr", "en"):
            continue
        if lang not in languages:
            continue
        if category_ids and cat_id not in category_ids:
            continue

        results.append((cat_id, lang, filepath))

    return results


async def process_category_language(
    client: anthropic.AsyncAnthropic,
    cat_id: str,
    language: str,
    patients: list[dict],
    prompt_template: str,
    schema: dict,
    output_path: Path,
    error_log_path: Path,
    semaphore: asyncio.Semaphore,
    existing_ids: set[str],
    resume: bool,
) -> dict[str, Any]:
    """Process all patients for one category/language pair (real-time mode)."""
    total = len(patients)
    success = 0
    failed = 0
    retried = 0
    api_calls = 0

    # Build tasks for patients that need processing
    tasks: list[tuple[int, dict, str]] = []
    for idx, patient in enumerate(patients):
        pid = build_patient_id(cat_id, language, idx)
        if resume and pid in existing_ids:
            continue
        tasks.append((idx, patient, pid))

    if not tasks:
        logger.info("[%s/%s] All %d patients already processed, skipping", cat_id, language, total)
        return {
            "category": cat_id,
            "language": language,
            "total": total,
            "success": total,
            "failed": 0,
            "retry_rate": 0.0,
            "api_calls": 0,
            "skipped": True,
        }

    pbar = tqdm(
        total=len(tasks),
        desc=f"{cat_id}/{language}",
        unit="pt",
        leave=False,
    )

    # Process in batches to flush results periodically
    batch_size = 20
    for batch_start in range(0, len(tasks), batch_size):
        batch = tasks[batch_start : batch_start + batch_size]
        coros = [
            process_patient(
                client, patient, pid, prompt_template, schema,
                language, cat_id, semaphore, error_log_path,
            )
            for _, patient, pid in batch
        ]

        results = await asyncio.gather(*coros)
        api_calls += len(batch)

        # Collect successful results for this batch
        batch_records: list[dict] = []
        for result in results:
            if result is not None:
                batch_records.append(result)
                success += 1
                if result.get("retries", 0) > 0:
                    retried += 1
            else:
                failed += 1

        # Flush batch to disk
        if batch_records:
            save_jsonl(batch_records, str(output_path))

        pbar.update(len(batch))

    pbar.close()

    processed = success + failed
    retry_rate = (retried / processed * 100) if processed > 0 else 0.0

    return {
        "category": cat_id,
        "language": language,
        "total": total,
        "success": success + (total - len(tasks)),  # include previously processed
        "failed": failed,
        "retry_rate": retry_rate,
        "api_calls": api_calls,
        "skipped": False,
    }


# ---------------------------------------------------------------------------
# Batch mode helpers
# ---------------------------------------------------------------------------


def build_distill_batch_request(
    patient: dict,
    patient_id: str,
    prompt_template: str,
    language: str,
    temperature: float = TEMPERATURE,
) -> dict[str, Any]:
    """Build one batch request dict for a patient distillation."""
    from scripts.batch_utils import build_batch_request, split_prompt_for_caching

    patient_data = format_patient_prompt(patient, language)
    system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)

    return build_batch_request(
        custom_id=patient_id,
        model=MODEL,
        system_text=system_text,
        user_content=user_text,
        max_tokens=MAX_TOKENS,
        temperature=temperature,
    )


def build_distill_retry_request(
    custom_id: str,
    prompt_template: str,
    patient: dict,
    language: str,
    response_text: str | None,
    error_msg: str,
) -> dict[str, Any]:
    """Build a 3-message retry batch request for a failed distillation."""
    from scripts.batch_utils import build_retry_batch_request, split_prompt_for_caching

    patient_data = format_patient_prompt(patient, language)
    system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)

    if response_text is None:
        # API-level failure — just re-send the original request
        from scripts.batch_utils import build_batch_request
        return build_batch_request(
            custom_id=custom_id,
            model=MODEL,
            system_text=system_text,
            user_content=user_text,
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
        )

    # Determine fix instruction from the error type
    if error_msg.startswith("JSON parse error"):
        fix_instruction = (
            "The previous response could not be parsed as JSON. "
            "Please respond with ONLY a valid JSON object, "
            "no markdown, no extra text."
        )
    else:
        fix_instruction = (
            f"The previous response had validation errors:\n{error_msg}\n\n"
            "Please fix and respond with valid JSON only."
        )

    return build_retry_batch_request(
        custom_id=custom_id,
        model=MODEL,
        system_text=system_text,
        original_user_content=user_text,
        bad_response=response_text,
        fix_instruction=fix_instruction,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
    )


def process_category_language_batch(
    client: anthropic.Anthropic,
    cat_id: str,
    language: str,
    patients: list[dict],
    prompt_template: str,
    schema: dict,
    output_path: Path,
    error_log_path: Path,
    existing_ids: set[str],
    resume: bool,
    data_dir: Path,
) -> dict[str, Any]:
    """Process all patients for one category/language pair using the batch API."""
    from scripts.batch_utils import run_batch_with_retries

    total = len(patients)

    # Build tasks for patients that need processing
    tasks: list[tuple[int, dict, str]] = []
    for idx, patient in enumerate(patients):
        pid = build_patient_id(cat_id, language, idx)
        if resume and pid in existing_ids:
            continue
        tasks.append((idx, patient, pid))

    if not tasks:
        logger.info("[%s/%s] All %d patients already processed, skipping", cat_id, language, total)
        return {
            "category": cat_id,
            "language": language,
            "total": total,
            "success": total,
            "failed": 0,
            "retry_rate": 0.0,
            "api_calls": 0,
            "skipped": True,
        }

    # Build a lookup: patient_id -> (patient, idx) for validation and retries
    patient_lookup: dict[str, dict] = {}
    batch_requests: list[dict[str, Any]] = []
    for idx, patient, pid in tasks:
        patient_lookup[pid] = patient
        batch_requests.append(
            build_distill_batch_request(patient, pid, prompt_template, language)
        )

    logger.info("[%s/%s] Submitting %d requests via batch API", cat_id, language, len(batch_requests))

    # Validation callback
    def validate_fn(custom_id: str, response_text: str) -> tuple[Any | None, str | None]:
        try:
            label = extract_json_object(response_text)
        except (json.JSONDecodeError, TypeError) as e:
            return None, f"JSON parse error: {str(e)[:200]}"
        patient = patient_lookup[custom_id]
        validation_errors = validate_label(label, patient, schema, language)
        if validation_errors:
            return None, "; ".join(validation_errors[:5])
        return label, None

    # Retry builder callback
    def build_retry_fn(custom_id: str, response_text: str | None, error_msg: str) -> dict[str, Any]:
        patient = patient_lookup[custom_id]
        return build_distill_retry_request(
            custom_id, prompt_template, patient, language, response_text, error_msg,
        )

    # Run the batch pipeline with retries
    outcome = run_batch_with_retries(
        client=client,
        requests=batch_requests,
        validate_fn=validate_fn,
        build_retry_fn=build_retry_fn,
        description=f"distill_{cat_id}_{language}",
        max_rounds=MAX_RETRIES,
        checkpoint_name=f"distill_{cat_id}_{language}",
        checkpoint_dir=data_dir,
    )

    # Write successful results to output
    records: list[dict] = []
    for pid, (label, rounds_used) in outcome.succeeded.items():
        records.append({
            "patient_id": pid,
            "category": cat_id,
            "language": language,
            "patient": patient_lookup[pid],
            "label": label,
            "distilled_at": datetime.now(timezone.utc).isoformat(),
            "retries": rounds_used,
        })

    if records:
        save_jsonl(records, str(output_path))

    # Log failures
    for failure in outcome.failures:
        log_distillation_error(
            error_log_path,
            failure["custom_id"],
            failure.get("error", "unknown"),
            failure.get("last_response"),
        )

    success = len(outcome.succeeded)
    failed = len(outcome.failures)
    retried = sum(1 for _, (_, rounds) in outcome.succeeded.items() if rounds > 0)
    processed = success + failed
    retry_rate = (retried / processed * 100) if processed > 0 else 0.0

    return {
        "category": cat_id,
        "language": language,
        "total": total,
        "success": success + (total - len(tasks)),
        "failed": failed,
        "retry_rate": retry_rate,
        "api_calls": outcome.total_requests_submitted,
        "skipped": False,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    load_env()
    args = parse_args()

    data_dir = get_data_dir()
    input_dir = Path(args.input_dir) if args.input_dir else data_dir / "patients"
    output_dir = Path(args.output_dir) if args.output_dir else data_dir / "labels"
    output_dir.mkdir(parents=True, exist_ok=True)
    error_log_path = data_dir / "distillation_errors.jsonl"

    # Load schema
    schema = load_unified_schema()

    # Load prompt template
    template_name = "distill_dosage_labels" if args.dosage_mode else "distill_unified_labels"
    prompt_template = load_prompt_template(template_name)

    # Determine categories and languages
    category_ids: set[str] | None = None
    if args.categories:
        category_ids = set(args.categories.split(","))

    languages: list[str] = []
    if args.language in ("fr", "both"):
        languages.append("fr")
    if args.language in ("en", "both"):
        languages.append("en")

    # Discover patient files
    patient_files = discover_patient_files(input_dir, category_ids, languages)
    if not patient_files:
        logger.error("No patient files found in %s", input_dir)
        sys.exit(1)

    logger.info(
        "Found %d patient files in %s",
        len(patient_files), input_dir,
    )

    # Dry run: show one prompt and exit
    if args.dry_run:
        from scripts.batch_utils import split_prompt_for_caching

        cat_id, lang, filepath = patient_files[0]
        patients = load_patients_file(filepath)
        if not patients:
            logger.error("No patients in %s", filepath)
            sys.exit(1)
        patient_data = format_patient_prompt(patients[0], lang)
        filled = prompt_template.replace("{PATIENT_DATA}", patient_data)
        system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)
        print("=" * 80)
        print(f"DRY RUN — Category: {cat_id}, Language: {lang}")
        print(f"Patient file: {filepath} ({len(patients)} patients)")
        print(f"Template: {template_name}")
        print(f"Mode: {'realtime' if args.realtime else 'batch'}")
        print("=" * 80)
        print("\n--- Full prompt ---\n")
        print(filled)
        if not args.realtime:
            print("\n--- Batch request preview ---\n")
            req = build_distill_batch_request(patients[0], build_patient_id(cat_id, lang, 0), prompt_template, lang)
            print(json.dumps(req, indent=2, ensure_ascii=False)[:3000])
        print("=" * 80)
        print(f"Patient ID would be: {build_patient_id(cat_id, lang, 0)}")
        return

    # Load existing IDs per language for resume
    existing_ids_by_lang: dict[str, set[str]] = {}
    if args.resume:
        for lang in languages:
            op = output_dir / f"labels_{lang}.jsonl"
            existing_ids_by_lang[lang] = load_existing_ids(op)
            if existing_ids_by_lang[lang]:
                logger.info(
                    "Resume: found %d existing labels for %s",
                    len(existing_ids_by_lang[lang]), lang,
                )

    # Process all category/language pairs
    all_results: list[dict[str, Any]] = []
    total_patients = 0

    if args.realtime:
        # ---- Real-time mode (original behavior) ----
        max_concurrent = args.max_concurrent or int(os.getenv("MAX_CONCURRENT", "5"))
        semaphore = asyncio.Semaphore(max_concurrent)
        async_client = anthropic.AsyncAnthropic()

        for cat_id, lang, filepath in patient_files:
            patients = load_patients_file(filepath)
            if not patients:
                logger.warning("No patients in %s, skipping", filepath)
                continue

            total_patients += len(patients)
            output_path = output_dir / f"labels_{lang}.jsonl"
            existing_ids = existing_ids_by_lang.get(lang, set())

            result = await process_category_language(
                async_client, cat_id, lang, patients, prompt_template, schema,
                output_path, error_log_path, semaphore, existing_ids, args.resume,
            )
            all_results.append(result)
    else:
        # ---- Batch mode (default — 50% cost savings) ----
        sync_client = get_anthropic_client()

        for cat_id, lang, filepath in patient_files:
            patients = load_patients_file(filepath)
            if not patients:
                logger.warning("No patients in %s, skipping", filepath)
                continue

            total_patients += len(patients)
            output_path = output_dir / f"labels_{lang}.jsonl"
            existing_ids = existing_ids_by_lang.get(lang, set())

            result = process_category_language_batch(
                sync_client, cat_id, lang, patients, prompt_template, schema,
                output_path, error_log_path, existing_ids, args.resume, data_dir,
            )
            all_results.append(result)

    # Print summary table
    mode_label = "realtime" if args.realtime else "batch"
    print("\n" + "=" * 90)
    print(f"DISTILLATION SUMMARY {'(dosage mode) ' if args.dosage_mode else ''}[{mode_label}]")
    print("=" * 90)
    print(
        f"{'Category':<25} {'Lang':<6} {'Total':>7} {'Success':>9} "
        f"{'Failed':>8} {'Retry%':>8} {'Status'}"
    )
    print("-" * 90)

    total_success = 0
    total_failed = 0
    total_api_calls = 0

    for r in all_results:
        status = "SKIPPED" if r.get("skipped") else ("OK" if r["failed"] == 0 else "ERRORS")
        print(
            f"{r['category']:<25} {r['language']:<6} {r['total']:>7} "
            f"{r['success']:>9} {r['failed']:>8} {r['retry_rate']:>7.1f}% {status}"
        )
        total_success += r["success"]
        total_failed += r["failed"]
        total_api_calls += r["api_calls"]

    print("-" * 90)
    print(f"Total patients:     {total_patients}")
    print(f"Total success:      {total_success}")
    print(f"Total failed:       {total_failed}")
    print(f"Total API calls:    {total_api_calls}")

    # Cost estimate (rough: ~1500 input + ~500 output tokens per call)
    est_input_tokens = total_api_calls * 1500
    est_output_tokens = total_api_calls * 500
    if args.realtime:
        # Sonnet pricing: $3/M input, $15/M output
        est_cost = (est_input_tokens * 3 + est_output_tokens * 15) / 1_000_000
    else:
        # Batch pricing: 50% discount
        est_cost = (est_input_tokens * 1.5 + est_output_tokens * 7.5) / 1_000_000
    print(f"Estimated cost:     ~${est_cost:.2f} ({mode_label})")

    if total_failed > 0:
        print(f"\nErrors logged to: {error_log_path}")
        print("Re-run with --resume to retry failed patients.")

    print("=" * 90)


if __name__ == "__main__":
    asyncio.run(main())
