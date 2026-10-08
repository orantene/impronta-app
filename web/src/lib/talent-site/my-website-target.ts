/**
 * TUL-77 · which website is "my website"?
 *
 * Product decision: every talent has a hub profile (/t/TAL-...). A personal
 * website exists only when someone creates one. For a BUSINESS sign-up the
 * workspace site (cms_pages, /w/<slug>/...) IS the website, so the dashboard
 * link and the page-builder entry open it. Pure, so the rule is testable.
 */

export type MyWebsiteInput = {
  /** The user owns a workspace whose `workspace_type` is business. */
  ownsBusinessWorkspace: boolean;
  /** That workspace has at least one live cms_pages row (its site). */
  hasWorkspaceSite: boolean;
  workspaceSlug: string | null;
  /** A `talent_sites` row (site_kind talent_personal) already exists. */
  hasPersonalSite: boolean;
  /** The caller asked for the personal builder on purpose (`?site=personal`, a page, shell). */
  explicitPersonal?: boolean;
};

export type MyWebsiteTarget =
  | { kind: "workspace"; slug: string; href: string }
  | { kind: "personal"; href: string }
  | { kind: "create"; href: string };

export const PERSONAL_BUILDER_HREF = "/talent/page-builder";
export const CREATE_WEBSITE_HREF = "/talent/public-page";

export function workspaceSiteBuilderHref(slug: string): string {
  return `/${slug}/admin/website`;
}

export function resolveMyWebsiteTarget(input: MyWebsiteInput): MyWebsiteTarget {
  if (input.explicitPersonal && input.hasPersonalSite) {
    return { kind: "personal", href: PERSONAL_BUILDER_HREF };
  }
  if (input.ownsBusinessWorkspace && input.hasWorkspaceSite && input.workspaceSlug) {
    return { kind: "workspace", slug: input.workspaceSlug, href: workspaceSiteBuilderHref(input.workspaceSlug) };
  }
  if (input.hasPersonalSite) return { kind: "personal", href: PERSONAL_BUILDER_HREF };
  return { kind: "create", href: CREATE_WEBSITE_HREF };
}

/**
 * May a passive visit (dashboard layout, page builder) create the personal
 * site row? Only a pure talent with no row yet. A business owner never gets one
 * silently: their workspace is the website, and a personal site is created
 * only when they choose to.
 */
export function shouldAutoCreatePersonalSite(input: {
  ownsBusinessWorkspace: boolean;
  hasPersonalSite: boolean;
}): boolean {
  return !input.hasPersonalSite && !input.ownsBusinessWorkspace;
}

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * TUL-373: the server-side "Edit site" redirect decision for
 * `/talent/page-builder`. Returns the workspace builder href only for a
 * business owner whose workspace site exists (and the caller did not ask for the
 * personal builder on purpose); `null` means "stay on the in-page editor"
 * (talent, unknown or failed lookup). It never returns a `/talent/...` path, so
 * the redirect cannot loop back into the page that issues it.
 */
export function resolveEditSiteRedirect(input: MyWebsiteInput): string | null {
  const target = resolveMyWebsiteTarget(input);
  if (target.kind !== "workspace") return null;
  if (!SAFE_SLUG.test(target.slug)) return null;
  return target.href;
}

/**
 * Does deciding the redirect need the personal-site probe? Only when a business
 * owner explicitly asked for the personal builder: every other case is decided
 * by the workspace facts alone, so the extra query (and its round trip) is
 * skipped.
 */
export function editSiteNeedsPersonalProbe(input: {
  ownsBusinessWorkspace: boolean;
  hasWorkspaceSite: boolean;
  explicitPersonal: boolean;
}): boolean {
  return input.explicitPersonal && input.ownsBusinessWorkspace && input.hasWorkspaceSite;
}
