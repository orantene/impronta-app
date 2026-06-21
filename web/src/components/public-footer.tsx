import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicHostContext } from "@/lib/saas";
import { PublicCmsFooterNav } from "@/components/public-cms-footer";
import {
  PublishedShellFooter,
  shouldRenderSnapshotShell,
} from "@/components/site-shell/PublishedShell";

/**
 * Self-gating public FOOTER — the footer twin of `PublicHeader`.
 *
 * `PublicHeader` self-gates (when `shouldRenderSnapshotShell` is true it returns
 * `<PublishedShellHeader>`), so the snapshot header appears on EVERY route that
 * mounts it. The footer mutex used to live only in `agency-home-storefront.tsx`,
 * so once a tenant turns the snapshot shell on, inner public routes (`/p/*`,
 * `/directory`, `/posts/*`) showed the snapshot header up top but a hard-coded
 * LEGACY footer at the bottom — a brand-consistency mismatch.
 *
 * This component mirrors `PublicHeader`'s gate so header + footer chrome always
 * match: snapshot footer when the shell is engaged, the legacy footer otherwise.
 * `className` overrides the legacy `<footer>` classes (e.g. `mt-auto` on flex
 * layouts that pin the footer to the bottom).
 */
export async function PublicFooter({ className }: { className?: string }) {
  const locale = await getRequestLocale();
  const hostContext = await getPublicHostContext();
  const tenantIdForIdentity =
    hostContext.kind === "agency" || hostContext.kind === "hub"
      ? hostContext.tenantId
      : null;

  if (
    tenantIdForIdentity &&
    (await shouldRenderSnapshotShell(tenantIdForIdentity, locale))
  ) {
    return (
      <PublishedShellFooter tenantId={tenantIdForIdentity} locale={locale} />
    );
  }

  return (
    <footer
      className={
        className ?? "border-t border-border px-4 py-8 sm:px-6 lg:px-8"
      }
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center text-sm text-muted-foreground">
        <PublicCmsFooterNav locale={locale} />
      </div>
    </footer>
  );
}
