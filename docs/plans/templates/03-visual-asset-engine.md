# Templates & Imagery — 03 Visual Asset Engine (design)

**Status:** design v3, 2026-09-16 (v3 = owner's same-day revision, decision-imagery §9 on `docs/onboarding-spec-2026-09` commit 68032131e: **seed and grow, not bulk**). Owner decision 5 via the onboarding designer, **revised the same day by the owner's imagery decision** (`docs/plans/onboarding/decision-imagery-2026-09-16.md` on `docs/onboarding-spec-2026-09`, binding; its reasoning is kept there). Code follows after the decision-1 follow-up (handoff §8) and after #1989 merges. Paths under `web/`. Nothing in this file exists unless marked **(exists)**.

## Principle (owner)

The pool is Tulala's **base visual library**, not the personalisation layer. Hierarchy: **customer's own images → tenant-generated personalised images → type pool → family pool → universal fallback.** Everything below is the foundation of that hierarchy: every assigned image must be replaceable later by library choice, customer upload or tenant-specific generation (§5).

**v3 order (owner §9):** the up-front batch is the **seed** only (5 approved heroes per active type + a small family-level set for the other roles, so no slot ever falls to the 14 unverified images). Everything else is generated **per site, for that business**, after the account is verified, beside provisioning; arrival never waits for it. Tenant images enter the type pool **by approval only**, carrying the brief facts they were made from as tags, so the next business of the same kind is served better pool images before its own are ready. Hero uniqueness then holds by construction.

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
| `tags` | jsonb (object of fact → value) | the brief facts the prompt was filled from: `cuisine`, `clientele`, `setting`, `words` (owner's phrases), `visual_direction`; only stated facts, never a guess (§3c). GIN-indexed for selection (§5). Empty object for seed assets |
| `origin_tenant_id` | uuid null | the business a `tenant_generated` asset was made for; kept after pool approval (the originator keeps its image) |
| `review_note` | text | reason on reject / retire |
| `reviewed_by`, `reviewed_at` | uuid, timestamptz | |
| `model`, `model_size`, `model_quality` | text | what generated it |
| `prompt_version` | text | `type-prompt@v3` / `family-prompt@v1` |
| `generated_at` | timestamptz | |
| `measured_cost_usd` | numeric | from usage, not a constant |
| `provenance` | text check in (`generated`,`licensed`,`unverified`) | the 14 universal photos become `unverified` |
| `times_placed`, `last_placed_at` | int, timestamptz | usage metadata; `placed_tenant_count` derived from a new `platform_stock_placements(asset_id, tenant_id, site_compose_id, placed_at)` |

**New table `tenant_asset_assignments`** (the stored selection, owner §5): `id, tenant_id, page_role, slot, asset_id (nullable for owner uploads) , src, source check in (owner, tenant_generated, type_pool, family_pool, universal), direction, site_compose_id, selected_at, replaced_by_user_at, replaced_with_asset_id, pending_job_id (uuid null: a per-site generation is in flight for this slot; the builder's "your photos are being made" state, §4b)`. Unique on `(tenant_id, page_role, slot)`. The composer writes it once per compose; the builder's future "Replace image → Upload / Library / Generate for my business" updates it; a retired pool asset is swapped per tenant through it, never globally.

Backfill in the same migration: existing rows → `approval='approved'`, `provenance='unverified'`, `slot = role` (gallery rows spread `gallery-1..4` by sort_order), `direction = null`.

### 2b. Seed allocation (owner §9.1; the whole up-front batch)

| Role | Alternatives | Quality |
|---|---|---|
| hero | 5, one per visual direction | **medium** (comparison 2026-09-16, `evidence/cost-measurement/hero-quality/`: high = 3.84× cost, no meaningful difference after delivery re-encode; D-TPL-27). `high` remains the admin's per-asset regeneration option |
| wide | 2 | medium |
| portrait / about | 2 | medium |
| gallery 1–4 | 2 each (8) | medium |
| team | 2 | medium |
| detail | 2 | medium |
| **per type** | **21** | |

**v3 reading of this table:** only the **hero row is generated per type up front** (5 × ~47 active onboarding types ≈ 235 images, medium, < $5 with retries). The other rows become a **family-level seed** (2 per role per family, 12 families ≈ 216 images ≈ $2.3) so no slot falls to the 14 unverified images; the per-type numbers for wide/portrait/gallery/team/detail are reached only through approved tenant images (§4c), never by a per-type batch. Coverage table: heroes approved / 5 per type; family seed approved / 2 per role.

Reads (`queryLifestyleStockForType`) add `approval = 'approved'`; the fallback chain stays type → family → universal. `placed.photos.level` and "photos placed" in the compose stamp already exclude `universal` (D-TPL-23); `provenance = 'unverified'` is additionally excluded from every count.

## 3. Prompt engine as layers (owner §3), not 131 hand-written sets

`site-templates/stock-prompts/`: **global** (`global.ts`, photographic rules + hard restrictions) → **family art direction** (`families/<family>.ts`: light, palette, mood, people policy) → **business-type context** (`types/<type-id>.ts`: the place, the work, the objects; optional, family fallback) → **slot composition** (`slots.ts`: crop, negative space, distance per role) → **visual direction** (`directions.ts`: per family a set of 5 named directions with their modifiers, overridable per type) = the resolved prompt. `resolvePrompt({ typeId, slot, direction })` returns the string plus `{ global, family, type, slot, direction }` versions, both stored on the asset. Adding type #132 = one type-context block; everything else is inherited. A static test asserts every id in `business-types.ts` resolves for every slot × direction.

### 3b. Visual directions

Five per family, named, e.g. beauty: `editorial` (styled interior) · `service` (the work being done, hands not faces) · `result` (finished result close-up) · `lifestyle` (a client's moment) · `minimal` (tools and product composition). Heroes are generated one per direction; the other roles cycle directions so two assets of a slot never share one. Each direction also fixes a *setting* (interior/exterior, coastal/urban, time of day): the comparison run showed the model collapses to one Tulum beach-room vocabulary when the setting is left implicit. The direction is stored on the asset and on the assignment.

### 3c. Per-site filling of the direction layer (owner §9.4)

For a tenant job the direction layer is filled from the **brief's stated facts only**: `work.cuisine`, clientele (women's salon vs barber shop), setting (beachfront, neighbourhood, home visits), the owner's own phrases, and `brand.visual_direction` when the intake inferred it. Absent fact = neutral prompt: a "restaurant" with no cuisine gets cuisine-neutral images; nothing is inferred from the business name. The facts used are written to `tags` on every asset the job produces, and the resolved prompt still stores every layer version.

Shared rules layer (`global.ts`, applied to every prompt, versioned separately): composition and crop per role (hero 3:2 with clear negative space on the left OR right third for a headline, gallery 1:1, portrait 3:4, wide 3:1 band, team 4:3, detail 1:1 close-up), photographic realism (natural light, no HDR, no illustration), and hard restrictions: no logos, brand marks, readable text or signage, watermarks, recognisable faces of real people, minors; culturally appropriate to Mexico's Riviera Maya market first. The exact prompt string sent is stored on the asset (`prompt`) with `prompt_version`, so a prompt change never rewrites history. A static test asserts every id in `business-types.ts` resolves to a prompt (type or family).

## 4. Pipeline: generated → automated QA → human approved (owner §4)

1. **Generate** (batch API for the bulk pool, sync only for admin regeneration / on-demand): `platform_stock_jobs` rows (type, slot, direction, n, quality, mode, status, measured cost) processed in cron chunks; every result lands as `generated` with prompt, layer versions, model/size/quality, measured cost. Provider refusals are job states: `moderation_blocked` → one automatic reword retry then terminal `blocked` with the reason; `rate_limit_exceeded` → paced retry (batch mode avoids it).
2. **Automated QA** (`stock-qa.ts`, versioned, verdicts in `qa_json`): aspect ratio vs slot; visible text/signage and logo/brand detection (vision call, cheap model, admin setting); inappropriate content; obvious type mismatch (vision: "is this a <type>?"); duplicate and near-duplicate (perceptual hash across the type's pool); low quality (blur/blank/artefact heuristics + vision score). Pass → `qa_passed`; fail → `rejected` with the reason (kept for audit, never served).
3. **Human review** in `/platform/admin/stock` **(exists)**: an "Images needing review" queue ordered heroes first, side-by-side per slot × direction, approve / reject with reason / regenerate. Heroes: 100 % human before they serve. Wide/about/team: where practical. Gallery/detail: `qa_passed` may serve (soft launch) while curation continues.
4. Coverage table: approved (and qa_passed) / target per slot; heroes red until 5 approved.

### 4b. Per-site generation job (owner §9.2–9.3)

- **Trigger:** `composeSiteFromBrief` **(exists)** finishes with the seed picks and, only if the actor's auth user has `email_confirmed_at IS NOT NULL` (read server-side with the admin client from the `actorProfileId` the composer already receives; set by both the 8-digit `verifyOtp` path in `lib/auth/otp-flow.ts` and the Google callback; onboarding v3.2 has no flag of its own and "a session exists" is not enough), enqueues one `tenant_image_jobs` row: `{ tenant_id, site_compose_id, slots: [{page_role, slot, direction}], facts (the §3c tags), status queued|running|done|partial|failed, cost_usd, started_at, finished_at }`. Guests and unverified accounts never enqueue; the seed picks stand.
- **Scope:** 6–8 slots per site (hero, wide, portrait, gallery-1..4, team when a staff count exists), all medium, ≈ $0.08–0.10 per site at the measured price.
- **Runner:** a cron route (`/api/cron/tenant-images`, same lease pattern as the other crons) drains the queue oldest first with a global concurrency of 2 and ≥ 2 s between calls (the measured rate limit tripped at 2 parallel pairs), so a signup burst degrades to a longer wait, never to failures. Each image → `platform_stock_images` as `generated`, `source_kind = tenant`, `origin_tenant_id`, tags; then automated QA (§4.2). A slot's assignment is updated **only when its image passes automated QA**: `asset_id/src/source = tenant_generated`, `pending_job_id = null`; the page's `src` is rewritten through the page builder's image prop (draft body; live re-published only if the compose left it published). A failed or blocked slot keeps its pool image and clears `pending_job_id`.
- **"Photos being made" contract for the builder:** at compose the assignment rows for the job's slots carry `pending_job_id`. The builder reads assignments for the page and shows a quiet in-place state (dim badge on the image, copy key `builder.image.pendingGeneration`, ES/EN) on exactly those slots; it polls `actionListAssignments(pageId)` every 5 s while any slot is pending and swaps the `src` in place when the row changes. Nothing blocks editing; a user who replaces a pending slot by hand wins (`replaced_by_user_at` set → the runner skips that slot).
- **Spend gate:** the runner checks the usage gate before every call: a **daily image ceiling** (admin setting `ai_image_daily_cap`, default 400 ≈ $4.3/day, under the $100 monthly cap) and a **per-tenant regeneration cap** in the builder (`ai_image_regen_per_tenant`, default 20). Over the ceiling, jobs stay `queued` until the next day; the tenant's site is already complete on seed images.

### 4c. From tenant image to pool (owner §9.5)

Tenant images enter the review queue like any other (`generated → qa_passed → approved`). **Approval is what adds them to the type pool**, tags included; the originating tenant keeps its assignment. No automatic promotion, and a rejected tenant image stays assigned to its tenant only if it passed automated QA (it is served to nobody else either way).

## 5. Selection is stored, not recomputed (owner §5)

At compose the resolver picks per slot with the same owner → tenant_generated → type_pool → family_pool → universal order; **inside the type pool, tag matches first** (an asset whose `tags` share `cuisine`/`clientele`/`setting` with the brief outranks a plain-type asset, more shared facts win, ties broken by fewest placements), spreading directions and alternatives across tenants (the pick may still use a deterministic hash to choose, but the CHOICE IS WRITTEN to `tenant_asset_assignments` and never recomputed at render). Pages carry the chosen `src` as today; the assignment row is the record that lets the builder replace one image per tenant, lets a retired asset be swapped for the tenants that hold it, and feeds `times_placed`. `placed.photos.hero` in the compose stamp reports the assignment `source`; onboarding claims photos only for `type_pool` or better.

## 6. Acceptance for the engine

Rerun `scripts/acceptance-run.mts` **(exists)**: the hero assertion must PASS (no two types share a hero; every hero from a type pack); add "two sites of the same type differ in hero" (compose C01 twice on two QA tenants). Report cost per type (sum of measured costs of its approved + rejected assets) and cost per site (unchanged: `cms_ai_usage_log` by `site_compose_id`, now including the compose's image placements at \$0 because pool assets are pre-paid).

## 7. Order of work and rollout (owner §7 + §9: generation never blocks launch; per-site generation first)

1. Model setting + measured cost + request shape ✅ measured (§1b); hero high-vs-medium comparison ✅ done, verdict medium (§2b).
2. Migration: asset columns (incl. `tags`, `origin_tenant_id`) + `tenant_asset_assignments` (incl. `pending_job_id`) + `tenant_image_jobs` + backfill; reads serve `approved` (+ `qa_passed` for gallery/detail); the 14 marked `unverified`.
3. Prompt layers: global, 12 families, slots, directions, the §3c per-site filling; type contexts for the active onboarding types first.
4. Stored assignments in the composer (tag-first selection) + stamp reports the assignment source.
5. Per-site job: queue, cron runner with pacing, automated QA, assignment swap, builder pending state, spend gate.
6. Seed batch: heroes ×5 per direction for the active types + family-level set → human review → **Phase 1 gate: every active onboarding type has ≥ 5 approved heroes** → acceptance rerun (hero assertion + "two tenants of one type differ" + per-site cost incl. the tenant job) → continuous curation of approved tenant images into the pool. Builder Replace/Library/Upload (owner Phase 4) is the entry to the same assignment row and is scheduled with the builder work.

Owner owes: `OPENAI_API_KEY` (+ `OPENAI_IMAGE_MODEL` if it differs from the setting) in Vercel production and locally for the batch; the per-1M-token price from the vendor page for the cost measurement.
