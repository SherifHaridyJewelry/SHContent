# Bracelet Fidelity A/B Test Results

Compare each output against the **full-bracelet raw anchor** (all links + clasp visible).

## Raw anchors

| Product | Anchor path |
|---------|-------------|
| bracelet06 | `raw/jewelry/bracelet06/IMG_20260629_190436.jpg` |
| bracelet07 | `raw/jewelry/bracelet07/IMG_20260629_190105.jpg` |

## Scoring rubric (1–5 each)

| Criterion | Weight |
|-----------|--------|
| Total link count vs raw | High |
| Figaro pattern cadence | High |
| Clasp type/placement | Medium |
| Professional studio look | High |
| No invented/simplified links | High |

## Round 1 winners

Mark top 1–2 variants after scoring (e.g. `B`, `C`):

- **Round 1 winner 1:** _fill in after visual review_
- **Round 1 winner 2:** _fill in after visual review_

Round 1 completed **16 generations** (A–D × bracelet06/07 × 2 samples). Compare each `images/jewelry/abtest_r1_*` output to the raw anchor above. Enter `link_score` and `studio_score` (1–5) in the matrix rows below.

**Round 2** runs on default winners `B` and `C` with narratives N2a/N2b/N2c while you score Round 1.

---

## Results matrix

| round | variant | product | sample | prompt_mode | analyze_mode | model | ar/res | prompt_path | image_path | link_score | studio_score | notes |
|-------|---------|---------|--------|-------------|--------------|-------|--------|-------------|------------|------------|--------------|-------|

---

## Phase 6 decision

**Status:** Awaiting your visual scoring of Round 1 and Round 2 outputs.

### Test completed

| Round | Jobs | Variants | Prompt modes |
|-------|------|----------|--------------|
| r1 | 16 | A, B, C, D | baseline + standard analyze |
| r2 | 24 | B, C (default) | N2a material_only, N2b no analyze, N2c chain_structured |

### How to decide

1. Score all `abtest_r1_*` rows in the matrix below (link_score + studio_score vs raw anchors).
2. Mark Round 1 winners in the section above.
3. Compare Round 2 narratives on those winners — especially **N2b** (no analyze) vs **N2c** (structured link count).
4. Pick the best single config (variant + prompt_mode + analyze_mode).

### Integration options (choose after scoring)

| If winner is… | Next step |
|---------------|-----------|
| GPT B or C | Route `bracelet` products to `gpt-image-2-image-to-image` in pipeline; accept 4:5@1K or 3:4@2K tradeoff |
| Nano A + N2b/N2c | Keep Nano Banana; adopt fidelity or chain_structured prompt in `prompt_builder.py` |
| None good enough | Batch-generate 4–8 variants per product and manual pick in Review UI |

### Files

- Workflow: `workflows/bracelet_fidelity_ab_test.json`
- Runner: `scripts/bracelet_fidelity_test_workflow.py`
- Outputs: `images/jewelry/abtest_r1_*`, `images/jewelry/abtest_r2_*`
- Prompts: `prompts/jewelry/abtest_*`
| r1 | A | bracelet07 | 1 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet07_c399faf5.json` | `images/jewelry/abtest_r1_A_bracelet07_c399faf5.jpg` | | |  |
| r1 | A | bracelet06 | 2 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet06_818e9b44.json` | `images/jewelry/abtest_r1_A_bracelet06_818e9b44.jpg` | | |  |
| r1 | A | bracelet06 | 1 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet06_e7a39af0.json` | `images/jewelry/abtest_r1_A_bracelet06_e7a39af0.jpg` | | |  |
| r1 | A | bracelet07 | 2 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet07_b5a97432.json` | `images/jewelry/abtest_r1_A_bracelet07_b5a97432.jpg` | | |  |
| r1 | A | bracelet07 | 1 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet07_c399faf5.json` | `images/jewelry/abtest_r1_A_bracelet07_c399faf5.jpg` | | |  |
| r1 | A | bracelet06 | 2 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet06_818e9b44.json` | `images/jewelry/abtest_r1_A_bracelet06_818e9b44.jpg` | | |  |
| r1 | A | bracelet07 | 2 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet07_b5a97432.json` | `images/jewelry/abtest_r1_A_bracelet07_b5a97432.jpg` | | |  |
| r1 | A | bracelet06 | 1 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet06_e7a39af0.json` | `images/jewelry/abtest_r1_A_bracelet06_e7a39af0.jpg` | | |  |
| r1 | B | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet06_58a632f1.json` | `images/jewelry/abtest_r1_B_bracelet06_58a632f1.jpg` | | |  |
| r1 | B | bracelet07 | 1 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet07_8db6adc1.json` | `images/jewelry/abtest_r1_B_bracelet07_8db6adc1.jpg` | | |  |
| r1 | B | bracelet06 | 2 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet06_906f9acf.json` | `images/jewelry/abtest_r1_B_bracelet06_906f9acf.jpg` | | |  |
| r1 | B | bracelet07 | 2 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet07_134c88b0.json` | `images/jewelry/abtest_r1_B_bracelet07_134c88b0.jpg` | | |  |
| r1 | B | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet06_58a632f1.json` | `images/jewelry/abtest_r1_B_bracelet06_58a632f1.jpg` | | |  |
| r1 | B | bracelet07 | 1 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet07_8db6adc1.json` | `images/jewelry/abtest_r1_B_bracelet07_8db6adc1.jpg` | | |  |
| r1 | B | bracelet06 | 2 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet06_906f9acf.json` | `images/jewelry/abtest_r1_B_bracelet06_906f9acf.jpg` | | |  |
| r1 | B | bracelet07 | 2 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet07_134c88b0.json` | `images/jewelry/abtest_r1_B_bracelet07_134c88b0.jpg` | | |  |
| r1 | C | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet06_0e637672.json` | `images/jewelry/abtest_r1_C_bracelet06_0e637672.jpg` | | |  |
| r1 | C | bracelet07 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet07_f6c6adc2.json` | `images/jewelry/abtest_r1_C_bracelet07_f6c6adc2.jpg` | | |  |
| r1 | C | bracelet07 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet07_5a99c6b5.json` | `images/jewelry/abtest_r1_C_bracelet07_5a99c6b5.jpg` | | |  |
| r1 | D | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet06_08babaf2.json` | `images/jewelry/abtest_r1_D_bracelet06_08babaf2.jpg` | | |  |
| r1 | C | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet06_0e637672.json` | `images/jewelry/abtest_r1_C_bracelet06_0e637672.jpg` | | |  |
| r1 | C | bracelet07 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet07_5a99c6b5.json` | `images/jewelry/abtest_r1_C_bracelet07_5a99c6b5.jpg` | | |  |
| r1 | C | bracelet07 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet07_f6c6adc2.json` | `images/jewelry/abtest_r1_C_bracelet07_f6c6adc2.jpg` | | |  |
| r1 | D | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet06_08babaf2.json` | `images/jewelry/abtest_r1_D_bracelet06_08babaf2.jpg` | | |  |
| r1 | D | bracelet07 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet07_4c1e5034.json` | `images/jewelry/abtest_r1_D_bracelet07_4c1e5034.jpg` | | |  |
| r1 | D | bracelet07 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet07_17def28e.json` | `images/jewelry/abtest_r1_D_bracelet07_17def28e.jpg` | | |  |
| r1 | D | bracelet06 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet06_21f56478.json` | `images/jewelry/abtest_r1_D_bracelet06_21f56478.jpg` | | |  |
| r1 | D | bracelet07 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet07_4c1e5034.json` | `images/jewelry/abtest_r1_D_bracelet07_4c1e5034.jpg` | | |  |
| r1 | D | bracelet07 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet07_17def28e.json` | `images/jewelry/abtest_r1_D_bracelet07_17def28e.jpg` | | |  |
| r1 | D | bracelet06 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet06_21f56478.json` | `images/jewelry/abtest_r1_D_bracelet06_21f56478.jpg` | | |  |
| r1 | C | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet06_4cb04e7d.json` | `images/jewelry/abtest_r1_C_bracelet06_4cb04e7d.jpg` | | |  |
| r1 | C | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet06_4cb04e7d.json` | `images/jewelry/abtest_r1_C_bracelet06_4cb04e7d.jpg` | | |  |
| r2 | B | bracelet07 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2a_714b48a0.json` | `images/jewelry/abtest_r2_B_bracelet07_n2a_714b48a0.jpg` | | | N2a |
| r2 | B | bracelet07 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2a_919bc72f.json` | `images/jewelry/abtest_r2_B_bracelet07_n2a_919bc72f.jpg` | | | N2a |
| r2 | B | bracelet07 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2a_714b48a0.json` | `images/jewelry/abtest_r2_B_bracelet07_n2a_714b48a0.jpg` | | | N2a |
| r2 | B | bracelet06 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2a_6d01ec0b.json` | `images/jewelry/abtest_r2_B_bracelet06_n2a_6d01ec0b.jpg` | | | N2a |
| r2 | B | bracelet06 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2a_f1c23bd4.json` | `images/jewelry/abtest_r2_B_bracelet06_n2a_f1c23bd4.jpg` | | | N2a |
| r2 | B | bracelet07 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2a_919bc72f.json` | `images/jewelry/abtest_r2_B_bracelet07_n2a_919bc72f.jpg` | | | N2a |
| r2 | B | bracelet06 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2a_6d01ec0b.json` | `images/jewelry/abtest_r2_B_bracelet06_n2a_6d01ec0b.jpg` | | | N2a |
| r2 | B | bracelet06 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2a_f1c23bd4.json` | `images/jewelry/abtest_r2_B_bracelet06_n2a_f1c23bd4.jpg` | | | N2a |
| r2 | C | bracelet06 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2a_00946663.json` | `images/jewelry/abtest_r2_C_bracelet06_n2a_00946663.jpg` | | | N2a |
| r2 | C | bracelet06 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2a_85ee86d4.json` | `images/jewelry/abtest_r2_C_bracelet06_n2a_85ee86d4.jpg` | | | N2a |
| r2 | C | bracelet07 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2a_9cdb3fd6.json` | `images/jewelry/abtest_r2_C_bracelet07_n2a_9cdb3fd6.jpg` | | | N2a |
| r2 | C | bracelet07 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2a_a15b6b4f.json` | `images/jewelry/abtest_r2_C_bracelet07_n2a_a15b6b4f.jpg` | | | N2a |
| r2 | C | bracelet06 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2a_85ee86d4.json` | `images/jewelry/abtest_r2_C_bracelet06_n2a_85ee86d4.jpg` | | | N2a |
| r2 | B | bracelet06 | 1 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2b_7dfca8b6.json` | `images/jewelry/abtest_r2_B_bracelet06_n2b_7dfca8b6.jpg` | | | N2b |
| r2 | C | bracelet06 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2a_00946663.json` | `images/jewelry/abtest_r2_C_bracelet06_n2a_00946663.jpg` | | | N2a |
| r2 | B | bracelet06 | 2 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2b_8d13ef4f.json` | `images/jewelry/abtest_r2_B_bracelet06_n2b_8d13ef4f.jpg` | | | N2b |
| r2 | C | bracelet07 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2a_a15b6b4f.json` | `images/jewelry/abtest_r2_C_bracelet07_n2a_a15b6b4f.jpg` | | | N2a |
| r2 | B | bracelet07 | 1 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2b_abd5e558.json` | `images/jewelry/abtest_r2_B_bracelet07_n2b_abd5e558.jpg` | | | N2b |
| r2 | C | bracelet07 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2a_9cdb3fd6.json` | `images/jewelry/abtest_r2_C_bracelet07_n2a_9cdb3fd6.jpg` | | | N2a |
| r2 | B | bracelet07 | 2 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2b_e55d57e1.json` | `images/jewelry/abtest_r2_B_bracelet07_n2b_e55d57e1.jpg` | | | N2b |
| r2 | B | bracelet07 | 1 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2b_abd5e558.json` | `images/jewelry/abtest_r2_B_bracelet07_n2b_abd5e558.jpg` | | | N2b |
| r2 | C | bracelet06 | 1 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2b_8c24ad83.json` | `images/jewelry/abtest_r2_C_bracelet06_n2b_8c24ad83.jpg` | | | N2b |
| r2 | B | bracelet06 | 1 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2b_7dfca8b6.json` | `images/jewelry/abtest_r2_B_bracelet06_n2b_7dfca8b6.jpg` | | | N2b |
| r2 | C | bracelet06 | 2 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2b_779d3c74.json` | `images/jewelry/abtest_r2_C_bracelet06_n2b_779d3c74.jpg` | | | N2b |
| r2 | B | bracelet06 | 2 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2b_8d13ef4f.json` | `images/jewelry/abtest_r2_B_bracelet06_n2b_8d13ef4f.jpg` | | | N2b |
| r2 | C | bracelet07 | 1 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2b_5653edfb.json` | `images/jewelry/abtest_r2_C_bracelet07_n2b_5653edfb.jpg` | | | N2b |
| r2 | B | bracelet07 | 2 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2b_e55d57e1.json` | `images/jewelry/abtest_r2_B_bracelet07_n2b_e55d57e1.jpg` | | | N2b |
| r2 | C | bracelet07 | 2 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2b_51970bbb.json` | `images/jewelry/abtest_r2_C_bracelet07_n2b_51970bbb.jpg` | | | N2b |
| r2 | C | bracelet06 | 1 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2b_8c24ad83.json` | `images/jewelry/abtest_r2_C_bracelet06_n2b_8c24ad83.jpg` | | | N2b |
| r2 | C | bracelet06 | 2 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2b_779d3c74.json` | `images/jewelry/abtest_r2_C_bracelet06_n2b_779d3c74.jpg` | | | N2b |
| r2 | C | bracelet07 | 2 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2b_51970bbb.json` | `images/jewelry/abtest_r2_C_bracelet07_n2b_51970bbb.jpg` | | | N2b |
| r2 | C | bracelet07 | 1 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2b_5653edfb.json` | `images/jewelry/abtest_r2_C_bracelet07_n2b_5653edfb.jpg` | | | N2b |
| r2 | B | bracelet06 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2c_1f4da30f.json` | `images/jewelry/abtest_r2_B_bracelet06_n2c_1f4da30f.jpg` | | | N2c |
| r2 | B | bracelet06 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2c_1d43d003.json` | `images/jewelry/abtest_r2_B_bracelet06_n2c_1d43d003.jpg` | | | N2c |
| r2 | B | bracelet07 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2c_e6ae0811.json` | `images/jewelry/abtest_r2_B_bracelet07_n2c_e6ae0811.jpg` | | | N2c |
| r2 | B | bracelet07 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2c_7012a2d7.json` | `images/jewelry/abtest_r2_B_bracelet07_n2c_7012a2d7.jpg` | | | N2c |
| r2 | B | bracelet06 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2c_1f4da30f.json` | `images/jewelry/abtest_r2_B_bracelet06_n2c_1f4da30f.jpg` | | | N2c |
| r2 | B | bracelet06 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2c_1d43d003.json` | `images/jewelry/abtest_r2_B_bracelet06_n2c_1d43d003.jpg` | | | N2c |
| r2 | B | bracelet07 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2c_e6ae0811.json` | `images/jewelry/abtest_r2_B_bracelet07_n2c_e6ae0811.jpg` | | | N2c |
| r2 | B | bracelet07 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2c_7012a2d7.json` | `images/jewelry/abtest_r2_B_bracelet07_n2c_7012a2d7.jpg` | | | N2c |
| r2 | C | bracelet07 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2c_944717c7.json` | `images/jewelry/abtest_r2_C_bracelet07_n2c_944717c7.jpg` | | | N2c |
| r2 | C | bracelet06 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2c_b3117d7d.json` | `images/jewelry/abtest_r2_C_bracelet06_n2c_b3117d7d.jpg` | | | N2c |
| r2 | C | bracelet07 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2c_fc7d2721.json` | `images/jewelry/abtest_r2_C_bracelet07_n2c_fc7d2721.jpg` | | | N2c |
| r2 | C | bracelet06 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2c_dcf9945f.json` | `images/jewelry/abtest_r2_C_bracelet06_n2c_dcf9945f.jpg` | | | N2c |
| r2 | C | bracelet07 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2c_944717c7.json` | `images/jewelry/abtest_r2_C_bracelet07_n2c_944717c7.jpg` | | | N2c |
| r2 | C | bracelet06 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2c_b3117d7d.json` | `images/jewelry/abtest_r2_C_bracelet06_n2c_b3117d7d.jpg` | | | N2c |
| r2 | C | bracelet06 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2c_dcf9945f.json` | `images/jewelry/abtest_r2_C_bracelet06_n2c_dcf9945f.jpg` | | | N2c |
| r2 | C | bracelet07 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2c_fc7d2721.json` | `images/jewelry/abtest_r2_C_bracelet07_n2c_fc7d2721.jpg` | | | N2c |
