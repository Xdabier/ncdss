"""Shared utilities for the NCDSS fine-tuning data pipeline."""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable, Coroutine, TypeVar

import anthropic
import jsonschema
from dotenv import load_dotenv

# Project root: finetuning/
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ncdss-finetuning")

T = TypeVar("T")


def load_env() -> None:
    """Load .env from the finetuning/ root directory."""
    env_path = PROJECT_ROOT / ".env"
    load_dotenv(env_path)
    logger.info("Loaded environment from %s", env_path)


def get_anthropic_client() -> anthropic.Anthropic:
    """Return a synchronous Anthropic client using the API key from env."""
    return anthropic.Anthropic()


def get_async_anthropic_client() -> anthropic.AsyncAnthropic:
    """Return an async Anthropic client using the API key from env."""
    return anthropic.AsyncAnthropic()


def get_data_dir() -> Path:
    """Return the DATA_DIR path from env, creating it if missing."""
    data_dir = Path(os.getenv("DATA_DIR", str(PROJECT_ROOT.parent / "server" / "training-data")))
    if not data_dir.is_absolute():
        data_dir = (PROJECT_ROOT / data_dir).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def load_prompt_template(name: str) -> str:
    """Read a prompt template from finetuning/prompts/{name}.txt."""
    path = PROJECT_ROOT / "prompts" / f"{name}.txt"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def load_categories() -> dict[str, Any]:
    """Read and parse finetuning/configs/categories.json."""
    path = PROJECT_ROOT / "configs" / "categories.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_unified_schema() -> dict[str, Any]:
    """Read and parse finetuning/configs/unified_schema.json."""
    path = PROJECT_ROOT / "configs" / "unified_schema.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_against_schema(data: dict, schema: dict) -> list[str]:
    """Validate data against a JSON schema. Returns a list of error messages (empty if valid)."""
    validator = jsonschema.Draft7Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    return [f"{'.'.join(str(p) for p in e.absolute_path)}: {e.message}" if e.absolute_path else e.message for e in errors]


def save_jsonl(records: list[dict], filepath: str) -> None:
    """Append records to a JSONL file."""
    path = Path(filepath)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    logger.info("Saved %d records to %s", len(records), filepath)


def load_jsonl(filepath: str) -> list[dict]:
    """Read all records from a JSONL file."""
    records = []
    path = Path(filepath)
    if not path.exists():
        return records
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


async def async_batch_call(
    func: Callable[..., Coroutine[Any, Any, T]],
    items: list[Any],
    max_concurrent: int | None = None,
) -> list[T]:
    """Execute an async function over a list of items with semaphore-limited concurrency."""
    if max_concurrent is None:
        max_concurrent = int(os.getenv("MAX_CONCURRENT", "5"))
    semaphore = asyncio.Semaphore(max_concurrent)

    async def limited(item: Any) -> T:
        async with semaphore:
            return await func(item)

    return await asyncio.gather(*[limited(item) for item in items])
