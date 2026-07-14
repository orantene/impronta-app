"use client";

/**
 * Post-login welcome shown inside the marketing LoginModal. Minimal "Welcome
 * back" + workspaces, then horizontal quick-link decks (arrow sliders) for work
 * shortcuts and profile management. Deliberately flat: plain icons, no icon
 * chips / tinted fills / pills — the busy version was rejected. Data comes from
 * `loadWelcomeModel` (same identity model the header account menu uses).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { AccountAvatar } from "./marketing-account-menu";
import type {
  WelcomeModel,
  WelcomeQuickLink,
  WelcomeQuickLinkKey,
} from "./welcome-actions";

type WelcomeCopy = {
  welcome: string;
  workspaces: string;
  quickLinks: string;
  profilePages: string;
  manage: string;
  showAll: (n: number) => string;
  showLess: string;
  browse: string;
  live: string;
  hidden: string;
  label: Record<WelcomeQuickLinkKey, string>;
};

function getWelcomeCopy(locale: string): WelcomeCopy {
  return pickLocale(locale, {
    en: {
      welcome: "Welcome back",
      workspaces: "Your workspaces",
      quickLinks: "Quick links",
      profilePages: "Your profile pages",
      manage: "Manage your profile",
      showAll: (n) => `Show all ${n}`,
      showLess: "Show less",
      browse: "Keep browsing",
      live: "Live",
      hidden: "Hidden",
      label: {
        messages: "Messages",
        bookings: "Bookings",
        earnings: "Earnings",
        services: "Services",
        dashboard: "Dashboard",
        editProfile: "Edit profile",
        appearance: "Appearance",
        membership: "Membership",
        reviews: "Reviews",
        trust: "Trust",
        saved: "Saved",
        account: "Account",
      },
    },
    es: {
      welcome: "Bienvenido de nuevo",
      workspaces: "Tus workspaces",
      quickLinks: "Accesos rápidos",
      profilePages: "Tus páginas de perfil",
      manage: "Gestiona tu perfil",
      showAll: (n) => `Ver los ${n}`,
      showLess: "Ver menos",
      browse: "Seguir explorando",
      live: "En vivo",
      hidden: "Oculta",
      label: {
        messages: "Mensajes",
        bookings: "Reservas",
        earnings: "Ingresos",
        services: "Servicios",
        dashboard: "Panel",
        editProfile: "Editar perfil",
        appearance: "Apariencia",
        membership: "Membresía",
        reviews: "Reseñas",
        trust: "Confianza",
        saved: "Guardados",
        account: "Cuenta",
      },
    },
  });
}

const WORKSPACES_COLLAPSED = 3;

export function LoginWelcomePanel({
  model,
  locale = "en",
  onDismiss,
}: {
  model: WelcomeModel;
  locale?: string;
  onDismiss: () => void;
}) {
  const t = getWelcomeCopy(locale);
  const { account, quickLinks, profileLinks } = model;
  const [expanded, setExpanded] = useState(false);
  const firstName =
    account.displayName.trim().split(/\s+/)[0] || account.displayName;
  const shownWorkspaces = expanded
    ? account.workspaces
    : account.workspaces.slice(0, WORKSPACES_COLLAPSED);

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
            className="plt-display truncate text-[1.375rem] font-semibold leading-[1.1] tracking-[-0.02em]"
            style={{ color: "var(--plt-ink)" }}
          >
            {firstName}
          </h2>
          <p className="truncate text-[0.8125rem]" style={{ color: "var(--plt-muted)" }}>
            {account.email}
          </p>
        </div>
      </div>

      {/* Workspaces */}
      {account.workspaces.length > 0 ? (
        <section className="mt-6">
          <SectionLabel>{t.workspaces}</SectionLabel>
          <div className="mt-2 space-y-0.5">
            {shownWorkspaces.map((w) => (
              <Link
                key={w.slug}
                href={w.href}
                onClick={onDismiss}
                className="group flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-[var(--plt-bg-raised)]"
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
              className="mt-1.5 text-[0.75rem] font-medium underline underline-offset-2 transition-colors hover:text-[var(--plt-forest)]"
              style={{ color: "var(--plt-muted)" }}
            >
              {expanded ? t.showLess : t.showAll(account.workspaces.length)}
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Quick links (under workspaces, arrow slider) */}
      {quickLinks.length > 0 ? (
        <section className="mt-6">
          <LinkDeck title={t.quickLinks} links={quickLinks} t={t} onNavigate={onDismiss} />
        </section>
      ) : null}

      {/* Profile pages + profile-management deck */}
      {account.talentPages.length > 0 || profileLinks.length > 0 ? (
        <section className="mt-6">
          <SectionLabel>{t.profilePages}</SectionLabel>
          {account.talentPages.length > 0 ? (
            <div className="mt-2 space-y-0.5">
              {account.talentPages.slice(0, 3).map((p) => (
                <a
                  key={p.key}
                  href={p.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-[var(--plt-bg-raised)]"
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
          ) : null}
          {profileLinks.length > 0 ? (
            <div className="mt-4">
              <LinkDeck title={t.manage} links={profileLinks} t={t} onNavigate={onDismiss} />
            </div>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        onClick={onDismiss}
        className="mt-7 w-full rounded-full px-5 py-2.5 text-[0.8125rem] font-medium transition-colors hover:bg-[var(--plt-bg-raised)]"
        style={{ color: "var(--plt-muted)", border: "1px solid var(--plt-hairline)" }}
      >
        {t.browse}
      </button>
    </div>
  );
}

/* ───────────────────────── Deck (arrow slider) ───────────────────────── */

function LinkDeck({
  title,
  links,
  t,
  onNavigate,
}: {
  title: string;
  links: WelcomeQuickLink[];
  t: WelcomeCopy;
  onNavigate: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    sync();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync, links.length]);

  const scroll = (dir: 1 | -1) =>
    scrollRef.current?.scrollBy({ left: dir * 176, behavior: "smooth" });

  const showArrows = canLeft || canRight;

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionLabel>{title}</SectionLabel>
        {showArrows ? (
          <div className="flex items-center gap-1">
            <DeckArrow dir="left" disabled={!canLeft} onClick={() => scroll(-1)} />
            <DeckArrow dir="right" disabled={!canRight} onClick={() => scroll(1)} />
          </div>
        ) : null}
      </div>
      <div
        ref={scrollRef}
        onScroll={sync}
        className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {links.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            onClick={onNavigate}
            className="group flex min-w-[86px] shrink-0 snap-start flex-col items-center gap-2.5 rounded-2xl border px-2 py-4 text-center transition-colors hover:border-[var(--plt-forest)]"
            style={{
              borderColor: "var(--plt-hairline-strong)",
              background: "var(--plt-bg)",
            }}
          >
            <span style={{ color: "var(--plt-forest)" }}>
              <QuickIcon kind={l.key} />
            </span>
            <span
              className="text-[0.8125rem] font-medium leading-none"
              style={{ color: "var(--plt-ink)" }}
            >
              {t.label[l.key]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DeckArrow({
  dir,
  disabled,
  onClick,
}: {
  dir: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors disabled:opacity-25 enabled:hover:bg-[var(--plt-bg-raised)]"
      style={{ color: "var(--plt-ink-soft)" }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{ transform: dir === "left" ? "rotate(180deg)" : undefined }}
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/* ───────────────────────── Bits ───────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.75rem] font-medium" style={{ color: "var(--plt-ink-soft)" }}>
      {children}
    </p>
  );
}

/* ───────────────────────── Icons (plain, stroke = inherited color) ───────────────────────── */

function QuickIcon({ kind }: { kind: WelcomeQuickLinkKey }) {
  const p = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "messages":
      return (
        <svg {...p} aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.8L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
        </svg>
      );
    case "bookings":
      return (
        <svg {...p} aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "earnings":
      return (
        <svg {...p} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v10M9.5 9.5a2.5 2 0 0 1 5 0c0 1.4-1.5 1.8-2.5 2.5-1 .7-2.5 1.1-2.5 2.5a2.5 2 0 0 0 5 0" />
        </svg>
      );
    case "services":
      return (
        <svg {...p} aria-hidden>
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z" />
          <circle cx="7.5" cy="7.5" r="1.2" />
        </svg>
      );
    case "editProfile":
      return (
        <svg {...p} aria-hidden>
          <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
          <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case "appearance":
      return (
        <svg {...p} aria-hidden>
          <path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 2-2 2 2 0 0 1 2-2h1a4 4 0 0 0 4-4 9 9 0 0 0-11-8z" />
          <circle cx="7.5" cy="10.5" r="1" />
          <circle cx="12" cy="7.5" r="1" />
          <circle cx="16.5" cy="10.5" r="1" />
        </svg>
      );
    case "membership":
      return (
        <svg {...p} aria-hidden>
          <circle cx="12" cy="9" r="5" />
          <path d="M8.5 13.5 7 22l5-3 5 3-1.5-8.5" />
        </svg>
      );
    case "reviews":
      return (
        <svg {...p} aria-hidden>
          <path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17.8 6.6 19.6l1-6L3.3 9.4l6-.9L12 3z" />
        </svg>
      );
    case "trust":
      return (
        <svg {...p} aria-hidden>
          <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "saved":
      return (
        <svg {...p} aria-hidden>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
      );
    case "account":
      return (
        <svg {...p} aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.65 1.65 0 0 0-2.8 1.2 2 2 0 1 1-4 0 1.65 1.65 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.65 1.65 0 0 0 4.6 15a2 2 0 1 1 0-4 1.65 1.65 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.65 1.65 0 0 0 11 4.6a2 2 0 1 1 4 0 1.65 1.65 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.65 1.65 0 0 0 19.4 9a2 2 0 1 1 0 4z" />
        </svg>
      );
    default:
      return (
        <svg {...p} aria-hidden>
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
