"use client";

import { useState, useTransition } from "react";

import { updateActivePayoutSystem } from "@/lib/server-actions/admin-platform-payout-system";
import type { ActivePayoutSystem } from "@/lib/payments/active-payout-system";

const OPTIONS: { value: ActivePayoutSystem; label: string; hint: string }[] = [
  {
    value: "connect",
    label: "Stripe Connect (Express transfers)",
    hint: "Talent + agency onboard Express accounts; payouts settle via Connect transfers. Supports US/UK/EEA/CA/CH. Global Payouts onboarding is hidden.",
  },
  {
    value: "global_payouts",
    label: "Stripe Global Payouts (v2)",
    hint: "Talent receive to a local bank / USDC via Stripe v2 Money Movement (~90 countries). Per-talent crypto opt-in routing applies.",
  },
];

/**
 * Super-admin control for the platform payout-rail master switch. Picks which rail
 * the whole platform settles on — Stripe Connect (default) or Global Payouts. The
 * switch force-pins the money rail and hides the inactive onboarding in the talent
 * UI. Reversible; flipping back to Global Payouts restores prior behavior, and no
 * Global Payouts code is removed.
 */
export function PlatformPayoutSystemCard({ current }: { current: ActivePayoutSystem }) {
  const [system, setSystem] = useState<ActivePayoutSystem>(current);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const dirty = system !== current;
  const activeHint = OPTIONS.find((o) => o.value === system)?.hint ?? "";

  const save = () => {
    setStatus(null);
    startTransition(async () => {
      const r = await updateActivePayoutSystem({ system });
      setStatus(
        r.ok
          ? {
              ok: true,
              msg: `Saved — platform now runs on ${system === "connect" ? "Stripe Connect" : "Global Payouts"}.`,
            }
          : { ok: false, msg: `Failed: ${r.error}` },
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 360 }}>
        <span style={{ fontWeight: 600 }}>Active payout system</span>
        <select
          value={system}
          onChange={(e) => setSystem(e.target.value as ActivePayoutSystem)}
          style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #d8d8de", fontSize: 13 }}
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span style={{ color: "#6b6b76", marginTop: 2, lineHeight: 1.45, fontSize: 12 }}>{activeHint}</span>
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={save}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            background: !dirty || pending ? "#c9c9d1" : "#111118",
            color: "#fff",
            cursor: !dirty || pending ? "default" : "pointer",
          }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {status && (
          <span style={{ fontSize: 12.5, color: status.ok ? "#067647" : "#b42318" }}>{status.msg}</span>
        )}
      </div>
    </div>
  );
}
