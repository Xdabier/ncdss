"""Phase 1.1 — Generate synthetic patient profiles via Claude Sonnet.

Generates ~4,600 patient profiles across 13 clinical categories in French
and English, by calling Claude Sonnet in batches of 10 patients per API call.

Usage:
    python -m scripts.generate_patients
    python -m scripts.generate_patients --categories cardiac,trauma --language fr
    python -m scripts.generate_patients --dry-run
    python -m scripts.generate_patients --resume
"""

import argparse
import asyncio
import json
import math
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
from tqdm import tqdm

from scripts.common import (
    get_data_dir,
    load_categories,
    load_env,
    load_prompt_template,
    logger,
    save_jsonl,
)

MODEL = "claude-sonnet-4-5-20250929"
BATCH_SIZE = 10
MAX_TOKENS = 8192
TEMPERATURE = 0.9
MAX_RETRIES = 3
VALID_ORIENTATIONS = {"SAUV", "MEDICAL", "SURGICAL", "TRAUMA", "PEDIATRIC"}
VALID_SEXES = {"MALE", "FEMALE"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic patient profiles via Claude Sonnet"
    )
    parser.add_argument(
        "--categories",
        type=str,
        default=None,
        help="Comma-separated category IDs to generate (default: all)",
    )
    parser.add_argument(
        "--language",
        type=str,
        choices=["fr", "en", "both"],
        default="both",
        help="Language to generate: fr, en, or both (default: both)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print one prompt and exit without calling the API",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip categories/languages that already have output files",
    )
    parser.add_argument(
        "--max-concurrent",
        type=int,
        default=None,
        help="Max concurrent API calls (default: from env or 5)",
    )
    return parser.parse_args()


def get_batch_diversity_instruction(batch_index: int, total_batches: int) -> str:
    """Return a diversity instruction that varies by batch index."""
    parts = [f"batch {batch_index + 1} of {total_batches}"]

    if batch_index % 2 == 0:
        parts.append(
            "Focus on elderly patients (>65 years) and patients with multiple comorbidities"
        )
    else:
        parts.append(
            "Focus on young adults (18-40) and pediatric patients"
        )

    if batch_index % 5 == 0 and batch_index > 0:
        parts.append("Include at least 3 atypical presentations")

    return " — ".join(parts)


def get_edge_case_instruction() -> str:
    return (
        "\n\nSpecial instruction for this category: Generate challenging edge cases: "
        "patients where the presentation mimics a different condition, atypical vital "
        "sign patterns, elderly with minimal symptoms despite serious pathology, "
        "psychiatric presentations masking medical emergencies."
    )


def build_prompt(
    template: str,
    category: dict[str, Any],
    language: str,
    batch_index: int,
    total_batches: int,
) -> str:
    """Fill in the prompt template with category and batch details."""
    lang_full = "French" if language == "fr" else "English"
    cat_name = category["name_fr"] if language == "fr" else category["name_en"]
    key_presentations = ", ".join(category["key_presentations"])
    batch_instruction = get_batch_diversity_instruction(batch_index, total_batches)

    prompt = template.replace("{CATEGORY}", cat_name)
    prompt = prompt.replace("{LANGUAGE}", lang_full)
    prompt = prompt.replace("{KEY_PRESENTATIONS}", key_presentations)
    prompt = prompt.replace("{BATCH_INDEX}", batch_instruction)

    if category["id"] == "edge_cases":
        prompt += get_edge_case_instruction()

    return prompt


def extract_json_array(text: str, truncated: bool = False) -> list[dict]:
    """Extract a JSON array from text, handling markdown code blocks and truncation.

    If truncated=True, attempts to salvage complete patient objects from a
    JSON array that was cut off mid-stream by the max_tokens limit.
    """
    # Strip markdown code fences if present
    code_block = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if code_block:
        text = code_block.group(1).strip()

    # Find the start of the JSON array
    arr_start = text.find("[")
    if arr_start == -1:
        return json.loads(text)

    arr_text = text[arr_start:]

    # Try parsing the complete array first
    try:
        return json.loads(arr_text)
    except json.JSONDecodeError:
        if not truncated:
            raise

    # Truncated response — salvage complete objects.
    # Walk backwards from the end to find the last complete object boundary
    # (a closing brace `}` followed optionally by whitespace/comma before truncation).
    logger.info("Attempting to salvage complete objects from truncated JSON...")
    depth = 0
    last_complete_end = -1
    in_string = False
    escape = False

    for i, ch in enumerate(arr_text):
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                last_complete_end = i

    if last_complete_end > 0:
        salvaged = arr_text[: last_complete_end + 1] + "\n]"
        return json.loads(salvaged)

    raise json.JSONDecodeError("No complete objects found in truncated array", arr_text, 0)


def validate_patient(patient: dict) -> list[str]:
    """Validate a single patient object. Returns list of error messages."""
    errors = []

    # Required top-level fields
    required = [
        "chiefComplaint", "age", "sex", "vitals", "scores",
        "expectedESI", "expectedOrientation", "category",
    ]
    for field in required:
        if field not in patient:
            errors.append(f"Missing required field: {field}")

    if errors:
        return errors

    # age
    if not isinstance(patient["age"], (int, float)) or patient["age"] <= 0:
        errors.append(f"Invalid age: {patient['age']}")

    # sex
    if patient["sex"] not in VALID_SEXES:
        errors.append(f"Invalid sex: {patient['sex']} (expected MALE or FEMALE)")

    # vitals
    vitals = patient.get("vitals", {})
    if not isinstance(vitals, dict):
        errors.append("vitals is not a dict")
    else:
        for req_vital in ["temperature", "heartRate", "bloodPressure"]:
            if req_vital not in vitals:
                errors.append(f"Missing vital: {req_vital}")

    # scores
    scores = patient.get("scores", {})
    if not isinstance(scores, dict):
        errors.append("scores is not a dict")
    else:
        news = scores.get("news")
        if news is not None and (not isinstance(news, (int, float)) or news < 0 or news > 20):
            errors.append(f"Invalid NEWS score: {news} (expected 0-20)")

        gcs = scores.get("gcs")
        if gcs is not None and (not isinstance(gcs, (int, float)) or gcs < 3 or gcs > 15):
            errors.append(f"Invalid GCS score: {gcs} (expected 3-15)")

        qsofa = scores.get("qsofa")
        if qsofa is not None and (not isinstance(qsofa, (int, float)) or qsofa < 0 or qsofa > 3):
            errors.append(f"Invalid qSOFA score: {qsofa} (expected 0-3)")

    # expectedESI
    esi = patient.get("expectedESI")
    if not isinstance(esi, (int, float)) or esi < 1 or esi > 5:
        errors.append(f"Invalid expectedESI: {esi} (expected 1-5)")

    # expectedOrientation
    orient = patient.get("expectedOrientation")
    if orient not in VALID_ORIENTATIONS:
        errors.append(f"Invalid expectedOrientation: {orient}")

    return errors


async def generate_batch(
    client: anthropic.AsyncAnthropic,
    template: str,
    category: dict[str, Any],
    language: str,
    batch_index: int,
    total_batches: int,
    error_log_path: Path,
) -> list[dict]:
    """Generate one batch of patients via Claude API with retry logic."""
    prompt = build_prompt(template, category, language, batch_index, total_batches)
    cat_id = category["id"]
    messages = [{"role": "user", "content": prompt}]

    for attempt in range(MAX_RETRIES):
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                temperature=TEMPERATURE,
                messages=messages,
            )
            text = response.content[0].text
            truncated = response.stop_reason == "max_tokens"

            if truncated:
                logger.warning(
                    "[%s/%s] Batch %d: response truncated at max_tokens, salvaging complete objects",
                    cat_id, language, batch_index,
                )

            try:
                patients_raw = extract_json_array(text, truncated=truncated)
            except (json.JSONDecodeError, TypeError) as parse_err:
                if attempt < MAX_RETRIES - 1:
                    # Retry with a "fix the JSON" follow-up
                    logger.warning(
                        "[%s/%s] Batch %d: JSON parse failed (%s), requesting fix (attempt %d)",
                        cat_id, language, batch_index, str(parse_err)[:80], attempt + 1,
                    )
                    messages = [
                        {"role": "user", "content": prompt},
                        {"role": "assistant", "content": text},
                        {
                            "role": "user",
                            "content": (
                                "The JSON array in your response could not be parsed. "
                                "Please return ONLY a valid JSON array of patient objects, "
                                "with no other text or markdown formatting."
                            ),
                        },
                    ]
                    continue
                else:
                    _log_error(error_log_path, cat_id, language, batch_index, "json_parse_error", text[:500])
                    return []

            # Validate each patient
            valid_patients = []
            for i, patient in enumerate(patients_raw):
                if not isinstance(patient, dict):
                    logger.warning("[%s/%s] Batch %d, item %d: not a dict", cat_id, language, batch_index, i)
                    continue

                validation_errors = validate_patient(patient)
                if validation_errors:
                    logger.warning(
                        "[%s/%s] Batch %d, item %d: validation failed: %s",
                        cat_id, language, batch_index, i, "; ".join(validation_errors),
                    )
                    continue

                # Ensure integer types for numeric fields
                patient["age"] = int(patient["age"])
                patient["expectedESI"] = int(patient["expectedESI"])

                # Add metadata
                patient["language"] = language
                patient["batchIndex"] = batch_index
                patient["generatedAt"] = datetime.now(timezone.utc).isoformat()

                valid_patients.append(patient)

            return valid_patients

        except anthropic.RateLimitError:
            backoff = 2 ** (2 * attempt + 1)  # 2s, 8s, 32s
            logger.warning(
                "[%s/%s] Batch %d: rate limited, retrying in %ds (attempt %d/%d)",
                cat_id, language, batch_index, backoff, attempt + 1, MAX_RETRIES,
            )
            await asyncio.sleep(backoff)

        except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
            backoff = 2 ** (2 * attempt + 1)
            logger.warning(
                "[%s/%s] Batch %d: network error (%s), retrying in %ds (attempt %d/%d)",
                cat_id, language, batch_index, type(e).__name__, backoff, attempt + 1, MAX_RETRIES,
            )
            await asyncio.sleep(backoff)

        except anthropic.APIStatusError as e:
            backoff = 2 ** (2 * attempt + 1)
            logger.error(
                "[%s/%s] Batch %d: API error %d (%s), retrying in %ds",
                cat_id, language, batch_index, e.status_code, str(e)[:100], backoff,
            )
            await asyncio.sleep(backoff)

    _log_error(error_log_path, cat_id, language, batch_index, "max_retries_exceeded", "")
    return []


def _log_error(
    error_log_path: Path, cat_id: str, language: str,
    batch_index: int, error_type: str, detail: str,
) -> None:
    """Append an error entry to the error log JSONL file."""
    error_log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "category": cat_id,
        "language": language,
        "batchIndex": batch_index,
        "errorType": error_type,
        "detail": detail,
    }
    with open(error_log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def get_output_path(data_dir: Path, cat_id: str, language: str) -> Path:
    return data_dir / "patients" / f"patients_{cat_id}_{language}.jsonl"


def count_existing(filepath: Path) -> int:
    """Count lines in an existing JSONL file."""
    if not filepath.exists():
        return 0
    with open(filepath, "r", encoding="utf-8") as f:
        return sum(1 for line in f if line.strip())


async def process_category(
    client: anthropic.AsyncAnthropic,
    template: str,
    category: dict[str, Any],
    language: str,
    target_count: int,
    data_dir: Path,
    error_log_path: Path,
    semaphore: asyncio.Semaphore,
    resume: bool,
) -> dict[str, Any]:
    """Process all batches for a single category/language pair."""
    cat_id = category["id"]
    output_path = get_output_path(data_dir, cat_id, language)

    existing_count = count_existing(output_path) if resume else 0
    if resume and existing_count >= target_count:
        logger.info(
            "[%s/%s] Already has %d patients (target %d), skipping",
            cat_id, language, existing_count, target_count,
        )
        return {
            "category": cat_id,
            "language": language,
            "target": target_count,
            "generated": existing_count,
            "api_calls": 0,
            "skipped": True,
        }

    remaining = target_count - existing_count
    total_batches = math.ceil(remaining / BATCH_SIZE)
    generated = 0
    api_calls = 0

    pbar = tqdm(
        total=remaining,
        desc=f"{cat_id}/{language}",
        unit="pt",
        leave=False,
    )

    for batch_idx in range(total_batches):
        async with semaphore:
            patients = await generate_batch(
                client, template, category, language,
                batch_idx, total_batches, error_log_path,
            )
            api_calls += 1

        if patients:
            save_jsonl(patients, str(output_path))
            generated += len(patients)
            pbar.update(len(patients))

    pbar.close()

    return {
        "category": cat_id,
        "language": language,
        "target": target_count,
        "generated": existing_count + generated,
        "api_calls": api_calls,
        "skipped": False,
    }


async def main() -> None:
    load_env()
    args = parse_args()

    # Load config
    config = load_categories()
    categories = config["categories"]
    fr_ratio = config["language_split"]["fr_ratio"]
    en_ratio = config["language_split"]["en_ratio"]

    # Filter categories if specified
    if args.categories:
        requested_ids = set(args.categories.split(","))
        categories = [c for c in categories if c["id"] in requested_ids]
        unknown = requested_ids - {c["id"] for c in categories}
        if unknown:
            logger.error("Unknown category IDs: %s", ", ".join(unknown))
            sys.exit(1)
        if not categories:
            logger.error("No valid categories found")
            sys.exit(1)

    # Determine languages
    languages = []
    if args.language in ("fr", "both"):
        languages.append("fr")
    if args.language in ("en", "both"):
        languages.append("en")

    # Load prompt template
    template = load_prompt_template("generate_patients")

    # Dry run: print one prompt and exit
    if args.dry_run:
        cat = categories[0]
        lang = languages[0]
        target = math.ceil(cat["target_count"] * (fr_ratio if lang == "fr" else en_ratio))
        total_batches = math.ceil(target / BATCH_SIZE)
        prompt = build_prompt(template, cat, lang, 0, total_batches)
        print("=" * 80)
        print(f"DRY RUN — Category: {cat['id']}, Language: {lang}")
        print(f"Target: {target} patients, Batches: {total_batches}")
        print("=" * 80)
        print(prompt)
        return

    # Setup
    data_dir = get_data_dir()
    error_log_path = data_dir / "generation_errors.jsonl"
    max_concurrent = args.max_concurrent or int(os.getenv("MAX_CONCURRENT", "5"))
    semaphore = asyncio.Semaphore(max_concurrent)
    client = anthropic.AsyncAnthropic()

    # Build task list
    tasks = []
    for cat in categories:
        for lang in languages:
            ratio = fr_ratio if lang == "fr" else en_ratio
            target = math.ceil(cat["target_count"] * ratio)
            tasks.append((cat, lang, target))

    total_target = sum(t[2] for t in tasks)
    logger.info(
        "Starting generation: %d categories × %d languages = %d tasks, %d total target patients",
        len(categories), len(languages), len(tasks), total_target,
    )

    # Run all category/language pairs concurrently (semaphore limits API calls)
    results = await asyncio.gather(*[
        process_category(
            client, template, cat, lang, target,
            data_dir, error_log_path, semaphore, args.resume,
        )
        for cat, lang, target in tasks
    ])

    # Print summary table
    print("\n" + "=" * 80)
    print("GENERATION SUMMARY")
    print("=" * 80)
    print(f"{'Category':<30} {'Lang':<6} {'Target':>8} {'Generated':>10} {'Rate':>8} {'Status'}")
    print("-" * 80)

    total_generated = 0
    total_api_calls = 0
    shortfalls = []

    for r in results:
        rate = (r["generated"] / r["target"] * 100) if r["target"] > 0 else 0
        status = "SKIPPED" if r.get("skipped") else ("OK" if rate >= 90 else "LOW")
        print(
            f"{r['category']:<30} {r['language']:<6} {r['target']:>8} "
            f"{r['generated']:>10} {rate:>7.1f}% {status}"
        )
        total_generated += r["generated"]
        total_api_calls += r["api_calls"]
        if rate < 90 and not r.get("skipped"):
            shortfalls.append(f"{r['category']}/{r['language']} ({r['generated']}/{r['target']})")

    print("-" * 80)
    print(f"Total patients generated: {total_generated}")
    print(f"Total API calls made:     {total_api_calls}")

    if shortfalls:
        print(f"\nCategories below 90% target ({len(shortfalls)}):")
        for s in shortfalls:
            print(f"  - {s}")
        print("\nRe-run with --resume and --categories to fill gaps.")

    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
