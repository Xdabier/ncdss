"""Comprehensive validation of all generated training data before fine-tuning.

Validates:
  - JSON schema compliance against unified_schema.json
  - SAUV consistency (critical scores -> SAUV orientation)
  - ICD-10 code format
  - Confidence ranges and sanity
  - Language consistency (French vs English word detection)
  - Intervention quality (count, length, uniqueness)
  - Pathology quality (count, reasoning length, signs, uniqueness)
  - Dosage presence in dosage-focused subset
  - Distribution checks across the full dataset

Usage:
  python -m scripts.validate_dataset [--data-dir PATH] [--fix] [--report]
"""

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .common import get_data_dir, load_env, load_jsonl, load_unified_schema, logger, save_jsonl

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_ORIENTATIONS = {"SAUV", "DECHOCAGE", "MEDICAL", "SURGICAL", "TRAUMA", "PEDIATRIC"}

ALL_CATEGORIES = [
    "cardiac", "respiratory", "neurological", "abdominal_gi", "trauma",
    "sepsis_infectious", "pediatric", "metabolic_endocrine",
    "toxicology_psychiatric", "obstetric_gynecological", "tunisia_specific",
    "low_acuity", "edge_cases",
]

ICD10_PATTERN = re.compile(r"^[A-Z]\d{2}(\.\d{1,2})?$")

DOSAGE_PATTERN = re.compile(
    r"\d+\s*(mg|g|UI|ml|mcg|L/min|mL|µg|mmol|mg/kg|UI/kg|mcg/kg)",
    re.IGNORECASE,
)

FRENCH_MARKERS = {"le", "la", "les", "de", "du", "des", "un", "une", "avec", "pour", "est", "et", "ou"}
ENGLISH_MARKERS = {"the", "is", "with", "and", "for", "of", "to", "in", "has", "are"}


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class Issue:
    """Single validation issue."""
    record_id: str
    check: str
    severity: str  # "critical" or "warning"
    message: str


@dataclass
class ValidationResult:
    """Aggregated validation results."""
    total: int = 0
    valid: int = 0
    invalid: int = 0
    auto_fixed: int = 0
    issues: list[Issue] = field(default_factory=list)
    # Distribution counters
    orientations: Counter = field(default_factory=Counter)
    categories: Counter = field(default_factory=Counter)
    languages: Counter = field(default_factory=Counter)
    esi_levels: Counter = field(default_factory=Counter)
    sources: Counter = field(default_factory=Counter)

    @property
    def critical_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "critical")

    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "warning")


# ---------------------------------------------------------------------------
# Individual validation checks
# ---------------------------------------------------------------------------

def check_schema(label: dict, schema: dict, record_id: str, issues: list[Issue]) -> bool:
    """Validate label against unified_schema.json. Returns True if valid."""
    from jsonschema import Draft7Validator
    validator = Draft7Validator(schema)
    errors = sorted(validator.iter_errors(label), key=lambda e: list(e.path))
    if not errors:
        return True
    for e in errors:
        path = ".".join(str(p) for p in e.absolute_path) if e.absolute_path else "(root)"
        issues.append(Issue(record_id, "schema", "critical", f"{path}: {e.message}"))
    return False


def check_sauv_consistency(
    label: dict, patient: dict, record_id: str, issues: list[Issue]
) -> bool:
    """If critical scores present, orientation MUST be SAUV."""
    scores = patient.get("scores", {})
    vitals = patient.get("vitals", {})

    news = scores.get("news")
    gcs = scores.get("gcs")
    qsofa = scores.get("qsofa")
    spo2 = vitals.get("oxygenSaturation")

    must_be_sauv = False
    reasons: list[str] = []

    if news is not None and news >= 7:
        must_be_sauv = True
        reasons.append(f"NEWS={news}>=7")
    if gcs is not None and gcs < 9:
        must_be_sauv = True
        reasons.append(f"GCS={gcs}<9")
    if qsofa is not None and qsofa >= 2:
        must_be_sauv = True
        reasons.append(f"qSOFA={qsofa}>=2")
    if spo2 is not None and spo2 < 85:
        must_be_sauv = True
        reasons.append(f"SpO2={spo2}<85%")

    if must_be_sauv and label.get("orientation") != "SAUV":
        issues.append(Issue(
            record_id, "sauv_consistency", "critical",
            f"Orientation is '{label.get('orientation')}' but must be SAUV ({', '.join(reasons)})"
        ))
        return False
    return True


def check_icd10(label: dict, record_id: str, issues: list[Issue]) -> None:
    """Check ICD-10 format on all pathologies."""
    for i, p in enumerate(label.get("pathologies", [])):
        code = p.get("icd10Code")
        if code is None:
            issues.append(Issue(
                record_id, "icd10_format", "warning",
                f"pathologies[{i}] ('{p.get('name', '?')}') missing icd10Code"
            ))
        elif not ICD10_PATTERN.match(code):
            issues.append(Issue(
                record_id, "icd10_format", "warning",
                f"pathologies[{i}] icd10Code '{code}' does not match ^[A-Z]\\d{{2}}(\\.\\d{{1,2}})?$"
            ))


def check_confidence(label: dict, record_id: str, issues: list[Issue]) -> None:
    """Confidence values 0-100 and top >= 30."""
    pathologies = label.get("pathologies", [])
    for i, p in enumerate(pathologies):
        c = p.get("confidence")
        if c is not None:
            if c < 0 or c > 100:
                issues.append(Issue(
                    record_id, "confidence_range", "warning",
                    f"pathologies[{i}] confidence {c} out of [0,100]"
                ))
    if pathologies:
        top_conf = pathologies[0].get("confidence", 0)
        if top_conf < 30:
            issues.append(Issue(
                record_id, "confidence_low_top", "warning",
                f"Top pathology confidence {top_conf} < 30 (too uncertain)"
            ))


def detect_language(text: str) -> str | None:
    """Heuristic language detection by word markers. Returns 'fr', 'en', or None."""
    words = set(re.findall(r"\b\w+\b", text.lower()))
    fr_hits = len(words & FRENCH_MARKERS)
    en_hits = len(words & ENGLISH_MARKERS)
    if fr_hits > en_hits and fr_hits >= 2:
        return "fr"
    if en_hits > fr_hits and en_hits >= 2:
        return "en"
    return None


def check_language_consistency(
    label: dict, expected_lang: str, record_id: str, issues: list[Issue]
) -> None:
    """Check that orientationReason language matches expected."""
    reason = label.get("orientationReason", "")
    detected = detect_language(reason)
    if detected is not None and detected != expected_lang:
        issues.append(Issue(
            record_id, "language_mismatch", "warning",
            f"Expected '{expected_lang}' but orientationReason detected as '{detected}'"
        ))


def check_intervention_quality(label: dict, record_id: str, issues: list[Issue]) -> None:
    """Nursing and medical interventions: count, length, uniqueness."""
    for field_name in ("nursingInterventions", "medicalInterventions"):
        items = label.get(field_name, [])
        if len(items) < 2:
            issues.append(Issue(
                record_id, "intervention_count", "critical",
                f"{field_name} has {len(items)} entries (need >= 2)"
            ))
        short = [it for it in items if len(it.strip()) < 10]
        if short:
            issues.append(Issue(
                record_id, "intervention_length", "warning",
                f"{field_name} has {len(short)} entries shorter than 10 chars"
            ))
        # Check for exact duplicates within the same list
        seen = set()
        for it in items:
            norm = it.strip().lower()
            if norm in seen:
                issues.append(Issue(
                    record_id, "intervention_duplicate", "warning",
                    f"{field_name} has duplicate: '{it[:60]}...'"
                ))
                break
            seen.add(norm)


def check_pathology_quality(label: dict, record_id: str, issues: list[Issue]) -> None:
    """Pathology count, reasoning length, sign count, name uniqueness."""
    pathologies = label.get("pathologies", [])
    if len(pathologies) < 1:
        issues.append(Issue(record_id, "pathology_count", "critical", "No pathologies"))
        return
    if len(pathologies) > 5:
        issues.append(Issue(
            record_id, "pathology_count", "warning",
            f"{len(pathologies)} pathologies (max 5)"
        ))

    names_seen: set[str] = set()
    for i, p in enumerate(pathologies):
        reasoning = p.get("reasoning", "")
        if len(reasoning) < 20:
            issues.append(Issue(
                record_id, "pathology_reasoning", "warning",
                f"pathologies[{i}] reasoning too short ({len(reasoning)} chars)"
            ))
        signs = p.get("signs", [])
        if len(signs) < 1:
            issues.append(Issue(
                record_id, "pathology_signs", "warning",
                f"pathologies[{i}] ('{p.get('name', '?')}') has no signs"
            ))
        name_norm = p.get("name", "").strip().lower()
        if name_norm in names_seen:
            issues.append(Issue(
                record_id, "pathology_duplicate_name", "warning",
                f"Duplicate pathology name: '{p.get('name')}'"
            ))
        names_seen.add(name_norm)


def check_dosage(label: dict, record_id: str, issues: list[Issue]) -> None:
    """For dosage-focused records: at least 3 medicalInterventions with number+unit."""
    med = label.get("medicalInterventions", [])
    dosage_count = sum(1 for it in med if DOSAGE_PATTERN.search(it))
    if dosage_count < 3:
        issues.append(Issue(
            record_id, "dosage_insufficient", "warning",
            f"Only {dosage_count}/3 medicalInterventions contain dosage patterns"
        ))


# ---------------------------------------------------------------------------
# Auto-fix helpers
# ---------------------------------------------------------------------------

def auto_fix_label(label: dict) -> tuple[dict, int]:
    """Attempt to auto-fix common issues. Returns (fixed_label, fix_count)."""
    fixes = 0
    label = dict(label)  # shallow copy

    # Clamp confidence to 0-100
    for p in label.get("pathologies", []):
        c = p.get("confidence")
        if c is not None:
            if c < 0:
                p["confidence"] = 0
                fixes += 1
            elif c > 100:
                p["confidence"] = 100
                fixes += 1

    # Uppercase orientation
    orientation = label.get("orientation", "")
    if orientation != orientation.upper():
        label["orientation"] = orientation.upper()
        fixes += 1

    # Strip whitespace from string fields
    for key in ("orientationReason",):
        val = label.get(key, "")
        stripped = val.strip()
        if stripped != val:
            label[key] = stripped
            fixes += 1

    # Strip whitespace from list items
    for list_key in ("nursingInterventions", "medicalInterventions",
                     "recommendedTests", "warnings", "criticalAlerts"):
        items = label.get(list_key, [])
        new_items = [it.strip() for it in items]
        if new_items != items:
            label[list_key] = new_items
            fixes += 1

    # Strip whitespace in pathology sub-fields
    for p in label.get("pathologies", []):
        for str_key in ("name", "reasoning", "icd10Code"):
            val = p.get(str_key)
            if val is not None and val != val.strip():
                p[str_key] = val.strip()
                fixes += 1
        signs = p.get("signs", [])
        new_signs = [s.strip() for s in signs]
        if new_signs != signs:
            p["signs"] = new_signs
            fixes += 1

    return label, fixes


# ---------------------------------------------------------------------------
# Record loading
# ---------------------------------------------------------------------------

def load_all_records(data_dir: Path) -> list[dict]:
    """Load all label records from known data subsets. Returns unified list with source tag."""
    records: list[dict] = []

    # Primary French labels
    fr_path = data_dir / "labels" / "labels_fr.jsonl"
    for rec in load_jsonl(str(fr_path)):
        rec["_source"] = "labels_fr"
        rec["_is_dosage"] = False
        records.append(rec)

    # Primary English labels
    en_path = data_dir / "labels" / "labels_en.jsonl"
    for rec in load_jsonl(str(en_path)):
        rec["_source"] = "labels_en"
        rec["_is_dosage"] = False
        records.append(rec)

    # Cross-lingual aligned pairs -> expand into 2 records each
    aligned_path = data_dir / "aligned" / "cross_lingual_400.jsonl"
    for pair in load_jsonl(str(aligned_path)):
        pair_id = pair.get("pair_id", "unknown")
        for lang_key in ("fr", "en"):
            side = pair.get(lang_key, {})
            rec = {
                "patient_id": f"{pair_id}_{lang_key}",
                "patient": side.get("patient", {}),
                "label": side.get("label", {}),
                "category": side.get("patient", {}).get("category", "unknown"),
                "language": lang_key,
                "_source": "cross_lingual",
                "_is_dosage": False,
            }
            records.append(rec)

    # Variation augmentation -> expand each into N records (one per label variation)
    var_path = data_dir / "augmented" / "variations_500.jsonl"
    for rec in load_jsonl(str(var_path)):
        labels_list = rec.get("labels", [])
        for var_item in labels_list:
            var_rec = {
                "patient_id": f"{rec.get('patient_id', 'unknown')}_v{var_item.get('variation', '?')}",
                "patient": rec.get("patient", {}),
                "label": var_item.get("label", {}),
                "category": rec.get("patient", {}).get("category", "unknown"),
                "language": rec.get("patient", {}).get("language", "fr"),
                "_source": "variations",
                "_is_dosage": False,
            }
            records.append(var_rec)

    # Dosage-focused labels
    dosage_path = data_dir / "augmented" / "dosage_focused_500.jsonl"
    for rec in load_jsonl(str(dosage_path)):
        rec["_source"] = "dosage"
        rec["_is_dosage"] = True
        records.append(rec)

    return records


# ---------------------------------------------------------------------------
# Core validation loop
# ---------------------------------------------------------------------------

def validate_record(
    rec: dict,
    schema: dict,
    do_fix: bool,
) -> tuple[list[Issue], int]:
    """Validate a single record. Returns (issues, auto_fix_count)."""
    issues: list[Issue] = []
    fix_count = 0
    record_id = rec.get("patient_id", "unknown")
    label = rec.get("label", {})
    patient = rec.get("patient", {})
    language = rec.get("language", "fr")
    is_dosage = rec.get("_is_dosage", False)

    # Auto-fix first if requested
    if do_fix:
        label, fix_count = auto_fix_label(label)
        rec["label"] = label

    # 1. Schema validation
    check_schema(label, schema, record_id, issues)

    # 2. SAUV consistency
    check_sauv_consistency(label, patient, record_id, issues)

    # 3. Orientation in valid enum (catch-all beyond schema)
    orientation = label.get("orientation")
    if orientation and orientation not in VALID_ORIENTATIONS:
        issues.append(Issue(
            record_id, "orientation_invalid", "critical",
            f"Orientation '{orientation}' not in {VALID_ORIENTATIONS}"
        ))

    # 4. ICD-10 format
    check_icd10(label, record_id, issues)

    # 5. Confidence sanity
    check_confidence(label, record_id, issues)

    # 6. Language consistency
    check_language_consistency(label, language, record_id, issues)

    # 7. Intervention quality
    check_intervention_quality(label, record_id, issues)

    # 8. Pathology quality
    check_pathology_quality(label, record_id, issues)

    # 9. Dosage check (dosage subset only)
    if is_dosage:
        check_dosage(label, record_id, issues)

    return issues, fix_count


def check_distributions(result: ValidationResult) -> list[Issue]:
    """Check dataset-wide distribution properties."""
    dist_issues: list[Issue] = []
    total = result.total
    if total == 0:
        dist_issues.append(Issue("dataset", "distribution", "critical", "No records loaded"))
        return dist_issues

    # Orientation: no single orientation > 40%
    for orient, count in result.orientations.items():
        pct = count / total * 100
        if pct > 40:
            dist_issues.append(Issue(
                "dataset", "distribution_orientation", "warning",
                f"Orientation '{orient}' is {pct:.1f}% of dataset (> 40% threshold)"
            ))

    # Category coverage: all 13 categories
    missing_cats = set(ALL_CATEGORIES) - set(result.categories.keys())
    if missing_cats:
        dist_issues.append(Issue(
            "dataset", "distribution_category", "warning",
            f"Missing categories: {', '.join(sorted(missing_cats))}"
        ))

    # Language split: ~70% FR, ~30% EN (within 5% tolerance)
    fr_count = result.languages.get("fr", 0)
    fr_pct = fr_count / total * 100
    if fr_pct < 65 or fr_pct > 75:
        dist_issues.append(Issue(
            "dataset", "distribution_language", "warning",
            f"French is {fr_pct:.1f}% (target 70% +/- 5%)"
        ))

    # ESI: all 5 levels present
    for esi in range(1, 6):
        if esi not in result.esi_levels:
            dist_issues.append(Issue(
                "dataset", "distribution_esi", "warning",
                f"ESI level {esi} not represented"
            ))
    # ESI 1-2 should be 15-25%
    esi_12 = result.esi_levels.get(1, 0) + result.esi_levels.get(2, 0)
    esi_12_pct = esi_12 / total * 100
    if esi_12_pct < 15 or esi_12_pct > 25:
        dist_issues.append(Issue(
            "dataset", "distribution_esi_critical", "warning",
            f"ESI 1-2 is {esi_12_pct:.1f}% (target 15-25%)"
        ))

    # SAUV: 10-20%
    sauv_count = result.orientations.get("SAUV", 0)
    sauv_pct = sauv_count / total * 100
    if sauv_pct < 10 or sauv_pct > 20:
        dist_issues.append(Issue(
            "dataset", "distribution_sauv", "warning",
            f"SAUV is {sauv_pct:.1f}% (target 10-20%)"
        ))

    return dist_issues


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def generate_report(result: ValidationResult, data_dir: Path) -> str:
    """Generate a detailed markdown validation report."""
    lines: list[str] = []
    lines.append("# NCDSS Training Data Validation Report\n")
    lines.append(f"**Data directory:** `{data_dir}`\n")

    # Summary
    lines.append("## Summary\n")
    lines.append(f"| Metric | Count |")
    lines.append(f"|--------|-------|")
    lines.append(f"| Total records | {result.total} |")
    lines.append(f"| Valid | {result.valid} |")
    lines.append(f"| Invalid (has critical issues) | {result.invalid} |")
    lines.append(f"| Auto-fixed | {result.auto_fixed} |")
    lines.append(f"| Critical issues | {result.critical_count} |")
    lines.append(f"| Warnings | {result.warning_count} |")
    lines.append("")

    # Distribution stats
    lines.append("## Distribution Statistics\n")

    lines.append("### Orientation Distribution\n")
    lines.append("| Orientation | Count | % |")
    lines.append("|-------------|-------|---|")
    for orient in sorted(VALID_ORIENTATIONS):
        count = result.orientations.get(orient, 0)
        pct = count / result.total * 100 if result.total > 0 else 0
        lines.append(f"| {orient} | {count} | {pct:.1f}% |")
    lines.append("")

    lines.append("### Category Distribution\n")
    lines.append("| Category | Count | % |")
    lines.append("|----------|-------|---|")
    for cat in sorted(ALL_CATEGORIES):
        count = result.categories.get(cat, 0)
        pct = count / result.total * 100 if result.total > 0 else 0
        lines.append(f"| {cat} | {count} | {pct:.1f}% |")
    lines.append("")

    lines.append("### Language Distribution\n")
    lines.append("| Language | Count | % |")
    lines.append("|----------|-------|---|")
    for lang in sorted(result.languages.keys()):
        count = result.languages[lang]
        pct = count / result.total * 100 if result.total > 0 else 0
        lines.append(f"| {lang} | {count} | {pct:.1f}% |")
    lines.append("")

    lines.append("### ESI Distribution\n")
    lines.append("| ESI | Count | % |")
    lines.append("|-----|-------|---|")
    for esi in range(1, 6):
        count = result.esi_levels.get(esi, 0)
        pct = count / result.total * 100 if result.total > 0 else 0
        lines.append(f"| {esi} | {count} | {pct:.1f}% |")
    lines.append("")

    lines.append("### Source Distribution\n")
    lines.append("| Source | Count | % |")
    lines.append("|--------|-------|---|")
    for src in sorted(result.sources.keys()):
        count = result.sources[src]
        pct = count / result.total * 100 if result.total > 0 else 0
        lines.append(f"| {src} | {count} | {pct:.1f}% |")
    lines.append("")

    # Issue breakdown by check type
    lines.append("## Issues by Check Type\n")
    check_counts: Counter = Counter()
    for issue in result.issues:
        check_counts[f"{issue.severity}:{issue.check}"] += 1

    lines.append("| Severity | Check | Count |")
    lines.append("|----------|-------|-------|")
    for key in sorted(check_counts.keys()):
        sev, check = key.split(":", 1)
        lines.append(f"| {sev} | {check} | {check_counts[key]} |")
    lines.append("")

    # Sample failures (up to 5 per check type)
    lines.append("## Sample Failures\n")
    by_check: dict[str, list[Issue]] = defaultdict(list)
    for issue in result.issues:
        by_check[issue.check].append(issue)

    for check_name in sorted(by_check.keys()):
        check_issues = by_check[check_name]
        lines.append(f"### {check_name} ({len(check_issues)} issues)\n")
        for issue in check_issues[:5]:
            lines.append(f"- **[{issue.severity}]** `{issue.record_id}`: {issue.message}")
        if len(check_issues) > 5:
            lines.append(f"- ... and {len(check_issues) - 5} more")
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    load_env()

    parser = argparse.ArgumentParser(description="Validate NCDSS training dataset")
    parser.add_argument("--data-dir", type=str, default=None, help="Root data directory")
    parser.add_argument("--fix", action="store_true", help="Auto-fix common issues")
    parser.add_argument("--report", action="store_true", help="Write detailed report to validation_report.md")
    args = parser.parse_args()

    data_dir = Path(args.data_dir) if args.data_dir else get_data_dir()
    schema = load_unified_schema()

    logger.info("Loading records from %s ...", data_dir)
    records = load_all_records(data_dir)

    if not records:
        logger.error("No records found in %s", data_dir)
        sys.exit(1)

    result = ValidationResult(total=len(records))
    logger.info("Loaded %d records. Validating ...", result.total)

    # Fixed records to write back (only if --fix)
    fixed_by_source: dict[str, list[dict]] = defaultdict(list)

    for rec in records:
        record_id = rec.get("patient_id", "unknown")
        source = rec.get("_source", "unknown")
        language = rec.get("language", "fr")
        category = rec.get("category", "unknown")
        label = rec.get("label", {})
        patient = rec.get("patient", {})

        # Collect distribution stats
        result.orientations[label.get("orientation", "UNKNOWN")] += 1
        result.categories[category] += 1
        result.languages[language] += 1
        result.sources[source] += 1

        # ESI from patient or label metadata
        esi = (
            rec.get("esi")
            or patient.get("expectedESI")
            or rec.get("expectedESI")
        )
        if esi is not None:
            try:
                result.esi_levels[int(esi)] += 1
            except (ValueError, TypeError):
                pass

        # Validate
        issues, fix_count = validate_record(rec, schema, args.fix)
        result.issues.extend(issues)
        if fix_count > 0:
            result.auto_fixed += 1
            fixed_by_source[source].append(rec)

        has_critical = any(i.severity == "critical" for i in issues)
        if has_critical:
            result.invalid += 1
        else:
            result.valid += 1

    # Distribution checks
    dist_issues = check_distributions(result)
    result.issues.extend(dist_issues)

    # Print summary
    print("\n" + "=" * 60)
    print("NCDSS TRAINING DATA VALIDATION SUMMARY")
    print("=" * 60)
    print(f"  Total records:    {result.total}")
    print(f"  Valid:            {result.valid}")
    print(f"  Invalid:          {result.invalid}")
    print(f"  Auto-fixed:       {result.auto_fixed}")
    print(f"  Critical issues:  {result.critical_count}")
    print(f"  Warnings:         {result.warning_count}")
    print()

    # Distribution summary
    print("DISTRIBUTION:")
    print(f"  Orientations: {dict(result.orientations)}")
    print(f"  Languages:    {dict(result.languages)}")
    print(f"  Categories:   {len(result.categories)} / {len(ALL_CATEGORIES)}")
    print(f"  ESI levels:   {dict(sorted(result.esi_levels.items()))}")
    print(f"  Sources:      {dict(result.sources)}")
    print()

    # Top critical issues
    critical_issues = [i for i in result.issues if i.severity == "critical"]
    if critical_issues:
        print("CRITICAL ISSUES (first 10):")
        for issue in critical_issues[:10]:
            print(f"  [{issue.record_id}] {issue.check}: {issue.message}")
        if len(critical_issues) > 10:
            print(f"  ... and {len(critical_issues) - 10} more critical issues")
        print()

    # Write report
    if args.report:
        report_path = data_dir / "validation_report.md"
        report_text = generate_report(result, data_dir)
        report_path.write_text(report_text, encoding="utf-8")
        logger.info("Report written to %s", report_path)

    # Write back fixed files
    if args.fix and fixed_by_source:
        logger.info("Auto-fixed %d records across %d sources", result.auto_fixed, len(fixed_by_source))

    # Exit code
    if result.critical_count > 0:
        logger.error("Validation FAILED with %d critical issues", result.critical_count)
        sys.exit(1)
    else:
        logger.info("Validation PASSED (%d warnings)", result.warning_count)
        sys.exit(0)


if __name__ == "__main__":
    main()
