"use client";

// Client-surface account menu. Visual + IA recipe ported from the admin
// `AccountMenuTrigger` (IdentityBar-1.tsx) but decoupled from `useAdminShell`
// — this surface has no shell context, drawers, or plan/role state.
//
// Items: Profile · Notifications · Language (inline EN/ES) · Keyboard
// shortcuts · Sign out. The avatar trigger reads as a button (subtle pill
// + caret) so it's clear there's a menu behind it — addressing the prior
// dead-pixel avatar in the client identity bar.
//
// `?` overlay is owned by ClientKeyboardShortcuts (mounted in layout). We
// trigger it by dispatching a `client:open-help` CustomEvent that the
// shortcuts component listens for; no shared state needed.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { DashboardLocaleToggle } from "@/components/dashboard-locale-toggle";
import type { Locale } from "@/i18n/config";

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  blueSoft:   "rgba(37,99,235,0.08)",
  blueDeep:   "#1D4ED8",
  coral:      "#B91C1C",
  surfaceAlt: "rgba(11,11,13,0.03)",
} as const;

type Labels = {
  signedInAs: string;
  profile: string;
  profileSub: string;
  notifications: string;
  notificationsSub: string;
  language: string;
  languageSub: string;
  shortcuts: string;
  shortcutsSub: string;
  signOut: string;
  signingOut: string;
  openMenu: string;
};

const DEFAULT_LABELS: Labels = {
  signedInAs: "Signed in as",
  profile: "Profile",
  profileSub: "Name, company, account",
  notifications: "Notifications",
  notificationsSub: "Email, push, digest",
  language: "Language",
  languageSub: "Dashboard display language",
  shortcuts: "Keyboard shortcuts",
  shortcutsSub: "Press ? anywhere",
  signOut: "Sign out",
  signingOut: "Signing out…",
  openMenu: "Open account menu",
};

export function ClientAccountMenu({
  tenantSlug,
  userName,
  userEmail,
  userInitials,
  company,
  labels = DEFAULT_LABELS,
  supportedLocales,
  defaultLocale,
}: {
  tenantSlug: string;
  userName: string;
  userEmail: string;
  userInitials: string;
  company?: string | null;
  labels?: Labels;
  /**
   * Tenant's supported locale list (from `TenantLocaleSettings.supportedLocales`).
   * When length <= 1, the language toggle row is hidden.
   */
  supportedLocales?: readonly Locale[];
  /**
   * Tenant's primary locale (from `TenantLocaleSettings.defaultLocale`).
   * Seeds the toggle's initial active state when no cookie is set.
   */
  defaultLocale?: Locale;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={{ position: "relative" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${labels.openMenu} — ${labels.signedInAs} ${userName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: open ? "rgba(11,11,13,0.08)" : "rgba(11,11,13,0.035)",
          border: `1px solid ${open ? "rgba(11,11,13,0.12)" : "rgba(11,11,13,0.07)"}`,
          cursor: "pointer",
          padding: "3px 10px 3px 3px",
          borderRadius: 999,
          fontFamily: FONT,
          transition: "background 120ms, border-color 120ms",
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = "rgba(11,11,13,0.06)";
            e.currentTarget.style.borderColor = "rgba(11,11,13,0.10)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = "rgba(11,11,13,0.035)";
            e.currentTarget.style.borderColor = "rgba(11,11,13,0.07)";
          }
        }}
      >
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: C.blueSoft,
            color: C.blueDeep,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          {userInitials}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.1,
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {userName}
        </span>
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 10 10"
          style={{
            color: C.inkMuted,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 160ms",
          }}
        >
          <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 280,
            background: "#fff",
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 40px rgba(11,11,13,0.16)",
            padding: 6,
            zIndex: 200,
            fontFamily: FONT,
            animation: "client-account-menu-fade .14s ease",
          }}
        >
          <style>{`@keyframes client-account-menu-fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {/* Signed in as */}
          <div
            style={{
              padding: "10px 12px",
              borderBottom: `1px solid ${C.borderSoft}`,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.7,
                textTransform: "uppercase",
                marginBottom: 2,
                color: C.inkMuted,
              }}
            >
              {labels.signedInAs}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {userName}
            </div>
            <div style={{ fontSize: 11.5, marginTop: 1, color: C.inkMuted }}>
              {userEmail}
            </div>
            {company && (
              <div style={{ fontSize: 11.5, marginTop: 1, color: C.inkMuted }}>
                {company}
              </div>
            )}
          </div>

          <MenuLink
            href={`/${tenantSlug}/client/settings`}
            label={labels.profile}
            sub={labels.profileSub}
            onSelect={() => setOpen(false)}
          />
          <MenuLink
            href={`/${tenantSlug}/client/settings#notifications`}
            label={labels.notifications}
            sub={labels.notificationsSub}
            onSelect={() => setOpen(false)}
          />

          {/* Language — inline EN/ES toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderRadius: 8,
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>
                {labels.language}
              </div>
              <div style={{ fontSize: 11.5, marginTop: 1, color: C.inkMuted }}>
                {labels.languageSub}
              </div>
            </div>
            <DashboardLocaleToggle
              supportedLocales={supportedLocales}
              defaultLocale={defaultLocale}
            />
          </div>

          <MenuButton
            label={labels.shortcuts}
            sub={labels.shortcutsSub}
            onClick={() => {
              setOpen(false);
              document.dispatchEvent(new CustomEvent("client:open-help"));
            }}
          />

          <div
            style={{
              borderTop: `1px solid ${C.borderSoft}`,
              marginTop: 4,
              paddingTop: 4,
            }}
          >
            <MenuButton
              label={signingOut ? labels.signingOut : labels.signOut}
              sub=""
              tone="coral"
              disabled={signingOut}
              onClick={async () => {
                if (signingOut) return;
                setSigningOut(true);
                setOpen(false);
                await signOut();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MenuRowStyle(tone?: "coral"): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: tone === "coral" ? C.coral : C.ink,
    textDecoration: "none",
    fontFamily: FONT,
  };
}

function MenuLink({
  href,
  label,
  sub,
  onSelect,
}: {
  href: string;
  label: string;
  sub: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      style={MenuRowStyle()}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, marginTop: 1, color: C.inkMuted }}>{sub}</div>}
    </Link>
  );
}

function MenuButton({
  label,
  sub,
  onClick,
  tone,
  disabled,
}: {
  label: string;
  sub: string;
  onClick: () => void;
  tone?: "coral";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{ ...MenuRowStyle(tone), opacity: disabled ? 0.6 : 1, cursor: disabled ? "default" : "pointer" }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = C.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, marginTop: 1, color: tone === "coral" ? "rgba(185,28,28,0.7)" : C.inkMuted }}>{sub}</div>}
    </button>
  );
}
