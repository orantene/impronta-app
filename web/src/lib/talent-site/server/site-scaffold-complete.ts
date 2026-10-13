type Res = { data: unknown; error: unknown };

/** F137 perf: true when both reads succeeded, the site row has a slug + shell
 *  and a home page exists, so opening the manager can skip provisioning. */
export function siteScaffoldComplete(siteRes: Res, pagesRes: Res): boolean {
  if (siteRes.error || pagesRes.error) return false;
  // `shell_head` = `shell_tree->0` (PERF-SITE): the first node only, so callers
  // need not pull the whole tree just to test it is a non-empty array.
  const site = siteRes.data as {
    site_slug: string | null;
    shell_tree?: unknown;
    shell_head?: unknown;
  } | null;
  const pages = (pagesRes.data ?? []) as Array<{ is_home: boolean }>;
  return (
    Boolean(site?.site_slug) &&
    (site?.shell_head != null ||
      (Array.isArray(site?.shell_tree) && (site!.shell_tree as unknown[]).length > 0)) &&
    pages.some((p) => p.is_home)
  );
}
