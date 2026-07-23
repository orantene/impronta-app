"use client";

// PlatformWorkspaceSwitcher — identity-bar control for the Tulala HQ console.
//
// The platform console is a separate shell with no workspace switcher of its
// own, so once a super-admin is in HQ there is no in-product way back to a
// workspace. This adds a "Workspaces" menu to the HQ identity bar: it lists
// every workspace the signed-in user belongs to (agency_memberships) and
// navigates into that workspace's admin surface on selection.
//
// Mirrors the workspace→platform entry point in the admin shell's
// TenantSwitcherDrawer, in reverse. Dark-themed to match the HQ console.

import { useEffect, useRef, useState } from "react";
import {
  actionLoadUserWorkspaces,
  type UserWorkspace,
} from "@/lib/server-actions/admin-user-workspaces";
import { useT } from "@/i18n/use-t";

const HQ = {
  card: "#16161A",
  raised: "#1E1E24",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.42)",
  accentSoft: "rgba(93,211,160,0.12)",
  accentGreen: "#5DD3A0",
} as const;

const FONT_BODY = '"Inter", system-ui, sans-serif';

/** Plan tier → catalog key. Additive key-map (mirrors the dashboard.enums pattern). */
const TIER_LABEL_KEY: Record<string, string> = {
  free: "dashboard.platform.tier.free",
  studio: "dashboard.platform.tier.studio",
  agency: "dashboard.platform.tier.agency",
  network: "dashboard.platform.tier.network",
};

/** Lowercase DB workspace role → catalog key. */
const ROLE_LABEL_KEY: Record<string, string> = {
  owner: "dashboard.platform.role.owner",
  admin: "dashboard.platform.role.admin",
  coordinator: "dashboard.platform.role.coordinator",
  editor: "dashboard.platform.role.editor",
  talent: "dashboard.platform.role.talent",
  member: "dashboard.platform.role.member",
};

type Translate = (key: string) => string;

/** Localised label for the lowercase DB role, falling back to "Member". */
function displayRole(role: string, t: Translate): string {
  const key = ROLE_LABEL_KEY[role] ?? ROLE_LABEL_KEY.member;
  return t(key);
}

export function PlatformWorkspaceSwitcher() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<UserWorkspace[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Lazy-load the workspace list the first time the menu opens.
  useEffect(() => {
    if (!open || workspaces !== null) return;
    setLoading(true);
    void actionLoadUserWorkspaces().then((res) => {
      setWorkspaces(res.ok ? res.workspaces : []);
      setLoading(false);
    });
  }, [open, workspaces]);

  // Close on outside-click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function goToWorkspace(w: UserWorkspace) {
    // On localhost the app uses path-based tenant routing /{slug}/admin.
    // On real hosts the middleware resolves the tenant from the hostname,
    // so navigate to the workspace's registered domain instead.
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");
    if (isLocalhost) {
      window.location.assign(`/${w.slug}/admin`);
    } else if (w.kind === "hub" && w.tier === "network") {
      // The platform network-hub's public face is the marketing apex
      // (tulala.digital), which doesn't serve /admin — route to the app host.
      window.location.assign(`https://app.tulala.digital/${w.slug}/admin`);
    } else {
      const host = w.domain ?? `${w.slug}.tulala.digital`;
      window.location.assign(`https://${host}/admin`);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        data-platform-ws-switcher
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("dashboard.platform.switcher.switchTo")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          height: 32,
          padding: "0 11px",
          borderRadius: 8,
          border: `1px solid ${HQ.borderSoft}`,
          background: open ? HQ.raised : "transparent",
          color: HQ.inkMuted,
          fontFamily: FONT_BODY,
          fontSize: 12.5,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
          <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="8" y="8" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        {t("dashboard.platform.switcher.workspaces")}
        <svg
          width="9"
          height="9"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 140ms" }}
        >
          <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 304,
            background: HQ.card,
            border: `1px solid ${HQ.border}`,
            borderRadius: 12,
            boxShadow: "0 16px 44px rgba(0,0,0,0.55)",
            padding: 8,
            zIndex: 60,
            fontFamily: FONT_BODY,
          }}
        >
          <div
            style={{
              padding: "6px 8px 8px",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: HQ.inkDim,
            }}
          >
            {t("dashboard.platform.switcher.switchTo")}
          </div>

          {loading && (
            <div style={{ padding: "14px 8px", fontSize: 12.5, color: HQ.inkMuted }}>
              {t("dashboard.platform.switcher.loading")}
            </div>
          )}

          {!loading && workspaces && workspaces.length === 0 && (
            <div style={{ padding: "14px 8px", fontSize: 12.5, color: HQ.inkMuted, lineHeight: 1.5 }}>
              {t("dashboard.platform.switcher.empty")}
            </div>
          )}

          {!loading &&
            workspaces &&
            workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                role="menuitem"
                data-platform-ws-row
                onClick={() => goToWorkspace(w)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  width: "100%",
                  padding: "9px 8px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: FONT_BODY,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = HQ.raised;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: HQ.accentSoft,
                    color: HQ.accentGreen,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {w.name.charAt(0).toUpperCase() || "?"}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: HQ.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {w.name}
                  </span>
                  <span style={{ display: "block", marginTop: 1, fontSize: 11, color: HQ.inkMuted }}>
                    {displayRole(w.role, t)} · {t(TIER_LABEL_KEY[w.tier] ?? TIER_LABEL_KEY.free)}
                  </span>
                </span>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden style={{ flexShrink: 0, color: HQ.inkDim }}>
                  <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
