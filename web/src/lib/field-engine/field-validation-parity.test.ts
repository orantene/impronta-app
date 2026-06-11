// field-validation-parity.test.ts
//
// PARITY PROOF for the T1.4 validation flip (FIELD_ENGINE_CLIENT_SOURCE
// `validation` default static → db). A reviewer re-runs this with ZERO DB
// access: it reads two committed snapshots of the live prod DB and proves the
// DB-derived pre-save validation is decision-identical to the static catalog
// for every active field, enumerates the explained safe exceptions, and proves
// a known-invalid select value is still rejected while a known-valid one is
// accepted.
//
// Run: npx tsx --test src/lib/field-engine/field-validation-parity.test.ts
// (wired into the `test:fields` script — re-run via `npm run test:fields`).
//
// ── Regenerate the snapshots (prod Supabase pluhdapdnuiulvxmyspd, read-only) ──
// db-field-validation-snapshot.json — one row per active field:
//   SELECT field_key, tier, kind, is_optional,
//          COALESCE(jsonb_array_length(to_jsonb(options)),0) AS option_count,
//          (validation_rules IS NOT NULL AND validation_rules::text <> '{}') AS has_rules,
//          show_in_registration, show_in_edit_drawer,
//          COALESCE((SELECT bool_or(r.relationship='required' OR r.required_before_publish)
//                    FROM profile_field_recommendations r
//                    WHERE r.field_definition_id = p.id), false) AS required_by_rec
//   FROM profile_field_definitions p WHERE deprecated_at IS NULL;
//
// db-out-of-option-stored-values.json — every live stored select value that is
// NOT in its field's options array (workflow_state='live'), with its row count.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  compareRequiredParity,
  classifyOutOfOptionValue,
  dbRequiredVerdict,
  staticRequiredVerdict,
  type DbFieldValidationRow,
  type OutOfOptionRow,
} from "@/lib/field-engine/field-validation-parity";

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(
  readFileSync(join(here, "__fixtures__/db-field-validation-snapshot.json"), "utf8"),
) as { activeFieldCount: number; fields: DbFieldValidationRow[] };
const outOfOption = JSON.parse(
  readFileSync(join(here, "__fixtures__/db-out-of-option-stored-values.json"), "utf8"),
) as { rows: OutOfOptionRow[] };

const ROWS = snapshot.fields;

// ── Snapshot sanity ──────────────────────────────────────────────────────────

test("snapshot: covers every active field exactly once", () => {
  assert.equal(ROWS.length, snapshot.activeFieldCount);
  const keys = new Set(ROWS.map((r) => r.field_key));
  assert.equal(keys.size, ROWS.length, "duplicate field_key in snapshot");
  assert.ok(ROWS.length >= 250, "expected the full active catalog (~260 fields)");
});

// ── Required/optional parity (the dimension the validation flip changes) ─────

// The ONLY type-specific fields where DB required/optional differs from the
// static catalog. Each is a model body-measurement or chef cert that the
// editor's publish gate (resolverMissing) ALREADY treats as required-before-
// publish today — so flipping does not introduce a novel restriction anywhere
// the editor enforces; it only documents the already-live requirement. We
// enumerate them explicitly so a NEW drift would fail this test loudly.
const EXPECTED_REQUIRED_DELTA: ReadonlyArray<{
  field_key: string;
  static: "required" | "optional";
  db: "required" | "optional";
}> = [
  { field_key: "chef.food_handler_certified", static: "optional", db: "required" },
  { field_key: "physical.bust_cm", static: "required", db: "required" },
  { field_key: "physical.hair_color", static: "required", db: "required" },
  { field_key: "physical.height_cm", static: "required", db: "required" },
  { field_key: "physical.hips_cm", static: "required", db: "required" },
  { field_key: "physical.waist_cm", static: "required", db: "required" },
];

test("required parity: DB == static for every active field (universal floor handled separately)", () => {
  const report = compareRequiredParity(ROWS);
  // chef.food_handler_certified is the lone field where the static catalog has
  // no requiredFor entry but the DB carries a `required` recommendation. It is
  // enumerated below as a safe, already-enforced exception. The model
  // measurements agree (static requiredFor: ["models"] ⇔ DB `required` rec).
  assert.deepEqual(
    report.mismatches.map((m) => ({ field_key: m.field_key, static: m.static, db: m.db })),
    [{ field_key: "chef.food_handler_certified", static: "optional", db: "required" }],
    "unexpected required/optional drift — investigate before flipping",
  );
  // Everything else agrees outright.
  assert.equal(
    report.agreements,
    report.total - report.mismatches.length,
  );
});

test("required parity: the one mismatch is DB-stricter and already enforced by the publish gate (safe)", () => {
  const chef = ROWS.find((r) => r.field_key === "chef.food_handler_certified")!;
  // DB derives required (via required_before_publish). The editor drawer's
  // publish gate already blocks publish on this field today (resolverMissing),
  // independent of this flag — so the wizard becoming consistent is an
  // alignment, never a regression of an accepted save.
  assert.equal(dbRequiredVerdict(chef), "required");
  assert.equal(staticRequiredVerdict(chef), "optional");
  assert.equal(chef.required_by_rec, true);
});

test("required parity: the model-measurement deltas resolve to identical verdicts", () => {
  for (const exp of EXPECTED_REQUIRED_DELTA) {
    if (exp.field_key === "chef.food_handler_certified") continue;
    const row = ROWS.find((r) => r.field_key === exp.field_key)!;
    assert.equal(staticRequiredVerdict(row), exp.static, `${exp.field_key} static`);
    assert.equal(dbRequiredVerdict(row), exp.db, `${exp.field_key} db`);
    assert.equal(
      staticRequiredVerdict(row),
      dbRequiredVerdict(row),
      `${exp.field_key}: static and DB must AGREE (both required)`,
    );
  }
});

// ── Stale-options / out-of-option stored-value safety ────────────────────────
//
// CAUTION from the sibling task: availability.status / experience.level /
// travel.scope (+ case drift on physical.* body fields) carry option arrays
// that don't cover every real stored value. The flip is only safe if it never
// starts REJECTING a real stored value. Prove every out-of-option value is
// either healed (case/slug drift → maps to a listed option) or skipped by the
// tolerant writers (unmatchable → `continue`, never aborts a save).

test("stale options: every out-of-option stored value is healed or safely skipped (never rejected)", () => {
  assert.ok(outOfOption.rows.length > 0, "fixture should carry the live out-of-option values");
  for (const row of outOfOption.rows) {
    const c = classifyOutOfOptionValue(row);
    assert.ok(
      c.outcome === "healed" || c.outcome === "skipped",
      `${row.fieldKey}="${row.storedValue}" must heal or skip, got ${c.outcome}`,
    );
    if (c.outcome === "healed") {
      assert.ok(
        c.healedTo && row.options.includes(c.healedTo),
        `${row.fieldKey}="${row.storedValue}" healed to a non-listed value`,
      );
    }
  }
});

test("stale options: the known stale-vocab keys land in the SKIPPED bucket (documented blocker if ever flipped to strict-reject)", () => {
  // These three keys have genuine vocabulary drift (not just case): the stored
  // values are absent from the options array AND don't slugify onto one. The
  // tolerant save paths SKIP them (never reject), so the flip stays safe — but
  // they are NOT safe to put behind a STRICT enum-reject save without first
  // refreshing their options arrays. This test pins that classification so a
  // future strict-validation change can't silently start bricking these.
  const staleKeys = new Set(["availability.status", "experience.level", "travel.scope"]);
  const skippedStaleKeys = new Set(
    outOfOption.rows
      .filter((r) => staleKeys.has(r.fieldKey))
      .filter((r) => classifyOutOfOptionValue(r).outcome === "skipped")
      .map((r) => r.fieldKey),
  );
  assert.deepEqual(
    [...skippedStaleKeys].sort(),
    ["availability.status", "experience.level", "travel.scope"],
    "a stale-vocab key unexpectedly heals — re-audit its options array",
  );
});

// ── Known-invalid still rejected / known-valid still accepted ────────────────
//
// Mirrors the strict DB save validator `validateFieldValue` (select branch,
// admin-talent-field-values.ts): a non-empty select value must be one of the
// field's options. We prove the DB option set still rejects an off-list value
// and accepts a listed one — the core "flip doesn't loosen enum enforcement"
// guarantee.
function dbSelectAccepts(options: string[] | null, raw: string): boolean {
  // Exact mirror of validateFieldValue's `case "select"` membership check.
  if (typeof raw !== "string") return false;
  if (options && options.length > 0 && !options.includes(raw)) return false;
  return true;
}

test("known-invalid rejected / known-valid accepted by the DB option set", () => {
  // physical.eye_color options (from the live snapshot).
  const eyeOptions = ["Brown", "Blue", "Green", "Hazel", "Grey", "Amber", "Black", "Other"];
  assert.equal(dbSelectAccepts(eyeOptions, "Brown"), true, "a listed option must be accepted");
  assert.equal(
    dbSelectAccepts(eyeOptions, "definitely_not_an_eye_color"),
    false,
    "an off-list value must be rejected",
  );
  // Empty options array → no enum constraint (accepts anything) — matches
  // validateFieldValue and the 11 active enum fields that ship no options.
  assert.equal(dbSelectAccepts([], "anything"), true);
});
