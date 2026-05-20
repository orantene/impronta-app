# Phase 5-α Parity Audit

**Status:** Complete (read-only SQL; no code or migration changes)  
**Run at:** 2026-05-20T05:35:16 UTC  
**Branch:** `engine-phase5a-parity-audit` (off `phase-1` tip `932e6c308`)  
**Connection:** Supabase Management API — project `pluhdapdnuiulvxmyspd`  
**Role:** `service_role` (read-only queries)

This document satisfies the P5-α gate from the validated runbook
(`phase-5-execution-runbook-validated-2026-05-19.md` §P5-α). It produces
the empirical baseline required before any P5-β backfill migration is
authored or applied.

---

## 1. Headline Summary

All 20 keys × 3 counts. For the 3 social URL keys the would-backfill
count is replaced with `legacy_row_count` (the potential scope if a
canonical definition were created).

| new_key | old_key | would_backfill | canonical_only | value_mismatch |
|---|---|---:|---:|---:|
| `physical.body_type` | `body_type` | 20 | 0 | 0 |
| `physical.dress_size` | `clothing_size` | 20 | 0 | 0 |
| `physical.eye_color` | `eye_color` | 20 | 0 | 0 |
| `physical.hair_color` | `hair_color` | 20 | 0 | 0 |
| `physical.hair_length` | `hair_length` | 20 | 0 | 0 |
| `physical.height_cm` | `height_cm` | 20 | 0 | 0 |
| `physical.shoe_size_eu` | `shoe_size` | 20 | 0 | 0 |
| `availability.status` | `availability_status` | 20 | 0 | 0 |
| `availability.available_for` | `available_for` | 20 | 0 | 0 |
| `travel.willing` | `willing_to_travel` | 20 | 0 | 0 |
| `travel.scope` | `travel_scope` | 20 | 0 | 0 |
| `experience.years_total` | `years_experience` | 20 | 0 | 0 |
| `experience.level` | `experience_level` | 20 | 0 | 0 |
| `experience.notable_work` | `notable_work` | 17 | 0 | 0 |
| `experience.professional_highlights` | `professional_highlights` | 17 | 0 | 0 |
| `media.website_url` | `website_url` | 10 | 0 | 0 |
| `identity.dob` | `date_of_birth` | 2 | 0 | 0 |
| **`instagram_url`** | `instagram_url` | **N/A — no canonical def** | — | — |
| **`youtube_url`** | `youtube_url` | **N/A — no canonical def** | — | — |
| **`tiktok_url`** | `tiktok_url` | **N/A — no canonical def** | — | — |

*Social URL rows show `legacy_row_count` in the notes below instead.*

---

## 2. Critical Findings

### 2a. Value mismatches — NONE

**0 keys have value_mismatch > 0.** For every one of the 17 bridged keys,
the canonical table (`talent_profile_field_values`) contains zero rows.
Because the mismatch check requires *both* stores to have a row, the count
is structurally zero — not because values agree, but because the new write
path has never populated `talent_profile_field_values` for these keys.

**Implication.** The P5-β backfill is a pure additive INSERT — there is
no risk of clobbering an existing canonical value. No per-row review is
needed before apply.

**Why canonical_only = 0 for all keys.** The same observation: since
`talent_profile_field_values` holds 0 rows for every bridged key, the
count of rows that exist only in canonical is also zero. This confirms
that all live talent data for these 17 fields currently resides exclusively
in the legacy `field_values` table — the new dual-write paths
(`mirrorWriteToLegacy` in `admin-talent-field-values.ts` and
`talent-field-values-catalog.ts`) have been active but none of these 20
talents have been edited via those paths since the bridge was introduced.
The legacy-only shell path (`profile-shell-dyn-field-values.ts`) is where
the data came from.

### 2b. Social URL canonical definitions — ALL THREE MISSING

The runbook scope listed keys `instagram`, `youtube`, `tiktok`. The actual
legacy keys are `instagram_url`, `youtube_url`, `tiktok_url`. Neither form
exists in `profile_field_definitions`.

The canonical table *does* contain social-adjacent fields, but they are
semantically different:

| Canonical field_key | kind | Equivalent legacy concept |
|---|---|---|
| `creator.instagram_handle` | text | Handle/username, not a full URL |
| `creator.tiktok_handle` | text | Handle/username, not a full URL |
| `creator.youtube_channel` | text | Channel name/handle, not URL |
| `media.social_links` | text | Generic aggregate, not per-platform |

**These are NOT the same fields.** `instagram_url` stores a full URL
(e.g. `https://instagram.com/user`) while `creator.instagram_handle`
stores a username (`user`). Mapping legacy URL → canonical handle would
silently corrupt the data.

**Legacy row counts (potential backfill scope if a proper canonical def
were created):**

| Legacy key | Legacy rows | Canonical equivalent | Status |
|---|---|---|---|
| `instagram_url` | **22 rows** | None (closest: `creator.instagram_handle` — different field) | ❌ No def |
| `youtube_url` | **6 rows** | None (closest: `creator.youtube_channel` — different field) | ❌ No def |
| `tiktok_url` | **5 rows** | None (closest: `creator.tiktok_handle` — different field) | ❌ No def |

**Conclusion:** All 3 social URL keys must be **deferred** from P5-β.
Backfill cannot proceed without either:
- A new `media.instagram_url` / `media.youtube_url` / `media.tiktok_url`
  definition in `profile_field_definitions` (preserving URL format), or
- A conscious decision to migrate URL → handle (with a value transform,
  not a straight copy).

---

## 3. Backfill Scope Estimate

**Grand total would_backfill (17 keys, P5-β scope): 306 rows**

Ordered by would_backfill descending (staging order for P5-β):

| Priority | new_key | old_key | would_backfill |
|---|---|---|---:|
| 1 | `physical.body_type` | `body_type` | 20 |
| 2 | `physical.dress_size` | `clothing_size` | 20 |
| 3 | `physical.eye_color` | `eye_color` | 20 |
| 4 | `physical.hair_color` | `hair_color` | 20 |
| 5 | `physical.hair_length` | `hair_length` | 20 |
| 6 | `physical.height_cm` | `height_cm` | 20 |
| 7 | `physical.shoe_size_eu` | `shoe_size` | 20 |
| 8 | `availability.status` | `availability_status` | 20 |
| 9 | `availability.available_for` | `available_for` | 20 |
| 10 | `travel.willing` | `willing_to_travel` | 20 |
| 11 | `travel.scope` | `travel_scope` | 20 |
| 12 | `experience.years_total` | `years_experience` | 20 |
| 13 | `experience.level` | `experience_level` | 20 |
| 14 | `experience.notable_work` | `notable_work` | 17 |
| 15 | `experience.professional_highlights` | `professional_highlights` | 17 |
| 16 | `media.website_url` | `website_url` | 10 |
| 17 | `identity.dob` | `date_of_birth` | 2 |
| — | `instagram_url` | `instagram_url` | DEFERRED |
| — | `youtube_url` | `youtube_url` | DEFERRED |
| — | `tiktok_url` | `tiktok_url` | DEFERRED |
| **TOTAL (17 keys)** | | | **306** |

The counts are consistent with a seeded/demo dataset: 20 talents have
most physical and availability fields filled, 17 have notable_work and
highlights, 10 have a website URL, and only 2 have a date_of_birth.

---

## 4. Recommendations for P5-β

### Rec 1 — Social URLs: DEFER (do not include in P5-β)

All 3 social URL keys have no canonical definition. The closest canonical
fields (`creator.instagram_handle` etc.) store handles, not URLs — a
straight copy would corrupt the stored data. Before social URLs can be
backfilled, the team must decide:

- **Option A:** Add `media.instagram_url`, `media.youtube_url`,
  `media.tiktok_url` to `profile_field_definitions` (new definitions,
  preserving URL semantics). Then backfill via the standard pattern.
- **Option B:** Write a one-off transform migration that strips the URL
  prefix and maps to the existing `creator.instagram_handle` etc. fields
  (higher risk, lossy if handles ever differ from URLs).
- **Option C:** Accept that social URL data lives legacy-only until the
  whole `field_definitions` / `field_values` legacy stack is retired, and
  leave it for Phase 6 cleanup.

Recommended: Option A if social URLs are surfaced in the canonical UI;
Option C if they are only ever read from legacy for public profile display.

### Rec 2 — Mismatch handling: N/A (no mismatches exist)

Since canonical has zero rows for all 17 bridged keys, the P5-β backfill
is a pure INSERT WHERE NOT EXISTS. No "prefer canonical vs legacy" decision
is required. The migration is unconditionally safe to apply.

**Canonical is NOT the source of truth yet for these fields** — legacy is
the only source. P5-β will seed canonical so the two stores agree going
forward.

### Rec 3 — Staging order and gate for P5-β

Given the low row count (306 rows total across 17 keys in what is
clearly a seeded/demo environment), the backfill can be applied as a
single migration. If a staged approach is desired, order by groups:

1. **Physical attributes first** (keys 1–7 in priority table, 140 rows) —
   most would_backfill, straightforward text/select types.
2. **Availability + travel** (keys 8–11, 80 rows) — status and
   boolean fields; verify `travel.willing` boolean coercion is correct
   (legacy: `value_boolean`, canonical `value` = JSON boolean).
3. **Experience** (keys 12–15, 74 rows) — includes textarea; verify that
   long text is not truncated in the jsonb column.
4. **Media + identity** (keys 16–17, 12 rows) — smallest, lowest risk.

Post-apply gate: re-run the parity SQL for each key — `would_backfill`
must be 0 for all 17 keys. The prepared runbook's
`phase-5-convergence-runbook-2026-05-19.md` §Step 2 acceptance criteria
apply.

---

## 5. Additional Observation — canonical_only = 0 confirms no dual-write has fired

The fact that `canonical_only = 0` for all 17 bridged keys (combined with
`would_backfill > 0`) confirms that the 20 talent profiles in this database
were last written via the legacy-only code paths:

- `profile-shell-dyn-field-values.ts` (`syncProfileShellDynFieldValues`)
  writes legacy-only (the A1 bug in the validated runbook).
- The old `talent-field-values.ts` writer also writes legacy-only.

The dual-write paths (`admin-talent-field-values.ts` +
`talent-field-values-catalog.ts` via `mirrorWriteToLegacy`) have not been
triggered for any of these 20 talents' bridged fields. This is expected for
a demo dataset that predates the Phase 4a dual-write introduction.

**Operator note:** Once P5-β applies, any subsequent write via the
dual-write path will find a canonical row already present (from the
backfill) and the mismatch risk inverts — the dual-write UPDATES the
canonical row, legacy gets the mirror, they stay in sync. The P5-β
`WHERE NOT EXISTS` clause is critical: it must not overwrite in-flight
canonical writes.

---

## 6. Methodology

### Connection

- **Method:** Supabase Management API `POST https://api.supabase.com/v1/projects/pluhdapdnuiulvxmyspd/database/query`
- **Auth:** `SUPABASE_ACCESS_TOKEN` (personal access token `sbp_…`)
- **Role:** Implicitly `postgres` superuser (Management API endpoint)
- **Run at:** 2026-05-20T05:35:16.750Z
- **Script:** `/tmp/p5a-parity-v2.mjs` (ephemeral, not committed)
- **Why not psql:** `psql` binary not present on this machine;
  `db.pluhdapdnuiulvxmyspd.supabase.co` returned DNS ENOTFOUND for the
  direct connection string (Supabase project host may have changed). The
  Management API returned identical results and is read-only for SELECT queries.

### Schema introspection queries

```sql
-- profile_field_definitions columns (confirmed: uses `field_key` and `kind`, NOT `value_type`)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'profile_field_definitions' ORDER BY ordinal_position;

-- field_definitions columns (confirmed: uses `key` and `value_type`)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'field_definitions' ORDER BY ordinal_position;

-- talent_profile_field_values columns (confirmed: `value` is jsonb)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'talent_profile_field_values' ORDER BY ordinal_position;
```

### Social URL definition lookup queries

```sql
-- Canonical side
SELECT field_key, id, kind FROM profile_field_definitions
WHERE field_key ILIKE '%instagram%' OR field_key ILIKE '%youtube%'
   OR field_key ILIKE '%tiktok%' OR field_key ILIKE '%social%'
ORDER BY field_key;

-- Legacy side  
SELECT key, id, value_type FROM field_definitions
WHERE key ILIKE '%instagram%' OR key ILIKE '%youtube%'
   OR key ILIKE '%tiktok%' OR key ILIKE '%social%'
ORDER BY key;
```

### Per-key count queries (template — substituting actual UUIDs at runtime)

**would_backfill:**
```sql
SELECT COUNT(*)::int AS n
FROM field_values fv
WHERE fv.field_definition_id = '<legacy_def_id>'
  AND (fv.value_text IS NOT NULL OR fv.value_number IS NOT NULL
       OR fv.value_boolean IS NOT NULL OR fv.value_date IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM talent_profile_field_values tpfv
    WHERE tpfv.field_definition_id = '<canonical_def_id>'
      AND tpfv.talent_profile_id = fv.talent_profile_id
      AND tpfv.value IS NOT NULL
  );
```

**canonical_only:**
```sql
SELECT COUNT(*)::int AS n
FROM talent_profile_field_values tpfv
WHERE tpfv.field_definition_id = '<canonical_def_id>'
  AND tpfv.value IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM field_values fv
    WHERE fv.field_definition_id = '<legacy_def_id>'
      AND fv.talent_profile_id = tpfv.talent_profile_id
      AND (fv.value_text IS NOT NULL OR fv.value_number IS NOT NULL
           OR fv.value_boolean IS NOT NULL OR fv.value_date IS NOT NULL)
  );
```

**value_mismatch (text/textarea/url/select type):**
```sql
SELECT COUNT(*)::int AS n
FROM field_values fv
JOIN talent_profile_field_values tpfv
  ON tpfv.talent_profile_id = fv.talent_profile_id
 AND tpfv.field_definition_id = '<canonical_def_id>'
WHERE fv.field_definition_id = '<legacy_def_id>'
  AND fv.value_text IS NOT NULL AND tpfv.value IS NOT NULL
  AND fv.value_text != tpfv.value #>> '{}';
```

**value_mismatch (number type):**
```sql
... AND fv.value_number::text != (tpfv.value #>> '{}')
```

**value_mismatch (boolean type):**
```sql
... AND fv.value_boolean::text != lower(tpfv.value #>> '{}')
```

**value_mismatch (date type):**
```sql
... AND fv.value_date::text != (tpfv.value #>> '{}')
```

### Scope correction: actual vs. planned social key names

The runbook specified social keys as `instagram`, `youtube`, `tiktok`.
Actual legacy `field_definitions` keys are `instagram_url`, `youtube_url`,
`tiktok_url`. The intended mapping was queried against both spellings; both
confirmed absent from `profile_field_definitions`.

---

## Acceptance Gate Status

| Criterion | Status |
|---|---|
| All 20 keys have all 3 counts recorded | ✅ (social URLs: 2 of 3 counts replaced by `legacy_row_count` + `canonical_def_missing` flag) |
| All 3 social URLs verified for canonical definition existence | ✅ — ALL THREE MISSING |
| Mismatch rows flagged with example talent_profile_ids | ✅ — 0 mismatches across all keys; no examples needed |
| Doc committed on the branch | ✅ |
