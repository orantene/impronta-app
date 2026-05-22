/**
 * Converts a raw enum slug (e.g. "dark_brown", "non_binary") to a
 * human-readable label.  An override map handles special casing
 * (ampersands, hyphens, mixed-case acronyms); the generic fallback
 * replaces underscores / hyphens with spaces and title-cases each word.
 *
 * Idempotent: passing an already-humanized string returns it unchanged.
 */
const OVERRIDES: Record<string, string> = {
  available_now: "Available Now",
  dark_brown: "Dark Brown",
  light_brown: "Light Brown",
  medium_brown: "Medium Brown",
  dark_blonde: "Dark Blonde",
  light_blonde: "Light Blonde",
  strawberry_blonde: "Strawberry Blonde",
  salt_and_pepper: "Salt & Pepper",
  blue_green: "Blue-Green",
  blue_grey: "Blue-Grey",
  hazel_green: "Hazel Green",
  non_binary: "Non-Binary",
  gender_fluid: "Gender Fluid",
  gender_neutral: "Gender Neutral",
  plus_size: "Plus Size",
  full_time: "Full Time",
  part_time: "Part Time",
  semi_exclusive: "Semi-Exclusive",
  uk_based: "UK-Based",
  us_based: "US-Based",
  available: "Available",
  unavailable: "Unavailable",
  on_hold: "On Hold",
};

export function humanizeEnumLabel(slug: string): string {
  const t = slug.trim();
  if (!t) return t;
  const lower = t.toLowerCase().replace(/\s+/g, "_");
  if (OVERRIDES[lower]) return OVERRIDES[lower];
  return t
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
