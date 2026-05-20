"use client";

/**
 * Client surface — what a booker (brand / casting director) sees when they
 * sign in. Centered on the inquiry → messaging → booking pipeline. Clicking
 * any inquiry opens the shared `inquiry-workspace` drawer with `pov="client"`,
 * so the client sees ONLY the private thread with their coordinator (talent
 * group thread is hidden) plus the offer + booking panels.
 *
 * Pages:
 *   ClientTodayPage    — pulse: pending decisions, awaiting agency, upcoming
 *   ClientDiscoverPage — DISCOVER_TALENT browser (gated by ClientPlan = pro)
 *   ClientShortlistsPage — saved shortlists
 *   ClientInquiriesPage  — inquiries grouped by stage
 *   ClientBookingsPage   — confirmed bookings
 *   ClientSettingsPage   — brand, team, billing
 */

import React, { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
// Lazy import — _messages.tsx pulls react-virtuoso transitively which
// is not SSR-safe. ssr:false matches how _talent.tsx loads it too.
const ClientMessagesShellLazy = dynamic(
  () => import("./messages").then((m) => m.MessagesShell),
  { ssr: false },
);
const InquiryComposerLazy = dynamic(
  () => import("./messages").then((m) => m.InquiryComposer),
  { ssr: false },
);
// Eager import — pinNextConversation is a tiny synchronous helper, no
// React tree, so dynamic-ing it would just complicate the call site.
import { pinNextConversation } from "./messages";
import {
  AGENCY_RELIABILITY,
  CLIENT_BOOKINGS,
  CLIENT_INQUIRIES,
  CLIENT_PAGES,
  CLIENT_PAGE_META,
  CLIENT_PLAN_META,
  COLORS,
  DISCOVER_TALENT,
  TAXONOMY,
  RADIUS,
  TRANSITION,
  FONTS,
  INQUIRY_STAGE_META,
  MY_CLIENT_BRAND,
  MY_SHORTLISTS,
  RICH_INQUIRIES,
  meetsClientPlan,
  useAdminShell,
  type ClientBooking,
  type ClientBookingPostStatus,
  type DiscoverTalent,
  type RichInquiry,
  type Shortlist,
} from "./state";
import {
  Avatar,
  Bullet,
  CapsLabel,
  Divider,
  EmptyState,
  Icon,
  PrimaryButton,
  SecondaryButton,
  StatDot,
  TrustBadgeGroup,
  ProfilePhotoBadgeOverlay,
} from "./primitives";

// ════════════════════════════════════════════════════════════════════
// Surface entry
// ════════════════════════════════════════════════════════════════════

export function ClientSurface() {
  return (
    <div style={{ minHeight: "calc(100vh - 50px)" }} className="bg-admin-surface">
      <ClientTopbar />
      <main
        data-tulala-surface-main
        style={{
          padding: "28px 28px 100px",
          maxWidth: 1240,
          margin: "0 auto",
        }}
      >
        <ClientRouter />
      </main>
      {/* #14 — Mobile bottom tab nav. */}
      <ClientBottomNav />
    </div>
  );
}

/**
 * #11 — First-run wizard. 4 quick screens that seed the client's
 * preferences before they hit the empty Today. Lives in a full-screen
 * modal so it can't be ignored, but always escapable.
 */
function ClientFirstRunWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [accountType, setAccountType] = useState<"business" | "personal" | null>(null);
  const [needs, setNeeds] = useState<Set<string>>(new Set());
  const [city, setCity] = useState("");
  const toggleNeed = (n: string) => setNeeds(s => {
    const next = new Set(s);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });
  const dismiss = () => {
    try { window.sessionStorage.setItem("tulala_client_wizard_dismissed", "1"); } catch {}
    onClose();
  };
  const finish = dismiss;

  const screens = [
    {
      title: "Welcome to Tulala.",
      sub: "30 seconds to set you up. We'll match you with the right agencies.",
      body: (
        <div className="flex flex-col gap-2.5">
          {[
            { id: "business" as const, label: "I'm a business", desc: "Beach club, hotel, brand, restaurant — recurring or one-off bookings." },
            { id: "personal" as const, label: "I'm booking for myself", desc: "Personal event, dinner, party, photoshoot." },
          ].map(o => {
            const active = accountType === o.id;
            return (
              <button key={o.id} type="button" onClick={() => setAccountType(o.id)} style={{
                padding: "14px 16px", borderRadius: 12,
                border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                background: active ? "rgba(15,79,62,0.06)" : "#fff",
                fontFamily: FONTS.body, textAlign: "left", cursor: "pointer",
              }}>
                <div className="text-admin-ink text-sm font-semibold">{o.label}</div>
                <div style={{ fontSize: 12, marginTop: 3 }} className="text-admin-ink-muted">{o.desc}</div>
              </button>
            );
          })}
        </div>
      ),
      canNext: !!accountType,
    },
    {
      title: "What do you typically book?",
      sub: "Pick all that apply — we'll filter Discover for you.",
      body: (
        <div className="flex flex-wrap gap-2">
          {[
            { id: "models",        label: "Models",        emoji: "👤" },
            { id: "hosts",         label: "Hosts",         emoji: "🎤" },
            { id: "chefs",         label: "Chefs",         emoji: "👨‍🍳" },
            { id: "artists",       label: "Artists",       emoji: "🎨" },
            { id: "djs",           label: "DJs",           emoji: "🎧" },
            { id: "photographers", label: "Photographers", emoji: "📷" },
            { id: "performers",    label: "Performers",    emoji: "✨" },
          ].map(n => {
            const active = needs.has(n.id);
            return (
              <button key={n.id} type="button" onClick={() => toggleNeed(n.id)} style={{
                padding: "9px 14px", borderRadius: 999,
                border: `1.5px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
                background: active ? "rgba(15,79,62,0.08)" : "#fff",
                color: active ? COLORS.accentDeep : COLORS.ink,
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                <span aria-hidden className="text-sm">{n.emoji}</span>
                {n.label}
              </button>
            );
          })}
        </div>
      ),
      canNext: needs.size > 0,
    },
    {
      title: "Where are you based?",
      sub: "We'll prioritize talent in your city.",
      body: (
        <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Tulum, Madrid, New York"
          style={{
            width: "100%", boxSizing: "border-box", padding: "14px 16px",
            borderRadius: 12, border: `1.5px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body, fontSize: 15, color: COLORS.ink, outline: "none",
          }}
        />
      ),
      canNext: city.trim().length > 0,
    },
    {
      title: "You're all set.",
      sub: "Discover is filtered to what you book. Your concierge is one tap away.",
      body: (
        <div style={{ padding: "14px 16px", borderRadius: 12, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.5 }} className="bg-admin-success-soft text-admin-success-deep">
          Tap <strong>Discover</strong> to find your first talent, or send a quick question to your concierge from the chat icon.
        </div>
      ),
      canNext: true,
    },
  ];

  const cur = screens[step]!;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(11,11,13,0.42)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}
      onClick={dismiss}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, background: "#fff",
        borderRadius: "20px 20px 0 0",
        padding: "20px 22px max(22px, env(safe-area-inset-bottom)) 22px",
        fontFamily: FONTS.body,
        boxShadow: "0 -10px 40px -8px rgba(11,11,13,0.25)",
      }}>
        {/* Step pips */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
          {screens.map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? COLORS.accent : "rgba(11,11,13,0.08)",
              transition: "background .2s",
            }} />
          ))}
        </div>
        <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.15 }} className="text-admin-ink">{cur.title}</h2>
        <p style={{ margin: "6px 0 16px", fontSize: 13.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {cur.sub}
        </p>
        <div style={{ marginBottom: 18 }}>{cur.body}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <button type="button" onClick={dismiss} style={{
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, fontWeight: 500,
          }}>Skip</button>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(s => s - 1)} style={{
                padding: "10px 14px", borderRadius: 999,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Back</button>
            )}
            {step < screens.length - 1 ? (
              <button type="button" disabled={!cur.canNext} onClick={() => setStep(s => s + 1)} style={{
                padding: "10px 18px", borderRadius: 999,
                border: "none", background: cur.canNext ? COLORS.accent : "rgba(11,11,13,0.10)",
                color: cur.canNext ? "#fff" : COLORS.inkDim,
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
                cursor: cur.canNext ? "pointer" : "default",
              }}>Continue</button>
            ) : (
              <button type="button" onClick={finish} style={{
                padding: "10px 18px", borderRadius: 999,
                border: "none", background: COLORS.accent, color: "#fff",
                fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Get started</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientBottomNav() {
  const { state, setClientPage } = useAdminShell();
  const tabs: { id: typeof state.clientPage; label: string; icon: React.ReactNode }[] = [
    { id: "today",      label: "Today",     icon: <BNavIcon name="bolt" /> },
    { id: "messages",   label: "Messages",  icon: <BNavIcon name="mail" /> },
    { id: "discover",   label: "Discover",  icon: <BNavIcon name="search" /> },
    { id: "shortlists", label: "Lists",     icon: <BNavIcon name="bookmark" /> },
    { id: "settings",   label: "Settings",  icon: <BNavIcon name="settings" /> },
  ];
  return (
    <nav data-tulala-client-bottom-nav aria-label="Client navigation" style={{
      position: "fixed", left: 0, right: 0, bottom: 0,
      display: "none",
      background: "rgba(255,255,255,0.96)",
      backdropFilter: "blur(10px)",
      borderTop: `1px solid ${COLORS.borderSoft}`,
      padding: "6px 8px max(8px, env(safe-area-inset-bottom)) 8px",
      zIndex: 100,
      fontFamily: FONTS.body,
    }}>
      <style>{`
        @media (max-width: 720px) {
          [data-tulala-client-bottom-nav] { display: flex !important; justify-content: space-around; align-items: stretch; }
          /* Hide the top nav scroll on mobile since bottom nav covers it */
          [data-tulala-app-topbar][data-tulala-client-topbar] { display: none !important; }
        }
      `}</style>
      {tabs.map(t => {
        const active = state.clientPage === t.id;
        return (
          <button key={t.id} type="button" onClick={() => setClientPage(t.id)} style={{
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            padding: "6px 4px", flex: 1, minWidth: 0,
            color: active ? COLORS.accent : COLORS.inkMuted,
            fontSize: 10, fontWeight: 600,
          }}>
            <span style={{ width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {t.icon}
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

// Tiny icon helper for the bottom nav. SVGs inline to keep the nav
// self-contained and dependency-free.
function BNavIcon({ name }: { name: "bolt" | "mail" | "search" | "bookmark" | "settings" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "bolt") return <svg {...common}><path d="M10 2L4 10h4l-2 6 6-8h-4l2-6z"/></svg>;
  if (name === "mail") return <svg {...common}><rect x="2" y="4" width="14" height="10" rx="2"/><path d="M2 6l7 5 7-5"/></svg>;
  if (name === "search") return <svg {...common}><circle cx="8" cy="8" r="5"/><path d="M12 12l3 3"/></svg>;
  if (name === "bookmark") return <svg {...common}><path d="M5 2h8v14l-4-3-4 3V2z"/></svg>;
  return <svg {...common}><circle cx="9" cy="9" r="2.5"/><path d="M9 1.5v3M9 13.5v3M1.5 9h3M13.5 9h3M3.5 3.5l2 2M12.5 12.5l2 2M3.5 14.5l2-2M12.5 5.5l2-2"/></svg>;
}

// ─── Topbar ───────────────────────────────────────────────────────

// ClientTopbar — slim page nav only (mirrors TalentTopbar). Brand
// identity, plan chip, and unread/notification indicator have all moved:
//   • brand → handled by the persistent identity bar above
//   • plan chip → moved into the brand-switcher drawer detail
//   • unread → bottom-nav Messages tab badge (parity with talent)
function ClientTopbar() {
  const { state, setClientPage } = useAdminShell();

  return (
    <header
      data-tulala-app-topbar
      data-tulala-client-topbar
      style={{
        background: "#fff",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        padding: "0 28px",
        position: "sticky",
        top: "calc(var(--proto-cbar, 50px) + 56px)",
        zIndex: 40,
      }}
    >
      <div
        data-tulala-app-topbar-row
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 52,
        }}
      >
        <nav data-tulala-app-topbar-nav aria-label="Client sections" style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
          {CLIENT_PAGES.map((p) => {
            const active = state.clientPage === p;
            return (
              <button
                key={p}
                onClick={() => setClientPage(p)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 12px",
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? COLORS.ink : COLORS.inkMuted,
                  letterSpacing: 0.1,
                  borderRadius: 7,
                  position: "relative",
                  transition: `color ${TRANSITION.micro}, background ${TRANSITION.micro}`,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.ink;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.inkMuted;
                }}
              >
                {CLIENT_PAGE_META[p].label}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -14,
                    left: 8,
                    right: 8,
                    height: 3,
                    background: COLORS.fill,
                    borderRadius: 2,
                    opacity: active ? 1 : 0,
                    transform: active ? "scaleX(1)" : "scaleX(0.4)",
                    transformOrigin: "center",
                    transition: `opacity ${TRANSITION.md}, transform ${TRANSITION.drawer}`,
                    pointerEvents: "none",
                  }}
                />
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

// ─── Router ───────────────────────────────────────────────────────

function ClientRouter() {
  const { state } = useAdminShell();
  switch (state.clientPage) {
    case "today":
      return <ClientTodayPage />;
    case "discover":
      return <ClientDiscoverPage />;
    case "shortlists":
      return <ClientShortlistsPage />;
    case "inquiries":
      return <ClientInquiriesPage />;
    case "bookings":
      return <ClientBookingsPage />;
    case "settings":
      return <ClientSettingsPage />;
    case "notifications":
      return <ClientNotificationsPage />;
    case "messages":
      return <ClientMessagesPage />;
  }
}

/**
 * Client Messages page — mirror of TalentMessagesPage. Same chat
 * surface; production wires the same conversation thread to both
 * surfaces with `pov: "talent" | "client"` so the bubbles align
 * correctly on each side. The current shell ships the talent component
 * here as a placeholder demonstrating the parity (same UX both sides).
 */
// Client messages = same component as talent. The previous explanatory
// banner was didactic noise — removed so the client surface
// renders the unified MessagesShell flush with the page header (parity
// with talent + workspace).
// Client uses pov="client" — gets its OWN distinct shell
// (ClientProjectShell): project-status hero, single Next-action CTA,
// agency card, talent lineup avatars, schedule, timeline, single chat
// thread with the coordinator at the bottom. NOT the talent shell.
function ClientMessagesPage() {
  return <ClientMessagesShellLazy pov="client" />;
}

// ─── Shared header ────────────────────────────────────────────────

function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <>
    <style>{`
      @media (max-width: 680px) {
        [data-tulala-page-header] [data-tulala-h1] {
          font-size: 19px !important; line-height: 1.2 !important; letter-spacing: -0.25px !important; font-weight: 700 !important;
        }
        [data-tulala-page-header] { margin-bottom: 10px !important; gap: 8px !important; align-items: baseline !important; }
        [data-tulala-page-header] [data-tulala-page-eyebrow] { display: none !important; }
        [data-tulala-page-header] p { display: none !important; }
        [data-tulala-page-header-actions] { flex-shrink: 0 !important; }
      }
    `}</style>
    <div data-tulala-page-header style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <div data-tulala-page-eyebrow style={{ marginBottom: 6 }}>
            <CapsLabel>{eyebrow}</CapsLabel>
          </div>
        )}
        <h1
          data-tulala-h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: COLORS.ink,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontFamily: FONTS.body, fontSize: 13, margin: "4px 0 0", lineHeight: 1.5, maxWidth: 640 }} className="text-admin-ink-muted">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div data-tulala-page-header-actions style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
    </>
  );
}

function Grid({ children, cols = "auto" }: { children: ReactNode; cols?: "auto" | "2" | "3" | "4" }) {
  const colMap = {
    auto: "repeat(auto-fit, minmax(280px, 1fr))",
    "2": "repeat(2, 1fr)",
    "3": "repeat(3, 1fr)",
    "4": "repeat(4, 1fr)",
  };
  return (
    <div data-tulala-grid={cols} style={{ display: "grid", gridTemplateColumns: colMap[cols], gap: 12 }}>{children}</div>
  );
}

// ─── Budget strip (C15) ───────────────────────────────────────────


// ════════════════════════════════════════════════════════════════════
// TODAY — pulse driven by RICH_INQUIRIES (so client sees real inquiry stages)
// ════════════════════════════════════════════════════════════════════

// Thread-first Today page. Replaces the old dashboard-of-cards layout.
// One continuous action feed organized into three buckets — Needs You /
// Moving / Coming Up — every row routes into the inquiry workspace
// (the message shell). Business-critical decisions stay inside the
// thread until accept/counter server actions exist.
function ClientTodayPage() {
  const { setClientPage } = useAdminShell();
  const pendingDecisions = RICH_INQUIRIES.filter(
    (i) => i.stage === "offer_pending" && i.offer?.clientApproval === "pending",
  );
  const awaitingAgency = RICH_INQUIRIES.filter(
    (i) => i.stage === "submitted" || i.stage === "coordination",
  );
  const upcoming = CLIENT_BOOKINGS.filter((b) => b.status === "confirmed");
  const coordinatorName = awaitingAgency[0]?.coordinator?.name ?? pendingDecisions[0]?.coordinator?.name;

  // #11 — First-run wizard. Shows once per session if the client has
  // never sent an inquiry. Premium full-screen modal with 4 quick steps.
  const [wizardOpen, setWizardOpen] = useState(false);
  const isFirstRun = pendingDecisions.length === 0 && awaitingAgency.length === 0 && upcoming.length === 0;
  useEffect(() => {
    try {
      if (isFirstRun && !window.sessionStorage.getItem("tulala_client_wizard_dismissed")) {
        // Brief delay so the page renders before the modal opens
        const t = setTimeout(() => setWizardOpen(true), 400);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, [isFirstRun]);

  return (
    <>
      {/* Single status line — identity already lives in the top identity
          bar so the "Hi from <brand>" eyebrow was duplicate framing.
          Headline stays — it answers "what's waiting on me right now?". */}
      <div style={{ padding: "2px 0 8px", fontFamily: FONTS.body }}>
        <h1 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 19, fontWeight: 700, letterSpacing: -0.25, lineHeight: 1.2 }} className="text-admin-ink">
          {pendingDecisions.length > 0
            ? `${pendingDecisions.length} ${pendingDecisions.length === 1 ? "offer needs" : "offers need"} you.`
            : awaitingAgency.length > 0
            ? `${coordinatorName ?? "Your coordinator"} is on ${awaitingAgency.length} of your inquiries.`
            : upcoming.length > 0
            ? `${upcoming.length} upcoming ${upcoming.length === 1 ? "booking" : "bookings"} confirmed.`
            : "All clear today."}
        </h1>
      </div>

      {/* ── 1. NEEDS YOU NOW — inline action chips ── */}
      {pendingDecisions.length > 0 && (
        <ClientTodaySection
          label="Needs you now"
          count={pendingDecisions.length}
          tone={COLORS.coral}
        >
          {pendingDecisions.map((i) => (
            <ClientNeedsYouRow key={i.id} inquiry={i} />
          ))}
        </ClientTodaySection>
      )}

      {/* ── 2. MOVING — agency has it ── */}
      {awaitingAgency.length > 0 && (
        <ClientTodaySection
          label="Moving — agency has it"
          count={awaitingAgency.length}
          tone={COLORS.indigo}
        >
          {awaitingAgency.map((i) => (
            <ClientInquiryRow key={i.id} inquiry={i} />
          ))}
        </ClientTodaySection>
      )}

      {/* ── 3. COMING UP — confirmed bookings ── */}
      {upcoming.length > 0 && (
        <ClientTodaySection
          label="Coming up"
          count={upcoming.length}
          tone={COLORS.success}
          action={upcoming.length > 3
            ? { label: "See all", onClick: () => setClientPage("bookings") }
            : undefined}
        >
          {upcoming.slice(0, 3).map((b) => (
            <ClientBookingRow key={b.id} booking={b} />
          ))}
        </ClientTodaySection>
      )}

      {/* ── Empty state ── */}
      {pendingDecisions.length === 0 && awaitingAgency.length === 0 && upcoming.length === 0 && (
        <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">
          Nothing waiting on you. Browse talent to start a project.
        </div>
      )}

      {/* ── Sticky bottom action bar. Keep it to routes that are real today. */}
      <div style={{
        position: "sticky", bottom: 0, marginTop: 20,
        marginLeft: -14, marginRight: -14, padding: "10px 14px 14px",
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(10px)",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        display: "flex", gap: 10, justifyContent: "stretch", flexWrap: "nowrap",
      }}>
        <button type="button" onClick={() => setClientPage("messages")} style={{
          flex: 1, padding: "11px 14px", borderRadius: 999,
          background: "#fff", border: `1px solid ${COLORS.border}`,
          color: COLORS.ink, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
          cursor: "pointer",
        }}>
          Messages
        </button>
        <button type="button" onClick={() => setClientPage("discover")} style={{
          flex: 1, padding: "11px 14px", borderRadius: 999,
          background: COLORS.accent, border: "none",
          color: "#fff", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
          cursor: "pointer",
        }}>
          Browse talent
        </button>
      </div>

      {/* #11 — First-run wizard */}
      {wizardOpen && <ClientFirstRunWizard onClose={() => setWizardOpen(false)} />}
    </>
  );
}

// Premium section pattern (Linear/Notion-style):
//   - Sentence-case label, no UPPERCASE shouting
//   - Subtle count chip beside label, tabular nums
//   - Children wrapped in a single white card with hairline dividers
//     between rows — gives every row a clear tap surface without
//     wrapping each one in its own frame
function ClientTodaySection({
  label, count, tone, action, children,
}: {
  label: string; count: number; tone: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 4px 8px",
      }}>
        <span aria-hidden style={{
          width: 5, height: 5, borderRadius: "50%", background: tone, flexShrink: 0,
        }} />
        <h2 style={{ margin: 0, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, letterSpacing: -0.1 }} className="text-admin-ink">{label}</h2>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 6px", borderRadius: 999, background: "rgba(11,11,13,0.05)", fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">{count}</span>
        {action && (
          <button type="button" onClick={action.onClick} style={{
            marginLeft: "auto", border: "none", background: "transparent", padding: 0,
            color: COLORS.accent, fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
            cursor: "pointer",
          }}>{action.label}</button>
        )}
      </div>
      <div data-tulala-today-card style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${COLORS.borderSoft}`,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
      }}>
        <style>{`
          /* Drop the top border from the first child row so the card's own
             border doesn't double up with the row separator. */
          [data-tulala-today-card] > button:first-child,
          [data-tulala-today-card] > div:first-child > button:first-child {
            border-top: none !important;
          }
          [data-tulala-today-card] > div:first-child {
            border-top: none !important;
          }
        `}</style>
        {children}
      </div>
    </section>
  );
}

/**
 * Premium Needs-You row. Stacks the row content (tap-to-open) above
 * a short hint so unavailable accept/counter actions don't compete for
 * attention. The whole row is a card-row:
 *   - Tappable surface with hover + active states
 *   - Right-side chevron makes "this opens" obvious
 */
function ClientNeedsYouRow({ inquiry }: { inquiry: RichInquiry }) {
  const { setClientPage } = useAdminShell();
  const open = () => {
    const convId = INQUIRY_TO_CONV[inquiry.id];
    if (convId) pinNextConversation(convId);
    setClientPage("messages");
  };
  const total = inquiry.offer?.total;
  return (
    <div style={{
      borderBottom: `1px solid ${COLORS.borderSoft}`,
      fontFamily: FONTS.body,
    }}>
      <button type="button" onClick={open} style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: "14px 16px",
        background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
      }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(11,11,13,0.025)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }} className="text-admin-ink">
            {inquiry.clientName}
          </div>
          <div style={{ fontSize: 12, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }} className="text-admin-ink-muted">
            <span className="inline-flex items-center gap-1">
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.coral }} />
              Offer ready
            </span>
            {total && <span style={{ color: COLORS.ink, fontWeight: 600 }}>· {total}</span>}
          </div>
        </div>
        <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>›</span>
      </button>
      <div style={{ padding: "0 16px 12px", fontSize: 11.5 }} className="text-admin-ink-muted">
        Open the thread to review the offer details.
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// INQUIRIES — the heart of the client surface, grouped by stage,
// each row opens the shared inquiry-workspace with pov="client"
// ════════════════════════════════════════════════════════════════════

function ClientInquiriesPage() {
  const groups: { id: string; label: string; description: string; filter: (i: RichInquiry) => boolean }[] = [
    {
      id: "decide",
      label: "Needs your decision",
      description: "Offers your agency sent — approve or counter.",
      filter: (i) => i.stage === "offer_pending",
    },
    {
      id: "in-flight",
      label: "With your coordinator",
      description: "Agency is putting together your shortlist or working on logistics.",
      filter: (i) => i.stage === "submitted" || i.stage === "coordination",
    },
    {
      id: "approved",
      label: "Approved",
      description: "All parties said yes — booking is being created.",
      filter: (i) => i.stage === "approved",
    },
    {
      id: "booked",
      label: "Booked",
      description: "Converted to a booking. Inquiry is read-only.",
      filter: (i) => i.stage === "booked",
    },
    {
      id: "closed",
      label: "Closed",
      description: "Rejected or expired without converting.",
      filter: (i) => i.stage === "rejected" || i.stage === "expired",
    },
  ];

  return (
    <>
      <PageHeader
        title="Inquiries"
        subtitle="One thread per inquiry. Review offer details or chat your coordinator."
      />

      {groups.map((g) => {
        const items = RICH_INQUIRIES.filter(g.filter);
        if (items.length === 0) return null;
        return (
          <section key={g.id} style={{ marginBottom: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <div>
                <CapsLabel>{g.label}</CapsLabel>
                <p style={{ fontFamily: FONTS.body, fontSize: 12.5, margin: "3px 0 0" }} className="text-admin-ink-muted">
                  {g.description}
                </p>
              </div>
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-dim">
                {items.length} {items.length === 1 ? "inquiry" : "inquiries"}
              </span>
            </div>
            <div
              style={{
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {items.map((i) => (
                <ClientInquiryRow key={i.id} inquiry={i} bordered />
              ))}
            </div>
          </section>
        );
      })}

      {/* Legacy CLIENT_INQUIRIES (lighter-weight rows pre-RichInquiry adoption) */}
      {CLIENT_INQUIRIES.filter((c) => c.stage === "draft").length > 0 && (
        <section className="mt-8">
          <Divider label="Drafts" />
          <div
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 12,
              overflow: "hidden",
              marginTop: 10,
            }}
          >
            {CLIENT_INQUIRIES.filter((c) => c.stage === "draft").map((c) => (
              <LegacyClientInquiryRow key={c.id} inquiry={c} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ClientInquiryRow({ inquiry }: { inquiry: RichInquiry; bordered?: boolean }) {
  const { setClientPage } = useAdminShell();
  const meta = INQUIRY_STAGE_META[inquiry.stage];
  // Compact subtitle that doesn't wrap to 3 lines on mobile
  const subtitleParts = [
    `via ${inquiry.agencyName}`,
    inquiry.date && inquiry.date,
  ].filter(Boolean);
  const open = () => {
    const convId = INQUIRY_TO_CONV[inquiry.id];
    if (convId) pinNextConversation(convId);
    setClientPage("messages");
  };
  return (
    <button
      onClick={open}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: "14px 16px",
        background: "transparent", border: "none",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer", textAlign: "left",
        fontFamily: FONTS.body, transition: `background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(11,11,13,0.025)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
            {inquiry.brief}
          </span>
          {inquiry.unreadPrivate > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              minWidth: 18, height: 18, borderRadius: 999,
              background: COLORS.coral, color: "#fff",
              fontSize: 10, fontWeight: 700, padding: "0 6px", flexShrink: 0,
            }}>
              {inquiry.unreadPrivate}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} className="text-admin-ink-muted">
          <span className="inline-flex items-center gap-1">
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: meta.tone === "green" ? COLORS.success
                        : meta.tone === "amber" ? COLORS.amber
                        : meta.tone === "red" ? COLORS.coral
                        : COLORS.indigo,
            }} />
            {meta.label}
          </span>
          <span className="text-admin-ink-dim">· {subtitleParts.join(" · ")}</span>
        </div>
      </div>
      {inquiry.offer && (
        <span style={{
          fontSize: 13, fontWeight: 600, color: COLORS.ink, flexShrink: 0,
        }}>
          {inquiry.offer.total}
        </span>
      )}
      <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>›</span>
    </button>
  );
}

function LegacyClientInquiryRow({ inquiry }: { inquiry: typeof CLIENT_INQUIRIES[number] }) {
  const { openDrawer } = useAdminShell();
  return (
    <button
      onClick={() => openDrawer("client-inquiry-detail", { id: inquiry.id })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: FONTS.body,
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 500, flex: 1 }} className="text-admin-ink">{inquiry.brief}</span>
      <span className="text-admin-ink-muted text-admin-11h">{inquiry.shortlistName} · {inquiry.agency}</span>
      <span style={{ padding: "2px 7px", borderRadius: 999, fontSize: 10, background: "rgba(11,11,13,0.04)", fontWeight: 600 }} className="text-admin-ink-muted">
        Draft
      </span>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// DISCOVER (talent browser, plan-gated)
// ════════════════════════════════════════════════════════════════════

type TalentCategory = "all" | "models" | "hosts" | "chefs" | "artists" | "djs" | "photographers" | "performers";

function ClientDiscoverPage() {
  const { state, openUpgrade, getTrustSummary } = useAdminShell();
  // Discover is a PREMIUM feature — Basic clients see a paywall.
  // Premium tier (= "pro" or higher) gets first access to the full
  // Tulala roster, the AI search engine, and channel selection.
  const isPremium = meetsClientPlan(state.clientPlan, "pro");
  const [category, setCategory] = useState<TalentCategory>("all");
  const [subcategory, setSubcategory] = useState<string | null>(null); // child taxonomy id
  const taxonomyParent = TAXONOMY.find(p => p.id === category);
  const [searchQuery, setSearchQuery] = useState("");
  const [trustFilter, setTrustFilter] = useState<"all" | "verified" | "tulala_verified" | "instagram_verified" | "claimed">("all");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [channelTalent, setChannelTalent] = useState<DiscoverTalent | null>(null);
  // Card tap → opens the full profile detail sheet. From there the
  // client can browse photos / channels / availability before committing
  // to drafting an inquiry — which hands off to the channel picker.
  const [detailTalent, setDetailTalent] = useState<DiscoverTalent | null>(null);

  // Recent searches + recently viewed profiles — would persist in
  // production. For now, hard-coded to seed the AI panel.
  const recentSearches = [
    "Spanish-speaking hosts in Tulum",
    "Female chefs · Mexican cuisine",
    "DJs available May 24",
    "Live painters near Paris",
  ];
  const recentlyViewed = DISCOVER_TALENT.slice(0, 4);

  // Saved searches
  const [activeSaved, setActiveSaved] = useState<string | null>(null);
  const savedSearches = [
    { id: "weekend-hosts", label: "Saturday hosts · Tulum", category: "hosts" as const },
    { id: "private-chefs", label: "Mexican chefs", category: "chefs" as const },
  ];

  if (!isPremium) {
    return <ClientDiscoverPaywall onUpgrade={() => openUpgrade({ feature: "Discover", requiredPlan: "studio", why: "First access to every talent on Tulala plus AI search." })} />;
  }

  // Filtered roster — by category and search. AI search is mocked
  // (substring + category match); production wires to embeddings.
  const filtered = DISCOVER_TALENT.filter(t => {
    if (category !== "all" && t.category !== category) return false;
    if (subcategory && t.subType !== subcategory) return false;
    if (trustFilter !== "all") {
      const rosterId = mapDiscoverToRosterId(t.id) ?? t.id;
      const trust = getTrustSummary("talent_profile", rosterId);
      const has = (type: string) => trust.badges.some(b => b.type === type && b.status === "active" && b.public);
      if (trustFilter === "verified" && trust.badges.filter(b => b.status === "active" && b.public).length === 0) return false;
      if (trustFilter === "tulala_verified" && !has("tulala_verified")) return false;
      if (trustFilter === "instagram_verified" && !has("instagram_verified")) return false;
      if (trustFilter === "claimed" && trust.claimStatus !== "claimed") return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.city.toLowerCase().includes(q) || t.category.includes(q);
    }
    return true;
  });

  const tabs: { id: TalentCategory; label: string; emoji: string }[] = [
    { id: "all",          label: "All",          emoji: "✦" },
    { id: "models",       label: "Models",       emoji: "👤" },
    { id: "hosts",        label: "Hosts",        emoji: "🎤" },
    { id: "chefs",        label: "Chefs",        emoji: "👨‍🍳" },
    { id: "artists",      label: "Artists",      emoji: "🎨" },
    { id: "djs",          label: "DJs",          emoji: "🎧" },
    { id: "photographers",label: "Photographers",emoji: "📷" },
    { id: "performers",   label: "Performers",   emoji: "✨" },
  ];

  return (
    <>
      <PageHeader title="Discover" subtitle="Premium · first access to every talent on Tulala." />

      {/* Premium AI search bar — hero component on Discover */}
      <ClientAiSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        onFocus={() => setAiPanelOpen(true)}
        onBlur={() => setTimeout(() => setAiPanelOpen(false), 200)}
        recentSearches={recentSearches}
        recentlyViewed={recentlyViewed}
        panelOpen={aiPanelOpen}
        onPickSearch={(q) => { setSearchQuery(q); setAiPanelOpen(false); }}
        onPickProfile={(t) => { setDetailTalent(t); setAiPanelOpen(false); }}
      />

      {/* #24 — Category tabs */}
      <div style={{
        display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6,
        marginTop: 14, marginBottom: 12, scrollbarWidth: "none",
      }}>
        {tabs.map(t => {
          const active = category === t.id;
          return (
            <button key={t.id} type="button" onClick={() => { setCategory(t.id); setSubcategory(null); }} style={{
              flexShrink: 0,
              padding: "8px 14px", borderRadius: 999,
              border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
              background: active ? "rgba(15,79,62,0.08)" : "#fff",
              color: active ? COLORS.accentDeep : COLORS.ink,
              fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <span aria-hidden className="text-admin-13">{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Phase 1 — Child taxonomy drill-down. Shows specific types under
          the parent (Models → Fashion / Promo / Content / Commercial / etc).
          Sourced from TAXONOMY in _state.tsx so agency-specific menus
          flow from the same vocabulary. */}
      {taxonomyParent && taxonomyParent.children.length > 0 && (
        <div style={{
          display: "flex", gap: 5, overflowX: "auto", paddingBottom: 6,
          marginBottom: 12, scrollbarWidth: "none",
        }}>
          {taxonomyParent.children.map(c => {
            const active = subcategory === c.id;
            return (
              <button key={c.id} type="button" onClick={() => setSubcategory(active ? null : c.id)} style={{
                flexShrink: 0,
                padding: "5px 11px", borderRadius: 999,
                border: `1px solid ${active ? COLORS.indigo : COLORS.borderSoft}`,
                background: active ? COLORS.indigoSoft : "transparent",
                color: active ? COLORS.indigoDeep : COLORS.inkMuted,
                fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500,
                cursor: "pointer",
              }}>{c.label}</button>
            );
          })}
        </div>
      )}

      {/* Trust filter chips */}
      <div style={{
        display: "flex", gap: 6, alignItems: "center", marginBottom: 10,
        fontFamily: FONTS.body, flexWrap: "wrap",
      }}>
        <span className="text-admin-ink-muted text-admin-11 font-medium">Trust:</span>
        {([
          { id: "all" as const,                label: "All" },
          { id: "verified" as const,           label: "Any verified" },
          { id: "tulala_verified" as const,    label: "✓ Tulala" },
          { id: "instagram_verified" as const, label: "📸 Instagram" },
          { id: "claimed" as const,            label: "Talent-claimed" },
        ]).map(c => {
          const active = trustFilter === c.id;
          return (
            <button key={c.id} type="button" onClick={() => setTrustFilter(c.id)} style={{
              padding: "4px 10px", borderRadius: 999,
              border: `1px solid ${active ? COLORS.successDeep : COLORS.borderSoft}`,
              background: active ? "rgba(15,79,62,0.08)" : "transparent",
              color: active ? COLORS.successDeep : COLORS.inkMuted,
              fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
            }}>{c.label}</button>
          );
        })}
      </div>

      {/* Saved searches */}
      <div style={{
        display: "flex", gap: 6, alignItems: "center", marginBottom: 14,
        fontFamily: FONTS.body, flexWrap: "wrap",
      }}>
        <span className="text-admin-ink-muted text-admin-11 font-medium">Saved:</span>
        {savedSearches.map(s => {
          const active = activeSaved === s.id;
          return (
            <button key={s.id} type="button" onClick={() => {
              setActiveSaved(active ? null : s.id);
              if (!active) setCategory(s.category);
            }} style={{
              padding: "5px 11px", borderRadius: 999,
              border: `1px solid ${active ? COLORS.indigo : COLORS.borderSoft}`,
              background: active ? COLORS.indigoSoft : "transparent",
              color: active ? COLORS.indigoDeep : COLORS.inkMuted,
              fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
            }}>{s.label}</button>
          );
        })}
      </div>

      <Grid cols="3">
        {filtered.map((t) => (
          <DiscoverCard key={t.id} talent={t} onPick={() => setDetailTalent(t)} />
        ))}
      </Grid>

      {/* Profile detail sheet — full talent view. From here the client
          can browse photos / agency / channels / availability before
          deciding to send an inquiry. */}
      {detailTalent && (
        <ClientTalentDetailSheet
          talent={detailTalent}
          onClose={() => setDetailTalent(null)}
          onInquire={() => {
            const t = detailTalent;
            setDetailTalent(null);
            setChannelTalent(t);
          }}
        />
      )}

      {/* Channel selection modal — when client starts a draft */}
      {channelTalent && (
        <ClientChannelPicker talent={channelTalent} onClose={() => setChannelTalent(null)} />
      )}
    </>
  );
}

// ── Premium AI search bar with recents panel ──────────────────────
function ClientAiSearchBar({
  value, onChange, onFocus, onBlur, panelOpen, recentSearches, recentlyViewed, onPickSearch, onPickProfile,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  panelOpen: boolean;
  recentSearches: string[];
  recentlyViewed: DiscoverTalent[];
  onPickSearch: (q: string) => void;
  onPickProfile: (t: DiscoverTalent) => void;
}) {
  return (
    <div style={{ position: "relative", fontFamily: FONTS.body }}>
      {/* Pill input with sparkle icon — premium AI signature */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px",
        background: "#fff",
        border: `1.5px solid ${panelOpen ? COLORS.accent : COLORS.borderSoft}`,
        borderRadius: 14,
        boxShadow: panelOpen ? "0 6px 24px -6px rgba(15,79,62,0.18)" : "0 1px 2px rgba(11,11,13,0.03)",
        transition: "border-color .15s, box-shadow .15s",
      }}>
        <span aria-hidden style={{ display: "inline-flex", color: COLORS.accent }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2l1.5 4.5L15 8l-4.5 1.5L9 14l-1.5-4.5L3 8l4.5-1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          </svg>
        </span>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="Try: 'Spanish-speaking host in Tulum, Saturday'"
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            fontFamily: FONTS.body, fontSize: 14, color: COLORS.ink,
          }}
        />
        <span style={{ padding: "3px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="bg-admin-accent-soft text-admin-accent-deep">AI</span>
      </div>

      {/* Recents panel — opens on focus */}
      {panelOpen && (
        <div onMouseDown={(e) => e.preventDefault()} style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 14, padding: 14,
          boxShadow: "0 16px 40px -8px rgba(11,11,13,0.18)",
          zIndex: 50,
        }}>
          {recentSearches.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }} className="text-admin-ink-muted">Recent searches</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
                {recentSearches.map(s => (
                  <button key={s} type="button" onClick={() => onPickSearch(s)} style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    padding: "8px 10px", borderRadius: 8, textAlign: "left",
                    fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(11,11,13,0.04)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span aria-hidden style={{ color: COLORS.inkDim }}>↗</span>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
          {recentlyViewed.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }} className="text-admin-ink-muted">Recently viewed</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>
                {recentlyViewed.map(t => (
                  <button key={t.id} type="button" onClick={() => onPickProfile(t)} style={{
                    background: "transparent", border: `1px solid ${COLORS.borderSoft}`,
                    cursor: "pointer", padding: 8, borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
                    fontFamily: FONTS.body,
                  }}>
                    <span style={{ width: 36, height: 36, borderRadius: "50%", background: `url(${t.thumb}) center/cover, ${COLORS.surfaceAlt}`, flexShrink: 0, }} />
                    <div className="text-left">
                      <div className="text-admin-ink text-admin-12h font-semibold">{t.name}</div>
                      <div className="text-admin-ink-muted text-admin-10h">{t.category} · {t.city}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Discover paywall (Basic plan) ────────────────────────────────
function ClientDiscoverPaywall({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <>
      <PageHeader title="Discover" />
      <div style={{
        background: "#fff", borderRadius: 16,
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        padding: "32px 24px", textAlign: "center", fontFamily: FONTS.body,
      }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }} className="bg-admin-royal-soft text-admin-royal-deep">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 2l2.5 6L20 9l-5 4.5L16.5 20 11 16.5 5.5 20 7 13.5 2 9l6.5-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.3 }} className="text-admin-ink">Discover is a Premium feature.</h2>
        <p style={{ fontSize: 13.5, margin: "8px auto 18px", lineHeight: 1.5, maxWidth: 400 }} className="text-admin-ink-muted">
          Premium gives you first access to every talent on Tulala — agency-rostered, hub-listed, and freelance — with AI search and channel selection.
        </p>
        <button type="button" onClick={onUpgrade} style={{
          padding: "11px 22px", borderRadius: 999,
          background: COLORS.accent, color: "#fff", border: "none",
          fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>Upgrade to Premium</button>
      </div>
    </>
  );
}

// ── Channel picker — when client clicks a talent ─────────────────
// ════════════════════════════════════════════════════════════════════
// Talent profile detail sheet — opens when a client taps a Discover card.
// Shows the full talent (photos, basics, channels summary, availability)
// before they start a draft (which routes to ClientChannelPicker).
// ════════════════════════════════════════════════════════════════════

// Map a Discover talent id (dt1, dt2…) to its Roster talent id (t1, t2…).
// In production this is one entity; in the current fixture the two seed lists
// happen to share names, so we map by name.
function mapDiscoverToRosterId(discoverId: string): string | null {
  const map: Record<string, string> = {
    dt1: "t1", dt2: "t2", dt3: "t3", dt4: "t4", dt5: "t5", dt6: "t6", dt7: "t7", dt8: "t8",
  };
  return map[discoverId] ?? null;
}

function ClientDiscoverTrustRow({ talentId }: { talentId: string }) {
  const { getTrustSummary } = useAdminShell();
  const rosterId = mapDiscoverToRosterId(talentId) ?? talentId;
  const trust = getTrustSummary("talent_profile", rosterId);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
      <TrustBadgeGroup trust={trust} surface="public_profile" size="sm" max={4} />
    </div>
  );
}

function ClientDiscoverPhotoBadge({ talentId, size = "md" }: { talentId: string; size?: "xs" | "sm" | "md" | "lg" }) {
  const { getTrustSummary } = useAdminShell();
  const rosterId = mapDiscoverToRosterId(talentId) ?? talentId;
  const trust = getTrustSummary("talent_profile", rosterId);
  return <ProfilePhotoBadgeOverlay trust={trust} size={size} max={2} position="bottom-right" />;
}

function ClientTalentDetailSheet({
  talent, onClose, onInquire,
}: {
  talent: DiscoverTalent;
  onClose: () => void;
  onInquire: () => void;
}) {
  const { getTalentContactGate, canClientContactTalent } = useAdminShell();
  const rosterId = mapDiscoverToRosterId(talent.id) ?? talent.id;
  // Demo: assume the current client is c1 (Vogue Italia, business_verified).
  // In production this resolves via auth context.
  const currentClientId = "c1";
  const gate = getTalentContactGate(rosterId);
  const canContact = canClientContactTalent(rosterId, currentClientId);
  const repCount = talent.channels.length;
  const exclusiveAgency = talent.channels.length === 1 && talent.channels[0]?.kind === "agency";
  const repLabel = exclusiveAgency
    ? `Exclusive · ${talent.channels[0]!.name}`
    : `${repCount} channel${repCount === 1 ? "" : "s"}`;
  // Mock supplementary photos — real implementation pulls from the
  // talent's portfolio. For now we vary the pravatar img param
  // to fake a small gallery.
  const baseImg = talent.thumb;
  const photos = [
    baseImg,
    baseImg.includes("?img=") ? baseImg.replace(/img=(\d+)/, (_, n) => `img=${(parseInt(n, 10) % 70) + 1}`) : baseImg,
    baseImg.includes("?img=") ? baseImg.replace(/img=(\d+)/, (_, n) => `img=${(parseInt(n, 10) % 70) + 12}`) : baseImg,
  ];

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(11,11,13,0.42)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, maxHeight: "92vh",
        background: "#fff",
        borderRadius: "20px 20px 0 0",
        boxShadow: "0 -10px 40px -8px rgba(11,11,13,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Hero photo with floating close */}
        <div style={{
          position: "relative",
          aspectRatio: "4 / 3.5",
          background: `url(${photos[0]}) center/cover, ${COLORS.surfaceAlt}`,
          flexShrink: 0,
        }}>
          {/* Modern verified-icon overlay on the hero photo */}
          <ClientDiscoverPhotoBadge talentId={talent.id} size="lg" />
          {/* Close */}
          <button type="button" onClick={onClose} aria-label="Close" style={{
            position: "absolute", top: 12, right: 12,
            width: 34, height: 34, borderRadius: "50%",
            background: "rgba(255,255,255,0.92)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: COLORS.ink, fontSize: 16, lineHeight: 1, fontWeight: 600,
            backdropFilter: "blur(8px)",
            boxShadow: "0 2px 8px rgba(11,11,13,0.12)",
          }}>✕</button>
          {/* Availability dot */}
          <div style={{ position: "absolute", bottom: 12, left: 14, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", fontSize: 11, fontWeight: 600 }} className="text-admin-ink">
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: talent.available ? COLORS.success : COLORS.inkDim,
            }} />
            {talent.available ? "Open for bookings" : "On hold this month"}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 22px 14px",
        }}>
          {/* Name + meta */}
          <div className="mb-2.5">
            <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.1 }} className="text-admin-ink">{talent.name}</h2>
            {/* Type chip — prominent, accent-colored. Surfaces specific
                Talent Type (e.g. "Fashion model") when known, plus emoji. */}
            {(() => {
              const typeMeta = talent.subType
                ? (() => {
                    for (const parent of TAXONOMY) {
                      const c = parent.children.find((x) => x.id === talent.subType);
                      if (c) return { label: c.label, emoji: parent.emoji };
                    }
                    return null;
                  })()
                : null;
              return (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: "3px 10px", borderRadius: 999, background: "rgba(15,79,62,0.08)", fontSize: 11.5, fontWeight: 600 }} className="text-admin-accent-deep">
                  <span aria-hidden className="text-admin-13">{typeMeta?.emoji ?? "✦"}</span>
                  {typeMeta?.label ?? talent.category}
                </div>
              );
            })()}
            <div style={{ fontSize: 12, marginTop: 6 }} className="text-admin-ink-muted">
              {talent.city} · {talent.height}
            </div>
            {/* Trust badges — Instagram Verified · Tulala Verified · Agency Confirmed */}
            <ClientDiscoverTrustRow talentId={talent.id} />
          </div>

          {/* Photo strip */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, marginRight: -22, paddingRight: 22, overflowX: "auto", scrollbarWidth: "none" }}>
            {photos.map((p, i) => (
              <div key={i} style={{
                flexShrink: 0,
                width: 96, aspectRatio: "3 / 4", borderRadius: 8,
                background: `url(${p}) center/cover, ${COLORS.surfaceAlt}`,
              }} />
            ))}
            <div style={{ flexShrink: 0, width: 96, aspectRatio: "3 / 4", borderRadius: 8, border: `1px dashed ${COLORS.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }} className="text-admin-ink-muted">+12 more</div>
          </div>

          {/* Quick facts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 16 }}>
            <ProfileKv label="Based in" value={talent.city} />
            <ProfileKv label="Height" value={talent.height} />
            <ProfileKv label="Representation" value={repLabel} />
            <ProfileKv label="Availability" value={talent.available ? "Open for bookings" : "On hold this month"} />
          </div>

          {/* Channels summary — preview of routing options */}
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, marginBottom: 8 }} className="text-admin-ink-muted">How to book</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
            {talent.channels.map((c, i) => {
              const meta = c.kind === "agency"
                ? { icon: "🏢", desc: "Agency-handled · contracts, payment, coordination." }
                : c.kind === "hub"
                ? { icon: "🌐", desc: "Tulala hub · routes inquiry to talent." }
                : { icon: "✨", desc: "Direct · talent coordinates everything." };
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 10,
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.borderSoft}`,
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-admin-ink text-admin-12h font-semibold">{c.name}</span>
                      {c.commission && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "rgba(11,11,13,0.05)" }} className="text-admin-ink-muted">{c.commission}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">{meta.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, marginTop: 6 }} className="text-admin-ink-dim">
            Pick a channel after you start a draft.
          </div>
        </div>

        {/* Sticky footer */}
        <div style={{
          padding: "12px 22px max(14px, env(safe-area-inset-bottom)) 22px",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          background: "#fff",
          display: "flex", gap: 8, alignItems: "center",
          flexShrink: 0,
        }}>
          <button type="button" onClick={canContact ? onInquire : undefined} disabled={!canContact}
            style={{
              flex: 1, padding: "12px 18px", borderRadius: 999,
              border: "none",
              background: canContact ? COLORS.fill : "rgba(11,11,13,0.18)",
              color: "#fff",
              fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 600,
              cursor: canContact ? "pointer" : "not-allowed",
            }}
            title={canContact ? undefined : `Talent restricted contact to ${gate === "verified_only" ? "verified" : "trusted"} clients`}
          >
            {canContact ? "Draft inquiry" : "🔒 Verify to contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileKv({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", padding: "8px 0",
      borderBottom: `1px solid ${COLORS.borderSoft}`,
    }}>
      <span style={{ width: 110, fontSize: 11.5, fontWeight: 600 }} className="text-admin-ink-muted">{label}</span>
      <span style={{ flex: 1, fontSize: 13 }} className="text-admin-ink">{value}</span>
    </div>
  );
}

function ClientChannelPicker({ talent, onClose }: { talent: DiscoverTalent; onClose: () => void }) {
  const { openDrawer } = useAdminShell();
  const send = (channel: typeof talent.channels[number]) => {
    onClose();
    openDrawer("client-send-inquiry", { channel: channel.name });
  };
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(11,11,13,0.42)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      fontFamily: FONTS.body,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, background: "#fff",
        borderRadius: "20px 20px 0 0",
        padding: "20px 22px max(22px, env(safe-area-inset-bottom)) 22px",
        boxShadow: "0 -10px 40px -8px rgba(11,11,13,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ width: 48, height: 48, borderRadius: "50%", background: `url(${talent.thumb}) center/cover, ${COLORS.surfaceAlt}`, flexShrink: 0, }} />
          <div className="flex-1 min-w-0">
            <div style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }} className="text-admin-ink">
              {talent.name}
            </div>
            <div style={{ fontSize: 12, marginTop: 2, textTransform: "capitalize" }} className="text-admin-ink-muted">
              {talent.category} · {talent.city}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
            background: "transparent", border: "none", cursor: "pointer",
            padding: 8, color: COLORS.inkMuted, fontSize: 18, lineHeight: 1,
          }}>✕</button>
        </div>

        <h3 style={{ margin: "0 0 4px", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">How would you like to reach {talent.name.split(" ")[0]}?</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {talent.name.split(" ")[0]} works through {talent.channels.length} channel{talent.channels.length === 1 ? "" : "s"}. Each routes the inquiry differently.
        </p>

        <div className="flex flex-col gap-2">
          {talent.channels.map((c, i) => {
            const meta = c.kind === "agency"
              ? { label: "Agency", icon: "🏢", desc: "Agency handles contracts, payment, coordination." }
              : c.kind === "hub"
              ? { label: "Hub", icon: "🌐", desc: "Tulala hub forwards to talent. Hub takes referral fee." }
              : { label: "Direct", icon: "✨", desc: "Talk directly to the talent — they coordinate everything themselves." };
            return (
              <button key={i} type="button" onClick={() => send(c)} style={{
                padding: "14px 16px", borderRadius: 12,
                border: `1.5px solid ${COLORS.borderSoft}`, background: "#fff",
                fontFamily: FONTS.body, textAlign: "left", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 12,
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.accent; e.currentTarget.style.background = "rgba(15,79,62,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.background = "#fff"; }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-admin-ink text-sm font-semibold">{c.name}</span>
                    {c.commission && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "rgba(11,11,13,0.05)" }} className="text-admin-ink-muted">{c.commission}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.4 }} className="text-admin-ink-muted">
                    {meta.desc}
                  </div>
                </div>
                <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 18, flexShrink: 0 }}>›</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DiscoverCard({ talent, onPick }: { talent: DiscoverTalent; onPick?: () => void }) {
  const { openDrawer } = useAdminShell();
  const repCount = talent.channels.length;
  const hasFreelance = talent.channels.some(c => c.kind === "freelance");
  const exclusiveAgency = talent.channels.length === 1 && talent.channels[0]?.kind === "agency";
  const repLabel = exclusiveAgency
    ? `Exclusive · ${talent.channels[0]!.name}`
    : hasFreelance && repCount === 1
    ? "Freelance"
    : `${repCount} channels`;
  const repTone = exclusiveAgency
    ? { bg: COLORS.amberSoft, fg: COLORS.amberDeep }
    : hasFreelance
    ? { bg: COLORS.accentSoft, fg: COLORS.accentDeep }
    : { bg: COLORS.indigoSoft, fg: COLORS.indigoDeep };
  return (
    <button
      onClick={() => { if (onPick) onPick(); else openDrawer("client-talent-card", { id: talent.id }); }}
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(11,11,13,0.04)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "4 / 5",
          background: talent.thumb.startsWith("http")
            ? `url(${talent.thumb}) center/cover`
            : COLORS.surfaceAlt,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 64,
        }}
      >
        {!talent.thumb.startsWith("http") && talent.thumb}
        <ClientDiscoverPhotoBadge talentId={talent.id} size="md" />
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
            {talent.name}
          </span>
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: "50%",
            background: talent.available ? COLORS.success : COLORS.inkDim,
          }} />
        </div>
        <div style={{ fontSize: 11.5, marginTop: 3, textTransform: "capitalize" }} className="text-admin-ink-muted">
          {talent.category} · {talent.city}
        </div>
        {/* Representation channel chip — exclusive vs multi-channel vs freelance */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
            background: repTone.bg, color: repTone.fg, lineHeight: 1.4,
          }}>{repLabel}</span>
        </div>
      </div>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// SHORTLISTS
// ════════════════════════════════════════════════════════════════════

function ClientShortlistsPage() {
  return (
    <>
      <PageHeader
        title="Shortlists"
        subtitle="Group talent by brief. Share with collaborators. Convert any shortlist into an inquiry."
      />
      <Grid cols="2">
        {MY_SHORTLISTS.map((s) => (
          <ShortlistCard key={s.id} shortlist={s} />
        ))}
      </Grid>
    </>
  );
}

function ShortlistCard({ shortlist }: { shortlist: Shortlist }) {
  const { openDrawer } = useAdminShell();
  const stageMeta: Record<Shortlist["status"], { label: string; tone: "ink" | "amber" | "green" | "dim" }> = {
    draft: { label: "Draft", tone: "dim" },
    shared: { label: "Shared", tone: "ink" },
    "inquiry-sent": { label: "Inquiry sent", tone: "amber" },
    booked: { label: "Booked", tone: "green" },
  };
  const m = stageMeta[shortlist.status];
  return (
    <button
      onClick={() => openDrawer("client-shortlist-detail", { id: shortlist.id })}
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, letterSpacing: -0.2 }} className="text-admin-ink">
          {shortlist.name}
        </span>
        <StatDot tone={m.tone === "ink" ? "ink" : m.tone} size={8} />
      </div>
      <p style={{ margin: 0, fontSize: 12.5 }} className="text-admin-ink-muted">{shortlist.brief}</p>
      <div className="flex gap-1">
        {shortlist.thumbs.slice(0, 6).map((t, i) => (
          <span
            key={i}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: t.startsWith("http")
                ? `url(${t}) center/cover`
                : COLORS.surfaceAlt,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              border: `1px solid ${COLORS.borderSoft}`,
            }}
          >
            {!t.startsWith("http") && t}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5 }} className="text-admin-ink-dim">
        <span>{shortlist.count} talent</span>
        <Bullet />
        <span>updated {shortlist.updatedAgo} ago</span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            padding: "2px 7px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
                        background:
              m.tone === "green"
                ? COLORS.successSoft
                : m.tone === "amber"
                  ? "rgba(82,96,109,0.12)"
                  : "rgba(11,11,13,0.04)",
            color: m.tone === "green" ? COLORS.successDeep : m.tone === "amber" ? COLORS.amberDeep : COLORS.inkMuted,
          }}
        >
          {m.label}
        </span>
      </div>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// BOOKINGS
// ════════════════════════════════════════════════════════════════════

function ClientBookingsPage() {
  const { openDrawer } = useAdminShell();
  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Locked-in dates, talent, and contracts."
      />

      {/* Premium spend strip — replaces the 2-up StatusCard tiles */}
      <div data-tulala-client-stat-strip style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        display: "grid", gridTemplateColumns: "1fr 1fr",
        overflow: "hidden", marginBottom: 14, fontFamily: FONTS.body,
      }}>
        <button type="button" onClick={() => openDrawer("client-spend-report")} style={{
          background: "transparent", border: "none", cursor: "pointer", padding: "12px 14px",
          textAlign: "left", borderRight: `1px solid ${COLORS.borderSoft}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.indigo }} />
            <span className="text-admin-ink-muted text-admin-11 font-medium">Total spend YTD</span>
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">€23,000</div>
        </button>
        <button type="button" onClick={() => openDrawer("client-budget")} style={{
          background: "transparent", border: "none", cursor: "pointer", padding: "12px 14px",
          textAlign: "left",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.amber }} />
            <span className="text-admin-ink-muted text-admin-11 font-medium">Q2 Budget</span>
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">46%</div>
          <div style={{ fontSize: 10.5, marginTop: 4 }} className="text-admin-amber">Approaching 80% alert</div>
        </button>
      </div>

      <div data-tulala-today-card style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        overflow: "hidden",
      }}>
        {CLIENT_BOOKINGS.map((b) => (
          <ClientBookingRow key={b.id} booking={b} />
        ))}
      </div>
    </>
  );
}

// Inquiry/booking RI-* → conversation id (cN). Used by every Today row
// to route into the unified message shell instead of the legacy drawer.
// Wrapped (closed) bookings still open — the shell renders past stages
// read-only.
const INQUIRY_TO_CONV: Record<string, string> = {
  "RI-201": "c1",  // Mango spring lookbook
  "RI-202": "c2",  // Bvlgari
  "RI-203": "c3",  // Vogue Italia
  "RI-204": "c1",  // Estudio Roca brand gala (fall through to first conv)
  "RI-205": "c2",  // Valentino SS26
};
const BOOKING_TO_CONV = INQUIRY_TO_CONV;

function ClientBookingRow({ booking }: { booking: ClientBooking }) {
  const { setClientPage, openDrawer } = useAdminShell();
  const open = () => {
    // Route through the unified message shell instead of the legacy drawer.
    // Booked = "coming up" (still editable / cancellable); wrapped/invoiced
    // = "closed" (read-only, but the shell handles that via stage state).
    const convId = booking.inquiryId ? BOOKING_TO_CONV[booking.inquiryId] : null;
    if (convId) pinNextConversation(convId);
    setClientPage("messages");
  };
  // #25 — Repeat booking. Hospitality clients re-book the same lineup
  // every weekend; one-tap repeat seeds a new inquiry with same talent +
  // location + brief, prompting only for date.
  const isClosed = booking.status === "wrapped" || booking.status === "invoiced";
  const repeat = (e: React.MouseEvent) => {
    e.stopPropagation();
    openDrawer("client-send-inquiry");
  };
  return (
    <button
      onClick={open}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "14px 16px",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(11,11,13,0.025)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
            {booking.talent}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }} className="text-admin-ink-muted">
            {booking.amount}
          </span>
        </div>
        <div style={{ fontSize: 12, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} className="text-admin-ink-muted">
          <span className="inline-flex items-center gap-1">
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.success }} />
            {booking.date}
          </span>
          <span className="text-admin-ink-dim">· {booking.location}</span>
        </div>
      </div>
      {/* #18 — Review prompt on wrapped bookings */}
      {isClosed && (
        <button type="button" onClick={(e) => {
          e.stopPropagation();
          openDrawer("client-review", { bookingId: booking.id, talent: booking.talent });
        }} style={{
          padding: "6px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
          border: `1px solid ${COLORS.amber}30`, background: COLORS.amberSoft,
          color: COLORS.amberDeep, cursor: "pointer", flexShrink: 0,
        }}>★ Review</button>
      )}
      {isClosed && (
        <button type="button" onClick={repeat} style={{
          padding: "6px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
          border: `1px solid ${COLORS.border}`, background: "transparent",
          color: COLORS.ink, cursor: "pointer", flexShrink: 0,
        }}>Draft repeat</button>
      )}
      <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>›</span>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════

function ClientSettingsPage() {
  const { openDrawer, state } = useAdminShell();
  const planMeta = CLIENT_PLAN_META[state.clientPlan];
  const profile = state.clientProfile === "gringo"
    ? { name: "The Gringo", industry: "Personal client", isBusiness: false, photoUrl: "https://i.pravatar.cc/300?img=33" }
    : { name: "Martina Beach Club", industry: "Hospitality · beach club", isBusiness: true, photoUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80" };

  return (
    <>
      <PageHeader title="Settings" />

      {/* Identity — hero card, premium, with photo + edit affordance */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        padding: 16, marginBottom: 14, display: "flex", alignItems: "center", gap: 14, fontFamily: FONTS.body,
      }}>
        <span style={{ width: 56, height: 56, borderRadius: profile.isBusiness ? 12 : "50%", background: `url(${profile.photoUrl}) center/cover, ${COLORS.surfaceAlt}`, flexShrink: 0, border: `1px solid ${COLORS.borderSoft}`, }} />
        <div className="flex-1 min-w-0">
          <div style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, letterSpacing: -0.2 }} className="text-admin-ink">
            {profile.name}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 2 }} className="text-admin-ink-muted">
            {profile.industry} · {profile.isBusiness ? "Business" : "Personal"} client
          </div>
        </div>
        <button type="button" onClick={() => openDrawer("client-brand-switcher")} style={{
          padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
          border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, cursor: "pointer",
          flexShrink: 0,
        }}>Edit</button>
      </div>

      {/* Plan card */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        padding: 16, marginBottom: 18, display: "flex", alignItems: "center", gap: 14, fontFamily: FONTS.body,
      }}>
        <div className="flex-1">
          <div className="text-admin-ink-muted text-admin-11 font-medium">Current plan</div>
          <div style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, marginTop: 2 }} className="text-admin-ink">
            {planMeta.label} <span className="text-admin-ink-muted text-xs font-medium">· {planMeta.price}</span>
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }} className="text-admin-ink-muted">{planMeta.theme}</div>
        </div>
        <button type="button" onClick={() => openDrawer("client-billing")} style={{
          padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
          border: "none", background: COLORS.accent, color: "#fff", cursor: "pointer", flexShrink: 0,
        }}>Manage</button>
      </div>

      {/* Working settings — premium row card */}
      <ClientSettingsSection title="Available now">
        <ClientSettingsRow
          label="Team & collaborators"
          desc="Invite assistants and producers to see inquiry threads."
          onClick={() => openDrawer("client-team")}
        />
        <ClientSettingsRow
          label="Contracts archive"
          desc="Every signed booking contract — downloadable any time."
          onClick={() => openDrawer("client-contracts")}
        />
        <ClientSettingsRow
          label="Notifications"
          desc="When you get pinged for offers, confirmations, and call sheets."
          onClick={() => openDrawer("client-settings")}
        />
      </ClientSettingsSection>

      {/* Coming-soon — premium row card with subtle locked treatment */}
      <ClientSettingsSection title="Coming soon" tone="muted">
        <ClientSettingsRow
          label="Business details"
          desc="Tax/VAT ID, registered address, business email."
          comingSoon
        />
        <ClientSettingsRow
          label="Payment methods"
          desc="Card on file, ACH, wire — managed by your agency for now."
          comingSoon
        />
        <ClientSettingsRow
          label="Invoicing entity"
          desc="W-9 / VAT certificate, default invoice recipient."
          comingSoon
        />
        <ClientSettingsRow
          label="Brand kit"
          desc="Logo, colors, voice guidelines for inquiries."
          comingSoon
        />
        {/* #26 — Escrow placeholder */}
        <ClientSettingsRow
          label="Escrow & milestone payments"
          desc="Funds held until booking wraps. Partial release on call-sheet send."
          comingSoon
        />
        {/* #27 — Privacy gate placeholder */}
        <ClientSettingsRow
          label="Privacy & verified categories"
          desc="Companion category requires verified client + opt-in talent."
          comingSoon
        />
        {/* #32 — Privacy mode placeholder */}
        <ClientSettingsRow
          label="Anonymous discovery"
          desc="Hide your profile from talent until booking is confirmed."
          comingSoon
        />
        {/* #30 — Recurring bookings placeholder */}
        <ClientSettingsRow
          label="Recurring bookings"
          desc="Auto-rebook the same lineup weekly or monthly."
          comingSoon
        />
        {/* #31 — Per-Profile billing placeholder */}
        <ClientSettingsRow
          label="Per-profile billing"
          desc="Separate cards on file and invoice addresses for each profile."
          comingSoon
        />
        {/* #23 — Audit log placeholder */}
        <ClientSettingsRow
          label="Activity log"
          desc="Who in your team did what, when. Per-profile audit trail."
          comingSoon
        />
      </ClientSettingsSection>
    </>
  );
}

function ClientSettingsSection({ title, tone, children }: {
  title: string; tone?: "default" | "muted"; children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "0 4px 8px",
      }}>
        <span aria-hidden style={{
          width: 5, height: 5, borderRadius: "50%",
          background: tone === "muted" ? COLORS.inkDim : COLORS.indigo,
        }} />
        <h2 style={{
          margin: 0, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
          color: tone === "muted" ? COLORS.inkMuted : COLORS.ink, letterSpacing: -0.1,
        }}>{title}</h2>
      </div>
      <div style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        overflow: "hidden",
      }}>
        {children}
      </div>
    </section>
  );
}

function ClientSettingsRow({ label, desc, comingSoon, onClick }: {
  label: string; desc: string; comingSoon?: boolean; onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={comingSoon} title={comingSoon ? "Coming soon" : undefined} style={{
      display: "flex", alignItems: "center", gap: 12,
      width: "100%", padding: "13px 16px",
      background: "transparent", border: "none",
      borderTop: `1px solid ${COLORS.borderSoft}`,
      cursor: comingSoon ? "not-allowed" : "pointer", textAlign: "left", fontFamily: FONTS.body,
      opacity: comingSoon ? 0.7 : 1,
    }}
      onMouseEnter={(e) => { if (!comingSoon) e.currentTarget.style.background = "rgba(11,11,13,0.025)"; }}
      onMouseLeave={(e) => { if (!comingSoon) e.currentTarget.style.background = "transparent"; }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-admin-ink text-sm font-semibold">{label}</div>
        <div style={{ fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">{desc}</div>
      </div>
      {comingSoon ? (
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999, textTransform: "capitalize", letterSpacing: 0.2, flexShrink: 0 }} className="bg-admin-indigo-soft text-admin-indigo-deep">Soon</span>
      ) : (
        <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>›</span>
      )}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// #15 — NOTIFICATIONS surface (was a drawer; now a real page)
// Grouped: Needs you · Updates · Payments · Read.
// ════════════════════════════════════════════════════════════════════

function ClientNotificationsPage() {
  const { setClientPage } = useAdminShell();
  const [tab, setTab] = useState<"needs" | "updates" | "payments" | "all">("needs");
  // Mocked notifications — production reads from a feed
  type Notif = { id: string; cluster: "needs" | "updates" | "payments"; ts: string; actor: string; title: string; body: string; read: boolean; convId?: string };
  const notifs: Notif[] = [
    { id: "n1", cluster: "needs", ts: "2h ago", actor: "Sara Bianchi", title: "Approve Mango offer", body: "€8,000 · 3 talent · expires in 23h", read: false, convId: "c1" },
    { id: "n2", cluster: "needs", ts: "1d ago", actor: "Acme Models", title: "Confirm dates", body: "Kai Lin · May 18–20 · waiting on you", read: false, convId: "c2" },
    { id: "n3", cluster: "updates", ts: "3h ago", actor: "Marta Reyes", title: "Marta accepted your inquiry", body: "Spring lookbook · she's confirmed for May 14", read: false, convId: "c1" },
    { id: "n4", cluster: "updates", ts: "1d ago", actor: "System", title: "Call sheet ready", body: "Vogue Italia · Studio Rome · May 14", read: true, convId: "c3" },
    { id: "n5", cluster: "payments", ts: "2d ago", actor: "Acme Models", title: "Invoice issued", body: "€8,200 · due May 30", read: false },
    { id: "n6", cluster: "payments", ts: "1w ago", actor: "System", title: "Payment received", body: "€2,400 paid for Marta Reyes booking", read: true },
  ];
  const filtered = tab === "all" ? notifs : notifs.filter(n => n.cluster === tab);
  const unread = notifs.filter(n => !n.read).length;

  return (
    <>
      <PageHeader title="Notifications" subtitle={`${unread} unread`} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 14, scrollbarWidth: "none" }}>
        {([
          { id: "needs",    label: "Needs you",  count: notifs.filter(n => n.cluster === "needs"    && !n.read).length, tone: COLORS.coral },
          { id: "updates",  label: "Updates",    count: notifs.filter(n => n.cluster === "updates"  && !n.read).length, tone: COLORS.indigo },
          { id: "payments", label: "Payments",   count: notifs.filter(n => n.cluster === "payments" && !n.read).length, tone: COLORS.success },
          { id: "all",      label: "All",        count: notifs.length, tone: COLORS.inkMuted },
        ] as const).map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{
              flexShrink: 0, padding: "7px 14px", borderRadius: 999,
              border: `1px solid ${active ? t.tone : COLORS.borderSoft}`,
              background: active ? `${t.tone}15` : "#fff",
              color: active ? t.tone : COLORS.ink,
              fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {t.label}
              {t.count > 0 && (
                <span style={{
                  minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999,
                  background: active ? t.tone : "rgba(11,11,13,0.06)",
                  color: active ? "#fff" : COLORS.inkMuted,
                  fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        overflow: "hidden", fontFamily: FONTS.body,
      }}>
        {filtered.length === 0 && (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13 }} className="text-admin-ink-muted">
            All caught up.
          </div>
        )}
        {filtered.map((n, i) => (
          <button key={n.id} type="button" disabled={!n.convId} title={!n.convId ? "Notification detail coming soon" : undefined} onClick={() => {
            if (n.convId) { pinNextConversation(n.convId); setClientPage("messages"); }
          }}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
              padding: "14px 16px",
              background: n.read ? "transparent" : "rgba(15,79,62,0.025)",
              border: "none",
              borderTop: i > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
              cursor: n.convId ? "pointer" : "not-allowed", textAlign: "left",
              opacity: n.convId ? 1 : 0.65,
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: n.read ? "transparent" : (n.cluster === "needs" ? COLORS.coral : n.cluster === "updates" ? COLORS.indigo : COLORS.success),
              flexShrink: 0, marginTop: 5,
            }} />
            <div className="flex-1 min-w-0">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
                  {n.title}
                </span>
                <span style={{ fontSize: 11, flexShrink: 0 }} className="text-admin-ink-dim">{n.ts}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">
                {n.actor} · {n.body}
              </div>
            </div>
            <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 18, lineHeight: 1, flexShrink: 0, alignSelf: "center" }}>›</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Drawer bodies (client-side)
// ════════════════════════════════════════════════════════════════════

import { DrawerShell } from "./primitives";

function StandardFooter({
  onSave,
  saveLabel = "Save",
}: {
  onSave?: () => void;
  saveLabel?: string;
}) {
  const { closeDrawer } = useAdminShell();
  return (
    <>
      <SecondaryButton onClick={closeDrawer}>{onSave ? "Cancel" : "Close"}</SecondaryButton>
      {onSave && <PrimaryButton onClick={onSave}>{saveLabel}</PrimaryButton>}
    </>
  );
}

export function ClientTodayPulseDrawer() {
  const { state, closeDrawer, setClientPage } = useAdminShell();
  const open = state.drawer.drawerId === "client-today-pulse";
  const pendingDecisions = RICH_INQUIRIES.filter(
    (i) => i.stage === "offer_pending" && i.offer?.clientApproval === "pending",
  );
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Your inbox"
      description={`${pendingDecisions.length} offers waiting on you · ${MY_CLIENT_BRAND.name}`}
    >
      {pendingDecisions.length === 0 ? (
        <EmptyState
          icon="info"
          title="You're caught up"
          body="No offers waiting on your decision right now. We'll ping you the moment something needs you."
          primaryLabel="Browse talent"
          onPrimary={() => {
            closeDrawer();
            setClientPage("discover");
          }}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {pendingDecisions.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                const convId = INQUIRY_TO_CONV[i.id];
                if (convId) pinNextConversation(convId);
                closeDrawer();
                setClientPage("messages");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONTS.body,
              }}
            >
              <StatDot tone="amber" size={8} />
              <div className="flex-1 min-w-0">
                <div className="text-admin-ink text-admin-13h font-medium">{i.brief}</div>
                <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                  {i.agencyName} · offer {i.offer?.total}
                </div>
              </div>
              <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
            </button>
          ))}
        </div>
      )}
    </DrawerShell>
  );
}

export function ClientTalentCardDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-talent-card";
  const id = state.drawer.payload?.id as string | undefined;
  const t = DISCOVER_TALENT.find((d) => d.id === id);
  if (!t) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title="Talent">
        <div className="text-admin-ink-muted">No talent selected.</div>
      </DrawerShell>
    );
  }
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t.name}
      description={`${t.agency} · ${t.city} · ${t.height}`}
      footer={
        <PrimaryButton
          onClick={() => {
            closeDrawer();
            openDrawer("client-send-inquiry", { presetTalent: t.id });
          }}
        >
          Draft inquiry
        </PrimaryButton>
      }
    >
      <div style={{ aspectRatio: "4 / 5", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 96, marginBottom: 14 }} className="bg-admin-surface-alt">
        {t.thumb}
      </div>
      <div className="flex flex-col gap-1.5">
        <KvRow label="Agency" value={t.agency} />
        <KvRow label="Based in" value={t.city} />
        <KvRow label="Height" value={t.height} />
        <KvRow
          label="Availability"
          value={t.available ? "Open for bookings" : "On hold this month"}
        />
      </div>
    </DrawerShell>
  );
}

function KvRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", padding: "8px 0", borderTop: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body }}>
      <span style={{ width: 110, fontSize: 11.5, fontWeight: 600 }} className="text-admin-ink-muted">{label}</span>
      <span style={{ flex: 1, fontSize: 13 }} className="text-admin-ink">{value}</span>
    </div>
  );
}

export function ClientShortlistDetailDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-shortlist-detail";
  const id = state.drawer.payload?.id as string | undefined;
  const sl = MY_SHORTLISTS.find((s) => s.id === id) ?? MY_SHORTLISTS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={sl.name}
      description={`${sl.brief} · updated ${sl.updatedAgo} ago`}
      footer={
        <>
          <SecondaryButton onClick={() => openDrawer("client-share-shortlist", { id: sl.id })}>Share</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              closeDrawer();
              openDrawer("client-send-inquiry", { fromShortlist: sl.id });
            }}
          >
            Draft inquiry
          </PrimaryButton>
        </>
      }
    >
      {/* Talent grid */}
      <div className="flex flex-wrap gap-2.5">
        {sl.thumbs.map((t, i) => (
          <span
            key={i}
            style={{
              width: 60,
              height: 60,
              borderRadius: 10,
              background: COLORS.surfaceAlt,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, marginTop: 8 }} className="text-admin-ink-muted">
        {sl.count} talent saved · tap any to swap, remove, or add a note.
      </div>

      {/* Agency comparison (C16) */}
      <Divider label="Agency track record" />
      <div className="flex flex-col gap-2">
        {AGENCY_RELIABILITY.map((rel) => {
          const barW = `${rel.onTimeRate}%`;
          return (
            <div
              key={rel.agencyName}
              style={{
                padding: "12px 14px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                fontFamily: FONTS.body,
              }}
            >
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <span className="text-admin-ink text-admin-13 font-semibold">{rel.agencyName}</span>
                <span className="text-admin-ink-muted text-admin-11">
                  {rel.bookingsCompleted} bookings with you
                </span>
              </div>
              {/* On-time bar */}
              <div className="mb-1.5">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">On time</span>
                  <span className="text-admin-success-deep text-admin-11 font-semibold">{rel.onTimeRate}%</span>
                </div>
                <div style={{ height: 4, background: "rgba(11,11,13,0.06)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: barW, height: "100%", background: rel.onTimeRate === 100 ? COLORS.green : rel.onTimeRate > 80 ? COLORS.fill : COLORS.red, borderRadius: 999, }}
                  />
                </div>
              </div>
              {/* Stats row */}
              <div style={{ display: "flex", gap: 16, fontSize: 11.5 }} className="text-admin-ink-muted">
                <span>
                  <span style={{ fontWeight: 600, color: rel.cancellations > 0 ? COLORS.red : COLORS.ink }}>
                    {rel.cancellations}
                  </span>{" "}
                  cancellations
                </span>
                <span>
                  <span style={{ fontWeight: 600 }} className="text-admin-ink">{rel.repeatBookings}</span> repeat bookings
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </DrawerShell>
  );
}

export function ClientNewShortlistDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-new-shortlist";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="New shortlist"
      description="Group talent by brief. Shortlist creation will be enabled once saved lists are wired."
      footer={<StandardFooter saveLabel="Create shortlist" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        <FieldGroup label="Name" defaultValue="Editorial · SS27" placeholder="" />
        <FieldGroup label="Brief" defaultValue="Editorial · 4 talent · 1 day · Madrid" placeholder="" textarea />
        <FieldGroup label="Date target" defaultValue="May 6, 2026" placeholder="" />
      </div>
    </DrawerShell>
  );
}

export function ClientShareShortlistDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-share-shortlist";
  const shareUrl = `https://${MY_CLIENT_BRAND.name.toLowerCase().replace(/\s+/g, "-")}.tulala.digital/sl/abc123`;
  const copyLink = () => {
    void navigator.clipboard?.writeText(shareUrl);
    closeDrawer();
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Share shortlist"
      description="Anyone with the link can view the shortlist read-only."
      footer={
        <PrimaryButton onClick={copyLink}>Copy link</PrimaryButton>
      }
    >
      <div style={{ padding: 14, background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, fontFamily: FONTS.mono, fontSize: 12, wordBreak: "break-all" }} className="text-admin-ink">
        {shareUrl}
      </div>
    </DrawerShell>
  );
}

export function ClientSendInquiryDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-send-inquiry";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Draft inquiry"
      description="Draft the request here. Sending is coming soon."
    >
      <InquiryComposerLazy
        mode="client"
        defaultClientName={MY_CLIENT_BRAND.name}
        embedded
        submitDisabled
        onCancel={closeDrawer}
        onSubmit={closeDrawer}
      />
    </DrawerShell>
  );
}

function FieldGroup({
  label, defaultValue, placeholder, textarea, onChange,
}: {
  label: string;
  defaultValue?: string;
  placeholder?: string;
  textarea?: boolean;
  onChange?: (v: string) => void;
}) {
  const sharedStyle: React.CSSProperties = {
    padding: "9px 12px",
    background: "#fff",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontFamily: FONTS.body,
    fontSize: 13.5,
    color: COLORS.ink,
    outline: "none",
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: FONTS.body }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">
        {label}
      </span>
      {textarea ? (
        <textarea
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={3}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          style={{ ...sharedStyle, resize: "none", lineHeight: 1.55 }}
        />
      ) : (
        <input
          defaultValue={defaultValue}
          placeholder={placeholder}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          style={sharedStyle}
        />
      )}
    </label>
  );
}

export function ClientInquiryDetailDrawer() {
  // Legacy fallback drawer for CLIENT_INQUIRIES (old draft inquiries that
  // pre-date RichInquiry adoption). Real inquiries open the InquiryWorkspaceDrawer.
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-inquiry-detail";
  const id = state.drawer.payload?.id as string | undefined;
  const c = CLIENT_INQUIRIES.find((c) => c.id === id);
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={c?.brief ?? "Inquiry"}
      description={c?.shortlistName}
      footer={
        c?.stage === "draft" ? (
          <PrimaryButton
            onClick={() => {
              closeDrawer();
              openDrawer("client-send-inquiry", { fromDraft: id });
            }}
          >
            Continue draft
          </PrimaryButton>
        ) : null
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.6 }} className="text-admin-ink-muted">
        This is a legacy draft inquiry. Once sent, it converts to a Rich Inquiry with private + group threads.
      </div>
    </DrawerShell>
  );
}

// #18 — Review drawer. Three-axis rating after a wrapped booking.
// Private to the platform — drives talent/coordinator trust scores.
export function ClientReviewDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-review";
  const talentName = (state.drawer.payload?.talent as string) ?? "the talent";
  const [scores, setScores] = useState({ responsive: 0, professional: 0, fit: 0 });
  const [comment, setComment] = useState("");
  const axes = [
    { id: "responsive" as const,    label: "Responsiveness",  desc: "How quickly did they reply and confirm?" },
    { id: "professional" as const,  label: "Professionalism", desc: "On-time, prepared, kept the brief in mind." },
    { id: "fit" as const,           label: "Fit",             desc: "Right vibe for your event or shoot." },
  ];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`Review ${talentName}`}
      description="Rate three axes. Private to Tulala — drives talent trust scores."
      footer={
        <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>
        {axes.map(a => (
          <div key={a.id}>
            <div className="text-admin-ink text-admin-13h font-semibold">{a.label}</div>
            <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{a.desc}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {[1, 2, 3, 4, 5].map(n => {
                const filled = scores[a.id] >= n;
                return (
                  <button key={n} type="button" onClick={() => setScores(s => ({ ...s, [a.id]: n }))} aria-label={`${n} stars`} style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    padding: 4, color: filled ? COLORS.amber : COLORS.inkDim,
                  }}>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                      <path d="M11 2l2.6 6L20 9l-5 4.5L16.5 20 11 16.5 5.5 20 7 13.5 2 9l6.4-1z"/>
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <label style={{ display: "block" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink">Comment <span style={{ fontWeight: 500 }} className="text-admin-ink-dim">(optional)</span></div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What stood out? What could be better?"
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 12px",
              borderRadius: 8, border: `1px solid ${COLORS.border}`,
              background: "rgba(11,11,13,0.025)",
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
              outline: "none", resize: "vertical",
            }}
          />
        </label>
      </div>
    </DrawerShell>
  );
}

// WS-8.10  Counter-offer diff view — side-by-side current vs proposed
export function ClientCounterOfferDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-counter-offer";
  const [counterRate, setCounterRate] = useState("2200");
  const [note, setNote] = useState("Budget is firm — can the agency hold rate within €2,200?");

  const OFFER = {
    rate:     "€2,500 / day",
    duration: "2 days",
    talent:   "Sofia R.",
    dates:    "May 8–9, 2026",
    agency:   "Acme Models",
  };

  const SIDE: React.CSSProperties = {
    flex: 1, background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
    padding: "14px 16px", border: `1px solid ${COLORS.borderSoft}`,
    fontFamily: FONTS.body, fontSize: 13,
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Counter offer"
      description="Review the agency's terms and draft a counter before the send action is wired."
      footer={
        <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }}>

        {/* WS-8.10 Diff: Current offer vs Your counter */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 10 }} className="text-admin-ink-muted">
            Terms comparison
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Agency offer */}
            <div style={SIDE}>
              <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 8 }} className="text-admin-ink-muted">
                Agency offer
              </div>
              {Object.entries(OFFER).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ textTransform: "capitalize" }} className="text-admin-ink-muted">{k}</span>
                  <span style={{ fontWeight: 600 }} className="text-admin-ink">{v}</span>
                </div>
              ))}
            </div>

            {/* Your counter */}
            <div style={{ ...SIDE, borderColor: COLORS.accent + "66", background: COLORS.accent + "08" }}>
              <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 8 }} className="text-admin-accent">
                Your counter
              </div>
              {Object.entries(OFFER).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ textTransform: "capitalize" }} className="text-admin-ink-muted">{k}</span>
                  <span style={{ fontWeight: 600, color: k === "rate" ? COLORS.accent : COLORS.ink }}>
                    {k === "rate" ? (counterRate ? `€${counterRate} / day` : v) : v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Edit counter rate */}
        <FieldGroup
          label="Counter rate (€ / day)"
          defaultValue={counterRate}
          placeholder="e.g. 2200"
          onChange={(v) => setCounterRate(v)}
        />
        <FieldGroup
          label="Note to coordinator"
          defaultValue={note}
          placeholder="Explain your counter…"
          textarea
          onChange={(v) => setNote(v)}
        />
      </div>
    </DrawerShell>
  );
}

export function ClientBookingDetailDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-booking-detail";
  const id = state.drawer.payload?.id as string | undefined;
  const b = CLIENT_BOOKINGS.find((b) => b.id === id) ?? CLIENT_BOOKINGS[0];
  const postStatusLabel: Record<ClientBookingPostStatus, string> = {
    "contract-pending": "Contract pending signature",
    "contract-signed": "Contract signed",
    "call-sheet-sent": "Call sheet sent to talent",
    confirmed: "All confirmed",
    wrapped: "Shoot wrapped",
    "invoice-pending": "Invoice pending payment",
    paid: "Invoice paid",
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={b.shortlistName}
      description={`Booking ${b.id} · ${b.agency}`}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
          <SecondaryButton onClick={() => openDrawer("client-contracts")}>View contract</SecondaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <KvRow label="Talent" value={b.talent} />
        <KvRow label="Date" value={b.date} />
        <KvRow label="Location" value={b.location} />
        <KvRow label="Total" value={b.amount} />
        <KvRow label="Production" value={postStatusLabel[b.postStatus]} />
      </div>
    </DrawerShell>
  );
}

export function ClientContractsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-contracts";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Contracts"
      description="Every signed booking contract for this brand."
    >
      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {CLIENT_BOOKINGS.map((b, i) => (
          <div
            key={b.id}
            style={{
              display: "flex",
              gap: 12,
              padding: "12px 14px",
              borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
              alignItems: "center",
              fontFamily: FONTS.body,
              fontSize: 13,
            }}
          >
            <span style={{ flex: 1 }} className="text-admin-ink">
              {b.talent} · {b.shortlistName}
            </span>
            <span className="text-admin-ink-muted text-admin-11h">{b.date}</span>
            <span style={{ fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500 }} className="text-admin-ink-muted">
              On file
            </span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

export function ClientTeamDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-team";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Team"
      description="Team members can see inquiry threads and bookings for this brand."
    >
      <div className="flex flex-col gap-1.5">
        {[
          { name: "Helena Ross", email: "helena@netaporter.com", role: "Owner" },
          { name: "Marco Lin", email: "marco@netaporter.com", role: "Booker" },
        ].map((m) => (
          <div
            key={m.email}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
            }}
          >
            <Avatar initials={m.name.split(" ").map((n) => n[0]).join("")} size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-admin-ink text-admin-13 font-medium">{m.name}</div>
              <div className="text-admin-ink-muted text-admin-11h">{m.email}</div>
            </div>
            <span style={{ padding: "2px 8px", background: "rgba(11,11,13,0.04)", fontSize: 10.5, fontWeight: 600, borderRadius: 999 }} className="text-admin-ink">
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

export function ClientBillingDrawer() {
  const { state, closeDrawer, openUpgrade } = useAdminShell();
  const open = state.drawer.drawerId === "client-billing";
  const planMeta = CLIENT_PLAN_META[state.clientPlan];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Billing"
      description={`Current plan: ${planMeta.label} · ${planMeta.price}`}
      footer={
        state.clientPlan !== "enterprise" ? (
          <PrimaryButton
            onClick={() =>
              openUpgrade({
                feature: "Multi-seat client workspace",
                requiredPlan: "agency",
                why: "Add producers and assistants so they see inquiry threads.",
              })
            }
          >
            Upgrade plan
          </PrimaryButton>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <div
        style={{
          padding: 16,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          fontFamily: FONTS.body,
        }}
      >
        <div className="text-admin-ink-muted text-admin-11h font-semibold">
          Plan
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, marginTop: 4 }} className="text-admin-ink">
          {planMeta.label} — {planMeta.price}
        </div>
        <div style={{ fontSize: 12.5, marginTop: 4 }} className="text-admin-ink-muted">{planMeta.theme}</div>
      </div>
    </DrawerShell>
  );
}

export function ClientBrandSwitcherDrawer() {
  const { state, closeDrawer, setClientProfile } = useAdminShell();
  const open = state.drawer.drawerId === "client-brand-switcher";
  // Profile = a booking identity. Each user can own multiple Profiles
  // (business + personal, or one producer with several client Profiles).
  // Naming-rule: "Profile" not "Brand" — "Brand" only fits businesses.
  const profiles = [
    { id: "martina" as const, name: "Martina Beach Club", industry: "Hospitality · beach club", isBusiness: true,  photoUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80" },
    { id: "gringo"  as const, name: "The Gringo",         industry: "Personal client",          isBusiness: false, photoUrl: "https://i.pravatar.cc/300?img=33" },
  ];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Switch profile"
      description="One human, many profiles. Each profile keeps its own inquiries, bookings, and billing. Switch any time."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: FONTS.body }}>
        {profiles.map((p) => {
          const active = p.id === state.clientProfile;
          return (
            <button
              key={p.id}
              onClick={() => { setClientProfile(p.id); closeDrawer(); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px",
                background: active ? "rgba(15,79,62,0.06)" : "#fff",
                border: `1px solid ${active ? "rgba(15,79,62,0.22)" : COLORS.borderSoft}`,
                borderRadius: 10,
                cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ width: 40, height: 40, borderRadius: p.isBusiness ? 10 : "50%", background: `url(${p.photoUrl}) center/cover, ${COLORS.surfaceAlt}`, flexShrink: 0, }} />
              <div className="flex-1 min-w-0">
                <div className="text-admin-ink text-sm font-semibold">{p.name}</div>
                <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                  {p.industry} · {p.isBusiness ? "Business" : "Personal"}
                </div>
              </div>
              {active && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999 }} className="bg-admin-success-soft text-admin-success-deep">Current</span>
              )}
            </button>
          );
        })}
      </div>
    </DrawerShell>
  );
}

// WS-8.8  Saved-search alerts summary.
export function ClientSavedSearchDrawer() {
  const { state, closeDrawer, setClientPage } = useAdminShell();
  const open = state.drawer.drawerId === "client-saved-search";

  const searches = [
    { id: "s1", name: "Madrid · 5′8″+ · Available May", count: 12, alert: true,  freq: "daily"  },
    { id: "s2", name: "Acme Models — bridal",            count:  4, alert: false, freq: "weekly" },
    { id: "s3", name: "Fitness · Female · Bilingual",    count:  7, alert: true,  freq: "daily"  },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Saved searches"
      description="Review saved filters and jump back into Discover."
    >
      <div className="flex flex-col gap-2.5">
        {searches.map((s) => (
          <div
            key={s.id}
            style={{
              background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: RADIUS.lg, overflow: "hidden",
              fontFamily: FONTS.body,
            }}
          >
            {/* Search row */}
            <button
              type="button"
              onClick={() => { setClientPage("discover"); closeDrawer(); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 14px", width: "100%",
                background: "transparent", border: "none", cursor: "pointer",
                textAlign: "left",
              }}
            >
              <Icon name="search" size={14} color={COLORS.inkMuted} />
              <div className="flex-1">
                <div className="text-admin-ink text-admin-13 font-medium">{s.name}</div>
                <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{s.count} matches</div>
              </div>
              <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
            </button>

            {/* Alert status row */}
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 14px", borderTop: `1px solid ${COLORS.borderSoft}`,
                background: s.alert ? COLORS.accent + "06" : "transparent",
              }}
            >
              <span
                style={{
                  minWidth: 36,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: s.alert ? COLORS.accent : COLORS.borderSoft,
                  color: s.alert ? "#fff" : COLORS.inkMuted,
                  fontSize: 10.5,
                  fontWeight: 700,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {s.alert ? "On" : "Off"}
              </span>
              <span style={{ fontSize: 12, color: s.alert ? COLORS.ink : COLORS.inkMuted, flex: 1 }}>
                Email alerts {s.alert ? `· ${s.freq}` : "off"}
              </span>
            </div>
          </div>
        ))}

        {/* Discover jump */}
        <button
          type="button"
          onClick={() => { setClientPage("discover"); closeDrawer(); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 6, padding: "10px 14px",
            background: "transparent", border: `1px dashed ${COLORS.border}`,
            borderRadius: RADIUS.lg, cursor: "pointer",
            fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted,
          }}
        >
          <Icon name="search" size={13} color={COLORS.inkMuted} />
          Open Discover
        </button>
      </div>
    </DrawerShell>
  );
}

export function ClientQuickQuestionDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-quick-question";
  const [selectedAgency, setSelectedAgency] = useState("Acme Models");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Ask a question"
      description="Send a message directly to an agency without starting a full inquiry pipeline."
      footer={
        <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        {/* Agency picker */}
        <div className="flex flex-col gap-1.5">
          <span className="text-admin-ink-muted text-admin-11h font-semibold">
            To agency
          </span>
          <div className="flex gap-2 flex-wrap">
            {["Acme Models", "Praline London", "Maison Sud"].map((a) => {
              const active = selectedAgency === a;
              return (
                <button
                  key={a}
                  onClick={() => setSelectedAgency(a)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    background: active ? COLORS.fill : "rgba(11,11,13,0.04)",
                    color: active ? "#fff" : COLORS.ink,
                    border: "none",
                    fontFamily: FONTS.body,
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>

        <FieldGroup
          label="Message"
          defaultValue="Do you have any talent available the week of May 19 for a 1-day shoot in Paris? Looking for 2–3 models, open brief."
          placeholder="Type your question..."
          textarea
        />

        {/* Contextual note */}
        <div style={{ padding: 11, background: "rgba(11,11,13,0.03)", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink-muted">
          This creates a lightweight thread — not a full inquiry. You can convert it to a
          full inquiry with a shortlist and offer at any time.
        </div>
      </div>
    </DrawerShell>
  );
}

export function ClientSettingsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-settings";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Notifications"
      description="Where you get pinged when an offer arrives or talent confirms."
      footer={<StandardFooter />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: FONTS.body }}>
        {[
          { label: "New offer received", on: true },
          { label: "Talent declined a line", on: true },
          { label: "Booking converted", on: true },
          { label: "Coordinator replied to private thread", on: true },
          { label: "Weekly digest", on: false },
        ].map((r) => (
          <div
            key={r.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ flex: 1, fontSize: 13 }} className="text-admin-ink">{r.label}</span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                                padding: "2px 8px",
                borderRadius: 999,
                background: r.on ? COLORS.successSoft : "rgba(11,11,13,0.04)",
                color: r.on ? COLORS.successDeep : COLORS.inkMuted,
              }}
            >
              {r.on ? "On" : "Off"}
            </span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-8.9  Client "My talent" page — repeat bookings dashboard
// ─────────────────────────────────────────────────────────────────────────────

const MY_TALENT_DATA = [
  { id: "t1", name: "Sofia R.",   thumb: "SR", bookings: 4, lastBooked: "Mar 2026", totalSpend: 9800,  agency: "Acme Models",    tags: ["editorial", "RTW"] },
  { id: "t2", name: "Lena K.",    thumb: "LK", bookings: 2, lastBooked: "Feb 2026", totalSpend: 4600,  agency: "Blue Talent",    tags: ["campaign"] },
  { id: "t3", name: "Marco F.",   thumb: "MF", bookings: 3, lastBooked: "Jan 2026", totalSpend: 6200,  agency: "Elite Madrid",   tags: ["lookbook", "e-comm"] },
  { id: "t4", name: "Ana P.",     thumb: "AP", bookings: 1, lastBooked: "Dec 2025", totalSpend: 2400,  agency: "Acme Models",    tags: ["beauty"] },
];

export function ClientMyTalentDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-my-talent";
  const [search, setSearch] = useState("");

  const filtered = MY_TALENT_DATA.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.agency.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="My talent"
      description="Talent you've booked before — quick-rebook or start a new inquiry."
    >
      {/* Search */}
      <div className="mb-3">
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `1px solid ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-md">
          <Icon name="search" size={13} color={COLORS.inkMuted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or agency…"
            style={{ flex: 1, background: "none", border: "none", fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none" }}
          />
        </div>
      </div>

      {/* Talent list */}
      <div className="flex flex-col gap-2">
        {filtered.map((t) => (
          <div
            key={t.id}
            style={{
              background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: RADIUS.lg, padding: "14px 16px",
              display: "flex", alignItems: "flex-start", gap: 12,
              fontFamily: FONTS.body,
            }}
          >
            <Avatar initials={t.thumb} size={38} />
            <div className="flex-1 min-w-0">
              <div style={{ fontWeight: 700, fontSize: 14 }} className="text-admin-ink">{t.name}</div>
              <div style={{ fontSize: 12, marginBottom: 6 }} className="text-admin-ink-muted">{t.agency}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {t.tags.map((tag) => (
                  <span key={tag} style={{
                    fontSize: 11, padding: "2px 7px", borderRadius: 999,
                    background: COLORS.surfaceAlt, color: COLORS.inkMuted,
                    border: `1px solid ${COLORS.borderSoft}`,
                  }}>{tag}</span>
                ))}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div className="text-admin-ink-muted text-xs">{t.bookings}× booked</div>
              <div className="text-admin-ink-muted text-xs">€{t.totalSpend.toLocaleString()}</div>
              <button
                type="button"
                onClick={() => { closeDrawer(); openDrawer("client-send-inquiry", { presetTalent: t.id }); }}
                style={{
                  marginTop: 8, padding: "5px 12px",
                  background: COLORS.accent, color: "#fff",
                  border: "none", borderRadius: 999, cursor: "pointer",
                  fontSize: 11.5, fontWeight: 700, fontFamily: FONTS.body,
                }}
              >
                Rebook
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <EmptyState icon="search" title="No talent found" body="Try a different search term." compact />
        )}
      </div>
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-8.11  Client spend by talent / by agency — reporting drawer
// ─────────────────────────────────────────────────────────────────────────────

const SPEND_BY_TALENT = [
  { name: "Sofia R.",  amount: 9800,  pct: 100 },
  { name: "Marco F.",  amount: 6200,  pct: 63  },
  { name: "Lena K.",   amount: 4600,  pct: 47  },
  { name: "Ana P.",    amount: 2400,  pct: 24  },
];
const SPEND_BY_AGENCY = [
  { name: "Acme Models",  amount: 12200, pct: 100 },
  { name: "Elite Madrid", amount: 6200,  pct: 51  },
  { name: "Blue Talent",  amount: 4600,  pct: 38  },
];

export function ClientSpendReportDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-spend-report";
  const [view, setView] = useState<"talent" | "agency">("talent");

  const data = view === "talent" ? SPEND_BY_TALENT : SPEND_BY_AGENCY;

  const BAR_TRACK: React.CSSProperties = {
    flex: 1, height: 6, background: COLORS.surfaceAlt,
    borderRadius: 999, overflow: "hidden",
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Spend report"
      description="Year-to-date spend broken down by talent and agency."
    >
      {/* Toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, padding: 4 }} className="bg-admin-surface-alt rounded-admin-md">
        {(["talent", "agency"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            style={{
              flex: 1, padding: "6px 0", borderRadius: RADIUS.sm,
              background: view === v ? "#fff" : "transparent",
              border: "none", cursor: "pointer",
              fontFamily: FONTS.body, fontSize: 13, fontWeight: view === v ? 700 : 400,
              color: view === v ? COLORS.ink : COLORS.inkMuted,
              boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.10)" : "none",
              transition: "all .15s",
            }}
          >
            By {v}
          </button>
        ))}
      </div>

      {/* Total */}
      <div style={{ marginBottom: 16, padding: "12px 14px", border: `1px solid ${COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
        <div style={{ fontSize: 11, fontFamily: FONTS.body }} className="text-admin-ink-muted">
          Total YTD spend
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, fontFamily: FONTS.body, marginTop: 2 }} className="text-admin-ink">
          €{data.reduce((s, r) => s + r.amount, 0).toLocaleString()}
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="flex flex-col gap-2.5">
        {data.map((r) => (
          <div key={r.name} style={{ fontFamily: FONTS.body }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <span className="text-admin-ink text-admin-13 font-medium">{r.name}</span>
              <span className="text-admin-ink text-admin-13 font-bold">€{r.amount.toLocaleString()}</span>
            </div>
            <div style={BAR_TRACK}>
              <div style={{ '--progress-w': `${r.pct}%` }} className="w-[var(--progress-w)] h-full rounded-full [transition:width_.4s_ease]" />
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-8.12  Client budget tracking — set budget + spend alerts
// ─────────────────────────────────────────────────────────────────────────────

export function ClientBudgetDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "client-budget";
  const [budget, setBudget] = useState("50000");
  const [alertAt, setAlertAt] = useState("80");

  const spent = 23000;
  const budgetNum = parseInt(budget, 10) || 50000;
  const spentPct = Math.min(100, Math.round((spent / budgetNum) * 100));
  const alertPct = parseInt(alertAt, 10) || 80;
  const isNearLimit = spentPct >= alertPct;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Budget tracking"
      description="Set a quarterly spend cap and get alerted before you hit it."
      footer={
        <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: FONTS.body }} className="bg-admin-accent">

        {/* Live spend gauge */}
        <div style={{ padding: "16px", border: `1px solid ${isNearLimit ? "#D97706" + "44" : COLORS.border}` }} className="bg-admin-surface-alt rounded-admin-lg">
          <div className="flex justify-between mb-2">
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }} className="text-admin-ink-muted">Q2 Spend</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 1 }} className="text-admin-ink">€{spent.toLocaleString()}</div>
            </div>
            <div className="text-right">
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }} className="text-admin-ink-muted">Budget</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 1 }} className="text-admin-ink">€{budgetNum.toLocaleString()}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 10, background: COLORS.border, borderRadius: 999, overflow: "hidden", position: "relative" }}>
            {/* Alert threshold marker */}
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: `${alertPct}%`, width: 2,
              background: "#D97706", zIndex: 1,
            }} />
            <div
              style={{ '--progress-w': `${spentPct}%`, '--progress-bg': isNearLimit ? "#D97706" : COLORS.accent }}
              className="w-[var(--progress-w)] h-full rounded-full bg-[var(--progress-bg)] [transition:width_.4s_ease]"
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: isNearLimit ? "#D97706" : COLORS.inkMuted }}>
              {isNearLimit ? `⚠ ${spentPct}% used — near limit` : `${spentPct}% of budget used`}
            </span>
            <span className="text-admin-ink-muted text-admin-11">
              €{(budgetNum - spent).toLocaleString()} remaining
            </span>
          </div>
        </div>

        {/* Budget input */}
        <FieldGroup
          label="Quarterly budget (€)"
          defaultValue={budget}
          placeholder="e.g. 50000"
          onChange={(v) => setBudget(v)}
        />

        {/* Alert threshold */}
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }} className="text-admin-ink-muted">
            Alert me at (% of budget)
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {["60", "70", "80", "90"].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setAlertAt(pct)}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: RADIUS.md,
                  border: `1px solid ${alertAt === pct ? COLORS.accent : COLORS.border}`,
                  background: alertAt === pct ? COLORS.accent + "10" : "#fff",
                  fontFamily: FONTS.body, fontSize: 13,
                  fontWeight: alertAt === pct ? 700 : 400,
                  color: alertAt === pct ? COLORS.accent : COLORS.ink,
                  cursor: "pointer",
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}
