"""Phase 1.6 — Dosage-focused training examples.

Generates 500 training examples where the distillation prompt emphasizes
correct posologies. Selects patients where dosage accuracy matters most:
ESI 1-2, sepsis/infectious, pediatric, and toxicology cases.

Supports two modes:
- **Batch mode** (default): Uses the Anthropic Message Batches API for ~50%
  cost savings.  Schema failures and dosage-insufficient results are merged
  into a single retry batch.
- **Real-time mode** (``--realtime``): Uses ``client.messages.create()`` with
  async concurrency — the original behavior.

Usage:
    python -m scripts.generate_dosage_examples
    python -m scripts.generate_dosage_examples --count 200
    python -m scripts.generate_dosage_examples --dry-run
    python -m scripts.generate_dosage_examples --resume
    python -m scripts.generate_dosage_examples --realtime
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
    load_patients_file,
    validate_label,
)

MODEL = "claude-sonnet-4-5-20250929"
MAX_TOKENS = 8192
MAX_RETRIES = 3

# Regex to detect dosage patterns: a number followed by a unit
DOSAGE_PATTERN = re.compile(r"\d+\s*(mg|g|UI|ml|mcg|L/min|mL|µg|mmol|mg/kg|UI/kg|mcg/kg)", re.IGNORECASE)

# Minimum number of interventions that should contain dosage info
MIN_DOSAGE_INTERVENTIONS = 3

# Categories where dosages are most critical
DOSAGE_CRITICAL_CATEGORIES = {
    "sepsis_infectious",  # antibiotics with dosages
    "pediatric",          # weight-adjusted dosing
    "toxicology_psychiatric",  # antidote dosages
    "cardiac",            # emergency cardiac drugs
    "metabolic_endocrine",  # insulin, electrolyte replacement
}

# Retry prompt when dosages are missing
DOSAGE_RETRY_INSTRUCTION = (
    "Le JSON precedent ne contient pas assez de posologies precises dans les "
    "interventions medicales. Pour chaque intervention medicale, inclure "
    "OBLIGATOIREMENT la posologie exacte avec:\n"
    "- La dose (ex: 1g, 500mg, 80 UI/kg)\n"
    "- La voie d'administration (IV, IM, PO, SC)\n"
    "- La frequence (ex: toutes les 8h)\n"
    "- L'adaptation pediatrique si applicable (ex: 15mg/kg)\n\n"
    "Reponds avec le JSON corrige uniquement."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Phase 1.6 — Dosage-focused training example generation"
    )
    parser.add_argument(
        "--count",
        type=int,
        default=500,
        help="Number of dosage-focused examples to generate (default: 500)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print one dosage prompt and exit without calling the API",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip patients that already have dosage labels in the output file",
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
# Selection: pick patients where dosage matters most
# ---------------------------------------------------------------------------


def _patient_esi(patient: dict) -> int | None:
    """Get ESI from patient profile."""
    return patient.get("expectedESI")


def _patient_category(patient: dict) -> str:
    """Get category from patient profile."""
    return patient.get("category", "unknown")


def _is_pediatric(patient: dict) -> bool:
    """Check if patient is pediatric (age < 18)."""
    age = patient.get("age")
    return isinstance(age, (int, float)) and age < 18


def select_dosage_patients(
    all_patients: list[dict],
    count: int,
) -> list[dict]:
    """Select patients where dosage accuracy matters most."""
    # Build priority pools
    esi_1_2: list[dict] = []
    sepsis: list[dict] = []
    pediatric: list[dict] = []
    toxicology: list[dict] = []
    metabolic: list[dict] = []
    cardiac: list[dict] = []
    other_high_acuity: list[dict] = []

    for patient in all_patients:
        esi = _patient_esi(patient)
        category = _patient_category(patient)
        is_peds = _is_pediatric(patient)

        if is_peds:
            pediatric.append(patient)
        if isinstance(esi, int) and esi <= 2:
            esi_1_2.append(patient)
        if category == "sepsis_infectious":
            sepsis.append(patient)
        if category == "toxicology_psychiatric":
            toxicology.append(patient)
        if category == "metabolic_endocrine":
            metabolic.append(patient)
        if category == "cardiac":
            cardiac.append(patient)
        if isinstance(esi, int) and esi <= 3 and category not in DOSAGE_CRITICAL_CATEGORIES:
            other_high_acuity.append(patient)

    selected_ids: set[str] = set()
    selected: list[dict] = []

    def _id(patient: dict) -> str:
        """Generate a stable ID for deduplication."""
        cc = patient.get("chiefComplaint", "")
        age = patient.get("age", 0)
        sex = patient.get("sex", "")
        return f"{cc}_{age}_{sex}"

    def _add(patient: dict) -> bool:
        pid = _id(patient)
        if pid in selected_ids:
            return False
        selected_ids.add(pid)
        selected.append(patient)
        return True

    # 1. Guarantee at least 100 pediatric patients
    min_peds = min(100, len(pediatric))
    for p in pediatric[:min_peds]:
        _add(p)

    # 2. Add ESI 1-2 patients (up to 150)
    added = 0
    for p in esi_1_2:
        if added >= 150:
            break
        if _add(p):
            added += 1

    # 3. Add sepsis cases (up to 80)
    added = 0
    for p in sepsis:
        if added >= 80:
            break
        if _add(p):
            added += 1

    # 4. Add toxicology cases (up to 60)
    added = 0
    for p in toxicology:
        if added >= 60:
            break
        if _add(p):
            added += 1

    # 5. Add cardiac cases (up to 50)
    added = 0
    for p in cardiac:
        if added >= 50:
            break
        if _add(p):
            added += 1

    # 6. Add metabolic cases (up to 40)
    added = 0
    for p in metabolic:
        if added >= 40:
            break
        if _add(p):
            added += 1

    # 7. Fill remaining from other high-acuity
    for p in other_high_acuity:
        if len(selected) >= count:
            break
        _add(p)

    # 8. If still short, add from remaining pediatric
    for p in pediatric:
        if len(selected) >= count:
            break
        _add(p)

    return selected[:count]


# ---------------------------------------------------------------------------
# Dosage validation
# ---------------------------------------------------------------------------


def count_dosage_interventions(label: dict) -> int:
    """Count how many medical interventions contain dosage patterns."""
    interventions = label.get("medicalInterventions", [])
    count = 0
    for intervention in interventions:
        if isinstance(intervention, str) and DOSAGE_PATTERN.search(intervention):
            count += 1
    return count


# ---------------------------------------------------------------------------
# Real-time mode: distill with dosage emphasis + dosage validation
# ---------------------------------------------------------------------------


async def process_dosage_patient(
    client: anthropic.AsyncAnthropic,
    patient: dict,
    patient_id: str,
    prompt_template: str,
    schema: dict,
    language: str,
    semaphore: asyncio.Semaphore,
    error_log_path: Path,
) -> dict | None:
    """Process one patient: distill label with dosage emphasis + validate dosages."""
    async with semaphore:
        # Step 1: distill label using dosage-focused template
        label, retries, error = await distill_label(
            client, patient, prompt_template, schema, language, patient_id,
        )

    if label is None:
        _log_error(error_log_path, patient_id, f"Distillation failed: {error}")
        return None

    # Step 2: Check dosage coverage
    dosage_count = count_dosage_interventions(label)
    if dosage_count < MIN_DOSAGE_INTERVENTIONS:
        logger.warning(
            "[%s] Only %d/%d interventions have dosages, requesting retry",
            patient_id, dosage_count, MIN_DOSAGE_INTERVENTIONS,
        )
        # Retry with explicit dosage instruction
        async with semaphore:
            label_retry = await _retry_for_dosages(
                client, patient, label, prompt_template, schema, language, patient_id,
            )
        if label_retry is not None:
            retry_count = count_dosage_interventions(label_retry)
            if retry_count >= dosage_count:
                label = label_retry
                dosage_count = retry_count

    return {
        "patient_id": patient_id,
        "patient": patient,
        "label": label,
        "dosage_mode": True,
        "dosage_interventions_count": dosage_count,
    }


async def _retry_for_dosages(
    client: anthropic.AsyncAnthropic,
    patient: dict,
    previous_label: dict,
    prompt_template: str,
    schema: dict,
    language: str,
    patient_id: str,
) -> dict | None:
    """Retry label generation with explicit dosage instructions."""
    patient_data = format_patient_prompt(patient, language)
    original_prompt = prompt_template.replace("{PATIENT_DATA}", patient_data)
    previous_json = json.dumps(previous_label, ensure_ascii=False, indent=2)

    messages: list[dict[str, str]] = [
        {"role": "user", "content": original_prompt},
        {"role": "assistant", "content": previous_json},
        {"role": "user", "content": DOSAGE_RETRY_INSTRUCTION},
    ]

    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            temperature=0.3,
            messages=messages,
        )
        text = response.content[0].text

        try:
            label = extract_json_object(text)
        except (json.JSONDecodeError, TypeError):
            return None

        validation_errors = validate_label(label, patient, schema, language)
        if validation_errors:
            return None

        return label

    except (anthropic.RateLimitError, anthropic.APIConnectionError,
            anthropic.APITimeoutError, anthropic.APIStatusError) as e:
        logger.warning("[%s] Dosage retry failed: %s", patient_id, type(e).__name__)
        return None


def _log_error(error_log_path: Path, patient_id: str, message: str) -> None:
    """Append an error to the error log."""
    error_log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "patient_id": patient_id,
        "error": message,
    }
    with open(error_log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# Patient loading from profile files
# ---------------------------------------------------------------------------


def load_all_patients(patients_dir: Path) -> list[dict]:
    """Load all patient profiles from the patients directory."""
    all_patients: list[dict] = []
    if not patients_dir.exists():
        return all_patients

    for filepath in sorted(patients_dir.glob("patients_*.jsonl")):
        patients = load_patients_file(filepath)
        if patients:
            # Tag each patient with the source file's category/language
            stem = filepath.stem  # e.g. "patients_cardiac_fr"
            parts = stem.split("_", 1)
            if len(parts) >= 2:
                remainder = parts[1]
                last_underscore = remainder.rfind("_")
                if last_underscore != -1:
                    cat_id = remainder[:last_underscore]
                    lang = remainder[last_underscore + 1:]
                    for p in patients:
                        p.setdefault("category", cat_id)
                        p.setdefault("_language", lang)

            all_patients.extend(patients)

    return all_patients


# ---------------------------------------------------------------------------
# Batch mode helpers
# ---------------------------------------------------------------------------


def run_dosage_batch(
    client: anthropic.Anthropic,
    selected: list[dict],
    prompt_template: str,
    schema: dict,
    existing_patient_ids: set[str],
    output_path: Path,
    error_log_path: Path,
    data_dir: Path,
) -> tuple[int, int, int]:
    """Run dosage-focused distillation via batch API with dosage-aware retries.

    The retry logic merges two kinds of failures into a single retry batch:
    - Schema/validation failures -> standard retry (3-message with error feedback)
    - Dosage-insufficient -> dosage retry (3-message with DOSAGE_RETRY_INSTRUCTION)

    Returns:
        (success, failed, total_dosage_hits)
    """
    from scripts.batch_utils import (
        BatchOutcome,
        build_batch_request,
        build_retry_batch_request,
        collect_results,
        poll_batch,
        save_batch_checkpoint,
        load_batch_checkpoint,
        clear_batch_checkpoint,
        split_prompt_for_caching,
        submit_batch,
    )

    # Build initial batch requests
    patient_lookup: dict[str, tuple[dict, str]] = {}  # patient_id -> (patient, language)
    batch_requests: list[dict[str, Any]] = []

    for idx, patient in enumerate(selected):
        category = patient.get("category", "unknown")
        language = patient.get("_language", "fr")
        patient_id = f"dosage_{category}_{language}_{idx:03d}"

        if patient_id in existing_patient_ids:
            continue

        patient_lookup[patient_id] = (patient, language)
        patient_data = format_patient_prompt(patient, language)
        system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)

        batch_requests.append(build_batch_request(
            custom_id=patient_id,
            model=MODEL,
            system_text=system_text,
            user_content=user_text,
            max_tokens=MAX_TOKENS,
            temperature=0.3,
        ))

    if not batch_requests:
        logger.info("All patients already processed. Nothing to do.")
        return 0, 0, 0

    logger.info("Submitting %d dosage requests via batch API", len(batch_requests))

    # ---- Phase 1: Initial batch ----
    ckpt = load_batch_checkpoint("dosage_r0", data_dir)
    if ckpt:
        batch_id = ckpt["batch_id"]
        logger.info("Resuming from checkpoint: batch %s", batch_id[:12])
    else:
        batch_id = submit_batch(client, batch_requests, "dosage round 0")
        id_map = {r["custom_id"]: True for r in batch_requests}
        save_batch_checkpoint(batch_id, 0, id_map, "dosage_r0", data_dir)

    poll_batch(client, batch_id)
    results = collect_results(client, batch_id)
    clear_batch_checkpoint("dosage_r0", data_dir)

    # Triage results: validate schema + check dosage counts
    succeeded: dict[str, tuple[dict, int]] = {}  # patient_id -> (label, dosage_count)
    schema_retry: list[str] = []  # patient_ids needing schema retry
    dosage_retry: list[str] = []  # patient_ids needing dosage retry
    schema_retry_data: dict[str, tuple[str | None, str]] = {}  # pid -> (response_text, error)
    dosage_retry_labels: dict[str, dict] = {}  # pid -> parsed label (needs more dosages)
    final_failures: list[dict[str, Any]] = []

    for req in batch_requests:
        pid = req["custom_id"]
        result = results.get(pid)

        if result is None or result.status != "succeeded":
            error_msg = result.error if result else "no result returned"
            schema_retry.append(pid)
            schema_retry_data[pid] = (None, error_msg)
            continue

        # Try parsing
        try:
            label = extract_json_object(result.response_text)
        except (json.JSONDecodeError, TypeError) as e:
            schema_retry.append(pid)
            schema_retry_data[pid] = (result.response_text, f"JSON parse error: {str(e)[:200]}")
            continue

        # Validate
        patient, language = patient_lookup[pid]
        validation_errors = validate_label(label, patient, schema, language)
        if validation_errors:
            schema_retry.append(pid)
            schema_retry_data[pid] = (result.response_text, "; ".join(validation_errors[:5]))
            continue

        # Check dosage count
        dosage_count = count_dosage_interventions(label)
        if dosage_count < MIN_DOSAGE_INTERVENTIONS:
            dosage_retry.append(pid)
            dosage_retry_labels[pid] = label
        else:
            succeeded[pid] = (label, dosage_count)

    logger.info(
        "Phase 1: succeeded=%d, schema_retry=%d, dosage_retry=%d",
        len(succeeded), len(schema_retry), len(dosage_retry),
    )

    # ---- Phase 2: Merged retry batch (schema failures + dosage-insufficient) ----
    retry_requests: list[dict[str, Any]] = []

    for pid in schema_retry:
        patient, language = patient_lookup[pid]
        patient_data = format_patient_prompt(patient, language)
        system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)
        response_text, error_msg = schema_retry_data[pid]

        if response_text is None:
            # API-level failure — resend original
            retry_requests.append(build_batch_request(
                custom_id=pid,
                model=MODEL,
                system_text=system_text,
                user_content=user_text,
                max_tokens=MAX_TOKENS,
                temperature=0.3,
            ))
        else:
            if (error_msg or "").startswith("JSON parse error"):
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
            retry_requests.append(build_retry_batch_request(
                custom_id=pid,
                model=MODEL,
                system_text=system_text,
                original_user_content=user_text,
                bad_response=response_text,
                fix_instruction=fix_instruction,
                max_tokens=MAX_TOKENS,
                temperature=0.3,
            ))

    for pid in dosage_retry:
        patient, language = patient_lookup[pid]
        patient_data = format_patient_prompt(patient, language)
        system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)
        previous_label = dosage_retry_labels[pid]
        previous_json = json.dumps(previous_label, ensure_ascii=False, indent=2)

        retry_requests.append(build_retry_batch_request(
            custom_id=pid,
            model=MODEL,
            system_text=system_text,
            original_user_content=user_text,
            bad_response=previous_json,
            fix_instruction=DOSAGE_RETRY_INSTRUCTION,
            max_tokens=MAX_TOKENS,
            temperature=0.3,
        ))

    if retry_requests:
        logger.info("Phase 2: submitting %d retry requests", len(retry_requests))

        ckpt = load_batch_checkpoint("dosage_r1", data_dir)
        if ckpt:
            batch_id_r1 = ckpt["batch_id"]
        else:
            batch_id_r1 = submit_batch(client, retry_requests, "dosage round 1")
            id_map = {r["custom_id"]: True for r in retry_requests}
            save_batch_checkpoint(batch_id_r1, 1, id_map, "dosage_r1", data_dir)

        poll_batch(client, batch_id_r1)
        retry_results = collect_results(client, batch_id_r1)
        clear_batch_checkpoint("dosage_r1", data_dir)

        for req in retry_requests:
            pid = req["custom_id"]
            result = retry_results.get(pid)

            if result is None or result.status != "succeeded":
                # For dosage retries that failed at API level, keep original label if we have one
                if pid in dosage_retry_labels:
                    original_label = dosage_retry_labels[pid]
                    dosage_count = count_dosage_interventions(original_label)
                    succeeded[pid] = (original_label, dosage_count)
                else:
                    final_failures.append({
                        "custom_id": pid,
                        "error": result.error if result else "no result",
                        "last_response": None,
                    })
                continue

            try:
                label = extract_json_object(result.response_text)
            except (json.JSONDecodeError, TypeError) as e:
                if pid in dosage_retry_labels:
                    original_label = dosage_retry_labels[pid]
                    dosage_count = count_dosage_interventions(original_label)
                    succeeded[pid] = (original_label, dosage_count)
                else:
                    final_failures.append({
                        "custom_id": pid,
                        "error": f"JSON parse error on retry: {str(e)[:200]}",
                        "last_response": (result.response_text or "")[:500],
                    })
                continue

            patient, language = patient_lookup[pid]
            validation_errors = validate_label(label, patient, schema, language)
            if validation_errors:
                if pid in dosage_retry_labels:
                    original_label = dosage_retry_labels[pid]
                    dosage_count = count_dosage_interventions(original_label)
                    succeeded[pid] = (original_label, dosage_count)
                else:
                    final_failures.append({
                        "custom_id": pid,
                        "error": "; ".join(validation_errors[:5]),
                        "last_response": (result.response_text or "")[:500],
                    })
                continue

            dosage_count = count_dosage_interventions(label)

            # For dosage retries, only use new label if it has more dosages
            if pid in dosage_retry_labels:
                original_count = count_dosage_interventions(dosage_retry_labels[pid])
                if dosage_count >= original_count:
                    succeeded[pid] = (label, dosage_count)
                else:
                    succeeded[pid] = (dosage_retry_labels[pid], original_count)
            else:
                succeeded[pid] = (label, dosage_count)

    # Dosage retry patients that we didn't retry (shouldn't happen) or weren't retried
    for pid in dosage_retry:
        if pid not in succeeded:
            succeeded[pid] = (dosage_retry_labels[pid], count_dosage_interventions(dosage_retry_labels[pid]))

    # Write output
    records: list[dict] = []
    total_dosage_hits = 0
    for pid, (label, dosage_count) in succeeded.items():
        patient, _ = patient_lookup[pid]
        records.append({
            "patient_id": pid,
            "patient": patient,
            "label": label,
            "dosage_mode": True,
            "dosage_interventions_count": dosage_count,
        })
        total_dosage_hits += dosage_count

    if records:
        save_jsonl(records, str(output_path))

    for failure in final_failures:
        _log_error(error_log_path, failure["custom_id"], failure.get("error", "unknown"))

    return len(succeeded), len(final_failures), total_dosage_hits


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    load_env()
    args = parse_args()

    data_dir = get_data_dir()
    patients_dir = data_dir / "patients"
    output_dir = data_dir / "augmented"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "dosage_focused_500.jsonl"
    error_log_path = data_dir / "dosage_errors.jsonl"

    # Load all patient profiles
    all_patients = load_all_patients(patients_dir)
    if not all_patients:
        logger.error("No patient files found in %s. Run generate_patients.py first.", patients_dir)
        sys.exit(1)

    logger.info("Loaded %d patient profiles from %s", len(all_patients), patients_dir)

    # Select dosage-critical patients
    selected = select_dosage_patients(all_patients, args.count)
    logger.info("Selected %d patients for dosage-focused examples", len(selected))

    # Log selection stats
    categories = Counter(p.get("category", "unknown") for p in selected)
    esi_dist = Counter(p.get("expectedESI") for p in selected)
    peds_count = sum(1 for p in selected if _is_pediatric(p))
    logger.info("Category distribution: %s", dict(categories))
    logger.info("ESI distribution: %s", dict(esi_dist))
    logger.info("Pediatric patients: %d", peds_count)

    # Load schema and dosage prompt template
    schema = load_unified_schema()
    prompt_template = load_prompt_template("distill_dosage_labels")

    # Dry run
    if args.dry_run:
        patient = selected[0]
        language = patient.get("_language", "fr")
        patient_data = format_patient_prompt(patient, language)
        filled = prompt_template.replace("{PATIENT_DATA}", patient_data)

        print("=" * 80)
        print("DRY RUN — Dosage-Focused Examples")
        print(f"Selected {len(selected)} patients")
        print(f"Pediatric: {peds_count}")
        print(f"Categories: {dict(categories)}")
        print(f"Mode: {'realtime' if args.realtime else 'batch'}")
        print("=" * 80)
        print(f"\n--- Dosage Prompt (patient: {patient.get('chiefComplaint', 'N/A')}) ---\n")
        print(filled)

        if not args.realtime:
            print("\n--- Batch request preview ---\n")
            from scripts.batch_utils import build_batch_request, split_prompt_for_caching
            system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)
            req = build_batch_request(
                custom_id="dosage_test_fr_000",
                model=MODEL,
                system_text=system_text,
                user_content=user_text,
                max_tokens=MAX_TOKENS,
                temperature=0.3,
            )
            print(json.dumps(req, indent=2, ensure_ascii=False)[:3000])

        print("=" * 80)
        return

    # Resume: load existing patient IDs
    existing_patient_ids: set[str] = set()
    if args.resume and output_path.exists():
        existing_records = load_jsonl(str(output_path))
        existing_patient_ids = {
            r.get("patient_id") for r in existing_records if r.get("patient_id")
        }
        logger.info("Resume: found %d existing dosage examples", len(existing_patient_ids))

    if args.realtime:
        # ---- Real-time mode (original behavior) ----
        max_concurrent = args.max_concurrent or int(os.getenv("MAX_CONCURRENT", "5"))
        semaphore = asyncio.Semaphore(max_concurrent)
        client = anthropic.AsyncAnthropic()

        # Build tasks with stable IDs
        tasks: list[tuple[str, dict, str]] = []
        for idx, patient in enumerate(selected):
            category = patient.get("category", "unknown")
            language = patient.get("_language", "fr")
            patient_id = f"dosage_{category}_{language}_{idx:03d}"

            if args.resume and patient_id in existing_patient_ids:
                continue
            tasks.append((patient_id, patient, language))

        if not tasks:
            logger.info("All patients already processed. Nothing to do.")
            return

        logger.info(
            "Processing %d patients (%d skipped from resume)",
            len(tasks), len(selected) - len(tasks),
        )

        # Process in batches
        batch_size = 10
        success = 0
        failed = 0
        total_dosage_hits = 0
        pbar = tqdm(total=len(tasks), desc="dosage", unit="pt")

        for batch_start in range(0, len(tasks), batch_size):
            batch = tasks[batch_start : batch_start + batch_size]
            coros = [
                process_dosage_patient(
                    client, patient, patient_id, prompt_template, schema,
                    language, semaphore, error_log_path,
                )
                for patient_id, patient, language in batch
            ]

            results = await asyncio.gather(*coros)

            batch_records: list[dict] = []
            for result in results:
                if result is not None:
                    batch_records.append(result)
                    success += 1
                    total_dosage_hits += result.get("dosage_interventions_count", 0)
                else:
                    failed += 1

            if batch_records:
                save_jsonl(batch_records, str(output_path))

            pbar.update(len(batch))

        pbar.close()

        total_calls = int(success * 1.5) + failed
        est_input_tokens = total_calls * 1800
        est_output_tokens = total_calls * 600
        est_cost = (est_input_tokens * 3 + est_output_tokens * 15) / 1_000_000

    else:
        # ---- Batch mode (default — 50% cost savings) ----
        sync_client = get_anthropic_client()

        success, failed, total_dosage_hits = run_dosage_batch(
            sync_client, selected, prompt_template, schema,
            existing_patient_ids, output_path, error_log_path, data_dir,
        )

        total_calls = int(success * 1.5) + failed
        est_input_tokens = total_calls * 1800
        est_output_tokens = total_calls * 600
        est_cost = (est_input_tokens * 1.5 + est_output_tokens * 7.5) / 1_000_000

    # Summary
    mode_label = "realtime" if args.realtime else "batch"
    avg_dosage = total_dosage_hits / max(success, 1)
    print("\n" + "=" * 80)
    print(f"DOSAGE-FOCUSED EXAMPLES SUMMARY [{mode_label}]")
    print("=" * 80)
    print(f"Selected patients:         {len(selected)}")
    print(f"Processed:                 {len(selected) - len(existing_patient_ids)}")
    print(f"Success:                   {success}")
    print(f"Failed:                    {failed}")
    print(f"Avg dosage interventions:  {avg_dosage:.1f}")
    print(f"Output:                    {output_path}")

    print(f"Estimated API calls:       {total_calls}")
    print(f"Estimated cost:            ~${est_cost:.2f} ({mode_label})")

    if failed > 0:
        print(f"\nErrors logged to: {error_log_path}")
        print("Re-run with --resume to retry failed patients.")

    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
