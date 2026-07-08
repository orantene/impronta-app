"use client";

import { useState, useTransition } from "react";

import { updateActivePayoutSystem } from "@/lib/server-actions/admin-platform-payout-system";
import type { ActivePayoutSystem } from "@/lib/payments/active-payout-system";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

const PAYOUT_OPTIONS: ActivePayoutSystem[] = ["connect", "global_payouts"];

const PAYOUT_LABEL_KEYS: Record<ActivePayoutSystem, string> = {
  connect: "dashboard.platform.settings.payoutConnectLabel",
  global_payouts: "dashboard.platform.settings.payoutGlobalLabel",
};

const PAYOUT_HINT_KEYS: Record<ActivePayoutSystem, string> = {
  connect: "dashboard.platform.settings.payoutConnectHint",
  global_payouts: "dashboard.platform.settings.payoutGlobalHint",
};

/**
 * Super-admin control for the platform payout-rail master switch. Picks which rail
 * the whole platform settles on — Stripe Connect (default) or Global Payouts. The
 * switch force-pins the money rail and hides the inactive onboarding in the talent
 * UI. Reversible; flipping back to Global Payouts restores prior behavior, and no
 * Global Payouts code is removed.
 */
export function PlatformPayoutSystemCard({ current }: { current: ActivePayoutSystem }) {
  const t = useT();
  const [system, setSystem] = useState<ActivePayoutSystem>(current);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const dirty = system !== current;
  const activeHint = t(PAYOUT_HINT_KEYS[system]);

  const save = () => {
    setStatus(null);
    startTransition(async () => {
      const r = await updateActivePayoutSystem({ system });
      setStatus(
        r.ok
          ? {
              ok: true,
              msg:
                system === "connect"
                  ? t("dashboard.platform.settings.payoutSavedConnect")
                  : t("dashboard.platform.settings.payoutSavedGlobal"),
            }
          : { ok: false, msg: interpolate(t("dashboard.platform.settings.failed"), { error: r.error }) },
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 360 }}>
        <span style={{ fontWeight: 600 }}>{t("dashboard.platform.settings.payoutFieldLabel")}</span>
        <select
          value={system}
          onChange={(e) => setSystem(e.target.value as ActivePayoutSystem)}
          style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #d8d8de", fontSize: 13 }}
        >
          {PAYOUT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(PAYOUT_LABEL_KEYS[value])}
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
          {pending ? t("dashboard.platform.settings.saving") : t("dashboard.platform.settings.save")}
        </button>
        {status && (
          <span style={{ fontSize: 12.5, color: status.ok ? "#067647" : "#b42318" }}>{status.msg}</span>
        )}
      </div>
    </div>
  );
}
