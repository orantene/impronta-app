/**
 * TUL-73: pure guards, validation, diff and runner for the guarded "load
 * Jorgelina's 7 approved booking clauses" script. No database client and no
 * secrets: every read and write goes through the injected `Io`, so the tests
 * drive it with a fake and nothing here can reach production on its own.
 *
 * What apply does: ONE new immutable policy version (N+1) carrying the clauses,
 * with the facts and answers of the current version untouched. It never edits a
 * version row. The three guards below are copied from `publish-plan.ts`
 * (PR #2666, chore/tul-73b-publish-jorgelina-draft), which is not on this
 * branch's base; same values, same wording.
 */

import type { PolicyAnswers } from "../../src/lib/talent-policies/answers";
import {
  CUSTOM_CLAUSES_MAX_ITEMS,
  CUSTOM_CLAUSE_MAX_CHARS,
  sameCustomClauses,
  validateCustomClauses,
  type CustomClauses,
} from "../../src/lib/talent-policies/custom-clauses";
import type { PolicyFacts } from "../../src/lib/talent-policies/facts";
import { canonicalJson, policyContentHash } from "../../src/lib/talent-policies/hash";

export const ALLOWED_PROFILE_CODE = "TAL-93938";
export const ALLOWED_SITE_SLUG = "book-jorgelina";
/** The QA talent and its site. Never a target. */
export const FORBIDDEN_PROFILE_CODES: readonly string[] = ["TAL-93900"];
export const FORBIDDEN_SITE_SLUGS: readonly string[] = ["jorg-beauty-qa"];
/** The approved list is exactly seven lines per language. */
export const APPROVED_LINES_PER_LANGUAGE = 7;

// ---------------------------------------------------------------- types

export interface CurrentPolicy {
  version: number;
  contentHash: string;
  answers: PolicyAnswers;
  facts: unknown;
  customClauses: CustomClauses | null;
}

export interface Snapshot {
  profile: { id: string; profile_code: string };
  /** The slug of her site row; null when she has none. */
  siteSlug: string | null;
  /** The latest policy version, or null when none is published. */
  current: CurrentPolicy | null;
}

export type PublishOutcome =
  | { ok: true; unchanged: boolean; version: number; contentHash: string }
  | { ok: false; reason: string };

export interface Io {
  /** `null` when the profile does not exist. */
  load(profileCode: string): Promise<Snapshot | null>;
  /** The facts the app would stamp right now (`loadPolicyFacts`); null when unavailable. */
  liveFacts(profileId: string): Promise<unknown | null>;
  /** One stored version, read-only (to prove the old row is untouched). */
  readVersion(profileId: string, version: number): Promise<{ contentHash: string; customClauses: CustomClauses | null } | null>;
  /** The app's own `publishPolicy` (store.ts). Creates version N+1; never edits a row. */
  publish(input: { profileId: string; answers: PolicyAnswers; customClauses: CustomClauses }): Promise<PublishOutcome>;
  log(line: string): void;
}

export interface Options { profileCode: string; apply: boolean; yes: boolean }

export class RefusedError extends Error {}

// ---------------------------------------------------------------- guards

export function parseArgs(argv: readonly string[]): Options {
  let profileCode = ALLOWED_PROFILE_CODE;
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--profile") { profileCode = (argv[++i] ?? "").trim(); continue; }
    if (a.startsWith("--profile=")) { profileCode = a.slice("--profile=".length).trim(); continue; }
    if (a !== "--apply" && a !== "--yes") throw new RefusedError(`unknown argument ${a}`);
    flags.add(a);
  }
  return { profileCode, apply: flags.has("--apply"), yes: flags.has("--yes") };
}

/** Writing needs BOTH flags; either alone is refused. */
export function assertMode(o: Options): void {
  if (o.yes && !o.apply) throw new RefusedError("--yes without --apply does nothing; refusing");
  if (o.apply && !o.yes) throw new RefusedError("--apply needs --yes as well (dry run is the default)");
}

export function assertProfileCode(code: string): void {
  if (FORBIDDEN_PROFILE_CODES.includes(code)) throw new RefusedError(`refusing ${code}: the QA talent is never a target`);
  if (code !== ALLOWED_PROFILE_CODE) throw new RefusedError(`refusing ${code}: only ${ALLOWED_PROFILE_CODE} is allowed`);
}

export function assertSiteSlug(slug: string | null | undefined): void {
  if (slug && FORBIDDEN_SITE_SLUGS.includes(slug)) throw new RefusedError(`refusing site ${slug}: the QA site is never a target`);
  if (slug !== ALLOWED_SITE_SLUG) throw new RefusedError(`refusing: resolved site slug is ${JSON.stringify(slug)}, expected ${ALLOWED_SITE_SLUG}`);
}

// ---------------------------------------------------------------- the approved text

/**
 * The clauses exactly as approved, from the JSON file's parsed value. The text is
 * never altered: a line that validation would trim, or that has an em dash, is
 * refused rather than fixed. Same limits as the feature (20 lines, 400 chars).
 */
export function approvedClauses(raw: unknown): CustomClauses {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o || !Array.isArray(o.es) || !Array.isArray(o.en)) throw new RefusedError("clauses file must be { es: string[], en: string[] }");
  const lists = { es: o.es as unknown[], en: o.en as unknown[] };
  for (const lang of ["es", "en"] as const) {
    for (const [i, l] of lists[lang].entries()) {
      if (typeof l !== "string") throw new RefusedError(`${lang}[${i}] is not a string`);
      if (l !== l.trim() || l.length === 0) throw new RefusedError(`${lang}[${i}] is empty or has stray whitespace; the text is never altered`);
      if (l.includes("—")) throw new RefusedError(`${lang}[${i}] contains an em dash`);
    }
    if (lists[lang].length !== APPROVED_LINES_PER_LANGUAGE) {
      throw new RefusedError(`${lang} has ${lists[lang].length} lines, expected ${APPROVED_LINES_PER_LANGUAGE}`);
    }
  }
  const checked = validateCustomClauses({ es: lists.es as string[], en: lists.en as string[] });
  if (!checked.ok) {
    throw new RefusedError(
      checked.error === "too_many"
        ? `more than ${CUSTOM_CLAUSES_MAX_ITEMS} lines in a language`
        : `a line is longer than ${CUSTOM_CLAUSE_MAX_CHARS} characters`,
    );
  }
  if (!checked.value) throw new RefusedError("no clauses");
  return checked.value;
}

// ---------------------------------------------------------------- runner

export interface RunResult { exitCode: number; status: "dry-run" | "no-op" | "applied" | "refused" | "failed" }

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const show = (c: CustomClauses | null) =>
  c === null ? ["  (null)"] : (["es", "en"] as const).flatMap((l) => c[l].map((t, i) => `  ${l}[${i + 1}] ${t}`));

export async function run(argv: readonly string[], rawClauses: unknown, io: Io): Promise<RunResult> {
  const { log } = io;
  const refuse = (m: string): RunResult => { log(`REFUSED: ${m}`); return { exitCode: 2, status: "refused" }; };
  let o: Options;
  let clauses: CustomClauses;
  try {
    o = parseArgs(argv);
    assertMode(o);
    assertProfileCode(o.profileCode);
    clauses = approvedClauses(rawClauses);
  } catch (e) {
    if (e instanceof RefusedError) return refuse(e.message);
    throw e;
  }

  const before = await io.load(o.profileCode);
  if (!before) return refuse(`profile ${o.profileCode} not found`);
  try {
    assertProfileCode(before.profile.profile_code);
    assertSiteSlug(before.siteSlug);
  } catch (e) {
    if (e instanceof RefusedError) return refuse(e.message);
    throw e;
  }
  const cur = before.current;
  log(`Target: ${before.profile.profile_code} / ${before.siteSlug}`);
  log(cur ? `Current policy version: ${cur.version} (hash ${cur.contentHash.slice(0, 12)})` : "Current policy version: none published");
  log("custom_clauses now:");
  show(cur?.customClauses ?? null).forEach(log);
  log(`custom_clauses after (${clauses.es.length} ES + ${clauses.en.length} EN):`);
  show(clauses).forEach(log);

  if (!cur) return refuse("no published policy version exists; publish her generated policy first (this script only adds clauses to an existing version's facts and answers)");
  if (sameCustomClauses(cur.customClauses, clauses)) {
    log(`Nothing to do: version ${cur.version} already has exactly these clauses.`);
    return { exitCode: 0, status: "no-op" };
  }
  const live = await io.liveFacts(before.profile.id);
  if (live === null) return refuse("could not read the live policy facts");
  if (!same(live, cur.facts)) {
    return refuse("the live facts differ from the current version's facts; publishing now would also change them. Republish her generated policy first, then re-run");
  }

  log(`Would create version ${cur.version + 1}: same facts and answers as version ${cur.version}, plus the clauses.`);
  if (!o.apply) {
    log("DRY RUN: nothing written. Add --apply --yes to write one new policy version.");
    return { exitCode: 0, status: "dry-run" };
  }

  const res = await io.publish({ profileId: before.profile.id, answers: cur.answers, customClauses: clauses });
  if (!res.ok) { log(`FAILED: publish error: ${res.reason}`); return { exitCode: 1, status: "failed" }; }
  if (res.unchanged) { log("Nothing written: the store reports the content is already current."); return { exitCode: 0, status: "no-op" }; }

  const after = await io.load(o.profileCode);
  const old = await io.readVersion(before.profile.id, cur.version);
  const problems: string[] = [];
  const n = after?.current;
  if (!n) problems.push("could not re-read the current version");
  else {
    if (n.version !== cur.version + 1) problems.push(`current version is ${n.version}, expected ${cur.version + 1}`);
    if (!sameCustomClauses(n.customClauses, clauses)) problems.push("new version's clauses differ from the approved ones");
    if (!same(n.facts, cur.facts)) problems.push("facts changed");
    if (!same(n.answers, cur.answers)) problems.push("answers changed");
    const expected = policyContentHash(cur.facts as PolicyFacts, cur.answers, clauses);
    if (n.contentHash !== expected) problems.push("content hash is not the hash of (old facts, old answers, clauses)");
  }
  if (!old) problems.push(`version ${cur.version} is no longer readable`);
  else if (old.contentHash !== cur.contentHash || !sameCustomClauses(old.customClauses, cur.customClauses)) {
    problems.push(`version ${cur.version} was modified`);
  }
  if (problems.length > 0) {
    log("FAILED VERIFICATION:");
    problems.forEach((p) => log(`  ! ${p}`));
    return { exitCode: 1, status: "failed" };
  }
  log(`Verified: version ${res.version} has exactly the clauses; facts and answers are unchanged; version ${cur.version} is untouched.`);
  return { exitCode: 0, status: "applied" };
}
