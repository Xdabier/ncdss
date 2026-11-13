"""Variation augmentation: multiple valid responses per patient.

Generates 3 different labels for each selected patient using different
temperatures and prompt suffixes, teaching the model that different phrasings
and orderings are acceptable for the same clinical scenario.

Supports two modes:
- **Batch mode** (default): Submits all ~1,500 requests (500 patients x 3
  variations) as a single Anthropic batch for ~50% cost savings.
- **Real-time mode** (``--realtime``): Uses ``client.messages.create()`` with
  async concurrency - the original behavior.

Usage:
    python -m scripts.augment_variations
    python -m scripts.augment_variations --count 200
    python -m scripts.augment_variations --dry-run
    python -m scripts.augment_variations --resume
    python -m scripts.augment_variations --realtime
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
    extract_json_object,
    format_patient_prompt,
    validate_label,
)

MODEL = "claude-sonnet-4-5-20250929"
MAX_TOKENS = 8192
MAX_RETRIES = 3
VALID_ORIENTATIONS = {"SAUV", "DECHOCAGE", "MEDICAL", "SURGICAL", "TRAUMA", "PEDIATRIC"}

# Three variations: different temperature + prompt suffix
VARIATIONS = [
    {
        "variation": 1,
        "temperature": 0.3,
        "suffix": "",  # standard prompt (same as distill_labels.py)
    },
    {
        "variation": 2,
        "temperature": 0.5,
        "suffix": "\n\nPropose des interventions alternatives quand possible.",
    },
    {
        "variation": 3,
        "temperature": 0.7,
        "suffix": "\n\nUtilise un raisonnement clinique detaille pour chaque pathologie.",
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Variation augmentation (multiple labels per patient)"
    )
    parser.add_argument(
        "--count",
        type=int,
        default=500,
        help="Number of patients to generate variations for (default: 500)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print variation prompts for one patient and exit",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip patients that already have variations in the output file",
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
# Selection: pick 500 high-acuity patients
# ---------------------------------------------------------------------------


def _patient_acuity(record: dict) -> str:
    """Classify by urgency from label pathologies."""
    pathologies = record.get("label", {}).get("pathologies", [])
    urgencies = [p.get("urgency") for p in pathologies if isinstance(p, dict)]
    if "emergent" in urgencies:
        return "emergent"
    if "urgent" in urgencies:
        return "urgent"
    return "routine"


def _patient_esi(record: dict) -> int | None:
    """Get ESI from the patient profile."""
    return record.get("patient", {}).get("expectedESI")


def select_high_acuity_patients(
    labels: list[dict],
    count: int,
) -> list[dict]:
    """Select high-acuity patients (ESI 1-3) with balanced distribution."""
    # Filter to high-acuity patients (ESI 1-3 or emergent/urgent urgency)
    high_acuity: list[dict] = []
    for record in labels:
        esi = _patient_esi(record)
        acuity = _patient_acuity(record)
        if (isinstance(esi, int) and esi <= 3) or acuity in ("emergent", "urgent"):
            high_acuity.append(record)

    # Sort by quality: fewest retries first
    high_acuity.sort(key=lambda r: r.get("retries", 0))

    if len(high_acuity) < count:
        logger.warning(
            "Only %d high-acuity patients available (requested %d). "
            "Will include some lower-acuity patients.",
            len(high_acuity), count,
        )
        ha_ids = {r.get("patient_id") for r in high_acuity}
        remaining = [r for r in labels if r.get("patient_id") not in ha_ids]
        remaining.sort(key=lambda r: r.get("retries", 0))
        high_acuity.extend(remaining)

    selected_ids: set[str] = set()
    selected: list[dict] = []

    def _add(record: dict) -> bool:
        pid = record.get("patient_id", "")
        if pid in selected_ids:
            return False
        selected_ids.add(pid)
        selected.append(record)
        return True

    # Guarantee mix of SAUV and non-SAUV
    sauv_records = [r for r in high_acuity if r.get("label", {}).get("orientation") == "SAUV"]

    # Add at least 30% SAUV
    min_sauv = min(count * 3 // 10, len(sauv_records))
    for r in sauv_records[:min_sauv]:
        _add(r)

    # Balance across categories via round-robin
    category_pools: dict[str, list[dict]] = {}
    for record in high_acuity:
        cat = record.get("category", "unknown")
        category_pools.setdefault(cat, []).append(record)

    cats = sorted(category_pools.keys())
    cat_indices: dict[str, int] = {c: 0 for c in cats}

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
# Real-time mode: generate one variation label
# ---------------------------------------------------------------------------


async def generate_variation(
    client: anthropic.AsyncAnthropic,
    patient: dict,
    prompt_template: str,
    schema: dict,
    language: str,
    patient_id: str,
    variation_config: dict,
) -> dict | None:
    """Generate a single variation label for a patient (real-time mode)."""
    temperature = variation_config["temperature"]
    suffix = variation_config["suffix"]
    variation_num = variation_config["variation"]

    patient_data = format_patient_prompt(patient, language)
    filled_prompt = prompt_template.replace("{PATIENT_DATA}", patient_data) + suffix

    messages: list[dict[str, str]] = [{"role": "user", "content": filled_prompt}]
    last_error: str | None = None

    for attempt in range(MAX_RETRIES):
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                temperature=temperature,
                messages=messages,
            )
            text = response.content[0].text

            try:
                label = extract_json_object(text)
            except (json.JSONDecodeError, TypeError) as e:
                last_error = f"JSON parse error: {str(e)[:200]}"
                if attempt < MAX_RETRIES - 1:
                    logger.warning(
                        "[%s/v%d] JSON parse failed (attempt %d): %s",
                        patient_id, variation_num, attempt + 1, last_error,
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
                return None

            # Validate
            validation_errors = validate_label(label, patient, schema, language)
            if not validation_errors:
                return label

            last_error = "; ".join(validation_errors[:5])
            if attempt < MAX_RETRIES - 1:
                logger.warning(
                    "[%s/v%d] Validation failed (attempt %d): %s",
                    patient_id, variation_num, attempt + 1, last_error,
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

            return None

        except anthropic.RateLimitError:
            backoff = 2 ** (2 * attempt + 1)
            logger.warning(
                "[%s/v%d] Rate limited, retrying in %ds",
                patient_id, variation_num, backoff,
            )
            await asyncio.sleep(backoff)

        except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            backoff = 2 ** (2 * attempt + 1)
            logger.warning(
                "[%s/v%d] Network error (%s), retrying in %ds",
                patient_id, variation_num, type(e).__name__, backoff,
            )
            await asyncio.sleep(backoff)

        except anthropic.APIStatusError as e:
            backoff = 2 ** (2 * attempt + 1)
            logger.error(
                "[%s/v%d] API error %d, retrying in %ds",
                patient_id, variation_num, e.status_code, backoff,
            )
            await asyncio.sleep(backoff)

    return None


# ---------------------------------------------------------------------------
# Real-time mode: process one patient (all 3 variations)
# ---------------------------------------------------------------------------


async def process_patient_variations(
    client: anthropic.AsyncAnthropic,
    record: dict,
    prompt_template: str,
    schema: dict,
    semaphore: asyncio.Semaphore,
    error_log_path: Path,
) -> dict | None:
    """Generate 3 variation labels for one patient (real-time mode)."""
    patient_id = record.get("patient_id", "unknown")
    patient = record.get("patient", {})
    language = record.get("language", "fr")

    labels: list[dict] = []

    async with semaphore:
        for var_config in VARIATIONS:
            label = await generate_variation(
                client, patient, prompt_template, schema,
                language, patient_id, var_config,
            )
            if label is not None:
                labels.append({
                    "label": label,
                    "variation": var_config["variation"],
                    "temperature": var_config["temperature"],
                })

    if not labels:
        _log_error(error_log_path, patient_id, "All 3 variations failed")
        return None

    if len(labels) < 3:
        logger.warning(
            "[%s] Only %d/3 variations succeeded", patient_id, len(labels),
        )

    return {
        "patient_id": patient_id,
        "patient": patient,
        "labels": labels,
    }


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
# Batch mode helpers
# ---------------------------------------------------------------------------


def _variation_custom_id(patient_id: str, variation_num: int) -> str:
    """Build a batch custom_id: ``{patient_id}__v{num}``."""
    return f"{patient_id}__v{variation_num}"


def _parse_variation_custom_id(custom_id: str) -> tuple[str, int]:
    """Parse ``{patient_id}__v{num}`` back into components."""
    parts = custom_id.rsplit("__v", 1)
    if len(parts) != 2:
        raise ValueError(f"Malformed variation custom_id: {custom_id!r}")
    try:
        return parts[0], int(parts[1])
    except ValueError:
        raise ValueError(f"Malformed variation number in custom_id: {custom_id!r}")


def build_variation_batch_requests(
    selected: list[dict],
    prompt_template: str,
    existing_patient_ids: set[str],
) -> tuple[list[dict[str, Any]], dict[str, dict]]:
    """Build all batch requests for variation augmentation.

    Returns:
        (requests, patient_lookup) where patient_lookup maps patient_id -> record.
    """
    from scripts.batch_utils import build_batch_request, split_prompt_for_caching

    requests: list[dict[str, Any]] = []
    patient_lookup: dict[str, dict] = {}

    for record in selected:
        patient_id = record.get("patient_id", "unknown")
        if patient_id in existing_patient_ids:
            continue

        patient = record.get("patient", {})
        language = record.get("language", "fr")
        patient_lookup[patient_id] = record

        patient_data = format_patient_prompt(patient, language)

        for var_config in VARIATIONS:
            var_num = var_config["variation"]
            suffix = var_config["suffix"]
            temperature = var_config["temperature"]

            system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)
            if suffix:
                user_text = user_text + suffix

            cid = _variation_custom_id(patient_id, var_num)
            requests.append(build_batch_request(
                custom_id=cid,
                model=MODEL,
                system_text=system_text,
                user_content=user_text,
                max_tokens=MAX_TOKENS,
                temperature=temperature,
            ))

    return requests, patient_lookup


def run_variations_batch(
    client: anthropic.Anthropic,
    selected: list[dict],
    prompt_template: str,
    schema: dict,
    existing_patient_ids: set[str],
    output_path: Path,
    error_log_path: Path,
    data_dir: Path,
) -> tuple[int, int, int]:
    """Run all variation requests via batch API.

    Returns:
        (success_patients, failed_patients, total_variations)
    """
    from scripts.batch_utils import (
        build_batch_request,
        build_retry_batch_request,
        run_batch_with_retries,
        split_prompt_for_caching,
    )

    requests, patient_lookup = build_variation_batch_requests(
        selected, prompt_template, existing_patient_ids,
    )

    if not requests:
        logger.info("All patients already processed. Nothing to do.")
        return 0, 0, 0

    logger.info("Submitting %d variation requests via batch API", len(requests))

    # Validation callback
    def validate_fn(custom_id: str, response_text: str) -> tuple[Any | None, str | None]:
        patient_id, var_num = _parse_variation_custom_id(custom_id)
        record = patient_lookup.get(patient_id)
        if not record:
            return None, f"Unknown patient_id: {patient_id}"

        try:
            label = extract_json_object(response_text)
        except (json.JSONDecodeError, TypeError) as e:
            return None, f"JSON parse error: {str(e)[:200]}"

        patient = record.get("patient", {})
        language = record.get("language", "fr")
        validation_errors = validate_label(label, patient, schema, language)
        if validation_errors:
            return None, "; ".join(validation_errors[:5])
        return label, None

    # Retry builder callback
    def build_retry_fn(custom_id: str, response_text: str | None, error_msg: str) -> dict[str, Any]:
        patient_id, var_num = _parse_variation_custom_id(custom_id)
        record = patient_lookup.get(patient_id, {})
        patient = record.get("patient", {})
        language = record.get("language", "fr")
        patient_data = format_patient_prompt(patient, language)

        var_config = VARIATIONS[var_num - 1]  # 1-indexed
        suffix = var_config["suffix"]
        temperature = var_config["temperature"]

        system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)
        if suffix:
            user_text = user_text + suffix

        if response_text is None:
            return build_batch_request(
                custom_id=custom_id,
                model=MODEL,
                system_text=system_text,
                user_content=user_text,
                max_tokens=MAX_TOKENS,
                temperature=temperature,
            )

        try:
            extract_json_object(response_text)
            fix_instruction = (
                f"The previous response had validation errors:\n{error_msg}\n\n"
                "Please fix and respond with valid JSON only."
            )
        except (json.JSONDecodeError, TypeError):
            fix_instruction = (
                "The previous response could not be parsed as JSON. "
                "Please respond with ONLY a valid JSON object, "
                "no markdown, no extra text."
            )

        return build_retry_batch_request(
            custom_id=custom_id,
            model=MODEL,
            system_text=system_text,
            original_user_content=user_text,
            bad_response=response_text,
            fix_instruction=fix_instruction,
            max_tokens=MAX_TOKENS,
            temperature=temperature,
        )

    # Run batch with retries
    outcome = run_batch_with_retries(
        client=client,
        requests=requests,
        validate_fn=validate_fn,
        build_retry_fn=build_retry_fn,
        description="variations",
        max_rounds=MAX_RETRIES,
        checkpoint_name="variations",
        checkpoint_dir=data_dir,
    )

    # Group results by patient_id
    patient_labels: dict[str, list[dict]] = {}
    for cid, (label, rounds_used) in outcome.succeeded.items():
        patient_id, var_num = _parse_variation_custom_id(cid)
        var_config = VARIATIONS[var_num - 1]
        patient_labels.setdefault(patient_id, []).append({
            "label": label,
            "variation": var_num,
            "temperature": var_config["temperature"],
        })

    # Write output records
    records: list[dict] = []
    for patient_id, labels in patient_labels.items():
        record = patient_lookup.get(patient_id, {})
        records.append({
            "patient_id": patient_id,
            "patient": record.get("patient", {}),
            "labels": labels,
        })

    if records:
        save_jsonl(records, str(output_path))

    # Log failures grouped by patient
    failed_by_patient: dict[str, list[str]] = {}
    for failure in outcome.failures:
        patient_id, var_num = _parse_variation_custom_id(failure["custom_id"])
        failed_by_patient.setdefault(patient_id, []).append(
            f"v{var_num}: {failure.get('error', 'unknown')}"
        )

    for patient_id, errors in failed_by_patient.items():
        _log_error(error_log_path, patient_id, "; ".join(errors))

    # Count patients where all variations failed (not in patient_labels at all)
    all_patient_ids = set(patient_lookup.keys()) - existing_patient_ids
    patients_with_results = set(patient_labels.keys())
    patients_all_failed = all_patient_ids - patients_with_results

    total_variations = sum(len(lbls) for lbls in patient_labels.values())

    return len(patients_with_results), len(patients_all_failed), total_variations


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main() -> None:
    load_env()
    args = parse_args()

    data_dir = get_data_dir()
    labels_dir = data_dir / "labels"
    output_dir = data_dir / "augmented"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "variations_500.jsonl"
    error_log_path = data_dir / "variations_errors.jsonl"

    # Load all labels (French + English)
    all_labels: list[dict] = []
    for lang in ("fr", "en"):
        labels_path = labels_dir / f"labels_{lang}.jsonl"
        if labels_path.exists():
            lang_labels = load_jsonl(str(labels_path))
            logger.info("Loaded %d %s labels from %s", len(lang_labels), lang, labels_path)
            all_labels.extend(lang_labels)

    if not all_labels:
        logger.error("No labels found in %s. Run distill_labels.py first.", labels_dir)
        sys.exit(1)

    logger.info("Total labels loaded: %d", len(all_labels))

    # Select high-acuity patients
    selected = select_high_acuity_patients(all_labels, args.count)
    logger.info("Selected %d patients for variation augmentation", len(selected))

    # Log selection stats
    orientations = Counter(r.get("label", {}).get("orientation") for r in selected)
    acuities = Counter(_patient_acuity(r) for r in selected)
    categories = Counter(r.get("category", "unknown") for r in selected)
    languages_dist = Counter(r.get("language", "unknown") for r in selected)
    logger.info("Orientation distribution: %s", dict(orientations))
    logger.info("Acuity distribution: %s", dict(acuities))
    logger.info("Category distribution: %s", dict(categories))
    logger.info("Language distribution: %s", dict(languages_dist))

    # Load schema and prompt template
    schema = load_unified_schema()
    prompt_template = load_prompt_template("distill_unified_labels")

    # Dry run
    if args.dry_run:
        record = selected[0]
        patient = record.get("patient", {})
        language = record.get("language", "fr")
        patient_data = format_patient_prompt(patient, language)

        print("=" * 80)
        print("DRY RUN - Variation Augmentation")
        print(f"Selected {len(selected)} patients")
        print(f"Each gets {len(VARIATIONS)} variations")
        print(f"Total expected output: {len(selected) * len(VARIATIONS)} labels")
        print(f"Mode: {'realtime' if args.realtime else 'batch'}")
        print("=" * 80)

        for var in VARIATIONS:
            filled = prompt_template.replace("{PATIENT_DATA}", patient_data) + var["suffix"]
            print(f"\n--- Variation {var['variation']} (temp={var['temperature']}) ---\n")
            print(filled[:1500])
            print("...")

        if not args.realtime:
            print("\n--- Batch request preview ---\n")
            from scripts.batch_utils import build_batch_request, split_prompt_for_caching
            system_text, user_text = split_prompt_for_caching(prompt_template, patient_data)
            req = build_batch_request(
                custom_id=_variation_custom_id(record.get("patient_id", "test"), 1),
                model=MODEL,
                system_text=system_text,
                user_content=user_text,
                max_tokens=MAX_TOKENS,
                temperature=VARIATIONS[0]["temperature"],
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
        logger.info("Resume: found %d existing variation records", len(existing_patient_ids))

    if args.realtime:
        # ---- Real-time mode (original behavior) ----
        max_concurrent = args.max_concurrent or int(os.getenv("MAX_CONCURRENT", "5"))
        semaphore = asyncio.Semaphore(max_concurrent)
        client = anthropic.AsyncAnthropic()

        # Build tasks
        tasks: list[dict] = []
        for record in selected:
            pid = record.get("patient_id", "")
            if args.resume and pid in existing_patient_ids:
                continue
            tasks.append(record)

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
        total_variations = 0
        pbar = tqdm(total=len(tasks), desc="variations", unit="pt")

        for batch_start in range(0, len(tasks), batch_size):
            batch = tasks[batch_start : batch_start + batch_size]
            coros = [
                process_patient_variations(
                    client, record, prompt_template, schema,
                    semaphore, error_log_path,
                )
                for record in batch
            ]

            results = await asyncio.gather(*coros)

            batch_records: list[dict] = []
            for result in results:
                if result is not None:
                    batch_records.append(result)
                    success += 1
                    total_variations += len(result.get("labels", []))
                else:
                    failed += 1

            if batch_records:
                save_jsonl(batch_records, str(output_path))

            pbar.update(len(batch))

        pbar.close()

        total_calls = total_variations + failed * 3
        est_input_tokens = total_calls * 1500
        est_output_tokens = total_calls * 500
        est_cost = (est_input_tokens * 3 + est_output_tokens * 15) / 1_000_000

    else:
        # ---- Batch mode (default - 50% cost savings) ----
        sync_client = get_anthropic_client()

        success, failed, total_variations = run_variations_batch(
            sync_client, selected, prompt_template, schema,
            existing_patient_ids, output_path, error_log_path, data_dir,
        )

        total_calls = total_variations + failed * 3
        est_input_tokens = total_calls * 1500
        est_output_tokens = total_calls * 500
        est_cost = (est_input_tokens * 1.5 + est_output_tokens * 7.5) / 1_000_000

    # Summary
    mode_label = "realtime" if args.realtime else "batch"
    print("\n" + "=" * 80)
    print(f"VARIATION AUGMENTATION SUMMARY [{mode_label}]")
    print("=" * 80)
    print(f"Selected patients:     {len(selected)}")
    print(f"Processed:             {len(selected) - len(existing_patient_ids)}")
    print(f"Success:               {success}")
    print(f"Failed:                {failed}")
    print(f"Total variations:      {total_variations}")
    print(f"Avg variations/pt:     {total_variations / max(success, 1):.1f}")
    print(f"Output:                {output_path}")

    print(f"Estimated API calls:   {total_calls}")
    print(f"Estimated cost:        ~${est_cost:.2f} ({mode_label})")

    if failed > 0:
        print(f"\nErrors logged to: {error_log_path}")
        print("Re-run with --resume to retry failed patients.")

    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
