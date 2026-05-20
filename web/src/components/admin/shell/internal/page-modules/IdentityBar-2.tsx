"use client";
import { logServerError } from "@/lib/server/safe-error";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { LOCALE_COOKIE, localeCookieOptions } from "@/i18n/locale-middleware";
import { useDashboardText } from "../dashboard-i18n";
import { COLORS, FONTS, TRANSITION } from "../state";
import type { Surface } from "../state";


export function AccountMenuItem({
  label,
  sub,
  tone,
  onClick,
}: {
  label: string;
  sub: string;
  tone?: "coral";
  onClick?: () => void;
}) {
  const copy = useDashboardText();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 1,
        width: "100%",
        minHeight: 36,
        padding: "8px 12px",
        background: "transparent",
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: `background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 13, fontWeight: 500, color: tone === "coral" ? COLORS.coralDeep : COLORS.ink }}>
        {copy.t(label)}
      </span>
      {sub && (
        <span style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
          {copy.t(sub)}
        </span>
      )}
    </button>
  );
}

export function LocaleToggle() {
  const [locale, setLocale] = useState<"en" | "es">("en");

  useEffect(() => {
    const m = document.cookie.match(
      new RegExp(`(?:^|; )${LOCALE_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
    );
    const raw = m?.[1] ? decodeURIComponent(m[1]) : null;
    if (raw === "es") setLocale("es");
    else setLocale("en");
  }, []);

  const pick = (next: "en" | "es") => {
    if (locale === next) return;
    const { path, maxAge, sameSite, secure } = localeCookieOptions;
    let line = `${LOCALE_COOKIE}=${next}; path=${path}; max-age=${String(maxAge)}; samesite=${sameSite}`;
    if (secure) line += "; secure";
    document.cookie = line;
    setLocale(next);
    window.location.reload();
  };

  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(11,11,13,0.05)",
        borderRadius: 8,
        padding: 2,
        fontFamily: FONTS.body,
      }}
    >
      {(["en", "es"] as const).map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => pick(code)}
            aria-pressed={active}
            style={{
              background: active ? "#fff" : "transparent",
              border: "none",
              borderRadius: 6,
              padding: "5px 9px",
              cursor: active ? "default" : "pointer",
              fontFamily: FONTS.body,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.6,
              color: active ? COLORS.ink : COLORS.inkMuted,
              boxShadow: active ? "0 1px 1px rgba(11,11,13,0.06)" : "none",
              transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
            }}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export function ModeTogglePill({
  surface,
  flipMode,
  workspaceUnread = 0,
  talentUnread = 0,
  showFirstRunTip = false,
}: {
  surface: Surface;
  flipMode: () => void;
  workspaceUnread?: number;
  talentUnread?: number;
  /** When true, show the first-run tooltip prompting the user to explore
   *  the mode toggle. Auto-dismisses after 8 s or on click. */
  showFirstRunTip?: boolean;
}) {
  const copy = useDashboardText();
  const inTalent = surface === "talent";
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <div
        role="group"
        aria-label={copy.t("Switch between Talent and Workspace")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "rgba(11,11,13,0.05)",
          borderRadius: 999,
          padding: 3,
          fontFamily: FONTS.body,
          height: 32,
        }}
      >
        <ModeTogglePillButton
          active={inTalent}
          label={copy.t("Talent")}
          unread={inTalent ? 0 : talentUnread}
          onClick={inTalent ? undefined : flipMode}
        />
        <ModeTogglePillButton
          active={!inTalent}
          label={copy.t("Workspace")}
          unread={!inTalent ? 0 : workspaceUnread}
          onClick={!inTalent ? undefined : flipMode}
        />
      </div>
      {showFirstRunTip && <ModeToggleFirstRunTip />}
    </div>
  );
}

/**
 * First-run tooltip that appears near the toggle pill for new hybrid users.
 * Auto-dismisses after 8 s or on click. Calls markToggleTipSeen() fire-and-forget.
 */
function ModeToggleFirstRunTip() {
  const copy = useDashboardText();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      import("@/lib/server-actions/user-prefs")
        .then(({ markToggleTipSeen }) => markToggleTipSeen())
        .catch((err: unknown) => logServerError("modetogglefirstruntip", err));
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    import("@/lib/server-actions/user-prefs")
      .then(({ markToggleTipSeen }) => markToggleTipSeen())
      .catch((err: unknown) => logServerError("modetogglefirstruntip", err));
  }, []);

  if (!visible) return null;

  return (
    <div
      role="tooltip"
      onClick={dismiss}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: COLORS.ink,
        color: "#fff",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        fontFamily: FONTS.body,
        fontWeight: 500,
        whiteSpace: "nowrap",
        zIndex: 200,
        pointerEvents: "auto",
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
        lineHeight: 1.4,
      }}
    >
      {copy.t("Switch between your talent profile and your workspace")}
      <span aria-hidden style={{ display: "block", textAlign: "center", opacity: 0.6, fontSize: 11, marginTop: 2 }}>
        {copy.t("Click to dismiss")}
      </span>
      {/* Caret */}
      <span aria-hidden style={{
        position: "absolute",
        top: -5,
        left: "50%",
        transform: "translateX(-50%)",
        width: 10,
        height: 10,
        background: COLORS.ink,
        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
      }} />
    </div>
  );
}

function ModeTogglePillButton({
  active,
  label,
  unread,
  onClick,
}: {
  active: boolean;
  label: string;
  unread: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        background: active ? COLORS.fill : "transparent",
        color: active ? "#fff" : COLORS.inkMuted,
        border: "none",
        borderRadius: 999,
        // height matches container minus 6px padding (3+3) so the
        // active background fills exactly the inner space without
        // overflow.
        height: 26,
        padding: "0 14px",
        cursor: active ? "default" : "pointer",
        fontFamily: FONTS.body,
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.1,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "background .2s ease, color .2s ease",
        flex: 1,
        justifyContent: "center",
        boxShadow: active ? "0 1px 2px rgba(11,11,13,0.12)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = COLORS.ink;
          // WS-13.5 — warm the dynamic module cache so the flip animation
          // starts instantly rather than waiting for the network.
          if (label === "Talent") void import("../talent");
        }
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = COLORS.inkMuted;
      }}
    >
      {label}
      {unread > 0 && (
        <span
          aria-label={`${unread} unread`}
          style={{
            minWidth: 16,
            height: 16,
            padding: "0 5px",
            borderRadius: 999,
            background: COLORS.green,
            color: "#fff",
            fontSize: 9.5,
            fontWeight: 700,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

export function IdentityBarIconButton({
  onClick,
  children,
  badge,
  ...rest
}: {
  onClick: () => void;
  children: ReactNode;
  badge?: number;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        border: `1px solid ${COLORS.borderSoft}`,
        background: "#fff",
        color: COLORS.inkMuted,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.color = COLORS.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.color = COLORS.inkMuted;
      }}
      {...rest}
    >
      {children}
      {badge && badge > 0 && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 14,
            height: 14,
            padding: "0 3px",
            borderRadius: 999,
            background: COLORS.accent,
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 1.5px #fff",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}
