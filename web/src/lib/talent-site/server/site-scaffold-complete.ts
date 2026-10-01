type Res = { data: unknown; error: unknown };

/** F137 perf: true when both reads succeeded, the site row has a slug + shell
 *  and a home page exists, so opening the manager can skip provisioning. */
export function siteScaffoldComplete(siteRes: Res, pagesRes: Res): boolean {
  if (siteRes.error || pagesRes.error) return false;
  const site = siteRes.data as { site_slug: string | null; shell_tree: unknown } | null;
  const pages = (pagesRes.data ?? []) as Array<{ is_home: boolean }>;
  return (
    Boolean(site?.site_slug) &&
    Array.isArray(site?.shell_tree) &&
    (site!.shell_tree as unknown[]).length > 0 &&
    pages.some((p) => p.is_home)
  );
}
