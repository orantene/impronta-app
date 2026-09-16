# Image cost measurement (Visual Asset Engine step 1)

**2026-09-16 · attempt 1 · NOT COMPLETED — the OpenAI account has no credits.**

Facts established with the owner's key before the generation call:

- `GET /v1/models` (HTTP 200) lists these image models for the key: `chatgpt-image-latest, gpt-image-1, gpt-image-1-mini, gpt-image-1.5, gpt-image-2, gpt-image-2-2026-04-21, gpt-image-2.5-flare, gpt-image-2.5-flare-2026-09-08, gpt-image-2.5-sunburst, gpt-image-2.5-sunburst-2026-09-08`. **No `dall-e-*` model is available**, so the repo default `OPENAI_IMAGE_MODEL=dall-e-3` (`web/src/lib/ai/ai-image-generation.ts`) would fail on the first call; the correction in `03-visual-asset-engine.md §1` stands.
- Current list price (https://developers.openai.com/api/docs/pricing, read 2026-09-16), per 1M tokens: `gpt-image-2` / `gpt-image-2.5-flare` / `gpt-image-2.5-sunburst` = text input $5.00 · image input $8.00 · output $30.00; batch 50% ($2.50 / $4.00 / $15.00). Older: `gpt-image-1.5` output $32, `gpt-image-1-mini` output $8, `gpt-image-1` output $40.
- Planned measurement: model `gpt-image-2.5-flare`, size `1536x1024` (hero), quality `medium`, n=1; cost = usage tokens × the prices above, recorded in `measurement-1.json` with the exact model id, size, quality, usage and computed USD.

Result of the generation call: **HTTP 429 `insufficient_quota` / `credit_balance_exhausted`** ("You have no credits remaining. Add credits … /settings/organization/billing/"). No image was produced, no charge was made. Re-run the measurement once the owner adds credits; nothing in code depends on this number.

---

**2026-09-16 · attempt 2 · COMPLETED** (credits added by the owner; key "Impronta …GigA").

| Field | Value |
|---|---|
| model | `gpt-image-2.5-flare` |
| size · quality | `1536x1024` · `medium` |
| usage | input 90 text tokens (0 image) · output 343 image tokens · total 433 |
| list price used | $5 / $8 / $30 per 1M (text-in / image-in / output), developers.openai.com/api/docs/pricing read 2026-09-16 |
| **computed cost** | **$0.01074 per image** (batch mode: $0.00537) |
| latency | 18.0 s |
| file | `measurement-1.jpg` (re-encoded from the 1.86 MB PNG; the library re-encodes to ≤300 KB anyway) |

Full record: `measurement-1.json`. The image shows a manicure counter with the left third as negative space, no text, no face, no logo, as prompted.

**Batch projection against the $100 monthly cap** (at the measured $0.01074 sync / $0.00537 batch, hero size; smaller squares will cost less):

| Stage | Images | Sync USD | Batch USD |
|---|---|---|---|
| Heroes ×3 for all 131 types | 393 | $4.22 | $2.11 |
| Gallery ×4 at 2 alternatives | 1,048 | $11.26 | $5.63 |
| Wide, portrait, team, detail ×1 | 524 | $5.63 | $2.81 |
| **Full pool** | **1,965** | **$21.1** | **$10.6** |
| + 30 % regeneration after review | ~2,550 | ~$27.4 | ~$13.7 |

Well under the cap in either mode; heroes first can run as one chunk.
