// L55 investigation script (one-shot, idempotent, read-only).
//
// Phase 4.1 surfaced 174 of 273 field_definitions rows flagged as both
// is_sensitive=true AND public_visible=true. Likely a bulk-seed accident,
// but each row needs a product call before we flip anything.
//
// This script categorizes the 174 into three buckets so the product owner
// can decide in one pass:
//
//   A. Clearly bulk-seed accident — `is_sensitive` is almost certainly
//      wrong. Common-sense visible-on-profile fields like height, eye
//      color, role-type, social handles, languages, etc.
//
//   B. Genuinely needs both — fields that ARE sensitive (PII) but where
//      the talent has opted in to public display. Rare. Phone, email,
//      birth date, government_id_number etc. should NOT be in the
//      public set anyway, so this bucket is mostly a sanity check.
//
//   C. Uncertain — anything that doesn't pattern-match A or B; needs the
//      product owner to look.
//
// Output: JSON document on stdout + a printed summary.
//
// Run from worktree root:
//   node --env-file=web/.env.local web/scripts/audit-sensitive-public-fields-oneshot.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const s = createClient(url, key, { auth: { persistSession: false } });

// Heuristic patterns. Tuned conservatively — when in doubt, fall to bucket C.
const BUCKET_A_PATTERNS = [
  // Physical attributes (visible on a model card by definition)
  /^height/, /^weight/, /^eye_color/, /^hair_color/, /^hair_length/,
  /^skin_tone/, /^shoe_size/, /^body_type/, /^build$/, /^chest/, /^waist/,
  /^hips$/, /^bust/, /^dress_size/, /^suit_size/, /^pants_size/, /^shirt_size/,
  /^cup_size/, /^inseam/, /^neck_size/, /^head_circumference/, /^foot_size/,
  /^tattoo/, /^piercing/, /^scar/, /^birthmark/,
  // Profile-card basics
  /^name_/, /^stage_name/, /^display_name/, /^bio/, /^short_bio/, /^tagline/,
  /^pronouns/, /^talent_type/, /^primary_type/, /^secondary_type/,
  /^subtype/, /^role/, /^category/, /^discipline/, /^genre/, /^style/,
  // Skills / languages / context
  /skills?$/, /languages?$/, /industries?$/, /event_types?/, /tags?$/,
  /^fit_label/, /^aspirations?/, /^experience_level/, /^availability/,
  // Social / portfolio
  /^instagram/, /^tiktok/, /^youtube/, /^vimeo/, /^twitter/, /^x_handle/,
  /^facebook/, /^linkedin/, /^website/, /^portfolio_url/, /^reel_url/,
  /^showreel/, /^imdb/, /^spotify/, /^soundcloud/,
  // Locations (city-level public; full address would be sensitive)
  /^home_(city|country|region)/, /^based_in/, /^location_city/,
  /^location_country/, /^service_(area|city|region)/, /^willing_to_travel/,
  // Career markers
  /^years_experience/, /^union_status/, /^representation/, /^agency_/,
  /^client_list/, /^credits?/, /^accolades?/, /^awards?/, /^featured_in/,
  // Media counts
  /^polaroid_count/, /^portfolio_count/, /^video_count/,
];

const BUCKET_B_PATTERNS = [
  // Genuinely sensitive PII — even with both flags, these should probably
  // not be public. Bucket B flags them for review with a "this is weird"
  // marker rather than auto-categorizing as accident.
  /^phone/, /^email/, /^address/, /^postal_code/, /^zip_code/,
  /^date_of_birth/, /^birth_date/, /^age$/, /^birthday/,
  /^government_id/, /^national_id/, /^ssn/, /^tax_id/, /^passport/,
  /^driver_license/, /^bank_/, /^iban/, /^swift/, /^stripe_/,
  /^paypal_/, /^payout_/, /^emergency_contact/, /^next_of_kin/,
];

function bucketFor(key, label) {
  const k = String(key ?? "").toLowerCase();
  const l = String(label ?? "").toLowerCase();
  for (const re of BUCKET_B_PATTERNS) {
    if (re.test(k) || re.test(l)) return "B";
  }
  for (const re of BUCKET_A_PATTERNS) {
    if (re.test(k) || re.test(l)) return "A";
  }
  return "C";
}

// Phase 4.1's flag lived on `profile_field_definitions` (the canonical
// table after Phase 2's resolver migration), NOT on the legacy
// `field_definitions` table.
const { data: rows, error } = await s
  .from("profile_field_definitions")
  .select("id, field_key, label, label_es, is_sensitive, show_in_public, show_in_directory, admin_only, deprecated_at, section, subsection")
  .eq("is_sensitive", true)
  .eq("show_in_public", true)
  .is("deprecated_at", null)
  .order("field_key");

if (error) {
  console.error("query failed", error);
  process.exit(1);
}

const buckets = { A: [], B: [], C: [] };
for (const r of rows) {
  buckets[bucketFor(r.field_key, r.label)].push(r);
}

const totals = Object.fromEntries(Object.entries(buckets).map(([b, list]) => [b, list.length]));

console.log("");
console.log("=== L55 — sensitive-but-public field audit ===");
console.log(`Total flagged: ${rows.length}`);
console.log("");
console.log("Bucket A — clearly bulk-seed accident (recommend: drop is_sensitive):");
console.log(`  ${totals.A} rows`);
console.log("");
console.log("Bucket B — genuine PII that's also public-flagged (recommend: drop public_visible):");
console.log(`  ${totals.B} rows`);
console.log("");
console.log("Bucket C — uncertain (recommend: product owner reviews):");
console.log(`  ${totals.C} rows`);
console.log("");
console.log("--- Bucket B detail (highest-risk; review FIRST) ---");
for (const r of buckets.B) {
  console.log(`  ${r.field_key}  (label: ${r.label}${r.label_es ? ` / ${r.label_es}` : ""})`);
}
console.log("");
console.log("--- Bucket C sample (first 20) ---");
for (const r of buckets.C.slice(0, 20)) {
  console.log(`  ${r.field_key}  (label: ${r.label}${r.label_es ? ` / ${r.label_es}` : ""})`);
}
if (buckets.C.length > 20) {
  console.log(`  … and ${buckets.C.length - 20} more`);
}
console.log("");
console.log("Full JSON below for downstream tooling:");
console.log(JSON.stringify({ totals, buckets }, null, 2));
