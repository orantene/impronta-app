// Phase 3 — canonical workspace Site hub page.
// Server Component — no "use client".
//
// Entry point for site & branding management. Tiles link to the existing
// legacy site-settings surfaces — they continue to work without promotion.
// The page builder (edit-chrome) is wired in Phase 3.5; for now, "Preview"
// deep-links to the public storefront.
//
// Capability gate: agency.workspace.view (viewer+).
// Manage-tier tiles gated on agency.site_admin.manage_settings (admin+).

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import {
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_HOME_SECTION_GAP,
} from "@/lib/dashboard-shell-classes";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Site tile ────────────────────────────────────────────────────────────────

function SiteTile({
  href,
  label,
  description,
  locked = false,
}: {
  href: string;
  label: string;
  description: string;
  locked?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex flex-col gap-1 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-4 py-4",
        "hover:bg-[var(--admin-nav-idle)]/5 transition-colors group",
        locked ? "pointer-events-none opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-disabled={locked}
      tabIndex={locked ? -1 : undefined}
    >
      <p className="text-sm font-medium text-[var(--admin-workspace-fg)] group-hover:text-[var(--admin-accent)] transition-colors">
        {label}
      </p>
      <p className="text-xs text-[var(--admin-nav-idle)] leading-snug">
        {description}
      </p>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceSitePage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const canManage = await userHasCapability(
    "agency.site_admin.manage_settings",
    scope.tenantId,
  );

  // Storefront URL — the agency's public subdomain
  const storefrontUrl = `https://${tenantSlug}.tulala.digital`;

  return (
    <div className={ADMIN_PAGE_STACK}>
      <div className={ADMIN_HOME_SECTION_GAP}>
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={ADMIN_TEXT_EYEBROW}>{scope.membership.display_name}</p>
            <h1 className={ADMIN_TEXT_DISPLAY_LG}>Public site</h1>
          </div>
          <a
            href={storefrontUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-bg)] px-3.5 py-1.5 text-sm font-medium text-[var(--admin-workspace-fg)] hover:bg-[var(--admin-nav-idle)]/10 transition-colors"
          >
            Preview ↗
          </a>
        </div>

        {/* Content section */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)] mb-3">
            Content
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SiteTile
              href="/admin/site-settings/pages"
              label="Pages"
              description="CMS pages, posts, and landing content"
            />
            <SiteTile
              href="/admin/site-settings/navigation"
              label="Navigation"
              description="Header links, footer links, and menus"
            />
          </div>
        </section>

        {/* Appearance section */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)] mb-3">
            Appearance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SiteTile
              href="/admin/site-settings/design"
              label="Design & theme"
              description="Colours, fonts, and layout style"
              locked={!canManage}
            />
            <SiteTile
              href="/admin/site-settings/branding"
              label="Branding"
              description="Logo, favicon, and brand assets"
              locked={!canManage}
            />
          </div>
        </section>

        {/* Discoverability section */}
        <section>
          <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)] mb-3">
            Discoverability
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SiteTile
              href="/admin/site-settings/seo"
              label="SEO"
              description="Page titles, descriptions, and social sharing"
              locked={!canManage}
            />
            <SiteTile
              href="/admin/site-settings/identity"
              label="Agency identity"
              description="Public name, contact info, and social links"
              locked={!canManage}
            />
          </div>
        </section>

        {/* Advanced section — admin only */}
        {canManage && (
          <section>
            <h2 className="text-sm font-semibold text-[var(--admin-workspace-fg)] mb-3">
              Advanced
            </h2>
            <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-bg)] divide-y divide-[var(--admin-border)]">
              <Link
                href="/admin/site-settings/sections"
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--admin-nav-idle)]/5 transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--admin-workspace-fg)] group-hover:text-[var(--admin-accent)] transition-colors">
                    Section templates
                  </p>
                  <p className="text-xs text-[var(--admin-nav-idle)]">
                    Reusable page-builder section layouts
                  </p>
                </div>
                <svg
                  className="flex-none h-4 w-4 text-[var(--admin-nav-idle)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/admin/site-settings/system"
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--admin-nav-idle)]/5 transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--admin-workspace-fg)] group-hover:text-[var(--admin-accent)] transition-colors">
                    System settings
                  </p>
                  <p className="text-xs text-[var(--admin-nav-idle)]">
                    Locale, redirects, and technical configuration
                  </p>
                </div>
                <svg
                  className="flex-none h-4 w-4 text-[var(--admin-nav-idle)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
