# Home Audit — FINAL STATUS (Chrome-verified live)
*2026-05-19 — SUPERSEDES both `home-audit-2026-05-19-v11-vs-live.md` and `home-audit-2026-05-19-addendum-corrected-diagnosis.md`.*

## Live Chrome re-verification

Verified just now in the connected Chrome on `http://localhost:3000/impronta` (DOM inventory, full section walk).

## What's ACTUALLY on /impronta right now

### ✅ Already rendering correctly (close out — no action needed)

| Audit item | Live state |
|---|---|
| **H1** `location_discovery` map | ✅ SVG market map + "Featured market" panel + **5 pins** (Riviera Maya featured · Mexico City · Buenos Aires · Los Angeles coming-soon · Madrid coming-soon) |
| **H2** `editorial_split_hero` discovery form | ✅ Native `<form>` with 2 `<select>` (Category default "Models", Market default "Riviera Maya") + Explore submit |
| **H2** `editorial_split_hero` card-stack visual | ✅ 5 card-stack elements rendering, 3 layered media images |
| **H2** headline | ✅ "Discover premium talent across destination cities." |
| **H5** hero_search 4 chips | ✅ Riviera Maya · Mexico City · Buenos Aires · "More cities coming" (soft) |
| **H5** hero_search secondary CTA | ✅ "Apply as talent" → `/register` (root) |
| **H5** hero_search stat-line content | ✅ "28 represented talent · managed from brief to confirmation" (minor polish below) |
| **H6** location_discovery copy | ✅ Eyebrow "Talent network" + headline "Local faces, international reach" |
| **H8** process_steps eyebrow | ✅ "How it works" |
| **H8** values_trio eyebrow | ✅ "Why Impronta" |
| **Routing** Finding-B safety | ✅ All `/register`, `/login` resolve to ROOT (zero `/impronta/<auth>` mis-prefixing anywhere on page) |
| **Console** | ✅ Zero errors |

### ❌ Still gapped (real work remaining)

| Audit item | Live state | Action |
|---|---|---|
| **H3** site_footer | Only **2 columns** ("Discover", "Talent") · **0 social row** · **0 legal links** (no Privacy/Terms/contact email) | EITHER edit the live tenant footer rows via the page-builder Section editor (per-section, immediate); OR update `default-content.ts` shell defaults + re-seed (code path; currently **blocked** — that file is uncommitted-modified by the concurrent directory-section agent) |
| **H4** site_header social cluster | Only **2 icons** (WhatsApp + TikTok). Missing Instagram + phone-with-visible-number | Same options as H3 — admin SiteHeaderInspector edits the live tenant shell row directly, OR update `default-content.ts` (blocked on directory agent) |

### ⏳ Pending next recipe re-apply (minor polish, already committed)

- **H5 stat-label tone**: commit `d0315238b` changes the recipe to "agency-managed from brief to confirmation". Will take effect the next time `applyStarterComposition({ starterSlug: "impronta-home" })` runs against the Impronta tenant. Not currently re-applied — the live still shows "managed from brief to confirmation" (without "agency-" prefix). Cosmetic; the qualifier is mostly there.

## Corrected action set — what to actually do

### Option A (recommended for H3 + H4 — fastest, no code, no blocked dependency)

**Edit the two shell rows directly via the admin page-builder:**

1. **Footer** — open `/impronta/admin` → page-builder → site_footer section editor:
   - Add 2 columns to `columns[]`:
     - **Agency**: links → About (`#about`), For talent (`#join`), Contact (`#contact`)
     - **Account**: links → Client sign in (`/login`), Talent login (`/login`), Apply as talent (`/register`)
   - Add to `social[]`: Instagram, TikTok (verify schema-allowed platforms list).
   - Add to `legal.links[]`: Privacy (`/p/privacy`), Terms (`/p/terms`), `hello@impronta.studio` (`mailto:hello@impronta.studio`).
   - Update `legal.copyright`: `"© 2026 Impronta — International Talent Network"`.
   - Save section → topbar Publish.

2. **Header** — open the SiteHeaderInspector (the bespoke editor for site_header):
   - Add Instagram to `socialLinks[]`: `{ platform: "instagram", href: "https://instagram.com/impronta" }`.
   - Add phone to `contactLinks[]`: `{ type: "phone", value: "+5219840000000", label: "+52 984 000 0000" }` (label makes the number visible in the cluster, matching prototype).
   - Save → Publish.

Result: both gaps closed in ~10 minutes of admin clicks. Independent of any concurrent agent.

### Option B (code-path for H3 + H4 — requires waiting on directory agent)

Update `web/src/lib/site-admin/sections/shared/default-content.ts` site_footer + site_header entries (lines ~718+) to match the prototype, then re-seed all tenants on next admin login. **Currently blocked** — that file is uncommitted-modified by the directory-section agent. When they commit, a small follow-up agent can update the default entries in one pass.

### Option C (do nothing for now)

The home is in strong shape already. The two remaining gaps are non-blocking for launch — the footer columns + social + legal are nice-to-haves; the header cluster being half-filled is cosmetic. Ship the current state, fix the shell items in a follow-up sprint.

## The original P1+P2+P3 categorization, corrected

- **P1** was: H1 (map), H2 (hero form/stack), H3 (footer).
- **CORRECTED P1**: H3 only (footer 4-col + social + legal — biggest visible gap on the page, especially "no Privacy/Terms").
- **P2** was: H4, H5, H6.
- **CORRECTED P2**: H4 only (header social cluster — visible-but-cosmetic).
- **P3** stays: H5 stat-label "agency-" polish (already committed, pending re-apply).

H1 / H2 / H5 chips/CTA / H6 / H8 — all close as done.

## Owner gates unchanged

- **O1**: approve push of the local commits (audit doc + addendum + this final-status + the small stat-label polish + the 6C body + the multi-agent plan etc.).
- **O2**: Vercel prod env vars (`ENABLE_SITE_SHELL=tenants`, `SITE_SHELL_TENANT_IDS=00000000-0000-0000-0000-000000000001`).
- **O3** (the original "re-apply impronta-home"): the major slice already happened (the live shows it). One more re-apply at any time will pick up the small stat-label tone polish. No urgency.

*End — corrected final status 2026-05-19.*
