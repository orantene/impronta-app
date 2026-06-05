# Representation Engine — unified "Where you appear / My agencies" drawer

**Status:** spec / not started · **Author handoff date:** 2026-06-05 · **Owner surface:** talent self-service (`/talent/*`) + agency admin mirror

**Runnable tasks:** [`representation-engine-plan-2026-06-05.md`](./representation-engine-plan-2026-06-05.md) (phases, commands, acceptance checkboxes).

> **Read this whole file before writing code.** It is self-contained: every fact below was verified against prod (Supabase `pluhdapdnuiulvxmyspd`) and `origin/main` on 2026-06-05. Paths are relative to `web/`. If a claim here disagrees with the code you see, **trust the code and update this file** — do not guess.

---

## 0. TL;DR (what we're building, in one paragraph)

Today a talent's representation is scattered across three surfaces that each render the same roster data differently and partly fake: **My pages → "Where you appear"**, **Money → "Your agencies"**, and **Settings → profile visibility**. We are replacing all three entry points with **one shared `RepresentationDrawer`** that lists every place a profile appears (the platform hub, each agency/workspace roster, and the talent's own page), shows the **true effective visibility** of each (including two-way talent⇄agency conflicts), and exposes the real actions: **visit/preview, set primary, hide/show, pause, leave**. Along the way we fix three correctness bugs: (1) new talents aren't auto-added to the Tulala hub, (2) the "14-day end relationship" is cosmetic, (3) "Where you appear" shows rosters a talent is *on* but not whether they're actually *visible*.

---

## 1. Background & verified findings (the "why")

### 1.1 The visibility data model (memorize this — everything depends on it)

A talent's presence on a workspace/agency/hub is **one row** in `public.agency_talent_roster`:

| column | type | meaning |
|---|---|---|
| `tenant_id` | uuid (FK → `agencies.id`) | the agency/hub/workspace |
| `talent_profile_id` | uuid (FK → `talent_profiles.id`) | the talent |
| `status` | text | `active` \| `pending` \| `inactive` \| `removed` |
| `agency_visibility` | text | `roster_only` \| `site_visible` \| `featured` — **the AGENCY's "eye"** |
| `talent_site_hidden` | boolean | **the TALENT's per-roster "eye"** (true = talent hid self here) |
| `is_primary` | boolean | one primary per talent (partial unique index) |
| `source_type` | text | `agency_created` \| `agency_added` \| `platform_assigned` |
| `hub_visibility_status` | text | `not_submitted` (hub-network submission state; not used by the public gate) |
| `exclusivity_status` | enum | `confirmed` \| `auto_assigned` \| `declined` (default `confirmed`) |
| `added_at`, `removed_at`, `created_at`, `updated_at` | tz | timestamps |

`agencies` (the tenant): `id` (== tenant_id), `slug`, `display_name`, `kind` enum `agency|hub`, `plan_tier` text `free|studio|agency|network`, `status`, `talent_seat_limit`.

**THE PUBLIC-VISIBILITY TRUTH (this is the single most important rule):**
A talent is publicly shown on a tenant's roster/site **iff ALL of:**
```
agency_talent_roster.status = 'active'
AND agency_talent_roster.agency_visibility IN ('site_visible','featured')
AND agency_talent_roster.talent_site_hidden = false
AND talent_profiles.is_publicly_hidden = false        -- global talent kill-switch
AND talent_profiles.deleted_at IS NULL
```
This is enforced in three places that MUST stay in agreement:
- DB function `public.talent_has_public_roster(talent_profile_id)` (used by the anon RLS policy `talent_select_public` on `talent_profiles`) — gates the `/t/<code>` page and directory.
- `web/src/lib/saas/talent-roster.ts` (`PUBLIC_VISIBILITIES = ['site_visible','featured']`).
- `[tenantSlug]/talent/settings/ProfileVisibilityDrawer.tsx` (`shown = !siteHidden && !globalHidden`, `eyeOff = agencyVisibility === 'roster_only'`).

**Two-way conflict (this is the feature the user wants surfaced):**
- Agency sets `roster_only` → talent is NOT shown even if the talent wants to be → **"Agency isn't showing you."**
- Talent sets `talent_site_hidden = true` → NOT shown even if the agency wants to → **"You hid your profile here"** (agency-side mirror: **"Talent hid their profile on your roster."**)
- `talent_profiles.is_publicly_hidden = true` → hidden EVERYWHERE (global switch overrides all per-roster toggles).

### 1.2 Verified findings (prod, 2026-06-05)

1. **New talents are NOT auto-enrolled in the Tulala hub.** The 101 current talents are in the hub only via a one-time SQL batch (2026-06-05). `web/src/lib/server-actions/talent-workspace-provision.ts` inserts a `<slug>.tulala.digital` `agency_domains` row but **no** `agency_talent_roster` hub row. → **A talent created after that batch will 404 on `/t/<code>` and be absent from `/directory`** until manually rostered. (Public gate needs an active public roster; see 1.1.) **This is the urgent correctness gap.**

2. **"Where you appear" / "Your agencies" are REAL data**, not fixtures — they read `agency_talent_roster`. Example: TAL-92026 (Orlando) has 4 active rosters (Impronta `agency`, Hotels Express `free`, QA Test 27 `free`, Tulala `hub/network`) + his own page = 5 in "Where you appear". **BUT** only Tulala is `site_visible`; the other 3 are `roster_only`, so he is *listed on* them but *not publicly visible on* them. The current UI does not show this distinction → it reads as fake. **The drawer must show effective visibility, not just membership.**
   - ⚠️ `web/src/components/talent/money/MoneyAgencyCards.tsx` imports a `MY_AGENCIES` constant as a fallback — confirm it never renders fixture rows in prod (it should always use `bridgeTalentAgencies`). Kill the fixture fallback.

3. **"End relationship" is wired but the "14-day" is cosmetic.** `selfLeaveAgency` (`web/src/lib/server-actions/talent-self-profile-sections.ts` ~line 676) sets `status='inactive'` **immediately** (talent loses public distribution from that agency right away). There is **no cron** that ever flips `inactive → removed`; the "14 days to wind down" text is a lie, and there is no true immediate "leave/removed" from the talent side. **Replace with honest semantics (see §7).**

### 1.3 What already exists (reuse, don't rebuild ~70%)

- `web/src/app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityDrawer.tsx` — per-agency `talent_site_hidden` toggles + global `is_publicly_hidden`; **already** computes `shown`/`eyeOff` and disables per-site rows when globally hidden. **This is the visibility brain — fold it in.**
- `web/src/components/admin/shell/internal/talent-drawers/agency.tsx` — `TalentAgencyRelationshipDrawer` (status, joined, take-rate, "what this agency can do", set-primary, leave). Opened via `openDrawer("talent-agency-relationship", { agencyId })`.
- Entry points today: Money cards `web/src/components/talent/money/MoneyAgencyCards.tsx` (line ~319 `openDrawer("talent-agency-relationship", …)`); My-pages "Where you appear" in `web/src/components/admin/shell/internal/talent/pages/SettingsPage.tsx`.
- Wired actions in `web/src/lib/server-actions/talent-self-profile-sections.ts`: `selfLeaveAgency`, `selfSetPrimaryAgency`; per-roster hide in `[tenantSlug]/talent/settings/actions.ts` (`talent_site_hidden` update ~line 126).
- Talent shell plumbing: `useAdminShell()` exposes `openDrawer`, `closeDrawer`, `toast`, `bridgeTalentAgencies`, `bridgeTalentSelfProfile`. Drawer registry: `web/src/components/admin/shell/internal/talent-drawers.tsx`. Route syncer: `web/src/app/(workspace)/talent/_talent-page-route-syncer.tsx`.
- Guard: `requireTalentSelfAction(talent_profile_id)` (in `talent-self-profile-sections.ts`) returns `{ ok, supabase, tenantId }` scoped to the talent.

---

## 2. The canonical "effective visibility" helper (BUILD THIS FIRST)

Create **one** function both the UI and any future caller use, so the truth-table lives in exactly one place.

`web/src/lib/talent/representation.ts` (new):
```ts
export type RepresentationKind = "hub" | "agency" | "self_page";
export type RosterStatus = "active" | "pending" | "inactive" | "removed";
export type AgencyVisibility = "roster_only" | "site_visible" | "featured";

export type RepresentationEntry = {
  tenantId: string;            // agencies.id (or the talent's own page id for self_page)
  slug: string;
  name: string;                // agencies.display_name
  kind: RepresentationKind;
  planTier: string | null;     // free|studio|agency|network
  status: RosterStatus;
  agencyVisibility: AgencyVisibility;
  talentSiteHidden: boolean;
  isPrimary: boolean;
  takeRatePct: number | null;
  joinedAt: string | null;
  publicUrl: string;           // see §5.4 for URL rules (hub → tulala.digital, agency → custom/sub)
  // derived:
  effective: EffectiveVisibility;
};

export type EffectiveVisibility =
  | "live"            // publicly visible here
  | "you_hid"         // talent_site_hidden = true
  | "agency_hidden"   // agency_visibility = roster_only (agency's eye off)
  | "winding_down"    // status = inactive
  | "pending"         // status = pending (agency hasn't activated)
  | "global_hidden"   // talent_profiles.is_publicly_hidden = true
  | "removed";        // status = removed

export function resolveEffectiveVisibility(args: {
  status: RosterStatus;
  agencyVisibility: AgencyVisibility;
  talentSiteHidden: boolean;
  globalHidden: boolean;       // talent_profiles.is_publicly_hidden
}): EffectiveVisibility {
  if (args.status === "removed") return "removed";
  if (args.globalHidden) return "global_hidden";
  if (args.status === "inactive") return "winding_down";
  if (args.status === "pending") return "pending";
  if (args.talentSiteHidden) return "you_hid";
  if (args.agencyVisibility === "roster_only") return "agency_hidden";
  return "live"; // active + site_visible/featured + not hidden
}
```
Add a unit test `representation.test.ts` covering every branch + precedence (global beats per-roster; removed beats all).

---

## 3. Backend: one loader + the action set

### 3.1 Loader

`loadRepresentation(talentProfileId)` → `RepresentationEntry[]` plus `{ globalHidden: boolean }`.
- Reads `agency_talent_roster` joined to `agencies` where `talent_profile_id = $1 AND status != 'removed'`, ordered: primary first, then `kind='hub'`, then name.
- Reads `talent_profiles.is_publicly_hidden` for `globalHidden`.
- Computes `effective` via `resolveEffectiveVisibility`.
- Computes `publicUrl` per §5.4.
- Prepend the **self page** entry (kind `self_page`) representing the talent's own `tulala.digital/t/<code>` page (always present; "Owned by you · Controlled by your Talent plan").
- Put it in `web/src/lib/server-actions/` as a `"use server"` action OR in the talent data-bridge consumed by `useAdminShell().bridgeTalentAgencies`. **Preferred:** extend `bridgeTalentAgencies` so all three entry points get the same model with zero new fetching.
- RLS: the talent's own session can read their roster rows (RLS allows `talent_select_own`-style). For `agency_visibility`/agency name across tenants, use the talent-scoped client; if blocked, use a SECURITY DEFINER RPC `talent_representation_for_self(p_talent_profile_id)` (mirror the pattern of `talent_has_public_roster`).

### 3.2 Actions (talent mode) — all in `talent-self-profile-sections.ts`, all guarded by `requireTalentSelfAction`

| action | effect | exists? |
|---|---|---|
| `selfSetRosterVisibility({ talent_profile_id, agency_id, hidden })` | `agency_talent_roster.talent_site_hidden = hidden` for that tenant | **partially** — see `[tenantSlug]/talent/settings/actions.ts:126`; lift into a self action keyed by agency_id |
| `selfSetGlobalHidden({ talent_profile_id, hidden })` | `talent_profiles.is_publicly_hidden = hidden` | exists in visibility flow; confirm |
| `selfSetPrimaryAgency({ talent_profile_id, agency_id })` | one primary; confirmed | ✅ exists |
| `selfPauseAgency({ talent_profile_id, agency_id })` | `status='inactive'` (reversible) | rename/replace `selfLeaveAgency` |
| `selfResumeAgency({ talent_profile_id, agency_id })` | `status='active'` (only from inactive) | **new** |
| `selfRemoveAgency({ talent_profile_id, agency_id })` | `status='removed', removed_at=now()` (permanent) | **new** |

Each returns `{ ok: true } | { ok: false, error }`, logs via `logServerError`, and calls the shell's data-bridge refresh (`bridgeTalentAgencies`) on success. **Never** add a `toast("… (demo)")` fake-success path (that anti-pattern exists in some settings drawers — do not copy it).

### 3.3 Actions (agency mode) — workspace admin viewing a talent on THEIR roster

Reuse existing admin roster actions (`web/src/lib/server-actions/admin-talent-roster.ts`): set `agency_visibility` (roster_only/site_visible/featured), and read-only display of the talent's `talent_site_hidden` so the agency sees the 🔴 mirror. Do **not** let an agency flip `talent_site_hidden` (that's the talent's switch) — show it read-only with the conflict helper.

---

## 4. Auto-enroll new talents into the Tulala hub (URGENT — ship standalone, Phase 0)

Without this, every new signup is invisible. Two implementation options; **prefer the DB trigger** (robust against every code path that creates talent).

**Option A — DB trigger (preferred).** New migration `supabase/migrations/<ts>_auto_enroll_talent_into_platform_hub.sql`:
```sql
-- Ensure every approved, non-deleted talent has an active, site_visible row
-- in the platform network hub (kind='hub' + plan_tier='network').
create or replace function public.ensure_talent_in_platform_hub()
returns trigger language plpgsql security definer set search_path=public as $$
declare hub_id uuid;
begin
  select id into hub_id from public.agencies
   where kind='hub' and plan_tier='network' and status='active'
   order by created_at asc limit 1;
  if hub_id is null then return new; end if;
  if new.deleted_at is not null then return new; end if;
  -- only when it makes sense to be public (tune to your workflow gate)
  if new.workflow_status not in ('approved','published') then return new; end if;
  insert into public.agency_talent_roster
    (tenant_id, talent_profile_id, source_type, status, agency_visibility, talent_site_hidden, is_primary)
  values (hub_id, new.id, 'platform_assigned', 'active', 'site_visible', false, false)
  on conflict do nothing;   -- partial unique index already prevents dup live rows
  return new;
end $$;

drop trigger if exists trg_talent_auto_enroll_hub on public.talent_profiles;
create trigger trg_talent_auto_enroll_hub
  after insert or update of workflow_status on public.talent_profiles
  for each row execute function public.ensure_talent_in_platform_hub();
```
- The `on conflict do nothing` relies on the existing partial unique index `agency_talent_roster_tenant_talent_live_uniq (tenant_id, talent_profile_id) WHERE status IN ('pending','active','inactive')`. **Verify** that index name before relying on it; if `on conflict` can't target a partial index cleanly, guard with `WHERE NOT EXISTS (...)` instead.
- After writing: `npm run db:push` (per project deploy protocol — migrations are NOT auto-applied). Then `npm run deploy:smoke` checks drift.

**Option B — app-level.** Add the same insert to the talent approval/provision action (`talent-workspace-provision.ts` and/or the approve action). Less robust (misses other creation paths) — only if a trigger is rejected.

**Backfill** (one-time, already done for the current 101 but re-run safe):
```sql
INSERT INTO agency_talent_roster (tenant_id, talent_profile_id, source_type, status, agency_visibility, talent_site_hidden, is_primary)
SELECT '<HUB_ID>', tp.id, 'platform_assigned','active','site_visible',false,false
FROM talent_profiles tp
WHERE tp.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM agency_talent_roster r WHERE r.tenant_id='<HUB_ID>' AND r.talent_profile_id=tp.id AND r.status IN ('pending','active','inactive'));
```
The current platform hub: `agencies.id = 40081ec3-5ca8-43a0-b50b-31c927b2716b`, slug `tulala`, kind `hub`, plan_tier `network`. **Do not hardcode this UUID in app code** — always resolve via `getPlatformHubTenant()` (`web/src/lib/saas/platform-hub.ts`) which finds kind=hub+plan_tier=network.

---

## 5. The `RepresentationDrawer` (UX spec)

One component, two modes (`actor: "talent" | "agency"`), opened from all entry points.

### 5.1 Entry points (wire these to the same drawer)
1. **My pages → "Where you appear"** rows (`talent/pages/SettingsPage.tsx`) → `openDrawer("representation")` (whole list) or `openDrawer("representation", { focusAgencyId })`.
2. **Money → "Your agencies"** cards (`MoneyAgencyCards.tsx`, currently `openDrawer("talent-agency-relationship", …)`) → repoint to `openDrawer("representation", { focusAgencyId })`.
3. **Settings → visibility** card → `openDrawer("representation")`.
Deprecate `TalentAgencyRelationshipDrawer` + `ProfileVisibilityDrawer` once parity is reached (keep their actions).

### 5.2 Layout — list + accordion (RECOMMENDED over flat)
A scrollable list; each row is a tenant. **Click a row to expand** an accordion with full info + actions. Keep collapsed rows information-dense and calm; put destructive/secondary actions inside the expansion.

**Collapsed row:**
```
[logo]  Name   [HUB|AGENCY] [plan badge]          [effective-visibility chip]   [chevron]
        <publicUrl>  (copy)
```

**Effective-visibility chip** (drive from `effective`):
| effective | talent-mode chip | agency-mode chip |
|---|---|---|
| `live` | 🟢 Live | 🟢 Live on your roster |
| `you_hid` | ⚪ You hid this | 🔴 Talent hid their profile here |
| `agency_hidden` | 🔴 Agency isn't showing you | ⚪ Not on your public site (roster-only) |
| `winding_down` | 🟡 Winding down | 🟡 Leaving (inactive) |
| `pending` | 🟡 Pending | 🟡 Pending activation |
| `global_hidden` | ⚪ Hidden everywhere | 🔴 Talent hidden globally |
| `removed` | (not shown — filtered) | — |

### 5.3 Expanded accordion (per tenant)
- **Info block:** kind, plan, joined date, take-rate %, primary?, exclusivity.
- **"What this agency can do"** (copy from `agency.tsx`): pitch to clients (you confirm), list on public roster, hold dates (with your approval), DM via inbox, take X% of bookings they bring.
- **Link:** `publicUrl` + copy + **"Preview / Visit my profile"** (opens in new tab).
- **Actions (talent mode):**
  - **Visibility toggle (eye)** → `selfSetRosterVisibility`. If `agencyVisibility==='roster_only'`, render the toggle **disabled** with red helper: *"{Agency} controls this — they haven't published you on their site. Ask them to feature you."* If `globalHidden`, disable all per-roster toggles with helper *"You're hidden everywhere — turn that off first."* (top global switch).
  - **Set as primary** (hidden if already primary or kind=self_page).
  - **Pause distribution** (immediate `inactive`) / **Resume** (if inactive).
  - **Leave permanently** (`removed`) — confirm dialog (see §7).
- **Actions (agency mode):** set `agency_visibility` (roster_only/site_visible/featured); read-only talent-hid state with the 🔴 mirror helper.
- **Top of drawer:** a **global** "Hide my profile everywhere" switch (`is_publicly_hidden`) with a clear warning that it overrides every roster.

### 5.4 publicUrl rules (reuse, don't reinvent)
- **self_page / hub (Tulala):** `https://tulala.digital/t/<profile_code>` (the platform/marketing surface). **Never** `<slug>.tulala.digital` for the hub — that subdomain is unprovisioned and 404s (this exact bug was fixed in the workspace switcher; see `web/src/lib/saas/workspace-public-url.ts` + PR #259).
- **agency with custom domain:** `https://<custom-domain>/t/<profile_code>` (e.g. `improntamodels.com/t/…`).
- **agency on subdomain:** `https://<slug>.tulala.digital/t/<profile_code>` only if that subdomain row exists in `agency_domains` (else fall back to `tulala.digital/<slug>/t/<code>` path form). Use the existing helper `web/src/lib/talent/agency-roster-profile-url.ts` (`agencyRosterProfileUrl`) — extend it, don't duplicate.

---

## 6. The directory/visibility consequence the user actually cares about

When the talent flips visibility here, it must change what shows on the public surfaces **and** the talent's own roster eye-icon must reflect the agency's override (and vice-versa). Wiring:
- `selfSetRosterVisibility` / agency `setAgencyVisibility` write the roster row → the public gate (`talent_has_public_roster`) recomputes automatically (it's a live function) for `/t/<code>`.
- **Directory is cached + matview-backed:** the public directory reads the `talent_discover_index` materialized view (gated on `talent_profiles.is_discoverable = true AND workflow_status IN ('approved','published')`) and a 120s `unstable_cache`. **Visibility changes will NOT appear in the directory until the matview is refreshed.** After any visibility/roster mutation, call `refresh_talent_discover_index()` (RPC) or rely on the 15-min cron `/api/cron/refresh-discover-index`. Document this latency in the UI ("changes appear in search within ~15 min"). ⚠️ `tulala.digital/directory` is served by `(marketing)/global-directory`, NOT `(public)/directory` (confirm with the `x-matched-path` response header) — see PR #267.

---

## 7. Fix the end-relationship semantics (make it honest)

Replace the fake 14-day flow. Two clear, truthful actions:
- **Pause distribution (immediate, reversible):** `status='inactive'`. Copy: *"You'll stop being pitched and listed by {Agency} right now. Active bookings continue. You can resume anytime."* Button: **Pause** / when inactive show **Resume**.
- **Leave permanently:** `status='removed', removed_at=now()`. Copy: *"This removes you from {Agency}'s roster. Active bookings already confirmed still pay out. This can't be undone — they'd have to re-invite you."* Confirm with a typed/explicit confirm.
- **DELETE the "Send 14-day notice" wording** unless you actually implement a scheduled removal. If a grace period is wanted: add `scheduled_removal_at timestamptz` + a daily cron that flips due rows to `removed`, and make the UI show the real date. Until that cron exists, **do not show a countdown** (today it's a lie).

---

## 8. Phasing + acceptance criteria

> Each phase = its own branch off `main`, its own PR, gated by `npx tsc --noEmit && npm run lint` (or the Vercel build typecheck if worktree `node_modules` is missing — see §10), merged via PR, then `npm run deploy:promote && npm run deploy:smoke` (prod deploy is **manual**).

- **Phase 0 — Auto-enroll (URGENT, ship alone first).** §4 trigger + backfill + `db:push`. **AC:** create a brand-new approved talent → it has an active `site_visible` Tulala-hub roster row → `/t/<code>` returns 200 with the premium template → appears in `/directory` after a matview refresh. Verify with the SQL census in §11.
- **Phase 1 — Read-only unified drawer.** `resolveEffectiveVisibility` + `loadRepresentation` + the drawer list with chips, wired to all 3 entry points (read-only, no actions yet). **AC:** Orlando (TAL-92026) shows 5 entries; Tulala = 🟢 Live, the 3 `roster_only` agencies = 🔴 "Agency isn't showing you"; chips match the §1.1 truth-table; opening from My pages, Money, and Settings shows the identical drawer.
- **Phase 2 — Visibility + primary actions.** `selfSetRosterVisibility`, `selfSetGlobalHidden`, `selfSetPrimaryAgency`, preview links. Disabled-with-helper states for agency-override and global-hidden. **AC:** toggling hide on Tulala → `/t/<code>` for that surface stops listing him (gate recomputes); global hide disables all per-roster toggles; set-primary moves the star.
- **Phase 3 — Honest leave.** Pause/Resume/Remove per §7; delete the 14-day lie. **AC:** Pause → `status=inactive` immediately + chip 🟡; Resume → active; Leave → `status=removed` + row drops from the list.
- **Phase 4 — Agency-mode mirror + notifications.** Same drawer in the workspace admin with `agency_visibility` controls + read-only talent-hid 🔴 mirror; optional notification when one side overrides the other. **AC:** as Impronta admin viewing a talent who set `talent_site_hidden=true`, see 🔴 "Talent hid their profile on your roster."

---

## 9. File-by-file change map

| File | Change |
|---|---|
| `web/src/lib/talent/representation.ts` | **new** — `resolveEffectiveVisibility` + types |
| `web/src/lib/talent/representation.test.ts` | **new** — branch coverage |
| `web/src/lib/server-actions/talent-self-profile-sections.ts` | add `selfSetRosterVisibility`, `selfResumeAgency`, `selfRemoveAgency`; replace `selfLeaveAgency` with `selfPauseAgency` (keep export alias during transition) |
| talent data-bridge feeding `useAdminShell().bridgeTalentAgencies` | return the unified `RepresentationEntry[]` + `globalHidden` |
| `web/src/components/admin/shell/internal/talent-drawers/representation.tsx` | **new** — the drawer; register in `talent-drawers.tsx` as `"representation"` |
| `web/src/components/admin/shell/internal/talent-drawers/agency.tsx` | deprecate `TalentAgencyRelationshipDrawer` once parity (keep until then) |
| `web/src/app/(workspace)/[tenantSlug]/talent/settings/ProfileVisibilityDrawer.tsx` | fold its logic into the new drawer; deprecate |
| `web/src/components/talent/money/MoneyAgencyCards.tsx` | repoint `openDrawer` to `"representation"`; **remove the `MY_AGENCIES` fixture fallback** |
| `web/src/components/admin/shell/internal/talent/pages/SettingsPage.tsx` | "Where you appear" rows → open `"representation"` |
| `web/src/lib/talent/agency-roster-profile-url.ts` | extend for hub/self/custom/subdomain per §5.4 |
| `supabase/migrations/<ts>_auto_enroll_talent_into_platform_hub.sql` | **new** — §4 trigger (then `npm run db:push`) |
| agency admin roster surface | add the agency-mode mirror (Phase 4) |

---

## 10. Landmines (read or repeat the same mistakes)

1. **Apex routing is sacred.** `tulala.digital` MUST stay `agency_domains.kind='marketing'`. `getPublicHostContext` switches on that kind; repointing the apex to the hub tenant breaks the marketing homepage, the directory, AND every premium `/t/` page. The hub's public face IS the marketing apex — resolve a tenant on it via `getPlatformHubTenant()`, never by changing the host. (See `web/docs`/memory `project_tulala_enterprise_hub.md`.)
2. **`/directory` and `/t/` routing.** `tulala.digital/directory` → `(marketing)/global-directory` (not `(public)/directory`); `/t/<code>` → `/t/[profileCode]`. Always confirm with the `x-matched-path` response header before editing a route — a whole debugging session was lost to editing the wrong directory file.
3. **Directory is matview + cache gated.** Visibility/roster changes need `is_discoverable=true` AND a `refresh_talent_discover_index()` (or wait for the 15-min cron) AND survive a 120s `unstable_cache`. Don't claim "it didn't work" off a curl within 2 minutes.
4. **Service-role for cross-tenant reads.** Anon RLS cannot read another tenant's `agencies` row (verified: anon `agencies?slug=eq.tulala` → `[]`). Use `createServiceRoleClient()` (present in prod) for hub/agency resolution, exactly like `getPlatformHubTenant()`. `SUPABASE_SERVICE_ROLE_KEY` is set in prod (Production/Preview/Development).
5. **Don't copy the demo fallback.** Several settings drawers contain `if (!tenantSlug) { toast("… (demo)"); return; }` — a silent fake-save. Never add this. If context is missing, error visibly.
6. **Worktrees lack `node_modules`** (`.claude/worktrees/*` and sibling worktrees). `tsc`/`lint` won't run there. Either `npm install` in the worktree (slow) or rely on the **Vercel PR build** as the typecheck gate (Next build runs `tsc`; a green Vercel check == types pass). Standalone `tsc` on a single file fails on `react/jsx-runtime` resolution — that's a false positive, ignore it.
7. **Deploy is manual.** Merging to `main` does NOT reliably go live. Run `cd web && npm run deploy:promote && npm run deploy:smoke`; the promote re-aliases `tulala.digital` + `app.tulala.digital` (the apex aliases don't reassign automatically). The promote script has timed out mid-poll before — if so, the deploy still built; finish with `npx vercel alias set <deploy-url> tulala.digital` and `app.tulala.digital --scope oran-tenes-projects`.
8. **Migrations are not auto-applied.** A new migration must be `npm run db:push`-ed before the code that depends on it ships, or prod 500s. `deploy:smoke` reports drift.
9. **One primary per talent** (partial unique index `agency_talent_roster_talent_primary_uniq`). When setting primary, clear others first (see `selfSetPrimaryAgency`).
10. **Never `git switch` in the shared checkout** (`/Users/oranpersonal/Desktop/impronta-app`) — ~8 agents share it. `git worktree add … origin/main` for each phase.

---

## 11. Verification / QA

**DB census (run before & after Phase 0):**
```sql
-- talents NOT publicly visible anywhere (should trend to ~0 for approved talents after auto-enroll)
SELECT count(*) FROM talent_profiles tp
WHERE tp.deleted_at IS NULL AND tp.workflow_status IN ('approved','published')
  AND NOT talent_has_public_roster(tp.id);
-- new-talent smoke: after creating an approved talent, confirm a hub row exists
SELECT * FROM agency_talent_roster r
JOIN talent_profiles tp ON tp.id=r.talent_profile_id
WHERE tp.profile_code='<NEW_CODE>' AND r.tenant_id='40081ec3-5ca8-43a0-b50b-31c927b2716b';
```
**Effective-visibility check (the drawer's truth):** for TAL-92026 expect Tulala→live, Impronta/Hotels/QA27→agency_hidden (roster_only). Confirm the chip matches.
**Live UI:** drive the connected Chrome to `/talent/money`, `/talent/...my-pages`, `/talent/settings`; open the drawer from each → identical list; toggle hide on a `live` agency → re-open `/t/<code>` (cache-bust `?cb=`) and confirm it delisted; refresh matview and confirm directory updates.
**Browser routing sanity:** `curl -sD - -o /dev/null https://tulala.digital/directory | grep x-matched-path` (expect `/global-directory`).

---

## 12. Open decisions (get a human answer before building that part)
1. **Auto-enroll gate:** on `workflow_status='approved'` only, or on insert regardless? (Spec assumes approved/published. Decide if draft talents should pre-populate the hub hidden.)
2. **Leave grace period:** truly immediate `removed`, or build the real `scheduled_removal_at` + cron? (Spec defaults to immediate + no fake timer.)
3. **Drawer shape:** accordion-per-tenant (spec recommendation) vs. master-detail (list → detail panel). Confirm before Phase 1.
4. **Override notifications (Phase 4):** in-app only, or also email via the notification engine? Out of scope until decided.
