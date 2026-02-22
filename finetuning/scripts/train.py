"""Local fine-tuning script for NCDSS clinical decision support model.

Fine-tunes Apollo2-0.5B (or Apollo-1.8B fallback) using QLoRA with Unsloth
on an RTX 3050 Laptop GPU (4GB VRAM). Implements Phase 2 of the fine-tuning plan.

Usage:
  python -m scripts.train
  python -m scripts.train --config configs/train_0.5b.yaml
  python -m scripts.train --training-data /path/to/training.jsonl --epochs 6
  python -m scripts.train --dry-run
  python -m scripts.train --export-gguf
  python -m scripts.train --resume-from ./ncdss-apollo-0.5B/checkpoint-500
"""

import argparse
import io
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

# Fix Windows cp1252 console encoding — Unsloth prints emoji (🦥) that cp1252 can't handle.
if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Disable torch.compile/dynamo — causes graph break errors on Windows + Python 3.13 + torch 2.6.
# Unsloth's fused CE loss uses @torch.compile internally, which hits unsupported builtins on
# this platform. Monkey-patching torch.compile to a no-op forces eager mode throughout.
# Training works correctly without it; dynamo is just an optional speed optimization.
os.environ["TORCHDYNAMO_DISABLE"] = "1"
# Fix Windows cp1252 console encoding — Unsloth prints emoji (🦥) that cp1252 can't handle.
os.environ["PYTHONIOENCODING"] = "utf-8"

import torch  # noqa: E402 — must patch before unsloth import

torch._dynamo.config.suppress_errors = True

_orig_compile = torch.compile

def _noop_compile(fn=None, *args, **kwargs):
    """Replace torch.compile with a pass-through to avoid dynamo graph breaks."""
    if fn is None:
        return lambda f: f
    return fn

torch.compile = _noop_compile

# ---------------------------------------------------------------------------
# VRAM monitoring helpers (imported before heavy deps to catch early issues)
# ---------------------------------------------------------------------------


def print_vram(stage: str) -> None:
    """Print current VRAM usage with a stage label."""
    try:
        import torch

        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated() / (1024 ** 3)
            reserved = torch.cuda.memory_reserved() / (1024 ** 3)
            total = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            print(f"\n[VRAM] {stage}:")
            print(f"  Allocated: {allocated:.2f} GB")
            print(f"  Reserved:  {reserved:.2f} GB")
            print(f"  Total:     {total:.2f} GB")
            print(f"  Free:      {total - reserved:.2f} GB")
        else:
            print(f"\n[VRAM] {stage}: CUDA not available")
    except ImportError:
        print(f"\n[VRAM] {stage}: torch not installed")


def format_time(seconds: float) -> str:
    """Format seconds into a human-readable string."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{seconds / 60:.1f}m"
    else:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours}h {minutes}m"


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_jsonl(path: str) -> list[dict]:
    """Read all records from a JSONL file."""
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"  Warning: skipping invalid JSON at line {line_num}: {e}")
    return records


def format_chat(record: dict) -> dict:
    """Convert a chat-format record into a text string using the Qwen2/Apollo2 chat template.

    The Apollo2-0.5B model uses the same <|im_start|> template as Qwen2/Qwen3.
    """
    messages = record.get("messages", [])
    text = ""
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        text += f"<|im_start|>{role}\n{content}<|im_end|>\n"
    return {"text": text}


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


def load_yaml_config(path: str) -> dict[str, Any]:
    """Load a YAML config file and return as dict."""
    try:
        import yaml
    except ImportError:
        print("Error: PyYAML required for --config. Install with: pip install pyyaml")
        sys.exit(1)

    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def apply_config(args: argparse.Namespace, config: dict[str, Any]) -> argparse.Namespace:
    """Apply YAML config values as defaults (CLI args take precedence)."""
    parser_defaults = {
        "model_name": "FreedomIntelligence/Apollo2-0.5B",
        "epochs": 6,
        "batch_size": 2,
        "grad_accum": 8,
        "learning_rate": 2e-4,
        "lora_rank": 64,
        "max_seq_length": 2048,
        "gguf_output": "ncdss-apollo-0.5B-v1-Q8_0.gguf",
    }

    # Map YAML keys (snake_case, possibly different names) to argparse attrs
    yaml_key_map = {
        "model_name": "model_name",
        "num_train_epochs": "epochs",
        "per_device_train_batch_size": "batch_size",
        "gradient_accumulation_steps": "grad_accum",
        "learning_rate": "learning_rate",
        "lora_rank": "lora_rank",
        "lora_r": "lora_rank",
        "max_seq_length": "max_seq_length",
        "gguf_output": "gguf_output",
        "output_dir": "output_dir",
    }

    for yaml_key, arg_key in yaml_key_map.items():
        if yaml_key in config:
            current = getattr(args, arg_key, None)
            default = parser_defaults.get(arg_key)
            # Only override if user didn't explicitly set this arg
            if current == default or current is None:
                setattr(args, arg_key, config[yaml_key])

    return args


# ---------------------------------------------------------------------------
# Training plot
# ---------------------------------------------------------------------------


def save_training_plot(log_history: list[dict], output_dir: str) -> None:
    """Save a training/eval loss plot to output_dir/training_plot.png."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("Warning: matplotlib not installed. Skipping training plot.")
        print("  Install with: pip install matplotlib")
        return

    train_steps = []
    train_losses = []
    eval_steps = []
    eval_losses = []

    for entry in log_history:
        if "loss" in entry and "step" in entry:
            train_steps.append(entry["step"])
            train_losses.append(entry["loss"])
        if "eval_loss" in entry and "step" in entry:
            eval_steps.append(entry["step"])
            eval_losses.append(entry["eval_loss"])

    if not train_steps and not eval_steps:
        print("Warning: no loss data found in training log. Skipping plot.")
        return

    fig, ax = plt.subplots(figsize=(10, 6))

    if train_steps:
        ax.plot(train_steps, train_losses, label="Training Loss", alpha=0.7)
    if eval_steps:
        ax.plot(eval_steps, eval_losses, label="Eval Loss", marker="o", linewidth=2)

    ax.set_xlabel("Step")
    ax.set_ylabel("Loss")
    ax.set_title("NCDSS Apollo2-0.5B Training")
    ax.legend()
    ax.grid(True, alpha=0.3)

    plot_path = os.path.join(output_dir, "training_plot.png")
    fig.savefig(plot_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"\nTraining plot saved to {plot_path}")


# ---------------------------------------------------------------------------
# Test inference
# ---------------------------------------------------------------------------


def run_test_inference(model: Any, tokenizer: Any) -> None:
    """Run a test inference with a sample patient to verify model output."""
    from unsloth import FastLanguageModel

    FastLanguageModel.for_inference(model)

    test_prompt = (
        "<|im_start|>system\n"
        "Tu es un assistant medical d'urgence experimente.<|im_end|>\n"
        "<|im_start|>user\n"
        "PATIENT:\n"
        "- Age: 55 ans\n"
        "- Sexe: Homme\n"
        "- Motif: Douleur thoracique oppressive depuis 2h\n"
        "\n"
        "CONSTANTES:\n"
        "- T: 37.0 °C\n"
        "- FC: 95 bpm\n"
        "- FR: 20 /min\n"
        "- TA: 145/90\n"
        "- SpO2: 96 %\n"
        "- EVA: 8/10\n"
        "\n"
        "SCORES:\n"
        "- NEWS: 5\n"
        "- GCS: 15/15\n"
        "- qSOFA: 0/3\n"
        "\n"
        "ABCDE:\n"
        "A: Voies aeriennes libres\n"
        "B: FR 20, SpO2 96%, murmures vesiculaires bilateraux\n"
        "C: Tachycardie sinusale, TA 145/90, TRC < 3s\n"
        "D: GCS 15, pupilles reactives\n"
        "E: Diaphorese, pas de rash\n"
        "\n"
        "ATCD: HTA, tabagisme actif 30PA\n"
        "ALLERGIES: Aucune connue<|im_end|>\n"
        "<|im_start|>assistant\n"
    )

    print("\n" + "=" * 60)
    print("POST-TRAINING TEST INFERENCE")
    print("=" * 60)
    print("Input: 55M, chest pain, NEWS 5, GCS 15")

    import torch

    inputs = tokenizer(test_prompt, return_tensors="pt").to("cuda")
    input_len = inputs.input_ids.shape[1]
    print(f"Input tokens: {input_len}")

    start = time.time()
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=800,
            temperature=0.1,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    elapsed = time.time() - start

    response = tokenizer.decode(outputs[0][input_len:], skip_special_tokens=True)
    output_tokens = outputs[0].shape[0] - input_len

    print(f"Output tokens: {output_tokens}")
    print(f"Inference time: {elapsed:.2f}s")
    print(f"\nModel response:\n{response[:2000]}")

    # Validate JSON structure
    try:
        result = json.loads(response)
        print("\n[OK] JSON is valid!")
        print(f"  Orientation: {result.get('orientation', '?')}")
        print(f"  Orientation reason: {result.get('orientationReason', '?')[:80]}")
        print(f"  Critical alerts: {len(result.get('criticalAlerts', []))}")
        pathologies = result.get("pathologies", [])
        print(f"  Pathologies ({len(pathologies)}):")
        for p in pathologies:
            print(f"    - {p.get('name', '?')} ({p.get('confidence', '?')}%) [{p.get('urgency', '?')}] {p.get('icd10Code', '')}")
        print(f"  Nursing interventions: {len(result.get('nursingInterventions', []))}")
        print(f"  Medical interventions: {len(result.get('medicalInterventions', []))}")
        print(f"  Recommended tests: {len(result.get('recommendedTests', []))}")
        print(f"  Warnings: {len(result.get('warnings', []))}")
    except json.JSONDecodeError as e:
        print(f"\n[WARN] JSON parse error: {e}")
        print("  This is expected for a base model without grammar constraint.")
        print("  At inference time, node-llama-cpp's createGrammarForJsonSchema guarantees valid JSON.")


# ---------------------------------------------------------------------------
# GGUF export
# ---------------------------------------------------------------------------


def export_gguf(model: Any, tokenizer: Any, gguf_output: str) -> None:
    """Merge LoRA weights and convert to GGUF format."""
    merged_dir = "./merged_model"

    print("\n" + "=" * 60)
    print("GGUF EXPORT")
    print("=" * 60)

    # Step 1: Merge LoRA weights into base model
    print("\nStep 1: Merging LoRA weights into base model ...")
    model.save_pretrained_merged(merged_dir, tokenizer, save_method="merged_16bit")
    print(f"  Merged model saved to {merged_dir}")

    # Step 2: Check for llama.cpp
    llama_cpp_dir = Path("llama.cpp")
    convert_script = llama_cpp_dir / "convert_hf_to_gguf.py"

    if not convert_script.exists():
        print("\nllama.cpp not found. Cloning ...")
        subprocess.run(
            ["git", "clone", "--depth", "1", "https://github.com/ggerganov/llama.cpp.git"],
            check=True,
        )

    # Step 3: Install conversion requirements
    requirements_file = llama_cpp_dir / "requirements" / "requirements-convert_hf_to_gguf.txt"
    if requirements_file.exists():
        print("\nInstalling llama.cpp conversion requirements ...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(requirements_file)],
            check=True,
        )
    else:
        # Fallback: try common path variants
        alt_req = llama_cpp_dir / "requirements.txt"
        if alt_req.exists():
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-r", str(alt_req)],
                check=True,
            )

    # Step 4: Convert to GGUF
    print(f"\nStep 2: Converting to GGUF (Q8_0) -> {gguf_output} ...")
    subprocess.run(
        [
            sys.executable,
            str(convert_script),
            merged_dir,
            "--outtype", "q8_0",
            "--outfile", gguf_output,
        ],
        check=True,
    )

    # Print file size
    if os.path.exists(gguf_output):
        size_mb = os.path.getsize(gguf_output) / (1024 * 1024)
        print(f"\n[OK] GGUF file created: {gguf_output}")
        print(f"  File size: {size_mb:.1f} MB")
        print(f"\n  To deploy, copy to your server models directory:")
        print(f"    cp {gguf_output} server/models/{gguf_output}")
    else:
        print(f"\n[ERROR] GGUF file not found at {gguf_output}")


# ---------------------------------------------------------------------------
# Main training
# ---------------------------------------------------------------------------


def main() -> None:
    # Resolve DATA_DIR default early
    finetuning_root = Path(__file__).resolve().parent.parent
    default_data_dir = finetuning_root.parent / "finetuning" / "training-data"

    parser = argparse.ArgumentParser(
        description="Fine-tune Apollo2-0.5B for NCDSS clinical decision support (RTX 3050 4GB VRAM)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m scripts.train                         # Train with defaults
  python -m scripts.train --config configs/train_0.5b.yaml
  python -m scripts.train --dry-run               # Load model + data, print stats only
  python -m scripts.train --export-gguf            # Train + export to GGUF
  python -m scripts.train --resume-from ./ncdss-apollo-0.5B/checkpoint-500
  python -m scripts.train --batch-size 1 --max-seq-length 1024  # If OOM
        """,
    )

    # Data paths
    parser.add_argument("--training-data", type=str, default=str(default_data_dir / "training.jsonl"),
                        help="Path to training JSONL (default: {DATA_DIR}/training.jsonl)")
    parser.add_argument("--eval-data", type=str, default=str(default_data_dir / "evaluation.jsonl"),
                        help="Path to evaluation JSONL (default: {DATA_DIR}/evaluation.jsonl)")
    parser.add_argument("--output-dir", type=str, default="./ncdss-apollo-0.5B",
                        help="Directory for checkpoints (default: ./ncdss-apollo-0.5B)")

    # Model
    parser.add_argument("--model-name", type=str, default="FreedomIntelligence/Apollo2-0.5B",
                        help="HuggingFace model name (default: FreedomIntelligence/Apollo2-0.5B)")

    # Training hyperparameters
    parser.add_argument("--epochs", type=int, default=6,
                        help="Number of training epochs (default: 6)")
    parser.add_argument("--batch-size", type=int, default=2,
                        help="Per-device batch size (default: 2, tuned for 4GB VRAM)")
    parser.add_argument("--grad-accum", type=int, default=8,
                        help="Gradient accumulation steps (default: 8, effective batch = batch_size * grad_accum)")
    parser.add_argument("--learning-rate", type=float, default=2e-4,
                        help="Learning rate (default: 2e-4, lower for medical pre-trained model)")
    parser.add_argument("--lora-rank", type=int, default=64,
                        help="LoRA rank (default: 64)")
    parser.add_argument("--max-seq-length", type=int, default=2048,
                        help="Maximum sequence length (default: 2048)")

    # GGUF export
    parser.add_argument("--export-gguf", action="store_true",
                        help="Merge LoRA and convert to GGUF after training")
    parser.add_argument("--gguf-output", type=str, default="ncdss-apollo-0.5B-v1-Q8_0.gguf",
                        help="GGUF output filename (default: ncdss-apollo-0.5B-v1-Q8_0.gguf)")

    # Misc
    parser.add_argument("--dry-run", action="store_true",
                        help="Load model and data, print stats, but don't train")
    parser.add_argument("--resume-from", type=str, default=None,
                        help="Resume training from a checkpoint directory")
    parser.add_argument("--config", type=str, default=None,
                        help="Path to YAML config file (CLI args override config values)")

    args = parser.parse_args()

    # Apply YAML config if provided
    if args.config:
        config = load_yaml_config(args.config)
        args = apply_config(args, config)

    # -----------------------------------------------------------------------
    # Print configuration
    # -----------------------------------------------------------------------
    effective_batch = args.batch_size * args.grad_accum
    lora_alpha = args.lora_rank * 2  # Convention: 2x rank

    print("=" * 60)
    print("NCDSS FINE-TUNING — LOCAL GPU TRAINING")
    print("=" * 60)
    print(f"  Model:             {args.model_name}")
    print(f"  Training data:     {args.training_data}")
    print(f"  Eval data:         {args.eval_data}")
    print(f"  Output dir:        {args.output_dir}")
    print(f"  Epochs:            {args.epochs}")
    print(f"  Batch size:        {args.batch_size} (effective: {effective_batch})")
    print(f"  Gradient accum:    {args.grad_accum}")
    print(f"  Learning rate:     {args.learning_rate}")
    print(f"  LoRA rank:         {args.lora_rank} (alpha: {lora_alpha})")
    print(f"  Max seq length:    {args.max_seq_length}")
    print(f"  Export GGUF:       {args.export_gguf}")
    print(f"  Dry run:           {args.dry_run}")
    if args.resume_from:
        print(f"  Resume from:       {args.resume_from}")
    print()

    # -----------------------------------------------------------------------
    # Check CUDA availability
    # -----------------------------------------------------------------------
    try:
        import torch

        if not torch.cuda.is_available():
            print("[ERROR] CUDA is not available. This script requires an NVIDIA GPU.")
            print("  Ensure you have CUDA-compatible PyTorch installed:")
            print("  pip install torch --index-url https://download.pytorch.org/whl/cu118")
            sys.exit(1)

        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"[OK] GPU detected: {gpu_name} ({gpu_mem:.1f} GB VRAM)")
    except ImportError:
        print("[ERROR] PyTorch not installed. Install with:")
        print("  pip install torch --index-url https://download.pytorch.org/whl/cu118")
        sys.exit(1)

    print_vram("Before model loading")

    # -----------------------------------------------------------------------
    # Load training data
    # -----------------------------------------------------------------------
    print(f"\nLoading training data from {args.training_data} ...")
    if not os.path.exists(args.training_data):
        print(f"[ERROR] Training data not found: {args.training_data}")
        print("  Run `python -m scripts.prepare_training_data` first.")
        sys.exit(1)

    train_records = load_jsonl(args.training_data)
    print(f"  Loaded {len(train_records)} training records")

    eval_records = []
    if os.path.exists(args.eval_data):
        eval_records = load_jsonl(args.eval_data)
        print(f"  Loaded {len(eval_records)} evaluation records")
    else:
        print(f"  Warning: eval data not found at {args.eval_data}. Training without evaluation.")

    if not train_records:
        print("[ERROR] No training records found. Aborting.")
        sys.exit(1)

    # Convert to chat format strings
    from datasets import Dataset

    print("Formatting records into chat template ...")
    train_formatted = [format_chat(rec) for rec in train_records]
    train_dataset = Dataset.from_list(train_formatted)

    eval_dataset = None
    if eval_records:
        eval_formatted = [format_chat(rec) for rec in eval_records]
        eval_dataset = Dataset.from_list(eval_formatted)

    # Print token length statistics
    print(f"\n  Training examples:   {len(train_dataset)}")
    if eval_dataset:
        print(f"  Evaluation examples: {len(eval_dataset)}")

    # Sample a record to show format
    sample = train_formatted[0]["text"]
    print(f"\n  Sample record (first 300 chars):\n  {sample[:300]}...")

    # -----------------------------------------------------------------------
    # Load model with Unsloth
    # -----------------------------------------------------------------------
    print(f"\nLoading model: {args.model_name} ...")
    print("  QLoRA: load_in_4bit=True (critical for 4GB VRAM)")

    try:
        from unsloth import FastLanguageModel
    except ImportError:
        print("[ERROR] Unsloth not installed. Install with:")
        print("  pip install unsloth")
        sys.exit(1)

    try:
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=args.model_name,
            max_seq_length=args.max_seq_length,
            load_in_4bit=True,
        )
    except Exception as e:
        print(f"[ERROR] Failed to load model: {e}")
        if "out of memory" in str(e).lower() or "oom" in str(e).lower():
            print("\n  VRAM OOM during model loading. Try:")
            print("    --max-seq-length 1024")
        sys.exit(1)

    print_vram("After model loading")

    # Apply LoRA adapters
    print(f"\nApplying LoRA adapters (r={args.lora_rank}, alpha={lora_alpha}) ...")
    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_rank,
        lora_alpha=lora_alpha,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        lora_dropout=0.05,
    )

    # Print trainable parameters
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"\n  Total parameters:     {total_params:,}")
    print(f"  Trainable parameters: {trainable_params:,} ({trainable_params / total_params * 100:.1f}%)")

    print_vram("After LoRA adapters")

    # -----------------------------------------------------------------------
    # Dry run — stop here
    # -----------------------------------------------------------------------
    if args.dry_run:
        total_steps = (len(train_dataset) // (args.batch_size * args.grad_accum)) * args.epochs
        print("\n" + "=" * 60)
        print("DRY RUN COMPLETE")
        print("=" * 60)
        print(f"  Model loaded:       {args.model_name} (4-bit QLoRA)")
        print(f"  Training examples:  {len(train_dataset)}")
        if eval_dataset:
            print(f"  Eval examples:      {len(eval_dataset)}")
        print(f"  Total steps:        {total_steps}")
        print(f"  Steps per epoch:    {total_steps // args.epochs}")
        print(f"  Effective batch:    {effective_batch}")
        print(f"  Trainable params:   {trainable_params:,}")
        print("\n  Everything looks good. Remove --dry-run to start training.")
        return

    # -----------------------------------------------------------------------
    # Configure training
    # -----------------------------------------------------------------------
    print("\nConfiguring SFTTrainer ...")

    try:
        from trl import SFTConfig, SFTTrainer
    except ImportError:
        print("[ERROR] trl not installed. Install with:")
        print("  pip install trl")
        sys.exit(1)

    training_args = SFTConfig(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.learning_rate,
        warmup_ratio=0.1,
        logging_steps=10,
        save_strategy="epoch",
        eval_strategy="epoch" if eval_dataset else "no",
        fp16=False,
        bf16=True,
        max_seq_length=args.max_seq_length,
        dataset_text_field="text",
        save_total_limit=3,
        load_best_model_at_end=True if eval_dataset else False,
        metric_for_best_model="eval_loss" if eval_dataset else None,
        report_to="none",
        # Disable find_unused_parameters for efficiency
        ddp_find_unused_parameters=False,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        args=training_args,
    )

    total_steps = (len(train_dataset) // (args.batch_size * args.grad_accum)) * args.epochs
    print(f"\n  Total training steps: {total_steps}")
    print(f"  Steps per epoch:     {total_steps // args.epochs}")
    print(f"  Effective batch:     {effective_batch}")

    # -----------------------------------------------------------------------
    # Train
    # -----------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("STARTING TRAINING")
    print("=" * 60)

    print_vram("Before training")

    train_start = time.time()

    try:
        if args.resume_from:
            print(f"  Resuming from checkpoint: {args.resume_from}")
            result = trainer.train(resume_from_checkpoint=args.resume_from)
        else:
            result = trainer.train()
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            print("\n" + "=" * 60)
            print("[ERROR] CUDA OUT OF MEMORY")
            print("=" * 60)
            print_vram("At OOM")
            print("\n  Try reducing memory usage:")
            print(f"    --batch-size 1          (current: {args.batch_size})")
            print(f"    --max-seq-length 1024   (current: {args.max_seq_length})")
            print(f"    --grad-accum 16         (to maintain effective batch size)")
            print("\n  Example minimal VRAM command:")
            print("    python -m scripts.train --batch-size 1 --grad-accum 16 --max-seq-length 1024")
            sys.exit(1)
        raise

    train_elapsed = time.time() - train_start

    print_vram("After training")

    # -----------------------------------------------------------------------
    # Training results
    # -----------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)
    print(f"  Total time:       {format_time(train_elapsed)}")
    print(f"  Final train loss: {result.training_loss:.4f}")

    # Extract eval loss from log history
    log_history = trainer.state.log_history
    eval_losses = [e["eval_loss"] for e in log_history if "eval_loss" in e]
    if eval_losses:
        print(f"  Best eval loss:   {min(eval_losses):.4f}")
        print(f"  Final eval loss:  {eval_losses[-1]:.4f}")

    print(f"  Global steps:     {trainer.state.global_step}")
    print(f"  Epochs completed: {trainer.state.epoch:.1f}")

    # Save training log
    log_path = os.path.join(args.output_dir, "training_log.json")
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "model_name": args.model_name,
                "training_args": {
                    "epochs": args.epochs,
                    "batch_size": args.batch_size,
                    "grad_accum": args.grad_accum,
                    "effective_batch_size": effective_batch,
                    "learning_rate": args.learning_rate,
                    "lora_rank": args.lora_rank,
                    "lora_alpha": lora_alpha,
                    "max_seq_length": args.max_seq_length,
                },
                "training_examples": len(train_dataset),
                "eval_examples": len(eval_dataset) if eval_dataset else 0,
                "total_steps": trainer.state.global_step,
                "training_loss": result.training_loss,
                "best_eval_loss": min(eval_losses) if eval_losses else None,
                "final_eval_loss": eval_losses[-1] if eval_losses else None,
                "training_time_seconds": train_elapsed,
                "trainable_params": trainable_params,
                "total_params": total_params,
                "log_history": log_history,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )
    print(f"\n  Training log saved to {log_path}")

    # Save training plot
    save_training_plot(log_history, args.output_dir)

    # -----------------------------------------------------------------------
    # Test inference
    # -----------------------------------------------------------------------
    run_test_inference(model, tokenizer)

    # -----------------------------------------------------------------------
    # GGUF export (optional)
    # -----------------------------------------------------------------------
    if args.export_gguf:
        export_gguf(model, tokenizer, args.gguf_output)

    print("\n" + "=" * 60)
    print("ALL DONE")
    print("=" * 60)
    print(f"  Checkpoints:      {args.output_dir}/")
    print(f"  Training log:     {log_path}")
    if args.export_gguf and os.path.exists(args.gguf_output):
        print(f"  GGUF model:       {args.gguf_output}")
    if not args.export_gguf:
        print(f"\n  To export GGUF, re-run with --export-gguf:")
        print(f"    python -m scripts.train --export-gguf --resume-from {args.output_dir}")


if __name__ == "__main__":
    main()
