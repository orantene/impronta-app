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
 *
 * NO REMAINING COUNTS on purpose (Capacity ruling): availability is the
 * pool's answer at reserve time.
 *
 * Pay-at-the-door is step 1b. Its rule is computed and SHOWN per night so the
 * guest reads the true sentence ("opens closer to the date" / "doors are
 * open"), but it is not offered as a choice here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PickerNight, PickerTier } from "@/app/(public)/_events/ticket-picker-actions";

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
    email: "Email",
    emailHelp: "Your ticket goes here. If you cannot open it, we will find you by name at the door.",
    name: "Name",
    buy: "Buy with card",
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
    night: "Elige una noche",
    tier: "Elige una entrada",
    loading: "Cargando entradas...",
    not_configured: "Este bloque aun no esta configurado: necesita un evento para vender.",
    noNights: "Todavia no hay ninguna noche a la venta.",
    noTiers: "Todavia no hay entradas a la venta para esa noche.",
    quantity: "Cuantas",
    email: "Correo",
    emailHelp: "Tu entrada llega aqui. Si no puedes abrirla, te buscamos por tu nombre en la puerta.",
    name: "Nombre",
    buy: "Pagar con tarjeta",
    buying: "Reservando tus plazas...",
    redirecting: "Llevandote al pago...",
    door_opens_closer: "Pagar en la puerta se abre mas cerca de la fecha.",
    door_doors_open: "Las puertas estan abiertas: paga en la puerta en persona.",
    door_offered: "Pagar en la puerta estara disponible mas cerca de la noche.",
    sold_out: "Esa noche se acaba de agotar con esa entrada. Elige otra y es tuya.",
    night_not_on_sale: "Esa noche ya no esta a la venta. Elige otra.",
    tier_not_on_sale: "Esa entrada no esta a la venta ahora.",
    quantity_err: "Ese numero de entradas esta fuera de lo que admite un pedido.",
    not_sellable: "Este evento no esta a la venta por ahora.",
    unavailable: "No pudimos cargar las entradas. No se cobro nada. Intenta de nuevo.",
    invalid_request: "Algo no se ve bien. Revisa los datos e intenta de nuevo.",
    engine_error: "Algo fallo de nuestro lado. No se cobro nada.",
    pay_at_door_not_yet: "Pagar en la puerta aun no esta disponible en linea. Paga con tarjeta, o en la puerta esa noche.",
    pay_at_door_not_offered: "Pagar en la puerta no se ofrece para esa noche.",
    emailRequired: "Necesitamos un correo para enviarte la entrada.",
    not_found: "No encontramos ese pedido. No se cobro nada.",
  },
};

export interface TicketPickerIslandProps {
  tenantId: string;
  eventId: string;
  title?: string;
  locale?: string;
}

function formatWhen(iso: string, timeZone: string | null, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso));
  } catch { return iso; }
}
function money(cents: number, currency: string, locale: Locale): string {
  try { return new Intl.NumberFormat(locale === "es" ? "es" : "en", { style: "currency", currency }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Loaded = { eventTitle: string; currency: string; timeZone: string | null; tiers: PickerTier[]; nights: PickerNight[] };

export function TicketPickerIsland({ tenantId, eventId, title, locale }: TicketPickerIslandProps) {
  const loc = pickLocale(locale);
  const t = (key: string) => COPY[loc][key] ?? COPY.en[key] ?? key;
  // NOT CONFIGURED is decided here, before any action: an author who dropped
  // the block with no event sees why, not an outage.
  const configured = UUID.test(tenantId) && UUID.test(eventId);

  const [data, setData] = useState<Loaded | null>(null);
  const [loadRefusal, setLoadRefusal] = useState<string | null>(null);
  const [night, setNight] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orderKey, setOrderKey] = useState(() => newOrderKey());
  const [busy, setBusy] = useState<"idle" | "holding" | "redirecting">("idle");
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!configured) return;
    try {
      const { loadTicketPicker } = await import("@/app/(public)/_events/ticket-picker-actions");
      const res = await loadTicketPicker({ tenantId, eventId });
      if (res.ok) { setData({ eventTitle: res.eventTitle, currency: res.currency, timeZone: res.timeZone, tiers: res.tiers, nights: res.nights }); setLoadRefusal(null); }
      else { setData(null); setLoadRefusal(t(res.reason)); }
    } catch { setData(null); setLoadRefusal(t("unavailable")); }
  }, [configured, tenantId, eventId, loc]);
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

  async function buy() {
    if (!chosenNight || !chosenTier || busy !== "idle") return;
    if (!email.trim()) { setRefusal(t("emailRequired")); return; }
    setBusy("holding"); setRefusal(null);
    try {
      const { startTicketPurchase, startTicketCardPayment } = await import("@/app/(public)/_events/ticket-picker-actions");
      const res = await startTicketPurchase({
        tenantId, eventId, sessionId: chosenNight.sessionId, variantId: chosenTier.variantId, units: qty,
        email: email.trim(), displayName: name.trim() || undefined, clientOrderKey: orderKey, paymentChoice: "full", locale: loc,
      });
      if (!res.ok) {
        setRefusal(t(res.reason === "quantity" ? "quantity_err" : res.reason));
        setOrderKey(newOrderKey()); // a NEW cart after a refusal
        void load(); // seats moved under us; the list on screen may now be a lie
        setBusy("idle");
        return;
      }
      if (!res.transactionId) { setRefusal(t("engine_error")); setOrderKey(newOrderKey()); setBusy("idle"); return; }
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

  if (!configured) return <div data-ticket-picker="not_configured" style={{ padding: 16 }}>{t("not_configured")}</div>;

  return (
    <div data-ticket-picker="root" style={{ padding: 16 }}>
      {title ? <h3 style={{ margin: "0 0 4px" }}>{title}</h3> : null}
      <div style={{ margin: "0 0 12px", fontWeight: 600 }}>{data?.eventTitle ?? t("heading")}</div>

      {loadRefusal ? (
        <div data-ticket-picker="refused">{loadRefusal}</div>
      ) : data === null ? (
        <div>{t("loading")}</div>
      ) : data.nights.length === 0 ? (
        <div data-ticket-picker="no_nights">{t("noNights")}</div>
      ) : (
        <>
          <div role="radiogroup" aria-label={t("night")}>
            <div style={{ margin: "0 0 6px" }}>{t("night")}</div>
            {data.nights.map((n) => {
              const sellable = n.sellableVariantIds.some((id) => data.tiers.find((x) => x.variantId === id)?.onSale);
              const ds = doorSentence(n);
              return (
                <label key={n.sessionId} style={{ display: "block", margin: "0 0 8px", opacity: sellable ? 1 : 0.55 }}>
                  <input type="radio" name="night" value={n.sessionId} disabled={!sellable} checked={night === n.sessionId}
                    onChange={() => { setNight(n.sessionId); setTier(null); setRefusal(null); }} />{" "}
                  {formatWhen(n.startsAt, data.timeZone, loc)}
                  {!sellable ? ` — ${t("noTiers")}` : ""}
                  {ds ? <span style={{ display: "block", fontSize: "0.85em", opacity: 0.75 }}>{ds}</span> : null}
                </label>
              );
            })}
          </div>

          {chosenNight ? (
            offeredTiers.length === 0 ? (
              <div data-ticket-picker="no_tiers">{t("noTiers")}</div>
            ) : (
              <div role="radiogroup" aria-label={t("tier")} style={{ marginTop: 12 }}>
                <div style={{ margin: "0 0 6px" }}>{t("tier")}</div>
                {offeredTiers.map((x) => (
                  <label key={x.variantId} style={{ display: "block", margin: "0 0 8px" }}>
                    <input type="radio" name="tier" value={x.variantId} checked={tier === x.variantId}
                      onChange={() => { setTier(x.variantId); setQty(Math.max(1, x.minPerOrder)); setRefusal(null); }} />{" "}
                    {x.label} — {money(x.amountCents, data.currency, loc)}{x.admitsPerUnit > 1 ? ` (${x.admitsPerUnit})` : ""}
                  </label>
                ))}
              </div>
            )
          ) : null}

          {chosenTier ? (
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block" }}>
                {t("quantity")}
                <input type="number" min={chosenTier.minPerOrder} max={chosenTier.maxPerOrder ?? 50} value={qty}
                  onChange={(e) => setQty(Math.max(chosenTier.minPerOrder, Math.min(chosenTier.maxPerOrder ?? 50, Number(e.target.value) || 1)))}
                  style={{ display: "block", width: 80 }} disabled={busy !== "idle"} />
              </label>
              <label style={{ display: "block", marginTop: 8 }}>
                {t("email")}
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: "block", width: "100%" }} disabled={busy !== "idle"} autoComplete="email" />
                <span style={{ display: "block", fontSize: "0.85em", opacity: 0.75 }}>{t("emailHelp")}</span>
              </label>
              <label style={{ display: "block", marginTop: 8 }}>
                {t("name")}
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ display: "block", width: "100%" }} disabled={busy !== "idle"} autoComplete="name" />
              </label>
              <button type="button" onClick={() => void buy()} disabled={!canBuy} style={{ marginTop: 12 }}>
                {busy === "holding" ? t("buying") : busy === "redirecting" ? t("redirecting") : t("buy")}
              </button>
            </div>
          ) : null}
        </>
      )}

      {refusal ? <div data-ticket-picker="refusal" role="alert" style={{ marginTop: 12 }}>{refusal}</div> : null}
    </div>
  );
}
