import Link from "next/link";
import {
  loadDefaultStorefrontRoster,
  type DefaultStorefrontTalent,
} from "@/lib/home/default-storefront-roster";
import type { Locale } from "@/i18n/config";
import { withLocalePath } from "@/i18n/pathnames";
import { getPublicPathPrefix } from "@/lib/saas/scope";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { resolveCardDesign } from "@/lib/site-admin/server/card-design-resolver";

/**
 * Data-driven *default* homepage body for an agency host that has not yet
 * published a custom Page-Builder / CMS composition.
 *
 * Rendered inside `AgencyHomeStorefront`'s `<main>` (which already supplies
 * the public header, footer, and discovery providers) — so this component
 * emits only the hero + roster grid, never its own chrome.
 *
 * Every value is the *current* tenant's own (name, tagline, branding, their
 * published roster), so this is a per-tenant auto-storefront, not a return
 * to the Phase-5-removed hardcoded single-tenant marketing body.
 */
export async function DefaultStorefrontBody({
  tenantId,
  brandName,
  tagline,
  primaryColor,
  ctaLabel,
  ctaHref,
  locale,
}: {
  tenantId: string;
  brandName: string;
  tagline: string | null;
  primaryColor: string | null;
  ctaLabel: string;
  ctaHref: string;
  locale: Locale;
}) {
  const [talents, publicPathPrefix, cardDesign] = await Promise.all([
    loadDefaultStorefrontRoster(tenantId),
    getPublicPathPrefix(),
    resolveCardDesign(tenantId),
  ]);
  const heroBg = primaryColor?.trim() || "oklch(0.21 0.006 285)";

  // Same href formula the directory and the home featured grid use:
  // `/t/<profileCode>`, prefixed for path-hosted tenants (tulala.digital/w/<slug>)
  // and locale-prefixed last. See `homeCardToCanonical` in featured-talent-section.
  const profileHref = (talent: DefaultStorefrontTalent): string | null => {
    const code = talent.profileCode?.trim();
    if (!code) return null;
    return withLocalePath(
      prefixPublicHref(`/t/${encodeURIComponent(code)}`, publicPathPrefix),
      locale,
    );
  };

  // `directory.card.profile-popup` is a tenant-wide CEILING. "on" (default) →
  // a soft <Link> so the `@modal/(.)t` intercepting route opens the profile in
  // a popup, exactly as on /directory. "off" → a plain <a> full-page load,
  // which defeats route interception (the server-side equivalent of the
  // directory adapter's hard-navigation capture handler).
  const popupDisabled = cardDesign.profilePopup === "off";

  return (
    <>
      {/* ── Hero: tenant's own name + tagline + configurable CTA ───────────── */}
      <section
        className="relative flex flex-col items-center justify-center gap-4 px-6 py-24 text-center sm:py-32"
        style={{ backgroundColor: heroBg }}
      >
        <h1 className="text-4xl font-semibold tracking-tight text-white drop-shadow sm:text-5xl">
          {brandName}
        </h1>
        {tagline ? (
          <p className="max-w-xl text-base text-white/80 sm:text-lg">{tagline}</p>
        ) : null}
        <a
          href={ctaHref}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-6 py-2.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {ctaLabel}
        </a>
      </section>

      {/* ── Roster grid: the tenant's own published talent ────────────────── */}
      <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-14 sm:px-6 lg:px-8">
        {talents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
            <span className="text-4xl" aria-hidden>
              ✦
            </span>
            <p className="text-base">No talent published yet — check back soon.</p>
          </div>
        ) : (
          <>
            <h2 className="mb-8 text-xl font-medium tracking-tight text-foreground">
              Our talent
            </h2>
            <ul
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              role="list"
            >
              {talents.map((talent) => {
                const href = profileHref(talent);
                // The card body is identical whether or not we can link it —
                // only the wrapper element changes.
                const body = (
                  <>
                    <div className="overflow-hidden rounded-xl bg-muted">
                      {talent.thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={talent.thumb}
                          alt={talent.name}
                          className="aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex aspect-[3/4] w-full items-center justify-center bg-muted text-muted-foreground">
                          <span className="text-3xl font-light" aria-hidden>
                            {talent.name.slice(0, 1)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 px-0.5">
                      <p className="truncate text-sm font-medium text-foreground">
                        {talent.name}
                      </p>
                      {talent.primaryTypeLabel || talent.city ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {[talent.primaryTypeLabel, talent.city]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </>
                );

                const linkClassName =
                  "block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

                return (
                  <li key={talent.id} className="group">
                    {href == null ? (
                      body
                    ) : popupDisabled ? (
                      <a href={href} className={linkClassName}>
                        {body}
                      </a>
                    ) : (
                      <Link href={href} className={linkClassName}>
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
