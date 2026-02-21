"""Shared utilities for the Anthropic Message Batches API.

Provides reusable primitives for submitting, polling, collecting, and retrying
batch requests.  All finetuning scripts use these helpers to achieve ~50% cost
savings via asynchronous batch processing.

See: https://docs.anthropic.com/en/docs/build-with-claude/batch-processing
"""

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import anthropic

from scripts.common import logger


def sanitize_custom_id(raw_id: str) -> str:
    """Sanitize a string for use as a batch API custom_id.

    The Anthropic Batch API requires custom_id to match ``^[a-zA-Z0-9_-]{1,64}``.
    This replaces invalid characters with ``_`` and truncates to 64 chars.
    """
    sanitized = re.sub(r"[^a-zA-Z0-9_-]", "_", raw_id)
    return sanitized[:64]

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class BatchResult:
    """Holds the outcome of a single request within a batch."""

    custom_id: str
    status: str  # "succeeded", "errored", "canceled", "expired"
    response_text: str | None = None
    error: str | None = None


@dataclass
class BatchOutcome:
    """Aggregated outcome from run_batch_with_retries."""

    succeeded: dict[str, tuple[Any, int]] = field(default_factory=dict)
    # custom_id -> (parsed_result, rounds_used)
    failures: list[dict[str, Any]] = field(default_factory=list)
    # list of {custom_id, error, last_response}
    total_requests_submitted: int = 0
    # Total number of requests submitted across all rounds (for cost estimates)


# Type aliases for the callback signatures
ValidateFn = Callable[[str, str], tuple[Any | None, str | None]]
# validate_fn(custom_id, response_text) -> (parsed_result | None, error_msg | None)

BuildRetryFn = Callable[[str, str | None, str], dict[str, Any]]
# build_retry_fn(custom_id, response_text, error_msg) -> batch request dict


# ---------------------------------------------------------------------------
# Core batch operations
# ---------------------------------------------------------------------------


def submit_batch(
    client: anthropic.Anthropic,
    requests: list[dict[str, Any]],
    description: str = "",
) -> str:
    """Submit a batch of requests to the Anthropic Batches API.

    Args:
        client: Synchronous Anthropic client.
        requests: List of request dicts, each with ``custom_id`` and ``params``.
        description: Human-readable description for the batch.

    Returns:
        The ``batch_id`` string.
    """
    logger.info("Submitting batch of %d requests: %s", len(requests), description)
    batch = client.messages.batches.create(requests=requests)
    logger.info("Batch created: id=%s, status=%s", batch.id, batch.processing_status)
    return batch.id


def poll_batch(
    client: anthropic.Anthropic,
    batch_id: str,
    poll_interval: int = 60,
    max_errors: int = 10,
) -> Any:
    """Poll a batch until it reaches ``ended`` status.

    Retries on transient API errors with exponential backoff.

    Returns:
        The final batch metadata object.
    """
    logger.info("Polling batch %s every %ds ...", batch_id, poll_interval)
    consecutive_errors = 0
    while True:
        try:
            batch = client.messages.batches.retrieve(batch_id)
            consecutive_errors = 0  # reset on success
        except (anthropic.APIConnectionError, anthropic.APITimeoutError,
                anthropic.InternalServerError) as e:
            consecutive_errors += 1
            if consecutive_errors > max_errors:
                logger.error("Poll failed %d times consecutively, giving up", max_errors)
                raise
            wait = min(poll_interval * (2 ** consecutive_errors), 300)
            logger.warning(
                "Poll error (attempt %d/%d): %s, retrying in %ds",
                consecutive_errors, max_errors, e, wait,
            )
            time.sleep(wait)
            continue

        counts = batch.request_counts
        logger.info(
            "  [%s] status=%s  processing=%d  succeeded=%d  errored=%d  canceled=%d  expired=%d",
            batch_id[:12],
            batch.processing_status,
            counts.processing,
            counts.succeeded,
            counts.errored,
            counts.canceled,
            counts.expired,
        )
        if batch.processing_status == "ended":
            return batch
        time.sleep(poll_interval)


def collect_results(
    client: anthropic.Anthropic,
    batch_id: str,
) -> dict[str, BatchResult]:
    """Stream results from a completed batch.

    Returns:
        Dict mapping ``custom_id`` to ``BatchResult``.
    """
    results: dict[str, BatchResult] = {}
    for entry in client.messages.batches.results(batch_id):
        custom_id = entry.custom_id
        if entry.result.type == "succeeded":
            # Extract text from the first text content block
            text = ""
            message = entry.result.message
            for block in (message.content or []):
                if hasattr(block, "text"):
                    text = block.text
                    break
            results[custom_id] = BatchResult(
                custom_id=custom_id,
                status="succeeded",
                response_text=text,
            )
        elif entry.result.type == "errored":
            error_msg = str(entry.result.error) if entry.result.error else "unknown error"
            results[custom_id] = BatchResult(
                custom_id=custom_id,
                status="errored",
                error=error_msg,
            )
        else:
            # canceled or expired
            results[custom_id] = BatchResult(
                custom_id=custom_id,
                status=entry.result.type,
                error=f"Request {entry.result.type}",
            )
    logger.info("Collected %d results from batch %s", len(results), batch_id[:12])
    return results


# ---------------------------------------------------------------------------
# Checkpoint persistence for crash recovery
# ---------------------------------------------------------------------------


def _checkpoint_dir(base_dir: Path) -> Path:
    d = base_dir / ".batch_state"
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_batch_checkpoint(
    batch_id: str,
    round_num: int,
    custom_id_map: dict[str, Any],
    checkpoint_name: str,
    base_dir: Path,
) -> None:
    """Persist batch state for crash recovery."""
    path = _checkpoint_dir(base_dir) / f"{checkpoint_name}.json"
    data = {
        "batch_id": batch_id,
        "round_num": round_num,
        "custom_ids": list(custom_id_map.keys()),
        "timestamp": time.time(),
    }
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    logger.info("Saved checkpoint: %s (batch=%s, round=%d)", path.name, batch_id[:12], round_num)


def load_batch_checkpoint(
    checkpoint_name: str,
    base_dir: Path,
) -> dict[str, Any] | None:
    """Load a previously saved checkpoint, or return None."""
    path = _checkpoint_dir(base_dir) / f"{checkpoint_name}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        logger.info(
            "Loaded checkpoint: %s (batch=%s, round=%d)",
            path.name, data.get("batch_id", "?")[:12], data.get("round_num", -1),
        )
        return data
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to load checkpoint %s: %s", path, e)
        return None


def clear_batch_checkpoint(checkpoint_name: str, base_dir: Path) -> None:
    """Remove a checkpoint file after successful completion."""
    path = _checkpoint_dir(base_dir) / f"{checkpoint_name}.json"
    try:
        path.unlink(missing_ok=True)
        logger.info("Cleared checkpoint: %s", path.name)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# High-level orchestrator
# ---------------------------------------------------------------------------


def run_batch_with_retries(
    client: anthropic.Anthropic,
    requests: list[dict[str, Any]],
    validate_fn: ValidateFn,
    build_retry_fn: BuildRetryFn,
    description: str = "batch",
    max_rounds: int = 3,
    poll_interval: int = 60,
    checkpoint_name: str | None = None,
    checkpoint_dir: Path | None = None,
) -> BatchOutcome:
    """Submit a batch, validate results, and retry failures up to ``max_rounds``.

    Args:
        client: Synchronous Anthropic client.
        requests: Initial batch request dicts.
        validate_fn: ``(custom_id, response_text) -> (parsed | None, error | None)``.
        build_retry_fn: ``(custom_id, response_text, error_msg) -> request_dict``.
        description: Human label for logging.
        max_rounds: Maximum number of submit-poll-collect cycles.
        poll_interval: Seconds between poll calls.
        checkpoint_name: Name for crash-recovery checkpoint file.
        checkpoint_dir: Directory to store checkpoint files.

    Returns:
        ``BatchOutcome`` with succeeded and failed results.
    """
    outcome = BatchOutcome()
    pending_requests = list(requests)

    for round_num in range(max_rounds):
        if not pending_requests:
            break

        round_label = f"{description} round {round_num}"
        logger.info("--- %s: %d requests ---", round_label, len(pending_requests))
        outcome.total_requests_submitted += len(pending_requests)

        # Check for existing checkpoint (crash recovery)
        batch_id = None
        if checkpoint_name and checkpoint_dir:
            ckpt = load_batch_checkpoint(f"{checkpoint_name}_r{round_num}", checkpoint_dir)
            if ckpt:
                # Validate checkpoint matches current requests
                ckpt_ids = set(ckpt.get("custom_ids", []))
                current_ids = {r["custom_id"] for r in pending_requests}
                if ckpt_ids == current_ids:
                    batch_id = ckpt["batch_id"]
                    logger.info("Resuming from checkpoint: batch %s", batch_id[:12])
                else:
                    logger.warning(
                        "Checkpoint custom_ids mismatch (%d vs %d), ignoring stale checkpoint",
                        len(ckpt_ids), len(current_ids),
                    )

        # Submit if no checkpoint
        if batch_id is None:
            batch_id = submit_batch(client, pending_requests, round_label)
            if checkpoint_name and checkpoint_dir:
                id_map = {r["custom_id"]: True for r in pending_requests}
                save_batch_checkpoint(
                    batch_id, round_num, id_map,
                    f"{checkpoint_name}_r{round_num}", checkpoint_dir,
                )

        # Poll
        poll_batch(client, batch_id, poll_interval)

        # Collect
        results = collect_results(client, batch_id)

        # Clear checkpoint after successful collection
        if checkpoint_name and checkpoint_dir:
            clear_batch_checkpoint(f"{checkpoint_name}_r{round_num}", checkpoint_dir)

        # Triage results
        retry_requests: list[dict[str, Any]] = []
        for req in pending_requests:
            cid = req["custom_id"]
            result = results.get(cid)

            if result is None or result.status != "succeeded":
                error_msg = result.error if result else "no result returned"
                if round_num < max_rounds - 1:
                    retry_req = build_retry_fn(cid, None, error_msg)
                    retry_requests.append(retry_req)
                else:
                    outcome.failures.append({
                        "custom_id": cid,
                        "error": error_msg,
                        "last_response": None,
                    })
                continue

            # Validate
            parsed, error_msg = validate_fn(cid, result.response_text)
            if parsed is not None:
                outcome.succeeded[cid] = (parsed, round_num)
            elif round_num < max_rounds - 1:
                retry_req = build_retry_fn(cid, result.response_text, error_msg or "validation_failed")
                retry_requests.append(retry_req)
            else:
                outcome.failures.append({
                    "custom_id": cid,
                    "error": error_msg or "validation_failed",
                    "last_response": (result.response_text or "")[:500],
                })

        round_succeeded = sum(1 for cid, (_, rn) in outcome.succeeded.items() if rn == round_num)
        logger.info(
            "%s: round_succeeded=%d, cumulative_succeeded=%d, retrying=%d, final_failures=%d",
            round_label, round_succeeded, len(outcome.succeeded),
            len(retry_requests), len(outcome.failures),
        )

        pending_requests = retry_requests

    # Any requests still pending after all rounds are failures
    for req in pending_requests:
        outcome.failures.append({
            "custom_id": req["custom_id"],
            "error": "max_rounds_exceeded",
            "last_response": None,
        })

    return outcome


# ---------------------------------------------------------------------------
# Prompt caching helper
# ---------------------------------------------------------------------------


def split_prompt_for_caching(
    template: str,
    patient_data: str,
) -> tuple[str, str]:
    """Split a prompt template at ``{PATIENT_DATA}`` for prompt caching.

    The static instruction portion becomes a ``system`` message with
    ``cache_control``, and the patient-specific data becomes the ``user``
    message.  This maximizes cache hit rate across a batch.

    Returns:
        ``(system_text, user_text)``
    """
    marker = "{PATIENT_DATA}"
    if marker in template:
        parts = template.split(marker, 1)
        system_text = parts[0].rstrip()
        suffix = parts[1].strip()
        user_text = patient_data + "\n\n" + suffix if suffix else patient_data
    else:
        # Fallback: entire template is system, patient data is user
        system_text = template
        user_text = patient_data
    return system_text, user_text


def build_batch_request(
    custom_id: str,
    model: str,
    system_text: str,
    user_content: str,
    max_tokens: int = 8192,
    temperature: float = 0.3,
) -> dict[str, Any]:
    """Build a single batch request dict with prompt caching.

    The system message gets ``cache_control: {"type": "ephemeral"}`` so
    that the static instruction prefix is cached across all requests in
    the batch.
    """
    return {
        "custom_id": custom_id,
        "params": {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": [
                {
                    "type": "text",
                    "text": system_text,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "messages": [
                {"role": "user", "content": user_content},
            ],
        },
    }


def build_retry_batch_request(
    custom_id: str,
    model: str,
    system_text: str,
    original_user_content: str,
    bad_response: str,
    fix_instruction: str,
    max_tokens: int = 8192,
    temperature: float = 0.3,
) -> dict[str, Any]:
    """Build a 3-message retry batch request.

    Messages: [original_user, assistant_bad_response, user_fix_instruction].

    Raises ``ValueError`` if ``bad_response`` is empty (the Anthropic API
    rejects empty assistant messages).
    """
    if not bad_response:
        raise ValueError(
            f"bad_response cannot be empty for {custom_id}; "
            "use build_batch_request for full re-sends"
        )
    return {
        "custom_id": custom_id,
        "params": {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": [
                {
                    "type": "text",
                    "text": system_text,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "messages": [
                {"role": "user", "content": original_user_content},
                {"role": "assistant", "content": bad_response},
                {"role": "user", "content": fix_instruction},
            ],
        },
    }
