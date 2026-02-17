"""Phase 1.5 — Variation augmentation: multiple valid responses per patient.

Generates 3 different labels for each selected patient using different
temperatures and prompt suffixes, teaching the model that different phrasings
and orderings are acceptable for the same clinical scenario.

Usage:
    python -m scripts.augment_variations
    python -m scripts.augment_variations --count 200
    python -m scripts.augment_variations --dry-run
    python -m scripts.augment_variations --resume
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
VALID_ORIENTATIONS = {"SAUV", "MEDICAL", "SURGICAL", "TRAUMA", "PEDIATRIC"}

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
        description="Phase 1.5 — Variation augmentation (multiple labels per patient)"
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
        help="Max concurrent API calls (default: from env or 5)",
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
    """Select high-acuity patients (ESI 1-3) with balanced distribution.

    Criteria:
    - ESI 1-3 preferred
    - Mix of SAUV and non-SAUV orientations
    - Balanced across categories
    """
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
        # Supplement with remaining labels sorted by quality
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
    non_sauv_records = [r for r in high_acuity if r.get("label", {}).get("orientation") != "SAUV"]

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
# Generate one variation label
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
    """Generate a single variation label for a patient.

    Returns the label dict or None on failure.
    """
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
# Process one patient: generate all 3 variations
# ---------------------------------------------------------------------------


async def process_patient_variations(
    client: anthropic.AsyncAnthropic,
    record: dict,
    prompt_template: str,
    schema: dict,
    semaphore: asyncio.Semaphore,
    error_log_path: Path,
) -> dict | None:
    """Generate 3 variation labels for one patient. Returns output record or None."""
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
    languages = Counter(r.get("language", "unknown") for r in selected)
    logger.info("Orientation distribution: %s", dict(orientations))
    logger.info("Acuity distribution: %s", dict(acuities))
    logger.info("Category distribution: %s", dict(categories))
    logger.info("Language distribution: %s", dict(languages))

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
        print("DRY RUN — Variation Augmentation")
        print(f"Selected {len(selected)} patients")
        print(f"Each gets {len(VARIATIONS)} variations")
        print(f"Total expected output: {len(selected) * len(VARIATIONS)} labels")
        print("=" * 80)

        for var in VARIATIONS:
            filled = prompt_template.replace("{PATIENT_DATA}", patient_data) + var["suffix"]
            print(f"\n--- Variation {var['variation']} (temp={var['temperature']}) ---\n")
            print(filled[:1500])
            print("...")

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

    # Setup concurrency
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

    # Summary
    print("\n" + "=" * 80)
    print("VARIATION AUGMENTATION SUMMARY")
    print("=" * 80)
    print(f"Selected patients:     {len(selected)}")
    print(f"Processed:             {len(tasks)}")
    print(f"Success:               {success}")
    print(f"Failed:                {failed}")
    print(f"Total variations:      {total_variations}")
    print(f"Avg variations/pt:     {total_variations / max(success, 1):.1f}")
    print(f"Output:                {output_path}")

    # Cost estimate: ~3 API calls per patient (3 variations)
    total_calls = total_variations + failed * 3
    est_input_tokens = total_calls * 1500
    est_output_tokens = total_calls * 500
    est_cost = (est_input_tokens * 3 + est_output_tokens * 15) / 1_000_000
    print(f"Estimated API calls:   {total_calls}")
    print(f"Estimated cost:        ~${est_cost:.2f}")

    if failed > 0:
        print(f"\nErrors logged to: {error_log_path}")
        print("Re-run with --resume to retry failed patients.")

    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
