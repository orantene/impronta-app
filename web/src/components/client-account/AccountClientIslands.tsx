"use client";

/**
 * Interactive pieces of the `/account` page. Everything shown here is passed in
 * already translated; the only things this file decides are open/closed panels.
 * Colours come from the `<html>` token vars so it wears the site's look.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { cancelMyBooking, rescheduleMyBooking, type MyBookingRefusal } from "@/lib/client-account/booking-actions";
import { saveAccountSettings } from "@/lib/client-account/profile-actions";
import { signOutClientAccount } from "@/lib/client-account/actions";

const INK = "var(--token-color-ink, #111)";
const ACCENT = "var(--token-color-primary, #111)";
const LINE = "var(--token-color-line, rgba(0,0,0,.14))";
const RADIUS = "var(--site-radius-base, 8px)";

export const btnPrimary = {
  minHeight: 44, padding: "0 18px", borderRadius: RADIUS, border: `1px solid ${ACCENT}`,
  background: ACCENT, color: "var(--token-color-on-primary, #fff)", font: "inherit", fontWeight: 600, cursor: "pointer",
} as const;
export const btnSecondary = {
  minHeight: 44, padding: "0 18px", borderRadius: RADIUS, border: `1px solid ${LINE}`,
  background: "transparent", color: INK, font: "inherit", fontWeight: 600, cursor: "pointer",
} as const;
const field = {
  minHeight: 44, width: "100%", boxSizing: "border-box", padding: "0 12px", borderRadius: RADIUS,
  border: `1px solid ${LINE}`, background: "transparent", color: INK, font: "inherit",
} as const;

function opKey(): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  return `acct-${id}`.slice(0, 80);
}

export type VisitActionsCopy = {
  reschedule: string; cancelVisit: string; cancelConfirm: string; keepVisit: string; reasonLabel: string;
  pickNewTime: string; noSlots: string; loadingSlots: string; confirmNewTime: string;
  cancelled: string; cancelledRefund: string; rescheduled: string;
  refundLine: string;
  errors: Record<MyBookingRefusal, string>;
};

export function VisitActions({
  bookingId, offeringId, timeZone, locale, copy, refundCents, refundLabel,
}: {
  bookingId: string; offeringId: string | null; timeZone: string; locale: string;
  copy: VisitActionsCopy; refundCents: number; refundLabel: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "cancel" | "reschedule">("idle");
  const [reason, setReason] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [key] = useState(opKey);
  const [pending, start] = useTransition();
  const loc = locale === "es" ? "es-MX" : "en-US";

  useEffect(() => {
    if (mode !== "reschedule" || !offeringId || slots) return undefined;
    let alive = true;
    const from = new Date().toISOString().slice(0, 10);
    fetch(`/api/public/booking/slots?offering=${encodeURIComponent(offeringId)}&from=${from}&days=14`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((j: { slots?: string[] }) => alive && setSlots(Array.isArray(j.slots) ? j.slots : []))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [mode, offeringId, slots]);

  const refused = (r: MyBookingRefusal) => setNote(copy.errors[r] ?? copy.errors.unavailable);

  if (done) {
    return <p role="status" style={{ margin: "16px 0", fontWeight: 600 }}>{done}</p>;
  }
  const day = (iso: string) => new Intl.DateTimeFormat(loc, { timeZone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
  const hour = (iso: string) => new Intl.DateTimeFormat(loc, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const byDay = new Map<string, string[]>();
  for (const s of slots ?? []) byDay.set(day(s), [...(byDay.get(day(s)) ?? []), s]);

  return (
    <div style={{ marginTop: 16 }}>
      {mode === "idle" ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {offeringId ? <button type="button" style={btnSecondary} onClick={() => setMode("reschedule")}>{copy.reschedule}</button> : null}
          <button type="button" style={btnSecondary} onClick={() => setMode("cancel")}>{copy.cancelVisit}</button>
        </div>
      ) : null}

      {mode === "cancel" ? (
        <form
          style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS, padding: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            setNote(null);
            start(async () => {
              const r = await cancelMyBooking({ bookingId, operationKey: key, reason });
              if (!r.ok) return refused(r.reason);
              setDone(r.refundableCents > 0 ? copy.cancelledRefund.replace("{amount}", refundLabel) : copy.cancelled);
              router.refresh();
            });
          }}
        >
          <p style={{ margin: "0 0 12px" }}>{copy.refundLine}</p>
          <label style={{ display: "block", fontWeight: 600, fontSize: 14 }}>
            {copy.reasonLabel}
            <input style={{ ...field, marginTop: 6 }} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" style={btnSecondary} disabled={pending} onClick={() => setMode("idle")}>{copy.keepVisit}</button>
            <button type="submit" style={btnPrimary} disabled={pending}>{copy.cancelConfirm}{refundCents > 0 ? ` · ${refundLabel}` : ""}</button>
          </div>
        </form>
      ) : null}

      {mode === "reschedule" ? (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: RADIUS, padding: 16 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 600 }}>{copy.pickNewTime}</p>
          {slots === null ? <p style={{ margin: 0 }}>{copy.loadingSlots}</p> : null}
          {slots && slots.length === 0 ? <p style={{ margin: 0 }}>{copy.noSlots}</p> : null}
          {[...byDay].map(([label, list]) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 6 }}>{label}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {list.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={picked === s}
                    style={picked === s ? { ...btnPrimary, minHeight: 40, padding: "0 12px" } : { ...btnSecondary, minHeight: 40, padding: "0 12px" }}
                    onClick={() => setPicked(s)}
                  >
                    {hour(s)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" style={btnSecondary} disabled={pending} onClick={() => setMode("idle")}>{copy.keepVisit}</button>
            <button
              type="button"
              style={btnPrimary}
              disabled={pending || !picked}
              onClick={() => {
                if (!picked) return;
                setNote(null);
                start(async () => {
                  const r = await rescheduleMyBooking({ bookingId, operationKey: key, newStartsAt: picked });
                  if (!r.ok) return refused(r.reason);
                  setDone(copy.rescheduled);
                  router.refresh();
                });
              }}
            >
              {copy.confirmNewTime}
            </button>
          </div>
        </div>
      ) : null}
      {note ? <p role="alert" style={{ margin: "12px 0 0", color: "#b42318" }}>{note}</p> : null}
    </div>
  );
}

export type SettingsCopy = {
  name: string; phone: string; language: string; marketing: string; save: string; saved: string;
  invalid: string; generic: string; langEn: string; langEs: string;
};

export function SettingsForm({ initial, copy }: {
  initial: { name: string; phone: string; locale: string; marketingOptIn: boolean };
  copy: SettingsCopy;
}) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      style={{ display: "grid", gap: 14, maxWidth: 440 }}
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await saveAccountSettings({ name: v.name, phone: v.phone, locale: v.locale, marketingOptIn: v.marketingOptIn });
          setMsg(r.ok ? copy.saved : copy.invalid);
        });
      }}
    >
      <label style={{ fontWeight: 600, fontSize: 14 }}>{copy.name}
        <input style={{ ...field, marginTop: 6 }} value={v.name} maxLength={120} autoComplete="name" onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      <label style={{ fontWeight: 600, fontSize: 14 }}>{copy.phone}
        <input style={{ ...field, marginTop: 6 }} value={v.phone} type="tel" inputMode="tel" autoComplete="tel" onChange={(e) => setV({ ...v, phone: e.target.value })} />
      </label>
      <label style={{ fontWeight: 600, fontSize: 14 }}>{copy.language}
        <select style={{ ...field, marginTop: 6 }} value={v.locale} onChange={(e) => setV({ ...v, locale: e.target.value })}>
          <option value="en">{copy.langEn}</option>
          <option value="es">{copy.langEs}</option>
        </select>
      </label>
      <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44 }}>
        <input type="checkbox" checked={v.marketingOptIn} onChange={(e) => setV({ ...v, marketingOptIn: e.target.checked })} />
        <span>{copy.marketing}</span>
      </label>
      <div><button type="submit" style={btnPrimary} disabled={pending}>{copy.save}</button></div>
      {msg ? <p role="status" style={{ margin: 0 }}>{msg}</p> : null}
    </form>
  );
}

export function LogOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      style={btnSecondary}
      disabled={pending}
      onClick={() => start(async () => {
        await signOutClientAccount();
        router.refresh();
      })}
    >
      {label}
    </button>
  );
}
