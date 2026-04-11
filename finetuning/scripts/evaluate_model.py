"""Evaluate a fine-tuned GGUF model against the held-out evaluation set.

Computes all metrics from Phase 3 of the fine-tuning plan:
  - Structure: JSON validity, schema compliance
  - Orientation: accuracy, SAUV sensitivity/specificity, confusion matrix
  - Pathologies: top-1/top-3 accuracy, urgency, ICD-10, emergent sensitivity
  - Interventions: nursing/medical/tests overlap (Jaccard similarity)
  - Performance: latency P50/P95/mean, tokens per second

Outputs:
  - evaluation_report.md   — human-readable report with pass/fail verdicts
  - evaluation_results.json — machine-readable per-sample results + aggregated metrics

Usage:
  python -m scripts.evaluate_model [--eval-file PATH] [--model-path PATH]
    [--baseline-logs PATH] [--output PATH] [--max-samples N] [--gpu-layers N]
"""

import argparse
import json
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .common import get_data_dir, load_env, load_jsonl, load_unified_schema, logger

# ---------------------------------------------------------------------------
# Optional dependency checks
# ---------------------------------------------------------------------------

try:
    from llama_cpp import Llama
except ImportError:
    Llama = None  # type: ignore[assignment,misc]

try:
    import jsonschema
except ImportError:
    jsonschema = None  # type: ignore[assignment]

try:
    from Levenshtein import distance as levenshtein_distance
except ImportError:
    levenshtein_distance = None  # type: ignore[assignment]

try:
    from unidecode import unidecode
except ImportError:
    unidecode = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_ORIENTATIONS = ["SAUV", "DECHOCAGE", "MEDICAL", "SURGICAL", "TRAUMA", "PEDIATRIC"]
VALID_URGENCIES = ["routine", "urgent", "emergent"]

SYSTEM_MESSAGE_FR = "Tu es un assistant medical d'urgence experimente."
SYSTEM_MESSAGE_EN = "You are an experienced emergency medicine assistant."

# Acceptance criteria from plan Section 3.5
ACCEPTANCE_CRITERIA = {
    "json_valid_rate": 100.0,
    "orientation_accuracy": 85.0,
    "sauv_sensitivity": 95.0,
    "top3_recall": 80.0,
    "emergent_sensitivity": 95.0,
    "latency_p50": 3.0,
    "latency_p95": 5.0,
}

# Reference baselines from benchmark logs (plan Section 3.4)
REFERENCE_BASELINES = {
    "Qwen3-0.6B Q8_0 (base)": {"latency_mean": 9.0},
    "Qwen3-4B Q4_K_M (base)": {"latency_mean": 202.0},
}


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class SampleResult:
    """Result from evaluating a single sample."""
    sample_idx: int
    language: str
    category: str

    # Raw
    ground_truth: dict = field(default_factory=dict)
    prediction: dict = field(default_factory=dict)
    raw_output: str = ""

    # Structure
    json_valid: bool = False
    schema_compliant: bool = False
    schema_errors: list[str] = field(default_factory=list)

    # Orientation
    gt_orientation: str = ""
    pred_orientation: str = ""
    orientation_correct: bool = False

    # Pathologies
    top1_correct: bool = False
    top3_recall: bool = False
    urgency_correct: bool = False
    icd10_correct: bool = False
    gt_urgency: str = ""
    pred_urgency: str = ""

    # Interventions (Jaccard)
    nursing_jaccard: float = 0.0
    medical_jaccard: float = 0.0
    tests_jaccard: float = 0.0

    # Performance
    latency_seconds: float = 0.0
    output_tokens: int = 0
    tokens_per_second: float = 0.0

    # Error
    error: str = ""


# ---------------------------------------------------------------------------
# String matching utilities
# ---------------------------------------------------------------------------

def normalize_text(text: str) -> str:
    """Lowercase, strip accents, strip whitespace."""
    text = text.strip().lower()
    if unidecode is not None:
        text = unidecode(text)
    return text


def fuzzy_match(a: str, b: str, max_distance: int = 3) -> bool:
    """Check if two strings match within Levenshtein distance threshold."""
    na = normalize_text(a)
    nb = normalize_text(b)
    if na == nb:
        return True
    if levenshtein_distance is not None:
        return levenshtein_distance(na, nb) <= max_distance
    # Fallback: substring containment if Levenshtein not available
    return na in nb or nb in na


def jaccard_similarity(set_a: set[str], set_b: set[str]) -> float:
    """Compute Jaccard similarity between two sets of lowercased strings."""
    if not set_a and not set_b:
        return 1.0
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def to_lowercase_set(items: list[str]) -> set[str]:
    """Convert a list of strings to a set of lowercased, stripped strings."""
    return {s.strip().lower() for s in items if s.strip()}


# ---------------------------------------------------------------------------
# Grammar-compatible schema
# ---------------------------------------------------------------------------

# Keys that llama-cpp-python's JSON-to-GBNF converter cannot handle.
# These are validated post-hoc against the full schema instead.
_UNSUPPORTED_KEYS = {"pattern", "minimum", "maximum", "minItems", "maxItems"}


def _strip_unsupported(obj: Any) -> Any:
    """Recursively strip JSON Schema keys unsupported by llama-cpp-python's GBNF converter."""
    if isinstance(obj, dict):
        return {k: _strip_unsupported(v) for k, v in obj.items() if k not in _UNSUPPORTED_KEYS}
    if isinstance(obj, list):
        return [_strip_unsupported(item) for item in obj]
    return obj


def build_grammar_schema(full_schema: dict[str, Any]) -> dict[str, Any]:
    """Build a GBNF-compatible schema from the full unified schema.

    Strips ``pattern``, ``minimum``/``maximum``, and ``minItems``/``maxItems``
    which the llama-cpp-python JSON-to-GBNF converter cannot translate.
    The full schema is still used for post-hoc validation via jsonschema.
    """
    return _strip_unsupported(full_schema)


# ---------------------------------------------------------------------------
# Model inference
# ---------------------------------------------------------------------------

def run_inference(
    model: Any,
    system_msg: str,
    user_msg: str,
    grammar_schema: dict[str, Any],
    max_tokens: int = 800,
    temperature: float = 0.1,
) -> tuple[str, float, int]:
    """Run inference with JSON schema grammar constraint.

    Uses create_chat_completion() with response_format to enforce valid JSON
    output matching the unified schema. This is critical for small models —
    without grammar constraint they generate unstructured text.

    The grammar_schema must be pre-stripped of unsupported keys (pattern,
    minimum/maximum, minItems/maxItems) via build_grammar_schema().
    """
    start = time.perf_counter()
    result = model.create_chat_completion(
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
        response_format={
            "type": "json_object",
            "schema": grammar_schema,
        },
    )
    elapsed = time.perf_counter() - start

    text = result["choices"][0]["message"]["content"].strip()
    n_tokens = result["usage"]["completion_tokens"]

    return text, elapsed, n_tokens


# ---------------------------------------------------------------------------
# Per-sample evaluation
# ---------------------------------------------------------------------------

def evaluate_sample(
    idx: int,
    record: dict,
    model: Any,
    schema: dict,
    grammar_schema: dict,
) -> SampleResult:
    """Evaluate a single sample from the evaluation JSONL."""
    messages = record.get("messages", [])
    language = record.get("language", "fr")
    category = record.get("category", "unknown")

    # Extract system, user, assistant messages
    system_msg = ""
    user_msg = ""
    gt_text = ""
    for msg in messages:
        role = msg.get("role", "")
        if role == "system":
            system_msg = msg["content"]
        elif role == "user":
            user_msg = msg["content"]
        elif role == "assistant":
            gt_text = msg["content"]

    if not system_msg:
        system_msg = SYSTEM_MESSAGE_FR if language == "fr" else SYSTEM_MESSAGE_EN

    result = SampleResult(
        sample_idx=idx,
        language=language,
        category=category,
    )

    # Parse ground truth
    try:
        result.ground_truth = json.loads(gt_text)
    except (json.JSONDecodeError, TypeError):
        result.error = "Failed to parse ground truth JSON"
        return result

    result.gt_orientation = result.ground_truth.get("orientation", "")

    # Run inference with grammar constraint (grammar_schema has unsupported keys stripped)
    try:
        raw_output, latency, n_tokens = run_inference(model, system_msg, user_msg, grammar_schema)
    except Exception as e:
        result.error = f"Inference error: {e}"
        result.latency_seconds = 0.0
        return result

    result.raw_output = raw_output
    result.latency_seconds = latency
    result.output_tokens = n_tokens
    result.tokens_per_second = n_tokens / latency if latency > 0 else 0.0

    # JSON parse
    try:
        result.prediction = json.loads(raw_output)
        result.json_valid = True
    except (json.JSONDecodeError, TypeError):
        result.json_valid = False
        result.error = "Model output is not valid JSON"
        return result

    # Schema validation
    if jsonschema is not None:
        validator = jsonschema.Draft7Validator(schema)
        errors = sorted(validator.iter_errors(result.prediction), key=lambda e: list(e.path))
        if not errors:
            result.schema_compliant = True
        else:
            result.schema_compliant = False
            result.schema_errors = [
                f"{'.'.join(str(p) for p in e.absolute_path)}: {e.message}" if e.absolute_path else e.message
                for e in errors[:5]
            ]
    else:
        # Cannot validate without jsonschema
        result.schema_compliant = True

    # --- Orientation ---
    result.pred_orientation = result.prediction.get("orientation", "")
    result.orientation_correct = result.gt_orientation == result.pred_orientation

    # --- Pathologies ---
    gt_pathologies = result.ground_truth.get("pathologies", [])
    pred_pathologies = result.prediction.get("pathologies", [])

    if gt_pathologies and pred_pathologies:
        gt_top_name = gt_pathologies[0].get("name", "")
        pred_top_name = pred_pathologies[0].get("name", "")

        # Top-1: fuzzy match of top pathology name
        result.top1_correct = fuzzy_match(gt_top_name, pred_top_name)

        # Top-3 recall: ground truth top pathology appears in model's top 3
        pred_top3_names = [p.get("name", "") for p in pred_pathologies[:3]]
        result.top3_recall = any(fuzzy_match(gt_top_name, pn) for pn in pred_top3_names)

        # Urgency accuracy for top pathology
        gt_urgency = gt_pathologies[0].get("urgency", "")
        pred_urgency = pred_pathologies[0].get("urgency", "")
        result.gt_urgency = gt_urgency
        result.pred_urgency = pred_urgency
        result.urgency_correct = gt_urgency == pred_urgency

        # ICD-10 for top pathology
        gt_icd = gt_pathologies[0].get("icd10Code", "")
        pred_icd = pred_pathologies[0].get("icd10Code", "")
        result.icd10_correct = bool(gt_icd and pred_icd and gt_icd == pred_icd)

    # --- Interventions (Jaccard) ---
    gt_nursing = to_lowercase_set(result.ground_truth.get("nursingInterventions", []))
    pred_nursing = to_lowercase_set(result.prediction.get("nursingInterventions", []))
    result.nursing_jaccard = jaccard_similarity(gt_nursing, pred_nursing)

    gt_medical = to_lowercase_set(result.ground_truth.get("medicalInterventions", []))
    pred_medical = to_lowercase_set(result.prediction.get("medicalInterventions", []))
    result.medical_jaccard = jaccard_similarity(gt_medical, pred_medical)

    gt_tests = to_lowercase_set(result.ground_truth.get("recommendedTests", []))
    pred_tests = to_lowercase_set(result.prediction.get("recommendedTests", []))
    result.tests_jaccard = jaccard_similarity(gt_tests, pred_tests)

    return result


# ---------------------------------------------------------------------------
# Aggregate metrics
# ---------------------------------------------------------------------------

def compute_metrics(results: list[SampleResult]) -> dict[str, Any]:
    """Compute aggregate metrics from all sample results."""
    total = len(results)
    if total == 0:
        return {}

    # Structure
    json_valid = sum(1 for r in results if r.json_valid)
    schema_compliant = sum(1 for r in results if r.schema_compliant)

    # Only compute clinical metrics on valid JSON results
    valid_results = [r for r in results if r.json_valid]
    n_valid = len(valid_results)

    # Orientation
    orientation_correct = sum(1 for r in valid_results if r.orientation_correct)

    # SAUV sensitivity: of cases where GT is SAUV, % predicted SAUV
    gt_sauv = [r for r in valid_results if r.gt_orientation == "SAUV"]
    sauv_tp = sum(1 for r in gt_sauv if r.pred_orientation == "SAUV")
    sauv_sensitivity = (sauv_tp / len(gt_sauv) * 100) if gt_sauv else 100.0

    # SAUV specificity: of cases where GT is NOT SAUV, % predicted NOT SAUV
    gt_not_sauv = [r for r in valid_results if r.gt_orientation != "SAUV"]
    sauv_tn = sum(1 for r in gt_not_sauv if r.pred_orientation != "SAUV")
    sauv_specificity = (sauv_tn / len(gt_not_sauv) * 100) if gt_not_sauv else 100.0

    # Orientation confusion matrix
    orientation_cm: dict[str, dict[str, int]] = {
        gt: {pred: 0 for pred in VALID_ORIENTATIONS}
        for gt in VALID_ORIENTATIONS
    }
    for r in valid_results:
        gt_o = r.gt_orientation
        pred_o = r.pred_orientation
        if gt_o in orientation_cm and pred_o in orientation_cm.get(gt_o, {}):
            orientation_cm[gt_o][pred_o] += 1

    # Pathologies — only on samples that have pathologies in both GT and prediction
    has_pathologies = [r for r in valid_results if r.ground_truth.get("pathologies") and r.prediction.get("pathologies")]
    n_pathologies = len(has_pathologies)

    top1_correct = sum(1 for r in has_pathologies if r.top1_correct)
    top3_recall = sum(1 for r in has_pathologies if r.top3_recall)
    urgency_correct = sum(1 for r in has_pathologies if r.urgency_correct)
    icd10_correct = sum(1 for r in has_pathologies if r.icd10_correct)

    # Emergent sensitivity: of GT emergent cases, % model also rated emergent
    gt_emergent = [r for r in has_pathologies if r.gt_urgency == "emergent"]
    emergent_tp = sum(1 for r in gt_emergent if r.pred_urgency == "emergent")
    emergent_sensitivity = (emergent_tp / len(gt_emergent) * 100) if gt_emergent else 100.0

    # Interventions
    nursing_jaccards = [r.nursing_jaccard for r in valid_results]
    medical_jaccards = [r.medical_jaccard for r in valid_results]
    tests_jaccards = [r.tests_jaccard for r in valid_results]

    # Performance
    latencies = sorted([r.latency_seconds for r in results if r.latency_seconds > 0])
    tps_values = [r.tokens_per_second for r in results if r.tokens_per_second > 0]

    def percentile(data: list[float], p: float) -> float:
        if not data:
            return 0.0
        k = (len(data) - 1) * (p / 100.0)
        f = int(k)
        c = f + 1
        if c >= len(data):
            return data[-1]
        return data[f] + (k - f) * (data[c] - data[f])

    metrics = {
        # Structure
        "json_valid_rate": json_valid / total * 100 if total else 0,
        "schema_compliant_rate": schema_compliant / total * 100 if total else 0,

        # Orientation
        "orientation_accuracy": orientation_correct / n_valid * 100 if n_valid else 0,
        "sauv_sensitivity": sauv_sensitivity,
        "sauv_specificity": sauv_specificity,
        "sauv_gt_count": len(gt_sauv),
        "sauv_tp_count": sauv_tp,
        "orientation_confusion_matrix": orientation_cm,

        # Pathologies
        "top1_accuracy": top1_correct / n_pathologies * 100 if n_pathologies else 0,
        "top3_recall": top3_recall / n_pathologies * 100 if n_pathologies else 0,
        "urgency_accuracy": urgency_correct / n_pathologies * 100 if n_pathologies else 0,
        "emergent_sensitivity": emergent_sensitivity,
        "emergent_gt_count": len(gt_emergent),
        "emergent_tp_count": emergent_tp,
        "icd10_accuracy": icd10_correct / n_pathologies * 100 if n_pathologies else 0,

        # Interventions
        "nursing_overlap": sum(nursing_jaccards) / len(nursing_jaccards) * 100 if nursing_jaccards else 0,
        "medical_overlap": sum(medical_jaccards) / len(medical_jaccards) * 100 if medical_jaccards else 0,
        "tests_overlap": sum(tests_jaccards) / len(tests_jaccards) * 100 if tests_jaccards else 0,

        # Performance
        "latency_p50": percentile(latencies, 50),
        "latency_p95": percentile(latencies, 95),
        "latency_mean": sum(latencies) / len(latencies) if latencies else 0,
        "tokens_per_second_mean": sum(tps_values) / len(tps_values) if tps_values else 0,

        # Counts
        "total_samples": total,
        "valid_json_count": json_valid,
        "valid_with_pathologies": n_pathologies,
    }

    return metrics


def compute_metrics_by_language(results: list[SampleResult]) -> dict[str, dict[str, Any]]:
    """Compute metrics separately for each language."""
    by_lang: dict[str, list[SampleResult]] = defaultdict(list)
    for r in results:
        by_lang[r.language].append(r)
    return {lang: compute_metrics(samples) for lang, samples in sorted(by_lang.items())}


# ---------------------------------------------------------------------------
# Baseline loading
# ---------------------------------------------------------------------------

def load_baselines(baseline_dir: Path) -> dict[str, Any]:
    """Load benchmark JSONL logs from baseline directory."""
    baselines: dict[str, Any] = {}
    if not baseline_dir.exists():
        return baselines

    for jsonl_file in sorted(baseline_dir.glob("*.jsonl")):
        for line in jsonl_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                model_name = entry.get("model", entry.get("modelName", "unknown"))
                latency = entry.get("latency", entry.get("totalTime", 0))
                if model_name not in baselines:
                    baselines[model_name] = {
                        "latencies": [],
                        "json_valid": 0,
                        "total": 0,
                    }
                baselines[model_name]["latencies"].append(latency / 1000 if latency > 100 else latency)
                baselines[model_name]["total"] += 1
                if entry.get("jsonValid", entry.get("parseSuccess", False)):
                    baselines[model_name]["json_valid"] += 1
            except (json.JSONDecodeError, KeyError):
                continue

    # Compute summary stats
    for model_name, data in baselines.items():
        lats = sorted(data["latencies"])
        if lats:
            data["latency_mean"] = sum(lats) / len(lats)
            data["latency_p50"] = lats[len(lats) // 2]
        else:
            data["latency_mean"] = 0
            data["latency_p50"] = 0

    return baselines


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def check_acceptance(metrics: dict[str, Any]) -> list[tuple[str, str, float, float, bool]]:
    """Check each acceptance criterion. Returns list of (name, description, actual, target, passed)."""
    checks = []

    checks.append((
        "json_valid_rate",
        "JSON parse rate (with grammar)",
        metrics.get("json_valid_rate", 0),
        ACCEPTANCE_CRITERIA["json_valid_rate"],
        metrics.get("json_valid_rate", 0) >= ACCEPTANCE_CRITERIA["json_valid_rate"],
    ))
    checks.append((
        "orientation_accuracy",
        "Orientation accuracy",
        metrics.get("orientation_accuracy", 0),
        ACCEPTANCE_CRITERIA["orientation_accuracy"],
        metrics.get("orientation_accuracy", 0) >= ACCEPTANCE_CRITERIA["orientation_accuracy"],
    ))
    checks.append((
        "sauv_sensitivity",
        "SAUV sensitivity (true SAUV -> predicted SAUV)",
        metrics.get("sauv_sensitivity", 0),
        ACCEPTANCE_CRITERIA["sauv_sensitivity"],
        metrics.get("sauv_sensitivity", 0) >= ACCEPTANCE_CRITERIA["sauv_sensitivity"],
    ))
    checks.append((
        "top3_recall",
        "Top-3 diagnostic recall",
        metrics.get("top3_recall", 0),
        ACCEPTANCE_CRITERIA["top3_recall"],
        metrics.get("top3_recall", 0) >= ACCEPTANCE_CRITERIA["top3_recall"],
    ))
    checks.append((
        "emergent_sensitivity",
        "Emergent sensitivity (FN rate <5%)",
        metrics.get("emergent_sensitivity", 0),
        ACCEPTANCE_CRITERIA["emergent_sensitivity"],
        metrics.get("emergent_sensitivity", 0) >= ACCEPTANCE_CRITERIA["emergent_sensitivity"],
    ))
    checks.append((
        "latency_p50",
        "Latency P50 (seconds)",
        metrics.get("latency_p50", 999),
        ACCEPTANCE_CRITERIA["latency_p50"],
        metrics.get("latency_p50", 999) <= ACCEPTANCE_CRITERIA["latency_p50"],
    ))
    checks.append((
        "latency_p95",
        "Latency P95 (seconds)",
        metrics.get("latency_p95", 999),
        ACCEPTANCE_CRITERIA["latency_p95"],
        metrics.get("latency_p95", 999) <= ACCEPTANCE_CRITERIA["latency_p95"],
    ))

    return checks


def pick_examples(results: list[SampleResult]) -> dict[str, SampleResult | None]:
    """Pick 5 illustrative examples: best, worst orientation, worst pathology, fastest, slowest."""
    valid = [r for r in results if r.json_valid]
    if not valid:
        return {k: None for k in ("best", "worst_orientation", "worst_pathology", "fastest", "slowest")}

    # Best: orientation correct + top1 correct + lowest latency
    best_candidates = [r for r in valid if r.orientation_correct and r.top1_correct]
    best = min(best_candidates, key=lambda r: r.latency_seconds) if best_candidates else valid[0]

    # Worst orientation: incorrect orientation with highest-confidence GT
    worst_orient_candidates = [r for r in valid if not r.orientation_correct]
    worst_orient = worst_orient_candidates[0] if worst_orient_candidates else None

    # Worst pathology: incorrect top-1 match
    worst_path_candidates = [r for r in valid if not r.top1_correct and r.ground_truth.get("pathologies")]
    worst_path = worst_path_candidates[0] if worst_path_candidates else None

    # Fastest / slowest by latency
    by_latency = sorted(valid, key=lambda r: r.latency_seconds)
    fastest = by_latency[0]
    slowest = by_latency[-1]

    return {
        "best": best,
        "worst_orientation": worst_orient,
        "worst_pathology": worst_path,
        "fastest": fastest,
        "slowest": slowest,
    }


def format_example(label: str, r: SampleResult | None) -> str:
    """Format a single example for the report."""
    if r is None:
        return f"### {label}\n\nNo matching sample found.\n"

    lines = [f"### {label} (sample #{r.sample_idx})\n"]
    lines.append(f"- **Language:** {r.language} | **Category:** {r.category}")
    lines.append(f"- **Latency:** {r.latency_seconds:.2f}s | **Tokens:** {r.output_tokens} | **TPS:** {r.tokens_per_second:.1f}")
    lines.append(f"- **Orientation:** GT=`{r.gt_orientation}` Pred=`{r.pred_orientation}` {'CORRECT' if r.orientation_correct else 'WRONG'}")

    gt_top = r.ground_truth.get("pathologies", [{}])[0].get("name", "?") if r.ground_truth.get("pathologies") else "?"
    pred_top = r.prediction.get("pathologies", [{}])[0].get("name", "?") if r.prediction.get("pathologies") else "?"
    lines.append(f"- **Top pathology:** GT=`{gt_top}` Pred=`{pred_top}` {'MATCH' if r.top1_correct else 'MISMATCH'}")
    lines.append(f"- **Urgency:** GT=`{r.gt_urgency}` Pred=`{r.pred_urgency}` {'CORRECT' if r.urgency_correct else 'WRONG'}")
    lines.append(f"- **Jaccard — nursing:** {r.nursing_jaccard:.2f} | **medical:** {r.medical_jaccard:.2f} | **tests:** {r.tests_jaccard:.2f}")

    if r.error:
        lines.append(f"- **Error:** {r.error}")

    lines.append("")
    return "\n".join(lines)


def generate_report(
    metrics: dict[str, Any],
    lang_metrics: dict[str, dict[str, Any]],
    acceptance: list[tuple[str, str, float, float, bool]],
    examples: dict[str, SampleResult | None],
    baselines: dict[str, Any],
    model_path: str,
    eval_file: str,
    total_samples: int,
) -> str:
    """Generate the full evaluation report as markdown."""
    lines: list[str] = []
    all_pass = all(passed for _, _, _, _, passed in acceptance)
    verdict = "PASS" if all_pass else "FAIL"

    lines.append("# NCDSS Model Evaluation Report\n")
    lines.append(f"**Verdict: {verdict}**\n")
    lines.append(f"- **Model:** `{model_path}`")
    lines.append(f"- **Eval set:** `{eval_file}` ({total_samples} samples)")
    lines.append("")

    # ---- Acceptance criteria ----
    lines.append("## Acceptance Criteria (Plan Section 3.5)\n")
    lines.append("| Criterion | Target | Actual | Status |")
    lines.append("|-----------|--------|--------|--------|")
    for name, desc, actual, target, passed in acceptance:
        status = "PASS" if passed else "**FAIL**"
        # Latency criteria are <= not >=
        if "latency" in name:
            lines.append(f"| {desc} | <= {target:.1f}s | {actual:.2f}s | {status} |")
        else:
            lines.append(f"| {desc} | >= {target:.1f}% | {actual:.1f}% | {status} |")
    lines.append("")

    if not all_pass:
        fail_reasons = [desc for _, desc, _, _, passed in acceptance if not passed]
        lines.append(f"**Failure reasons:** {', '.join(fail_reasons)}\n")

    # ---- All metrics summary ----
    lines.append("## All Metrics\n")
    lines.append("### Structure\n")
    lines.append("| Metric | Value |")
    lines.append("|--------|-------|")
    lines.append(f"| JSON valid rate | {metrics.get('json_valid_rate', 0):.1f}% |")
    lines.append(f"| Schema compliant rate | {metrics.get('schema_compliant_rate', 0):.1f}% |")
    lines.append("")

    lines.append("### Orientation\n")
    lines.append("| Metric | Value |")
    lines.append("|--------|-------|")
    lines.append(f"| Orientation accuracy | {metrics.get('orientation_accuracy', 0):.1f}% |")
    lines.append(f"| SAUV sensitivity | {metrics.get('sauv_sensitivity', 0):.1f}% ({metrics.get('sauv_tp_count', 0)}/{metrics.get('sauv_gt_count', 0)}) |")
    lines.append(f"| SAUV specificity | {metrics.get('sauv_specificity', 0):.1f}% |")
    lines.append("")

    lines.append("### Pathologies\n")
    lines.append("| Metric | Value |")
    lines.append("|--------|-------|")
    lines.append(f"| Top-1 accuracy | {metrics.get('top1_accuracy', 0):.1f}% |")
    lines.append(f"| Top-3 recall | {metrics.get('top3_recall', 0):.1f}% |")
    lines.append(f"| Urgency accuracy | {metrics.get('urgency_accuracy', 0):.1f}% |")
    lines.append(f"| Emergent sensitivity | {metrics.get('emergent_sensitivity', 0):.1f}% ({metrics.get('emergent_tp_count', 0)}/{metrics.get('emergent_gt_count', 0)}) |")
    lines.append(f"| ICD-10 accuracy | {metrics.get('icd10_accuracy', 0):.1f}% |")
    lines.append("")

    lines.append("### Interventions (Jaccard Similarity)\n")
    lines.append("| Metric | Value |")
    lines.append("|--------|-------|")
    lines.append(f"| Nursing overlap | {metrics.get('nursing_overlap', 0):.1f}% |")
    lines.append(f"| Medical overlap | {metrics.get('medical_overlap', 0):.1f}% |")
    lines.append(f"| Tests overlap | {metrics.get('tests_overlap', 0):.1f}% |")
    lines.append("")

    lines.append("### Performance\n")
    lines.append("| Metric | Value |")
    lines.append("|--------|-------|")
    lines.append(f"| Latency P50 | {metrics.get('latency_p50', 0):.2f}s |")
    lines.append(f"| Latency P95 | {metrics.get('latency_p95', 0):.2f}s |")
    lines.append(f"| Latency mean | {metrics.get('latency_mean', 0):.2f}s |")
    lines.append(f"| Tokens/sec mean | {metrics.get('tokens_per_second_mean', 0):.1f} |")
    lines.append("")

    # ---- Orientation confusion matrix ----
    cm = metrics.get("orientation_confusion_matrix", {})
    if cm:
        lines.append("## Orientation Confusion Matrix\n")
        lines.append("Rows = Ground Truth, Columns = Predicted\n")
        header = "| GT \\ Pred | " + " | ".join(VALID_ORIENTATIONS) + " |"
        lines.append(header)
        lines.append("|" + "---|" * (len(VALID_ORIENTATIONS) + 1))
        for gt in VALID_ORIENTATIONS:
            row_counts = [str(cm.get(gt, {}).get(pred, 0)) for pred in VALID_ORIENTATIONS]
            lines.append(f"| **{gt}** | " + " | ".join(row_counts) + " |")
        lines.append("")

    # ---- Per-language breakdown ----
    lines.append("## Per-Language Breakdown\n")
    lang_keys = ["orientation_accuracy", "top3_recall", "urgency_accuracy",
                 "sauv_sensitivity", "emergent_sensitivity",
                 "nursing_overlap", "medical_overlap", "icd10_accuracy",
                 "latency_mean", "latency_p50"]

    header_row = "| Metric | " + " | ".join(sorted(lang_metrics.keys())) + " |"
    lines.append(header_row)
    lines.append("|" + "---|" * (len(lang_metrics) + 1))
    for key in lang_keys:
        values = []
        for lang in sorted(lang_metrics.keys()):
            val = lang_metrics[lang].get(key, 0)
            if "latency" in key:
                values.append(f"{val:.2f}s")
            else:
                values.append(f"{val:.1f}%")
        lines.append(f"| {key} | " + " | ".join(values) + " |")
    lines.append("")

    # ---- Latency distribution ----
    lines.append("## Latency Distribution\n")
    lines.append(f"- **P50:** {metrics.get('latency_p50', 0):.2f}s")
    lines.append(f"- **P95:** {metrics.get('latency_p95', 0):.2f}s")
    lines.append(f"- **Mean:** {metrics.get('latency_mean', 0):.2f}s")
    lines.append(f"- **Mean tokens/sec:** {metrics.get('tokens_per_second_mean', 0):.1f}")
    lines.append("")

    # ---- Baseline comparison ----
    if baselines or REFERENCE_BASELINES:
        lines.append("## Baseline Comparison\n")
        lines.append("| Model | Latency Mean | Speedup vs Fine-Tuned |")
        lines.append("|-------|-------------|----------------------|")

        ft_latency = metrics.get("latency_mean", 1)

        # Reference baselines from plan
        for name, ref in REFERENCE_BASELINES.items():
            ref_lat = ref.get("latency_mean", 0)
            speedup = ref_lat / ft_latency if ft_latency > 0 else 0
            lines.append(f"| {name} | {ref_lat:.1f}s | {speedup:.1f}x slower |")

        # Loaded baselines
        for name, data in baselines.items():
            ref_lat = data.get("latency_mean", 0)
            speedup = ref_lat / ft_latency if ft_latency > 0 else 0
            lines.append(f"| {name} (benchmark log) | {ref_lat:.1f}s | {speedup:.1f}x slower |")

        lines.append(f"| **Fine-tuned (this eval)** | **{ft_latency:.2f}s** | **1.0x (baseline)** |")
        lines.append("")

    # ---- Example predictions ----
    lines.append("## Example Predictions\n")
    for label, sample in examples.items():
        lines.append(format_example(label.replace("_", " ").title(), sample))

    # ---- Final verdict ----
    lines.append("## Final Verdict\n")
    lines.append(f"**{verdict}**\n")
    if all_pass:
        lines.append("All acceptance criteria met. Model is ready for deployment.")
    else:
        lines.append("One or more acceptance criteria not met. See failure reasons above.")
        lines.append("")
        lines.append("**Next steps:**")
        lines.append("- If Apollo2-0.5B fails -> evaluate Apollo-1.8B fallback with same dataset")
        lines.append("- Review failing metrics and consider additional training data")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# JSON results output
# ---------------------------------------------------------------------------

def build_results_json(
    metrics: dict[str, Any],
    lang_metrics: dict[str, dict[str, Any]],
    acceptance: list[tuple[str, str, float, float, bool]],
    results: list[SampleResult],
    model_path: str,
    eval_file: str,
) -> dict[str, Any]:
    """Build machine-readable JSON results."""
    all_pass = all(passed for _, _, _, _, passed in acceptance)

    per_sample = []
    for r in results:
        per_sample.append({
            "sample_idx": r.sample_idx,
            "language": r.language,
            "category": r.category,
            "json_valid": r.json_valid,
            "schema_compliant": r.schema_compliant,
            "gt_orientation": r.gt_orientation,
            "pred_orientation": r.pred_orientation,
            "orientation_correct": r.orientation_correct,
            "top1_correct": r.top1_correct,
            "top3_recall": r.top3_recall,
            "urgency_correct": r.urgency_correct,
            "icd10_correct": r.icd10_correct,
            "gt_urgency": r.gt_urgency,
            "pred_urgency": r.pred_urgency,
            "nursing_jaccard": round(r.nursing_jaccard, 4),
            "medical_jaccard": round(r.medical_jaccard, 4),
            "tests_jaccard": round(r.tests_jaccard, 4),
            "latency_seconds": round(r.latency_seconds, 4),
            "output_tokens": r.output_tokens,
            "tokens_per_second": round(r.tokens_per_second, 2),
            "error": r.error or None,
        })

    acceptance_json = [
        {
            "criterion": name,
            "description": desc,
            "actual": round(actual, 2),
            "target": round(target, 2),
            "passed": passed,
        }
        for name, desc, actual, target, passed in acceptance
    ]

    return {
        "verdict": "PASS" if all_pass else "FAIL",
        "model_path": model_path,
        "eval_file": eval_file,
        "total_samples": len(results),
        "metrics": {k: round(v, 4) if isinstance(v, float) else v for k, v in metrics.items()},
        "per_language": {
            lang: {k: round(v, 4) if isinstance(v, float) else v for k, v in m.items()}
            for lang, m in lang_metrics.items()
        },
        "acceptance_criteria": acceptance_json,
        "per_sample": per_sample,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    load_env()

    parser = argparse.ArgumentParser(
        description="Evaluate fine-tuned NCDSS model against held-out evaluation set"
    )
    data_dir = get_data_dir()

    parser.add_argument(
        "--eval-file", type=str,
        default=str(data_dir / "evaluation.jsonl"),
        help="Path to evaluation JSONL (default: {DATA_DIR}/evaluation.jsonl)",
    )
    parser.add_argument(
        "--model-path", type=str,
        default=str(Path(__file__).resolve().parent.parent.parent / "server" / "models" / "ncdss-apollo-0.5B-v1-Q8_0.gguf"),
        help="Path to GGUF model file",
    )
    parser.add_argument(
        "--baseline-logs", type=str,
        default=str(Path(__file__).resolve().parent.parent.parent / "server" / "benchmark-logs"),
        help="Path to pre-fine-tune benchmark log directory",
    )
    parser.add_argument(
        "--output", type=str,
        default=str(data_dir / "evaluation_report.md"),
        help="Path for evaluation report output",
    )
    parser.add_argument(
        "--max-samples", type=int, default=0,
        help="Limit evaluation to N samples (0 = all, default: all)",
    )
    parser.add_argument(
        "--gpu-layers", type=int, default=-1,
        help="Number of layers to offload to GPU (-1 = all, default: -1)",
    )
    args = parser.parse_args()

    # --- Dependency checks ---
    if Llama is None:
        logger.error(
            "llama-cpp-python is not installed. Install it with:\n"
            "  pip install llama-cpp-python\n"
            "For GPU support (CUDA):\n"
            "  CMAKE_ARGS=\"-DGGML_CUDA=on\" pip install llama-cpp-python\n"
            "See: https://github.com/abetlen/llama-cpp-python#installation"
        )
        sys.exit(1)

    if levenshtein_distance is None:
        logger.warning("Levenshtein package not installed — falling back to substring matching for fuzzy match.")
    if unidecode is None:
        logger.warning("unidecode package not installed — accent stripping disabled.")

    # --- Load evaluation data ---
    eval_path = Path(args.eval_file)
    if not eval_path.exists():
        logger.error("Evaluation file not found: %s", eval_path)
        sys.exit(1)

    records = load_jsonl(str(eval_path))
    if not records:
        logger.error("No records in evaluation file: %s", eval_path)
        sys.exit(1)

    if args.max_samples > 0:
        records = records[:args.max_samples]
        logger.info("Limited to %d samples (--max-samples)", args.max_samples)

    logger.info("Loaded %d evaluation samples from %s", len(records), eval_path)

    # --- Load model ---
    model_path = Path(args.model_path)
    if not model_path.exists():
        logger.error("Model file not found: %s", model_path)
        sys.exit(1)

    logger.info("Loading model from %s (gpu_layers=%d) ...", model_path, args.gpu_layers)
    model = Llama(
        model_path=str(model_path),
        n_ctx=2048,
        n_gpu_layers=args.gpu_layers,
        chat_format="chatml",
        verbose=False,
    )
    logger.info("Model loaded successfully.")

    # --- Load schema ---
    schema = load_unified_schema()
    grammar_schema = build_grammar_schema(schema)
    logger.info("Grammar schema built (stripped %s keys for GBNF compatibility)", ", ".join(_UNSUPPORTED_KEYS))

    # --- Evaluation loop ---
    results: list[SampleResult] = []
    total = len(records)

    for idx, record in enumerate(records):
        progress = f"[{idx + 1}/{total}]"
        try:
            result = evaluate_sample(idx, record, model, schema, grammar_schema)
            results.append(result)

            status_parts = [progress]
            if result.json_valid:
                orient_str = "OK" if result.orientation_correct else f"WRONG({result.pred_orientation})"
                status_parts.append(f"orient={orient_str}")
                status_parts.append(f"top1={'Y' if result.top1_correct else 'N'}")
            else:
                status_parts.append("JSON_INVALID")
            status_parts.append(f"{result.latency_seconds:.2f}s")

            if result.error:
                status_parts.append(f"ERR: {result.error[:50]}")

            logger.info(" | ".join(status_parts))

        except Exception as e:
            logger.error("%s Unexpected error: %s", progress, e)
            error_result = SampleResult(
                sample_idx=idx,
                language=record.get("language", "fr"),
                category=record.get("category", "unknown"),
                error=str(e),
            )
            results.append(error_result)

    # --- Compute metrics ---
    logger.info("Computing metrics ...")
    metrics = compute_metrics(results)
    lang_metrics = compute_metrics_by_language(results)
    acceptance = check_acceptance(metrics)
    examples = pick_examples(results)

    # --- Load baselines ---
    baselines = load_baselines(Path(args.baseline_logs))

    # --- Generate report ---
    report = generate_report(
        metrics=metrics,
        lang_metrics=lang_metrics,
        acceptance=acceptance,
        examples=examples,
        baselines=baselines,
        model_path=str(args.model_path),
        eval_file=str(args.eval_file),
        total_samples=len(results),
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding="utf-8")
    logger.info("Report written to %s", output_path)

    # --- JSON results ---
    results_json = build_results_json(
        metrics=metrics,
        lang_metrics=lang_metrics,
        acceptance=acceptance,
        results=results,
        model_path=str(args.model_path),
        eval_file=str(args.eval_file),
    )
    json_path = output_path.with_name("evaluation_results.json")
    json_path.write_text(json.dumps(results_json, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("JSON results written to %s", json_path)

    # --- Print summary ---
    all_pass = all(passed for _, _, _, _, passed in acceptance)
    print("\n" + "=" * 60)
    print(f"EVALUATION {'PASSED' if all_pass else 'FAILED'}")
    print("=" * 60)
    print(f"  Samples evaluated:     {len(results)}")
    print(f"  JSON valid:            {metrics.get('json_valid_rate', 0):.1f}%")
    print(f"  Schema compliant:      {metrics.get('schema_compliant_rate', 0):.1f}%")
    print(f"  Orientation accuracy:  {metrics.get('orientation_accuracy', 0):.1f}%")
    print(f"  SAUV sensitivity:      {metrics.get('sauv_sensitivity', 0):.1f}%")
    print(f"  Top-1 accuracy:        {metrics.get('top1_accuracy', 0):.1f}%")
    print(f"  Top-3 recall:          {metrics.get('top3_recall', 0):.1f}%")
    print(f"  Urgency accuracy:      {metrics.get('urgency_accuracy', 0):.1f}%")
    print(f"  Emergent sensitivity:  {metrics.get('emergent_sensitivity', 0):.1f}%")
    print(f"  ICD-10 accuracy:       {metrics.get('icd10_accuracy', 0):.1f}%")
    print(f"  Nursing overlap:       {metrics.get('nursing_overlap', 0):.1f}%")
    print(f"  Medical overlap:       {metrics.get('medical_overlap', 0):.1f}%")
    print(f"  Tests overlap:         {metrics.get('tests_overlap', 0):.1f}%")
    print(f"  Latency P50:           {metrics.get('latency_p50', 0):.2f}s")
    print(f"  Latency P95:           {metrics.get('latency_p95', 0):.2f}s")
    print(f"  Tokens/sec mean:       {metrics.get('tokens_per_second_mean', 0):.1f}")
    print()

    for _, desc, actual, target, passed in acceptance:
        mark = "PASS" if passed else "FAIL"
        if "latency" in desc.lower():
            print(f"  [{mark}] {desc}: {actual:.2f}s (target <= {target:.1f}s)")
        else:
            print(f"  [{mark}] {desc}: {actual:.1f}% (target >= {target:.1f}%)")
    print()

    if not all_pass:
        print("ACTION REQUIRED: Some acceptance criteria not met.")
        print("Consider evaluating Apollo-1.8B fallback with the same dataset.")
        sys.exit(1)
    else:
        print("All acceptance criteria met. Model is ready for deployment.")
        sys.exit(0)


if __name__ == "__main__":
    main()
