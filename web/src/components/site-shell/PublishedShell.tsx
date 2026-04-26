/**
 * Phase B.1 — `<PublishedShell>` wrapper.
 *
 * Server Component. Wraps a page body with the tenant's snapshot-rendered
 * header + footer when the site-shell feature flag is on AND the tenant has
 * a published shell row. Falls back to rendering the children alone (no
 * header/footer) when either gate is closed; the calling layout still has
 * `PublicHeader` mounted around it, which means:
 *
 *   - Default tenants (flag off OR no shell) get the existing
 *     `PublicHeader` + body + existing footer (no behavior change).
 *   - Opted-in tenants with a published shell get the snapshot-rendered
 *     header + body + snapshot-rendered footer; the calling layout MUST
 *     un-mount `PublicHeader` to avoid double-headers.
 *
 * Phase B.2 wires the un-mount logic into `agency-home-storefront.tsx`.
 * For B.1, this component is built but never reached at runtime — the
 * feature flag in `site-shell-flag.ts` defaults to "off".
 *
 * Renders the snapshot via the same `getSectionType()` lookup the homepage
 * composer uses, so theming, presentation tokens, and layout tokens behave
 * identically to body sections.
 */

import { loadPublishedShell } from "@/lib/site-admin/server/shell-reads";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import { isSiteShellEnabledForTenant } from "@/lib/site-admin/site-shell-flag";
import type { Locale } from "@/i18n/config";

interface Props {
  tenantId: string;
  locale: Locale;
  children: React.ReactNode;
}

export interface SiteShellRenderHints {
  /** True when this request will render a snapshot shell. The calling
   *  layout uses this to decide whether to also mount the legacy
   *  `PublicHeader` / footer (when false → mount them; when true →
   *  skip them so we don't double-render). */
  snapshotShellActive: boolean;
}

/**
 * Server-side helper for the calling layout to decide whether to mount the
 * legacy header/footer. Single source of truth — both `<PublishedShell>`
 * and the layout MUST consult this to stay in sync.
 */
export async function shouldRenderSnapshotShell(
  tenantId: string,
  locale: Locale,
): Promise<boolean> {
  if (!isSiteShellEnabledForTenant(tenantId)) return false;
  const shell = await loadPublishedShell(tenantId, locale);
  return shell !== null;
}

export async function PublishedShell({ tenantId, locale, children }: Props) {
  if (!isSiteShellEnabledForTenant(tenantId)) {
    return <>{children}</>;
  }
  const shell = await loadPublishedShell(tenantId, locale);
  if (!shell) {
    // Tenant opted in via flag but hasn't published a shell yet. Belt-and-
    // suspenders: render children alone; calling layout will mount the
    // legacy header/footer because shouldRenderSnapshotShell returns false.
    return <>{children}</>;
  }

  const headerSlot = shell.snapshot.slots.find((s) => s.slotKey === "header");
  const footerSlot = shell.snapshot.slots.find((s) => s.slotKey === "footer");

  return (
    <>
      {headerSlot ? renderShellSlot(headerSlot, tenantId, locale) : null}
      {children}
      {footerSlot ? renderShellSlot(footerSlot, tenantId, locale) : null}
    </>
  );
}

function renderShellSlot(
  slot: {
    sectionTypeKey: string;
    sectionId: string;
    props: Record<string, unknown>;
  },
  tenantId: string,
  locale: string,
): React.ReactNode {
  const reg = getSectionType(slot.sectionTypeKey);
  if (!reg) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[PublishedShell] unknown section type "${slot.sectionTypeKey}" — slot ignored`,
      );
    }
    return null;
  }
  const Comp = reg.Component;
  return (
    <Comp
      key={slot.sectionId}
      sectionId={slot.sectionId}
      tenantId={tenantId}
      locale={locale}
      preview={false}
      props={slot.props}
    />
  );
}
