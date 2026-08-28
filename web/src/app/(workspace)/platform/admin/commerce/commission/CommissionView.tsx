/**
 * CommissionView — a thin server wrapper so `CommissionConfigShell` can mount
 * INLINE as the Commission tab.
 *
 * The shell itself moved across from `billing/commission/` with zero internal
 * edits; the only thing the old page.tsx carried that the shell does not is the
 * heading and the load-error banner, so that is all this file is. A singleton
 * config IS the tab — putting it behind a drawer would add a click to reach the
 * only thing on the page.
 */

import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F, FD } from "../_tokens";
import { CommissionConfigShell } from "./CommissionConfigShell";
import type { loadPlatformCommissionConfig } from "./actions";

type LoadResult = Awaited<ReturnType<typeof loadPlatformCommissionConfig>>;

export async function CommissionView({ result }: { result: LoadResult }) {
  const t = createTranslator(await getRequestLocale());
  const config = result.ok ? result.data : null;
  const loadError = result.ok ? null : result.error;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        fontFamily: F,
        color: HQ.ink,
      }}
    >
      <div>
        <h2
          style={{
            fontFamily: FD,
            fontSize: 18,
            fontWeight: 600,
            margin: 0,
            letterSpacing: -0.3,
          }}
        >
          {t("dashboard.platform.billing.commission.title")}
        </h2>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12.5,
            color: HQ.inkMuted,
            maxWidth: 760,
            lineHeight: 1.55,
          }}
        >
          {t("dashboard.platform.billing.commission.subtitle")}
        </p>
      </div>

      {loadError && (
        <div
          style={{
            background: "rgba(243,103,114,0.06)",
            border: "1px solid rgba(243,103,114,0.18)",
            borderRadius: 12,
            padding: 14,
            color: HQ.red,
            fontSize: 13,
          }}
        >
          {interpolate(t("dashboard.platform.billing.commission.loadFailed"), {
            error: loadError,
          })}
        </div>
      )}

      {config && <CommissionConfigShell initial={config} />}
    </div>
  );
}
