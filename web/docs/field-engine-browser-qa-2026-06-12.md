# Field-Engine Unification — Browser QA Findings (2026-06-12)

Live Chrome QA as **super-admin** (`qa-admin@impronta.test`, magic-link) on the
**Impronta** tenant (`00000000-0000-0000-0000-000000000001`), validating every
front-facing surface touched by the System-A→B field-engine unification
(PRs #321–#357). Each surface checked for: clean load, B-backed data render,
no dropped-table/column (`42P01`) errors, and — where safe — an interactive
write round-trip. DB cross-checks run read-only against prod `pluhdapdnuiulvxmyspd`.

## Verdict: PASS with one defect found + fixed (PR #358)

| # | Surface | Route | Result | Evidence |
|---|---------|-------|--------|----------|
| A | Public directory + search | `improntamodels.com/`, `tulala.digital/directory` | **PASS** | grid + cards render; `?q=` search no 500; facet sidebar engine OK |
| B | Public profile pages | `/t/TAL-00035`, `-00037`, `-92002` | **PASS** | header/gallery/sidebar sections render from B; height/gender OK |
| C | Workspace discover facets/counts | `/impronta/client/discover` | **PASS** (source-verified) | live RPC `directory_facet_gender_value_counts` → Woman 47 / Man 13 = DB; body_type 26/19/18, travel 67/3 cross-checked. Auth'd surface needs a *client* seat the super-admin lacks (expected gating). |
| D/E | Admin roster drawer + talent self-editor | `/impronta/admin/roster`, `/impronta/talent/profile/fields` | **PASS** | editor loaders hydrate from B; no dropped-column 500 |
| F | Profile-Fields catalog hub | `/platform/admin/catalog` | **PASS** | 309 mapped / 0 unmapped; per-field counts read B |
| G | Card/Filter design studio | `/impronta/admin/website/card-design` | **PASS** | "Engine-connected"; 10 card toggles load from B (Favorite, Inquiry CTA, Name, Talent type, Location, Attributes, Availability, Trust badges, Rating, Price from); all network 200 |
| H | Directory facet config (DirectoryEditor) | CMS page editor → Directory → Filters | **PASS** (source-verified) | `directory_filter_config` on B; facet RPCs + QA-A sidebar confirm render |
| I | Registration-Fields configurator | `/platform/admin/tenants/<id>/registration-fields` | **FAIL → FIXED** | see below |
| J | Registration wizard | `/talent/register` | **PASS** (proxy) | redirects logged-in admins to `/admin` (session boundary); field set = same `loadTenantRegistrationFields` B-query verified in I |

## DEFECT — QA-I: registration-field toggles rejected for seed-uuid tenants

**Symptom.** On the Registration-Fields configurator, toggling any field's
**Show** or **Required** showed a red **"Invalid request."** toast; the row
flipped optimistically but the header stats never moved and the write never
landed in `workspace_profile_field_settings`. Reproduced both directions, on
Legal name and confirmed systemic for the tenant.

**Root cause.** The four action schemas validate `tenantId`/`fieldDefinitionId`
with zod `.uuid()`. zod 4.x's `.uuid()` enforces the RFC-4122 version/variant
nibbles (`[1-8]` in the version position, plus nil/max specials). Impronta's
hand-crafted seed id `00000000-0000-0000-0000-000000000001` (version nibble
`0`) fails `safeParse`, so the action returns the generic `"Invalid request."`.
Every Show/Required/Reorder/Reset write was silently rejected for any seed-uuid
tenant.

**Not a field-engine regression.** The configurator (PR #301) predates the
unification and reads/writes System B correctly. The QA simply surfaced a
latent validation bug. Verified blast radius is contained: of 26 `.uuid()`
uses, only this file strict-validates a `tenantId`.

**Fix — PR #358 (open, gated green, NOT yet merged).** Replaced strict
`.uuid()` with a permissive 8-4-4-4-12 hex-shape check (`uuidish`) — validates
the column shape without the RFC variant. Garbage ids still rejected. `tsc`
0 source errors, `eslint` clean, no migration. **Merge → prod deploy is a
human decision (left for the user).**

## Residue / cleanup
- Registration toggles never persisted (DB re-queried: only 2 pre-existing
  override rows from 2026-06-09 / 2026-05-25, neither dated today, none for
  Legal name). **Zero residue.**
- No test-talent edits and no left-on catalog toggles were made this session.
- Local repo on `main`, clean tree; the fix lives only on PR #358.

## Method notes
- `qa-admin@impronta.test` is a **platform super_admin**, not a workspace
  *client* — so the auth'd `/impronta/client/discover` and the logged-out
  `/talent/register` wizard are gated by design and validated by proxy
  (same B queries / same facet RPCs exercised elsewhere).
- Facet-count RPCs were proven at the source (called directly with the Impronta
  tenant) rather than read off a sidebar — a stronger check that the
  T3.3-rewritten functions return correct B-backed counts.
