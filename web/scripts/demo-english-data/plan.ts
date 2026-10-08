/**
 * TUL-207: pure guards, plan computation and runner for the demo English data
 * seed. No database client and no app imports: every read and write goes through
 * the injected `Io`, so the tests drive it with a fake and nothing in here can
 * reach production by itself.
 *
 * What it does: for the allow-listed Spanish-primary DEMO talents, adds the `en`
 * key to the i18n maps of their data rows so the `/en` pages stop showing Spanish:
 *   talent_faq_items   question_i18n, answer_i18n
 *   talent_offerings   title_i18n, description_i18n, category_i18n
 *
 * What it never does: overwrite a non-empty `en`, touch `es`, change any other
 * column, touch a profile that is not on the allow-list and flagged demo, or
 * write without `--apply --yes`.
 */

import { CONTENT as DEFAULT_CONTENT, type ProfileContent } from "./content";
import { ALLOWED_TARGETS, FORBIDDEN_PROFILE_CODES, FORBIDDEN_SITE_SLUGS, type DemoTarget } from "./targets";

// ---------------------------------------------------------------- types

export type I18nMap = Record<string, string>;

export interface ProfileRow { id: string; profile_code: string; is_demo: boolean | null }

export interface OfferingRow {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  title_i18n: unknown;
  description_i18n: unknown;
  category_i18n: unknown;
}

export interface FaqRow {
  id: string;
  question: string | null;
  answer: string | null;
  question_i18n: unknown;
  answer_i18n: unknown;
}

export type Table = "talent_offerings" | "talent_faq_items";
export type Column = "title_i18n" | "description_i18n" | "category_i18n" | "question_i18n" | "answer_i18n";

export interface Io {
  findProfile(profileCode: string): Promise<ProfileRow | null>;
  findSiteSlug(profileId: string): Promise<string | null>;
  listOfferings(profileId: string): Promise<OfferingRow[]>;
  listFaq(profileId: string): Promise<FaqRow[]>;
  /** LIVE. Writes only the given i18n columns of one row of this profile. */
  updateRow(input: { table: Table; profileId: string; id: string; patch: Partial<Record<Column, I18nMap>> }): Promise<{ ok: boolean; error?: string }>;
  /** Writes the pre-change values to a JSON file and returns its path. */
  writeBackup(data: unknown): string;
}

export interface Options { apply: boolean; yes: boolean; only: string[] }

export interface FieldPlan {
  table: Table;
  id: string;
  column: Column;
  es: string;
  en: string;
  /** Old value of the whole column, for the backup. */
  before: I18nMap;
  after: I18nMap;
}

export type Line =
  | { kind: "add"; table: Table; id: string; field: Column; es: string; en: string }
  | { kind: "skip"; table: Table; id: string; field: Column; reason: string }
  | { kind: "unmatched"; table: Table; id: string; field: string; es: string; reason: string };

export interface ProfilePlan {
  profileCode: string;
  profileId: string;
  siteSlug: string;
  lines: Line[];
  writes: FieldPlan[];
  unmatchedContent: string[];
  needsContent: string[];
  /** Full pre-change rows, kept for the backup and the post-write verification. */
  offeringsBefore: OfferingRow[];
  faqBefore: FaqRow[];
}

export class RefusedError extends Error {}

// ---------------------------------------------------------------- guards

export function parseArgs(argv: readonly string[]): Options {
  const flags = new Set<string>();
  const only: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--only") { only.push(...(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean)); continue; }
    if (a.startsWith("--only=")) { only.push(...a.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)); continue; }
    if (a !== "--apply" && a !== "--yes") throw new RefusedError(`unknown argument ${a}`);
    flags.add(a);
  }
  const apply = flags.has("--apply");
  const yes = flags.has("--yes");
  if (yes && !apply) throw new RefusedError("--yes without --apply does nothing; refusing");
  if (apply && !yes) throw new RefusedError("--apply needs --yes as well (dry run is the default)");
  return { apply, yes, only };
}

/** Static guard over the constants: the allow-list and the content can never include a forbidden target. */
export function assertStaticSafety(targets: readonly DemoTarget[], content: Readonly<Record<string, ProfileContent>>): void {
  for (const t of targets) {
    if (FORBIDDEN_PROFILE_CODES.includes(t.profileCode)) throw new RefusedError(`allow-list contains forbidden profile ${t.profileCode}`);
    if (FORBIDDEN_SITE_SLUGS.includes(t.siteSlug)) throw new RefusedError(`allow-list contains forbidden site ${t.siteSlug}`);
  }
  const allowed = new Set(targets.map((t) => t.profileCode));
  for (const code of Object.keys(content)) {
    if (FORBIDDEN_PROFILE_CODES.includes(code)) throw new RefusedError(`content has an entry for forbidden profile ${code}`);
    if (!allowed.has(code)) throw new RefusedError(`content has an entry for ${code}, which is not on the allow-list`);
  }
}

/** Per-profile guard on what the database returned. Throws RefusedError on any mismatch. */
export function assertResolvedProfile(target: DemoTarget, profile: ProfileRow, siteSlug: string | null, targets: readonly DemoTarget[] = ALLOWED_TARGETS): void {
  const code = target.profileCode;
  if (FORBIDDEN_PROFILE_CODES.includes(profile.profile_code) || FORBIDDEN_PROFILE_CODES.includes(code)) {
    throw new RefusedError(`refusing ${profile.profile_code}: a real or QA talent is never a target`);
  }
  if (profile.profile_code !== code) throw new RefusedError(`refusing: asked for ${code} but the database returned ${profile.profile_code}`);
  if (!targets.some((t) => t.profileCode === code && t.siteSlug === target.siteSlug)) {
    throw new RefusedError(`refusing ${code}: not on the allow-list`);
  }
  if (profile.is_demo !== true) throw new RefusedError(`refusing ${code}: not flagged is_demo (a real talent is never a target)`);
  if (siteSlug && FORBIDDEN_SITE_SLUGS.includes(siteSlug)) throw new RefusedError(`refusing site ${siteSlug}: never a target`);
  if (siteSlug !== target.siteSlug) {
    throw new RefusedError(`refusing ${code}: site slug is ${JSON.stringify(siteSlug)}, the allow-list expects ${target.siteSlug}`);
  }
}

// ---------------------------------------------------------------- helpers

const norm = (s: unknown): string => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").toLowerCase() : "");
const nonEmpty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const clip = (s: string) => (s.length > 90 ? `${s.slice(0, 87)}...` : s);

/** A stored i18n map as a clean string map, or null when the stored value is not a plain object. */
function readMap(v: unknown): I18nMap | null {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const out: I18nMap = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
    else return null;
  }
  return out;
}

/** Spanish text of a row field: the `es` key when present, else the plain column. */
function spanishOf(map: I18nMap, plain: string | null): string {
  return nonEmpty(map.es) ? map.es : (plain ?? "");
}

interface AddInput {
  profile: ProfilePlan;
  table: Table;
  id: string;
  column: Column;
  rawMap: unknown;
  plain: string | null;
  want: { es: string; en: string };
  /** Extra confirmation that the row's Spanish equals the content's Spanish (text fields). */
  requireEsMatch: boolean;
}

/** Plans one `en` addition. Returns true when the Spanish text matched the content (used or skipped for `en exists`). */
function planAdd(a: AddInput): boolean {
  const map = readMap(a.rawMap);
  if (map === null) {
    a.profile.lines.push({ kind: "unmatched", table: a.table, id: a.id, field: a.column, es: clip(a.plain ?? ""), reason: "stored value is not a plain text map; left alone" });
    return false;
  }
  const es = spanishOf(map, a.plain);
  if (a.requireEsMatch && norm(es) !== norm(a.want.es)) {
    a.profile.lines.push({ kind: "unmatched", table: a.table, id: a.id, field: a.column, es: clip(es), reason: "Spanish text differs from the reviewed source; needs content" });
    return false;
  }
  if (nonEmpty(map.en)) {
    a.profile.lines.push({ kind: "skip", table: a.table, id: a.id, field: a.column, reason: "en exists" });
    return true;
  }
  const after: I18nMap = { ...map, en: a.want.en };
  a.profile.lines.push({ kind: "add", table: a.table, id: a.id, field: a.column, es: clip(es), en: clip(a.want.en) });
  a.profile.writes.push({ table: a.table, id: a.id, column: a.column, es, en: a.want.en, before: map, after });
  return true;
}

// ---------------------------------------------------------------- plan

export function planProfile(
  target: DemoTarget,
  profile: ProfileRow,
  offerings: OfferingRow[],
  faq: FaqRow[],
  content: ProfileContent | undefined,
): ProfilePlan {
  const plan: ProfilePlan = {
    profileCode: target.profileCode,
    profileId: profile.id,
    siteSlug: target.siteSlug,
    lines: [],
    writes: [],
    unmatchedContent: [],
    needsContent: content ? [...content.needsContent] : ["no content entry for this profile"],
    offeringsBefore: offerings,
    faqBefore: faq,
  };
  if (!content) return plan;

  const usedService = new Set<number>();
  const usedCategory = new Set<number>();
  const usedFaq = new Set<number>();

  for (const row of offerings) {
    const titleMap = readMap(row.title_i18n) ?? {};
    const titleEs = spanishOf(titleMap, row.title);
    const si = content.services.findIndex((s) => norm(s.title.es) === norm(titleEs));
    if (si >= 0) {
      const svc = content.services[si]!;
      usedService.add(si);
      planAdd({ profile: plan, table: "talent_offerings", id: row.id, column: "title_i18n", rawMap: row.title_i18n, plain: row.title, want: svc.title, requireEsMatch: false });
      const descEs = spanishOf(readMap(row.description_i18n) ?? {}, row.description);
      if (svc.description && nonEmpty(descEs)) {
        planAdd({ profile: plan, table: "talent_offerings", id: row.id, column: "description_i18n", rawMap: row.description_i18n, plain: row.description, want: svc.description, requireEsMatch: true });
      }
    } else if (nonEmpty(titleEs)) {
      plan.lines.push({ kind: "unmatched", table: "talent_offerings", id: row.id, field: "title_i18n", es: clip(titleEs), reason: "no content entry for this Spanish title" });
    }

    const catEs = spanishOf(readMap(row.category_i18n) ?? {}, row.category);
    if (nonEmpty(catEs)) {
      const ci = content.categories.findIndex((c) => norm(c.es) === norm(catEs));
      if (ci >= 0) {
        usedCategory.add(ci);
        planAdd({ profile: plan, table: "talent_offerings", id: row.id, column: "category_i18n", rawMap: row.category_i18n, plain: row.category, want: content.categories[ci]!, requireEsMatch: false });
      } else {
        plan.lines.push({ kind: "unmatched", table: "talent_offerings", id: row.id, field: "category_i18n", es: clip(catEs), reason: "no content entry for this Spanish category label" });
      }
    }
  }

  for (const row of faq) {
    const qEs = spanishOf(readMap(row.question_i18n) ?? {}, row.question);
    const aEs = spanishOf(readMap(row.answer_i18n) ?? {}, row.answer);
    const candidates = content.faq.map((f, i) => ({ f, i })).filter(({ f }) => norm(f.question.es) === norm(qEs));
    if (candidates.length === 0) {
      if (nonEmpty(qEs)) plan.lines.push({ kind: "unmatched", table: "talent_faq_items", id: row.id, field: "question_i18n", es: clip(qEs), reason: "no content entry for this Spanish question" });
      continue;
    }
    const pick = candidates.find(({ f }) => norm(f.answer.es) === norm(aEs)) ?? candidates[0]!;
    usedFaq.add(pick.i);
    planAdd({ profile: plan, table: "talent_faq_items", id: row.id, column: "question_i18n", rawMap: row.question_i18n, plain: row.question, want: pick.f.question, requireEsMatch: false });
    if (nonEmpty(aEs)) {
      planAdd({ profile: plan, table: "talent_faq_items", id: row.id, column: "answer_i18n", rawMap: row.answer_i18n, plain: row.answer, want: pick.f.answer, requireEsMatch: true });
    }
  }

  content.services.forEach((s, i) => { if (!usedService.has(i)) plan.unmatchedContent.push(`service "${clip(s.title.es)}"`); });
  content.categories.forEach((c, i) => { if (!usedCategory.has(i)) plan.unmatchedContent.push(`category "${c.es}"`); });
  content.faq.forEach((f, i) => { if (!usedFaq.has(i)) plan.unmatchedContent.push(`faq "${clip(f.question.es)}"`); });
  return plan;
}

/** The patches to send, grouped per row. Only the five i18n columns can ever appear in one. */
export function groupWrites(plan: ProfilePlan): Array<{ table: Table; id: string; patch: Partial<Record<Column, I18nMap>> }> {
  const byRow = new Map<string, { table: Table; id: string; patch: Partial<Record<Column, I18nMap>> }>();
  for (const w of plan.writes) {
    const key = `${w.table}:${w.id}`;
    const entry = byRow.get(key) ?? { table: w.table, id: w.id, patch: {} };
    entry.patch[w.column] = w.after;
    byRow.set(key, entry);
  }
  return [...byRow.values()];
}

// ---------------------------------------------------------------- output

export function formatPlan(plan: ProfilePlan, hosts: readonly string[]): string[] {
  const out: string[] = [];
  out.push(`${plan.profileCode} slug=${plan.siteSlug} is_demo=true  (${hosts.join(", ")})`);
  for (const l of plan.lines) {
    if (l.kind === "add") out.push(`  ${l.table} ${l.id}: ${l.field}: ES "${l.es}" -> add EN "${l.en}"`);
    else if (l.kind === "skip") out.push(`  ${l.table} ${l.id}: ${l.field}: skip (${l.reason})`);
    else out.push(`  ${l.table} ${l.id}: ${l.field}: unmatched ES "${l.es}" (${l.reason})`);
  }
  if (plan.lines.length === 0) out.push("  (no rows found for this profile)");
  for (const u of plan.unmatchedContent) out.push(`  unmatched content entry (no live row): ${u}`);
  for (const n of plan.needsContent) out.push(`  needs content: ${n}`);
  return out;
}

// ---------------------------------------------------------------- verification

/** Re-reads the touched profile and checks every planned `en` landed and nothing else moved. */
export async function verifyProfile(plan: ProfilePlan, io: Io): Promise<string[]> {
  const problems: string[] = [];
  const [offerings, faq] = await Promise.all([io.listOfferings(plan.profileId), io.listFaq(plan.profileId)]);
  const nowOff = new Map(offerings.map((r) => [r.id, r]));
  const nowFaq = new Map(faq.map((r) => [r.id, r]));
  const wantByRow = new Map<string, FieldPlan[]>();
  for (const w of plan.writes) wantByRow.set(`${w.table}:${w.id}`, [...(wantByRow.get(`${w.table}:${w.id}`) ?? []), w]);

  for (const before of plan.offeringsBefore) {
    const now = nowOff.get(before.id);
    if (!now) { problems.push(`talent_offerings ${before.id}: row disappeared`); continue; }
    const planned = wantByRow.get(`talent_offerings:${before.id}`) ?? [];
    for (const col of ["title", "description", "category"] as const) {
      if (now[col] !== before[col]) problems.push(`talent_offerings ${before.id}: ${col} changed`);
    }
    for (const col of ["title_i18n", "description_i18n", "category_i18n"] as const) {
      checkMap(problems, `talent_offerings ${before.id}`, col, before[col], now[col], planned.find((p) => p.column === col));
    }
  }
  for (const before of plan.faqBefore) {
    const now = nowFaq.get(before.id);
    if (!now) { problems.push(`talent_faq_items ${before.id}: row disappeared`); continue; }
    const planned = wantByRow.get(`talent_faq_items:${before.id}`) ?? [];
    for (const col of ["question", "answer"] as const) {
      if (now[col] !== before[col]) problems.push(`talent_faq_items ${before.id}: ${col} changed`);
    }
    for (const col of ["question_i18n", "answer_i18n"] as const) {
      checkMap(problems, `talent_faq_items ${before.id}`, col, before[col], now[col], planned.find((p) => p.column === col));
    }
  }
  return problems;
}

function checkMap(problems: string[], where: string, col: string, before: unknown, now: unknown, planned: FieldPlan | undefined): void {
  const b = readMap(before) ?? {};
  const n = readMap(now) ?? {};
  const expected: I18nMap = planned ? planned.after : b;
  if (JSON.stringify(sortKeys(n)) !== JSON.stringify(sortKeys(expected))) {
    problems.push(`${where}: ${col} is not what was planned`);
  }
  if ((b.es ?? "") !== (n.es ?? "")) problems.push(`${where}: ${col}.es changed`);
}

function sortKeys(m: I18nMap): Array<[string, string]> {
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
}

// ---------------------------------------------------------------- runner

export interface RunResult { exitCode: number; touchedProfiles: string[]; wroteRows: number; backupPath: string | null }

export async function run(
  argv: readonly string[],
  io: Io,
  log: (line: string) => void = (l) => console.log(l),
  opts: { targets?: readonly DemoTarget[]; content?: Readonly<Record<string, ProfileContent>> } = {},
): Promise<RunResult> {
  const targets = opts.targets ?? ALLOWED_TARGETS;
  const content = opts.content ?? DEFAULT_CONTENT;
  const none: RunResult = { exitCode: 0, touchedProfiles: [], wroteRows: 0, backupPath: null };
  let options: Options;
  try {
    options = parseArgs(argv);
    assertStaticSafety(targets, content);
    for (const code of options.only) {
      if (!targets.some((t) => t.profileCode === code)) throw new RefusedError(`--only ${code}: not on the allow-list`);
    }
  } catch (e) {
    if (e instanceof RefusedError) { log(`REFUSED: ${e.message}`); return { ...none, exitCode: 3 }; }
    throw e;
  }

  const selected = targets.filter((t) => options.only.length === 0 || options.only.includes(t.profileCode));
  log(options.apply ? "MODE: APPLY (writes happen after the backup)" : "MODE: DRY RUN (nothing is written)");

  // Phase 1: read and guard EVERYTHING before any write. One refusal aborts the whole run.
  const plans: Array<{ target: DemoTarget; plan: ProfilePlan }> = [];
  const notFound: string[] = [];
  try {
    for (const target of selected) {
      const profile = await io.findProfile(target.profileCode);
      if (!profile) { notFound.push(target.profileCode); continue; }
      const siteSlug = await io.findSiteSlug(profile.id);
      assertResolvedProfile(target, profile, siteSlug, targets);
      const [offerings, faq] = await Promise.all([io.listOfferings(profile.id), io.listFaq(profile.id)]);
      plans.push({ target, plan: planProfile(target, profile, offerings, faq, content[target.profileCode]) });
    }
  } catch (e) {
    if (e instanceof RefusedError) { log(`REFUSED: ${e.message}`); log("Nothing was written."); return { ...none, exitCode: 3 }; }
    throw e;
  }

  let adds = 0; let skips = 0; let unmatched = 0; let unmatchedContent = 0; let needs = 0;
  for (const { target, plan } of plans) {
    for (const line of formatPlan(plan, target.hosts)) log(line);
    for (const l of plan.lines) { if (l.kind === "add") adds++; else if (l.kind === "skip") skips++; else unmatched++; }
    unmatchedContent += plan.unmatchedContent.length;
    needs += plan.needsContent.length;
  }
  for (const code of notFound) log(`${code}: not found in this database (skipped)`);
  const touched = plans.filter(({ plan }) => plan.writes.length > 0).map(({ plan }) => plan.profileCode);
  log("");
  log(`TOTALS: add=${adds} skip(en exists)=${skips} unmatched rows=${unmatched} unmatched content entries=${unmatchedContent} needs-content notes=${needs} profiles not found=${notFound.length}`);
  log(`Profiles that would be touched (${touched.length}): ${touched.length ? touched.join(", ") : "none"}`);

  if (!options.apply) {
    log("Dry run only. Re-run with --apply --yes to write.");
    return { ...none, touchedProfiles: touched };
  }
  if (touched.length === 0) { log("Nothing to write."); return none; }

  // Phase 2: backup everything that will change, then write, then verify.
  const touchedPlans = plans.filter(({ plan }) => plan.writes.length > 0).map(({ plan }) => plan);
  const backupPath = io.writeBackup({
    ticket: "TUL-207",
    createdAt: new Date().toISOString(),
    profiles: touchedPlans.map((p) => ({
      profileCode: p.profileCode,
      profileId: p.profileId,
      siteSlug: p.siteSlug,
      talent_offerings: p.offeringsBefore.filter((r) => p.writes.some((w) => w.table === "talent_offerings" && w.id === r.id)),
      talent_faq_items: p.faqBefore.filter((r) => p.writes.some((w) => w.table === "talent_faq_items" && w.id === r.id)),
    })),
  });
  log(`Backup of previous values: ${backupPath}`);

  let wrote = 0;
  const failures: string[] = [];
  for (const plan of touchedPlans) {
    for (const g of groupWrites(plan)) {
      const res = await io.updateRow({ table: g.table, profileId: plan.profileId, id: g.id, patch: g.patch });
      if (res.ok) wrote++;
      else failures.push(`${plan.profileCode} ${g.table} ${g.id}: ${res.error ?? "write failed"}`);
    }
  }
  const problems: string[] = [...failures];
  for (const plan of touchedPlans) problems.push(...(await verifyProfile(plan, io)).map((p) => `${plan.profileCode} ${p}`));
  if (problems.length > 0) {
    log("VERIFY FAILED:");
    for (const p of problems) log(`  ${p}`);
    log(`Restore from the backup: ${backupPath}`);
    return { exitCode: 1, touchedProfiles: touched, wroteRows: wrote, backupPath };
  }
  log(`Applied and verified: ${wrote} rows across ${touchedPlans.length} profiles.`);
  return { exitCode: 0, touchedProfiles: touched, wroteRows: wrote, backupPath };
}
