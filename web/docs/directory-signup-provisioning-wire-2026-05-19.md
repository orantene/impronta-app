# Directory System-Page — Signup Provisioning Wire Spec (2026-05-19)

**Status:** Research + ready-to-apply patch spec. NO code modified by this doc. Subordinate to `web/docs/directory-section-execution-plan-2026-05-19.md` (Phase 3 + Amendment A3) and the binding Discover spec.

## Executive summary

Today only Impronta has a seeded `__directory__` system page, backfilled imperatively via `ensureDirectoryPage({admin,tenantId,actorProfileId})` (called by `directory-page-backfill-action.ts` for the current tenant, and by `scripts/backfill-directory-page.mjs` for one-off CLI runs). New tenants get **no** directory page because nothing calls `ensureDirectoryPage` on the provisioning path. The fix is a single ~10-line insertion into `seedFreeStarterHomepage()` in `web/src/lib/site-admin/server/onboard-starter-content.ts` (the one function both signup entry points already converge on, where a service-role `client`, `tenantId`, and `actorProfileId` are all in scope and the section registry is guaranteed resolvable because this runs server-side, not as a standalone script). `ensureDirectoryPage` is idempotent, so adding it here is safe for the re-entrant provisioning calls. Per Amendment A3, **Free gets no directory page**; the seed must be wrapped in a plan-tier predicate so only Studio/Agency (i.e. `plan_tier !== "free"`) receive it — and there is an exact precedent for this predicate already in the same file path (`resolveFreeStarterRosterSeedCount`: `if (input.planTier !== "free") return 0`). The two provisioning files are **clean** on `phase-1` (last touched 2026-05-07; the in-flight LinkRef agent is editing `registry.ts` / `registry-editors.ts` / `default-content.ts` / `directory/page.tsx` — zero overlap with this patch's single target file).

---

## 1. Where new tenants are provisioned

Two server entry points create a new `agencies` row, and **both** funnel starter content through the exact same function:

| Entry point | File | What it is | Calls |
|---|---|---|---|
| Self-serve workspace signup (marketing lead → workspace) | `web/src/lib/saas/workspace-signup.server.ts` | `provisionWorkspaceFromLead()` → `ensureWorkspaceScaffold()` | `onboardStarterContent(admin, { tenantId, actorProfileId, seedFreeStarter: true })` at **line 153** |
| Talent-creates-own-workspace shortcut | `web/src/lib/server-actions/talent-workspace-provision.ts` | `provisionFreeWorkspaceFromTalent()` | `onboardStarterContent(admin, { tenantId: agency.id, actorProfileId: userId, seedFreeStarter: true })` at **line 218** |

Both pass `seedFreeStarter: true`. Inside `onboardStarterContent` (`web/src/lib/site-admin/server/onboard-starter-content.ts:427`), `seedFreeStarter: true` routes into `seedFreeStarterHomepage(...)` (line 453, defined at **line 291**).

### Why `seedFreeStarterHomepage` is the correct insertion site (not the call sites)

Putting the call in `seedFreeStarterHomepage` (one place) instead of the two `onboardStarterContent` call sites is **strictly better**:

- **DRY / single funnel.** Both signup paths already converge here. One insertion covers all current and future provisioning callers (the header doc explicitly invites more callers).
- **All required args are already in scope** with the correct provenance:
  - `params.client` — the service-role `SupabaseClient` (`createServiceRoleClient()`), threaded from both call sites. `ensureDirectoryPage` expects an `admin` of type `ReturnType<typeof createServiceRoleClient>`; `params.client` is typed `SupabaseClient` — see "Type note" in §5.
  - `params.tenantId` — the new agency id.
  - `params.actorProfileId` — the owner profile id (the same id `upsertSection`/`publishSection` already use here for capability-gated writes; exactly what `ensureDirectoryPage` needs for `created_by`/`updated_by`).
- **Registry resolves here.** `seedFreeStarterHomepage` already calls `getSectionType(...)` + `getLibraryDefault(...)` for every starter section (lines 327–330). `ensureDirectoryPage` internally does `getSectionType("directory")` + `getLibraryDefault("directory")` — the identical imports already proven to resolve in this exact module/runtime. (This is the distinction from `scripts/backfill-directory-page.mjs`, which is a standalone Node script; the provisioning path is server-side Next where the registry import graph is fully wired.)
- **Plan-tier signal already fetched here.** `seedFreeStarterHomepage` → `seedFreeStarterRosterProfiles` already reads `agencies.plan_tier` (line 184–187). The directory gate needs the same column; the cleanest patch fetches it once at the top of `seedFreeStarterHomepage` (see §3) so the directory branch doesn't add a second round-trip pattern inconsistent with the file.

> Placement within the function: the seed must run **after** the homepage publish (after line 416 `return { ok: true, seeded: true, rosterSeededCount }`) is wrong — that's the early-return. Insert it **just before** the final `return { ok: true, seeded: true, rosterSeededCount }` at line 418, i.e. after the homepage is published and roster seeded, so a directory-seed failure does not abort the (more important) homepage seed. `ensureDirectoryPage` returns a result object rather than throwing, so we log-and-continue on `!ok`, matching the non-fatal pattern used by every other best-effort step in these provisioning files (`logServerError(..., (non-fatal))`).

---

## 2. Concurrent-edit status (shared `phase-1`, multi-agent)

`git status --porcelain` at research time:

```
 M .claude/launch.json
 M web/src/app/(public)/directory/page.tsx
 M web/src/app/token-presets.css
 M web/src/lib/server-actions/admin-taxonomy.ts
 M web/src/lib/site-admin/sections/registry-editors.ts
 M web/src/lib/site-admin/sections/registry.ts
 M web/src/lib/site-admin/sections/shared/default-content.ts
 M web/src/lib/site-admin/sections/site_footer/schema.ts
?? web/src/lib/site-admin/server/onboard-directory-page.ts   (this feature's new file, untracked)
?? web/src/lib/site-admin/sections/directory/                 (this feature's new dir, untracked)
?? web/scripts/backfill-directory-page.mjs                     (this feature's new script, untracked)
```

**Target file `web/src/lib/site-admin/server/onboard-starter-content.ts`: CLEAN.** Not in `git status`. Last commit `8bf312c61` (orantene, 2026-05-07). Not touched by any in-flight agent.

**Secondary-context file `web/src/lib/saas/workspace-signup.server.ts`: CLEAN.** Same last commit/date. (No edit needed there — see §5 — but recorded for completeness since it's on the funnel.)

**`web/src/lib/server-actions/talent-workspace-provision.ts`: CLEAN.** No edit needed (also converges on the patched function).

The in-flight LinkRef/`talent_type_grid` agent is mutating `registry.ts`, `registry-editors.ts`, `default-content.ts`, `directory/page.tsx`, `site_footer/schema.ts`, `token-presets.css`, `admin-taxonomy.ts`. **This patch touches none of those** — it is a single-file edit to a file no other agent has open. No rebase collision expected. Standard discipline still applies: `git pull --rebase origin phase-1` immediately before applying, and `cd web && npx tsc --noEmit && npm run lint` before commit (ignoring the ~25 unrelated baseline tsc errors from the other agent).

---

## 3. The A3 plan-tier gating predicate

**Binding rule (execution plan Amendment A3):** Free = NO dedicated directory page (just the inline ~5 on the landing one-pager, already done). Studio/Agency = get the directory page.

**Enforcement nuance (A3, must respect):** A3 says the *capability-map enforcement* (`plan-capabilities.ts` differentiated denial, `listAgencyVisibleSections` filtering, `PLAN_LIMITS` instance counts) is **Track C** and must NOT be unilaterally flipped here. But A3 also explicitly scopes *this* concern as separate: gating the **seed call itself** at provisioning time is a local, reversible branch, not a platform-wide capability-denial switch. The directive is "this plan records the gate; Track C activates the capability resolver." Seeding only paid tenants is consistent with that — it does not deny anything to anyone in the picker; it just doesn't pre-create a page Free isn't entitled to.

**Existing precedent for the exact predicate** — the **same file** already gates a sibling Free-vs-paid seed decision this way:

`web/src/lib/site-admin/server/onboard-starter-content-policy.ts:11`
```ts
export function resolveFreeStarterRosterSeedCount(input: {
  planTier: string | null;
  ...
}): number {
  if (input.planTier !== "free") return 0;   // ← canonical Free-vs-paid predicate in this path
  ...
}
```

And `seedFreeStarterRosterProfiles` (`onboard-starter-content.ts:182–207`) already fetches the column it keys on:

```ts
params.client.from("agencies")
  .select("plan_tier, talent_seat_limit")
  .eq("id", params.tenantId)
  .maybeSingle<{ plan_tier: string | null; talent_seat_limit: number | null }>(),
```

So the codebase-consistent predicate for "should this tenant get a directory page" is the **inverse**: seed when `plan_tier !== "free"` (i.e. `studio` / `agency` / `network`). Note: at provisioning time **all three current entry points hard-code `plan_tier: "free"`** on the `agencies` insert (`workspace-signup.server.ts:447`, `talent-workspace-provision.ts:142`). Practically this means: with the gate in place, **no tenant gets a directory page seeded at signup today** (they're all Free at creation). That is *correct and intended* per A3 — Free deliberately gets none, and a tenant upgrading to Studio/Agency later gets the page via the already-existing `ensureDirectoryPage` backfill action (`backfillDirectoryPageForCurrentTenant`, wired to a future upgrade hook / admin button — out of scope here, but the idempotent backfill already exists for exactly this). The gate is therefore future-proof: the moment a provisioning path (or an upgrade flow) sets a non-free `plan_tier` before calling `onboardStarterContent`, the directory page seeds automatically with zero further code change.

> Decision recorded: **gate it now** (do not seed unconditionally). Rationale: (a) A3 is an explicit product-owner directive that Free gets no directory page; seeding it unconditionally would put a `__directory__` page on every Free tenant, contradicting A3 and pre-creating an entitlement Track C would then have to retroactively strip. (b) The sibling roster seed in the identical path is already plan-gated with this exact predicate — gating is the *consistent* pattern here, not the exception. (c) The gate is inert-safe: it changes nothing observable today (all signups are Free → none seeded today, same as current behavior) while being correct the instant tiers diverge.

---

## 4. Idempotency / ordering / safety confirmation

- **Idempotent:** `ensureDirectoryPage` (`onboard-directory-page.ts:59–75`) does an existence check on `cms_pages WHERE tenant_id=? AND locale=? AND system_template_key='directory'` and returns `action:"already_existed"` as a no-op if present. Safe to call on the re-entrant provisioning paths (`provisionWorkspaceFromLead` calls `ensureWorkspaceScaffold` again on the `lead.provisioned_tenant_id` and `existingFree` re-entry branches — all converge on the patched function; a second call is a clean no-op).
- **Registry resolves:** confirmed in §1 — same `getSectionType`/`getLibraryDefault` imports already used successfully two lines above the insertion point. The provisioning path is server-side Next, not the standalone `.mjs` script, so the registry import graph is fully wired (this is the documented reason the script needs its own bypass harness; the in-process path does not).
- **Publish model:** `ensureDirectoryPage` hand-rolls its own publish + draft-flip + `revalidateTag` (lines 159–218), independent of the homepage publish. No ordering coupling with `publishHomepage`. The `revalidateTag` calls are wrapped in try/catch for non-request contexts.
- **Failure isolation:** `ensureDirectoryPage` returns `{ok:false,error}` rather than throwing. Wrapping the call in a `!ok` → `logServerError(..., (non-fatal))` guard means a directory-seed failure never aborts the homepage/roster seed (which is the higher-priority "tenant has a live URL" guarantee). Mirrors every other best-effort step in both provisioning files.

---

## 5. The precise patch

**Single file to edit:** `web/src/lib/site-admin/server/onboard-starter-content.ts`. **No other file changes.** (`workspace-signup.server.ts` and `talent-workspace-provision.ts` need NO change — they already pass `seedFreeStarter:true` and converge on the patched function.)

### 5a. Add the import (top of file, with the other `./` server imports — after the line `} from "./homepage";`, around line 42)

```ts
import { ensureDirectoryPage } from "./onboard-directory-page";
```

### 5b. Fetch `plan_tier` once in `seedFreeStarterHomepage` (so the gate doesn't add an inconsistent extra round-trip)

`seedFreeStarterHomepage` currently delegates the `agencies` read to `seedFreeStarterRosterProfiles`. Add a local read of `plan_tier` near the top of `seedFreeStarterHomepage` (after the `hasExistingComposition` early-return, before/near the `seedFreeStarterRosterProfiles` call at line 317), so it's in scope for the directory gate at the end:

Locate (lines ~309–321):

```ts
  const hasExistingComposition =
    state.draftSlots.length > 0 ||
    state.liveSlots.length > 0 ||
    state.page.status === "published";
  if (hasExistingComposition) {
    return { ok: true, seeded: false, rosterSeededCount: 0 };
  }

  const rosterSeededCount = await seedFreeStarterRosterProfiles({
    client: params.client,
    tenantId: params.tenantId,
    actorProfileId: params.actorProfileId,
  });
```

Insert the `plan_tier` read **between** the early-return and the `rosterSeededCount` call:

```ts
  const hasExistingComposition =
    state.draftSlots.length > 0 ||
    state.liveSlots.length > 0 ||
    state.page.status === "published";
  if (hasExistingComposition) {
    return { ok: true, seeded: false, rosterSeededCount: 0 };
  }

  // Plan tier drives the directory-page gate (Amendment A3: Free gets no
  // dedicated directory page; Studio/Agency do). Mirrors the Free-vs-paid
  // predicate used by resolveFreeStarterRosterSeedCount.
  const { data: planRow } = await params.client
    .from("agencies")
    .select("plan_tier")
    .eq("id", params.tenantId)
    .maybeSingle<{ plan_tier: string | null }>();
  const planTier = planRow?.plan_tier ?? null;

  const rosterSeededCount = await seedFreeStarterRosterProfiles({
    client: params.client,
    tenantId: params.tenantId,
    actorProfileId: params.actorProfileId,
  });
```

### 5c. Seed the directory page (gated) just before `seedFreeStarterHomepage`'s success return

Locate the end of `seedFreeStarterHomepage` (lines ~411–419):

```ts
  if (!publishedHomepage.ok) {
    return {
      ok: false,
      error: publishedHomepage.code ?? "PUBLISH_STARTER_FAILED",
    };
  }

  return { ok: true, seeded: true, rosterSeededCount };
}
```

Insert the gated directory seed **immediately before** `return { ok: true, seeded: true, rosterSeededCount };`:

```ts
  if (!publishedHomepage.ok) {
    return {
      ok: false,
      error: publishedHomepage.code ?? "PUBLISH_STARTER_FAILED",
    };
  }

  // ── Directory system page (Amendment A3 gate) ────────────────────────
  // Free tier deliberately gets NO dedicated directory page (the ~5 inline
  // on the landing one-pager covers Free). Studio/Agency/Network get the
  // canonical `__directory__` system page. Predicate mirrors
  // resolveFreeStarterRosterSeedCount's `planTier !== "free"`. Idempotent
  // + non-fatal: a failure here must never abort the homepage seed (the
  // tenant's live URL is the higher-priority guarantee). Today every
  // provisioning entry point hard-codes plan_tier:"free", so this is a
  // no-op for current signups (correct per A3); it auto-activates the
  // instant a non-free tenant is provisioned or upgraded.
  if (planTier !== "free") {
    const directoryResult = await ensureDirectoryPage({
      admin: params.client,
      tenantId: params.tenantId,
      actorProfileId: params.actorProfileId,
    });
    if (!directoryResult.ok) {
      logServerError(
        "onboardStarterContent.ensureDirectoryPage (non-fatal)",
        new Error(directoryResult.error),
      );
    }
  }

  return { ok: true, seeded: true, rosterSeededCount };
}
```

`logServerError` is already imported in this file (`onboard-starter-content.ts:32`). No new import beyond §5a.

### Type note (must verify under tsc)

`ensureDirectoryPage`'s `admin` param is typed:

```ts
type Admin = ReturnType<typeof createServiceRoleClient> & {};
```

`createServiceRoleClient()` returns `SupabaseClient | null` (it can be null when env is missing). `params.client` in `onboard-starter-content.ts` is typed `SupabaseClient` (non-null — guaranteed by the callers, which all early-return on `!admin`). So `params.client` is the **non-null** member of `ReturnType<typeof createServiceRoleClient>`, which structurally satisfies `Admin = ReturnType<...> & {}`. This should typecheck directly (passing a non-null `SupabaseClient` where `SupabaseClient | null` is accepted is assignable). **If tsc rejects it** (e.g. because the `& {}` intersection or a branded client type narrows differently), the minimal fix is to widen the local: the call already runs only inside the `seedFreeStarter` branch where the caller proved the client is non-null, so a direct pass is sound — if needed, cast at the call site `admin: params.client as Parameters<typeof ensureDirectoryPage>[0]["admin"]` rather than changing any signature. Prefer the un-cast version; only fall back to the cast if `npx tsc --noEmit` flags this exact line.

---

## 6. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `params.client` type mismatch vs `ensureDirectoryPage`'s `Admin` (`ReturnType<...> & {}`) | Low | Structurally assignable; if tsc flags, narrow-cast at call site only (§5 Type note). Do not alter `ensureDirectoryPage`'s signature (shared with backfill action + script). |
| Extra `agencies` read added (the `plan_tier` select in §5b) | Negligible | One indexed PK lookup, only on the cold provisioning path (once per new tenant), behind the existing `hasExistingComposition` early-return. Consistent with the sibling roster-seed read pattern. |
| A3 over-reach (accidentally activating Track C capability gating) | None | This patch does NOT touch `plan-capabilities.ts`, `listAgencyVisibleSections`, `PLAN_LIMITS`, or the section picker. It only conditionally pre-creates a page row. The picker stays plan-neutral (A3-compliant). |
| Seed runs but contradicts §10 Discover compliance (trust-tier badge deferred per A2) | None (orthogonal) | Seeding the page does not change card data sourcing; A2's deferred trust-tier is a card-render concern, unaffected by whether the page exists. |
| Concurrent-edit collision on `phase-1` | None | Target file clean, not in any agent's working set (§2). Standard `git pull --rebase` + tsc/lint gate before commit still required. |
| Existing tenants (already Free, no directory page) | Out of scope / handled elsewhere | This patch is signup-forward only. Backfill for an existing tenant that upgrades is the already-shipped `backfillDirectoryPageForCurrentTenant` action (idempotent) — wiring it to an upgrade flow is a separate task, not this one. |
| Re-entrant provisioning calls (lead re-claim / existing-free reuse branches) | None | `ensureDirectoryPage` is idempotent (existence check → no-op). Second call returns `already_existed`. |
| ~25 baseline tsc errors from the LinkRef agent | None (noise) | Per task instruction, ignore; they're unrelated and pre-existing on `phase-1`. Verify only that *this file* introduces no new error. |

---

## 7. Apply checklist (for the implementing agent)

1. `git pull --rebase origin phase-1`.
2. Confirm `web/src/lib/site-admin/server/onboard-starter-content.ts` still clean (`git status --porcelain` — not listed).
3. Apply §5a (import), §5b (`plan_tier` read), §5c (gated `ensureDirectoryPage` call). Single file.
4. `cd web && npx tsc --noEmit` — confirm no NEW error on `onboard-starter-content.ts` (ignore the ~25 unrelated baseline errors). Resolve the §5 Type-note line with the minimal cast only if flagged.
5. `npm run lint`.
6. (Optional QA) Provision a workspace with `plan_tier` manually set to `studio` (or temporarily flip the predicate in a scratch test) → confirm a `cms_pages` row with `system_template_key='directory'`, `slug='__directory__'`, `status='published'` appears for the new tenant; provision a Free one → confirm none. Re-run provisioning for the same tenant → confirm no duplicate (idempotent no-op).
7. Scoped commit only; no force-push; no migration involved (none needed — `ensureDirectoryPage` writes only to existing `cms_pages` / `cms_page_sections` / section tables).

---

*Author: directory signup-provisioning research lane, 2026-05-19. Research + patch spec only — no code modified by this document. Subordinate to `directory-section-execution-plan-2026-05-19.md` (Phase 3 + A3) and the Discover binding spec.*
