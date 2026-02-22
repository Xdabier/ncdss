"""Merge all data subsets into final training and evaluation JSONL files.

Loads all generated data, deduplicates, formats into chat-style SFT records,
performs a stratified train/eval split, and writes training.jsonl + evaluation.jsonl.

Usage:
  python -m scripts.prepare_training_data [--data-dir PATH] [--train-ratio 0.85] [--seed 42] [--no-validate]
"""

import argparse
import hashlib
import json
import random
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from .common import get_data_dir, load_env, load_jsonl, logger

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SYSTEM_MESSAGE_FR = "Tu es un assistant medical d'urgence experimente."
SYSTEM_MESSAGE_EN = "You are an experienced emergency medicine assistant."

VALID_ORIENTATIONS = {"SAUV", "MEDICAL", "SURGICAL", "TRAUMA", "PEDIATRIC"}


# ---------------------------------------------------------------------------
# Patient data formatting — matches buildPromptFinetuned() (Plan Section 4.2)
# ---------------------------------------------------------------------------

def format_patient_prompt(patient: dict, language: str) -> str:
    """Format a patient record into the exact prompt the fine-tuned model receives at inference.

    This MUST match the server-side buildPromptFinetuned() format so the model
    sees the same input structure during training and inference.
    """
    vitals = patient.get("vitals", {})
    scores = patient.get("scores", {})
    abcde = patient.get("abcdeFindings", {})

    age = patient.get("age", "?")
    sex_raw = patient.get("sex", "")
    if language == "fr":
        sex = "Homme" if sex_raw == "MALE" else "Femme" if sex_raw == "FEMALE" else sex_raw
    else:
        sex = "Male" if sex_raw == "MALE" else "Female" if sex_raw == "FEMALE" else sex_raw

    chief = patient.get("chiefComplaint", "")

    # Vitals block
    vitals_lines = []
    temp = vitals.get("temperature")
    vitals_lines.append(f"- T: {temp if temp is not None else 'NM'} °C")

    hr = vitals.get("heartRate")
    vitals_lines.append(f"- FC: {hr if hr is not None else 'NM'} bpm")

    rr = vitals.get("respiratoryRate")
    vitals_lines.append(f"- FR: {rr if rr is not None else 'NM'} /min")

    bp = vitals.get("bloodPressure")
    vitals_lines.append(f"- TA: {bp if bp else 'NM'}")

    spo2 = vitals.get("oxygenSaturation")
    vitals_lines.append(f"- SpO2: {spo2 if spo2 is not None else 'NM'} %")

    pain = vitals.get("painLevel")
    if pain is not None:
        vitals_lines.append(f"- EVA: {pain}/10")

    # Scores block
    news = scores.get("news")
    gcs = scores.get("gcs")
    qsofa = scores.get("qsofa")
    scores_lines = [
        f"- NEWS: {news if news is not None else 'NC'}",
        f"- GCS: {gcs if gcs is not None else 'NC'}/15",
        f"- qSOFA: {qsofa if qsofa is not None else 'NC'}/3",
    ]

    # ABCDE block
    abcde_text = format_abcde(abcde)

    # Medical history and allergies
    med_history = patient.get("medicalHistory", [])
    if isinstance(med_history, str):
        med_history_str = med_history
    elif isinstance(med_history, list) and med_history:
        med_history_str = ", ".join(str(h) for h in med_history)
    else:
        med_history_str = ""

    allergies = patient.get("allergies", "")
    if isinstance(allergies, list):
        allergies = ", ".join(str(a) for a in allergies) if allergies else ""

    # Assemble full prompt
    parts = [
        f"PATIENT:",
        f"- Age: {age} ans",
        f"- Sexe: {sex}",
        f"- Motif: {chief}",
        "",
        "CONSTANTES:",
        "\n".join(vitals_lines),
        "",
        "SCORES:",
        "\n".join(scores_lines),
        "",
        f"ABCDE:",
        abcde_text,
    ]

    if med_history_str:
        parts.append(f"\nATCD: {med_history_str}")
    if allergies:
        parts.append(f"ALLERGIES: {allergies}")
    elif not med_history_str:
        # Add default if both are empty
        parts.append(f"ALLERGIES: Aucune connue" if language == "fr" else f"ALLERGIES: None known")

    return "\n".join(parts)


def format_abcde(abcde: dict) -> str:
    """Serialize ABCDE findings into a compact text block."""
    sections = []
    for key in ("airway", "breathing", "circulation", "disability", "exposure"):
        letter = key[0].upper()
        findings = abcde.get(key, {})
        if not findings:
            sections.append(f"{letter}: RAS")
            continue

        if isinstance(findings, str):
            sections.append(f"{letter}: {findings}")
            continue

        # Serialize object findings into a readable line
        parts = []
        for field_name, value in findings.items():
            if value is None or value == "" or value is False:
                continue
            if isinstance(value, bool) and value:
                parts.append(field_name)
            elif isinstance(value, list):
                parts.append(f"{field_name}: {', '.join(str(v) for v in value)}")
            else:
                parts.append(f"{field_name}: {value}")

        sections.append(f"{letter}: {'; '.join(parts)}" if parts else f"{letter}: RAS")

    return "\n".join(sections)


# ---------------------------------------------------------------------------
# Record loading and expansion
# ---------------------------------------------------------------------------

def load_all_records(data_dir: Path) -> list[dict]:
    """Load all data subsets and expand into individual (patient, label) records.

    Returns a list of dicts with keys:
      patient_id, patient, label, language, category, source, esi
    """
    records: list[dict] = []

    # 1. Primary French labels
    fr_path = data_dir / "labels" / "labels_fr.jsonl"
    for rec in load_jsonl(str(fr_path)):
        records.append({
            "patient_id": rec.get("patient_id", ""),
            "patient": rec.get("patient", {}),
            "label": rec.get("label", {}),
            "language": "fr",
            "category": rec.get("category", "unknown"),
            "source": "distilled",
            "esi": rec.get("patient", {}).get("expectedESI"),
        })

    # 2. Primary English labels
    en_path = data_dir / "labels" / "labels_en.jsonl"
    for rec in load_jsonl(str(en_path)):
        records.append({
            "patient_id": rec.get("patient_id", ""),
            "patient": rec.get("patient", {}),
            "label": rec.get("label", {}),
            "language": "en",
            "category": rec.get("category", "unknown"),
            "source": "distilled",
            "esi": rec.get("patient", {}).get("expectedESI"),
        })

    # 3. Cross-lingual aligned pairs -> expand each pair into 2 records
    aligned_path = data_dir / "aligned" / "cross_lingual_400.jsonl"
    for pair in load_jsonl(str(aligned_path)):
        pair_id = pair.get("pair_id", "unknown")
        for lang_key in ("fr", "en"):
            side = pair.get(lang_key, {})
            patient_data = side.get("patient", {})
            records.append({
                "patient_id": f"{pair_id}_{lang_key}",
                "patient": patient_data,
                "label": side.get("label", {}),
                "language": lang_key,
                "category": patient_data.get("category", "unknown"),
                "source": "cross_lingual",
                "esi": patient_data.get("expectedESI"),
            })

    # 4. Variation augmentation -> expand each into N records (one per variation)
    var_path = data_dir / "augmented" / "variations_500.jsonl"
    for rec in load_jsonl(str(var_path)):
        patient_data = rec.get("patient", {})
        base_id = rec.get("patient_id", "unknown")
        lang = patient_data.get("language", "fr")
        for var_item in rec.get("labels", []):
            records.append({
                "patient_id": f"{base_id}_v{var_item.get('variation', '?')}",
                "patient": patient_data,
                "label": var_item.get("label", {}),
                "language": lang,
                "category": patient_data.get("category", "unknown"),
                "source": "variation",
                "esi": patient_data.get("expectedESI"),
            })

    # 5. Dosage-focused labels
    dosage_path = data_dir / "augmented" / "dosage_focused_500.jsonl"
    for rec in load_jsonl(str(dosage_path)):
        patient_data = rec.get("patient", {})
        records.append({
            "patient_id": rec.get("patient_id", ""),
            "patient": patient_data,
            "label": rec.get("label", {}),
            "language": patient_data.get("language", patient_data.get("_language", "fr")),
            "category": patient_data.get("category", "unknown"),
            "source": "dosage",
            "esi": patient_data.get("expectedESI"),
        })

    return records


def label_hash(label: dict) -> str:
    """Deterministic hash of a label for deduplication."""
    canonical = json.dumps(label, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def deduplicate(records: list[dict]) -> list[dict]:
    """Remove exact duplicate (patient_id, label_hash) pairs.

    Priority: distilled > cross_lingual > dosage > variation
    When a duplicate is found, keep the higher-priority source.
    """
    SOURCE_PRIORITY = {
        "distilled": 0,
        "cross_lingual": 1,
        "dosage": 2,
        "variation": 3,
    }

    seen: dict[str, dict] = {}  # key -> record
    for rec in records:
        pid = rec["patient_id"]
        lh = label_hash(rec["label"])
        key = f"{pid}:{lh}"
        if key in seen:
            existing_priority = SOURCE_PRIORITY.get(seen[key]["source"], 99)
            new_priority = SOURCE_PRIORITY.get(rec["source"], 99)
            if new_priority < existing_priority:
                seen[key] = rec
        else:
            seen[key] = rec

    deduped = list(seen.values())
    removed = len(records) - len(deduped)
    if removed > 0:
        logger.info("Deduplicated: removed %d exact duplicates (%d -> %d)", removed, len(records), len(deduped))
    return deduped


# ---------------------------------------------------------------------------
# Chat format conversion
# ---------------------------------------------------------------------------

def format_chat_record(rec: dict) -> dict:
    """Convert a (patient, label) record into SFT chat format."""
    language = rec.get("language", "fr")
    patient = rec.get("patient", {})
    label = rec.get("label", {})

    system_msg = SYSTEM_MESSAGE_FR if language == "fr" else SYSTEM_MESSAGE_EN
    user_content = format_patient_prompt(patient, language)
    assistant_content = json.dumps(label, ensure_ascii=False, separators=(",", ":"))

    return {
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_content},
            {"role": "assistant", "content": assistant_content},
        ],
        "language": language,
        "source": rec.get("source", "distilled"),
        "esi": rec.get("esi"),
        "category": rec.get("category", "unknown"),
    }


# ---------------------------------------------------------------------------
# Stratified split
# ---------------------------------------------------------------------------

def stratified_split(
    records: list[dict],
    train_ratio: float,
    seed: int,
) -> tuple[list[dict], list[dict]]:
    """Stratified split by (category, language, orientation, ESI).

    Ensures proportional representation of each stratum in both splits.
    """
    rng = random.Random(seed)

    # Group records by stratification key
    strata: dict[str, list[dict]] = defaultdict(list)
    for rec in records:
        orientation = rec.get("label", {}).get("orientation", "UNKNOWN")
        esi = rec.get("esi")
        esi_str = str(esi) if esi is not None else "?"
        category = rec.get("category", "unknown")
        language = rec.get("language", "fr")
        key = f"{category}|{language}|{orientation}|{esi_str}"
        strata[key].append(rec)

    train: list[dict] = []
    eval_: list[dict] = []

    for key in sorted(strata.keys()):
        group = strata[key]
        rng.shuffle(group)
        split_idx = max(1, round(len(group) * train_ratio)) if len(group) > 1 else 1
        # For single-item strata, put in training
        if len(group) == 1:
            train.extend(group)
        else:
            train.extend(group[:split_idx])
            eval_.extend(group[split_idx:])

    # Final shuffle
    rng.shuffle(train)
    rng.shuffle(eval_)

    return train, eval_


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def print_summary(train: list[dict], eval_: list[dict]) -> None:
    """Print dataset split summary."""
    total = len(train) + len(eval_)
    print("\n" + "=" * 60)
    print("TRAINING DATA PREPARATION SUMMARY")
    print("=" * 60)
    print(f"  Total records:    {total}")
    print(f"  Training set:     {len(train)} ({len(train)/total*100:.1f}%)")
    print(f"  Evaluation set:   {len(eval_)} ({len(eval_)/total*100:.1f}%)")
    print()

    for split_name, split_data in [("Training", train), ("Evaluation", eval_)]:
        cat_counts: Counter = Counter()
        lang_counts: Counter = Counter()
        src_counts: Counter = Counter()
        orient_counts: Counter = Counter()
        esi_counts: Counter = Counter()

        for rec in split_data:
            cat_counts[rec.get("category", "unknown")] += 1
            lang_counts[rec.get("language", "??")] += 1
            src_counts[rec.get("source", "unknown")] += 1
            # Parse orientation from messages (assistant content is the label JSON)
            messages = rec.get("messages", [])
            if messages:
                for msg in messages:
                    if msg.get("role") == "assistant":
                        try:
                            lbl = json.loads(msg["content"])
                            orient_counts[lbl.get("orientation", "?")] += 1
                        except (json.JSONDecodeError, KeyError):
                            orient_counts["?"] += 1
                        break
            esi_val = rec.get("esi")
            if esi_val is not None:
                esi_counts[int(esi_val)] += 1

        print(f"  {split_name} ({len(split_data)} records):")
        print(f"    Languages:    {dict(sorted(lang_counts.items()))}")
        print(f"    Categories:   {len(cat_counts)} categories")
        for cat in sorted(cat_counts.keys()):
            print(f"      {cat}: {cat_counts[cat]}")
        print(f"    Sources:      {dict(sorted(src_counts.items()))}")
        print(f"    Orientations: {dict(sorted(orient_counts.items()))}")
        print(f"    ESI levels:   {dict(sorted(esi_counts.items()))}")
        print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    load_env()

    parser = argparse.ArgumentParser(description="Prepare NCDSS training data for SFT")
    parser.add_argument("--data-dir", type=str, default=None, help="Root data directory")
    parser.add_argument("--train-ratio", type=float, default=0.85, help="Training split ratio (default: 0.85)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")
    parser.add_argument(
        "--no-validate", action="store_true",
        help="Skip running validate_dataset.py before preparing"
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir) if args.data_dir else get_data_dir()

    # Optionally run validation first
    if not args.no_validate:
        logger.info("Running validation checks first ...")
        result = subprocess.run(
            [sys.executable, "-m", "scripts.validate_dataset", "--data-dir", str(data_dir)],
            cwd=str(Path(__file__).resolve().parent.parent),
        )
        if result.returncode != 0:
            logger.error("Validation failed. Fix critical issues before preparing training data.")
            logger.error("Use --no-validate to skip validation (not recommended).")
            sys.exit(1)
        logger.info("Validation passed.")

    # Load all records
    logger.info("Loading all data subsets from %s ...", data_dir)
    records = load_all_records(data_dir)
    if not records:
        logger.error("No records found in %s", data_dir)
        sys.exit(1)
    logger.info("Loaded %d raw records", len(records))

    # Deduplicate
    records = deduplicate(records)

    # Format into chat records
    logger.info("Formatting %d records into chat format ...", len(records))
    chat_records = [format_chat_record(rec) for rec in records]

    # Stratified split
    logger.info("Splitting %d records (train=%.0f%%, eval=%.0f%%) with seed=%d ...",
                len(records), args.train_ratio * 100, (1 - args.train_ratio) * 100, args.seed)
    train_records, eval_records = stratified_split(chat_records, args.train_ratio, args.seed)

    # Write output files
    train_path = data_dir / "training.jsonl"
    eval_path = data_dir / "evaluation.jsonl"

    # Overwrite (not append)
    train_path.write_text(
        "\n".join(json.dumps(rec, ensure_ascii=False) for rec in train_records) + "\n",
        encoding="utf-8",
    )
    eval_path.write_text(
        "\n".join(json.dumps(rec, ensure_ascii=False) for rec in eval_records) + "\n",
        encoding="utf-8",
    )

    logger.info("Written %d training records to %s", len(train_records), train_path)
    logger.info("Written %d evaluation records to %s", len(eval_records), eval_path)

    # Print summary
    print_summary(train_records, eval_records)


if __name__ == "__main__":
    main()
