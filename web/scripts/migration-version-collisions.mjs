/**
 * Migration version-collision detection, as pure functions so they can be
 * tested without a database.
 *
 * THE DEFECT THIS EXISTS FOR. `supabase db push` and `check-migrations-applied`
 * both identify a migration by its 14-digit version prefix ALONE. If a local
 * file carries a version that is already recorded remotely under a DIFFERENT
 * migration's name, the file is treated as applied and is skipped forever. It
 * never runs, `db:check` reports zero pending, and the objects it should have
 * created simply do not exist. Four files on origin/main were in that state on
 * 2026-09-06, including one carrying an anon UPDATE policy that would have
 * become live the moment somebody renumbered it.
 *
 * A second, simpler collision is two LOCAL files sharing one version. There the
 * push applies one and dies on the other with a duplicate-key error, which at
 * least fails loudly, but only after applying whatever preceded it.
 */

/** Split `20260413120000_analytics_internal_tables.sql` into its two parts. */
export function parseMigrationFilename(filename) {
  const base = filename.endsWith(".sql") ? filename.slice(0, -4) : filename;
  const underscore = base.indexOf("_");
  if (underscore === -1) return { version: base, slug: "" };
  return { version: base.slice(0, underscore), slug: base.slice(underscore + 1) };
}

/** Two or more local files claiming the same version. */
export function findDuplicateLocalVersions(filenames) {
  const byVersion = new Map();
  for (const filename of filenames) {
    const { version, slug } = parseMigrationFilename(filename);
    if (!byVersion.has(version)) byVersion.set(version, []);
    byVersion.get(version).push(slug);
  }
  return [...byVersion.entries()]
    .filter(([, slugs]) => slugs.length > 1)
    .map(([version, slugs]) => ({ version, slugs: slugs.sort() }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * A remote name that is really the SAME migration, recorded with a cosmetic
 * difference. Excluding these is what makes the check usable: production had 33
 * raw name mismatches and only a handful were real.
 *
 *   - the remote name repeats a version prefix: `20260613213721_drop_legacy…`
 *     recorded against local slug `drop_legacy…`
 *   - the local file is a `*_applied_via_mcp_placeholder` stand-in written when
 *     a migration was applied through the MCP path rather than the CLI
 */
export function isCosmeticNameDifference(remoteName, localSlug) {
  if (!remoteName || remoteName === localSlug) return true;
  if (localSlug.includes("applied_via_mcp_placeholder")) return true;
  const withoutVersionPrefix = remoteName.replace(/^\d{14}_/, "");
  if (withoutVersionPrefix === localSlug) return true;
  return false;
}

/**
 * Local files whose version is recorded remotely under a different migration.
 * Each of these has never applied and cannot as numbered.
 *
 * `remoteByVersion` is a Map of version -> recorded name.
 */
export function findVersionsTakenByAnotherMigration(filenames, remoteByVersion) {
  const found = [];
  for (const filename of filenames) {
    const { version, slug } = parseMigrationFilename(filename);
    if (!remoteByVersion.has(version)) continue;
    const remoteName = remoteByVersion.get(version);
    if (isCosmeticNameDifference(remoteName, slug)) continue;
    found.push({ version, localSlug: slug, remoteName, filename });
  }
  return found.sort((a, b) => a.version.localeCompare(b.version));
}

/** Baseline entries are matched on version + local slug, never on version alone. */
export function baselineKey(entry) {
  return `${entry.version}:${entry.localSlug ?? entry.slug ?? ""}`;
}

export function subtractBaseline(found, baselineEntries) {
  const known = new Set(baselineEntries.map(baselineKey));
  return found.filter((f) => !known.has(baselineKey(f)));
}
