"use client";

/**
 * ticket_picker — the guest buys a ticket (E5 step 4, CARD ONLY).
 *
 * THE ONE RULE: this block never renders a buy control it cannot complete.
 * It shows exactly one of a WORKING purchase (a scheduled night, a tier on
 * sale with a pool on that night, the card hop live) or an HONEST state that
 * names why not: `not_configured` (empty tenant or event), no night
 * scheduled, not on sale, sold out. "Sold out" is the reserve's answer after
 * the click, shown as a state — never a dead button.
 *
 * Self-fetch class like `session_picker` (CEO ruling): tenant and event from
 * props, data through dynamically imported server actions. Empty props render
 * `not_configured` and never call an action — the schema would refuse them
 * anyway; the point is that the AUTHOR sees "not configured", not an outage.
 * Dynamic import is required so fidelity/perf (which import this island via
 * `render.tsx`) do not pull `server-only` purchase modules into Node.
 * The dedicated `/events/<slug>` page also server-seeds `preload` so first
 * paint is not a client round-trip.
 *
 * Chrome uses the tenant's projected `--token-color-*` roles (primary, ink,
 * line, surface-raised, muted, primary-on). No parallel palette.
 *
 * NO REMAINING COUNTS on purpose (Capacity ruling): availability is the
 * pool's answer at reserve time.
 *
 * Pay-at-the-door is step 1b. Its rule is computed and SHOWN per night so the
 * guest reads the true sentence ("opens closer to the date" / "doors are
 * open"), but it is not offered as a choice here.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { PickerNight, PickerTier } from "@/app/(public)/_events/ticket-picker-actions";
import { afterTicketPurchaseSuccess } from "@/lib/events/ticket-purchase";

type Locale = "en" | "es";
function pickLocale(raw?: string): Locale { return raw?.toLowerCase().startsWith("es") ? "es" : "en"; }
function newOrderKey(): string {
  try { return crypto.randomUUID(); } catch {
    const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`;
  }
}

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    heading: "Tickets",
    night: "Pick a night",
    tier: "Pick a ticket",
    loading: "Loading tickets...",
    not_configured: "This block is not set up yet: it needs an event to sell.",
    noNights: "No night is on sale yet.",
    noTiers: "No ticket is on sale for that night yet.",
    quantity: "How many",
    decrease: "Fewer",
    increase: "More",
    email: "Email",
    emailHelp: "Your ticket goes here. If you cannot open it, we will find you by name at the door.",
    emailPlaceholder: "you@email.com",
    name: "Name",
    namePlaceholder: "Your name",
    buy: "Buy with card",
    buyFree: "Get your ticket",
    free: "Free",
    admits: "admits {n}",
    payHow: "How will you pay",
    payCard: "Card now",
    payDoor: "At the door",
    payDoorHelp: "Your seats are held until the night ends. Pay at the door when you arrive. Offered only up to 7 days before the night.",
    holdDoor: "Holding your seats for the door...",
    heldDoor: "Your seats are held. Pay at the door when you arrive. Your receipt:",
    buying: "Holding your seats...",
    redirecting: "Taking you to payment...",
    door_opens_closer: "Paying at the door opens closer to the date.",
    door_doors_open: "Doors are open: pay at the door in person.",
    door_offered: "Paying at the door is available closer to the night.",
    sold_out: "That night just sold out at that ticket. Pick another and it is yours.",
    night_not_on_sale: "That night is no longer on sale. Pick another.",
    tier_not_on_sale: "That ticket is not on sale right now.",
    quantity_err: "That number of tickets is outside what one order can hold.",
    not_sellable: "This event is not on sale just now.",
    unavailable: "We could not load the tickets. Nothing was charged. Try again.",
    invalid_request: "Something in that did not look right. Check the details and try again.",
    engine_error: "Something went wrong at our end. Nothing was charged.",
    pay_at_door_not_yet: "Paying at the door is not available online yet. Pay by card, or at the door on the night.",
    pay_at_door_not_offered: "Paying at the door is not offered for that night.",
    emailRequired: "We need an email to send your ticket to.",
    not_found: "We could not find that order. Nothing was charged.",
  },
  es: {
    heading: "Entradas",
    night: "Elegí una noche",
    tier: "Elegí una entrada",
    loading: "Cargando entradas...",
    not_configured: "Este bloque aún no está configurado: necesita un evento para vender.",
    noNights: "Todavía no hay ninguna noche a la venta.",
    noTiers: "Todavía no hay entradas a la venta para esa noche.",
    quantity: "Cuántas",
    decrease: "Menos",
    increase: "Más",
    email: "Correo",
    emailHelp: "Tu entrada llega acá. Si no podés abrirla, te buscamos por tu nombre en la puerta.",
    emailPlaceholder: "tu@correo.com",
    name: "Nombre",
    namePlaceholder: "Tu nombre",
    buy: "Pagar con tarjeta",
    buyFree: "Conseguir entrada",
    free: "Gratis",
    admits: "admite {n}",
    payHow: "Como vas a pagar",
    payCard: "Tarjeta ahora",
    payDoor: "En la puerta",
    payDoorHelp: "Tus plazas quedan reservadas hasta que termine la noche. Pagas en la puerta al llegar. Solo hasta 7 dias antes de la noche.",
    holdDoor: "Reservando tus plazas para la puerta...",
    heldDoor: "Tus plazas estan reservadas. Pagas en la puerta al llegar. Tu recibo:",
    buying: "Reservando tus plazas...",
    redirecting: "Llevandote al pago...",
    door_opens_closer: "Pagar en la puerta se abre más cerca de la fecha.",
    door_doors_open: "Las puertas están abiertas: pagá en la puerta en persona.",
    door_offered: "Pagar en la puerta estará disponible más cerca de la noche.",
    sold_out: "Esa noche se acaba de agotar con esa entrada. Elegí otra y es tuya.",
    night_not_on_sale: "Esa noche ya no está a la venta. Elegí otra.",
    tier_not_on_sale: "Esa entrada no está a la venta ahora.",
    quantity_err: "Ese número de entradas está fuera de lo que admite un pedido.",
    not_sellable: "Este evento no está a la venta por ahora.",
    unavailable: "No pudimos cargar las entradas. No se cobró nada. Intentá de nuevo.",
    invalid_request: "Algo no se ve bien. Revisá los datos e intentá de nuevo.",
    engine_error: "Algo falló de nuestro lado. No se cobró nada.",
    pay_at_door_not_yet: "Pagar en la puerta aún no está disponible en línea. Pagá con tarjeta, o en la puerta esa noche.",
    pay_at_door_not_offered: "Pagar en la puerta no se ofrece para esa noche.",
    emailRequired: "Necesitamos un correo para enviarte la entrada.",
    not_found: "No encontramos ese pedido. No se cobró nada.",
  },
};

const TP_CSS = `
[data-ticket-picker]{color:var(--token-color-ink);font:inherit}
[data-ticket-picker="root"],[data-ticket-picker="held"],[data-ticket-picker="not_configured"]{padding:1.25rem 1.35rem}
[data-ticket-picker] .tp-title{margin:0 0 1rem;font-size:1.05rem;font-weight:600;letter-spacing:-0.01em}
[data-ticket-picker] .tp-status{margin:0;color:var(--token-color-muted,inherit)}
[data-ticket-picker] .tp-section{margin:0 0 1.15rem}
[data-ticket-picker] .tp-section:last-of-type{margin-bottom:0}
[data-ticket-picker] .tp-label{display:block;margin:0 0 0.55rem;font-size:0.72rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--token-color-muted)}
[data-ticket-picker] .tp-choices{display:flex;flex-direction:column;gap:0.5rem}
[data-ticket-picker] .tp-choice{display:grid;grid-template-columns:1.15rem 1fr auto;gap:0.75rem;align-items:center;margin:0;padding:0.85rem 1rem;border:1px solid var(--token-color-line);border-radius:14px;background:color-mix(in srgb,var(--token-color-ink) 4%,var(--token-color-surface-raised,transparent));cursor:pointer;transition:border-color 160ms ease,box-shadow 160ms ease,background-color 160ms ease}
[data-ticket-picker] .tp-choice:hover{border-color:color-mix(in srgb,var(--token-color-primary) 45%,transparent)}
[data-ticket-picker] .tp-choice[data-on="1"]{border-color:var(--token-color-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--token-color-primary) 22%,transparent);background:color-mix(in srgb,var(--token-color-primary) 10%,var(--token-color-surface-raised,transparent))}
[data-ticket-picker] .tp-choice[data-off="1"]{opacity:0.55;cursor:not-allowed}
[data-ticket-picker] .tp-radio{appearance:none;-webkit-appearance:none;width:1.15rem;height:1.15rem;margin:0;border:1.5px solid color-mix(in srgb,var(--token-color-ink) 35%,transparent);border-radius:50%;background:transparent;accent-color:var(--token-color-primary)}
[data-ticket-picker] .tp-choice[data-on="1"] .tp-radio{border-color:var(--token-color-primary);box-shadow:inset 0 0 0 3.5px var(--token-color-primary)}
[data-ticket-picker] .tp-choice-copy{min-width:0}
[data-ticket-picker] .tp-choice-title{display:block;font-weight:600;line-height:1.3}
[data-ticket-picker] .tp-choice-meta{display:block;margin-top:0.2rem;font-size:0.82rem;line-height:1.35;color:var(--token-color-muted)}
[data-ticket-picker] .tp-price{font-size:0.92rem;font-weight:600;white-space:nowrap;color:var(--token-color-ink)}
[data-ticket-picker] .tp-price[data-free="1"]{color:var(--token-color-primary)}
[data-ticket-picker] .tp-fields{display:flex;flex-direction:column;gap:0.85rem;margin-top:0.25rem}
[data-ticket-picker] .tp-field-label{display:block;margin:0 0 0.4rem;font-size:0.82rem;font-weight:600}
[data-ticket-picker] .tp-help{display:block;margin-top:0.4rem;font-size:0.8rem;line-height:1.4;color:var(--token-color-muted)}
[data-ticket-picker] .tp-field{width:100%;box-sizing:border-box;font:inherit;font-size:16px;line-height:1.45;color:var(--token-color-ink);background:color-mix(in srgb,var(--token-color-ink) 8%,var(--token-color-surface-raised,transparent));border:1px solid color-mix(in srgb,var(--token-color-ink) 28%,transparent);border-radius:12px;padding:0.8rem 0.95rem;outline:none;transition:border-color 160ms ease,box-shadow 160ms ease}
[data-ticket-picker] .tp-field::placeholder{color:var(--token-color-muted);opacity:1}
[data-ticket-picker] .tp-field:hover{border-color:color-mix(in srgb,var(--token-color-primary) 45%,transparent)}
[data-ticket-picker] .tp-field:focus,[data-ticket-picker] .tp-field:focus-visible{border-color:var(--token-color-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--token-color-primary) 26%,transparent)}
[data-ticket-picker] .tp-stepper{display:inline-flex;align-items:center;gap:0.35rem;border:1px solid var(--token-color-line);border-radius:999px;padding:0.2rem;background:color-mix(in srgb,var(--token-color-ink) 5%,var(--token-color-surface-raised,transparent))}
[data-ticket-picker] .tp-step{width:2.1rem;height:2.1rem;border:0;border-radius:999px;background:transparent;color:var(--token-color-ink);font:inherit;font-size:1.15rem;line-height:1;cursor:pointer}
[data-ticket-picker] .tp-step:disabled{opacity:0.35;cursor:not-allowed}
[data-ticket-picker] .tp-step:not(:disabled):hover{background:color-mix(in srgb,var(--token-color-primary) 16%,transparent)}
[data-ticket-picker] .tp-qty{min-width:1.6rem;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
[data-ticket-picker] .tp-cta{display:block;width:100%;margin-top:0.35rem;border:0;border-radius:999px;padding:0.9rem 1.6rem;font:inherit;font-size:0.95rem;font-weight:600;letter-spacing:0.02em;background:var(--token-color-primary);color:var(--token-color-primary-on,var(--primary-foreground));cursor:pointer}
[data-ticket-picker] .tp-cta:disabled{opacity:0.55;cursor:not-allowed}
[data-ticket-picker] .tp-cta:not(:disabled):hover{filter:brightness(1.06)}
[data-ticket-picker] .tp-alert{margin-top:1rem;padding:0.75rem 0.9rem;border-radius:12px;background:color-mix(in srgb,var(--token-color-primary) 12%,transparent);color:var(--token-color-ink);font-size:0.9rem;line-height:1.4}
[data-ticket-picker="held"] a{color:var(--token-color-primary);font-weight:600}
`;

export interface TicketPickerIslandProps {
  tenantId: string;
  eventId: string;
  title?: string;
  locale?: string;
  /**
   * TEST-ONLY: seed the loaded state so a static render (the Creative
   * Director's file review) shows a real state instead of "loading". Never
   * set on a live page; when set, no action is called.
   */
  preload?: { eventTitle: string; currency: string; timeZone: string | null; tiers: PickerTier[]; nights: PickerNight[] } | null;
}

function formatWhen(iso: string, timeZone: string | null, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso));
  } catch { return iso; }
}
function money(cents: number, currency: string, locale: Locale, freeLabel: string): string {
  if (cents === 0) return freeLabel;
  try { return new Intl.NumberFormat(locale === "es" ? "es" : "en", { style: "currency", currency }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Loaded = { eventTitle: string; currency: string; timeZone: string | null; tiers: PickerTier[]; nights: PickerNight[] };

export function TicketPickerIsland({ tenantId, eventId, title, locale, preload }: TicketPickerIslandProps) {
  const loc = pickLocale(locale);
  const t = (key: string) => COPY[loc][key] ?? COPY.en[key] ?? key;
  // NOT CONFIGURED is decided here, before any action: an author who dropped
  // the block with no event sees why, not an outage.
  const configured = UUID.test(tenantId) && UUID.test(eventId);

  const [data, setData] = useState<Loaded | null>(preload ?? null);
  const [loadRefusal, setLoadRefusal] = useState<string | null>(null);
  const [night, setNight] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orderKey, setOrderKey] = useState(() => newOrderKey());
  const [busy, setBusy] = useState<"idle" | "holding" | "redirecting">("idle");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [payHow, setPayHow] = useState<"full" | "in_person">("full");
  const [held, setHeld] = useState<{ receiptCode: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!configured || preload) return;
    try {
      const { loadTicketPicker } = await import("@/app/(public)/_events/ticket-picker-actions");
      const res = await loadTicketPicker({ tenantId, eventId });
      if (res.ok) { setData({ eventTitle: res.eventTitle, currency: res.currency, timeZone: res.timeZone, tiers: res.tiers, nights: res.nights }); setLoadRefusal(null); }
      else { setData(null); setLoadRefusal(t(res.reason)); }
    } catch { setData(null); setLoadRefusal(t("unavailable")); }
  }, [configured, preload, tenantId, eventId, loc]);
  useEffect(() => { void load(); }, [load]);

  const chosenNight = useMemo(() => data?.nights.find((n) => n.sessionId === night) ?? null, [data, night]);
  // A tier is offered for a night ONLY when it is on sale AND has a pool on
  // that night. Anything else is not a choice, so it is not a control.
  const offeredTiers = useMemo(
    () => (data && chosenNight ? data.tiers.filter((x) => x.onSale && chosenNight.sellableVariantIds.includes(x.variantId)) : []),
    [data, chosenNight],
  );
  const chosenTier = offeredTiers.find((x) => x.variantId === tier) ?? null;
  const canBuy = Boolean(chosenNight && chosenTier) && busy === "idle";
  const showQty = Boolean(chosenTier && (chosenTier.minPerOrder !== 1 || chosenTier.maxPerOrder !== 1));

  async function buy() {
    if (!chosenNight || !chosenTier || busy !== "idle") return;
    if (!email.trim()) { setRefusal(t("emailRequired")); return; }
    setBusy("holding"); setRefusal(null);
    try {
      const { startTicketPurchase, startTicketCardPayment } = await import("@/app/(public)/_events/ticket-picker-actions");
      const choice = chosenNight.door.offered ? payHow : "full";
      const res = await startTicketPurchase({
        tenantId, eventId, sessionId: chosenNight.sessionId, variantId: chosenTier.variantId, units: qty,
        email: email.trim(), displayName: name.trim() || undefined, clientOrderKey: orderKey, paymentChoice: choice, locale: loc,
      });
      if (!res.ok) {
        setRefusal(t(res.reason === "quantity" ? "quantity_err" : res.reason));
        setOrderKey(newOrderKey()); // a NEW cart after a refusal
        void load(); // seats moved under us; the list on screen may now be a lie
        setBusy("idle");
        return;
      }
      const next = afterTicketPurchaseSuccess(res);
      if (next === "held") {
        // Seats held until the night ends; no card, no transaction. The receipt
        // shows the amount due and no QR until it is settled at the door.
        setHeld({ receiptCode: res.receiptCode });
        setBusy("idle");
        return;
      }
      if (next === "receipt" && res.receiptCode) {
        window.location.assign(`/r/${res.receiptCode}`);
        return;
      }
      if (next !== "card" || !res.transactionId) {
        setRefusal(t("engine_error"));
        setOrderKey(newOrderKey());
        setBusy("idle");
        return;
      }
      setBusy("redirecting");
      const pay = await startTicketCardPayment({ tenantId, orderId: res.orderId, transactionId: res.transactionId, locale: loc });
      if (!pay.ok) { setRefusal(t(pay.reason)); setBusy("idle"); return; }
      window.location.assign(pay.url);
    } catch {
      setRefusal(t("engine_error")); setOrderKey(newOrderKey()); setBusy("idle");
    }
  }

  const doorSentence = (n: PickerNight): string | null =>
    n.door.offered ? t("door_offered")
    : n.door.reason === "opens_closer_to_date" ? t("door_opens_closer")
    : n.door.reason === "doors_open" ? t("door_doors_open")
    : null;

  const chrome = (state: string, children: ReactNode) => (
    <div data-ticket-picker={state}>
      <style>{TP_CSS}</style>
      {children}
    </div>
  );

  if (!configured) return chrome("not_configured", <p className="tp-status">{t("not_configured")}</p>);
  if (held) {
    return chrome("held", (
      <p className="tp-status">
        {t("heldDoor")}{" "}
        {held.receiptCode ? <a href={`/r/${held.receiptCode}`}>/r/{held.receiptCode}</a> : null}
      </p>
    ));
  }

  const ctaLabel = busy === "holding"
    ? (chosenNight?.door.offered && payHow === "in_person" ? t("holdDoor") : t("buying"))
    : busy === "redirecting"
      ? t("redirecting")
      : (chosenNight?.door.offered && payHow === "in_person"
        ? t("payDoor")
        : (chosenTier && chosenTier.amountCents === 0 ? t("buyFree") : t("buy")));

  return chrome("root", (
    <>
      {title ? <h3 className="tp-title">{title}</h3> : null}

      {loadRefusal ? (
        <p className="tp-status" data-ticket-picker="refused">{loadRefusal}</p>
      ) : data === null ? (
        <p className="tp-status">{t("loading")}</p>
      ) : data.nights.length === 0 ? (
        <p className="tp-status" data-ticket-picker="no_nights">{t("noNights")}</p>
      ) : (
        <>
          <div className="tp-section" role="radiogroup" aria-label={t("night")}>
            <div className="tp-label">{t("night")}</div>
            <div className="tp-choices">
              {data.nights.map((n) => {
                const sellable = n.sellableVariantIds.some((id) => data.tiers.find((x) => x.variantId === id)?.onSale);
                const ds = doorSentence(n);
                const on = night === n.sessionId;
                return (
                  <label key={n.sessionId} className="tp-choice" data-on={on ? "1" : undefined} data-off={sellable ? undefined : "1"}>
                    <input
                      className="tp-radio"
                      type="radio"
                      name="night"
                      value={n.sessionId}
                      disabled={!sellable}
                      checked={on}
                      onChange={() => { setNight(n.sessionId); setTier(null); setRefusal(null); }}
                    />
                    <span className="tp-choice-copy">
                      <span className="tp-choice-title">{formatWhen(n.startsAt, data.timeZone, loc)}</span>
                      {!sellable ? <span className="tp-choice-meta">{t("noTiers")}</span> : null}
                      {ds ? <span className="tp-choice-meta">{ds}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {chosenNight ? (
            offeredTiers.length === 0 ? (
              <p className="tp-status" data-ticket-picker="no_tiers">{t("noTiers")}</p>
            ) : (
              <div className="tp-section" role="radiogroup" aria-label={t("tier")}>
                <div className="tp-label">{t("tier")}</div>
                <div className="tp-choices">
                  {offeredTiers.map((x) => {
                    const on = tier === x.variantId;
                    const price = money(x.amountCents, data.currency, loc, t("free"));
                    return (
                      <label key={x.variantId} className="tp-choice" data-on={on ? "1" : undefined}>
                        <input
                          className="tp-radio"
                          type="radio"
                          name="tier"
                          value={x.variantId}
                          checked={on}
                          onChange={() => { setTier(x.variantId); setQty(Math.max(1, x.minPerOrder)); setRefusal(null); }}
                        />
                        <span className="tp-choice-copy">
                          <span className="tp-choice-title">{x.label}</span>
                          {x.admitsPerUnit > 1 ? <span className="tp-choice-meta">{t("admits").replace("{n}", String(x.admitsPerUnit))}</span> : null}
                        </span>
                        <span className="tp-price" data-free={x.amountCents === 0 ? "1" : undefined}>{price}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )
          ) : null}

          {chosenTier ? (
            <div className="tp-fields">
              {showQty ? (
                <div>
                  <div className="tp-field-label">{t("quantity")}</div>
                  <div className="tp-stepper">
                    <button
                      type="button"
                      className="tp-step"
                      aria-label={t("decrease")}
                      disabled={busy !== "idle" || qty <= chosenTier.minPerOrder}
                      onClick={() => setQty((n) => Math.max(chosenTier.minPerOrder, n - 1))}
                    >
                      −
                    </button>
                    <span className="tp-qty">{qty}</span>
                    <button
                      type="button"
                      className="tp-step"
                      aria-label={t("increase")}
                      disabled={busy !== "idle" || qty >= (chosenTier.maxPerOrder ?? 50)}
                      onClick={() => setQty((n) => Math.min(chosenTier.maxPerOrder ?? 50, n + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : null}
              <label>
                <span className="tp-field-label">{t("email")}</span>
                <input
                  className="tp-field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy !== "idle"}
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t("emailPlaceholder")}
                />
                <span className="tp-help">{t("emailHelp")}</span>
              </label>
              <label>
                <span className="tp-field-label">{t("name")}</span>
                <input
                  className="tp-field"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy !== "idle"}
                  autoComplete="name"
                  placeholder={t("namePlaceholder")}
                />
              </label>
              {chosenNight?.door.offered ? (
                <div role="radiogroup" aria-label={t("payHow")}>
                  <div className="tp-label">{t("payHow")}</div>
                  <div className="tp-choices">
                    <label className="tp-choice" data-on={payHow === "full" ? "1" : undefined}>
                      <input className="tp-radio" type="radio" name="payHow" checked={payHow === "full"} onChange={() => setPayHow("full")} disabled={busy !== "idle"} />
                      <span className="tp-choice-copy"><span className="tp-choice-title">{t("payCard")}</span></span>
                    </label>
                    <label className="tp-choice" data-on={payHow === "in_person" ? "1" : undefined}>
                      <input className="tp-radio" type="radio" name="payHow" checked={payHow === "in_person"} onChange={() => setPayHow("in_person")} disabled={busy !== "idle"} />
                      <span className="tp-choice-copy">
                        <span className="tp-choice-title">{t("payDoor")}</span>
                        <span className="tp-choice-meta">{t("payDoorHelp")}</span>
                      </span>
                    </label>
                  </div>
                </div>
              ) : null}
              <button type="button" className="tp-cta" onClick={() => void buy()} disabled={!canBuy}>
                {ctaLabel}
              </button>
            </div>
          ) : null}
        </>
      )}

      {refusal ? <div className="tp-alert" data-ticket-picker="refusal" role="alert">{refusal}</div> : null}
    </>
  ));
}
