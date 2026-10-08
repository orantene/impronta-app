"use client";

/**
 * Wave 2: slim demo profile rail (city, languages, booking, currency, apps,
 * sections) plus a one-line "what changes / what stays" tip.
 */
import type { GalleryDemo } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { demoProfileMetaFor, type DemoProfileMeta } from "@/lib/talent-site/demos/demo-profile-meta";
import { detailT } from "./theme-detail-copy";
import type { MaisonSetupLocale } from "./maison-setup-copy";

const BOOKING: Record<DemoProfileMeta["bookingMode"], { en: string; es: string }> = {
  instant: { en: "Instant book", es: "Reserva al instante" },
  request: { en: "By request", es: "Con solicitud" },
  quote: { en: "Quote first", es: "Cotización primero" },
  mixed: { en: "Mixed modes", es: "Varios modos" },
};

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px] leading-snug text-admin-ink">
      <span aria-hidden className="mt-0.5 w-4 shrink-0 text-center text-[12px] text-admin-ink-dim">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="sr-only">{label}: </span>
        {value}
      </span>
    </li>
  );
}

export function DemoProfilePanel({
  demo,
  locale,
}: {
  demo: GalleryDemo | null;
  locale: MaisonSetupLocale;
}) {
  const meta = demoProfileMetaFor(demo);
  if (!meta || demo?.status !== "built") return null;

  const langs =
    meta.siteLangs.length > 0
      ? meta.siteLangs.map((l) => l.toUpperCase()).join("·")
      : meta.languages.join(" · ");
  const city = meta.city ? (meta.country === "US" ? `${meta.city}, US` : meta.city) : detailT(locale, "City not set");
  const booking = BOOKING[meta.bookingMode][locale === "es" ? "es" : "en"];
  const apps = meta.apps.length ? meta.apps.join(" · ") : detailT(locale, "No apps");
  const sections = meta.sections.slice(0, 6).join(" · ");

  return (
    <div data-testid="demo-profile-panel" className="space-y-2">
      <p className="text-[13px] font-semibold text-admin-ink">{detailT(locale, "This demo")}</p>
      <ul className="space-y-1.5">
        <Row icon="📍" label={detailT(locale, "City")} value={city} />
        <Row icon="🗣" label={detailT(locale, "Languages")} value={langs} />
        <Row icon="📅" label={detailT(locale, "Booking")} value={booking} />
        <Row icon="💱" label={detailT(locale, "Currency")} value={meta.currency} />
        <Row icon="🧩" label={detailT(locale, "Apps")} value={apps} />
        <Row icon="🧱" label={detailT(locale, "Sections")} value={sections} />
      </ul>
      <p
        className="text-[11.5px] leading-snug text-admin-ink-muted"
        title={detailT(locale, "What changes: layout, colours, sections, apps. What stays yours: services, prices, booking settings, languages, domain.")}
      >
        <span className="font-semibold text-admin-ink-dim">ⓘ </span>
        {detailT(locale, "Layout and sample content change. Your services, prices and domain stay yours.")}
      </p>
    </div>
  );
}
