/**
 * StorefrontBody — the kind-aware render body of the public Services section.
 *
 * Directive-free (no "use client", no server-only) so BOTH the server
 * TalentStorefront and the client StorefrontFilter island can render it: the
 * server renders the full list for SEO; the filter re-renders a category subset
 * on click. Given an already-public-filtered `visible` list it extracts one
 * featured hero, groups the rest by kind (service rows / package cards / product
 * tiles, always in that order), and prints per-kind sub-headings only when 2+
 * groups are present. Money resolves in Messages / instant-book, never here.
 */

import Image from "next/image";
import type { TalentOffering, OfferingKind } from "@/lib/talent/offerings-types";
import { offeringPriceLabel } from "@/lib/talent/offerings-types";
import { OfferingCta } from "./OfferingCta";
import { pickLocale } from "@/lib/i18n/pick-locale";

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
  // Sold out is a POOL fact, not a kind fact. Gating on `kind === "product"`
  // meant a seat-limited package never showed sold out, because it never sold
  // down. `inventoryQty` is the pool mirror maintained by the stock RPCs, so a
  // null pool is genuinely unlimited and 0 is genuinely gone.
  const soldOut = it.capacityPoolId != null && it.inventoryQty === 0;
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
      {soldOut ? (
        <span className="plt-mono inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[0.625rem] uppercase tracking-[0.1em]" style={{ borderColor: "var(--plt-hairline-strong)", color: "var(--plt-muted-soft)" }}>
          {locale === "es" ? "Agotado" : "Sold out"}
        </span>
      ) : (
        <OfferingCta offering={it} locale={locale} compact />
      )}
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
  const soldOut = it.capacityPoolId != null && it.inventoryQty === 0;
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
          {soldOut ? (
            <span className="plt-mono inline-flex items-center rounded-full border px-2 py-1 text-[0.625rem] uppercase tracking-[0.1em]" style={{ borderColor: "var(--plt-hairline-strong)", color: "var(--plt-muted-soft)" }}>
              {locale === "es" ? "Agotado" : "Sold out"}
            </span>
          ) : (
            <OfferingCta offering={it} locale={locale} compact />
          )}
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

/**
 * Render body for an already-public-filtered offering list. `featured` may be
 * suppressed by the caller (the category filter hides the hero unless it matches
 * the active category, so a filtered view doesn't show an off-category hero).
 */
export function StorefrontBody({
  visible,
  locale,
  showFeatured = true,
}: {
  visible: TalentOffering[];
  locale: string;
  showFeatured?: boolean;
}) {
  if (visible.length === 0) return null;

  const featured = showFeatured ? visible.find((o) => o.isFeatured) ?? null : null;
  const rest = featured ? visible.filter((o) => o.id !== featured.id) : visible;

  // Products without an image read as rows, not empty tiles.
  const groups = GROUP_ORDER.map((kind) => ({
    kind,
    items: rest.filter((o) => (kind === "service" ? o.kind === "service" || (o.kind === "product" && !o.imageUrls[0]) : kind === "product" ? o.kind === "product" && !!o.imageUrls[0] : o.kind === kind)),
  })).filter((g) => g.items.length > 0);
  const multiGroup = groups.length > 1;

  return (
    <>
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
    </>
  );
}
