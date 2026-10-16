"use client";

import { useEffect, useState } from "react";
import {
  payoutComingSoonLabel,
  payoutNotifyMeLabel,
  payoutOnWaitlistLabel,
  type PayoutCountry,
} from "@/lib/payments/payout-countries";
import { joinPayoutCountryWaitlist, loadPayoutWaitlist } from "./payout-waitlist-actions";

const MUTED = "rgba(11,11,13,0.55)";
const LINE = "rgba(24,24,27,0.08)";

/** Disabled coming-soon rows with a "notify me" waitlist button. Pass the
 *  "USDC" key as a row to waitlist the USDC option the same way. */
export function PayoutComingSoonList({
  rows,
  isSpanish,
}: {
  rows: readonly PayoutCountry[];
  isSpanish: boolean;
}) {
  const locale = isSpanish ? "es" : "en";
  const [joined, setJoined] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPayoutWaitlist()
      .then((r) => {
        if (!cancelled && r.ok) setJoined(new Set(r.countries));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const join = (iso2: string) => {
    setError(null);
    setBusy(iso2);
    joinPayoutCountryWaitlist(iso2)
      .then((r) => {
        setBusy(null);
        if (r.ok) setJoined((prev) => new Set([...prev, iso2]));
        else setError(r.error);
      })
      .catch(() => setBusy(null));
  };

  if (rows.length === 0) return null;
  return (
    <ul data-testid="payout-coming-soon-list" style={{ listStyle: "none", margin: "0 0 12px", padding: 0 }}>
      {rows.map((c) => (
        <li
          key={c.iso2}
          title={payoutComingSoonLabel(locale)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: `1px solid ${LINE}`, fontSize: 12.5, color: MUTED }}
        >
          <span aria-hidden>{c.flag}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            {c.label}
            <span style={{ display: "block", fontSize: 11.5, opacity: 0.8 }}>{payoutComingSoonLabel(locale)}</span>
          </span>
          {joined.has(c.iso2) ? (
            <span role="status" style={{ fontSize: 11.5, fontWeight: 600 }}>{payoutOnWaitlistLabel(locale)}</span>
          ) : (
            <button
              type="button"
              onClick={() => join(c.iso2)}
              disabled={busy === c.iso2}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${LINE}`, background: "transparent", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
            >
              {payoutNotifyMeLabel(locale)}
            </button>
          )}
        </li>
      ))}
      {error && <li role="alert" style={{ fontSize: 12, color: "inherit" }}>{error}</li>}
    </ul>
  );
}
