/**
 * TUL-323: pure planner and runner that give the EXISTING finished Spanish-primary
 * demos their English page without a rebuild:
 *   1. talent_profiles.secondary_locales gets 'en' where it is empty, and
 *   2. the English hero lines go to the `en` key of identity.headline_i18n and
 *      identity.tagline_i18n (the same maps the hero reads on /en).
 *
 * No database client and no app-database imports: every read and write goes
 * through the injected `Io`, so the tests drive it with a fake. Nothing here can
 * reach production by itself.
 *
 * Never: overwrite a non-empty English value, touch `es`, change a secondary
 * list a person already set, touch a profile that is not flagged is_demo, touch
 * a profile off the allow-list (TAL-93938 and TAL-93900 are refused by name),
 * or write without `--apply --yes`.
 */

import { addEnglishLine, HERO_FACTS } from "../../src/lib/talent-site/demos/hero-facts";
import { finishedDemoSecondaryLocales } from "../../src/lib/talent-site/demos/finished-demo-locales";
import { demoSiteSettingsFor } from "../../src/lib/talent-site/demos/demo-site-settings";

export interface Target {
  profileCode: string;
  siteSlug: string;
}

/** Hard allow-list: the finished Spanish-primary demos named in TUL-323 plus the hero-fact demos. */
export const TARGETS: readonly Target[] = [
  { profileCode: "TAL-93020", siteSlug: "alba-nail-artist" },
  { profileCode: "TAL-93003", siteSlug: "camila-nails" },
  { profileCode: "TAL-93011", siteSlug: "mateo-ferrer" },
  { profileCode: "TAL-93030", siteSlug: "alex-trevino" },
  { profileCode: "TAL-93002", siteSlug: "renata-lashes" },
  { profileCode: "TAL-93105", siteSlug: "sofia-rinaldi" },
];

/** Real and test talents: never a target, whatever else says so. */
export const FORBIDDEN_PROFILE_CODES: readonly string[] = ["TAL-93938", "TAL-93900"];

export type HeroKey = "headline_i18n" | "tagline_i18n";

export interface ProfileRow {
  id: string;
  profile_code: string;
  is_demo: boolean | null;
  preferred_locale: string | null;
  secondary_locales: string[] | null;
}

export interface Io {
  findProfile(profileCode: string): Promise<ProfileRow | null>;
  findSiteSlug(profileId: string): Promise<string | null>;
  /** The stored value of the per-language map, or undefined when the profile has no such row. */
  readHeroMap(profileId: string, key: HeroKey): Promise<unknown>;
  /** LIVE. Sets secondary_locales of one profile (keyed by id). */
  setSecondaryLocales(profileId: string, value: string[]): Promise<{ ok: boolean; error?: string }>;
  /** LIVE. Sets the per-language map of one profile; null removes the row. */
  setHeroMap(profileId: string, key: HeroKey, value: Record<string, string> | null): Promise<{ ok: boolean; error?: string }>;
  /** Writes the pre-change values to a JSON file and returns its path. */
  writeBackup(data: unknown): string;
  readBackup(path: string): unknown;
}

export interface Options {
  apply: boolean;
  yes: boolean;
  only: string[];
  restore: string | null;
}

export class RefusedError extends Error {}

export interface TargetPlan {
  profileCode: string;
  profileId: string;
  siteSlug: string;
  secondaryBefore: string[];
  secondaryAfter: string[] | null;
  /** key -> [before (undefined = no row), after]; only keys that change. */
  hero: Partial<Record<HeroKey, { before: unknown; after: Record<string, string> }>>;
  notes: string[];
}

export interface BackupEntry {
  profileCode: string;
  profileId: string;
  secondaryChanged: boolean;
  secondaryBefore: string[];
  hero: Partial<Record<HeroKey, { before: unknown }>>;
}

export interface Backup {
  kind: "tul-323-finished-demos-en";
  createdAt: string;
  entries: BackupEntry[];
}

export function parseArgs(argv: readonly string[]): Options {
  const o: Options = { apply: false, yes: false, only: [], restore: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--apply") o.apply = true;
    else if (a === "--yes") o.yes = true;
    else if (a === "--only") o.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--only=")) o.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--restore") o.restore = (argv[++i] ?? "").trim();
    else if (a.startsWith("--restore=")) o.restore = a.slice(10).trim();
    else throw new RefusedError(`unknown argument ${a}`);
  }
  if (o.restore !== null && o.restore === "") throw new RefusedError("--restore needs a backup file path");
  return o;
}

export function selectTargets(only: readonly string[]): Target[] {
  for (const code of only) {
    if (FORBIDDEN_PROFILE_CODES.includes(code)) throw new RefusedError(`refusing ${code}: a real or test talent is never a target`);
    if (!TARGETS.some((t) => t.profileCode === code)) throw new RefusedError(`refusing ${code}: not on the allow-list`);
  }
  return only.length ? TARGETS.filter((t) => only.includes(t.profileCode)) : [...TARGETS];
}

const HERO_KEYS: ReadonlyArray<{ key: HeroKey; pick: (c: string) => string | undefined }> = [
  { key: "headline_i18n", pick: (c) => HERO_FACTS[c]?.headlineEn },
  { key: "tagline_i18n", pick: (c) => HERO_FACTS[c]?.taglineEn },
];

/** Resolve and check one target, then compute what would change. Throws RefusedError on a guard failure. */
export async function planTarget(io: Io, t: Target): Promise<TargetPlan | null> {
  if (FORBIDDEN_PROFILE_CODES.includes(t.profileCode)) throw new RefusedError(`refusing ${t.profileCode}`);
  const profile = await io.findProfile(t.profileCode);
  if (!profile) return null;
  if (profile.profile_code !== t.profileCode) throw new RefusedError(`refusing: asked for ${t.profileCode}, got ${profile.profile_code}`);
  if (profile.is_demo !== true) throw new RefusedError(`refusing ${t.profileCode}: not flagged is_demo`);
  const slug = await io.findSiteSlug(profile.id);
  if (slug !== t.siteSlug) throw new RefusedError(`refusing ${t.profileCode}: site slug is ${JSON.stringify(slug)}, expected ${t.siteSlug}`);

  const notes: string[] = [];
  const secondaryBefore = profile.secondary_locales ?? [];
  let secondaryAfter: string[] | null = null;
  if ((profile.preferred_locale ?? "es") !== "es") notes.push(`primary language is ${profile.preferred_locale}: locales left alone`);
  else {
    secondaryAfter = finishedDemoSecondaryLocales({
      theme: "maison-v2",
      preferredLocale: profile.preferred_locale,
      currentSecondary: secondaryBefore,
      siteLangs: demoSiteSettingsFor(t.profileCode).siteLangs,
    });
    if (!secondaryAfter) notes.push(secondaryBefore.includes("en") ? "English already enabled" : `secondary locales already set (${secondaryBefore.join(",")}): left alone`);
  }

  const hero: TargetPlan["hero"] = {};
  for (const { key, pick } of HERO_KEYS) {
    const en = pick(t.profileCode);
    if (!en) continue;
    const before = await io.readHeroMap(profile.id, key);
    const after = addEnglishLine(before, en);
    if (after) hero[key] = { before, after };
    else notes.push(`${key}: English already present`);
  }
  return { profileCode: t.profileCode, profileId: profile.id, siteSlug: t.siteSlug, secondaryBefore, secondaryAfter, hero, notes };
}

const hasChange = (p: TargetPlan) => p.secondaryAfter !== null || Object.keys(p.hero).length > 0;

function describe(p: TargetPlan): string[] {
  const out = [`${p.profileCode} id=${p.profileId} site=${p.siteSlug}`];
  if (p.secondaryAfter) out.push(`  secondary_locales: [${p.secondaryBefore.join(",")}] -> [${p.secondaryAfter.join(",")}]`);
  for (const [key, v] of Object.entries(p.hero)) out.push(`  ${key}.en: ${JSON.stringify(v.after.en)}`);
  for (const n of p.notes) out.push(`  note: ${n}`);
  if (!hasChange(p)) out.push("  nothing to change");
  return out;
}

export interface RunResult {
  exitCode: number;
  lines: string[];
}

export async function run(argv: readonly string[], io: Io, now: () => string = () => new Date().toISOString()): Promise<RunResult> {
  const lines: string[] = [];
  let opts: Options;
  try {
    opts = parseArgs(argv);
    if (opts.restore !== null) return await runRestore(opts, io, lines);
    const targets = selectTargets(opts.only);
    const plans: TargetPlan[] = [];
    for (const t of targets) {
      const p = await planTarget(io, t);
      if (!p) lines.push(`${t.profileCode}: not found (skipped)`);
      else plans.push(p);
    }
    for (const p of plans) lines.push(...describe(p));
    const changing = plans.filter(hasChange);
    if (!opts.apply) {
      lines.push(`DRY RUN: ${changing.length} profile(s) would change. Add --apply --yes to write.`);
      return { exitCode: 0, lines };
    }
    if (!opts.yes) throw new RefusedError("--apply needs --yes as well");
    if (!changing.length) {
      lines.push("Nothing to write.");
      return { exitCode: 0, lines };
    }
    const backup: Backup = {
      kind: "tul-323-finished-demos-en",
      createdAt: now(),
      entries: changing.map((p) => ({
        profileCode: p.profileCode,
        profileId: p.profileId,
        secondaryChanged: p.secondaryAfter !== null,
        secondaryBefore: p.secondaryBefore,
        hero: Object.fromEntries(Object.entries(p.hero).map(([k, v]) => [k, { before: v.before === undefined ? null : v.before }])),
      })),
    };
    lines.push(`Backup: ${io.writeBackup(backup)}`);
    let failed = 0;
    for (const p of changing) {
      if (p.secondaryAfter) {
        const r = await io.setSecondaryLocales(p.profileId, p.secondaryAfter);
        if (!r.ok) { failed++; lines.push(`FAILED ${p.profileCode} secondary_locales: ${r.error ?? "unknown"}`); }
      }
      for (const [key, v] of Object.entries(p.hero) as Array<[HeroKey, { after: Record<string, string> }]>) {
        const r = await io.setHeroMap(p.profileId, key, v.after);
        if (!r.ok) { failed++; lines.push(`FAILED ${p.profileCode} ${key}: ${r.error ?? "unknown"}`); }
      }
    }
    lines.push(failed ? `${failed} write(s) failed` : `Applied to ${changing.length} profile(s).`);
    return { exitCode: failed ? 1 : 0, lines };
  } catch (e) {
    if (e instanceof RefusedError) {
      lines.push(`REFUSED: ${e.message}`);
      return { exitCode: 2, lines };
    }
    throw e;
  }
}

async function runRestore(opts: Options, io: Io, lines: string[]): Promise<RunResult> {
  const raw = io.readBackup(opts.restore!) as Partial<Backup> | null;
  if (!raw || raw.kind !== "tul-323-finished-demos-en" || !Array.isArray(raw.entries)) throw new RefusedError("not a TUL-323 backup file");
  const entries = raw.entries;
  // Guard every entry before any write: allow-listed code, matching id, demo, expected slug.
  for (const e of entries) {
    const t = TARGETS.find((x) => x.profileCode === e.profileCode);
    if (FORBIDDEN_PROFILE_CODES.includes(e.profileCode) || !t) throw new RefusedError(`backup names ${e.profileCode}, which is not on the allow-list`);
    const profile = await io.findProfile(e.profileCode);
    if (!profile || profile.id !== e.profileId) throw new RefusedError(`${e.profileCode}: id does not match the backup`);
    if (profile.is_demo !== true) throw new RefusedError(`${e.profileCode}: not flagged is_demo`);
    if ((await io.findSiteSlug(profile.id)) !== t.siteSlug) throw new RefusedError(`${e.profileCode}: site slug differs`);
    lines.push(`${e.profileCode} id=${e.profileId} site=${t.siteSlug}: restore ${e.secondaryChanged ? "secondary_locales " : ""}${Object.keys(e.hero).join(" ")}`);
  }
  if (!opts.apply) {
    lines.push("DRY RUN restore. Add --apply --yes to write.");
    return { exitCode: 0, lines };
  }
  if (!opts.yes) throw new RefusedError("--apply needs --yes as well");
  let failed = 0;
  for (const e of entries) {
    if (e.secondaryChanged) {
      const r = await io.setSecondaryLocales(e.profileId, e.secondaryBefore);
      if (!r.ok) { failed++; lines.push(`FAILED ${e.profileCode} secondary_locales: ${r.error ?? "unknown"}`); }
    }
    for (const [key, v] of Object.entries(e.hero) as Array<[HeroKey, { before: unknown }]>) {
      const before = v.before && typeof v.before === "object" && !Array.isArray(v.before) ? (v.before as Record<string, string>) : null;
      const r = await io.setHeroMap(e.profileId, key, before);
      if (!r.ok) { failed++; lines.push(`FAILED ${e.profileCode} ${key}: ${r.error ?? "unknown"}`); }
    }
  }
  lines.push(failed ? `${failed} restore write(s) failed` : "Restored.");
  return { exitCode: failed ? 1 : 0, lines };
}
