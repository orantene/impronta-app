"use client";

import { useState, useTransition } from "react";

import { updatePlatformGatedMedia } from "@/lib/server-actions/admin-platform-gated-media";
import type { PrivateMediaAccessState } from "@/lib/media/private-access";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

/**
 * Super-admin switch for gated media access.
 *
 * HONEST ABOUT A TWO-PART STATE. Turning this on is necessary but not
 * sufficient: the feature also needs `MEDIA_URL_SIGNING_SECRET` in the
 * environment, which no admin UI can set (whoever could write it could mint
 * media URLs for any tenant). Production today has the secret missing, so
 * "switch on, secret absent" is the state the owner will actually see, and
 * painting it as a green check would be a lie about whether photos are
 * protected. The status line therefore reads off `state.reason`, which the
 * resolver computed from all three inputs, rather than off the checkbox.
 *
 * The environment can also override the switch in both directions
 * (`MEDIA_PRIVATE_ACCESS_ENABLED=0` kills the feature without a database
 * write, `=1` forces it on). When it does, the checkbox stays editable so the
 * intended value can be recorded for when the override is removed, and a
 * banner says plainly that the switch is not the thing deciding right now.
 */

/**
 * Dark HQ card palette. Deliberately no gold, amber, or orange anywhere. The
 * "not active" red and the plain "off" slate are the SAME weight and size as
 * the active green, so an inactive state never shouts louder than a live one.
 */
const TONE = {
  active: "#5DD3A0",
  activeBg: "rgba(93,211,160,0.12)",
  blocked: "#EF6E6E",
  blockedBg: "rgba(239,110,110,0.12)",
  off: "#9BA8B7",
  offBg: "rgba(155,168,183,0.14)",
  overrideInk: "#93B0F7",
  overrideBg: "rgba(44,95,219,0.14)",
  overrideBorder: "rgba(44,95,219,0.38)",
  hint: "#8A8A96",
} as const;

export function PlatformGatedMediaCard({
  current,
  revocationLagMinutes,
}: {
  current: PrivateMediaAccessState;
  revocationLagMinutes: number;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(current.settingEnabled);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const dirty = enabled !== current.settingEnabled;

  const save = () => {
    setStatus(null);
    startTransition(async () => {
      const r = await updatePlatformGatedMedia({ enabled });
      setStatus(
        r.ok
          ? { ok: true, msg: t("dashboard.platform.settings.gatedMediaSaved") }
          : {
              ok: false,
              msg: interpolate(t("dashboard.platform.settings.failed"), { error: r.error }),
            },
      );
    });
  };

  // One row per reason, spelled out with literal keys so the card cannot drift
  // from the resolver's verdict and so the i18n key scanners can see them.
  const badge =
    current.reason === "active"
      ? {
          ink: TONE.active,
          bg: TONE.activeBg,
          label: t("dashboard.platform.settings.gatedMediaStatusActive"),
        }
      : current.reason === "missing_secret"
        ? {
            ink: TONE.blocked,
            bg: TONE.blockedBg,
            label: t("dashboard.platform.settings.gatedMediaStatusNotActive"),
          }
        : {
            ink: TONE.off,
            bg: TONE.offBg,
            label: t("dashboard.platform.settings.gatedMediaStatusOff"),
          };

  const detail =
    current.reason === "active"
      ? t("dashboard.platform.settings.gatedMediaDetailActive")
      : current.reason === "missing_secret"
        ? t("dashboard.platform.settings.gatedMediaDetailMissingSecret")
        : current.reason === "forced_off_by_env"
          ? t("dashboard.platform.settings.gatedMediaDetailForcedOff")
          : t("dashboard.platform.settings.gatedMediaDetailOff");

  const override =
    current.envOverride === null
      ? null
      : current.envOverride
        ? t("dashboard.platform.settings.gatedMediaOverrideOn")
        : t("dashboard.platform.settings.gatedMediaOverrideOff");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span
          style={{
            padding: "3px 9px",
            borderRadius: 999,
            background: badge.bg,
            color: badge.ink,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {badge.label}
        </span>
        <span style={{ color: TONE.hint, fontSize: 12, lineHeight: 1.45, flex: 1, minWidth: 200 }}>
          {interpolate(detail, { minutes: revocationLagMinutes })}
        </span>
      </div>

      {override && (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: TONE.overrideBg,
            border: `1px solid ${TONE.overrideBorder}`,
            color: TONE.overrideInk,
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {override}
        </div>
      )}

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ marginTop: 2, width: 15, height: 15, accentColor: "#2c5fdb" }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontWeight: 600 }}>
            {t("dashboard.platform.settings.gatedMediaLabel")}
          </span>
          <span style={{ color: TONE.hint, lineHeight: 1.45, fontSize: 12 }}>
            {interpolate(t("dashboard.platform.settings.gatedMediaHint"), {
              minutes: revocationLagMinutes,
            })}
          </span>
        </span>
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
          {pending
            ? t("dashboard.platform.settings.saving")
            : t("dashboard.platform.settings.save")}
        </button>
        {status && (
          <span style={{ fontSize: 12.5, color: status.ok ? TONE.active : TONE.blocked }}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}
