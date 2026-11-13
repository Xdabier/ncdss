# Fine-tuning pipeline

Python scripts used to fine-tune a small local model for the AI pre-diagnosis feature. This folder is optional. The app runs without it.

The pipeline builds a synthetic dataset with the Claude API (no real patient data), fine-tunes Apollo2-0.5B with QLoRA, exports a GGUF file and evaluates it.

## Setup

```bash
cd finetuning
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then set ANTHROPIC_API_KEY
```

`requirements.txt` covers data generation and evaluation. Training also needs Unsloth and a CUDA GPU, see the header of `scripts/train.py`.

Data generation calls a paid API. Every generation script has a `--dry-run` flag.

## Steps

Run the scripts as modules from the `finetuning` folder, in this order:

1. `python -m scripts.generate_patients`: synthetic patient profiles in French and English
2. `python -m scripts.distill_labels`: expected JSON answer for each profile
3. `python -m scripts.augment_crosslingual`: aligned French and English pairs
4. `python -m scripts.augment_variations`: several valid answers for the same patient
5. `python -m scripts.generate_dosage_examples`: examples focused on dosages
6. `python -m scripts.validate_dataset`: schema and consistency checks
7. `python -m scripts.prepare_training_data`: merge, deduplicate and split into train and eval files
8. `python -m scripts.train`: fine-tune, add `--export-gguf` to export the model
9. `python -m scripts.evaluate_model`: metrics on the held-out set

Each script documents its options in its header and with `--help`.

## Using the result

Copy the exported `.gguf` file to `server/models/`. The server treats a model as fine-tuned, and uses a shorter prompt, when its file name contains `ncdss-apollo`, `ncdss-qwen`, `ncdss-medical` or `finetuned`.

## Layout

- `configs/`: training configs, clinical categories and the output JSON schema
- `prompts/`: prompts used for generation and distillation
- `scripts/`: the pipeline
