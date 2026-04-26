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
 * legacy header/footer. Single source of truth — both the wrapper helpers
 * below and the layout MUST consult this to stay in sync.
 */
export async function shouldRenderSnapshotShell(
  tenantId: string,
  locale: Locale,
): Promise<boolean> {
  if (!isSiteShellEnabledForTenant(tenantId)) return false;
  const shell = await loadPublishedShell(tenantId, locale);
  return shell !== null;
}

/**
 * Render the snapshot shell's HEADER slot, or null if no shell is engaged
 * for this tenant. Mount this at the top of the page, where the legacy
 * `PublicHeader` would otherwise live. The calling layout is responsible
 * for not also mounting `PublicHeader` in this case (use
 * `shouldRenderSnapshotShell` to gate).
 */
export async function PublishedShellHeader({
  tenantId,
  locale,
}: {
  tenantId: string;
  locale: Locale;
}) {
  if (!isSiteShellEnabledForTenant(tenantId)) return null;
  const shell = await loadPublishedShell(tenantId, locale);
  if (!shell) return null;
  const slot = shell.snapshot.slots.find((s) => s.slotKey === "header");
  return slot ? renderShellSlot(slot, tenantId, locale) : null;
}

/**
 * Render the snapshot shell's FOOTER slot, or null. Mount at the bottom of
 * the page where the legacy footer would otherwise live.
 */
export async function PublishedShellFooter({
  tenantId,
  locale,
}: {
  tenantId: string;
  locale: Locale;
}) {
  if (!isSiteShellEnabledForTenant(tenantId)) return null;
  const shell = await loadPublishedShell(tenantId, locale);
  if (!shell) return null;
  const slot = shell.snapshot.slots.find((s) => s.slotKey === "footer");
  return slot ? renderShellSlot(slot, tenantId, locale) : null;
}

/**
 * Convenience wrapper that nests children between header + footer when the
 * shell is engaged, or just renders children when not. Useful for pages
 * whose body is small enough to nest. Larger pages (homepage with 9+
 * sections) prefer mounting `PublishedShellHeader` and
 * `PublishedShellFooter` directly at their top + bottom positions.
 */
export async function PublishedShell({ tenantId, locale, children }: Props) {
  return (
    <>
      <PublishedShellHeader tenantId={tenantId} locale={locale} />
      {children}
      <PublishedShellFooter tenantId={tenantId} locale={locale} />
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
