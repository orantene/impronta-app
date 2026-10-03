"use client";

import { useState, useTransition } from "react";

import { updatePlatformGuestCaptcha } from "@/lib/server-actions/admin-platform-guest-captcha";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

/**
 * Super-admin switch for guest booking captcha enforcement.
 *
 * Checked = captcha ON (default, safe). Unchecked = temporary testing off
 * for Continuar al pago / instant-book. Server reads the DB setting; guests
 * cannot flip this from the client.
 */
export function PlatformGuestCaptchaCard({ current }: { current: boolean }) {
  const t = useT();
  const [enforced, setEnforced] = useState(current);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const dirty = enforced !== current;

  const save = () => {
    setStatus(null);
    startTransition(async () => {
      const r = await updatePlatformGuestCaptcha({ enforced });
      setStatus(
        r.ok
          ? { ok: true, msg: t("dashboard.platform.settings.guestCaptchaSaved") }
          : {
              ok: false,
              msg: interpolate(t("dashboard.platform.settings.failed"), { error: r.error }),
            },
      );
    });
  };

  return (
    <div
      data-testid="platform-guest-captcha-card"
      style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}
    >
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enforced}
          onChange={(e) => setEnforced(e.target.checked)}
          style={{ marginTop: 2, width: 15, height: 15, accentColor: "#5DD3A0" }}
          data-testid="platform-guest-captcha-enforced"
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontWeight: 600 }}>
            {t("dashboard.platform.settings.guestCaptchaLabel")}
          </span>
          <span style={{ color: "#6b6b76", lineHeight: 1.45, fontSize: 12 }}>
            {t("dashboard.platform.settings.guestCaptchaHint")}
          </span>
        </span>
      </label>

      {!enforced ? (
        <p
          data-testid="platform-guest-captcha-warning"
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(239,110,110,0.12)",
            color: "#EF6E6E",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          {t("dashboard.platform.settings.guestCaptchaWarning")}
        </p>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={save}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: "none",
            background: !dirty || pending ? "rgba(255,255,255,0.08)" : "#5DD3A0",
            color: !dirty || pending ? "rgba(245,242,235,0.38)" : "#0B0B0D",
            fontWeight: 600,
            fontSize: 12.5,
            cursor: !dirty || pending ? "default" : "pointer",
          }}
        >
          {pending
            ? t("dashboard.platform.settings.saving")
            : t("dashboard.platform.settings.save")}
        </button>
        {status ? (
          <span style={{ fontSize: 12, color: status.ok ? "#5DD3A0" : "#EF6E6E" }}>
            {status.msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
