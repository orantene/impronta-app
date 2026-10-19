"use client";

/**
 * DatedPlacesStep — pick a date, how many people per price, then pay
 * (TUL-1344 slice 4). A self-contained step the catalog booking sheet mounts
 * for an item that sells dated places with seats.
 *
 * The purchase itself is INJECTED (`onBook`): the host passes the dated
 * purchase action, so this step has no hard dependency on it and renders the
 * same in tests. Prices on screen are for display; the charge is computed by
 * the order pipeline. Seats are advisory; the pool decides at booking.
 */

import Link from "next/link";
import { useMemo, useState } from "react";

import type { DatedPicker, DatedPickerDate } from "@/app/(public)/_dated/dated-picker-actions";
import { joinDatedWaitlist, startDatedCardPayment } from "@/app/(public)/_dated/dated-picker-actions";
import { datedPickerCopy, seatsLabel } from "@/lib/sessions/dated-picker-model";

type PickerOk = Extract<DatedPicker, { ok: true }>;

export type DatedBookResult =
  | { ok: true; orderId: string; transactionId: string | null; receiptCode: string | null; payAtDoor: boolean; ticketEmailed?: boolean }
  | { ok: false; reason: string; seatsLeft?: number };

export type DatedPlacesStepProps = {
  tenantId: string;
  offeringId: string;
  locale: string;
  picker: PickerOk;
  /** The dated purchase action (`startDatedPurchase`), injected by the host. */
  onBook: (input: {
    tenantId: string;
    offeringId: string;
    sessionId: string;
    legs: Array<{ variantId?: string; units: number }>;
    email: string;
    displayName?: string;
    clientOrderKey: string;
    paymentChoice: "full" | "in_person";
    locale: string;
  }) => Promise<DatedBookResult>;
  /** Shown for a private-on-request item. The host owns what a request does. */
  onRequestPrivate?: () => void;
  /** Same-site path to come back to if the guest backs out of the card page. */
  returnPath?: string;
};

function money(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function when(d: DatedPickerDate, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      ...(d.timeZone ? { timeZone: d.timeZone } : {}),
    }).format(new Date(d.startsAt));
  } catch {
    return d.startsAt;
  }
}

export function DatedPlacesStep(props: DatedPlacesStepProps) {
  const { picker, locale } = props;
  const c = datedPickerCopy(locale);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [units, setUnits] = useState<Record<string, number>>({});
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; receiptCode: string | null } | null>(null);
  // One key per cart, so a double tap makes one order.
  const [orderKey] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`));

  const date = picker.dates.find((d) => d.sessionId === sessionId) ?? null;
  const tiers = useMemo(
    () => (date ? picker.tiers.filter((t) => date.sellableVariantIds.includes(t.variantId)) : []),
    [picker.tiers, date],
  );
  const single = picker.tiers.length === 0;

  const legs = single
    ? [{ units: units.__single ?? 0 }]
    : tiers.map((t) => ({ variantId: t.variantId, units: units[t.variantId] ?? 0 })).filter((l) => l.units > 0);
  const people = legs.reduce((s, l) => s + l.units, 0);
  const totalCents = single
    ? (picker.defaultAmountCents ?? 0) * (units.__single ?? 0)
    : tiers.reduce((s, t) => s + t.amountCents * (units[t.variantId] ?? 0), 0);
  const canSubmit = date != null && people > 0 && /.+@.+\..+/.test(email) && !busy && (date.state === "open" || date.state === "low");

  const book = async (paymentChoice: "full" | "in_person") => {
    if (!date) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await props.onBook({
        tenantId: props.tenantId,
        offeringId: props.offeringId,
        sessionId: date.sessionId,
        legs: single ? [{ units: units.__single ?? 0 }] : legs,
        email: email.trim(),
        displayName: name.trim() || undefined,
        clientOrderKey: orderKey,
        paymentChoice,
        locale,
      });
      if (!res.ok) {
        setMessage(res.reason === "not_enough_seats" ? c.notEnough : res.reason === "tier_not_on_sale" ? c.tierClosed : res.reason === "sales_closed" ? c.salesClosed : c.failed);
        return;
      }
      if (res.transactionId && !res.payAtDoor) {
        const pay = await startDatedCardPayment({
          tenantId: props.tenantId,
          orderId: res.orderId,
          transactionId: res.transactionId,
          locale,
          returnPath: props.returnPath,
        });
        if (pay.ok) {
          window.location.assign(pay.url);
          return;
        }
        setMessage(c.failed);
        return;
      }
      // Only claim an email when the server says the ticket was really sent.
      setDone({ text: res.ticketEmailed ? c.confirmed : c.confirmedNoEmail, receiptCode: res.receiptCode });
    } catch {
      setMessage(c.failed);
    } finally {
      setBusy(false);
    }
  };

  const waitlist = async () => {
    if (!date || !name.trim() || !email.trim()) return;
    setBusy(true);
    const res = await joinDatedWaitlist({
      tenantId: props.tenantId,
      offeringId: props.offeringId,
      sessionId: date.sessionId,
      name: name.trim(),
      email: email.trim(),
    }).catch(() => ({ ok: false as const }));
    setBusy(false);
    setMessage(res.ok ? c.waitlistJoined : c.failed);
  };

  if (done) {
    return (
      <div role="status" data-testid="dated-done" className="flex flex-col gap-2">
        <p>{done.text}</p>
        {done.receiptCode ? (
          <Link href={`/r/${done.receiptCode}`} className="underline">
            {c.viewReceipt}
          </Link>
        ) : null}
      </div>
    );
  }

  if (picker.dates.length === 0) return <p data-testid="dated-none">{c.noDates}</p>;

  return (
    <div className="flex flex-col gap-4" data-testid="dated-step">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{c.pickDate}</legend>
        {picker.dates.map((d) => {
          const left = d.state === "open" || d.state === "low" ? seatsLabel(d.seatsLeft, locale) : null;
          const note =
            d.state === "sold_out" ? c.soldOutWaitlist : d.state === "closed" ? c.salesClosed : d.state === "private" ? c.privateOnRequest : left;
          return (
            <label
              key={d.sessionId}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 ${sessionId === d.sessionId ? "border-current" : "opacity-90"}`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dated-date"
                  checked={sessionId === d.sessionId}
                  disabled={d.state === "closed"}
                  onChange={() => {
                    setSessionId(d.sessionId);
                    setMessage(null);
                  }}
                />
                <span>{when(d, locale)}</span>
              </span>
              {note ? <span className="text-sm opacity-75">{note}</span> : null}
            </label>
          );
        })}
      </fieldset>

      {date && (date.state === "open" || date.state === "low") ? (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">{c.howMany}</legend>
            {(single ? [{ variantId: "__single", label: picker.title, amountCents: picker.defaultAmountCents ?? 0, maxPerOrder: null as number | null }] : tiers).map((t) => (
              <div key={t.variantId} className="flex items-center justify-between gap-3">
                <span>
                  {t.label} <span className="text-sm opacity-75">{money(t.amountCents, picker.currency, locale)} {c.perPerson}</span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={t.maxPerOrder ?? 50}
                  inputMode="numeric"
                  aria-label={t.label}
                  className="w-16 rounded border px-2 py-1 text-right"
                  value={units[t.variantId] ?? 0}
                  onChange={(e) => setUnits((u) => ({ ...u, [t.variantId]: Math.max(0, Number.parseInt(e.target.value, 10) || 0) }))}
                />
              </div>
            ))}
            <div className="flex justify-between font-semibold">
              <span>{c.total}</span>
              <span>{money(totalCents, picker.currency, locale)}</span>
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <input className="rounded border px-3 py-2" placeholder={c.name} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="rounded border px-3 py-2" placeholder={c.email} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!canSubmit} onClick={() => void book("full")} className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50" data-testid="dated-pay">
              {c.pay}
            </button>
            {date.payAtPlaceOffered ? (
              <button type="button" disabled={!canSubmit} onClick={() => void book("in_person")} className="rounded-lg border px-4 py-2 disabled:opacity-50">
                {c.payAtPlace}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {date?.state === "sold_out" ? (
        <div className="flex flex-col gap-2">
          <input className="rounded border px-3 py-2" placeholder={c.name} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded border px-3 py-2" placeholder={c.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="button" disabled={busy || !name.trim() || !email.trim()} onClick={() => void waitlist()} className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50" data-testid="dated-waitlist">
            {c.joinWaitlist}
          </button>
        </div>
      ) : null}

      {date?.state === "private" && props.onRequestPrivate ? (
        <button type="button" onClick={props.onRequestPrivate} className="rounded-lg border px-4 py-2 font-semibold">
          {c.requestPrivate}
        </button>
      ) : null}

      {message ? (
        <p role="alert" data-testid="dated-message">
          {message}
        </p>
      ) : null}
    </div>
  );
}
