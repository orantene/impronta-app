"use client";

/**
 * `services_catalog` layout `matrix` (Gridline `.gl-mx` + `.gl-cards`).
 *
 * One component renders BOTH shapes from the same real offerings and the CSS
 * container query picks one:
 *  - wide (the block's own container >= 720px): a true `<table>`, one column
 *    per service, a sticky label column, a CTA row;
 *  - narrow: stacked `<article>` cards (header = name + price, a label/value
 *    list, the CTA).
 *
 * Rows: Precio, Duracion, Como se agenda (all from the offering: price,
 * duration, effective booking mode) and Materiales, Garantia, Respuesta (typed
 * per-service fields, `attributes.matrix`). A typed row no service filled is
 * dropped; the typed rows are never computed.
 *
 * Emergency column: the offering flagged `matrix.emergency`. It is highlighted
 * ONLY while the live status is on. Per the live-status widget contract the
 * "on" markup is emitted only when `liveStatus.emergenciesToday` is true, and
 * is marked `data-live-when="on"` so the expiry island can hide it at local
 * midnight without a reload. Token colours only.
 */
import type { ReactNode } from "react";

import { catalogRowCtaLabel } from "@/components/public-booking/catalog-booking-logic";
import { deriveOfferingCta } from "@/lib/talent/offering-cta-derivation";
import {
  PLATFORM_DEFAULT_BOOKING_POSTURE,
  type TalentBookingPosture,
} from "@/lib/talent/selling-booking-settings";
import type { LiveStatusRenderContext } from "@/lib/talent/live-status-render";
import {
  offeringMatrixFromAttributes,
  offeringMatrixValue,
  type OfferingMatrixKey,
} from "@/lib/talent/offering-matrix";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { catalogCtaTabIndex, moveCatalogCtaFocus } from "./catalog-keyboard";
import { catalogRowPriceText } from "./services-catalog-bar-price";
import { catalogDurationPhrase } from "./services-catalog-title";

type RowKey = "price" | "duration" | "booking" | OfferingMatrixKey;

const ROW_LABELS: Record<RowKey, { es: string; en: string }> = {
  price: { es: "Precio", en: "Price" },
  duration: { es: "Duración", en: "Duration" },
  booking: { es: "Cómo se agenda", en: "How it is booked" },
  materials: { es: "Materiales", en: "Materials" },
  warranty: { es: "Garantía", en: "Warranty" },
  response: { es: "Respuesta", en: "Response" },
};

const ROW_ORDER: RowKey[] = ["price", "duration", "booking", "materials", "warranty", "response"];

export const SERVICES_MATRIX_CSS = `
.sb-mx{container:sbmx/inline-size;width:100%;min-width:0;box-sizing:border-box;color:var(--token-color-ink);overflow-x:clip}
.sb-mx-scroll{display:none;overflow-x:clip;max-width:100%;width:100%}
/* TUL-496: fixed layout fills the band at 1280; cells wrap instead of a one-column scrollbar. */
.sb-mx-table{border-collapse:separate;border-spacing:0;table-layout:fixed;width:100%;font-size:13px;background:var(--token-color-surface-raised,var(--token-color-background));border:var(--token-shape-rule-width,1.5px) solid var(--token-color-ink);border-radius:var(--site-radius-md,10px);overflow:hidden}
.sb-mx-table th,.sb-mx-table td{position:relative;padding:10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--token-color-line);overflow-wrap:anywhere;word-break:break-word;min-width:0}
.sb-mx-table tr:last-child th,.sb-mx-table tr:last-child td{border-bottom:0}
.sb-mx-table thead th{background:var(--token-color-ink);color:var(--token-color-background);font:800 14px/1.15 var(--site-heading-font,inherit);font-stretch:108%}
.sb-mx-table tbody th{position:sticky;left:0;z-index:2;width:18%;background:var(--token-color-surface-raised,var(--token-color-background));font:500 10.5px var(--token-typography-label-font-family,var(--token-shell-header-nav-font,ui-monospace,monospace));letter-spacing:.05em;text-transform:uppercase;color:var(--token-color-muted);border-right:1px solid var(--token-color-line)}
.sb-mx-table thead th:first-child{position:sticky;left:0;z-index:3;width:18%}
.sb-mx-v{position:relative;z-index:1;min-width:0}
.sb-mx-v b{font:800 16px/1.2 var(--site-heading-font,inherit);overflow-wrap:anywhere}
.sb-mx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.sb-mx-dim{color:var(--token-color-muted)}
.sb-mx-cta{width:100%;min-height:44px;padding:0 12px;border-radius:var(--token-button-radius,6px);border:var(--token-shape-rule-width,1.5px) solid var(--token-color-ink);background:transparent;color:var(--token-color-ink);font:700 13.5px var(--site-body-font,inherit);cursor:pointer}
.sb-mx-cta[data-primary="1"],.sb-mx-cta[data-selected="true"]{background:var(--token-color-accent,var(--token-color-primary));color:var(--token-color-accent-on,var(--token-color-primary-on,var(--token-color-background)))}
.sb-mx-hl{position:absolute;inset:0;z-index:0;pointer-events:none;background:color-mix(in srgb,var(--token-color-accent,var(--token-color-primary)) 18%,transparent)}
.sb-mx-table thead .sb-mx-hl{background:var(--token-color-accent,var(--token-color-primary))}
[data-emergencies-today="on"] .sb-mx-table thead th[data-mx-emergency="1"]{color:var(--token-color-accent-on,var(--token-color-primary-on,var(--token-color-background)))}
[data-emergencies-today="on"] .sb-mx [data-mx-emergency="1"] .sb-mx-cta{background:var(--token-color-accent,var(--token-color-primary));color:var(--token-color-accent-on,var(--token-color-primary-on,var(--token-color-background)))}
.sb-mx-th{position:relative;z-index:1;overflow-wrap:anywhere}
.sb-mx-cards{display:grid;gap:8px}
.sb-mx-card{position:relative;display:grid;background:var(--token-color-surface-raised,var(--token-color-background));border:var(--token-shape-rule-width,1.5px) solid var(--token-color-ink);border-radius:var(--site-radius-md,10px);overflow:hidden}
.sb-mx-card-h{position:relative;display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:52px;padding:10px 12px;background:var(--token-color-ink);color:var(--token-color-background);font:800 16px/1.15 var(--site-heading-font,inherit)}
.sb-mx-card-h span{position:relative;z-index:1;font-weight:700;font-size:13px;white-space:nowrap}
.sb-mx-card-h b{position:relative;z-index:1;font-weight:inherit;overflow-wrap:anywhere;min-width:0}
.sb-mx-card-h .sb-mx-hl{background:var(--token-color-accent,var(--token-color-primary))}
[data-emergencies-today="on"] .sb-mx-card[data-mx-emergency="1"] .sb-mx-card-h{color:var(--token-color-accent-on,var(--token-color-primary-on,var(--token-color-background)))}
.sb-mx-ring{position:absolute;inset:0;pointer-events:none;border-radius:inherit;box-shadow:inset 0 0 0 2px var(--token-color-accent,var(--token-color-primary))}
.sb-mx-card dl{margin:0;padding:6px 12px;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:13.5px}
.sb-mx-card dt{padding-top:2px;font:500 10.5px var(--token-typography-label-font-family,var(--token-shell-header-nav-font,ui-monospace,monospace));letter-spacing:.05em;text-transform:uppercase;color:var(--token-color-muted)}
.sb-mx-card dd{margin:0;text-align:right;overflow-wrap:anywhere}
.sb-mx-card .sb-mx-cta{width:auto;margin:4px 12px 12px}
@container sbmx (min-width:720px){
  .sb-mx-scroll{display:block}
  .sb-mx-cards{display:none}
}
/* Viewport fallback: nested previews / padded bands can keep the container
   under 720px on a desktop host — still show the comparison table. */
@media (min-width:900px){
  .sb-mx-scroll{display:block}
  .sb-mx-cards{display:none}
}
`;

type Props = {
  items: ReadonlyArray<TalentOffering>;
  locale: string;
  confirmsByHand: boolean;
  bookingPosture?: TalentBookingPosture;
  ctaLabel?: string;
  liveStatus?: LiveStatusRenderContext | null;
  selectedIds?: ReadonlyArray<string>;
  /** First bookable offering id — sole Tab stop when nothing is selected (TUL-534). */
  rovingAnchorId?: string | null;
  onSelect: (item: TalentOffering) => void;
};

function bookingText(effectiveMode: string, quote: boolean, es: boolean): string {
  if (effectiveMode === "instant") return es ? "Reserva inmediata" : "Instant booking";
  if (effectiveMode === "inquiry" || quote) return es ? "Por cotización" : "By quote";
  return es ? "Con confirmación" : "Needs confirmation";
}

export function CatalogMatrix({
  items,
  locale,
  confirmsByHand,
  bookingPosture = PLATFORM_DEFAULT_BOOKING_POSTURE,
  ctaLabel,
  liveStatus,
  selectedIds = [],
  rovingAnchorId = null,
  onSelect,
}: Props): ReactNode {
  const es = locale.startsWith("es");
  const emergencyOn = liveStatus?.emergenciesToday === true;
  const label = (k: RowKey) => (es ? ROW_LABELS[k].es : ROW_LABELS[k].en);
  const cols = items.map((item) => {
    const derived = deriveOfferingCta({ offering: item, defaults: { bookingPosture }, confirmsByHand });
    const quote =
      item.priceDisplay === "quote" || item.priceType === "custom" || item.amountCents == null;
    const selected = selectedIds.includes(item.id);
    const cta = catalogRowCtaLabel({
      selected,
      offering: item,
      locale,
      inspectorLabel: selected ? undefined : ctaLabel,
      confirmsByHand,
      bookingPosture,
    });
    const emergency = offeringMatrixFromAttributes(item.attributes).emergency === true;
    const cell = (k: RowKey): ReactNode => {
      if (k === "price") return <b>{catalogRowPriceText(item, locale)}</b>;
      if (k === "duration") {
        return item.durationMinutes && item.kind !== "product"
          ? catalogDurationPhrase(item.durationMinutes, locale)
          : <span className="sb-mx-dim">{es ? "Según el trabajo" : "Depends on the job"}</span>;
      }
      if (k === "booking") return bookingText(derived.effectiveMode, quote, es);
      const typed = offeringMatrixValue(item.attributes, k, locale);
      return typed || <span className="sb-mx-dim" aria-hidden>{"·"}</span>;
    };
    return { item, derived, selected, cta, emergency, cell };
  });
  // A typed row no service filled disappears; price, duration and booking always show.
  const rows = ROW_ORDER.filter(
    (k) =>
      k === "price" ||
      k === "duration" ||
      k === "booking" ||
      items.some((o) => offeringMatrixValue(o.attributes, k, locale) !== ""),
  );
  const hl = (e: boolean, kind: "fill" | "ring") =>
    e && emergencyOn ? (
      <span className={kind === "ring" ? "sb-mx-ring" : "sb-mx-hl"} data-live-when="on" aria-hidden="true" />
    ) : null;
  const button = (c: (typeof cols)[number]) =>
    c.derived.hidden ? null : (
      <button
        type="button"
        className="sb-mx-cta"
        data-offering-cta={c.derived.cta}
        data-offering-id={c.item.id}
        data-primary={c.derived.effectiveMode === "instant" ? "1" : undefined}
        data-selected={c.selected ? "true" : undefined}
        aria-pressed={c.selected}
        tabIndex={catalogCtaTabIndex({
          selected: c.selected,
          rovingAnchor: selectedIds.length === 0 && c.item.id === rovingAnchorId,
        })}
        onClick={() => onSelect(c.item)}
        onKeyDown={(e) => {
          if (
            e.key === "ArrowDown" ||
            e.key === "ArrowUp" ||
            e.key === "ArrowRight" ||
            e.key === "ArrowLeft"
          ) {
            e.preventDefault();
            moveCatalogCtaFocus(e.currentTarget, e.key);
          }
        }}
      >
        {c.cta}
      </button>
    );
  return (
    <div className="sb-mx" data-services-matrix="" data-emergency={emergencyOn ? "on" : "off"}>
      <style>{SERVICES_MATRIX_CSS}</style>
      <div className="sb-mx-scroll">
        <table className="sb-mx-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sb-mx-sr">{es ? "Servicio" : "Service"}</span>
              </th>
              {cols.map((c) => (
                <th key={c.item.id} scope="col" data-mx-emergency={c.emergency ? "1" : undefined}>
                  {hl(c.emergency, "fill")}
                  <span className="sb-mx-th">{c.item.title}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k}>
                <th scope="row">{label(k)}</th>
                {cols.map((c) => (
                  <td key={c.item.id} data-mx-emergency={c.emergency ? "1" : undefined}>
                    {hl(c.emergency, "fill")}
                    <span className="sb-mx-v">{c.cell(k)}</span>
                  </td>
                ))}
              </tr>
            ))}
            <tr data-mx-cta-row="">
              <th scope="row">
                <span className="sb-mx-sr">{es ? "Reservar" : "Book"}</span>
              </th>
              {cols.map((c) => (
                <td key={c.item.id} data-mx-emergency={c.emergency ? "1" : undefined}>
                  {hl(c.emergency, "fill")}
                  <span className="sb-mx-v">{button(c)}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="sb-mx-cards">
        {cols.map((c) => (
          <article key={c.item.id} className="sb-mx-card" data-mx-emergency={c.emergency ? "1" : undefined}>
            {hl(c.emergency, "ring")}
            <div className="sb-mx-card-h">
              {hl(c.emergency, "fill")}
              <b>{c.item.title}</b>
              <span>{catalogRowPriceText(c.item, locale)}</span>
            </div>
            <dl>
              {rows
                .filter((k) => k !== "price")
                .map((k) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{label(k)}</dt>
                    <dd>{c.cell(k)}</dd>
                  </div>
                ))}
            </dl>
            {button(c)}
          </article>
        ))}
      </div>
    </div>
  );
}
