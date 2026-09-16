# Templates & Imagery — 03 Visual Asset Engine (design)

**Status:** design v2, 2026-09-16. Owner decision 5 via the onboarding designer, **revised the same day by the owner's imagery decision** (`docs/plans/onboarding/decision-imagery-2026-09-16.md` on `docs/onboarding-spec-2026-09`, binding; its reasoning is kept there). Code follows after the decision-1 follow-up (handoff §8) and after #1989 merges. Paths under `web/`. Nothing in this file exists unless marked **(exists)**.

## Principle (owner)

The pool is Tulala's **base visual library**, not the personalisation layer. Hierarchy: **customer's own images → tenant-generated personalised images → type pool → family pool → universal fallback.** Everything below is the foundation of that hierarchy: every assigned image must be replaceable later by library choice, customer upload or tenant-specific generation (§5).

## 0. What the engine is

A permanent pipeline, not a batch: per business type → role → slot, several approved photos, chosen per site deterministically, reviewed by platform admin, with a manifest that records how every asset came to be. It extends what #1989 shipped (`platform_stock_images`, `lib/media/platform-stock*.ts`, `/platform/admin/stock`) rather than replacing it.

## 1. Blocking correction: the image model

The repo's image path targets `dall-e-3` (`lib/ai/ai-image-generation.ts` default `OPENAI_IMAGE_MODEL`, `lib/ai/ai-image-quota.ts` `IMAGE_GENERATION_COST_USD = 0.08`) **(exists)**. Per the onboarding designer, DALL·E 3 was withdrawn from the OpenAI API in May 2026 and the current family is `gpt-image-2` (sizes 1024², 1536×1024, 1024×1536 or multiples of 16; quality low…max; priced per image token, ~\$0.05 for a medium 1024² by third-party trackers; batch mode at half price). **Not verified against the vendor docs from this session (NV)**; the design therefore locks neither a model nor a price:

- **Model = admin setting** `ai_image_model` in the `settings` table, same pattern as `ai_generation_model` (`lib/ai/ai-generation-model.ts` **(exists)**), with a free-text model id validated only by shape and an options list the admin page shows as suggestions. `OPENAI_IMAGE_MODEL` env stays as the fallback below the setting.
- **Request shape** becomes model-family aware: `size` and `quality` are parameters (defaults 1536×1024 hero / 1024² gallery / 1024×1536 portrait, quality `medium`); the `b64_json`/`url` reply handling **(exists)** is kept.
- **Cost is measured, not assumed**: `measureImageCost()` generates ONE image at the chosen size/quality, reads the reply's usage (`output_tokens` when present) and the account's per-token price from a second admin setting `ai_image_price_per_1m_tokens` (owner enters it from the vendor's pricing page), stores the measured USD on the asset and in `cms_ai_usage_log`, and the admin page shows it before the batch button enables. No `IMAGE_GENERATION_COST_USD` constant is used for new assets.
- The owner supplies `OPENAI_API_KEY` in Vercel production (and locally for the batch run). Until then every generate action returns "Image provider not configured" **(exists behaviour)**.

## 1b. Measured (2026-09-16)

`gpt-image-2.5-flare` · 1536×1024 · medium · 433 tokens · **$0.01074 per image** ($0.00537 batch); full pool at the owner's allocation (§2b) ≈ 131 × 17 = 2,227 images ≈ $24 sync / $12 batch before the high-quality hero uplift; the cap is $100/month. Record: `evidence/cost-measurement/`.

## 2. Schema deltas (additive migration, one timestamp minted at start of work)

`platform_stock_images` gains:

| Column | Type | Meaning |
|---|---|---|
| `slot` | text | `hero` ×n, `wide`, `portrait`, `gallery-1..4`, `team`, `detail`; the role stays for reads |
| `approval` | text check in (`generated`,`qa_passed`,`approved`,`rejected`,`retired`) default `generated` | three-status review (§4): `approved` serves everywhere; `qa_passed` serves for gallery/detail (soft launch); heroes serve only `approved` |
| `direction` | text | the visual direction within the type (§3b), e.g. `editorial`, `service`, `result`, `lifestyle`, `minimal` |
| `qa_json` | jsonb | automated QA verdicts (aspect, text/logo detection, duplicate hash, quality score, type match) with the checker version |
| `layer_versions` | jsonb | `{ global, family, type, slot, direction }` prompt layer versions that produced the asset |
| `review_note` | text | reason on reject / retire |
| `reviewed_by`, `reviewed_at` | uuid, timestamptz | |
| `model`, `model_size`, `model_quality` | text | what generated it |
| `prompt_version` | text | `type-prompt@v3` / `family-prompt@v1` |
| `generated_at` | timestamptz | |
| `measured_cost_usd` | numeric | from usage, not a constant |
| `provenance` | text check in (`generated`,`licensed`,`unverified`) | the 14 universal photos become `unverified` |
| `times_placed`, `last_placed_at` | int, timestamptz | usage metadata; `placed_tenant_count` derived from a new `platform_stock_placements(asset_id, tenant_id, site_compose_id, placed_at)` |

**New table `tenant_asset_assignments`** (the stored selection, owner §5): `id, tenant_id, page_role, slot, asset_id (nullable for owner uploads) , src, source check in (owner, tenant_generated, type_pool, family_pool, universal), direction, site_compose_id, selected_at, replaced_by_user_at, replaced_with_asset_id`. Unique on `(tenant_id, page_role, slot)`. The composer writes it once per compose; the builder's future "Replace image → Upload / Library / Generate for my business" updates it; a retired pool asset is swapped per tenant through it, never globally.

Backfill in the same migration: existing rows → `approval='approved'`, `provenance='unverified'`, `slot = role` (gallery rows spread `gallery-1..4` by sort_order), `direction = null`.

### 2b. Allocation per type (owner §1; no role with a single image)

| Role | Alternatives | Quality |
|---|---|---|
| hero | 5, one per visual direction | **medium** (comparison 2026-09-16, `evidence/cost-measurement/hero-quality/`: high = 3.84× cost, no meaningful difference after delivery re-encode; D-TPL-27). `high` remains the admin's per-asset regeneration option |
| wide | 2 | medium |
| portrait / about | 2 | medium |
| gallery 1–4 | 2 each (8) | medium |
| team | 2 | medium |
| detail | 2 | medium |
| **per type** | **21** | |

The coverage table shows approved / target per slot with these targets.

Reads (`queryLifestyleStockForType`) add `approval = 'approved'`; the fallback chain stays type → family → universal. `placed.photos.level` and "photos placed" in the compose stamp already exclude `universal` (D-TPL-23); `provenance = 'unverified'` is additionally excluded from every count.

## 3. Prompt engine as layers (owner §3), not 131 hand-written sets

`site-templates/stock-prompts/`: **global** (`global.ts`, photographic rules + hard restrictions) → **family art direction** (`families/<family>.ts`: light, palette, mood, people policy) → **business-type context** (`types/<type-id>.ts`: the place, the work, the objects; optional, family fallback) → **slot composition** (`slots.ts`: crop, negative space, distance per role) → **visual direction** (`directions.ts`: per family a set of 5 named directions with their modifiers, overridable per type) = the resolved prompt. `resolvePrompt({ typeId, slot, direction })` returns the string plus `{ global, family, type, slot, direction }` versions, both stored on the asset. Adding type #132 = one type-context block; everything else is inherited. A static test asserts every id in `business-types.ts` resolves for every slot × direction.

### 3b. Visual directions

Five per family, named, e.g. beauty: `editorial` (styled interior) · `service` (the work being done, hands not faces) · `result` (finished result close-up) · `lifestyle` (a client's moment) · `minimal` (tools and product composition). Heroes are generated one per direction; the other roles cycle directions so two assets of a slot never share one. Each direction also fixes a *setting* (interior/exterior, coastal/urban, time of day): the comparison run showed the model collapses to one Tulum beach-room vocabulary when the setting is left implicit. The direction is stored on the asset and on the assignment; later the intake's inferred `brand.visual_direction` (onboarding's fact, optional) steers the pick.

Shared rules layer (`global.ts`, applied to every prompt, versioned separately): composition and crop per role (hero 3:2 with clear negative space on the left OR right third for a headline, gallery 1:1, portrait 3:4, wide 3:1 band, team 4:3, detail 1:1 close-up), photographic realism (natural light, no HDR, no illustration), and hard restrictions: no logos, brand marks, readable text or signage, watermarks, recognisable faces of real people, minors; culturally appropriate to Mexico's Riviera Maya market first. The exact prompt string sent is stored on the asset (`prompt`) with `prompt_version`, so a prompt change never rewrites history. A static test asserts every id in `business-types.ts` resolves to a prompt (type or family).

## 4. Pipeline: generated → automated QA → human approved (owner §4)

1. **Generate** (batch API for the bulk pool, sync only for admin regeneration / on-demand): `platform_stock_jobs` rows (type, slot, direction, n, quality, mode, status, measured cost) processed in cron chunks; every result lands as `generated` with prompt, layer versions, model/size/quality, measured cost. Provider refusals are job states: `moderation_blocked` → one automatic reword retry then terminal `blocked` with the reason; `rate_limit_exceeded` → paced retry (batch mode avoids it).
2. **Automated QA** (`stock-qa.ts`, versioned, verdicts in `qa_json`): aspect ratio vs slot; visible text/signage and logo/brand detection (vision call, cheap model, admin setting); inappropriate content; obvious type mismatch (vision: "is this a <type>?"); duplicate and near-duplicate (perceptual hash across the type's pool); low quality (blur/blank/artefact heuristics + vision score). Pass → `qa_passed`; fail → `rejected` with the reason (kept for audit, never served).
3. **Human review** in `/platform/admin/stock` **(exists)**: an "Images needing review" queue ordered heroes first, side-by-side per slot × direction, approve / reject with reason / regenerate. Heroes: 100 % human before they serve. Wide/about/team: where practical. Gallery/detail: `qa_passed` may serve (soft launch) while curation continues.
4. Coverage table: approved (and qa_passed) / target per slot; heroes red until 5 approved.

## 5. Selection is stored, not recomputed (owner §5)

At compose the resolver picks per slot with the same owner → tenant_generated → type_pool → family_pool → universal order, spreading directions and alternatives across tenants (the pick may still use a deterministic hash to choose, but the CHOICE IS WRITTEN to `tenant_asset_assignments` and never recomputed at render). Pages carry the chosen `src` as today; the assignment row is the record that lets the builder replace one image per tenant, lets a retired asset be swapped for the tenants that hold it, and feeds `times_placed`. `placed.photos.hero` in the compose stamp reports the assignment `source`; onboarding claims photos only for `type_pool` or better.

## 6. Acceptance for the engine

Rerun `scripts/acceptance-run.mts` **(exists)**: the hero assertion must PASS (no two types share a hero; every hero from a type pack); add "two sites of the same type differ in hero" (compose C01 twice on two QA tenants). Report cost per type (sum of measured costs of its approved + rejected assets) and cost per site (unchanged: `cms_ai_usage_log` by `site_compose_id`, now including the compose's image placements at \$0 because pool assets are pre-paid).

## 7. Order of work and rollout (owner §7: generation never blocks launch)

1. Model setting + measured cost + request shape ✅ measured (§1b); hero high-vs-medium comparison ✅ done, verdict medium (§2b).
2. Migration: asset columns + `tenant_asset_assignments` + backfill; reads serve `approved` (+ `qa_passed` for gallery/detail); the 14 marked `unverified`.
3. Prompt layers: global, 12 families, slots, directions; type contexts for the 48 case types first, the rest as one block each.
4. Jobs + batch mode + automated QA + review queue.
5. Stored assignments in the composer; stamp reports the assignment source.
6. Batch heroes ×5 per direction for all active types → human review → **Phase 1 launch gate: every active onboarding type has ≥ 5 approved heroes** → supporting roles (QA-passed may serve) → acceptance rerun (hero assertion + "two tenants of one type differ" + per-type/per-site cost) → continuous curation. Phases 4–5 (builder Replace/Library/Upload, tenant-specific generation) build on the assignments table and are not in this program.

Owner owes: `OPENAI_API_KEY` (+ `OPENAI_IMAGE_MODEL` if it differs from the setting) in Vercel production and locally for the batch; the per-1M-token price from the vendor page for the cost measurement.
