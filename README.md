# Nano Banana 2 - Cursor IDE Image Generation

AI image generation toolkit using Google's Nano Banana 2 (Gemini 3.1 Flash) model through the [KIE API](https://docs.kie.ai/), managed entirely within Cursor IDE.

## Setup

### 1. Python Virtual Environment

The venv lives outside the shared folder (VirtualBox `vboxsf` does not support symlinks):

```bash
# Create the venv (one-time)
python3 -m venv ~/.venvs/shcontent

# Activate it (every session)
source ~/.venvs/shcontent/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. API Key

1. Get a KIE API key from [https://kie.ai/api-key](https://kie.ai/api-key)
2. Copy the example env file and add your key:

```bash
cp .env.example .env
```

Edit `.env` and replace `your_api_key_here` with your actual key.

## Jewelry Workflow App (local)

Local web UI for managing jewelry product photos, running the catalog pipeline, and reviewing outputs.

### Start the API

```bash
source ~/.venvs/shcontent/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Start the UI

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` to port 8000.

### Product folder layout

Raw photos live under `raw/jewelry/<product_id>/`. The app stores metadata in `data/jewelry_products.json`.

Per product, assign image roles:

| Role | Used for |
|------|----------|
| `anchor` | Primary reference in generation (exactly one required) |
| `detail` | Optional second reference for stones/clasp detail |
| `analysis_only` | Gemini vision analysis only, not sent to image generator |
| `archived` | Ignored |

A product is **ready** when it has exactly one anchor image.

### Workflow config

Default workflow: [`workflows/jewelry_catalog.json`](workflows/jewelry_catalog.json)  
Default template: [`templates/jewelry_catalog_4x5.json`](templates/jewelry_catalog_4x5.json)  
Output: `images/jewelry/catalog_<product_id>.jpg` at 4:5, 2K.

CLI batch (still supported):

```bash
python scripts/product_pipeline.py \
  --batch-dir raw/jewelry/ \
  -t jewelry_catalog_4x5 \
  --output-prefix catalog \
  --category jewelry \
  --analyze
```

## Project Structure

```
app/                FastAPI jewelry workflow app
web/                React + Vite frontend
scripts/            Python scripts for image generation and management
  generate_kie.py     Create task, poll for result, download image
  get_kie_image.py    Fetch image for an existing task ID
  prompt_manager.py   List, create, validate, and show prompts
  history.py          Task history logging, listing, and retry
prompts/            JSON prompt files (Dense Narrative format)
images/             Generated image output
logs/               Task history (auto-created)
master_prompt_reference.md   Full JSON prompt schema reference
```

## Usage

Always activate the venv first:

```bash
source ~/.venvs/shcontent/bin/activate
```

### Generate an image

```bash
python scripts/generate_kie.py prompts/my_prompt.json images/output.jpg --aspect-ratio 4:5
```

### Fetch an existing task result

```bash
python scripts/get_kie_image.py <task_id> images/output.jpg --poll
```

### Manage prompts

```bash
python scripts/prompt_manager.py list
python scripts/prompt_manager.py validate prompts/my_prompt.json
python scripts/prompt_manager.py show prompts/my_prompt.json
```

### View generation history

```bash
python scripts/history.py list
python scripts/history.py show <task_id>
```

## Prompt Format

Prompts use the Dense Narrative JSON format. See `master_prompt_reference.md` for the full schema. Minimal example:

```json
{
  "prompt": "Ultra-realistic photograph of a mountain lake at golden hour. 85mm lens, f/2.8, ISO 100. Natural light with warm tones reflecting off still water.",
  "negative_prompt": "blurry, low resolution, cartoon, CGI, oversaturated",
  "api_parameters": {
    "aspect_ratio": "16:9",
    "resolution": "1K",
    "output_format": "jpg"
  }
}
```

## API Reference

- [KIE Getting Started](https://docs.kie.ai/1973359m0)
- [Nano Banana 2 API Docs](https://docs.kie.ai/market/google/nanobanana2)
- [Get Task Details](https://docs.kie.ai/market/common/get-task-detail)
