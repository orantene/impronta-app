"use client";

/**
 * Post-login welcome shown inside the marketing LoginModal after a successful
 * sign-in. Compact "Welcome back" + one-click quick links to where the user
 * actually works (Messages / Bookings / Dashboard for talent, client links for
 * clients) and their workspaces — most-important-first, with the rest behind a
 * "Show all" toggle. Data comes from the same `MarketingAccount` model the
 * header account menu uses, so links are always valid + identity-aware.
 */

import { useState } from "react";
import Link from "next/link";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { AccountAvatar, type MarketingAccount } from "./marketing-account-menu";

type WelcomeCopy = {
  welcome: string;
  quick: string;
  messages: string;
  bookings: string;
  dashboard: string;
  saved: string;
  account: string;
  workspaces: string;
  pages: string;
  showAll: (n: number) => string;
  showLess: string;
  browse: string;
  live: string;
  hidden: string;
};

function getWelcomeCopy(locale: string): WelcomeCopy {
  return pickLocale(locale, {
    en: {
      welcome: "Welcome back",
      quick: "Jump back in",
      messages: "Messages",
      bookings: "Bookings",
      dashboard: "Dashboard",
      saved: "Saved",
      account: "Account",
      workspaces: "Your workspaces",
      pages: "Your pages",
      showAll: (n) => `Show all ${n}`,
      showLess: "Show less",
      browse: "Keep browsing",
      live: "Live",
      hidden: "Hidden",
    },
    es: {
      welcome: "Bienvenido de nuevo",
      quick: "Retoma donde ibas",
      messages: "Mensajes",
      bookings: "Reservas",
      dashboard: "Panel",
      saved: "Guardados",
      account: "Cuenta",
      workspaces: "Tus workspaces",
      pages: "Tus páginas",
      showAll: (n) => `Ver los ${n}`,
      showLess: "Ver menos",
      browse: "Seguir explorando",
      live: "En vivo",
      hidden: "Oculta",
    },
  });
}

type QuickAction = {
  label: string;
  href: string;
  icon: "chat" | "calendar" | "grid" | "heart" | "user";
};

function buildQuickActions(a: MarketingAccount, t: WelcomeCopy): QuickAction[] {
  if (a.talentLinks) {
    return [
      { label: t.messages, href: a.talentLinks.messages, icon: "chat" },
      { label: t.bookings, href: a.talentLinks.bookings, icon: "calendar" },
      { label: t.dashboard, href: a.talentLinks.dashboard, icon: "grid" },
    ];
  }
  if (a.clientLinks) {
    return [
      { label: t.messages, href: a.clientLinks.messages, icon: "chat" },
      { label: t.saved, href: a.clientLinks.saved, icon: "heart" },
      { label: t.account, href: a.clientLinks.account, icon: "user" },
    ];
  }
  return [];
}

const WORKSPACES_COLLAPSED = 3;

export function LoginWelcomePanel({
  account,
  locale = "en",
  onDismiss,
}: {
  account: MarketingAccount;
  locale?: string;
  onDismiss: () => void;
}) {
  const t = getWelcomeCopy(locale);
  const [expanded, setExpanded] = useState(false);
  const firstName = account.displayName.trim().split(/\s+/)[0] || account.displayName;
  const quick = buildQuickActions(account, t);
  const shownWorkspaces = expanded
    ? account.workspaces
    : account.workspaces.slice(0, WORKSPACES_COLLAPSED);
  const hiddenCount = account.workspaces.length - shownWorkspaces.length;

  return (
    <div>
      {/* Identity */}
      <div className="flex items-center gap-3">
        <AccountAvatar size="lg" />
        <div className="min-w-0">
          <p
            className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--plt-forest)" }}
          >
            {t.welcome}
          </p>
          <h2
            className="plt-display truncate text-[1.375rem] font-semibold leading-[1.15] tracking-[-0.02em]"
            style={{ color: "var(--plt-ink)" }}
          >
            {firstName}
          </h2>
          <p className="truncate text-[0.8125rem]" style={{ color: "var(--plt-muted)" }}>
            {account.email}
          </p>
        </div>
      </div>

      {/* Primary quick actions (talent / client) */}
      {quick.length > 0 ? (
        <>
          <p
            className="mt-6 mb-2 text-[0.75rem] font-medium"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {t.quick}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {quick.map((q) => (
              <Link
                key={q.label}
                href={q.href}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-4 text-center transition-colors hover:border-[var(--plt-forest)]"
                style={{
                  borderColor: "var(--plt-hairline-strong)",
                  background: "var(--plt-bg)",
                }}
              >
                <QuickIcon kind={q.icon} />
                <span
                  className="text-[0.8125rem] font-medium leading-none"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {q.label}
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {/* Workspaces — one-click, most-important-first, expandable */}
      {account.workspaces.length > 0 ? (
        <>
          <p
            className="mt-6 mb-2 text-[0.75rem] font-medium"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {t.workspaces}
          </p>
          <div className="space-y-1">
            {shownWorkspaces.map((w) => (
              <Link
                key={w.slug}
                href={w.href}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--plt-bg-raised)]"
              >
                <GridGlyph />
                <span
                  className="flex-1 truncate text-[0.875rem] font-medium"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {w.name}
                </span>
                <span
                  className="plt-mono text-[0.625rem] uppercase tracking-[0.12em]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {w.role}
                </span>
                <ChevronRight />
              </Link>
            ))}
          </div>
          {account.workspaces.length > WORKSPACES_COLLAPSED ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 px-3 text-[0.75rem] font-medium underline underline-offset-2 transition-colors hover:text-[var(--plt-forest)]"
              style={{ color: "var(--plt-muted)" }}
            >
              {expanded ? t.showLess : t.showAll(account.workspaces.length)}
            </button>
          ) : null}
        </>
      ) : null}

      {/* Talent pages (only when the user has none-workspace pages worth a tap) */}
      {account.talentPages.length > 0 ? (
        <>
          <p
            className="mt-6 mb-2 text-[0.75rem] font-medium"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {t.pages}
          </p>
          <div className="space-y-1">
            {account.talentPages.slice(0, 3).map((p) => (
              <a
                key={p.key}
                href={p.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--plt-bg-raised)]"
              >
                <GlobeGlyph />
                <span
                  className="flex-1 truncate text-[0.875rem] font-medium"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {p.name}
                </span>
                <span
                  className="text-[0.6875rem] font-medium"
                  style={{ color: p.status === "live" ? "var(--plt-forest)" : "var(--plt-muted)" }}
                >
                  {p.status === "live" ? t.live : t.hidden}
                </span>
              </a>
            ))}
          </div>
        </>
      ) : null}

      <button
        type="button"
        onClick={onDismiss}
        className="mt-6 w-full rounded-full px-5 py-2.5 text-[0.8125rem] font-medium transition-colors hover:bg-[var(--plt-bg-raised)]"
        style={{ color: "var(--plt-muted)", border: "1px solid var(--plt-hairline)" }}
      >
        {t.browse}
      </button>
    </div>
  );
}

/* ── Icons ── */

function QuickIcon({ kind }: { kind: QuickAction["icon"] }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--plt-forest)",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "chat":
      return (
        <svg {...common} aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.8L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common} aria-hidden>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
      );
    case "user":
      return (
        <svg {...common} aria-hidden>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
  }
}

function GridGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--plt-muted)" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function GlobeGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--plt-muted)" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--plt-muted)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-0 transition-opacity group-hover:opacity-100"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
