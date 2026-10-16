/**
 * The hero copy of the Maison v2 demo talents (release 2.7): the facts the
 * website's top section and footer read from the PROFILE at render time, so each
 * demo shows a headline, a tagline, years of craft, spoken languages and an
 * Instagram like the proposal, from real profile fields and nothing frozen.
 *
 * Fictional people only. The handles end in `.demo` and are demo content, not
 * real accounts. Fields a demo already has (tagline, years, languages on the
 * guide demos) are left out; only what is missing is written. Idempotent: every
 * write is an upsert or a replace of the same values.
 *
 * Pure data + one writer. The writer refuses anything that is not a demo
 * profile in this list (`is_demo` and its profile code).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sameStable } from "./stable";


/** Alba's tagline (Maison v2 proposal, word for word). */
export const ALBA_TAGLINE =
  "Manicura rusa, pestañas hechas a mano y cejas con diseño. Un estudio privado donde cada cita es solo tuya.";

/** Alba's tagline in English (same meaning as ALBA_TAGLINE). */
export const ALBA_TAGLINE_EN =
  "Russian manicure, hand-applied lashes and designed brows. A private studio where every appointment is yours alone.";

export interface HeroFacts {
  /** `identity.headline`: the big line (the site puts one italic accent word in it). */
  headline: string;
  /** `identity.tagline`, only where the demo has none yet. */
  tagline?: string;
  /** English `en` key of `identity.headline_i18n`. Add-only: a non-empty English value is never overwritten. */
  headlineEn?: string;
  /** English `en` key of `identity.tagline_i18n`. Add-only. */
  taglineEn?: string;
  /** `experience.years_total`, only where the demo has none yet. */
  years?: number;
  /** Spoken languages in order (English names), only where the demo has none yet. */
  languages?: string[];
  /** Instagram handle without the @: fictional, demo content. */
  instagram: string;
}

export const HERO_FACTS: Readonly<Record<string, HeroFacts>> = {
  // Alba (proposal): nothing but the Instagram existed.
  "TAL-93020": {
    headline: "Manos que hablan por ti.",
    headlineEn: "Hands that speak for you.",
    tagline: ALBA_TAGLINE,
    taglineEn: ALBA_TAGLINE_EN,
    years: 9,
    languages: ["Spanish", "English"],
    instagram: "alba.unas.demo",
  },
  // The guide demos already carry tagline, years and languages.
  "TAL-93002": { headline: "Pestañas que enmarcan tu mirada.", headlineEn: "Lashes that frame your look.", instagram: "renata.pestanas.demo" },
  "TAL-93003": { headline: "Uñas hechas a mano, a tu medida.", headlineEn: "Nails finished by hand, made to fit you.", instagram: "camila.nails.demo" },
  "TAL-93103": { headline: "Soft gel and lash lifts, made for you.", instagram: "linh.tran.demo" },
  "TAL-93104": { headline: "Brows shaped to frame your face.", instagram: "leo.haddad.demo" },
  "TAL-93105": {
    headline: "Maquillaje que te hace brillar.",
    headlineEn: "Makeup that makes you glow.",
    // TUL-494: bilingual Maison demos ship tagline + taglineEn (hero_tagline liveText).
    tagline: "Maquillaje social y de evento en Palermo, Buenos Aires.",
    taglineEn: "Social and event makeup in Palermo, Buenos Aires.",
    instagram: "sofia.rinaldi.demo",
  },
  "TAL-93106": { headline: "Curls cut to show their shape.", instagram: "marcus.bell.demo" },
  "TAL-93107": { headline: "Clean lines, sharp from start to finish.", instagram: "coleman.cuts.demo" },
};

const LANGUAGE_CODES: Readonly<Record<string, string>> = { Spanish: "es", English: "en", Vietnamese: "vi", French: "fr" };

type Db = Pick<SupabaseClient, "from">;

async function definitionIds(admin: Db, keys: string[]): Promise<Map<string, string>> {
  const { data, error } = await admin.from("profile_field_definitions").select("id, field_key").in("field_key", keys);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [(r as { field_key: string }).field_key, (r as { id: string }).id]));
}

/** A clean `{ locale: text }` map out of a stored field value, or an empty one. */
function localeMapOf(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

/**
 * The next `{ locale: text }` map with the English line added, or null when
 * nothing should be written (no English line given, or a non-empty `en` is
 * already there). Pure. Every other key of the stored map stays as it is.
 */
export function addEnglishLine(stored: unknown, en: string | undefined): Record<string, string> | null {
  const line = en?.trim();
  if (!line) return null;
  const map = localeMapOf(stored);
  if (map.en) return null;
  return { ...map, en: line };
}

export interface HeroFactsResult {
  profileCode: string;
  wrote: string[];
}

/**
 * Write one demo's hero facts. `hubTenantId` scopes the field value rows like the
 * Tier-A scalar writes do. Throws when the profile is not a demo.
 */
export async function applyHeroFacts(
  admin: Db,
  input: { profileCode: string; hubTenantId: string; write: boolean; /** Override the built-in table (a content fixture). */ facts?: HeroFacts },
): Promise<HeroFactsResult | null> {
  const facts = input.facts ?? HERO_FACTS[input.profileCode];
  if (!facts) return null;
  const { data: tp, error } = await admin
    .from("talent_profiles")
    .select("id, is_demo, social_links")
    .eq("profile_code", input.profileCode)
    .maybeSingle();
  if (error) throw error;
  if (!tp) return null;
  const profile = tp as { id: string; is_demo: boolean | null; social_links: unknown };
  if (profile.is_demo !== true) throw new Error(`REFUSE: ${input.profileCode} is not a demo profile`);

  const wrote: string[] = [];
  const now = new Date().toISOString();
  const defs = await definitionIds(admin, ["identity.headline", "identity.tagline", "experience.years_total"]);
  const values: Array<[string, unknown]> = [["identity.headline", facts.headline]];
  if (facts.tagline) values.push(["identity.tagline", facts.tagline]);
  if (typeof facts.years === "number") values.push(["experience.years_total", facts.years]);
  for (const [key, value] of values) {
    const defId = defs.get(key);
    if (!defId) throw new Error(`field definition ${key} is missing (is migration 20261231299620 applied?)`);
    const { data: have, error: haveErr } = await admin
      .from("talent_profile_field_values")
      .select("id, value")
      .eq("talent_profile_id", profile.id)
      .eq("field_definition_id", defId)
      .maybeSingle();
    if (haveErr) throw haveErr;
    if (key !== "identity.headline" && have) continue; // already set: never overwrite a demo's own tagline or years
    if (have && sameStable((have as { value: unknown }).value, value)) continue; // headline already current
    wrote.push(key);
    if (!input.write) continue;
    const { error: upErr } = await admin.from("talent_profile_field_values").upsert(
      {
        tenant_id: input.hubTenantId,
        talent_profile_id: profile.id,
        field_definition_id: defId,
        value,
        workflow_state: "live",
        last_edited_role: "platform",
        updated_at: now,
      },
      { onConflict: "talent_profile_id,field_definition_id" },
    );
    if (upErr) throw upErr;
  }

  // English hero lines: the `en` key of the per-language maps. Add-only, idempotent.
  const i18n: Array<[string, string | undefined]> = [
    ["identity.headline_i18n", facts.headlineEn],
    ["identity.tagline_i18n", facts.taglineEn],
  ];
  for (const [key, en] of i18n) {
    if (!en?.trim()) continue;
    const defId = (await definitionIds(admin, [key])).get(key);
    if (!defId) throw new Error(`field definition ${key} is missing (is migration 20261231299640 applied?)`);
    const { data: have, error: haveErr } = await admin
      .from("talent_profile_field_values")
      .select("id, value")
      .eq("talent_profile_id", profile.id)
      .eq("field_definition_id", defId)
      .maybeSingle();
    if (haveErr) throw haveErr;
    const next = addEnglishLine((have as { value: unknown } | null)?.value, en);
    if (!next) continue;
    wrote.push(key);
    if (!input.write) continue;
    const { error: upErr } = await admin.from("talent_profile_field_values").upsert(
      {
        tenant_id: input.hubTenantId,
        talent_profile_id: profile.id,
        field_definition_id: defId,
        value: next,
        workflow_state: "live",
        last_edited_role: "platform",
        updated_at: now,
      },
      { onConflict: "talent_profile_id,field_definition_id" },
    );
    if (upErr) throw upErr;
  }

  if (facts.languages?.length) {
    const { count, error: cErr } = await admin
      .from("talent_languages")
      .select("id", { count: "exact", head: true })
      .eq("talent_profile_id", profile.id);
    if (cErr) throw cErr;
    if (!count) {
      wrote.push("languages");
      if (input.write) {
        const rows = facts.languages.map((name, i) => ({
          talent_profile_id: profile.id,
          language_code: LANGUAGE_CODES[name] ?? name.slice(0, 2).toLowerCase(),
          language_name: name,
          speaking_level: i === 0 ? "native" : "fluent",
          is_native: i === 0,
          display_order: i,
        }));
        const { error: lErr } = await admin.from("talent_languages").upsert(rows, { onConflict: "talent_profile_id,language_code" });
        if (lErr) throw lErr;
      }
    }
  }

  const links = Array.isArray(profile.social_links) ? (profile.social_links as Array<{ platform?: string; href?: string }>) : [];
  const href = `https://www.instagram.com/${facts.instagram}/`;
  if (!links.some((l) => l.platform === "instagram" && l.href === href)) {
    wrote.push("instagram");
    if (input.write) {
      const next = [...links.filter((l) => l.platform !== "instagram"), { platform: "instagram", href }];
      const { error: sErr } = await admin.from("talent_profiles").update({ social_links: next, updated_at: now }).eq("id", profile.id);
      if (sErr) throw sErr;
    }
  }
  return { profileCode: input.profileCode, wrote };
}
