/**
 * website-health.ts — the Website Overview "Site Health" report builder.
 *
 * WHAT THIS IS
 * ────────────
 * A PURE aggregation over data the workspace already loads. It answers the one
 * question the Website surface never answered for a non-technical operator:
 * "is my website OK, and what should I do next?".
 *
 * It computes NOTHING new. Every finding is derived from a value that already
 * reached the admin (domain registry row, cms_pages flags, cms_redirects, a
 * form-inbox count). There are no queries here, no `server-only` import, and no
 * writes — which is also why this file runs under the plain `tsx --test` lane.
 *
 * HONESTY RULES (the whole reason this file has a doc block)
 * ─────────────────────────────────────────────────────────
 * The owner has been burned repeatedly by admin indicators that looked live and
 * were reading a fixture. Three rules follow from that, and they are enforced by
 * tests in `website-health.test.ts`:
 *
 *   1. A signal whose backing data is a fixture/prototype produces NO finding.
 *      Concretely: `WebsiteSeoDefaults.robotsMode` and `.sitemapEnabled` are
 *      NOT wired — `mergeWebsiteStateFromBridge` patches `siteTitle`,
 *      `titleTemplate`, `description` and `canonicalDomain` from real identity
 *      data and lets the rest fall through from the `WEBSITE_STATE` fixture. So
 *      this builder never reports a site-level robots or sitemap switch. Only
 *      the PER-PAGE `noindex` / `includeInSitemap` columns, which are real
 *      `cms_pages` columns, are reported.
 *   2. Per-page SEO flags are read strictly: a finding counts a page only when
 *      the flag is literally `true` (noindex) or literally `false`
 *      (includeInSitemap). `undefined` means "the loader did not supply it"
 *      (prototype mode), and an absent value never becomes a claim.
 *   3. Publish preflight is deliberately absent. It is computed per page, on
 *      demand, by `lib/site-admin/edit-mode/publish-preflight-action.ts`, and
 *      running it across every page to paint a panel would be an expensive lie
 *      about how cheap this surface is.
 *
 * COPY
 * ────
 * Findings carry i18n KEYS, never English. The panel resolves them through
 * `useT()`. Keys live under `dashboard.adminWebsite.health.*` in
 * `messages/{en,es}.json` and are written in plain language: "Your web address
 * is not connected yet", not "DNS verification pending".
 */

import { auditRedirects, type RedirectRecord } from "@/lib/site-admin/redirects";

/**
 * The redirect fields the hygiene audit reads. Deliberately narrower than
 * `RedirectRecord`: the Website data bridge does not carry `createdAt`, and
 * inventing one so the type lines up would be exactly the kind of fake value
 * this file exists to avoid.
 */
export type WebsiteHealthRedirectInput = Pick<
  RedirectRecord,
  "id" | "oldPath" | "newPath" | "active"
>;

/* ───────────────────────────── report shape ───────────────────────────── */

export type WebsiteHealthSeverity = "critical" | "warning" | "info" | "ok";

/**
 * One row in the panel.
 *
 * `fixHref` is a path RELATIVE TO THE ADMIN BASE ("/website/redirects"), not an
 * absolute URL: the admin base differs per host (`/admin` on a branded host,
 * `/<slug>/admin` on the app host — see `adminBasePath` in the shell context),
 * and this builder is host-blind on purpose. The panel prefixes it.
 *
 * `fixDrawer` covers the affordances that are drawers rather than routes. Only
 * the workspace domain drawer qualifies today.
 */
export type WebsiteHealthFinding = {
  id: string;
  severity: WebsiteHealthSeverity;
  titleKey: string;
  detailKey: string;
  /** Values for `interpolate()` holes in `detailKey`. */
  detailVars?: Record<string, string | number>;
  /** Admin-relative path, e.g. "/website/redirects". */
  fixHref?: string;
  /** Shell drawer to open instead of navigating. */
  fixDrawer?: "domain";
  fixLabelKey?: string;
  /** Jargon explainer shown behind an "i" affordance next to the title. */
  infoTipKey?: string;
};

export type WebsiteHealthReport = {
  /** Ordered critical → warning → info; a healthy site is a single `ok` row. */
  findings: WebsiteHealthFinding[];
  counts: { critical: number; warning: number; info: number };
};

/* ───────────────────────────── input shape ────────────────────────────── */

/** The subset of `WorkspaceDomainSummary` this report reads. */
export type WebsiteHealthDomainInput = {
  /** The address the site actually answers on today (subdomain or custom). */
  primaryHost: string | null;
  customDomainHost: string | null;
  customDomainStatus:
    | "pending"
    | "dns_verification_sent"
    | "verified"
    | "ssl_provisioned"
    | "active"
    | "failed"
    | "suspended"
    | null;
  /** Registry-recorded reason a custom domain failed, when there is one. */
  failureReason: string | null;
};

/** The subset of a page row this report reads. */
export type WebsiteHealthPageInput = {
  status: string;
  /** `cms_pages.noindex`. Undefined = not supplied; never treated as a claim. */
  noindex?: boolean;
  /** `cms_pages.include_in_sitemap`. Undefined = not supplied. */
  includeInSitemap?: boolean;
  /** Set when the page has a future publish time (`scheduled_publish_at`). */
  scheduledPublishAt?: string | null;
};

export type WebsiteHealthInput = {
  domain: WebsiteHealthDomainInput;
  pages: ReadonlyArray<WebsiteHealthPageInput>;
  redirects: ReadonlyArray<WebsiteHealthRedirectInput>;
  /**
   * Forms inbox. `visible` mirrors the route's own capability gate
   * (`manage_billing`) — when the viewer cannot reach the Forms inbox they get
   * no finding about it at all, rather than a count they cannot act on.
   */
  forms: { visible: boolean; unreadCount: number };
};

/* ───────────────────────────── key namespace ──────────────────────────── */

const K = "dashboard.adminWebsite.health";

const SEVERITY_ORDER: Record<WebsiteHealthSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  ok: 3,
};

/* ───────────────────────────── the builder ────────────────────────────── */

/**
 * Build the Site Health report from already-loaded data.
 *
 * Returns findings ordered critical → warning → info, stable within a severity
 * (insertion order below is the display order). When nothing is wrong, returns
 * exactly one `ok` finding so the panel collapses to one green line instead of
 * rendering an empty box.
 */
export function buildWebsiteHealthReport(
  input: WebsiteHealthInput,
): WebsiteHealthReport {
  const findings: WebsiteHealthFinding[] = [];

  // ── Domain ────────────────────────────────────────────────────────────────
  // Note the ordering: a FAILED custom domain outranks everything else on the
  // panel, because it is the one state where visitors typing the address the
  // tenant advertises land nowhere.
  const { customDomainHost, customDomainStatus, failureReason, primaryHost } =
    input.domain;
  if (!customDomainHost) {
    findings.push({
      id: "domain-none",
      severity: "info",
      titleKey: `${K}.domainNone.title`,
      detailKey: primaryHost
        ? `${K}.domainNone.detail`
        : `${K}.domainNone.detailNoHost`,
      detailVars: primaryHost ? { host: primaryHost } : undefined,
      fixDrawer: "domain",
      fixLabelKey: `${K}.domainNone.fix`,
      infoTipKey: `${K}.tip.webAddress`,
    });
  } else if (customDomainStatus === "failed" || customDomainStatus === "suspended") {
    const reason = (failureReason ?? "").trim();
    findings.push({
      id: "domain-failed",
      severity: "critical",
      titleKey: `${K}.domainFailed.title`,
      detailKey: reason
        ? `${K}.domainFailed.detailWithReason`
        : `${K}.domainFailed.detail`,
      detailVars: reason
        ? { host: customDomainHost, reason }
        : { host: customDomainHost },
      fixDrawer: "domain",
      fixLabelKey: `${K}.domainFailed.fix`,
      infoTipKey: `${K}.tip.dns`,
    });
  } else if (
    customDomainStatus === "pending" ||
    customDomainStatus === "dns_verification_sent" ||
    customDomainStatus === null
  ) {
    findings.push({
      id: "domain-pending",
      severity: "warning",
      titleKey: `${K}.domainPending.title`,
      detailKey: `${K}.domainPending.detail`,
      detailVars: { host: customDomainHost },
      fixDrawer: "domain",
      fixLabelKey: `${K}.domainPending.fix`,
      infoTipKey: `${K}.tip.dns`,
    });
  }
  // "verified" / "ssl_provisioned" / "active" are healthy → no row. The
  // all-clear line at the bottom is the only positive statement this panel
  // makes, so a working domain does not spend a row saying so.

  // ── Search visibility (per-page cms_pages columns only) ───────────────────
  const live = input.pages.filter((p) => p.status === "published");
  const hiddenFromSearch = live.filter((p) => p.noindex === true).length;
  const outOfSitemap = live.filter((p) => p.includeInSitemap === false).length;

  if (hiddenFromSearch > 0) {
    findings.push({
      id: "pages-noindex",
      severity: "warning",
      titleKey: `${K}.pagesNoindex.title`,
      detailKey: `${K}.pagesNoindex.detail`,
      detailVars: { count: hiddenFromSearch },
      fixHref: "/website",
      fixLabelKey: `${K}.pagesNoindex.fix`,
      infoTipKey: `${K}.tip.noindex`,
    });
  }
  if (outOfSitemap > 0) {
    findings.push({
      id: "pages-sitemap",
      severity: "warning",
      titleKey: `${K}.pagesSitemap.title`,
      detailKey: `${K}.pagesSitemap.detail`,
      detailVars: { count: outOfSitemap },
      fixHref: "/website",
      fixLabelKey: `${K}.pagesSitemap.fix`,
      infoTipKey: `${K}.tip.sitemap`,
    });
  }

  // ── Redirects ─────────────────────────────────────────────────────────────
  // `auditRedirects` (shipped with the Redirects manager, PR #1226) already
  // walks the redirect graph and classifies loops / chains / shadowed rows.
  // Reused rather than reimplemented so the panel and the manager can never
  // disagree about what a loop is.
  let loops = 0;
  let chains = 0;
  for (const issues of auditRedirects(input.redirects).values()) {
    for (const issue of issues) {
      if (issue.kind === "loop") loops += 1;
      else if (issue.kind === "chain") chains += 1;
    }
  }
  if (loops > 0) {
    findings.push({
      id: "redirect-loops",
      severity: "warning",
      titleKey: `${K}.redirectLoops.title`,
      detailKey: `${K}.redirectLoops.detail`,
      detailVars: { count: loops },
      fixHref: "/website/redirects",
      fixLabelKey: `${K}.redirectLoops.fix`,
      infoTipKey: `${K}.tip.redirectLoop`,
    });
  }
  if (chains > 0) {
    findings.push({
      id: "redirect-chains",
      severity: "warning",
      titleKey: `${K}.redirectChains.title`,
      detailKey: `${K}.redirectChains.detail`,
      detailVars: { count: chains },
      fixHref: "/website/redirects",
      fixLabelKey: `${K}.redirectChains.fix`,
      infoTipKey: `${K}.tip.redirectChain`,
    });
  }

  // ── Content state ─────────────────────────────────────────────────────────
  // A "scheduled" page is one carrying a future fire time; `status` alone can
  // never say so (see website-page-status.ts), which is why the input carries
  // `scheduledPublishAt` rather than trusting a status string.
  const scheduled = input.pages.filter(
    (p) => p.status !== "archived" && Boolean(p.scheduledPublishAt),
  ).length;
  const drafts = input.pages.filter(
    (p) => p.status === "draft" && !p.scheduledPublishAt,
  ).length;

  if (drafts > 0) {
    findings.push({
      id: "pages-draft",
      severity: "info",
      titleKey: `${K}.pagesDraft.title`,
      detailKey: `${K}.pagesDraft.detail`,
      detailVars: { count: drafts },
      fixHref: "/website",
      fixLabelKey: `${K}.pagesDraft.fix`,
    });
  }
  if (scheduled > 0) {
    findings.push({
      id: "pages-scheduled",
      severity: "info",
      titleKey: `${K}.pagesScheduled.title`,
      detailKey: `${K}.pagesScheduled.detail`,
      detailVars: { count: scheduled },
      fixHref: "/website",
      fixLabelKey: `${K}.pagesScheduled.fix`,
    });
  }

  // ── Forms ─────────────────────────────────────────────────────────────────
  if (input.forms.visible && input.forms.unreadCount > 0) {
    findings.push({
      id: "forms-unread",
      severity: "info",
      titleKey: `${K}.formsUnread.title`,
      detailKey: `${K}.formsUnread.detail`,
      detailVars: { count: input.forms.unreadCount },
      fixHref: "/website/forms",
      fixLabelKey: `${K}.formsUnread.fix`,
    });
  }

  if (findings.length === 0) {
    return {
      findings: [
        {
          id: "all-clear",
          severity: "ok",
          titleKey: `${K}.allClear.title`,
          detailKey: `${K}.allClear.detail`,
        },
      ],
      counts: { critical: 0, warning: 0, info: 0 },
    };
  }

  const ordered = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  return {
    findings: ordered,
    counts: {
      critical: ordered.filter((f) => f.severity === "critical").length,
      warning: ordered.filter((f) => f.severity === "warning").length,
      info: ordered.filter((f) => f.severity === "info").length,
    },
  };
}
