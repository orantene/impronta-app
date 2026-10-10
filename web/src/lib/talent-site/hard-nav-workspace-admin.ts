/**
 * live4-01 — soft-nav from the talent shell to `/{slug}/admin/website` updates
 * the URL but can leave TalentShellClient mounted (layouts do not remount on
 * every soft transition). The SPA keeps painting Hoy; admin rail toggles no-op
 * until a full refresh.
 *
 * Use a hard document navigation for those hrefs so the workspace admin layout
 * mounts cleanly. Same class of fix as the page-builder soft-nav trap in
 * `canonical-routes.ts`.
 */

export function isWorkspaceAdminWebsiteHref(href: string): boolean {
  const raw = href.trim();
  if (!raw) return false;
  let path: string;
  try {
    path = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw).pathname
      : (raw.split(/[?#]/, 1)[0] ?? raw);
  } catch {
    return false;
  }
  return /(?:^|\/)admin\/website(?:\/|$)/.test(path);
}

/** Prefer hard nav when leaving talent for workspace admin website. */
export function talentLeaveForWorkspaceAdminHref(href: string): boolean {
  return isWorkspaceAdminWebsiteHref(href);
}
