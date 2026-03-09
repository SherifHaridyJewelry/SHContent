# Nano Banana 2 - Cursor Project Organizer

This document tracks our progress, generated assets, and custom scripts for the Nano Banana 2 image generation project using Cursor IDE and the KIE API.

## Project Structure

It is critical to **always keep prompts and images organized** within the project directory.

- `/scripts/` - All Python scripts for API interaction, prompt management, and history.
- `/prompts/` - Saved JSON prompt configurations corresponding to the generated images.
- `/images/` - All generated images must be saved here. Keep them organized by category.
- `/logs/` - Auto-generated task history (JSON Lines format).
- `master_prompt_reference.md` - The compiled JSON schema and prompting guide.
- `.cursor/rules/nano-banana.mdc` - Cursor agent rule for automated image generation.
- `.env` - KIE API key (not committed to version control).

## Environment

- **Python venv:** `~/.venvs/shcontent` (outside shared folder due to vboxsf symlink limitation)
- **Activate:** `source ~/.venvs/shcontent/bin/activate`
- **Dependencies:** `requests`, `python-dotenv` (see `requirements.txt`)

## Image Generation Workflow

Whenever the user requests to generate an image, you must use the **Nano Banana image generation skill** (defined in `.cursor/rules/nano-banana.mdc`).

1. Construct a Dense Narrative JSON prompt based on the user's requirements.
2. Save the prompt to `/prompts/<category>/<name>.json`. If no clear category, use `/prompts/miscellaneous/`.
3. Validate: `python scripts/prompt_manager.py validate prompts/<file>.json`
4. Generate: `python scripts/generate_kie.py prompts/<file>.json images/<category>/<output>.jpg --aspect-ratio "4:5"`
5. Save the resulting image to the correctly categorized subfolder inside `/images/` (e.g., `/images/infographics/`).
6. The script auto-logs to `logs/history.json`. Review with `python scripts/history.py list`.
7. **Parallel Processing:** When processing multiple images, run generation commands in parallel.

## Current Phase: Schema Validation

**Goal:** Generate complex test images using the JSON schema to validate its effectiveness. Ensure that any output generated is properly filed according to the project structure.

## Scripts Log

| Script Name | Purpose | Status |
|-------------|---------|--------|
| `scripts/generate_kie.py` | Create KIE API task, poll for result, download image, log to history | Active |
| `scripts/get_kie_image.py` | Fetch/download image for an existing task ID (supports polling) | Active |
| `scripts/prompt_manager.py` | List, create, validate, and show prompt JSON files | Active |
| `scripts/history.py` | View task history, show details, retry failed tasks | Active |
