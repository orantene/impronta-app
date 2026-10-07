/**
 * CommerceWiringSection (TUL-147) — green/amber/red rows for key modes,
 * webhook secrets, held payouts, stuck requests and webhook freshness.
 * Shown at the top of the Health tab. Read-only; shows names, modes and
 * counts only, never a key value.
 */

import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { KEY_MODE_VARS, type CommerceHealthRow, type HealthRowStatus } from "@/lib/payments/commerce-health";
import type { CommerceHealthResult } from "./load-commerce-health";
import { HQ, F, FD } from "../_tokens";

const DOT: Record<HealthRowStatus, string> = { ok: HQ.green, warn: HQ.amber, error: HQ.red };
const TITLE_KEY = "dashboard.platform.commerce.health.wiring.title";
const INTRO_KEY = "dashboard.platform.commerce.health.wiring.intro";
const READ_FAILED_KEY = "dashboard.platform.commerce.health.wiring.readFailed";

type Keys = { label: string; detail: string; fix: string };

/** Full literal keys on purpose: the key-usage guard greps for string literals. */
const KEYS: Record<string, Keys> = {
  "key-modes": {
    label: "dashboard.platform.commerce.health.wiring.rows.keyModes.label",
    detail: "dashboard.platform.commerce.health.wiring.rows.keyModes.detail",
    fix: "dashboard.platform.commerce.health.wiring.fix.keyModes",
  },
  "held-payouts": {
    label: "dashboard.platform.commerce.health.wiring.rows.held.label",
    detail: "dashboard.platform.commerce.health.wiring.rows.held.detail",
    fix: "dashboard.platform.commerce.health.wiring.fix.held",
  },
  "stuck-payment-requested": {
    label: "dashboard.platform.commerce.health.wiring.rows.stuck.label",
    detail: "dashboard.platform.commerce.health.wiring.rows.stuck.detail",
    fix: "dashboard.platform.commerce.health.wiring.fix.stuck",
  },
  "last-webhook:platform": {
    label: "dashboard.platform.commerce.health.wiring.rows.laneUs.label",
    detail: "dashboard.platform.commerce.health.wiring.rows.lane.detail",
    fix: "dashboard.platform.commerce.health.wiring.fix.lane",
  },
  "last-webhook:platform_mx": {
    label: "dashboard.platform.commerce.health.wiring.rows.laneMx.label",
    detail: "dashboard.platform.commerce.health.wiring.rows.lane.detail",
    fix: "dashboard.platform.commerce.health.wiring.fix.lane",
  },
};

const SECRET_KEYS = {
  label: "dashboard.platform.commerce.health.wiring.rows.secret.label",
  set: "dashboard.platform.commerce.health.wiring.rows.secret.set",
  unset: "dashboard.platform.commerce.health.wiring.rows.secret.unset",
  fix: "dashboard.platform.commerce.health.wiring.fix.secret",
  fixMx: "dashboard.platform.commerce.health.wiring.fix.mxConnect",
};

const STATUS_KEYS: Record<HealthRowStatus, string> = {
  ok: "dashboard.platform.commerce.health.wiring.status.ok",
  warn: "dashboard.platform.commerce.health.wiring.status.warn",
  error: "dashboard.platform.commerce.health.wiring.status.error",
};

const MODE_WORD_KEYS: Record<string, string> = {
  test: "dashboard.platform.commerce.health.wiring.rows.keyModes.mode.test",
  live: "dashboard.platform.commerce.health.wiring.rows.keyModes.mode.live",
  unset: "dashboard.platform.commerce.health.wiring.rows.keyModes.mode.unset",
};
const MX_SOURCE_KEY = "dashboard.platform.commerce.health.wiring.rows.keyModes.mxSource";
const HELD_ERROR_KEY = "dashboard.platform.commerce.health.wiring.rows.held.readFailed";
const HELD_ERROR_FIX_KEY = "dashboard.platform.commerce.health.wiring.fix.heldReadFailed";
const HELD_CAPPED_KEY = "dashboard.platform.commerce.health.wiring.rows.held.capped";

function rowKeys(row: CommerceHealthRow): Keys {
  if (typeof row.data?.name === "string") {
    return {
      label: SECRET_KEYS.label,
      detail: row.data.present ? SECRET_KEYS.set : SECRET_KEYS.unset,
      fix: row.data.name === "STRIPE_MX_WEBHOOK_SECRET_CONNECT" ? SECRET_KEYS.fixMx : SECRET_KEYS.fix,
    };
  }
  const keys = KEYS[row.id];
  if (row.id === "held-payouts" && row.data?.state === "error") {
    return { ...keys, detail: HELD_ERROR_KEY, fix: HELD_ERROR_FIX_KEY };
  }
  if (row.id === "held-payouts" && row.data?.state === "capped") {
    return { ...keys, detail: HELD_CAPPED_KEY };
  }
  if (row.id.startsWith("last-webhook:") && row.data?.hours === null) {
    return { ...keys, detail: "dashboard.platform.commerce.health.wiring.rows.lane.none" };
  }
  return keys;
}

export async function CommerceWiringSection({ result }: { result: CommerceHealthResult }) {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const worst: HealthRowStatus = result.rows.some((r) => r.status === "error")
    ? "error"
    : result.rows.some((r) => r.status === "warn")
      ? "warn"
      : "ok";

  return (
    <section
      aria-label={t(TITLE_KEY)}
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        marginTop: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: DOT[worst], display: "inline-block" }} />
        <h3 style={{ fontFamily: FD, fontSize: 14, fontWeight: 600, margin: 0 }}>{t(TITLE_KEY)}</h3>
      </div>
      <p style={{ color: HQ.inkMuted, fontSize: 12.5, lineHeight: 1.55, margin: "6px 0 0" }}>{t(INTRO_KEY)}</p>
      {result.failedReads.length > 0 && (
        <p style={{ color: HQ.amber, fontSize: 12, margin: "8px 0 0" }}>
          {interpolate(t(READ_FAILED_KEY), { parts: result.failedReads.join(", ") })}
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {result.rows.map((row) => {
          const k = rowKeys(row);
          const params: Record<string, string> = {
            name: String(row.data?.name ?? ""),
            count: String(row.data?.count ?? ""),
            max: String(row.data?.count ?? ""),
            source: String(row.data?.mxPublishableSource ?? ""),
            hours: String(row.data?.hours ?? ""),
            modes: row.status === "ok" && row.data?.mode ? String(row.data.mode) : "",
          };
          return (
            <li key={row.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5 }}>
              <span aria-hidden style={{ color: DOT[row.status], marginTop: 1 }}>●</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: HQ.ink, overflowWrap: "anywhere" }}>
                  {interpolate(t(k.label), params)}
                  <span style={{ color: DOT[row.status], fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginLeft: 8 }}>
                    {t(STATUS_KEYS[row.status])}
                  </span>
                </div>
                <div style={{ color: HQ.inkMuted, overflowWrap: "anywhere", fontFamily: F }}>
                  {row.id === "key-modes"
                    ? KEY_MODE_VARS.map((n) => `${n}: ${t(MODE_WORD_KEYS[String(row.data?.[`m:${n}`] ?? "unset")] ?? MODE_WORD_KEYS.unset)}`).join(", ")
                    : interpolate(t(k.detail), params)}
                </div>
                <div style={{ color: HQ.inkMuted, overflowWrap: "anywhere", fontFamily: F }}>
                  {row.id === "key-modes" && row.data?.mxPublishableSource && row.data.mxPublishableSource !== "none"
                    ? interpolate(t(MX_SOURCE_KEY), params)
                    : null}
                </div>
                {row.status !== "ok" && <div style={{ color: HQ.inkDim, marginTop: 2 }}>{interpolate(t(k.fix), params)}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
