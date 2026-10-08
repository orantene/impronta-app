/**
 * TUL-15 Stage 5b layer B: the guards both scripts in this folder share.
 * Pure: no database client, no app imports. Every database read and write goes
 * through an injected `Io` in the script that uses these, so the tests drive it
 * with fakes and nothing in here can reach production by itself.
 *
 * The target is ONE talent: the QA twin TAL-93900 on the site slug
 * jorg-beauty-qa. The guard is the explicit allow-list of profile code, profile
 * id (printed, and pinned with --expect-profile-id when given) and site slug.
 * `is_test_account` is deliberately NOT a guard: a flag can be wrong, the
 * allow-list cannot.
 */

export const TARGET_PROFILE_CODE = "TAL-93900";
export const TARGET_SITE_SLUG = "jorg-beauty-qa";

/** Real or look-alike talents: never a target, whatever else a flag says. */
export const FORBIDDEN_PROFILE_CODES: readonly string[] = ["TAL-93938", "TAL-93901", "TAL-93939"];
export const FORBIDDEN_SITE_SLUGS: readonly string[] = ["book-jorgelina"];

export class RefusedError extends Error {}

export interface CliOptions {
  /** The profile code from --site (defaults to the target for a dry run). */
  site: string;
  apply: boolean;
  /** Path of a backup JSON to put back (dry run unless --apply). */
  restore: string | null;
  /** Optional pin: the resolved profile id must equal this. */
  expectProfileId: string | null;
  /** Ticker script only: do not publish even when the live site equals the draft. */
  noPublish: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses argv. Anything not listed is refused (so `--all`, `--yes`, `--profile`
 * and typos can never be silently ignored). `allowNoPublish` enables the ticker
 * script's extra flag.
 */
export function parseCli(argv: readonly string[], opts: { allowNoPublish?: boolean } = {}): CliOptions {
  let site: string | null = null;
  let apply = false;
  let restore: string | null = null;
  let expectProfileId: string | null = null;
  let noPublish = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--apply") { apply = true; continue; }
    if (a === "--no-publish" && opts.allowNoPublish) { noPublish = true; continue; }
    if (a === "--site") { site = (argv[++i] ?? "").trim(); continue; }
    if (a.startsWith("--site=")) { site = a.slice("--site=".length).trim(); continue; }
    if (a === "--restore") { restore = (argv[++i] ?? "").trim(); continue; }
    if (a.startsWith("--restore=")) { restore = a.slice("--restore=".length).trim(); continue; }
    if (a === "--expect-profile-id") { expectProfileId = (argv[++i] ?? "").trim(); continue; }
    if (a.startsWith("--expect-profile-id=")) { expectProfileId = a.slice("--expect-profile-id=".length).trim(); continue; }
    if (a === "--all") throw new RefusedError("--all is not supported: this script only ever touches one talent");
    throw new RefusedError(`unknown argument ${a}`);
  }
  if (restore !== null && restore === "") throw new RefusedError("--restore needs a backup file path");
  if (site !== null && site === "") throw new RefusedError("--site needs a profile code");
  if (expectProfileId !== null && !UUID_RE.test(expectProfileId)) throw new RefusedError("--expect-profile-id must be a profile uuid");
  if (apply && site === null) {
    throw new RefusedError(`--apply needs --site ${TARGET_PROFILE_CODE} explicitly (dry run is the default)`);
  }
  const resolvedSite = site ?? TARGET_PROFILE_CODE;
  assertProfileCode(resolvedSite);
  return { site: resolvedSite, apply, restore, expectProfileId, noPublish };
}

/** Only TAL-93900, and never a real talent or look-alike. */
export function assertProfileCode(code: string): void {
  if (FORBIDDEN_PROFILE_CODES.includes(code)) throw new RefusedError(`refusing ${code}: a real talent or look-alike is never a target`);
  if (code !== TARGET_PROFILE_CODE) throw new RefusedError(`refusing ${JSON.stringify(code)}: only ${TARGET_PROFILE_CODE} is allowed`);
}

/** What the database returned for the profile and its site, checked against the allow-list. */
export function assertResolvedTarget(
  profile: { id: string; profile_code: string },
  siteSlug: string | null | undefined,
  o: Pick<CliOptions, "expectProfileId">,
): void {
  assertProfileCode(profile.profile_code);
  if (!profile.id) throw new RefusedError("refusing: the profile has no id");
  if (o.expectProfileId && o.expectProfileId.toLowerCase() !== profile.id.toLowerCase()) {
    throw new RefusedError(`refusing: --expect-profile-id ${o.expectProfileId} but ${profile.profile_code} resolved to ${profile.id}`);
  }
  if (siteSlug && FORBIDDEN_SITE_SLUGS.includes(siteSlug)) throw new RefusedError(`refusing site ${siteSlug}: never a target`);
  if (siteSlug !== TARGET_SITE_SLUG) {
    throw new RefusedError(`refusing: resolved site slug is ${JSON.stringify(siteSlug ?? null)}, expected ${TARGET_SITE_SLUG}`);
  }
}

export function targetLine(profile: { id: string; profile_code: string }, siteSlug: string): string {
  return `Target: code=${profile.profile_code} id=${profile.id} site=${siteSlug}`;
}

/** Recursively key-sorted copy: jsonb returns keys in its own order, so compare THIS, never raw JSON. */
export function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = canonical((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

/** Key-order-insensitive deep equality. `undefined` and `null` are treated as the same "absent". */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));
}

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
