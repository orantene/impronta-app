/**
 * Read-only verification of seeded foundation demos. Every check compares the
 * database with what the plan (foundation-plan.ts) says a seed writes, so the
 * verifier and the seeder cannot drift apart. Returns mismatches as text; an
 * empty list means the demo passes. Never writes, never prints a password.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { DEMO_BATCH } from "./demos";
import { redact } from "./demo-identity";
import type { FoundationDemo } from "./foundation-load";
import {
  buildFieldValuePlan,
  buildLanguageRows,
  buildOfferingRows,
  demoCurrency,
  deriveHours,
  type FieldDef,
} from "./foundation-plan";
import { findLocationId, type LocationIndex, type Manifest } from "./foundation-seed-core";

type DbErr = { message: string } | null;
function ok<T>(res: { data: T; error: DbErr }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export type VerifyContext = {
  admin: SupabaseClient;
  hubTenantId: string;
  termIds: Map<string, string>;
  fieldDefs: Map<string, FieldDef>;
  authByEmail: Map<string, User>;
  locations: LocationIndex;
  now: Date;
  /** When set, signs in as the demo with the anon-key client and signs out again; returns an error text or null. */
  signIn?: (email: string, password: string) => Promise<string | null>;
  /** Live demos keep their own password unless --set-live-password was used; sign in only when asked. */
  signInLive?: boolean;
  /** Seed manifest: supported_locales are recorded there until the product has a column. */
  manifest?: Pick<Manifest, "entries">;
  /** Called with informational lines (not mismatches). */
  info?: (line: string) => void;
  /** The shared demo password (DEMO_PASSWORD), used only for the sign-in check. */
  password?: string;
};

/** Stable JSON: object keys sorted, arrays kept in order. Postgres jsonb does
 *  not preserve key order, so a raw JSON.stringify compare flags identical
 *  values (e.g. {startMin,endMin} read back as {endMin,startMin}). */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export async function verifyDemo(ctx: VerifyContext, d: FoundationDemo): Promise<string[]> {
  const bad: string[] = [];
  const { admin } = ctx;

  const user = ctx.authByEmail.get(d.email.toLowerCase());
  if (!user) return [`auth user ${d.email} does not exist`];
  if (user.app_metadata?.demo_batch !== DEMO_BATCH || user.app_metadata?.demo !== true) {
    bad.push("auth user has no demo marker (app_metadata.demo / demo_batch)");
  }

  const tp = ok(
    await admin
      .from("talent_profiles")
      .select("id, user_id, is_demo, home_city_text, short_bio, bio_i18n, preferred_locale, default_currency")
      .eq("profile_code", d.profileCode)
      .maybeSingle(),
    "talent_profiles",
  ) as { id: string; user_id: string | null; is_demo: boolean | null; home_city_text: string | null; short_bio: string | null; bio_i18n: Record<string, string> | null; preferred_locale: string | null; default_currency: string | null } | null;
  if (!tp) return [...bad, `no talent_profiles row for ${d.profileCode}`];
  const id = tp.id;
  if (tp.is_demo !== true) bad.push("is_demo is not true");
  if (tp.user_id !== user.id) bad.push("profile is linked to a different user");
  if (!d.isLive && !tp.bio_i18n?.es) bad.push("bio_i18n.es is empty");
  if (!d.isLive && d.bioEn && !tp.bio_i18n?.en) bad.push("bio_i18n.en is empty");
  if (!d.isLive && tp.preferred_locale !== d.defaultLocale) bad.push(`preferred_locale is ${tp.preferred_locale}, expected ${d.defaultLocale}`);
  const rec = ctx.manifest?.entries[d.profileCode];
  if (rec && !d.isLive && JSON.stringify(rec.supportedLocales ?? null) !== JSON.stringify(d.supportedLocales)) {
    bad.push(`manifest supported_locales ${JSON.stringify(rec.supportedLocales)}, expected ${JSON.stringify(d.supportedLocales)}`);
  }
  ctx.info?.(`${d.profileCode} site language ${d.defaultLocale}; supported_locales ${JSON.stringify(rec?.supportedLocales ?? d.supportedLocales)}${rec ? " (manifest)" : " (workbook, no manifest)"}`);
  if (!d.isLive && tp.default_currency !== demoCurrency(d)) bad.push(`default_currency is ${tp.default_currency}, expected ${demoCurrency(d)}`);
  if (!d.isLive && tp.home_city_text !== d.city) bad.push(`home_city_text is "${tp.home_city_text}", expected "${d.city}"`);

  // Taxonomy: exactly the expected primary type.
  const tax = ok(
    await admin.from("talent_profile_taxonomy").select("taxonomy_term_id, relationship_type").eq("talent_profile_id", id).eq("relationship_type", "primary_role"),
    "talent_profile_taxonomy",
  ) as { taxonomy_term_id: string }[];
  const wantTerm = ctx.termIds.get(d.talentTypeSlug);
  if (!wantTerm) bad.push(`taxonomy slug ${d.talentTypeSlug} does not resolve`);
  else if (tax.length !== 1 || tax[0].taxonomy_term_id !== wantTerm) bad.push(`primary_role is not ${d.talentTypeSlug} (rows: ${tax.length})`);

  // Live demos: curated content is never asserted (no offerings, hours, site or field-value checks).
  if (d.isLive) {
    if (ctx.signIn && ctx.password && ctx.signInLive) {
      const err = await ctx.signIn(d.email, ctx.password);
      if (err) bad.push(`sign-in failed: ${redact(err, [ctx.password])}`);
    }
    return bad;
  }

  // Offerings: four, in order, with the planned modes and prices.
  const plan = buildOfferingRows(d, id, ctx.hubTenantId, ctx.now.toISOString());
  const off = ok(
    await admin
      .from("talent_offerings")
      .select("title, booking_mode, price_display, price_type, amount_cents, currency, duration_minutes, status, reserve_mode, category, sort_order")
      .eq("talent_profile_id", id)
      .order("sort_order"),
    "talent_offerings",
  ) as Record<string, unknown>[];
  if (off.length !== plan.rows.length) bad.push(`${off.length} offerings, expected ${plan.rows.length}`);
  plan.rows.forEach((want, i) => {
    const got = off[i];
    if (!got) return;
    for (const k of ["title", "booking_mode", "price_display", "price_type", "amount_cents", "currency", "duration_minutes", "status", "reserve_mode", "category"] as const) {
      if (!same(got[k], want[k])) bad.push(`offering ${i + 1} ${k}: ${JSON.stringify(got[k])}, expected ${JSON.stringify(want[k])}`);
    }
  });

  // Booking hours: present iff the workbook gives hours.
  const wantHours = deriveHours(d, plan.instantFlags);
  const hrs = ok(
    await admin.from("talent_booking_hours").select("timezone, weekly, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days").eq("talent_profile_id", id).maybeSingle(),
    "talent_booking_hours",
  ) as Record<string, unknown> | null;
  if (wantHours && !hrs) bad.push("booking hours are missing");
  else if (!wantHours && hrs) bad.push("booking hours exist but the workbook has none");
  else if (wantHours && hrs) {
    for (const k of ["timezone", "weekly", "slot_minutes", "buffer_before_min", "buffer_after_min", "min_notice_min", "horizon_days"] as const) {
      if (!same(hrs[k], wantHours[k])) bad.push(`booking hours ${k}: ${JSON.stringify(hrs[k])}, expected ${JSON.stringify(wantHours[k])}`);
    }
  }

  // Field values: the same count and the same values as the plan, for the keys the seeder owns.
  const fp = buildFieldValuePlan(d, ctx.fieldDefs);
  for (const k of fp.missingDefs) bad.push(`no field definition for ${k}`);
  const idByKey = new Map([...ctx.fieldDefs.values()].map((f) => [f.id, f.field_key]));
  const managedIds = fp.managedKeys.map((k) => ctx.fieldDefs.get(k)?.id).filter((x): x is string => !!x);
  const rows: { field_definition_id: string; value: unknown; workflow_state: string }[] = [];
  for (let i = 0; i < managedIds.length; i += 100) {
    rows.push(
      ...(ok(
        await admin
          .from("talent_profile_field_values")
          .select("field_definition_id, value, workflow_state")
          .eq("talent_profile_id", id)
          .in("field_definition_id", managedIds.slice(i, i + 100)),
        "talent_profile_field_values",
      ) as typeof rows),
    );
  }
  if (rows.length !== fp.values.length) bad.push(`${rows.length} field values, expected ${fp.values.length}`);
  const got = new Map(rows.map((r) => [idByKey.get(r.field_definition_id), r]));
  for (const want of fp.values) {
    const r = got.get(want.fieldKey);
    if (!r) bad.push(`field ${want.fieldKey} has no value`);
    else if (!same(r.value, want.value)) bad.push(`field ${want.fieldKey} differs from the workbook`);
    else if (r.workflow_state !== "live") bad.push(`field ${want.fieldKey} is ${r.workflow_state}, not live`);
  }

  // Languages.
  const langs = ok(await admin.from("talent_languages").select("language_code").eq("talent_profile_id", id), "talent_languages") as { language_code: string }[];
  if (langs.length !== buildLanguageRows(d).length) bad.push(`${langs.length} languages, expected ${buildLanguageRows(d).length}`);

  // Site: exists; new demos must still be a draft.
  const site = ok(
    await admin.from("talent_sites").select("status, site_slug, site_published_at, shell_published").eq("talent_profile_id", id).maybeSingle(),
    "talent_sites",
  ) as { status: string | null; site_slug: string | null; site_published_at: string | null; shell_published: unknown } | null;
  if (!site) bad.push("site row is missing");
  else if (!d.isLive) {
    if (site.status === "published") bad.push("site is published (new demos stay drafts until their theme is Ready)");
    if (site.site_published_at) bad.push("site_published_at is set");
    if (site.shell_published != null && !(Array.isArray(site.shell_published) && site.shell_published.length === 0)) bad.push("shell_published is not empty");
    if (!site.site_slug) bad.push("site has no slug");
    const page = ok(await admin.from("talent_pages").select("status").eq("talent_profile_id", id).eq("slug", "home").maybeSingle(), "talent_pages") as { status: string } | null;
    if (!page) bad.push("home page is missing");
    else if (page.status === "published") bad.push("home page is published");
    const areas = ok(await admin.from("talent_service_areas").select("service_kind").eq("talent_profile_id", id), "talent_service_areas") as { service_kind: string }[];
    const wantHome = findLocationId(ctx.locations, d.city, d.country) ? 1 : 0;
    if (areas.filter((a) => a.service_kind === "home_base").length !== wantHome) bad.push(`home_base service areas: ${areas.length}, expected ${wantHome}`);
  }

  // Sign-in with the shared password (anon key), then straight out again.
  if (ctx.signIn && ctx.password) {
    const err = await ctx.signIn(d.email, ctx.password);
    if (err) bad.push(`sign-in failed: ${redact(err, [ctx.password])}`);
  }
  return bad;
}
