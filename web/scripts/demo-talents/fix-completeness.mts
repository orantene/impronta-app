/**
 * Fix the non-photo completeness gaps of the Demo Foundation talents, by class,
 * for every affected demo at once. Reads the same audit the audit script runs,
 * turns each gap into an idempotent write, and never touches anything that is
 * not a demo row.
 *
 * Classes (--class a,b,...; default all):
 *   locations  add the cities the demos live in to the locations registry (ensure_city_location)
 *   areas      home_base (+ travel_to) service areas and talent_profiles.location_id
 *   text       missing bio / tagline / offering text and category, taken from the workbook, never invented
 *   locale     preferred_locale + secondary_locales from site-languages.json
 *   languages  spoken-language rows for demos that have none
 *   fields     planned profile field values a demo does not have yet (insert only, never overwrites)
 *   availability  one open calendar cell so the drawer's Disponibilidad ticks (the person's own cells win)
 *   faq        3-4 trade-true Q&As for the themes that show an FAQ section
 *
 * Never written: reviews, credits, past clients, licences, certifications,
 * prices, booking modes, names of live demos, photos, site publication.
 *
 * Refuses anything that is not a demo: TAL-93xxx code, is_demo, demo email
 * domain, auth user with app_metadata.demo_batch.
 *
 * Run (from web/):
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=.env.local scripts/demo-talents/fix-completeness.mts            # dry run
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=.env.local scripts/demo-talents/fix-completeness.mts --yes-write
 * Options: --class <list>, --only <codes>, --dir <foundation dir>
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertDemoIdentity } from "./demo-identity";
import { resolveRunMode } from "./foundation-cli";
import { DEFAULT_FOUNDATION_DIR, loadFoundation, selectDemos, type FoundationDemo } from "./foundation-load";
import { buildAvailabilityCells, buildFieldValuePlan, buildLanguageRows, primaryText, UNIVERSAL_FIELD_KEYS } from "./foundation-plan";
import {
  checkDemoUser,
  findLocationId,
  loadAuthUsers,
  loadFieldDefs,
  loadLocationIndex,
  readOnly,
  resolveHubTenantId,
  resolveTermIds,
  type LocationIndex,
} from "./foundation-seed-core";
import {
  AUDIT_FIELD_KEYS,
  auditDemo,
  loadAuditData,
  matchService,
  needsFaq,
  type AuditData,
  type DemoAudit,
  type FaqDb,
} from "./completeness-core";
import { buildFaq } from "./faq-builder";

type Op = { code: string; cls: string; what: string; run: () => Promise<void> };
type DbError = { message: string } | null;

const CLASSES = ["locations", "areas", "text", "locale", "languages", "fields", "availability", "faq"] as const;
type Cls = (typeof CLASSES)[number];

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

function must<T>(res: { data: T; error: DbError }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

const has = (m: Record<string, string> | null | undefined, k: string): boolean => typeof m?.[k] === "string" && m[k].trim() !== "";

/** Same normalization as the product's city slug (accents stripped first, so Querétaro is "queretaro"). */
function citySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
  if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
    throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
  }
  const mode = resolveRunMode(args);
  if (mode.notice) console.log(`NOTE: ${mode.notice}`);
  const classes = (opt("--class")?.split(",").map((s) => s.trim()) ?? [...CLASSES]) as Cls[];
  for (const c of classes) if (!CLASSES.includes(c)) throw new Error(`unknown class ${c}`);
  const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const dir = opt("--dir") ?? process.env.DEMO_FOUNDATION_DIR ?? DEFAULT_FOUNDATION_DIR;
  const demos = selectDemos(loadFoundation({ dir }), only);
  for (const d of demos) assertDemoIdentity(d);

  const raw = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin: SupabaseClient = mode.write ? raw : readOnly(raw);
  const hub = await resolveHubTenantId(admin);
  const terms = await resolveTermIds(admin, demos.map((d) => d.talentTypeSlug));
  const fieldDefs = await loadFieldDefs(admin, [
    ...UNIVERSAL_FIELD_KEYS,
    ...AUDIT_FIELD_KEYS,
    ...demos.flatMap((d) => Object.keys(d.typeFields)),
  ]);
  const auth = await loadAuthUsers(admin);
  for (const d of demos) {
    if (!checkDemoUser(auth, d.email)) throw new Error(`REFUSE: no demo auth user for ${d.profileCode} (${d.email})`);
  }

  let locations = await loadLocationIndex(admin);
  let data = await loadAuditData({ admin, demos, termIds: terms.ids, fieldDefs, locations });
  const audit = (): DemoAudit[] => demos.map((d) => auditDemo(d, data, { termIds: terms.ids, locations, fieldDefs }));
  let audits = audit();
  for (const a of audits) if (a.gaps.includes("id.not_demo")) throw new Error(`REFUSE: ${a.code} is not flagged is_demo`);
  const missingSeed = audits.filter((a) => !a.seeded).map((a) => a.code);
  if (missingSeed.length) console.log(`skipping ${missingSeed.length} demos that are not seeded yet: ${missingSeed.join(", ")}`);

  const byCode = new Map(demos.map((d) => [d.profileCode, d]));
  const write = mode.write;
  const totals: Record<string, { ops: number; done: number; failed: number }> = {};

  async function runOps(ops: Op[]) {
    for (const cls of new Set(ops.map((o) => o.cls))) totals[cls] ??= { ops: 0, done: 0, failed: 0 };
    for (const o of ops) totals[o.cls].ops += 1;
    if (!write) {
      for (const o of ops.slice(0, 400)) console.log(`  [dry] ${o.cls} ${o.code}: ${o.what}`);
      return;
    }
    const queue = [...ops];
    const worker = async () => {
      for (let o = queue.shift(); o; o = queue.shift()) {
        try {
          await o.run();
          totals[o.cls].done += 1;
        } catch (e) {
          totals[o.cls].failed += 1;
          console.error(`  FAILED ${o.cls} ${o.code}: ${e instanceof Error ? e.message : e}`);
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  const seededDemos = () => audits.filter((a) => a.seeded).map((a) => ({ a, d: byCode.get(a.code)! }));

  // ── locations ─────────────────────────────────────────────────────────────
  if (classes.includes("locations")) {
    const wanted = new Map<string, { country: string; city: string; demos: string[] }>();
    for (const { a, d } of seededDemos()) {
      if (!a.gaps.includes("loc.city_not_in_registry")) continue;
      const k = `${d.country}:${citySlug(d.city)}`;
      const e = wanted.get(k) ?? { country: d.country, city: d.city, demos: [] };
      e.demos.push(d.profileCode);
      wanted.set(k, e);
    }
    const ops: Op[] = [...wanted.values()].map((w) => ({
      code: w.demos.join(","),
      cls: "locations",
      what: `add ${w.city} (${w.country}) to the registry, slug ${citySlug(w.city)}`,
      run: async () => {
        must(
          await admin.rpc("ensure_city_location", {
            p_country_iso2: w.country,
            p_city_slug: citySlug(w.city),
            p_city_name_en: w.city,
            p_city_name_es: w.city,
          }),
          `ensure_city_location ${w.city}`,
        );
      },
    }));
    console.log(`locations: ${ops.length} cities to add for ${[...wanted.values()].reduce((n, w) => n + w.demos.length, 0)} demos`);
    await runOps(ops);
    if (write && ops.length) {
      locations = await loadLocationIndex(admin);
      data = await loadAuditData({ admin, demos, termIds: terms.ids, fieldDefs, locations });
      audits = audit();
    }
  }

  // ── areas ─────────────────────────────────────────────────────────────────
  if (classes.includes("areas")) {
    const ops: Op[] = [];
    let pendingCity = 0;
    for (const { a, d } of seededDemos()) {
      const p = data.profiles.get(d.profileCode)!;
      if (!a.gaps.some((g) => ["loc.service_area_missing", "loc.service_area_wrong", "loc.location_id_missing", "loc.location_id_wrong", "loc.neighbourhood_missing"].includes(g))) continue;
      const home = findLocationId(locations, d.city, d.country);
      if (!home) {
        pendingCity += 1;
        if (!write) console.log(`  [dry] areas ${d.profileCode}: waits for the ${d.city} location (created by the locations class)`);
        else console.error(`  cannot link ${d.profileCode}: no location for ${d.city}`);
        continue;
      }
      ops.push({
        code: d.profileCode,
        cls: "areas",
        what: `home_base ${d.city}${d.neighbourhood ? ` / ${d.neighbourhood}` : ""}`,
        run: () => writeAreas(admin, hub, locations, d, p.id, home),
      });
    }
    console.log(`areas: ${ops.length} demos to link (${pendingCity} waiting on a new location)`);
    await runOps(ops);
  }

  // ── text ──────────────────────────────────────────────────────────────────
  if (classes.includes("text")) {
    const ops: Op[] = [];
    for (const { d } of seededDemos()) ops.push(...textOps(admin, hub, d, data, fieldDefs));
    console.log(`text: ${ops.length} writes`);
    await runOps(ops);
  }

  // ── locale ────────────────────────────────────────────────────────────────
  if (classes.includes("locale")) {
    const ops: Op[] = [];
    for (const { a, d } of seededDemos()) {
      if (!a.gaps.some((g) => g.startsWith("locale."))) continue;
      const p = data.profiles.get(d.profileCode)!;
      ops.push({
        code: d.profileCode,
        cls: "locale",
        what: `preferred ${p.preferred_locale} -> ${d.defaultLocale}, secondary ${JSON.stringify(p.secondary_locales)} -> ${JSON.stringify(d.supportedLocales.slice(1))}`,
        run: async () => {
          must(
            await admin.from("talent_profiles").update({ preferred_locale: d.defaultLocale, secondary_locales: d.supportedLocales.slice(1) }).eq("id", p.id),
            "locale update",
          );
        },
      });
    }
    console.log(`locale: ${ops.length} demos`);
    await runOps(ops);
  }

  // ── languages ─────────────────────────────────────────────────────────────
  if (classes.includes("languages")) {
    const ops: Op[] = [];
    for (const { a, d } of seededDemos()) {
      if (!a.gaps.includes("lang.missing")) continue;
      const p = data.profiles.get(d.profileCode)!;
      const rows = buildLanguageRows(d);
      ops.push({
        code: d.profileCode,
        cls: "languages",
        what: `languages ${rows.map((r) => r.language_code).join(",")}`,
        run: async () => {
          must(await admin.rpc("replace_talent_languages", { p_talent_profile_id: p.id, p_tenant_id: hub, p_rows: rows }), "replace_talent_languages");
        },
      });
    }
    console.log(`languages: ${ops.length} demos`);
    await runOps(ops);
  }

  // ── fields ────────────────────────────────────────────────────────────────
  if (classes.includes("fields")) {
    const ops: Op[] = [];
    for (const { a, d } of seededDemos()) {
      if (!a.gaps.some((g) => g === "fields.missing" || g === "dash.Identidad" || g === "dash.Logistica" || g === "dash.Restricciones")) continue;
      const p = data.profiles.get(d.profileCode)!;
      ops.push({
        code: d.profileCode,
        cls: "fields",
        what: "insert missing planned field values",
        run: async () => {
          const plan = buildFieldValuePlan(d, fieldDefs);
          if (plan.missingDefs.length) throw new Error(`no field definition for ${plan.missingDefs.join(", ")}`);
          const ids = plan.values.map((v) => fieldDefs.get(v.fieldKey)!.id);
          const have = new Set<string>();
          for (let i = 0; i < ids.length; i += 100) {
            const found = must(
              await admin.from("talent_profile_field_values").select("field_definition_id").eq("talent_profile_id", p.id).in("field_definition_id", ids.slice(i, i + 100)),
              "field values read",
            ) as { field_definition_id: string }[];
            for (const r of found) have.add(r.field_definition_id);
          }
          const rows = plan.values
            .filter((v) => !have.has(fieldDefs.get(v.fieldKey)!.id))
            .map((v) => ({
              tenant_id: hub,
              talent_profile_id: p.id,
              field_definition_id: fieldDefs.get(v.fieldKey)!.id,
              value: v.value,
              workflow_state: "live",
              last_edited_role: "platform",
            }));
          for (let i = 0; i < rows.length; i += 200) must(await admin.from("talent_profile_field_values").insert(rows.slice(i, i + 200)), "field values insert");
        },
      });
    }
    console.log(`fields: ${ops.length} demos`);
    await runOps(ops);
  }

  // ── availability ──────────────────────────────────────────────────────────
  if (classes.includes("availability")) {
    const ops: Op[] = [];
    const now = new Date();
    for (const { a, d } of seededDemos()) {
      if (!a.gaps.includes("dash.Disponibilidad")) continue;
      const p = data.profiles.get(d.profileCode)!;
      const cells = d.hours ? buildAvailabilityCells(d, now) : projectCells(d, now);
      if (!cells.length) continue;
      ops.push({
        code: d.profileCode,
        cls: "availability",
        what: `${cells.length} open calendar cell(s)${d.hours ? "" : " (no fixed hours in the workbook: one cell carrying the availability note)"}`,
        run: async () => {
          const cur = must(await admin.from("talent_profiles").select("availability_data").eq("id", p.id).single(), "availability read") as { availability_data: Record<string, unknown> | null };
          const existing = cur.availability_data && typeof cur.availability_data === "object" ? cur.availability_data : {};
          if (Array.isArray(existing.cells) && existing.cells.length > 0) return; // the person's own calendar wins
          const next = { vacation: null, recurring: { kind: "none" }, seasonalWindows: [], ...existing, cells };
          must(await admin.from("talent_profiles").update({ availability_data: next }).eq("id", p.id), "availability write");
        },
      });
    }
    console.log(`availability: ${ops.length} demos`);
    await runOps(ops);
  }

  // ── faq ───────────────────────────────────────────────────────────────────
  if (classes.includes("faq")) {
    const ops: Op[] = [];
    for (const { d } of seededDemos()) ops.push(...faqOps(admin, d, data));
    console.log(`faq: ${ops.length} writes`);
    await runOps(ops);
  }

  console.log("\nsummary", JSON.stringify(totals));
  if (!write) console.log("dry run: nothing written. Add --yes-write to write.");
}

/** Project trades have no fixed weekly hours: one open cell on the next weekday, with the workbook's own availability line (Spanish only, like the seeder). */
function projectCells(d: FoundationDemo, today: Date): { date: string; status: "open"; note?: string }[] {
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const cell: { date: string; status: "open"; note?: string } = { date: day.toISOString().slice(0, 10), status: "open" };
    if (d.defaultLocale === "es" && d.universal.availabilityNoteEs) cell.note = d.universal.availabilityNoteEs;
    return [cell];
  }
  return [];
}

// ── writers ─────────────────────────────────────────────────────────────────

/** Home base (+ travel_to) exactly as the seeder writes them, and the profile's location mirror. */
async function writeAreas(admin: SupabaseClient, hub: string, idx: LocationIndex, d: FoundationDemo, profileId: string, home: string) {
  const rows: Record<string, unknown>[] = [
    {
      tenant_id: hub,
      talent_profile_id: profileId,
      location_id: home,
      service_kind: "home_base",
      travel_radius_km: d.universal.travelRadiusKm && d.universal.travelRadiusKm > 0 ? d.universal.travelRadiusKm : null,
      travel_fee_required: d.universal.travelFeeRequired ?? false,
      notes: d.neighbourhood,
      display_order: 0,
    },
  ];
  const seen = new Set([home]);
  for (const city of d.universal.travelTo) {
    const id = findLocationId(idx, city, d.country);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      tenant_id: hub,
      talent_profile_id: profileId,
      location_id: id,
      service_kind: "travel_to",
      travel_radius_km: null,
      travel_fee_required: false,
      notes: null,
      display_order: rows.length,
    });
  }
  must(await admin.from("talent_service_areas").delete().eq("talent_profile_id", profileId), "talent_service_areas delete");
  must(await admin.from("talent_service_areas").insert(rows), "talent_service_areas insert");
  must(await admin.from("talent_profiles").update({ location_id: home }).eq("id", profileId), "location_id mirror");
}

type BioEntry = { locale: string; text: string };

async function upsertFvs(admin: SupabaseClient, hub: string, profileId: string, defId: string, value: unknown) {
  must(
    await admin.from("talent_profile_field_values").upsert(
      { tenant_id: hub, talent_profile_id: profileId, field_definition_id: defId, value, workflow_state: "live", last_edited_role: "platform" },
      { onConflict: "talent_profile_id,field_definition_id" },
    ),
    "talent_profile_field_values upsert",
  );
}

/** Missing text, from the workbook only. A value already in the database is never replaced. */
function textOps(admin: SupabaseClient, hub: string, d: FoundationDemo, data: AuditData, defs: ReadonlyMap<string, { id: string }>): Op[] {
  const ops: Op[] = [];
  const p = data.profiles.get(d.profileCode);
  if (!p) return ops;
  const code = d.profileCode;
  const fv = data.fvs.get(p.id) ?? new Map<string, unknown>();

  // Profile columns: bio per language, short bio.
  const bio: Record<string, string> = { ...(p.bio_i18n ?? {}) };
  let bioChanged = false;
  if (!has(bio, "es") && d.bio) {
    bio.es = d.bio;
    bioChanged = true;
  }
  if (!has(bio, "en") && d.bioEn) {
    bio.en = d.bioEn;
    bioChanged = true;
  }
  const patch: Record<string, unknown> = {};
  if (bioChanged) patch.bio_i18n = bio;
  const tagline = primaryText(d, d.tagline, d.taglineEn);
  if (!p.short_bio?.trim() && tagline) patch.short_bio = tagline;
  if (Object.keys(patch).length) {
    ops.push({ code, cls: "text", what: `profile ${Object.keys(patch).join(",")}`, run: async () => void must(await admin.from("talent_profiles").update(patch).eq("id", p.id), "talent_profiles text") });
  }

  // The drawer's bios field value (EN entry >= 30 characters) follows bio_i18n.
  const bioDef = defs.get("bios");
  const cur = Array.isArray(fv.get("bios")) ? (fv.get("bios") as BioEntry[]) : [];
  const order = [d.defaultLocale, d.defaultLocale === "en" ? "es" : "en"];
  const want: BioEntry[] = order.filter((l) => has(bio, l)).map((l) => ({ locale: l, text: bio[l] }));
  const curHas = (l: string) => cur.some((b) => b?.locale === l && (b.text ?? "").trim() !== "");
  if (bioDef && want.some((b) => !curHas(b.locale))) {
    // Keep entries that are already there; add the missing languages after them.
    const merged = [...cur.filter((b) => (b?.text ?? "").trim() !== ""), ...want.filter((b) => !curHas(b.locale))];
    ops.push({ code, cls: "text", what: `bios field ${merged.map((b) => b.locale).join("+")}`, run: () => upsertFvs(admin, hub, p.id, bioDef.id, merged) });
  }
  const tagDef = defs.get("identity.tagline");
  if (tagDef && tagline && !(typeof fv.get("identity.tagline") === "string" && String(fv.get("identity.tagline")).trim())) {
    ops.push({ code, cls: "text", what: "tagline field", run: () => upsertFvs(admin, hub, p.id, tagDef.id, tagline) });
  }

  // Offerings: missing languages and category, matched to the workbook service.
  (data.offerings.get(p.id) ?? []).forEach((o, i) => {
    const s = matchService(d, o, i);
    if (!s) return;
    const up: Record<string, unknown> = {};
    const title = { ...(o.title_i18n ?? {}) };
    const desc = { ...(o.description_i18n ?? {}) };
    const cat = { ...(o.category_i18n ?? {}) };
    let t = false;
    let ds = false;
    let c = false;
    if (!has(title, "es") && s.name) [title.es, t] = [s.name, true];
    if (!has(title, "en") && s.nameEn) [title.en, t] = [s.nameEn, true];
    if (!has(desc, "es") && s.description) [desc.es, ds] = [s.description, true];
    if (!has(desc, "en") && s.descriptionEn) [desc.en, ds] = [s.descriptionEn, true];
    if (!has(cat, "es") && s.category) [cat.es, c] = [s.category, true];
    if (!has(cat, "en") && s.categoryEn) [cat.en, c] = [s.categoryEn, true];
    if (t) up.title_i18n = title;
    if (ds) up.description_i18n = desc;
    if (c) up.category_i18n = cat;
    if (!o.title?.trim() && title[d.defaultLocale]) up.title = title[d.defaultLocale];
    if (!o.description?.trim() && desc[d.defaultLocale]) up.description = desc[d.defaultLocale];
    if (!o.category?.trim()) {
      const primary = primaryText(d, s.category, s.categoryEn);
      if (primary) up.category = primary;
    }
    if (Object.keys(up).length) {
      ops.push({ code, cls: "text", what: `offering ${i + 1} ${Object.keys(up).join(",")}`, run: async () => void must(await admin.from("talent_offerings").update(up).eq("id", o.id), "talent_offerings text") });
    }
  });
  return ops;
}

/** FAQ rows for the themes that show them; existing rows only get their primary-language map filled. */
function faqOps(admin: SupabaseClient, d: FoundationDemo, data: AuditData): Op[] {
  const ops: Op[] = [];
  const p = data.profiles.get(d.profileCode);
  if (!p || !needsFaq(d)) return ops;
  const code = d.profileCode;
  const existing: FaqDb[] = data.faqs.get(p.id) ?? [];
  const primary = d.defaultLocale;
  if (existing.length < 3) {
    const faqs = buildFaq(d);
    ops.push({
      code,
      cls: "faq",
      what: `${faqs.length} FAQ rows (${existing.length} existing kept in place, new ones appended)`,
      run: async () => {
        const rows = faqs.map((f, i) => ({
          talent_profile_id: p.id,
          question: f.question[primary],
          answer: f.answer[primary],
          question_i18n: f.question,
          answer_i18n: f.answer,
          status: "published",
          sort_order: existing.length + i,
        }));
        must(await admin.from("talent_faq_items").insert(rows), "talent_faq_items insert");
      },
    });
  }
  for (const f of existing) {
    const qi = { ...(f.question_i18n ?? {}) };
    const ai = { ...(f.answer_i18n ?? {}) };
    let changed = false;
    if (!has(qi, primary) && f.question.trim()) [qi[primary], changed] = [f.question, true];
    if (!has(ai, primary) && f.answer.trim()) [ai[primary], changed] = [f.answer, true];
    if (changed) {
      ops.push({
        code,
        cls: "faq",
        what: `FAQ "${f.question.slice(0, 40)}" primary-language map`,
        run: async () => void must(await admin.from("talent_faq_items").update({ question_i18n: qi, answer_i18n: ai }).eq("id", f.id), "talent_faq_items i18n"),
      });
    }
  }
  return ops;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
