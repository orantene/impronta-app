/**
 * TUL-15 Stage 5b layer B, script 1: pure plan, guards and runner that add the
 * ENGLISH key to the i18n data of the TEST talent TAL-93900 (site jorg-beauty-qa)
 * so her English page stops showing Spanish photo captions, service categories
 * and service titles/descriptions. No database client and no app imports: every
 * read and write goes through the injected `Io`, so the tests drive it with a
 * fake and nothing in here can reach production by itself.
 *
 * Fields (the exact ones the editors and the public readers use):
 *   talent_offerings.title_i18n / description_i18n / category_i18n   (jsonb maps)
 *   media_assets.metadata.caption_i18n                              (jsonb map inside metadata;
 *                                                                    the Spanish caption is metadata.caption,
 *                                                                    see site-admin/media/photo-caption-edit.ts)
 *
 * What it never does: overwrite a non-empty `en`, touch `es`, any other key of
 * the metadata, any other column, any other talent; write without
 * `--apply --site TAL-93900`; write before a backup of every old value exists.
 */

import { CONTENT as DEFAULT_CONTENT, type Entry, type TargetContent } from "./content";
import {
  assertProfileCode,
  assertResolvedTarget,
  isObj,
  parseCli,
  RefusedError,
  sameJson,
  targetLine,
  TARGET_PROFILE_CODE,
  TARGET_SITE_SLUG,
  type CliOptions,
} from "./guards";

// ---------------------------------------------------------------- types

export type I18nMap = Record<string, string>;
export interface ProfileRow { id: string; profile_code: string }

export interface OfferingRow {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  title_i18n: unknown;
  description_i18n: unknown;
  category_i18n: unknown;
}

export interface PhotoRow { id: string; metadata: unknown }

export type Table = "talent_offerings" | "media_assets";
export type Field = "title_i18n" | "description_i18n" | "category_i18n" | "metadata.caption_i18n";

export const TABLE_OF: Readonly<Record<Field, Table>> = {
  title_i18n: "talent_offerings",
  description_i18n: "talent_offerings",
  category_i18n: "talent_offerings",
  "metadata.caption_i18n": "media_assets",
};

export interface Io {
  findProfile(profileCode: string): Promise<ProfileRow | null>;
  findSiteSlug(profileId: string): Promise<string | null>;
  listOfferings(profileId: string): Promise<OfferingRow[]>;
  /** Live (not deleted) media rows owned by the profile. */
  listPhotos(profileId: string): Promise<PhotoRow[]>;
  /**
   * LIVE. Sets ONE field of ONE row, keyed by row id AND profile id. For
   * `metadata.caption_i18n` only that key of the metadata moves (`null` removes
   * it); for the offering columns the whole column is set (`null` stores null).
   */
  setField(input: { table: Table; profileId: string; id: string; field: Field; value: unknown }): Promise<{ ok: boolean; error?: string }>;
  /** Writes a JSON backup and returns its path. */
  writeBackup(label: string, data: unknown): string;
  readBackup(path: string): unknown;
}

export interface FieldPlan {
  table: Table;
  id: string;
  field: Field;
  es: string;
  en: string;
  /** The whole old value of the field (null when it was absent). */
  before: unknown;
  after: I18nMap;
}

export type Line =
  | { kind: "add"; table: Table; id: string; field: Field; es: string; en: string }
  | { kind: "skip"; table: Table; id: string; field: Field; reason: string }
  | { kind: "needs-english"; table: Table; id: string; field: Field; es: string; reason: string };

export interface Plan {
  profile: ProfileRow;
  siteSlug: string;
  lines: Line[];
  writes: FieldPlan[];
  unusedContent: string[];
  offeringsBefore: OfferingRow[];
  photosBefore: PhotoRow[];
}

// ---------------------------------------------------------------- helpers

/** Trimmed, whitespace-collapsed, case and accent insensitive. */
export const norm = (s: unknown): string =>
  typeof s === "string" ? s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase() : "";
const nonEmpty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const clip = (s: string) => (s.length > 90 ? `${s.slice(0, 87)}...` : s);

/** A stored i18n map as a clean string map; {} when absent; null when it is not a plain text map. */
export function readMap(v: unknown): I18nMap | null {
  if (v === null || v === undefined) return {};
  if (!isObj(v)) return null;
  const out: I18nMap = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") out[k] = val;
    else return null;
  }
  return out;
}

/** Spanish text of a field: the `es` key when present, else the plain column. */
function spanishOf(map: I18nMap, plain: unknown): string {
  return nonEmpty(map.es) ? map.es : typeof plain === "string" ? plain : "";
}

const hasEs = (e: Entry, es: string): boolean => e.es.some((x) => norm(x) === norm(es));

/** The stored value of one field of a row. */
export function readField(field: Field, row: OfferingRow | PhotoRow): unknown {
  if (field === "metadata.caption_i18n") {
    const m = (row as PhotoRow).metadata;
    return isObj(m) ? m.caption_i18n : undefined;
  }
  return (row as OfferingRow)[field];
}

/** The rest of a photo's metadata, with caption_i18n removed. */
function metadataRest(m: unknown): Record<string, unknown> {
  if (!isObj(m)) return {};
  const rest: Record<string, unknown> = { ...m };
  delete rest.caption_i18n;
  return rest;
}

interface AddInput {
  plan: Plan;
  table: Table;
  id: string;
  field: Field;
  rawMap: unknown;
  es: string;
  /** The English to add, or null when the content has none for this Spanish. */
  en: string | null;
}

/** Plans one `en` addition, a skip (`en` already there) or a "needs English" line. */
function planField(a: AddInput): void {
  const map = readMap(a.rawMap);
  if (map === null) {
    a.plan.lines.push({ kind: "needs-english", table: a.table, id: a.id, field: a.field, es: clip(a.es), reason: "stored value is not a plain text map; left alone" });
    return;
  }
  if (nonEmpty(map.en)) {
    a.plan.lines.push({ kind: "skip", table: a.table, id: a.id, field: a.field, reason: "en exists" });
    return;
  }
  if (a.en === null) {
    a.plan.lines.push({ kind: "needs-english", table: a.table, id: a.id, field: a.field, es: clip(a.es), reason: "no English for this Spanish in the content file" });
    return;
  }
  const after: I18nMap = { ...map, en: a.en };
  a.plan.lines.push({ kind: "add", table: a.table, id: a.id, field: a.field, es: clip(a.es), en: clip(a.en) });
  a.plan.writes.push({ table: a.table, id: a.id, field: a.field, es: a.es, en: a.en, before: a.rawMap ?? null, after });
}

// ---------------------------------------------------------------- plan

export function planTarget(
  profile: ProfileRow,
  siteSlug: string,
  offerings: OfferingRow[],
  photos: PhotoRow[],
  content: TargetContent,
): Plan {
  const plan: Plan = { profile, siteSlug, lines: [], writes: [], unusedContent: [], offeringsBefore: offerings, photosBefore: photos };
  const usedService = new Set<number>();
  const usedCategory = new Set<number>();
  const usedCaption = new Set<number>();

  for (const row of offerings) {
    const titleMap = readMap(row.title_i18n) ?? {};
    const titleEs = spanishOf(titleMap, row.title);
    const si = nonEmpty(titleEs) ? content.services.findIndex((s) => hasEs(s.title, titleEs)) : -1;
    if (si >= 0) usedService.add(si);
    const svc = si >= 0 ? content.services[si]! : null;
    if (nonEmpty(titleEs)) {
      planField({ plan, table: "talent_offerings", id: row.id, field: "title_i18n", rawMap: row.title_i18n, es: titleEs, en: svc ? svc.title.en : null });
    }
    const descEs = spanishOf(readMap(row.description_i18n) ?? {}, row.description);
    if (nonEmpty(descEs)) {
      // The description is filled only when ITS Spanish equals the reviewed Spanish: a rewritten description is reported, never overwritten.
      const en = svc?.description && hasEs(svc.description, descEs) ? svc.description.en : null;
      planField({ plan, table: "talent_offerings", id: row.id, field: "description_i18n", rawMap: row.description_i18n, es: descEs, en });
    }
    const catEs = spanishOf(readMap(row.category_i18n) ?? {}, row.category);
    if (nonEmpty(catEs)) {
      const ci = content.categories.findIndex((c) => hasEs(c, catEs));
      if (ci >= 0) usedCategory.add(ci);
      planField({ plan, table: "talent_offerings", id: row.id, field: "category_i18n", rawMap: row.category_i18n, es: catEs, en: ci >= 0 ? content.categories[ci]!.en : null });
    }
  }

  for (const row of photos) {
    if (!isObj(row.metadata)) continue;
    const capMap = readMap(row.metadata.caption_i18n) ?? {};
    const es = spanishOf(capMap, row.metadata.caption);
    if (!nonEmpty(es)) continue; // no caption: nothing to translate
    const ci = content.captions.findIndex((c) => hasEs(c, es));
    if (ci >= 0) usedCaption.add(ci);
    planField({ plan, table: "media_assets", id: row.id, field: "metadata.caption_i18n", rawMap: row.metadata.caption_i18n, es, en: ci >= 0 ? content.captions[ci]!.en : null });
  }

  content.services.forEach((s, i) => { if (!usedService.has(i)) plan.unusedContent.push(`service "${clip(s.title.es[0]!)}"`); });
  content.categories.forEach((c, i) => { if (!usedCategory.has(i)) plan.unusedContent.push(`category "${c.es[0]}"`); });
  content.captions.forEach((c, i) => { if (!usedCaption.has(i)) plan.unusedContent.push(`caption "${c.es[0]}"`); });
  return plan;
}

// ---------------------------------------------------------------- static content guard

/** The content must name the target slug and never carry a duplicate Spanish key within one list. */
export function assertContent(content: TargetContent): void {
  if (content.siteSlug !== TARGET_SITE_SLUG) throw new RefusedError(`content is for ${content.siteSlug}, expected ${TARGET_SITE_SLUG}`);
  const dup = (label: string, entries: readonly Entry[]) => {
    const seen = new Set<string>();
    for (const e of entries) {
      if (!e.en.trim()) throw new RefusedError(`${label}: empty English for ${e.es[0]}`);
      for (const k of e.es.map(norm)) {
        if (seen.has(k)) throw new RefusedError(`${label}: Spanish "${k}" appears twice`);
        seen.add(k);
      }
    }
  };
  dup("categories", content.categories);
  dup("captions", content.captions);
  dup("service titles", content.services.map((s) => s.title));
}

// ---------------------------------------------------------------- output

export function formatPlan(plan: Plan): string[] {
  const out: string[] = [];
  out.push(targetLine(plan.profile, plan.siteSlug));
  for (const l of plan.lines) {
    if (l.kind === "add") out.push(`  ${l.table} ${l.id}: ${l.field}: ES "${l.es}" -> add EN "${l.en}"`);
    else if (l.kind === "skip") out.push(`  ${l.table} ${l.id}: ${l.field}: skip (${l.reason})`);
    else out.push(`  ${l.table} ${l.id}: ${l.field}: NEEDS ENGLISH, ES "${l.es}" (${l.reason})`);
  }
  if (plan.lines.length === 0) out.push("  (no rows with text found for this profile)");
  for (const u of plan.unusedContent) out.push(`  unused content entry (no live row has this Spanish): ${u}`);
  return out;
}

// ---------------------------------------------------------------- verification

/** Re-reads the profile and checks every planned `en` landed and nothing else moved. Key-ORDER-insensitive. */
export async function verifyPlan(plan: Plan, io: Io): Promise<string[]> {
  const problems: string[] = [];
  const [offerings, photos] = await Promise.all([io.listOfferings(plan.profile.id), io.listPhotos(plan.profile.id)]);
  const nowOff = new Map(offerings.map((r) => [r.id, r]));
  const nowPho = new Map(photos.map((r) => [r.id, r]));
  const planned = (table: Table, id: string, field: Field) => plan.writes.find((w) => w.table === table && w.id === id && w.field === field);

  for (const before of plan.offeringsBefore) {
    const now = nowOff.get(before.id);
    if (!now) { problems.push(`talent_offerings ${before.id}: row disappeared`); continue; }
    for (const col of ["title", "description", "category"] as const) {
      if (now[col] !== before[col]) problems.push(`talent_offerings ${before.id}: ${col} changed`);
    }
    for (const f of ["title_i18n", "description_i18n", "category_i18n"] as const) {
      const w = planned("talent_offerings", before.id, f);
      const expected = w ? w.after : before[f];
      if (!sameJson(now[f], expected)) problems.push(`talent_offerings ${before.id}: ${f} is not what was planned`);
      const nowMap = readMap(now[f]) ?? {};
      const beforeMap = readMap(before[f]) ?? {};
      if ((beforeMap.es ?? "") !== (nowMap.es ?? "")) problems.push(`talent_offerings ${before.id}: ${f}.es changed`);
    }
  }
  for (const before of plan.photosBefore) {
    const now = nowPho.get(before.id);
    if (!now) { problems.push(`media_assets ${before.id}: row disappeared`); continue; }
    if (!sameJson(metadataRest(before.metadata), metadataRest(now.metadata))) problems.push(`media_assets ${before.id}: metadata outside caption_i18n changed`);
    const w = planned("media_assets", before.id, "metadata.caption_i18n");
    const expected = w ? w.after : readField("metadata.caption_i18n", before);
    if (!sameJson(readField("metadata.caption_i18n", now), expected)) problems.push(`media_assets ${before.id}: metadata.caption_i18n is not what was planned`);
  }
  return problems;
}

// ---------------------------------------------------------------- backup shape

export interface BackupField {
  table: Table;
  id: string;
  profileId: string;
  field: Field;
  /** The old value of the whole field (null when absent). */
  before: unknown;
  /** What this script wrote. */
  after: unknown;
}

export interface Backup {
  ticket: "TUL-15";
  kind: "en-content-fill";
  label: string;
  createdAt: string;
  profile: { code: string; id: string; siteSlug: string };
  fields: BackupField[];
}

const FIELDS = new Set<string>(Object.keys(TABLE_OF));

/** Strict parse of a backup file. Throws RefusedError on anything unexpected. */
export function parseBackup(raw: unknown): Backup {
  if (!isObj(raw) || raw.kind !== "en-content-fill" || !isObj(raw.profile) || !Array.isArray(raw.fields)) {
    throw new RefusedError("not an en-content-fill backup file");
  }
  const p = raw.profile;
  if (typeof p.code !== "string" || typeof p.id !== "string" || typeof p.siteSlug !== "string") throw new RefusedError("backup has no profile identity");
  const fields: BackupField[] = [];
  for (const f of raw.fields) {
    if (!isObj(f) || typeof f.id !== "string" || typeof f.profileId !== "string" || typeof f.field !== "string" || !FIELDS.has(f.field) || typeof f.table !== "string") {
      throw new RefusedError("backup has a malformed field entry");
    }
    const field = f.field as Field;
    if (TABLE_OF[field] !== f.table) throw new RefusedError(`backup field ${field} is not in table ${String(f.table)}`);
    fields.push({ table: f.table as Table, id: f.id, profileId: f.profileId, field, before: f.before ?? null, after: f.after ?? null });
  }
  return {
    ticket: "TUL-15",
    kind: "en-content-fill",
    label: typeof raw.label === "string" ? raw.label : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    profile: { code: p.code, id: p.id, siteSlug: p.siteSlug },
    fields,
  };
}

// ---------------------------------------------------------------- runner

export interface RunResult { exitCode: number; wrote: number; backupPath: string | null; mode: "dry-run" | "apply" | "restore-dry-run" | "restore" | "refused" }

type Log = (line: string) => void;
const refuse = (log: Log, msg: string): RunResult => {
  log(`REFUSED: ${msg}`);
  log("Nothing was written.");
  return { exitCode: 2, wrote: 0, backupPath: null, mode: "refused" };
};

async function resolveTarget(o: CliOptions, io: Io): Promise<{ profile: ProfileRow; siteSlug: string }> {
  const profile = await io.findProfile(o.site);
  if (!profile) throw new RefusedError(`profile ${o.site} not found in this database`);
  const siteSlug = await io.findSiteSlug(profile.id);
  assertResolvedTarget(profile, siteSlug, o);
  return { profile, siteSlug: siteSlug as string };
}

export async function run(
  argv: readonly string[],
  io: Io,
  log: Log = (l) => console.log(l),
  opts: { content?: TargetContent; now?: () => string } = {},
): Promise<RunResult> {
  const content = opts.content ?? DEFAULT_CONTENT;
  const now = opts.now ?? (() => new Date().toISOString());
  let o: CliOptions;
  try {
    o = parseCli(argv);
    assertProfileCode(o.site);
    assertContent(content);
  } catch (e) {
    if (e instanceof RefusedError) return refuse(log, e.message);
    throw e;
  }
  let target: { profile: ProfileRow; siteSlug: string };
  try {
    target = await resolveTarget(o, io);
  } catch (e) {
    if (e instanceof RefusedError) return refuse(log, e.message);
    throw e;
  }
  log(targetLine(target.profile, target.siteSlug));
  return o.restore ? runRestore(o, target, io, log, now) : runFill(o, target, content, io, log, now);
}

async function runFill(
  o: CliOptions,
  target: { profile: ProfileRow; siteSlug: string },
  content: TargetContent,
  io: Io,
  log: Log,
  now: () => string,
): Promise<RunResult> {
  log(o.apply ? "MODE: APPLY (backup first, then writes, then verify)" : "MODE: DRY RUN (nothing is written)");
  const [offerings, photos] = await Promise.all([io.listOfferings(target.profile.id), io.listPhotos(target.profile.id)]);
  const plan = planTarget(target.profile, target.siteSlug, offerings, photos, content);
  for (const line of formatPlan(plan).slice(1)) log(line);

  const adds = plan.lines.filter((l) => l.kind === "add").length;
  const skips = plan.lines.filter((l) => l.kind === "skip").length;
  const needs = plan.lines.filter((l) => l.kind === "needs-english").length;
  log("");
  log(`TOTALS: add=${adds} skip(en exists)=${skips} needs-english=${needs} unused content entries=${plan.unusedContent.length}`);
  if (!o.apply) {
    log(`Dry run only. To write: add --apply --site ${TARGET_PROFILE_CODE}.`);
    return { exitCode: 0, wrote: 0, backupPath: null, mode: "dry-run" };
  }
  if (plan.writes.length === 0) { log("Nothing to write."); return { exitCode: 0, wrote: 0, backupPath: null, mode: "apply" }; }

  const backup: Backup = {
    ticket: "TUL-15",
    kind: "en-content-fill",
    label: "fill",
    createdAt: now(),
    profile: { code: target.profile.profile_code, id: target.profile.id, siteSlug: target.siteSlug },
    fields: plan.writes.map((w) => ({ table: w.table, id: w.id, profileId: target.profile.id, field: w.field, before: w.before, after: w.after })),
  };
  const backupPath = io.writeBackup("fill", backup);
  log(`Backup of the old value of every field about to change (${backup.fields.length}): ${backupPath}`);
  log(`Undo with: --restore ${backupPath} --apply --site ${TARGET_PROFILE_CODE}`);

  let wrote = 0;
  const problems: string[] = [];
  for (const w of plan.writes) {
    const res = await io.setField({ table: w.table, profileId: target.profile.id, id: w.id, field: w.field, value: w.after });
    if (res.ok) wrote++;
    else problems.push(`${w.table} ${w.id} ${w.field}: ${res.error ?? "write failed"}`);
  }
  problems.push(...(await verifyPlan(plan, io)));
  if (problems.length > 0) {
    log("VERIFY FAILED:");
    for (const p of problems) log(`  ! ${p}`);
    log(`Restore from the backup: ${backupPath}`);
    return { exitCode: 1, wrote, backupPath, mode: "apply" };
  }
  log(`Applied and verified: ${wrote} fields.`);
  return { exitCode: 0, wrote, backupPath, mode: "apply" };
}

async function runRestore(
  o: CliOptions,
  target: { profile: ProfileRow; siteSlug: string },
  io: Io,
  log: Log,
  now: () => string,
): Promise<RunResult> {
  let backup: Backup;
  try {
    backup = parseBackup(io.readBackup(o.restore as string));
    assertProfileCode(backup.profile.code);
    if (backup.profile.id !== target.profile.id) throw new RefusedError(`backup is for profile ${backup.profile.id}, this database resolved ${target.profile.id}`);
    if (backup.profile.siteSlug !== target.siteSlug) throw new RefusedError(`backup is for site ${backup.profile.siteSlug}, resolved ${target.siteSlug}`);
    for (const f of backup.fields) {
      if (f.profileId !== target.profile.id) throw new RefusedError(`backup field ${f.table} ${f.id} belongs to another profile`);
    }
  } catch (e) {
    if (e instanceof RefusedError) return refuse(log, e.message);
    throw e;
  }
  log(o.apply ? "MODE: RESTORE (apply)" : "MODE: RESTORE DRY RUN (nothing is written)");
  const [offerings, photos] = await Promise.all([io.listOfferings(target.profile.id), io.listPhotos(target.profile.id)]);
  const offById = new Map(offerings.map((r) => [r.id, r]));
  const phoById = new Map(photos.map((r) => [r.id, r]));

  const toRestore: Array<{ f: BackupField; current: unknown }> = [];
  let skipped = 0;
  for (const f of backup.fields) {
    const row = f.table === "talent_offerings" ? offById.get(f.id) : phoById.get(f.id);
    if (!row) { log(`  ${f.table} ${f.id}: ${f.field}: row not found; skipped`); skipped++; continue; }
    const current = readField(f.field, row);
    if (sameJson(current, f.before)) { log(`  ${f.table} ${f.id}: ${f.field}: already at the backed-up value; skip`); continue; }
    if (!sameJson(current, f.after)) { log(`  ${f.table} ${f.id}: ${f.field}: changed since this script wrote it; NOT restored`); skipped++; continue; }
    log(`  ${f.table} ${f.id}: ${f.field}: restore ${JSON.stringify(f.after)} -> ${JSON.stringify(f.before)}`);
    toRestore.push({ f, current });
  }
  log("");
  log(`TOTALS: restore=${toRestore.length} skipped(changed or missing)=${skipped}`);
  if (!o.apply) {
    log(`Dry run only. To restore: add --apply --site ${TARGET_PROFILE_CODE}.`);
    return { exitCode: 0, wrote: 0, backupPath: null, mode: "restore-dry-run" };
  }
  if (toRestore.length === 0) { log("Nothing to restore."); return { exitCode: skipped > 0 ? 1 : 0, wrote: 0, backupPath: null, mode: "restore" }; }

  const undo: Backup = {
    ticket: "TUL-15",
    kind: "en-content-fill",
    label: "restore-undo",
    createdAt: now(),
    profile: backup.profile,
    fields: toRestore.map(({ f, current }) => ({ table: f.table, id: f.id, profileId: f.profileId, field: f.field, before: current ?? null, after: f.before })),
  };
  const backupPath = io.writeBackup("restore-undo", undo);
  log(`Backup of the values being replaced: ${backupPath}`);

  let wrote = 0;
  const problems: string[] = [];
  for (const { f } of toRestore) {
    const res = await io.setField({ table: f.table, profileId: target.profile.id, id: f.id, field: f.field, value: f.before });
    if (res.ok) wrote++;
    else problems.push(`${f.table} ${f.id} ${f.field}: ${res.error ?? "write failed"}`);
  }
  const [offAfter, phoAfter] = await Promise.all([io.listOfferings(target.profile.id), io.listPhotos(target.profile.id)]);
  const offNow = new Map(offAfter.map((r) => [r.id, r]));
  const phoNow = new Map(phoAfter.map((r) => [r.id, r]));
  for (const { f } of toRestore) {
    const row = f.table === "talent_offerings" ? offNow.get(f.id) : phoNow.get(f.id);
    if (!row) problems.push(`${f.table} ${f.id}: row disappeared`);
    else if (!sameJson(readField(f.field, row), f.before)) problems.push(`${f.table} ${f.id} ${f.field}: not back at the backed-up value`);
  }
  if (problems.length > 0) {
    log("VERIFY FAILED:");
    for (const p of problems) log(`  ! ${p}`);
    return { exitCode: 1, wrote, backupPath, mode: "restore" };
  }
  log(`Restored and verified: ${wrote} fields.${skipped > 0 ? ` ${skipped} skipped (see above).` : ""}`);
  return { exitCode: skipped > 0 ? 1 : 0, wrote, backupPath, mode: "restore" };
}
