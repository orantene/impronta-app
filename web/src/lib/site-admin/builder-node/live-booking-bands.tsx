import type { CSSProperties } from "react";

import { BookPageClient } from "@/app/(public)/book/BookPageClient";

import type { LiveBookingSurface, LiveServiceCard } from "./live-booking-markers";

/**
 * TUL-77: render-time replacements for the composer's marked bands.
 * Both are presentational; the data comes from `dataSources.liveBooking`.
 */

const MUTED = "var(--token-color-muted, rgba(11,11,13,0.62))";

export function formatServicePrice(
  amountCents: number | null,
  currency: string,
  locale: string | undefined,
): string | null {
  if (amountCents == null) return null;
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

export function serviceMetaLine(card: LiveServiceCard, locale: string | undefined): string {
  const parts: string[] = [];
  const price = formatServicePrice(card.amountCents, card.currency, locale);
  if (price) parts.push(price);
  if (card.durationMinutes) parts.push(`${card.durationMinutes} min`);
  return parts.join(" · ");
}

const cardStyle: CSSProperties = {
  border: "1px solid rgba(24,24,27,0.12)",
  borderRadius: 12,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

export function LiveServicesBand({
  nodeId,
  surface,
  locale,
  bookHref,
}: {
  nodeId: string;
  surface: LiveBookingSurface;
  locale?: string;
  bookHref: string;
}) {
  const es = locale === "es";
  return (
    <div
      data-builder-node-id={nodeId}
      data-builder-node-kind="container"
      data-live-services=""
      style={{ width: "100%", maxWidth: 1100, margin: "0 auto", padding: "32px 16px" }}
    >
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}
      >
        {surface.services.map((s) => {
          const meta = serviceMetaLine(s, locale);
          return (
            <li key={s.id} style={cardStyle}>
              <h3 style={{ margin: 0 }}>{s.title}</h3>
              {meta ? <p style={{ margin: 0, color: MUTED }}>{meta}</p> : null}
              {s.description ? <p style={{ margin: 0 }}>{s.description}</p> : null}
              {s.bookable ? (
                <a href={bookHref} style={{ marginTop: 8, fontWeight: 600 }}>
                  {es ? "Agendar" : "Book"}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LiveBookingBand({
  nodeId,
  surface,
  tenantId,
}: {
  nodeId: string;
  surface: LiveBookingSurface;
  tenantId: string;
}) {
  return (
    <div
      data-builder-node-id={nodeId}
      data-builder-node-kind="container"
      data-live-booking=""
      style={{ width: "100%", maxWidth: 640, margin: "0 auto", padding: "32px 16px" }}
    >
      <BookPageClient
        tenantSlug={surface.tenantSlug}
        tenantId={tenantId}
        agencyName={surface.agencyName}
        offerings={surface.offerings}
        signedIn={surface.signedIn}
        captcha={surface.captcha}
      />
    </div>
  );
}
