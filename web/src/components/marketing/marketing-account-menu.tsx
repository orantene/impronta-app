"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MarketingCopy } from "@/lib/marketing/copy";
import { withLocaleHref } from "@/i18n/pathnames";
import { HeaderPopover } from "./marketing-header-popover";

/** A tenant the signed-in user belongs to, with a direct link to its dashboard. */
export type MarketingWorkspaceLink = {
  slug: string;
  name: string;
  role: "owner" | "admin" | "coordinator" | "editor" | "viewer";
  /** Absolute URL to this workspace's admin dashboard on the app host. */
  href: string;
};

/** A public profile page the talent has on a tenant (or their own Tulala page). */
export type MarketingTalentPage = {
  key: string;
  name: string;
  kind: "self_page" | "agency" | "hub";
  /** Absolute URL to the public page — opened in a new tab. */
  href: string;
  status: "live" | "hidden" | "pending" | "winding_down";
  /** Subscription-tier badge on the talent's own page only. */
  planBadge: "MAX" | "PRO" | null;
};

/** A tenant a client has engaged, linking to that tenant's client dashboard. */
export type MarketingClientTenant = {
  slug: string;
  name: string;
  href: string;
};

/** Signed-in identity, resolved server-side in the shell and passed down. */
export type MarketingAccount = {
  displayName: string;
  email: string;
  /** Absolute URL to the user's dashboard on the app host (fallback). */
  dashboardHref: string;
  /** Where the identity header (name/email/avatar) links to. */
  accountHref: string;
  /** Every tenant the user is a member of (owner → viewer). */
  workspaces: MarketingWorkspaceLink[];
  /** The talent's public pages, if the user is a talent. */
  talentPages: MarketingTalentPage[];
  isTalent: boolean;
  /** The talent-controlled global "hide me everywhere" kill-switch is on. */
  globalHidden: boolean;
  /** Talent quick-link destinations (present only for talent accounts). */
  talentLinks: {
    dashboard: string;
    editProfile: string;
    bookings: string;
    messages: string;
  } | null;
  /** Upgrade CTA target for Free-tier talent (unlocks the Max custom page
   *  builder); null for paid tiers or non-talent. */
  talentUpgradeHref: string | null;
  /** Pure-client account (no workspace roles, not a talent). */
  isClient: boolean;
  /** Tenants the client has engaged, each → that tenant's client dashboard. */
  clientTenants: MarketingClientTenant[];
  /** Client quick links (single-tenant clients only); null otherwise. */
  clientLinks: { messages: string; saved: string; account: string } | null;
};

const ROLE_LABEL: Record<MarketingWorkspaceLink["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  coordinator: "Coordinator",
  editor: "Editor",
  viewer: "Viewer",
};

/** Profile icon — the account glyph for a signed-in visitor. */
export function AccountAvatar({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "h-9 w-9" : "h-7 w-7";
  return (
    <span
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full`}
      style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}
      aria-hidden
    >
      <UserGlyph size={size === "lg" ? 18 : 14} />
    </span>
  );
}

const ROW =
  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.875rem] font-medium transition-colors hover:bg-[var(--plt-bg-raised)]";

/** Desktop account control — avatar + name trigger with a dropdown menu. */
export function DesktopAccount({
  account,
  copy,
  signOutAction,
  locale = "en",
}: {
  account: MarketingAccount;
  copy: MarketingCopy["nav"];
  signOutAction?: () => void | Promise<void>;
  /** Active locale — keeps the New-workspace link in the visitor's tree. */
  locale?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const hasWorkspaces = account.workspaces.length > 0;
  const hasTalent = account.isTalent;
  const showTabs = hasWorkspaces && hasTalent;
  const [tab, setTab] = useState<"workspaces" | "pages">(
    hasWorkspaces ? "workspaces" : "pages",
  );

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showWorkspaceList = showTabs ? tab === "workspaces" : hasWorkspaces;
  const showTalentList = showTabs ? tab === "pages" : hasTalent && !hasWorkspaces;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        aria-label={account.displayName}
        /* Colours as classes, not inline `style` — inline outranks stylesheet
           rules and would nullify the `hover:` variants. On mobile the trigger
           collapses to the avatar alone — the name would crowd a 375px bar. */
        className="group flex items-center gap-1.5 rounded-[10px] border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg-raised)] p-1 transition-[background-color,border-color] hover:border-[var(--plt-ink-soft)] hover:bg-[var(--plt-bg-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plt-forest)] lg:pr-2"
      >
        <AccountAvatar />
        <span
          className="hidden max-w-[7rem] truncate text-[0.875rem] font-medium leading-none lg:inline"
          style={{ color: "var(--plt-ink)" }}
        >
          {account.displayName}
        </span>
        <span className="hidden lg:inline-flex">
          <ChevronDownGlyph open={open} />
        </span>
      </button>

      {open ? (
        <HeaderPopover
          label={account.displayName}
          widthClass="lg:w-[18.5rem]"
          onClose={() => setOpen(false)}
        >
          <>
            <a
              href={account.accountHref}
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--plt-bg-raised)]"
            >
              <AccountAvatar size="lg" />
              <div className="min-w-0">
                <p
                  className="truncate text-[0.875rem] font-semibold leading-tight"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {account.displayName}
                </p>
                <p
                  className="truncate text-[0.75rem] leading-tight"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {account.email}
                </p>
              </div>
            </a>

            <div className="my-1 h-px" style={{ background: "var(--plt-hairline)" }} aria-hidden />

            {showTabs ? (
              <div
                className="mb-1 flex gap-1 rounded-[11px] p-1"
                style={{ background: "var(--plt-bg-raised)" }}
              >
                <TabButton active={tab === "workspaces"} onClick={() => setTab("workspaces")}>
                  {copy.workspaces}
                </TabButton>
                <TabButton active={tab === "pages"} onClick={() => setTab("pages")}>
                  {copy.myPages}
                </TabButton>
              </div>
            ) : null}

            {showWorkspaceList ? (
              account.workspaces.map((w) => (
                <a
                  key={`${w.slug}:${w.role}`}
                  href={w.href}
                  role="menuitem"
                  className={ROW}
                  style={{ color: "var(--plt-ink)" }}
                >
                  <GridGlyph />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  <span
                    className="shrink-0 text-[0.6875rem] font-medium uppercase tracking-wide"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {ROLE_LABEL[w.role]}
                  </span>
                </a>
              ))
            ) : showTalentList ? (
              <TalentSection account={account} copy={copy} />
            ) : account.isClient ? (
              <ClientSection account={account} copy={copy} />
            ) : (
              <a
                href={account.dashboardHref}
                role="menuitem"
                className={ROW}
                style={{ color: "var(--plt-ink)" }}
              >
                <GridGlyph />
                {copy.dashboard}
              </a>
            )}

            <div className="my-1 h-px" style={{ background: "var(--plt-hairline)" }} aria-hidden />

            <Link
              href={withLocaleHref("/get-started", locale)}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={ROW}
              style={{ color: "var(--plt-ink-soft)" }}
            >
              <PlusGlyph />
              {hasTalent && !hasWorkspaces ? copy.openWorkspace : copy.newWorkspace}
            </Link>

            {signOutAction ? (
              <form action={signOutAction}>
                <button
                  type="submit"
                  role="menuitem"
                  className={`${ROW} w-full text-left`}
                  style={{ color: "var(--plt-ink-soft)" }}
                >
                  <SignOutGlyph />
                  {copy.signOut}
                </button>
              </form>
            ) : null}
          </>
        </HeaderPopover>
      ) : null}
    </div>
  );
}

/** Talent "My pages" composition — public pages with visibility + a quick-link row. */
export function TalentSection({
  account,
  copy,
}: {
  account: MarketingAccount;
  copy: MarketingCopy["nav"];
}) {
  return (
    <>
      {account.globalHidden ? (
        <div
          className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-[0.75rem]"
          style={{ background: "var(--plt-bg-raised)", color: "var(--plt-muted)" }}
        >
          <EyeOffGlyph />
          <span>{copy.hiddenEverywhere}</span>
        </div>
      ) : null}

      {account.talentPages.map((p) => {
        const label = p.kind === "self_page" ? copy.yourTulalaPage : p.name;
        // The own-page row can carry an Upgrade link, so it can't be a single
        // anchor (no nested <a>). Render the page link + trailing action as
        // siblings inside a hover container.
        const trailing = p.planBadge ? (
          <PlanBadge label={p.planBadge} />
        ) : p.kind === "self_page" && account.talentUpgradeHref ? (
          <a
            href={account.talentUpgradeHref}
            role="menuitem"
            className="shrink-0 rounded-md px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide transition-colors"
            style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}
          >
            Upgrade
          </a>
        ) : null;

        return (
          <div key={p.key} className={`${ROW} justify-between`} role="none">
            <a
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className="flex min-w-0 flex-1 items-center gap-2.5"
              style={{ color: "var(--plt-ink)" }}
            >
              <GlobeGlyph />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </a>
            {trailing}
            <PageStatus status={p.status} copy={copy} />
          </div>
        );
      })}

      {account.talentLinks ? (
        <>
          <div className="my-1 h-px" style={{ background: "var(--plt-hairline)" }} aria-hidden />
          <a href={account.talentLinks.dashboard} role="menuitem" className={ROW} style={{ color: "var(--plt-ink)" }}>
            <GridGlyph />
            {copy.talentDashboard}
          </a>
          <a href={account.talentLinks.editProfile} role="menuitem" className={ROW} style={{ color: "var(--plt-ink)" }}>
            <UserLineGlyph />
            {copy.editProfile}
          </a>
          <a href={account.talentLinks.bookings} role="menuitem" className={ROW} style={{ color: "var(--plt-ink)" }}>
            <CalendarGlyph />
            {copy.bookings}
          </a>
          <a href={account.talentLinks.messages} role="menuitem" className={ROW} style={{ color: "var(--plt-ink)" }}>
            <MailGlyph />
            {copy.messages}
          </a>
        </>
      ) : null}
    </>
  );
}

/** Client composition — the tenants they've engaged, plus quick links when
 *  they work with a single tenant. */
export function ClientSection({
  account,
  copy,
}: {
  account: MarketingAccount;
  copy: MarketingCopy["nav"];
}) {
  return (
    <>
      {account.clientTenants.length > 0 ? (
        account.clientTenants.map((t) => (
          <a
            key={t.slug}
            href={t.href}
            role="menuitem"
            className={ROW}
            style={{ color: "var(--plt-ink)" }}
          >
            <GridGlyph />
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
          </a>
        ))
      ) : (
        <a
          href={account.dashboardHref}
          role="menuitem"
          className={ROW}
          style={{ color: "var(--plt-ink)" }}
        >
          <GridGlyph />
          {copy.dashboard}
        </a>
      )}

      {account.clientLinks ? (
        <>
          <div className="my-1 h-px" style={{ background: "var(--plt-hairline)" }} aria-hidden />
          <a href={account.clientLinks.messages} role="menuitem" className={ROW} style={{ color: "var(--plt-ink)" }}>
            <MailGlyph />
            {copy.messages}
          </a>
          <a href={account.clientLinks.saved} role="menuitem" className={ROW} style={{ color: "var(--plt-ink)" }}>
            <HeartGlyph />
            {copy.savedTalent}
          </a>
          <a href={account.clientLinks.account} role="menuitem" className={ROW} style={{ color: "var(--plt-ink)" }}>
            <UserLineGlyph />
            {copy.accountSettings}
          </a>
        </>
      ) : null}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-[8px] py-1.5 text-[0.8125rem] font-medium transition-colors"
      style={
        active
          ? { background: "var(--plt-forest)", color: "var(--plt-forest-on)" }
          : { background: "transparent", color: "var(--plt-muted)" }
      }
    >
      {children}
    </button>
  );
}

function PlanBadge({ label }: { label: "MAX" | "PRO" }) {
  const isMax = label === "MAX";
  return (
    <span
      className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide"
      style={
        isMax
          ? { background: "var(--plt-forest)", color: "var(--plt-forest-on)" }
          : { border: "1px solid var(--plt-hairline-strong)", color: "var(--plt-ink-soft)" }
      }
    >
      {label}
    </span>
  );
}

function PageStatus({
  status,
  copy,
}: {
  status: MarketingTalentPage["status"];
  copy: MarketingCopy["nav"];
}) {
  if (status === "live") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium" style={{ color: "var(--plt-ink-soft)" }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#3f9b6b" }} aria-hidden />
        {copy.statusLive}
      </span>
    );
  }
  if (status === "hidden") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium" style={{ color: "var(--plt-muted)" }}>
        <EyeOffGlyph />
        {copy.statusHidden}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[0.6875rem] font-medium" style={{ color: "var(--plt-muted)" }}>
      {status === "pending" ? copy.statusPending : copy.statusWindingDown}
    </span>
  );
}

function ChevronDownGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={`transition-transform duration-200 group-hover:rotate-90${open ? " rotate-90" : ""}`}
      style={{ opacity: 0.55 }}
    >
      <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UserLineGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function GridGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function GlobeGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeartGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <path
        d="M12 20s-7-4.35-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5C19 15.65 12 20 12 20z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeOffGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.6 6.2A9.7 9.7 0 0112 6c5 0 9 6 9 6a15 15 0 01-2.4 2.9M6.5 7.7A15 15 0 003 12s4 6 9 6a9 9 0 004-.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-muted)" }}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SignOutGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-muted)" }}>
      <path d="M15 12H4m0 0l4-4m-4 4l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
