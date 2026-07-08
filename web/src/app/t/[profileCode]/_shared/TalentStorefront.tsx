/**
 * TalentStorefront — the public "Services" section (offerings catalog).
 *
 * KIND-AWARE presenter over ONE dataset: services render as calm price-list
 * rows (optional 56px thumb), packages as editorial cards (2-up), products as
 * an image grid (2-up mobile / 3-up desktop) — always in that order, never
 * interleaved. At most ONE featured offering gets the hero rail. Sub-headings
 * appear only when 2+ kind-groups are present. No ecommerce tells: no
 * ratings, no scarcity nags, no cart language.
 *
 * Server component; interactivity lives in the OfferingCta client island.
 * Replaces ServiceMenuBlock whenever the talent has offerings (the legacy
 * menu stays as the zero-regression fallback for talents without them).
 * Display-only — money resolves in Messages / instant-book, never here.
 */

import Image from "next/image";
import type { TalentOffering, OfferingKind } from "@/lib/talent/offerings-types";
import { offeringPriceLabel } from "@/lib/talent/offerings-types";
import { OfferingCta } from "./OfferingCta";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { LightSectionLabel } from "../_light/section-label";

const GROUP_ORDER: OfferingKind[] = ["service", "package", "product"];
const GROUP_LABELS: Record<OfferingKind, { en: string; es: string }> = {
  service: { en: "Services", es: "Servicios" },
  package: { en: "Packages", es: "Paquetes" },
  product: { en: "Shop", es: "Tienda" },
};

function DurationChip({ minutes, locale }: { minutes: number; locale: string }) {
  const label =
    minutes >= 60 && minutes % 60 === 0
      ? `${minutes / 60} h`
      : `${minutes} min`;
  return (
    <span
      className="plt-mono inline-flex items-center rounded-full border px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.1em]"
      style={{ borderColor: "var(--plt-hairline-strong)", color: "var(--plt-muted-soft)" }}
    >
      {label}
      {locale === "es" ? "" : ""}
    </span>
  );
}

function ServiceRow({ it, locale }: { it: TalentOffering; locale: string }) {
  return (
    <div
      className="flex items-center gap-3 border-b py-3 last:border-b-0"
      style={{ borderColor: "var(--plt-hairline)" }}
      data-offering-row={it.id}
    >
      {it.imageUrls[0] ? (
        <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-[10px] border" style={{ borderColor: "var(--plt-hairline)" }}>
          <Image src={it.imageUrls[0]} alt={it.title} fill sizes="56px" className="object-cover" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium" style={{ color: "var(--plt-ink)" }}>
          <span className="truncate">{it.title}</span>
          {it.durationMinutes ? <DurationChip minutes={it.durationMinutes} locale={locale} /> : null}
        </p>
        {it.description ? (
          <p className="mt-0.5 line-clamp-2 text-sm" style={{ color: "var(--plt-muted)" }}>
            {it.description}
          </p>
        ) : null}
      </div>
      <p className="shrink-0 text-sm font-medium tabular-nums" style={{ color: "var(--plt-ink)" }}>
        {offeringPriceLabel(it, locale)}
      </p>
      <OfferingCta offering={it} locale={locale} compact />
    </div>
  );
}

function PackageCard({ it, locale }: { it: TalentOffering; locale: string }) {
  return (
    <div
      className="overflow-hidden rounded-[var(--plt-radius-md)] border"
      style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg-raised)" }}
      data-offering-card={it.id}
    >
      {it.imageUrls[0] ? (
        <span className="relative block aspect-[4/3] w-full">
          <Image src={it.imageUrls[0]} alt={it.title} fill sizes="(max-width: 640px) 100vw, 320px" className="object-cover" />
        </span>
      ) : null}
      <div className="p-4">
        <p className="font-medium" style={{ color: "var(--plt-ink)" }}>
          {it.title}
        </p>
        {it.description ? (
          <p className="mt-1 line-clamp-3 text-sm" style={{ color: "var(--plt-muted)" }}>
            {it.description}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium tabular-nums" style={{ color: "var(--plt-ink)" }}>
            {offeringPriceLabel(it, locale)}
          </p>
          <OfferingCta offering={it} locale={locale} compact />
        </div>
      </div>
    </div>
  );
}

function ProductTile({ it, locale }: { it: TalentOffering; locale: string }) {
  // A product with no image degrades to a service-style row upstream; here we
  // always have an image or render a quiet ground (never an empty gray box).
  return (
    <div
      className="overflow-hidden rounded-[var(--plt-radius-md)] border"
      style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg-raised)" }}
      data-offering-tile={it.id}
    >
      {it.imageUrls[0] ? (
        <span className="relative block aspect-square w-full">
          <Image src={it.imageUrls[0]} alt={it.title} fill sizes="(max-width: 640px) 50vw, 220px" className="object-cover" />
        </span>
      ) : null}
      <div className="p-3">
        <p className="truncate text-sm font-medium" style={{ color: "var(--plt-ink)" }}>
          {it.title}
        </p>
        <p className="mt-0.5 text-sm font-medium tabular-nums" style={{ color: "var(--plt-ink)" }}>
          {offeringPriceLabel(it, locale)}
        </p>
        <div className="mt-2">
          <OfferingCta offering={it} locale={locale} compact />
        </div>
      </div>
    </div>
  );
}

function FeaturedRail({ it, locale }: { it: TalentOffering; locale: string }) {
  const tag = pickLocale(locale, { en: "Signature", es: "Insignia" });
  return (
    <div
      className="mb-5 flex flex-col overflow-hidden rounded-[var(--plt-radius-md)] border sm:flex-row"
      style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg-raised)" }}
      data-offering-featured={it.id}
    >
      {it.imageUrls[0] ? (
        <span className="relative block aspect-[16/9] w-full sm:aspect-auto sm:w-2/5">
          <Image src={it.imageUrls[0]} alt={it.title} fill sizes="(max-width: 640px) 100vw, 420px" className="object-cover" />
        </span>
      ) : null}
      <div className="flex flex-1 flex-col gap-1.5 p-4 sm:p-5">
        <span className="plt-mono text-[0.625rem] uppercase tracking-[0.14em]" style={{ color: "var(--plt-muted-soft)" }}>
          ★ {tag}
        </span>
        <p className="text-base font-medium" style={{ color: "var(--plt-ink)" }}>
          {it.title}
        </p>
        {it.description ? (
          <p className="line-clamp-2 text-sm" style={{ color: "var(--plt-muted)" }}>
            {it.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <p className="text-sm font-medium tabular-nums" style={{ color: "var(--plt-ink)" }}>
            {offeringPriceLabel(it, locale)}
          </p>
          <OfferingCta offering={it} locale={locale} />
        </div>
      </div>
    </div>
  );
}

export function TalentStorefront({
  offerings,
  locale,
  heading,
}: {
  offerings: TalentOffering[];
  locale: string;
  heading: string;
}) {
  // Defensive re-filter (loader already applies the public policy).
  const visible = offerings.filter(
    (o) => o.status === "published" && o.visibility !== "agency_only" && o.moderationState === "approved",
  );
  if (visible.length === 0) return null;

  // One featured hero (first featured by sort). It leaves its group.
  const featured = visible.find((o) => o.isFeatured) ?? null;
  const rest = featured ? visible.filter((o) => o.id !== featured.id) : visible;

  // Products without an image read as rows, not empty tiles.
  const groups = GROUP_ORDER.map((kind) => ({
    kind,
    items: rest.filter((o) => (kind === "service" ? o.kind === "service" || (o.kind === "product" && !o.imageUrls[0]) : kind === "product" ? o.kind === "product" && !!o.imageUrls[0] : o.kind === kind)),
  })).filter((g) => g.items.length > 0);
  const multiGroup = groups.length > 1;

  return (
    <section aria-labelledby="storefront-heading" data-profile-section="storefront">
      <LightSectionLabel id="storefront-heading">{heading}</LightSectionLabel>

      <div className="mt-5">
        {featured ? <FeaturedRail it={featured} locale={locale} /> : null}

        {groups.map((g) => (
          <div key={g.kind} className="mb-6 last:mb-0">
            {multiGroup ? (
              <p
                className="plt-mono mb-2 text-[0.625rem] uppercase tracking-[0.16em]"
                style={{ color: "var(--plt-muted-soft)" }}
              >
                {pickLocale(locale, GROUP_LABELS[g.kind])}
              </p>
            ) : null}

            {g.kind === "service" ? (
              <div
                className="rounded-[var(--plt-radius-md)] border px-4"
                style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg-raised)" }}
              >
                {g.items.map((it) => (
                  <ServiceRow key={it.id} it={it} locale={locale} />
                ))}
              </div>
            ) : g.kind === "package" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {g.items.map((it) => (
                  <PackageCard key={it.id} it={it} locale={locale} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {g.items.map((it) => (
                  <ProductTile key={it.id} it={it} locale={locale} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
