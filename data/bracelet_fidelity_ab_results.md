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

- **Round 1 winner 1:** _not set_
- **Round 1 winner 2:** _not set_

## Overall winner

- **Best config:** _not set_

## Picked outputs

| product | round | variant | narrative | image | link | studio |
|---------|-------|---------|-----------|-------|------|--------|
| bracelet06 | r1 | A |  | `images/jewelry/abtest_r1_A_bracelet06_818e9b44.jpg` | 5 | 5 |

---

## Results matrix

| round | variant | product | sample | prompt_mode | analyze_mode | model | ar/res | prompt_path | image_path | link_score | studio_score | notes | picked |
|-------|---------|---------|--------|-------------|--------------|-------|--------|-------------|------------|------------|--------------|-------|--------|
| r1 | A | bracelet06 | 1 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet06_818e9b44.json` | `images/jewelry/abtest_r1_A_bracelet06_818e9b44.jpg` | 5 | 5 |  | yes |
| r1 | A | bracelet06 | 2 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet06_e7a39af0.json` | `images/jewelry/abtest_r1_A_bracelet06_e7a39af0.jpg` | 2 | 5 | it got the bracelet closed on a plillow, but from the other side, what is show is the clasps and the links next to it from both side, we cant determine if it kept the original or not. |  |
| r1 | A | bracelet07 | 1 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet07_b5a97432.json` | `images/jewelry/abtest_r1_A_bracelet07_b5a97432.jpg` | 3 | 5 | got half of it right, and the other wrong, for the bigger elongated link in the center of the bracelet |  |
| r1 | A | bracelet07 | 2 | baseline | standard | nano-banana-2 | 4:5/2K | `prompts/jewelry/abtest_r1_A_bracelet07_c399faf5.json` | `images/jewelry/abtest_r1_A_bracelet07_c399faf5.jpg` | 3 | 5 | good, but it missed a round link from both sides |  |
| r1 | B | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet06_58a632f1.json` | `images/jewelry/abtest_r1_B_bracelet06_58a632f1.jpg` | 1 | 4 |  |  |
| r1 | B | bracelet06 | 2 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet06_906f9acf.json` | `images/jewelry/abtest_r1_B_bracelet06_906f9acf.jpg` | 4 | 4 | good, but missed one link from both sides, from the far ends of the bracelets, but got the pattern correct |  |
| r1 | B | bracelet07 | 1 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet07_134c88b0.json` | `images/jewelry/abtest_r1_B_bracelet07_134c88b0.jpg` | 2 | 5 | missed the Centeral elongated bigger link |  |
| r1 | B | bracelet07 | 2 | baseline | standard | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r1_B_bracelet07_8db6adc1.json` | `images/jewelry/abtest_r1_B_bracelet07_8db6adc1.jpg` | 1 | 5 |  |  |
| r1 | C | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet06_0e637672.json` | `images/jewelry/abtest_r1_C_bracelet06_0e637672.jpg` | 5 | 2 | perfect links, but feels unnatural and edited |  |
| r1 | C | bracelet06 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet06_4cb04e7d.json` | `images/jewelry/abtest_r1_C_bracelet06_4cb04e7d.jpg` | 2 | 2 |  |  |
| r1 | C | bracelet07 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet07_5a99c6b5.json` | `images/jewelry/abtest_r1_C_bracelet07_5a99c6b5.jpg` | 1 | 4 |  |  |
| r1 | C | bracelet07 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_C_bracelet07_f6c6adc2.json` | `images/jewelry/abtest_r1_C_bracelet07_f6c6adc2.jpg` | 2 | 4 |  |  |
| r1 | D | bracelet06 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet06_08babaf2.json` | `images/jewelry/abtest_r1_D_bracelet06_08babaf2.jpg` | 1 | 4 |  |  |
| r1 | D | bracelet06 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet06_21f56478.json` | `images/jewelry/abtest_r1_D_bracelet06_21f56478.jpg` | 1 | 5 |  |  |
| r1 | D | bracelet07 | 1 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet07_17def28e.json` | `images/jewelry/abtest_r1_D_bracelet07_17def28e.jpg` | 1 | 5 |  |  |
| r1 | D | bracelet07 | 2 | baseline | standard | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r1_D_bracelet07_4c1e5034.json` | `images/jewelry/abtest_r1_D_bracelet07_4c1e5034.jpg` | 4 | 4 | very good link pattern and count, but missed the size of the centeral elongated link, it should be bigger, the image made it the same size as other elongated links. |  |
| r2 | B | bracelet06 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2a_6d01ec0b.json` | `images/jewelry/abtest_r2_B_bracelet06_n2a_6d01ec0b.jpg` | 4 | 3 | missed, two links in the lower end of thebracelet, but the pattern is perfect, |  |
| r2 | B | bracelet06 | 1 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2b_7dfca8b6.json` | `images/jewelry/abtest_r2_B_bracelet06_n2b_7dfca8b6.jpg` | 5 | 3 | perfect bracelet, but it is small, the image need to focus on it more, also feels a bit unnatural and edited. |  |
| r2 | B | bracelet06 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2c_1d43d003.json` | `images/jewelry/abtest_r2_B_bracelet06_n2c_1d43d003.jpg` | 2 | 2 | not the same design as the original links, smilar but not same |  |
| r2 | B | bracelet06 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2a_f1c23bd4.json` | `images/jewelry/abtest_r2_B_bracelet06_n2a_f1c23bd4.jpg` | 5 | 2 | perfect links, but feels edited, and with changing much in the scene, just the background |  |
| r2 | B | bracelet06 | 2 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2b_8d13ef4f.json` | `images/jewelry/abtest_r2_B_bracelet06_n2b_8d13ef4f.jpg` | 5 | 4 | perfect links, and design, the studio could be better, but acceptable |  |
| r2 | B | bracelet06 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet06_n2c_1f4da30f.json` | `images/jewelry/abtest_r2_B_bracelet06_n2c_1f4da30f.jpg` | 2 | 3 |  |  |
| r2 | B | bracelet07 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2a_714b48a0.json` | `images/jewelry/abtest_r2_B_bracelet07_n2a_714b48a0.jpg` | 1 |  | same far sides problem, and wrong center link size |  |
| r2 | B | bracelet07 | 1 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2b_abd5e558.json` | `images/jewelry/abtest_r2_B_bracelet07_n2b_abd5e558.jpg` | 2 | 3 | same far sides problem, and wrong center link size |  |
| r2 | B | bracelet07 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2c_7012a2d7.json` | `images/jewelry/abtest_r2_B_bracelet07_n2c_7012a2d7.jpg` | 2 | 2 | same far sides problem, and wrong center link size |  |
| r2 | B | bracelet07 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2a_919bc72f.json` | `images/jewelry/abtest_r2_B_bracelet07_n2a_919bc72f.jpg` | 2 | 2 | same far sides problem, and wrong center link size |  |
| r2 | B | bracelet07 | 2 | fidelity | none | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2b_e55d57e1.json` | `images/jewelry/abtest_r2_B_bracelet07_n2b_e55d57e1.jpg` | 5 | 3 | the studio could be better, but overall very good, it kept the exact shape of the bracelet, the center elongated link is a bit smaller thatn the orginal but still bigger than other elongated links in the bracelet like the original. |  |
| r2 | B | bracelet07 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 4:5/1K | `prompts/jewelry/abtest_r2_B_bracelet07_n2c_e6ae0811.json` | `images/jewelry/abtest_r2_B_bracelet07_n2c_e6ae0811.jpg` | 2 | 5 | links numbers are shrinked |  |
| r2 | C | bracelet06 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2a_00946663.json` | `images/jewelry/abtest_r2_C_bracelet06_n2a_00946663.jpg` | 5 | 1 | it is the same original image, just changed the background, not what we want |  |
| r2 | C | bracelet06 | 1 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2b_779d3c74.json` | `images/jewelry/abtest_r2_C_bracelet06_n2b_779d3c74.jpg` | 5 | 2 | it is the same original image, just changed the background, not what we want |  |
| r2 | C | bracelet06 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2c_b3117d7d.json` | `images/jewelry/abtest_r2_C_bracelet06_n2c_b3117d7d.jpg` | 5 | 3 | good, but made the bracelet very yellow, and it is 21k not 18k to be this yellow. |  |
| r2 | C | bracelet06 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2a_85ee86d4.json` | `images/jewelry/abtest_r2_C_bracelet06_n2a_85ee86d4.jpg` | 5 | 1 | it is the same original image, just changed the background, not what we want |  |
| r2 | C | bracelet06 | 2 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2b_8c24ad83.json` | `images/jewelry/abtest_r2_C_bracelet06_n2b_8c24ad83.jpg` | 5 | 1 | it is the same original image, just changed the background, not what we want |  |
| r2 | C | bracelet06 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet06_n2c_dcf9945f.json` | `images/jewelry/abtest_r2_C_bracelet06_n2c_dcf9945f.jpg` | 5 | 1 | it is the same original image, just changed the background, not what we want |  |
| r2 | C | bracelet07 | 1 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2a_9cdb3fd6.json` | `images/jewelry/abtest_r2_C_bracelet07_n2a_9cdb3fd6.jpg` | 1 | 4 |  |  |
| r2 | C | bracelet07 | 1 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2b_51970bbb.json` | `images/jewelry/abtest_r2_C_bracelet07_n2b_51970bbb.jpg` | 3 | 4 |  |  |
| r2 | C | bracelet07 | 1 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2c_944717c7.json` | `images/jewelry/abtest_r2_C_bracelet07_n2c_944717c7.jpg` | 1 | 2 |  |  |
| r2 | C | bracelet07 | 2 | fidelity | material_only | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2a_a15b6b4f.json` | `images/jewelry/abtest_r2_C_bracelet07_n2a_a15b6b4f.jpg` | 5 | 3 | the studio could be better, the bracelet is yellowish, m but overall very good, it kept the exact shape of the bracelet, the center elongated link is a bit smaller thatn the orginal but still bigger than other elongated links in the bracelet like the original. |  |
| r2 | C | bracelet07 | 2 | fidelity | none | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2b_5653edfb.json` | `images/jewelry/abtest_r2_C_bracelet07_n2b_5653edfb.jpg` | 1 | 4 |  |  |
| r2 | C | bracelet07 | 2 | fidelity | chain_structured | gpt-image-2-image-to-image | 3:4/2K | `prompts/jewelry/abtest_r2_C_bracelet07_n2c_fc7d2721.json` | `images/jewelry/abtest_r2_C_bracelet07_n2c_fc7d2721.jpg` | 4 | 4 | the center Link size is not bigger as the original image |  |

---

## Phase 6 decision

**Overall winner:** Pending review

### Integration options

| If winner is… | Next step |
|---------------|-----------|
| GPT B or C | Route bracelets to GPT i2i in pipeline |
| Nano A + fidelity narrative | Update prompt_builder for bracelet products |
| None good enough | Batch-generate and manual pick |

Picker UI: open `/abtest-picker.html` (via API server) while `uvicorn` is running.

