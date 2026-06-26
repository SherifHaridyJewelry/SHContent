# Product Photography Pipeline

A template-based pipeline that takes raw product images and produces styled photography. Templates are auto-generated from inspiration images using Gemini 3 Flash vision analysis.

## How It Works

```
                         +-----------------------+
                         |  Inspiration Image(s)  |
                         |  (e.g. from Pinterest)  |
                         +-----------+-----------+
                                     |
                            template_manager.py
                            generate command
                                     |
                                     v
                         +-----------+-----------+
                         |   Upload to R2        |
                         |   (references/ prefix)|
                         +-----------+-----------+
                                     |
                         +-----------+-----------+
                         |  Gemini 3 Flash       |
                         |  Analyzes photo style  |
                         +-----------+-----------+
                                     |
                                     v
                         +-----------+-----------+
                         |  Brand Template JSON   |
                         |  (templates/*.json)    |
                         +-----------------------+


                         +-----------------------+
                         |  Raw Product Photo(s)  |
                         |  (1 or more angles)    |
                         +-----------+-----------+
                                     |
                           product_pipeline.py
                                     |
                  +------------------+------------------+
                  |                  |                   |
                  v                  v                   v
         +-------+------+  +-------+-------+  +--------+--------+
         | Upload to R2 |  | Vision Analyze |  | Prompt Builder  |
         | (products/)  |  | (optional,     |  | (template +     |
         | r2_upload.py |  | --analyze)     |  | product info)   |
         +--------------+  | vision_analyze |  | prompt_builder  |
                           +-------+-------+  +--------+--------+
                                   |                    |
                                   +--------------------+
                                            |
                                            v
                                   +--------+--------+
                                   | Dense Narrative  |
                                   | JSON Prompt      |
                                   | + image_input    |
                                   +--------+--------+
                                            |
                                            v
                                   +--------+--------+
                                   | Nano Banana 2   |
                                   | (generate_kie)  |
                                   +--------+--------+
                                            |
                                            v
                                   +--------+--------+
                                   | Styled Output   |
                                   | Image           |
                                   +-----------------+
```

## Prerequisites

```bash
# Activate the virtual environment
source ~/.venvs/shcontent/bin/activate

# Install dependencies (if not already done)
pip install -r requirements.txt
```

Required environment variables in `.env`:

```
KIE_API_KEY=your_kie_api_key

CF_ACCOUNT_ID=your_cloudflare_account_id
CF_R2_ACCESS_KEY=your_r2_access_key
CF_R2_SECRET_KEY=your_r2_secret_key
CF_R2_BUCKET=shcontent-products
CF_R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

## Quick Start

```bash
# 1. Generate a template from an inspiration image
python scripts/template_manager.py generate raw/inspiration/pinterest_ring.jpg --name "Dark Velvet Ring"

# 2. Run the pipeline on a product photo
python scripts/product_pipeline.py --image raw/my_ring.jpg -t dark_velvet_ring -n styled_ring

# Output:
#   prompts/jewelry/styled_ring.json   (the generated prompt)
#   images/jewelry/styled_ring.jpg     (the styled image)
```

---

## Scripts Reference

### 1. `scripts/r2_upload.py`

Manages files on Cloudflare R2 (S3-compatible object storage). Handles uploading raw product photos and inspiration images so they are accessible as public URLs for the KIE API.

Accepted image formats: `.jpg`, `.jpeg`, `.png`, `.webp` (max 30 MB per file).

#### Commands

**`upload`** -- Upload image file(s) or entire directories to R2.

```bash
python scripts/r2_upload.py upload <paths...> [--prefix PREFIX] [--json]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `paths` | Yes | One or more image files or directories |
| `--prefix` | No | Object key prefix in R2. Default: `products`. Use `references` for inspiration images. |
| `--json` | No | Output upload results as JSON |

Examples:
```bash
# Upload a single file
python scripts/r2_upload.py upload raw/ring_01.jpg

# Upload all images in a directory
python scripts/r2_upload.py upload raw/spring_collection/

# Upload as style references
python scripts/r2_upload.py upload raw/inspiration/dark_velvet.jpg --prefix references

# Get JSON output for scripting
python scripts/r2_upload.py upload raw/ring.jpg --json
```

**`list`** -- List objects currently in the R2 bucket.

```bash
python scripts/r2_upload.py list [--prefix PREFIX]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `--prefix` | No | Filter results by key prefix (e.g., `products/`, `references/`) |

Examples:
```bash
# List everything
python scripts/r2_upload.py list

# List only product images
python scripts/r2_upload.py list --prefix products/

# List only style references
python scripts/r2_upload.py list --prefix references/
```

**`delete`** -- Remove object(s) from the R2 bucket.

```bash
python scripts/r2_upload.py delete <keys...>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `keys` | Yes | One or more R2 object keys to delete |

Example:
```bash
python scripts/r2_upload.py delete products/1710000000_ring.jpg
```

**`url`** -- Print the public URL for existing object key(s).

```bash
python scripts/r2_upload.py url <keys...>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `keys` | Yes | One or more R2 object keys |

Example:
```bash
python scripts/r2_upload.py url products/1710000000_ring.jpg
```

---

### 2. `scripts/template_manager.py`

Creates and manages brand templates. The primary feature is the `generate` command, which sends inspiration image(s) to Gemini 3 Flash and gets back a structured template describing the photography style.

#### Commands

**`generate`** -- Create a new template from inspiration image(s).

```bash
python scripts/template_manager.py generate <images...> [--name NAME] [--product-type TYPE]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `images` | Yes | One or more inspiration image files. Multiple images are analyzed together to synthesize a single style. |
| `--name` | No | Template name. If omitted, Gemini auto-generates one. |
| `--product-type` | No | Override auto-detected product type (e.g., `ring`, `necklace`, `earrings`, `bracelet`, `brooch`, `watch`, `pendant`). |

What it does:
1. Uploads each inspiration image to R2 (under `references/` prefix).
2. Sends all images to Gemini 3 Flash with a structured output schema.
3. Gemini analyzes the photography style (surface, lighting, camera, arrangement).
4. Saves the template to `templates/<slugified_name>.json` with R2 URLs in `style_references`.
5. Prints the template for review.

Examples:
```bash
# Single inspiration image
python scripts/template_manager.py generate raw/inspiration/dark_velvet.jpg --name "Dark Velvet Ring"

# Multiple inspiration images (Gemini synthesizes them into one style)
python scripts/template_manager.py generate raw/inspiration/img1.jpg raw/inspiration/img2.jpg --name "Golden Hour"

# Override product type
python scripts/template_manager.py generate raw/inspiration/earring_setup.jpg --name "Stud Display" --product-type earrings
```

**`list`** -- List all available templates.

```bash
python scripts/template_manager.py list [--product-type TYPE]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `--product-type` | No | Filter by product type (e.g., `ring`, `necklace`) |

**`show`** -- Print a template's full JSON contents.

```bash
python scripts/template_manager.py show <template>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `template` | Yes | Template filename, name (without `.json`), or full path |

**`validate`** -- Check a template against the schema.

```bash
python scripts/template_manager.py validate <template>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `template` | Yes | Template filename, name, or path |

**`clone`** -- Duplicate a template with a new name.

```bash
python scripts/template_manager.py clone <template> <new_name>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `template` | Yes | Source template |
| `new_name` | Yes | Name for the cloned template |

**`add-reference`** -- Upload an additional inspiration image and append it to a template's `style_references`.

```bash
python scripts/template_manager.py add-reference <template> <image>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `template` | Yes | Target template |
| `image` | Yes | Inspiration image file to upload and add |

---

### 3. `scripts/vision_analyze.py`

Sends product image(s) to Gemini 3 Flash and returns a structured description of the product: material, dimensions, distinctive features, and a dense photographic-language description.

This step is optional in the pipeline (disabled by default).

```bash
python scripts/vision_analyze.py <images...> [--urls] [--hint HINT] [--output FILE] [--quiet]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `images` | Yes | Product image files (local paths by default) or URLs (with `--urls`) |
| `--urls` | No | Treat `images` arguments as URLs instead of local file paths. Skips the R2 upload step. |
| `--hint` | No | Context hint to help Gemini (e.g., `"this is a pair of hoop earrings"`, `"18k white gold"`). |
| `--output`, `-o` | No | Save the analysis JSON to a file. |
| `--quiet`, `-q` | No | Only output the JSON result (suppress progress messages). |

When multiple images are provided, they are all sent in a single request to Gemini. This is intended for multiple angles of the **same product** so Gemini can cross-reference them.

Output JSON structure:
```json
{
  "product_type": "ring",
  "material": "yellow gold, high-polish finish",
  "dimensions": "approximately 6mm band width, estimated size 7",
  "distinctive_features": [
    "beveled edges",
    "comfort-fit interior",
    "mirror-polish exterior"
  ],
  "product_description": "A wide yellow-gold band ring with beveled edges...",
  "_source_urls": ["https://pub-xxx.r2.dev/products/..."]
}
```

Examples:
```bash
# Analyze a single local image
python scripts/vision_analyze.py raw/ring.jpg

# Multiple angles of the same product
python scripts/vision_analyze.py raw/ring_front.jpg raw/ring_side.jpg raw/ring_top.jpg

# With a context hint
python scripts/vision_analyze.py raw/brooch.jpg --hint "vintage art deco brooch"

# Save analysis to file
python scripts/vision_analyze.py raw/necklace.jpg -o analysis/necklace.json

# Analyze images already on R2
python scripts/vision_analyze.py --urls https://pub-xxx.r2.dev/products/ring.jpg
```

---

### 4. `scripts/prompt_builder.py`

Merges a brand template with product information to produce a Dense Narrative JSON prompt file compatible with `generate_kie.py`.

```bash
python scripts/prompt_builder.py --template TEMPLATE --output OUTPUT [--product-urls URL...] [--analysis FILE] [--print]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `--template`, `-t` | Yes | Brand template (filename, name without `.json`, or full path) |
| `--output`, `-o` | Yes | Output path for the generated prompt JSON |
| `--product-urls` | No | R2 URLs of raw product images to include in `image_input`. If `--analysis` is provided and has `_source_urls`, those are used automatically. |
| `--analysis`, `-a` | No | Path to a vision analysis JSON file (from `vision_analyze.py`). The `product_description` field is used as the hero subject in the prompt. |
| `--print` | No | Also print the generated prompt JSON to stdout. |

How it assembles the prompt:
1. If `--analysis` is provided, uses `product_description` as the hero subject.
2. If no analysis, uses a generic reference: "the jewelry piece shown in the reference images."
3. Wraps the subject with scene, camera, lighting, and quality directives from the template.
4. Composes `image_input`: style references from the template first, then product image URLs. Max 14 total.
5. Copies `negative_prompt` and `api_parameters` from the template.

Examples:
```bash
# Without analysis (images-only reference)
python scripts/prompt_builder.py \
  -t dark_velvet_ring \
  --product-urls https://pub-xxx.r2.dev/products/ring.jpg \
  -o prompts/jewelry/ring_01.json

# With analysis
python scripts/prompt_builder.py \
  -t dark_velvet_ring \
  -a analysis/ring.json \
  -o prompts/jewelry/ring_01.json \
  --print
```

---

### 5. `scripts/product_pipeline.py`

The main orchestrator. Runs the entire flow in one command: upload to R2, optional vision analysis, prompt building, and image generation.

```bash
python scripts/product_pipeline.py (--image | --batch | --batch-dir) --template TEMPLATE [options]
```

#### Mode Arguments (mutually exclusive, one required)

| Argument | Description |
|----------|-------------|
| `--image FILE [FILE...]` | **Single product mode.** One or more image files. Multiple files = different angles of the **same** product. |
| `--batch FILE [FILE...]` | **Batch mode.** Each file is a **separate** product. All products use the same template. |
| `--batch-dir DIR` | **Batch-dir mode.** A directory where each subfolder is a separate product (containing one or more angle images). Loose image files in the directory are each treated as individual products. |

#### Required Arguments

| Argument | Description |
|----------|-------------|
| `--template`, `-t` | Brand template name, filename, or path. |

#### Optional Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--output-name`, `-n` | Derived from first image filename | Output name for single product mode. Used for the prompt and image filenames. |
| `--output-prefix` | `product` | Name prefix for batch modes. Each product gets `<prefix>_<filename>` as its output name. |
| `--category`, `-c` | `jewelry` | Output subfolder under `prompts/` and `images/`. |
| `--analyze` | Disabled | Enable Gemini 3 Flash vision analysis to generate a detailed product description for the prompt. |
| `--hint` | None | Context hint for vision analysis (e.g., `"18k white gold engagement ring"`). Only used when `--analyze` is active. |
| `--max-workers` | `3` | Reserved for future parallel batch processing. |

#### Pipeline Steps (per product)

```
[1/4] Upload to R2        -- All product images uploaded, public URLs returned
[2/4] Vision Analysis      -- (only if --analyze) Gemini describes the product
[3/4] Build Prompt         -- Template + product info merged into Dense Narrative JSON
[4/4] Generate Image       -- Nano Banana 2 creates the styled image
```

#### Examples

```bash
# Single product, one image
python scripts/product_pipeline.py \
  --image raw/ring_01.jpg \
  -t dark_velvet_ring \
  -n gold_ring_studio

# Single product, multiple angles
python scripts/product_pipeline.py \
  --image raw/ring_front.jpg raw/ring_side.jpg raw/ring_detail.jpg \
  -t dark_velvet_ring \
  -n gold_ring_studio

# Single product with vision analysis
python scripts/product_pipeline.py \
  --image raw/ring_01.jpg \
  -t dark_velvet_ring \
  -n gold_ring_studio \
  --analyze \
  --hint "18k yellow gold solitaire ring"

# Batch: 3 separate products, same template
python scripts/product_pipeline.py \
  --batch raw/ring.jpg raw/necklace.jpg raw/bracelet.jpg \
  -t dark_velvet_ring \
  --output-prefix spring_collection

# Batch-dir: folder with subfolders per product
#   raw/spring/ring_01/front.jpg, side.jpg
#   raw/spring/necklace_02/front.jpg
#   raw/spring/bracelet_03/front.jpg, detail.jpg
python scripts/product_pipeline.py \
  --batch-dir raw/spring/ \
  -t dark_velvet_ring \
  --output-prefix spring
```

#### Output

For each product, the pipeline produces:
- `prompts/<category>/<name>.json` -- the generated Dense Narrative prompt
- `images/<category>/<name>.jpg` -- the styled output image
- An entry in `logs/history.json`

At the end, a summary table is printed:
```
============================================================
PIPELINE SUMMARY
============================================================
  [OK] spring_collection_ring -> images/jewelry/spring_collection_ring.jpg
  [OK] spring_collection_necklace -> images/jewelry/spring_collection_necklace.jpg
  [FAIL] spring_collection_bracelet -- Image generation failed

Total: 3 | Success: 2 | Failed: 1
```

---

## Template Schema

Templates are JSON files in `templates/`. They define the photography setup but not the product itself.

```json
{
  "template_name": "Dark Velvet Ring Display",
  "category": "jewelry",
  "product_type": "ring",
  "scene": {
    "surface": "dark velvet display cushion on a marble slab",
    "background": "soft gradient from charcoal to deep black, out of focus",
    "props": "small ring holder stand, matte black",
    "arrangement": "single ring on holder, tilted 15 degrees toward camera"
  },
  "camera": {
    "focal_length": "100mm macro",
    "aperture": "f/4.0",
    "iso": "100",
    "lens_behavior": "sharp focus on the product, creamy bokeh on background",
    "shooting_angle": "near eye-level, slight 10-degree downward tilt"
  },
  "lighting": {
    "setup": "single key softbox at 45 degrees camera-left, small reflector card camera-right",
    "quality": "soft, controlled, subtle specular highlights on metal surfaces"
  },
  "style": "luxury product photography, editorial catalog",
  "style_references": [
    "https://pub-xxx.r2.dev/references/1710000000_dark_velvet.jpg"
  ],
  "quality_directives": "Photorealistic. Subtle reflections on polished metal. No CGI look.",
  "negative_prompt": "cartoon, illustration, 3D render, CGI, plastic look, oversaturated, blurry product, watermark, text overlay, human hands, human body, mannequin",
  "api_parameters": {
    "aspect_ratio": "4:5",
    "resolution": "2K",
    "output_format": "jpg"
  }
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| `template_name` | Descriptive name for the template |
| `category` | Product category (e.g., `jewelry`, `accessories`) |
| `product_type` | What kind of product (`ring`, `necklace`, `earrings`, `bracelet`, `brooch`, `watch`, `pendant`, `general_jewelry`) |
| `scene.surface` | What the product sits on |
| `scene.background` | What is behind/around the product |
| `scene.props` | Additional objects in the scene, or `"none"` |
| `scene.arrangement` | How the product is positioned |
| `camera.focal_length` | Lens focal length (e.g., `"100mm macro"`) |
| `camera.aperture` | F-stop (e.g., `"f/4.0"`) |
| `camera.iso` | ISO sensitivity (e.g., `"100"`) |
| `camera.lens_behavior` | Focus and bokeh characteristics |
| `camera.shooting_angle` | Camera angle relative to subject |
| `lighting.setup` | Light positions, modifiers, and ratios |
| `lighting.quality` | Overall light quality and mood |
| `style` | Photographic style description |
| `style_references` | Array of R2 URLs -- inspiration images included in every `image_input` |
| `quality_directives` | Requirements for photorealistic output |
| `negative_prompt` | Comma-separated things to avoid |
| `api_parameters.aspect_ratio` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`, `auto` |
| `api_parameters.resolution` | `1K`, `2K`, `4K` |
| `api_parameters.output_format` | `jpg`, `png` |

---

## image_input Composition

Every generation includes an `image_input` array sent to Nano Banana 2, composed as:

1. **Style references** (from the template's `style_references`) -- come first
2. **Product images** (raw product photos uploaded to R2) -- come after

The combined total must not exceed **14** (the KIE API limit).

Recommended budget: 2-3 style references, leaving 11-12 slots for product angles.

Product images are always mandatory. The model needs the actual product photos to reproduce it faithfully.

---

## File Organization

```
SHContent/
  templates/              Auto-generated brand templates
  raw/                    Raw product photos + inspiration (gitignored)
    inspiration/          Save inspiration images here before generating templates
  scripts/
    product_pipeline.py   End-to-end orchestrator
    template_manager.py   Generate/manage brand templates via Gemini
    vision_analyze.py     Optional product analysis via Gemini
    prompt_builder.py     Build prompts from template + product info
    r2_upload.py          Upload/manage files on Cloudflare R2
    generate_kie.py       Core image generation (Nano Banana 2)
    get_kie_image.py      Fetch image for existing task
    prompt_manager.py     Legacy prompt management
    history.py            Task history viewer
  prompts/<category>/     Generated prompt JSON files
  images/<category>/      Generated output images
  logs/history.json       Auto-populated generation history
```

---

## Typical Workflow

### First Time: Create a Template

1. Find inspiration images (Pinterest, competitor sites, stock photos).
2. Save them to `raw/inspiration/`.
3. Generate a template:
   ```bash
   python scripts/template_manager.py generate raw/inspiration/style.jpg --name "My Brand Style"
   ```
4. Review the template at `templates/my_brand_style.json`. Edit if needed.
5. Optionally add more style references:
   ```bash
   python scripts/template_manager.py add-reference my_brand_style raw/inspiration/another.jpg
   ```

### Every Time: Process Products

Single product:
```bash
python scripts/product_pipeline.py --image raw/product.jpg -t my_brand_style -n product_name
```

Batch of products (all get the same brand style):
```bash
python scripts/product_pipeline.py --batch raw/product1.jpg raw/product2.jpg raw/product3.jpg \
  -t my_brand_style --output-prefix my_collection
```

### Optional: Test Vision Analysis

Compare results with and without `--analyze`:
```bash
# Without (default)
python scripts/product_pipeline.py --image raw/ring.jpg -t my_style -n ring_no_analyze

# With
python scripts/product_pipeline.py --image raw/ring.jpg -t my_style -n ring_with_analyze --analyze
```
