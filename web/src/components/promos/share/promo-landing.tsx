import Link from "next/link";

import type { ShareLang } from "@/lib/promos/share/captions";
import type { LandingState } from "@/lib/promos/share/landing-core";
import { landingCopy } from "@/lib/promos/share/landing-copy";
import { PromoLinkBeacon } from "./promo-link-beacon";

export type PromoLandingProps = {
  state: LandingState;
  lang: ShareLang;
  talentName: string;
  /** "20% de descuento". Null when the page must show nothing about the promo. */
  headline: string | null;
  condition: string | null;
  /** Where "Reservar" goes: the targeted service or the site home. */
  ctaHref: string;
  alternatives: { id: string; headline: string; href: string }[];
  /** Logged + pinned only when the promo is real and visible. */
  beacon: { promoId: string; via: string | null; token: string | null } | null;
};

/** One landing for every state, all HTTP 200. Minimal on purpose. */
export function PromoLanding(p: PromoLandingProps) {
  const copy = landingCopy(p.state, p.lang);
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 px-5 py-12">
      {p.beacon ? <PromoLinkBeacon {...p.beacon} /> : null}
      <p className="text-sm opacity-70">{p.talentName}</p>
      {p.state === "live" && p.headline ? (
        <p className="text-4xl font-semibold leading-tight">{p.headline}</p>
      ) : null}
      <h1 className={p.state === "live" ? "text-base" : "text-2xl font-semibold"}>{copy.title}</h1>
      {p.state === "live" && p.condition ? <p className="text-base opacity-80">{p.condition}</p> : null}
      {copy.body ? <p className="text-base opacity-80">{copy.body}</p> : null}
      {p.alternatives.length > 0 && copy.alternativesTitle ? (
        <ul className="flex flex-col gap-2" aria-label={copy.alternativesTitle}>
          {p.alternatives.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="flex min-h-11 items-center justify-between rounded-xl border px-4 py-3">
                <span>{a.headline}</span>
                <span aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={p.ctaHref}
        className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-current px-6 py-3 text-base font-semibold"
      >
        {copy.cta}
      </Link>
    </main>
  );
}
