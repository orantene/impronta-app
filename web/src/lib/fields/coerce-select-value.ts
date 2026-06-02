/**
 * Tolerant + self-healing resolution of a stored/submitted `select` field value
 * to its canonical option `value`.
 *
 * Background — three historical write paths populated `field_values.value_text`
 * for select fields with inconsistent vocabularies:
 *   - the canonical option `value` slug ("athletic", "dark_brown")  ← correct
 *   - the human option `label` ("Athletic", "Dark Brown")            ← label-as-value
 *   - case variants ("XS" vs "xs", "Dark brown" vs "Dark Brown")     ← case drift
 *   - options later removed from the list ("Amber", "Extra long")    ← orphaned
 *
 * The save validators used a strict, case-sensitive `value === option.value`
 * check, so ~47% of roster profiles became completely unsaveable: a single
 * legacy value on an untouched field (e.g. "Body type") aborted the whole
 * batch save with "Invalid value for X." even when the user was editing an
 * unrelated field on another tab.
 *
 * This resolver maps a raw value to its canonical option value by trying, in
 * order: exact value → case-insensitive value → case-insensitive label →
 * slugified-label. When it resolves, the caller writes the canonical value, so
 * the row self-heals on the next save. Genuinely orphaned values (no matching
 * option at all) return `kind: "unmatchable"` so the caller can skip persisting
 * that one field instead of bricking the entire save.
 */

type SelectOption = { value: string; label: string };

function readSelectOptions(config: unknown): SelectOption[] | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const c = config as Record<string, unknown>;
  if (c.input !== "select") return null;
  const options = c.options;
  if (!Array.isArray(options)) return null;
  const out: SelectOption[] = [];
  for (const o of options) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    const rec = o as Record<string, unknown>;
    const value = String(rec.value ?? "").trim();
    if (!value) continue;
    const label = String(rec.label_en ?? rec.label ?? "").trim();
    out.push({ value, label });
  }
  return out.length ? out : null;
}

/** Match the option `value` slug convention: lowercase, non-alphanumerics → `_`. */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type SelectResolution =
  /** Not a select field (no options) — value passes through untouched. */
  | { kind: "passthrough" }
  /** Resolved to a canonical option value (may equal `raw`, or a healed form). */
  | { kind: "matched"; value: string }
  /** Has options, but `raw` matches none — orphaned/legacy/junk value. */
  | { kind: "unmatchable" };

/**
 * Resolve a non-empty `raw` value against a field's select options.
 * Caller is responsible for the empty-string case (clearing a value).
 */
export function resolveSelectValue(config: unknown, raw: string): SelectResolution {
  const options = readSelectOptions(config);
  if (!options) return { kind: "passthrough" };

  const needle = raw.trim();
  if (!needle) return { kind: "matched", value: "" };

  // 1. exact value
  for (const o of options) if (o.value === needle) return { kind: "matched", value: o.value };

  const lower = needle.toLowerCase();
  // 2. case-insensitive value
  for (const o of options) if (o.value.toLowerCase() === lower) return { kind: "matched", value: o.value };
  // 3. case-insensitive label
  for (const o of options) if (o.label && o.label.toLowerCase() === lower) return { kind: "matched", value: o.value };

  // 4. slugified-label (e.g. "Dark Brown" → "dark_brown")
  const slug = slugify(needle);
  for (const o of options) {
    if (o.value === slug) return { kind: "matched", value: o.value };
    if (o.label && slugify(o.label) === slug) return { kind: "matched", value: o.value };
  }

  return { kind: "unmatchable" };
}

/**
 * Resolve `raw` to one of a bare-label option list (the System B / catalog
 * vocabulary, where the option *is* its own label, e.g. ["Athletic","Curvy"]).
 * Tolerant of case and slug/label drift — e.g. a mirrored System A slug
 * "dark_brown" resolves to the catalog label "Dark brown". Returns the exact
 * canonical label, or null when nothing matches (caller should skip rather
 * than write a non-option value).
 */
export function matchLabelOption(labels: readonly string[], raw: string): string | null {
  const clean = labels.map((l) => String(l ?? "").trim()).filter(Boolean);
  const needle = raw.trim();
  if (!needle) return null;
  // exact, then case-insensitive
  for (const l of clean) if (l === needle) return l;
  const lower = needle.toLowerCase();
  for (const l of clean) if (l.toLowerCase() === lower) return l;
  // slug-of-label vs slug-of-raw (collapses "dark_brown" ⇄ "Dark brown")
  const slug = slugify(needle);
  for (const l of clean) if (slugify(l) === slug) return l;
  return null;
}

/** Return the option `label_en` for a given canonical `value`, or null. */
export function labelForValue(config: unknown, value: string): string | null {
  const options = readSelectOptions(config);
  if (!options) return null;
  for (const o of options) if (o.value === value) return o.label || null;
  return null;
}
