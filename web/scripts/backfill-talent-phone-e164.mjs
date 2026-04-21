/**
 * Org-network extension M0 (step 7, Option A) — phone_e164 backfill.
 *
 * Pairs with migration:
 *   supabase/migrations/20260625130000_saas_p56_m0_talent_phone_e164.sql
 *
 * Spec references:
 *   docs/saas/phase-5-6-org-network-extension.md §5.6, §6.2 step 7, §A.3.
 *
 * What this script does
 *   1. Reads every non-soft-deleted talent_profiles row whose phone_e164 is
 *      still NULL (idempotent — already-backfilled rows are skipped).
 *   2. Resolves the row's residence_country_id → countries.iso2.
 *   3. Normalizes `phone` to E.164 via libphonenumber-js, using:
 *        - the raw `+`-prefixed form directly (country inferred from the
 *          number itself), OR
 *        - `parsePhoneNumberFromString(phone, iso2)` when residence ISO2 is
 *          known.
 *      Otherwise the row is classified no_country_context and left NULL.
 *   4. Groups candidates by computed E.164. Groups with ≥2 members are
 *      collision sets — all members land in phone_e164_backfill_collisions
 *      with talent_profiles.phone_e164 left NULL pending super-admin review.
 *   5. Singleton candidates are written to talent_profiles.phone_e164. If
 *      the partial unique index rejects (a prior row already owns the E.164
 *      from a previous apply), the row is retro-classified as a collision.
 *
 * Usage (from web/)
 *   npm i -D libphonenumber-js   # one-time; not currently a dependency
 *
 *   # dry-run (default) — prints the plan, writes nothing:
 *   node --env-file=.env.local scripts/backfill-talent-phone-e164.mjs
 *
 *   # apply — writes UPDATE + INSERT in a single transaction per batch:
 *   node --env-file=.env.local scripts/backfill-talent-phone-e164.mjs --apply
 *
 *   # verbose — logs per-row classification (chatty for large datasets):
 *   node --env-file=.env.local scripts/backfill-talent-phone-e164.mjs --verbose
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL       required
 *   SUPABASE_SERVICE_ROLE_KEY      required (bypasses RLS for the write)
 *
 * Exit codes:
 *   0  — plan produced (dry-run) or apply succeeded
 *   1  — configuration or runtime error (writes nothing)
 *   2  — libphonenumber-js not installed
 *
 * Idempotent. Safe to re-run: only rows with phone_e164 IS NULL are touched,
 * and collision-table inserts are guarded by the (row_id, computed_e164)
 * open-unique partial index.
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// CLI parse.
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const VERBOSE = args.includes("--verbose");

// ---------------------------------------------------------------------------
// Resolve libphonenumber-js (not a declared dependency yet — fail loudly).
// ---------------------------------------------------------------------------

let parsePhoneNumberFromString;
try {
  ({ parsePhoneNumberFromString } = await import("libphonenumber-js"));
} catch {
  console.error(
    "ERROR: libphonenumber-js is not installed.\n" +
      "  From web/:  npm i -D libphonenumber-js\n" +
      "Then re-run this script.",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Supabase client (service role — RLS bypassed; never use in browser code).
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "  Hint: run via `node --env-file=.env.local scripts/backfill-talent-phone-e164.mjs`",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Fetch candidate rows.
//
// Supabase returns residence_country via the FK `residence_country_id`
// (countries table). `countries.iso2` is the parse region for
// libphonenumber-js when the raw phone has no `+` prefix.
// ---------------------------------------------------------------------------

const { data: rows, error: fetchErr } = await supabase
  .from("talent_profiles")
  .select(
    "id, phone, residence_country_id, countries:residence_country_id ( iso2 )",
  )
  .is("phone_e164", null)
  .is("deleted_at", null)
  .not("phone", "is", null);

if (fetchErr) {
  console.error("ERROR: failed to fetch talent_profiles:", fetchErr.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Classify each row.
//
// Classifications:
//   ok              — parseable, valid E.164 candidate
//   empty_phone     — raw phone trimmed to empty (defensive; filtered above)
//   no_country      — no `+` prefix AND no residence ISO2 → cannot parse
//   unparseable     — libphonenumber rejected the input
//   invalid         — parsed but `.isValid()` was false
// ---------------------------------------------------------------------------

const classified = [];
for (const row of rows ?? []) {
  const raw = typeof row.phone === "string" ? row.phone.trim() : "";
  const iso2 = row.countries?.iso2 ?? null;

  if (raw.length === 0) {
    classified.push({ id: row.id, raw, iso2, status: "empty_phone" });
    continue;
  }

  const hasPlus = raw.startsWith("+");
  if (!hasPlus && !iso2) {
    classified.push({ id: row.id, raw, iso2, status: "no_country" });
    continue;
  }

  let parsed;
  try {
    parsed = hasPlus
      ? parsePhoneNumberFromString(raw)
      : parsePhoneNumberFromString(raw, iso2);
  } catch {
    parsed = undefined;
  }

  if (!parsed) {
    classified.push({ id: row.id, raw, iso2, status: "unparseable" });
    continue;
  }
  if (!parsed.isValid()) {
    classified.push({
      id: row.id,
      raw,
      iso2,
      status: "invalid",
      e164: parsed.number,
    });
    continue;
  }

  classified.push({
    id: row.id,
    raw,
    iso2,
    status: "ok",
    e164: parsed.number,
  });
}

// ---------------------------------------------------------------------------
// Group by computed E.164 → detect collisions.
// ---------------------------------------------------------------------------

const groups = new Map();
for (const c of classified) {
  if (c.status !== "ok") continue;
  const arr = groups.get(c.e164) ?? [];
  arr.push(c);
  groups.set(c.e164, arr);
}

const singletons = [];
const collisions = [];
for (const [e164, members] of groups) {
  if (members.length === 1) {
    singletons.push(members[0]);
  } else {
    for (const m of members) collisions.push({ ...m, computed_e164: e164 });
  }
}

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------

const counts = {
  scanned: classified.length,
  ok: classified.filter((c) => c.status === "ok").length,
  empty_phone: classified.filter((c) => c.status === "empty_phone").length,
  no_country: classified.filter((c) => c.status === "no_country").length,
  unparseable: classified.filter((c) => c.status === "unparseable").length,
  invalid: classified.filter((c) => c.status === "invalid").length,
  singletons: singletons.length,
  collision_sets: [...groups.values()].filter((m) => m.length > 1).length,
  collision_rows: collisions.length,
};

console.log(`\n=== phone_e164 backfill — ${APPLY ? "APPLY" : "DRY-RUN"} ===`);
console.log(
  `rows with non-null phone + null phone_e164 (non-deleted): ${counts.scanned}`,
);
console.log(`  ok (parseable + valid):       ${counts.ok}`);
console.log(`  empty_phone:                   ${counts.empty_phone}`);
console.log(`  no_country (can't parse):      ${counts.no_country}`);
console.log(`  unparseable:                   ${counts.unparseable}`);
console.log(`  invalid:                       ${counts.invalid}`);
console.log(`singletons (to UPDATE):          ${counts.singletons}`);
console.log(`collision sets:                  ${counts.collision_sets}`);
console.log(`collision rows (to INSERT):      ${counts.collision_rows}`);

if (VERBOSE) {
  console.log("\n--- per-row classification ---");
  for (const c of classified) {
    console.log(
      `  ${c.id}  status=${c.status}  iso2=${c.iso2 ?? "-"}  raw="${c.raw}"  e164=${c.e164 ?? "-"}`,
    );
  }
}

if (!APPLY) {
  console.log(
    "\nDry-run complete. Re-run with --apply to write updates and collision rows.",
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// APPLY PHASE.
//
// We perform writes row-by-row rather than bulk upserts because:
//   - The partial unique index on talent_profiles.phone_e164 may reject a
//     singleton if a prior apply (or concurrent row edit) already claimed the
//     E.164. We treat that as a retroactive collision and route the row to
//     phone_e164_backfill_collisions.
//   - The collision table's (row_id, computed_e164) open-unique index dedupes
//     repeat runs for free (ON CONFLICT DO NOTHING).
// ---------------------------------------------------------------------------

let applied = { updated: 0, inserted_collisions: 0, retroactive_collisions: 0 };

for (const s of singletons) {
  const { error: updErr } = await supabase
    .from("talent_profiles")
    .update({ phone_e164: s.e164 })
    .eq("id", s.id)
    .is("phone_e164", null);

  if (updErr) {
    // 23505 = unique_violation — another row already owns this E.164.
    if (updErr.code === "23505") {
      const { error: insErr } = await supabase
        .from("phone_e164_backfill_collisions")
        .upsert(
          {
            row_id: s.id,
            raw_phone: s.raw,
            computed_e164: s.e164,
          },
          { onConflict: "row_id,computed_e164", ignoreDuplicates: true },
        );
      if (insErr) {
        console.error(
          `  ! failed to log retroactive collision for ${s.id}: ${insErr.message}`,
        );
      } else {
        applied.retroactive_collisions += 1;
      }
    } else {
      console.error(`  ! update failed for ${s.id}: ${updErr.message}`);
    }
    continue;
  }
  applied.updated += 1;
}

for (const c of collisions) {
  const { error: insErr } = await supabase
    .from("phone_e164_backfill_collisions")
    .upsert(
      {
        row_id: c.id,
        raw_phone: c.raw,
        computed_e164: c.computed_e164,
      },
      { onConflict: "row_id,computed_e164", ignoreDuplicates: true },
    );
  if (insErr) {
    console.error(
      `  ! collision insert failed for ${c.id} (${c.computed_e164}): ${insErr.message}`,
    );
    continue;
  }
  applied.inserted_collisions += 1;
}

console.log("\n=== apply complete ===");
console.log(`  talent_profiles.phone_e164 UPDATEs:       ${applied.updated}`);
console.log(
  `  phone_e164_backfill_collisions INSERTs:   ${applied.inserted_collisions}`,
);
console.log(
  `  retroactive collisions (index rejected):  ${applied.retroactive_collisions}`,
);
console.log(
  "\nReview queue (psql): SELECT row_id, computed_e164, raw_phone FROM public.phone_e164_backfill_collisions WHERE resolved_at IS NULL;",
);
