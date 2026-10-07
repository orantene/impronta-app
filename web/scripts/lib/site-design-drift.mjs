// Pure classifier for scripts/site-design-drift.mjs (read-only monitor).

export const WATCHED_CODES = ["TAL-93900", "TAL-93938"];

/**
 * Latest version per design slug.
 * Primary: highest to_version of a PUBLISHED talent_theme_releases row.
 * Fallback (slug has no published release, e.g. v1-only designs): highest
 * version any published site already runs.
 */
export function latestVersions(releases, sites) {
  const latest = new Map();
  for (const r of releases) {
    if (r.status !== "published") continue;
    const cur = latest.get(r.design_slug);
    if (!cur || r.to_version > cur.version) latest.set(r.design_slug, { version: r.to_version, source: "release" });
  }
  for (const s of sites) {
    if (!s.theme_design_slug || s.theme_design_version == null) continue;
    const cur = latest.get(s.theme_design_slug);
    if (cur?.source === "release") continue;
    if (!cur || s.theme_design_version > cur.version) latest.set(s.theme_design_slug, { version: s.theme_design_version, source: "sites" });
  }
  return latest;
}

/** Every __origin.version stamped on nodes (node.__origin and node.props.__origin). */
export function shellOriginVersions(tree, out = []) {
  if (Array.isArray(tree)) tree.forEach((n) => shellOriginVersions(n, out));
  else if (tree && typeof tree === "object") {
    for (const o of [tree.__origin, tree.props?.__origin]) if (o && Number.isInteger(o.version)) out.push(o.version);
    if (Array.isArray(tree.children)) shellOriginVersions(tree.children, out);
  }
  return out;
}

/**
 * (a) behind: site design version < latest released version of its slug.
 * (b) staleShell: the PUBLISHED shell was stamped from an older design version
 *     than the version the site is on. Draft edits only change shell_tree and
 *     leave shell_published untouched, so an older stamp in shell_published is
 *     a stale publish, not an unpublished edit.
 */
export function classifySite(site, latest) {
  const slug = site.theme_design_slug;
  const version = site.theme_design_version;
  const l = latest.get(slug);
  const behind = !!l && version != null && version < l.version;
  const stamps = shellOriginVersions(site.shell_published);
  const shellVersion = stamps.length ? Math.max(...stamps) : null;
  const staleShell = shellVersion != null && version != null && shellVersion < version;
  return { behind, staleShell, version, latest: l?.version ?? null, shellVersion };
}

export function isWatchedDrifted(rows, watched = WATCHED_CODES) {
  return rows.some((r) => watched.includes(r.profile_code) && (r.behind || r.staleShell));
}

export function formatDriftTable(rows) {
  const head = ["profile_code", "site_slug", "design", "site_version", "latest", "shell_published", "flags"];
  const body = rows.map((r) => [
    r.profile_code, r.site_slug ?? "", r.theme_design_slug ?? "", r.version ?? "", r.latest ?? "", r.shellVersion ?? "",
    [r.behind ? "BEHIND" : "", r.staleShell ? "STALE-PUBLISH" : ""].filter(Boolean).join("+"),
  ].map(String));
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (c) => c.map((x, i) => x.padEnd(w[i])).join("  ");
  return [line(head), line(w.map((n) => "-".repeat(n))), ...body.map(line)].join("\n");
}
