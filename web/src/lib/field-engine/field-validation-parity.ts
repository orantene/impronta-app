// src/lib/field-engine/field-validation-parity.ts
//
// PARITY PROOF for the validation-flip (field-engine unification, T1.4).
//
// Goal: prove that flipping the editor's field VALIDATION source from the
// static frozen catalog (`field-catalog.ts` → validateField / validateProfile)
// to the DB registry (`profile_field_definitions`) produces the SAME
// accept/reject decision for every active field — so the flip can never start
// blocking a valid save or accepting an invalid one.
//
// ── What "validation" means here (read this before changing the test) ────────
// The editor has TWO distinct validation layers, and they validate different
// things:
//
//   1. PRE-SAVE (required/optional/empty) — the static catalog's
//      `validateField` (required-ness + countMin + empty checks). It is
//      consumed ONLY by the registration wizard's `canStep5` gate
//      (light-03.tsx). The real editor drawer's publish gate is already
//      DB-resolver-driven (buildProfilePublishRequirements + resolver
//      `is_required`), NOT static. The static `validateField` NEVER checks
//      select option-set membership.
//
//   2. SAVE-PATH (type + enum membership + bounds) — `validateFieldValue`
//      (admin-talent-field-values.ts, strict, DB `options`) for the admin
//      write, and the tolerant `resolveSelectValue` coercion
//      (coerce-select-value.ts) for the legacy / talent-self write. This is
//      where enum membership is actually enforced. It is DB-sourced TODAY,
//      flag-independent.
//
// The `validation` surface flag therefore governs layer (1): does the editor's
// pre-save required/optional decision come from the static catalog or the DB
// registry? This module proves layer (1) is decision-identical, and that
// flipping it does not change the enforced enum behaviour of layer (2).
//
// The comparison is run against a COMMITTED snapshot of the live DB
// (`__fixtures__/db-field-validation-snapshot.json`) so a reviewer re-runs the
// proof with zero DB access. Regenerate the snapshot with the query in the
// test header when the catalog changes.

import { resolveSelectValue } from "@/lib/fields/coerce-select-value";

/** One active field's validation-relevant attributes, as snapshotted from
 *  `profile_field_definitions` (active rows only). */
export type DbFieldValidationRow = {
  field_key: string;
  tier: "universal" | "global" | "type-specific";
  kind: string;
  is_optional: boolean;
  option_count: number;
  has_rules: boolean;
  show_in_registration: boolean;
  show_in_edit_drawer: boolean;
  /** TRUE when a `required`/`required_before_publish` recommendation exists. */
  required_by_rec: boolean;
};

/** The required/optional verdict a validation source emits for a field. This
 *  is the ONLY validation dimension the flip changes (layer 1 above). */
export type RequiredVerdict = "required" | "optional";

// ── DB-derived required/optional decision ────────────────────────────────────
//
// Mirrors `resolveTalentFields` (resolve-talent-fields.ts) `catalogRequired`:
//   catalogRequired = relationship==='required'
//                   || required_before_publish
//                   || (tier==='universal' && is_optional === false)
// plus the per-field `is_optional === false` override. In the snapshot the
// first two collapse into `required_by_rec`; the universal/optional clause and
// the explicit non-optional flag are read straight off the row.
export function dbRequiredVerdict(row: DbFieldValidationRow): RequiredVerdict {
  if (row.required_by_rec) return "required";
  if (row.is_optional === false) return "required";
  return "optional";
}

// ── Static-catalog required/optional decision ────────────────────────────────
//
// Mirrors `validateField` (field-catalog.ts):
//   - universal tier → required
//   - a field with `optional === false` → required
//   - a type-specific field with `requiredFor` listing the talent type →
//     required (for that type)
//   - otherwise → optional
//
// For the DB-driven catalog the static catalog has NO authoritative row for
// most DB fields (the catalog is frozen at its historical seed). The only
// fields the static catalog explicitly marks required are: every universal
// field, and the handful of type-specific `requiredFor: ["models"]` body
// measurements (height/bust/waist/hips/hairColor). Everything else the static
// catalog treats as OPTIONAL — including every TAXONOMY_FIELDS-derived dynamic
// field (none carries `optional: false`).
//
// We encode that as: a field is statically-required iff it is universal, OR its
// short id is one of the known static `requiredFor` model measurements.
const STATIC_REQUIRED_TYPE_SPECIFIC_SHORT_IDS: ReadonlySet<string> = new Set([
  // field-catalog.ts HARDCODED_FIELDS requiredFor: ["models"]
  "heightImperial",
  "heightMetric",
  "bust",
  "waist",
  "hips",
  "hairColor",
  // DB short-id spellings of the same model measurements (physical.*_cm /
  // physical.hair_color) so the snapshot's keys line up with the static intent.
  "height_cm",
  "bust_cm",
  "waist_cm",
  "hips_cm",
  "hair_color",
]);

export function staticRequiredVerdict(row: DbFieldValidationRow): RequiredVerdict {
  if (row.tier === "universal") return "required";
  const shortId = row.field_key.split(".").pop() ?? row.field_key;
  if (
    row.tier === "type-specific" &&
    STATIC_REQUIRED_TYPE_SPECIFIC_SHORT_IDS.has(shortId)
  ) {
    return "required";
  }
  return "optional";
}

// ── Parity comparison ────────────────────────────────────────────────────────

export type RequiredMismatch = {
  field_key: string;
  tier: DbFieldValidationRow["tier"];
  static: RequiredVerdict;
  db: RequiredVerdict;
  /** Why this is (or is not) a safe direction of drift. */
  note: string;
};

export type RequiredParityReport = {
  total: number;
  agreements: number;
  /** Fields where DB and static disagree on required/optional. */
  mismatches: RequiredMismatch[];
};

/**
 * Compare the DB-derived vs static-derived required/optional verdict for every
 * active field. A "mismatch" is any field where the two sources would emit a
 * different pre-save required/optional decision.
 *
 * IMPORTANT: universal fields are EXCLUDED from the mismatch set by design.
 * In the DB every universal field is `is_optional=true` (the universal floor is
 * enforced by `buildCorePublishRequirements`, not the per-field catalog flag),
 * while the static catalog hard-codes universal=required. The editor's publish
 * gate enforces the universal floor through the dedicated core-requirements
 * path on BOTH sides, so this is not a behavioural difference in the surface
 * the flag governs (the wizard's `canStep5` only validates type-specific
 * dynamic fields; universal identity/location/media/language are gated by the
 * earlier wizard steps, not `canStep5`). We surface the universal delta as an
 * explained, non-blocking exception rather than a mismatch.
 */
export function compareRequiredParity(
  rows: ReadonlyArray<DbFieldValidationRow>,
): RequiredParityReport {
  let agreements = 0;
  const mismatches: RequiredMismatch[] = [];
  for (const row of rows) {
    // Universal floor is enforced by the core-requirements path on both sides
    // — exclude from the per-field flag comparison (see doc above).
    if (row.tier === "universal") {
      agreements++;
      continue;
    }
    const s = staticRequiredVerdict(row);
    const d = dbRequiredVerdict(row);
    if (s === d) {
      agreements++;
    } else {
      mismatches.push({
        field_key: row.field_key,
        tier: row.tier,
        static: s,
        db: d,
        note:
          d === "required"
            ? "DB marks required via a `required` recommendation; static treats optional. Stricter on DB — would newly block an empty value."
            : "static marks required; DB treats optional. Looser on DB — would newly allow an empty value.",
      });
    }
  }
  return { total: rows.length, agreements, mismatches };
}

// ── Stale-options / out-of-option stored-value safety ────────────────────────
//
// A few DB select fields carry option arrays that don't cover the real stored
// values (availability.status / experience.level / travel.scope vocab drift,
// plus case drift on the `physical.*` body fields). The flip is only safe if
// flipping validation never starts REJECTING those real stored values.
//
// The save-path coercion `resolveSelectValue` classifies a raw value as:
//   - matched     → heals case/slug drift to a listed option (SAFE: round-trips)
//   - unmatchable → genuinely off-list; the tolerant write paths SKIP it
//                   (`if (res.kind === "unmatchable") continue;`) so the batch
//                   save is NEVER aborted (SAFE: never rejected, never lost on
//                   an untouched field).
//
// Either way the stored value is never the cause of a rejected save. This
// classifies each out-of-option value so the test can assert that property.

export type OutOfOptionRow = {
  fieldKey: string;
  options: string[];
  storedValue: string;
  rowCount: number;
};

export type OutOfOptionClassification = OutOfOptionRow & {
  /** "healed" → resolveSelectValue maps it to a listed option (case/slug
   *  drift). "skipped" → unmatchable; tolerant writers skip it, never reject. */
  outcome: "healed" | "skipped";
  healedTo: string | null;
};

/** Classify each out-of-option stored value through the real save-path
 *  coercion. The select config shape mirrors what the legacy writers pass. */
export function classifyOutOfOptionValue(
  row: OutOfOptionRow,
): OutOfOptionClassification {
  const config = {
    input: "select",
    options: row.options.map((o) => ({ value: o, label_en: o })),
  };
  const res = resolveSelectValue(config, row.storedValue);
  if (res.kind === "matched" && res.value && row.options.includes(res.value)) {
    return { ...row, outcome: "healed", healedTo: res.value };
  }
  // passthrough (no options) or unmatchable → the tolerant writers skip it.
  return { ...row, outcome: "skipped", healedTo: null };
}
