/**
 * TUL-1000: HQ console route loading state.
 * Every /platform/admin/* page is force-dynamic and several do a service-role
 * read before rendering (Builder Lab resolves the hub tenant first), and this
 * segment had no loading boundary, so a soft click on a side-nav tab gave no
 * feedback until the whole page was ready and read as "does nothing". The
 * topbar is painted by the layout; this fills the PAGE SLOT only.
 */
import { getRequestLocale } from "@/i18n/request-locale";

export default async function PlatformAdminLoading() {
  const locale = (await getRequestLocale().catch(() => "en")).toLowerCase().startsWith("es")
    ? "es"
    : "en";
  const label = locale === "es" ? "Cargando" : "Loading";
  return (
    <div
      role="status"
      aria-label={label}
      data-testid="platform-admin-route-loading"
      className="space-y-4 py-2"
    >
      <span className="sr-only">{label}</span>
      <div className="h-7 w-44 animate-pulse rounded-md bg-white/[0.08]" />
      <div className="h-[220px] animate-pulse rounded-2xl bg-white/[0.06]" />
      <div className="h-36 animate-pulse rounded-2xl bg-white/[0.06]" />
    </div>
  );
}
