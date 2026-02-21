"""Phase 1.4 — Cross-lingual alignment: generate aligned FR/EN training pairs.

Selects the highest-quality French labels and produces English translations
of both the patient profiles and the unified labels, creating aligned pairs
that teach the model language-invariant clinical reasoning.

Supports two modes:
- **Batch mode** (default): Two-phase batch pipeline — (1) translate FR
  patient profiles to EN, (2) distill EN labels for translated patients.
  Each phase uses the Anthropic Message Batches API for ~50% cost savings.
- **Real-time mode** (``--realtime``): Uses ``client.messages.create()`` with
  async concurrency — the original behavior.

Usage:
    python -m scripts.augment_crosslingual
    python -m scripts.augment_crosslingual --count 200
    python -m scripts.augment_crosslingual --dry-run
    python -m scripts.augment_crosslingual --resume
    python -m scripts.augment_crosslingual --realtime
"""

import argparse
import asyncio
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
from tqdm import tqdm

from scripts.common import (
    get_anthropic_client,
    get_data_dir,
    load_env,
    load_prompt_template,
    load_unified_schema,
    logger,
    save_jsonl,
    load_jsonl,
    validate_against_schema,
)
from scripts.distill_labels import (
    distill_label,
    extract_json_object,
    format_patient_prompt,
    validate_label,
)

MODEL = "claude-sonnet-4-5-20250929"
MAX_TOKENS = 8192
TEMPERATURE = 0.3
MAX_RETRIES = 3


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Phase 1.4 — Cross-lingual alignment augmentation"
    )
    parser.add_argument(
        "--count",
        type=int,
        default=400,
        help="Number of patients to align (default: 400)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print one translation prompt and exit without calling the API",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip pairs that already exist in the output file",
    )
    parser.add_argument(
        "--max-concurrent",
        type=int,
        default=None,
        help="Max concurrent API calls (default: from env or 5; ignored in batch mode)",
    )
    parser.add_argument(
        "--realtime",
        action="store_true",
        help="Use real-time API calls instead of the batch API (for debugging/small runs)",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Selection: pick the best French labels
# ---------------------------------------------------------------------------


def _patient_acuity(record: dict) -> str:
    """Classify a patient record into acuity bucket based on label urgency."""
    pathologies = record.get("label", {}).get("pathologies", [])
    urgencies = [p.get("urgency") for p in pathologies if isinstance(p, dict)]
    if "emergent" in urgencies:
        return "emergent"
    if "urgent" in urgencies:
        return "urgent"
    return "routine"


def select_best_labels(
    labels: list[dict],
    count: int,
) -> list[dict]:
    """Select the highest-quality French labels for cross-lingual alignment."""
    # Pre-sort by quality: fewest retries, then most pathologies
    labels_sorted = sorted(
        labels,
        key=lambda r: (
            r.get("retries", 0),
            -len(r.get("label", {}).get("pathologies", [])),
        ),
    )

    # Buckets for balancing
    sauv_pool: list[dict] = []
    acuity_pools: dict[str, list[dict]] = {"emergent": [], "urgent": [], "routine": []}
    category_pools: dict[str, list[dict]] = {}

    for record in labels_sorted:
        orientation = record.get("label", {}).get("orientation")
        acuity = _patient_acuity(record)
        category = record.get("category", "unknown")

        if orientation == "SAUV":
            sauv_pool.append(record)
        acuity_pools[acuity].append(record)
        category_pools.setdefault(category, []).append(record)

    selected_ids: set[str] = set()
    selected: list[dict] = []

    def _add(record: dict) -> bool:
        pid = record.get("patient_id", "")
        if pid in selected_ids:
            return False
        selected_ids.add(pid)
        selected.append(record)
        return True

    # 1. Guarantee at least 50 SAUV cases
    min_sauv = min(50, len(sauv_pool))
    for r in sauv_pool[:min_sauv]:
        _add(r)

    # 2. Guarantee at least 50 per acuity level
    for acuity in ("emergent", "urgent", "routine"):
        added = 0
        for r in acuity_pools[acuity]:
            if added >= 50:
                break
            if _add(r):
                added += 1

    # 3. Fill remaining slots balanced across categories (round-robin)
    remaining = count - len(selected)
    if remaining > 0 and category_pools:
        cats = sorted(category_pools.keys())
        cat_indices: dict[str, int] = {c: 0 for c in cats}

        # Round-robin fill
        filled = True
        while len(selected) < count and filled:
            filled = False
            for cat in cats:
                if len(selected) >= count:
                    break
                pool = category_pools[cat]
                idx = cat_indices[cat]
                while idx < len(pool):
                    if _add(pool[idx]):
                        cat_indices[cat] = idx + 1
                        filled = True
                        break
                    idx += 1
                    cat_indices[cat] = idx

    return selected[:count]


# ---------------------------------------------------------------------------
# Translation: patient profile FR -> EN
# ---------------------------------------------------------------------------

TRANSLATE_PROMPT = """You are a medical translator. Translate the following French emergency patient profile to English.

RULES:
- Keep all vital signs, scores, and numeric values EXACTLY as-is
- Translate the chief complaint, medical history, allergies, and ABCDE findings
- Keep the same structure and field names but in English format
- Output ONLY a valid JSON object with the same schema as the input

Input patient (French):
```json
{patient_json}
```

Output the translated patient as a JSON object. Keep field names exactly as: chiefComplaint, age, sex, vitals, abcdeFindings, scores, medicalHistory, allergies, expectedESI, expectedOrientation, category."""

# System portion of the translate prompt (for batch caching)
TRANSLATE_SYSTEM_TEXT = (
    "You are a medical translator. Translate the following French emergency "
    "patient profile to English.\n\n"
    "RULES:\n"
    "- Keep all vital signs, scores, and numeric values EXACTLY as-is\n"
    "- Translate the chief complaint, medical history, allergies, and ABCDE findings\n"
    "- Keep the same structure and field names but in English format\n"
    "- Output ONLY a valid JSON object with the same schema as the input\n"
    "- Keep field names exactly as: chiefComplaint, age, sex, vitals, "
    "abcdeFindings, scores, medicalHistory, allergies, expectedESI, "
    "expectedOrientation, category."
)


def _build_translate_user_content(patient: dict) -> str:
    """Build the user message for a translation request."""
    patient_json = json.dumps(patient, ensure_ascii=False, indent=2)
    return (
        f"Input patient (French):\n```json\n{patient_json}\n```\n\n"
        "Output the translated patient as a JSON object."
    )


def _fixup_translated_patient(translated: dict, original: dict) -> dict:
    """Ensure numeric/structural fields are preserved from the original patient.

    The LLM may omit or mistranslate numeric values, vitals, scores, etc.
    We unconditionally overwrite these from the original to guarantee correctness.
    Text fields like chiefComplaint are kept from the translation if present.
    """
    if not translated.get("chiefComplaint"):
        translated["chiefComplaint"] = original.get("chiefComplaint", "")

    # Preserve numeric/structural fields exactly from original
    translated["age"] = original.get("age")
    translated["sex"] = original.get("sex")
    translated["vitals"] = original.get("vitals", {})
    translated["scores"] = original.get("scores", {})
    translated["abcdeFindings"] = original.get("abcdeFindings", {})
    translated["expectedESI"] = original.get("expectedESI")
    translated["expectedOrientation"] = original.get("expectedOrientation")
    translated["category"] = original.get("category")
    return translated


async def translate_patient(
    client: anthropic.AsyncAnthropic,
    patient: dict,
    patient_id: str,
) -> dict | None:
    """Call Claude to translate a French patient profile to English (real-time mode)."""
    patient_json = json.dumps(patient, ensure_ascii=False, indent=2)
    prompt = TRANSLATE_PROMPT.replace("{patient_json}", patient_json)

    messages: list[dict[str, str]] = [{"role": "user", "content": prompt}]
    last_error: str | None = None

    for attempt in range(MAX_RETRIES):
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                temperature=0.2,
                messages=messages,
            )
            text = response.content[0].text

            try:
                translated = extract_json_object(text)
            except (json.JSONDecodeError, TypeError) as e:
                last_error = f"JSON parse error: {str(e)[:200]}"
                if attempt < MAX_RETRIES - 1:
                    logger.warning(
                        "[%s] Translation JSON parse failed (attempt %d): %s",
                        patient_id, attempt + 1, last_error,
                    )
                    messages = [
                        {"role": "user", "content": prompt},
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
                return None

            return _fixup_translated_patient(translated, patient)

        except anthropic.RateLimitError:
            backoff = 2 ** (2 * attempt + 1)
            logger.warning(
                "[%s] Rate limited during translation, retrying in %ds",
                patient_id, backoff,
            )
            await asyncio.sleep(backoff)

        except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            backoff = 2 ** (2 * attempt + 1)
            logger.warning(
                "[%s] Network error during translation (%s), retrying in %ds",
                patient_id, type(e).__name__, backoff,
            )
            await asyncio.sleep(backoff)

        except anthropic.APIStatusError as e:
            backoff = 2 ** (2 * attempt + 1)
            logger.error(
                "[%s] API error %d during translation, retrying in %ds",
                patient_id, e.status_code, backoff,
            )
            await asyncio.sleep(backoff)

    return None


# ---------------------------------------------------------------------------
# Real-time mode: translate + distill for one patient
# ---------------------------------------------------------------------------


async def process_aligned_pair(
    client: anthropic.AsyncAnthropic,
    record: dict,
    pair_index: int,
    prompt_template_en: str,
    schema: dict,
    semaphore: asyncio.Semaphore,
    error_log_path: Path,
) -> dict | None:
    """Process one patient: translate profile FR->EN, then distill English label."""
    pair_id = f"aligned_{pair_index:03d}"
    patient_id = record.get("patient_id", pair_id)
    patient_fr = record.get("patient", {})
    label_fr = record.get("label", {})

    async with semaphore:
        # Step 1: Translate patient profile to English
        patient_en = await translate_patient(client, patient_fr, f"{pair_id}_translate")
        if patient_en is None:
            logger.error("[%s] Translation failed for %s", pair_id, patient_id)
            _log_error(error_log_path, pair_id, "Translation failed")
            return None

        # Step 2: Generate English label using the translated patient
        label_en, retries, error = await distill_label(
            client,
            patient_en,
            prompt_template_en,
            schema,
            "en",
            f"{pair_id}_en_label",
        )

    if label_en is None:
        logger.error("[%s] English label distillation failed: %s", pair_id, error)
        _log_error(error_log_path, pair_id, f"English label failed: {error}")
        return None

    return {
        "pair_id": pair_id,
        "fr": {
            "patient": patient_fr,
            "label": label_fr,
        },
        "en": {
            "patient": patient_en,
            "label": label_en,
        },
    }


def _log_error(error_log_path: Path, pair_id: str, message: str) -> None:
    """Append an error to the error log."""
    error_log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pair_id": pair_id,
        "error": message,
    }
    with open(error_log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# Batch mode: 2-phase pipeline
# ---------------------------------------------------------------------------


def _save_translations_temp(
    translations: dict[str, dict],
    data_dir: Path,
) -> None:
    """Save completed translations to a temp file for crash recovery."""
    path = data_dir / ".batch_state" / "crosslingual_translations.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(translations, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    logger.info("Saved %d translations to checkpoint", len(translations))


def _load_translations_temp(data_dir: Path) -> dict[str, dict] | None:
    """Load previously saved translations, or return None."""
    path = data_dir / ".batch_state" / "crosslingual_translations.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        logger.info("Loaded %d translations from checkpoint", len(data))
        return data
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to load translations checkpoint: %s", e)
        return None


def _clear_translations_temp(data_dir: Path) -> None:
    """Remove translations temp file."""
    path = data_dir / ".batch_state" / "crosslingual_translations.json"
    if path.exists():
        path.unlink()


def run_crosslingual_batch(
    client: anthropic.Anthropic,
    selected: list[dict],
    prompt_template_en: str,
    schema: dict,
    existing_pair_ids: set[str],
    output_path: Path,
    error_log_path: Path,
    data_dir: Path,
) -> tuple[int, int]:
    """Run 2-phase cross-lingual batch pipeline.

    Phase 1: Translate FR patient profiles to EN.
    Phase 2: Distill EN labels for translated patients.

    Returns:
        (success, failed)
    """
    from scripts.batch_utils import (
        build_batch_request,
        build_retry_batch_request,
        collect_results,
        clear_batch_checkpoint,
        load_batch_checkpoint,
        poll_batch,
        run_batch_with_retries,
        save_batch_checkpoint,
        split_prompt_for_caching,
        submit_batch,
    )

    # Build record lookup, filtering already-processed pairs
    record_lookup: dict[str, dict] = {}  # pair_id -> original record
    for idx, record in enumerate(selected):
        pair_id = f"aligned_{idx:03d}"
        if pair_id in existing_pair_ids:
            continue
        record_lookup[pair_id] = record

    if not record_lookup:
        logger.info("All pairs already processed. Nothing to do.")
        return 0, 0

    # ================================================================
    # PHASE 1: Translation batch
    # ================================================================

    # Check for completed Phase 1 checkpoint
    translations = _load_translations_temp(data_dir)
    translate_failed_ids: set[str] = set()

    if translations is None:
        translations = {}

        # Build translation requests
        translate_requests: list[dict[str, Any]] = []
        for pair_id, record in record_lookup.items():
            patient_fr = record.get("patient", {})
            user_content = _build_translate_user_content(patient_fr)

            translate_requests.append(build_batch_request(
                custom_id=pair_id,
                model=MODEL,
                system_text=TRANSLATE_SYSTEM_TEXT,
                user_content=user_content,
                max_tokens=MAX_TOKENS,
                temperature=0.2,
            ))

        logger.info("Phase 1: Submitting %d translation requests", len(translate_requests))

        # Validate translation: just need valid JSON with chiefComplaint
        def validate_translate(custom_id: str, response_text: str) -> tuple[Any | None, str | None]:
            try:
                translated = extract_json_object(response_text)
            except (json.JSONDecodeError, TypeError) as e:
                return None, f"JSON parse error: {str(e)[:200]}"

            if not isinstance(translated, dict):
                return None, "Response is not a JSON object"

            # Fix up the translated patient
            original = record_lookup[custom_id].get("patient", {})
            translated = _fixup_translated_patient(translated, original)
            return translated, None

        def build_translate_retry(custom_id: str, response_text: str | None, error_msg: str) -> dict[str, Any]:
            record = record_lookup[custom_id]
            patient_fr = record.get("patient", {})
            user_content = _build_translate_user_content(patient_fr)

            if response_text is None:
                return build_batch_request(
                    custom_id=custom_id,
                    model=MODEL,
                    system_text=TRANSLATE_SYSTEM_TEXT,
                    user_content=user_content,
                    max_tokens=MAX_TOKENS,
                    temperature=0.2,
                )

            return build_retry_batch_request(
                custom_id=custom_id,
                model=MODEL,
                system_text=TRANSLATE_SYSTEM_TEXT,
                original_user_content=user_content,
                bad_response=response_text,
                fix_instruction=(
                    "The previous response could not be parsed as JSON. "
                    "Please respond with ONLY a valid JSON object, "
                    "no markdown, no extra text."
                ),
                max_tokens=MAX_TOKENS,
                temperature=0.2,
            )

        translate_outcome = run_batch_with_retries(
            client=client,
            requests=translate_requests,
            validate_fn=validate_translate,
            build_retry_fn=build_translate_retry,
            description="crosslingual_translate",
            max_rounds=MAX_RETRIES,
            checkpoint_name="crosslingual_translate",
            checkpoint_dir=data_dir,
        )

        for pid, (patient_en, _) in translate_outcome.succeeded.items():
            translations[pid] = patient_en

        for failure in translate_outcome.failures:
            translate_failed_ids.add(failure["custom_id"])
            _log_error(error_log_path, failure["custom_id"], f"Translation failed: {failure.get('error')}")

        # Save translations checkpoint for crash recovery before Phase 2
        _save_translations_temp(translations, data_dir)

        logger.info(
            "Phase 1 complete: %d translated, %d failed",
            len(translations), len(translate_failed_ids),
        )

    # ================================================================
    # PHASE 2: English label distillation batch
    # ================================================================

    # Build distillation requests for successfully translated patients
    # Filter translations to only include pair_ids in record_lookup (handles crash
    # recovery where translations checkpoint may contain stale entries)
    translations = {pid: t for pid, t in translations.items() if pid in record_lookup}

    distill_requests: list[dict[str, Any]] = []
    for pair_id, patient_en in translations.items():
        patient_data = format_patient_prompt(patient_en, "en")
        system_text, user_text = split_prompt_for_caching(prompt_template_en, patient_data)

        distill_requests.append(build_batch_request(
            custom_id=pair_id,
            model=MODEL,
            system_text=system_text,
            user_content=user_text,
            max_tokens=MAX_TOKENS,
            temperature=TEMPERATURE,
        ))

    if not distill_requests:
        logger.warning("No translations succeeded — nothing to distill.")
        _clear_translations_temp(data_dir)
        return 0, len(record_lookup)

    logger.info("Phase 2: Submitting %d distillation requests", len(distill_requests))

    def validate_distill(custom_id: str, response_text: str) -> tuple[Any | None, str | None]:
        try:
            label = extract_json_object(response_text)
        except (json.JSONDecodeError, TypeError) as e:
            return None, f"JSON parse error: {str(e)[:200]}"

        patient_en = translations[custom_id]
        validation_errors = validate_label(label, patient_en, schema, "en")
        if validation_errors:
            return None, "; ".join(validation_errors[:5])
        return label, None

    def build_distill_retry(custom_id: str, response_text: str | None, error_msg: str) -> dict[str, Any]:
        patient_en = translations[custom_id]
        patient_data = format_patient_prompt(patient_en, "en")
        system_text, user_text = split_prompt_for_caching(prompt_template_en, patient_data)

        if response_text is None:
            return build_batch_request(
                custom_id=custom_id,
                model=MODEL,
                system_text=system_text,
                user_content=user_text,
                max_tokens=MAX_TOKENS,
                temperature=TEMPERATURE,
            )

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

    distill_outcome = run_batch_with_retries(
        client=client,
        requests=distill_requests,
        validate_fn=validate_distill,
        build_retry_fn=build_distill_retry,
        description="crosslingual_distill",
        max_rounds=MAX_RETRIES,
        checkpoint_name="crosslingual_distill",
        checkpoint_dir=data_dir,
    )

    # Assemble final aligned pairs
    records: list[dict] = []
    for pair_id, (label_en, _) in distill_outcome.succeeded.items():
        record = record_lookup[pair_id]
        records.append({
            "pair_id": pair_id,
            "fr": {
                "patient": record.get("patient", {}),
                "label": record.get("label", {}),
            },
            "en": {
                "patient": translations[pair_id],
                "label": label_en,
            },
        })

    if records:
        save_jsonl(records, str(output_path))

    for failure in distill_outcome.failures:
        _log_error(error_log_path, failure["custom_id"], f"Distillation failed: {failure.get('error')}")

    # Clean up
    _clear_translations_temp(data_dir)

    success = len(records)
    failed = len(translate_failed_ids) + len(distill_outcome.failures)

    logger.info("Phase 2 complete: %d aligned pairs, %d total failures", success, failed)

    return success, failed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    load_env()
    args = parse_args()

    data_dir = get_data_dir()
    labels_dir = data_dir / "labels"
    output_dir = data_dir / "aligned"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "cross_lingual_400.jsonl"
    error_log_path = data_dir / "crosslingual_errors.jsonl"

    # Load French labels
    fr_labels_path = labels_dir / "labels_fr.jsonl"
    if not fr_labels_path.exists():
        logger.error("French labels not found at %s", fr_labels_path)
        logger.error("Run distill_labels.py first to generate French labels.")
        sys.exit(1)

    all_fr_labels = load_jsonl(str(fr_labels_path))
    logger.info("Loaded %d French labels from %s", len(all_fr_labels), fr_labels_path)

    if len(all_fr_labels) < args.count:
        logger.warning(
            "Requested %d aligned pairs but only %d French labels available. "
            "Will use all available labels.",
            args.count, len(all_fr_labels),
        )

    # Select the best labels for alignment
    selected = select_best_labels(all_fr_labels, args.count)
    logger.info("Selected %d labels for cross-lingual alignment", len(selected))

    # Log selection stats
    orientations = Counter(r.get("label", {}).get("orientation") for r in selected)
    acuities = Counter(_patient_acuity(r) for r in selected)
    categories = Counter(r.get("category", "unknown") for r in selected)
    logger.info("Orientation distribution: %s", dict(orientations))
    logger.info("Acuity distribution: %s", dict(acuities))
    logger.info("Category distribution: %s", dict(categories))

    # Load schema and English prompt template
    schema = load_unified_schema()
    prompt_template_en = load_prompt_template("distill_unified_labels")

    # Dry run: show a translation prompt and exit
    if args.dry_run:
        record = selected[0]
        patient_json = json.dumps(record.get("patient", {}), ensure_ascii=False, indent=2)
        translate_prompt = TRANSLATE_PROMPT.replace("{patient_json}", patient_json)
        patient_data_en = format_patient_prompt(record.get("patient", {}), "en")
        label_prompt = prompt_template_en.replace("{PATIENT_DATA}", patient_data_en)

        print("=" * 80)
        print("DRY RUN — Cross-lingual Alignment")
        print(f"Selected {len(selected)} patients for alignment")
        print(f"SAUV cases: {orientations.get('SAUV', 0)}")
        print(f"Mode: {'realtime' if args.realtime else 'batch'}")
        print("=" * 80)
        print("\n--- STEP 1: Translation Prompt ---\n")
        print(translate_prompt[:2000])
        print("\n--- STEP 2: English Label Prompt ---\n")
        print(label_prompt[:2000])

        if not args.realtime:
            print("\n--- Batch request preview (translation) ---\n")
            from scripts.batch_utils import build_batch_request
            req = build_batch_request(
                custom_id="aligned_000",
                model=MODEL,
                system_text=TRANSLATE_SYSTEM_TEXT,
                user_content=_build_translate_user_content(record.get("patient", {})),
                max_tokens=MAX_TOKENS,
                temperature=0.2,
            )
            print(json.dumps(req, indent=2, ensure_ascii=False)[:3000])

        print("=" * 80)
        return

    # Resume: load existing pair IDs
    existing_pair_ids: set[str] = set()
    if args.resume and output_path.exists():
        existing_records = load_jsonl(str(output_path))
        existing_pair_ids = {r.get("pair_id") for r in existing_records if r.get("pair_id")}
        logger.info("Resume: found %d existing aligned pairs", len(existing_pair_ids))

    if args.realtime:
        # ---- Real-time mode (original behavior) ----
        max_concurrent = args.max_concurrent or int(os.getenv("MAX_CONCURRENT", "5"))
        semaphore = asyncio.Semaphore(max_concurrent)
        async_client = anthropic.AsyncAnthropic()

        # Build tasks (skip already-processed pairs when resuming)
        tasks: list[tuple[int, dict]] = []
        for idx, record in enumerate(selected):
            pair_id = f"aligned_{idx:03d}"
            if args.resume and pair_id in existing_pair_ids:
                continue
            tasks.append((idx, record))

        if not tasks:
            logger.info("All %d pairs already processed. Nothing to do.", len(selected))
            return

        logger.info(
            "Processing %d pairs (%d skipped from resume)",
            len(tasks), len(selected) - len(tasks),
        )

        # Process in batches
        batch_size = 10
        success = 0
        failed = 0
        pbar = tqdm(total=len(tasks), desc="cross-lingual", unit="pair")

        for batch_start in range(0, len(tasks), batch_size):
            batch = tasks[batch_start : batch_start + batch_size]
            coros = [
                process_aligned_pair(
                    async_client, record, idx, prompt_template_en, schema,
                    semaphore, error_log_path,
                )
                for idx, record in batch
            ]

            results = await asyncio.gather(*coros)

            batch_records: list[dict] = []
            for result in results:
                if result is not None:
                    batch_records.append(result)
                    success += 1
                else:
                    failed += 1

            if batch_records:
                save_jsonl(batch_records, str(output_path))

            pbar.update(len(batch))

        pbar.close()

        total_calls = success * 2 + failed
        est_input_tokens = total_calls * 1500
        est_output_tokens = total_calls * 500
        est_cost = (est_input_tokens * 3 + est_output_tokens * 15) / 1_000_000

    else:
        # ---- Batch mode (default — 50% cost savings) ----
        sync_client = get_anthropic_client()

        success, failed = run_crosslingual_batch(
            sync_client, selected, prompt_template_en, schema,
            existing_pair_ids, output_path, error_log_path, data_dir,
        )

        total_calls = success * 2 + failed
        est_input_tokens = total_calls * 1500
        est_output_tokens = total_calls * 500
        est_cost = (est_input_tokens * 1.5 + est_output_tokens * 7.5) / 1_000_000

    # Summary
    mode_label = "realtime" if args.realtime else "batch"
    print("\n" + "=" * 80)
    print(f"CROSS-LINGUAL ALIGNMENT SUMMARY [{mode_label}]")
    print("=" * 80)
    print(f"Selected patients:     {len(selected)}")
    print(f"Processed:             {len(selected) - len(existing_pair_ids)}")
    print(f"Success:               {success}")
    print(f"Failed:                {failed}")
    print(f"Output:                {output_path}")

    print(f"Estimated API calls:   {total_calls}")
    print(f"Estimated cost:        ~${est_cost:.2f} ({mode_label})")

    if failed > 0:
        print(f"\nErrors logged to: {error_log_path}")
        print("Re-run with --resume to retry failed pairs.")

    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
