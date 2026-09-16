# Templates & Imagery — 03 Visual Asset Engine (design)

**Status:** design, 2026-09-16. Owner decision 5 via the onboarding designer. Code follows after the decision-1 follow-up (handoff §8) and after #1989 merges. Paths under `web/`. Nothing in this file exists unless marked **(exists)**.

## 0. What the engine is

A permanent pipeline, not a batch: per business type → role → slot, several approved photos, chosen per site deterministically, reviewed by platform admin, with a manifest that records how every asset came to be. It extends what #1989 shipped (`platform_stock_images`, `lib/media/platform-stock*.ts`, `/platform/admin/stock`) rather than replacing it.

## 1. Blocking correction: the image model

The repo's image path targets `dall-e-3` (`lib/ai/ai-image-generation.ts` default `OPENAI_IMAGE_MODEL`, `lib/ai/ai-image-quota.ts` `IMAGE_GENERATION_COST_USD = 0.08`) **(exists)**. Per the onboarding designer, DALL·E 3 was withdrawn from the OpenAI API in May 2026 and the current family is `gpt-image-2` (sizes 1024², 1536×1024, 1024×1536 or multiples of 16; quality low…max; priced per image token, ~\$0.05 for a medium 1024² by third-party trackers; batch mode at half price). **Not verified against the vendor docs from this session (NV)**; the design therefore locks neither a model nor a price:

- **Model = admin setting** `ai_image_model` in the `settings` table, same pattern as `ai_generation_model` (`lib/ai/ai-generation-model.ts` **(exists)**), with a free-text model id validated only by shape and an options list the admin page shows as suggestions. `OPENAI_IMAGE_MODEL` env stays as the fallback below the setting.
- **Request shape** becomes model-family aware: `size` and `quality` are parameters (defaults 1536×1024 hero / 1024² gallery / 1024×1536 portrait, quality `medium`); the `b64_json`/`url` reply handling **(exists)** is kept.
- **Cost is measured, not assumed**: `measureImageCost()` generates ONE image at the chosen size/quality, reads the reply's usage (`output_tokens` when present) and the account's per-token price from a second admin setting `ai_image_price_per_1m_tokens` (owner enters it from the vendor's pricing page), stores the measured USD on the asset and in `cms_ai_usage_log`, and the admin page shows it before the batch button enables. No `IMAGE_GENERATION_COST_USD` constant is used for new assets.
- The owner supplies `OPENAI_API_KEY` in Vercel production (and locally for the batch run). Until then every generate action returns "Image provider not configured" **(exists behaviour)**.

## 2. Schema deltas (additive migration, one timestamp minted at start of work)

`platform_stock_images` gains:

| Column | Type | Meaning |
|---|---|---|
| `slot` | text | `hero` ×n, `wide`, `portrait`, `gallery-1..4`, `team`, `detail`; the role stays for reads |
| `approval` | text check in (`candidate`,`approved`,`rejected`,`retired`) default `candidate` | only `approved` is served |
| `review_note` | text | reason on reject / retire |
| `reviewed_by`, `reviewed_at` | uuid, timestamptz | |
| `model`, `model_size`, `model_quality` | text | what generated it |
| `prompt_version` | text | `type-prompt@v3` / `family-prompt@v1` |
| `generated_at` | timestamptz | |
| `measured_cost_usd` | numeric | from usage, not a constant |
| `provenance` | text check in (`generated`,`licensed`,`unverified`) | the 14 universal photos become `unverified` |
| `times_placed`, `last_placed_at` | int, timestamptz | usage metadata; `placed_tenant_count` derived from a new `platform_stock_placements(asset_id, tenant_id, site_compose_id, placed_at)` |

Backfill in the same migration: existing rows → `approval='approved'`, `provenance='unverified'`, `slot = role` (gallery rows spread `gallery-1..4` by sort_order).

Reads (`queryLifestyleStockForType`) add `approval = 'approved'`; the fallback chain stays type → family → universal. `placed.photos.level` and "photos placed" in the compose stamp already exclude `universal` (D-TPL-23); `provenance = 'unverified'` is additionally excluded from every count.

## 3. Prompt registry (code, versioned)

`site-templates/stock-prompts/` — `families/<family>.ts` and `types/<type-id>.ts` (optional; family fallback), each exporting

```ts
{ version: "v1", subject: { es: "...", en: "..." }, setting: "...", people: "staff at work, no faces recognisable" | "no people", palette: "warm neutrals", perRole: { hero: {...}, gallery: {...}, … } }
```

Shared rules layer (`rules.ts`, applied to every prompt, versioned separately): composition and crop per role (hero 3:2 with clear negative space on the left OR right third for a headline, gallery 1:1, portrait 3:4, wide 3:1 band, team 4:3, detail 1:1 close-up), photographic realism (natural light, no HDR, no illustration), and hard restrictions: no logos, brand marks, readable text or signage, watermarks, recognisable faces of real people, minors; culturally appropriate to Mexico's Riviera Maya market first. The exact prompt string sent is stored on the asset (`prompt`) with `prompt_version`, so a prompt change never rewrites history. A static test asserts every id in `business-types.ts` resolves to a prompt (type or family).

## 4. Pipeline and admin review

`/platform/admin/stock` **(exists)** grows three panels:
1. **Coverage** (exists) → per slot: approved / target (heroes target 3, gallery ×4 target 2 each, others 1) with red cells.
2. **Generate candidates**: pick type (or family), slot, n; runs `generateLifestyleStockBytes` n times with the registry prompt; each result is stored as `candidate` (never served). Batch mode across types is a queued job (`platform_stock_jobs` table: type, slot, n, status, cost) processed by a cron route in chunks so a 131-type run survives function timeouts.
3. **Review**: side-by-side candidates per slot; approve / reject with a reason / regenerate; approved assets enter the pool immediately (the tenant lane and the composer read `approved` only). Rejected rows stay for the audit; retire works as today.

## 5. Selection rule (composer)

`buildImageResolver` **(exists)** receives the approved pool per slot. Choice among alternatives is deterministic per tenant: `index = hash(tenantId + slot) % pool.length`, so a re-compose keeps its pick while two tenants of one type differ. Owner media still outranks everything; the pack order type → family → universal is unchanged. Each placement writes a `platform_stock_placements` row and bumps `times_placed` (fire-and-forget).

## 6. Acceptance for the engine

Rerun `scripts/acceptance-run.mts` **(exists)**: the hero assertion must PASS (no two types share a hero; every hero from a type pack); add "two sites of the same type differ in hero" (compose C01 twice on two QA tenants). Report cost per type (sum of measured costs of its approved + rejected assets) and cost per site (unchanged: `cms_ai_usage_log` by `site_compose_id`, now including the compose's image placements at \$0 because pool assets are pre-paid).

## 7. Order of work

1. Model setting + measured cost + request shape (small; unblocks everything; needs the key to test the measurement).
2. Migration + reads (`approved` only) + `unverified` flag on the 14.
3. Prompt registry for the 12 families, then type prompts for the 48 case types.
4. Admin generate/review panels + job table + cron chunking.
5. Deterministic selection + placements.
6. Batch: heroes ×3 for all 131 types, then gallery ×4, wide, portrait, team, detail; review; acceptance rerun; cost report.

Owner owes: `OPENAI_API_KEY` (+ `OPENAI_IMAGE_MODEL` if it differs from the setting) in Vercel production and locally for the batch; the per-1M-token price from the vendor page for the cost measurement.
