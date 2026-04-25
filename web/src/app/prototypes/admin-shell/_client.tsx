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

import { useState, type ReactNode } from "react";
import {
  AGENCY_RELIABILITY,
  CLIENT_BOOKINGS,
  CLIENT_INQUIRIES,
  CLIENT_PAGES,
  CLIENT_PAGE_META,
  CLIENT_PLAN_META,
  CLIENT_Q2_BUDGET,
  COLORS,
  DISCOVER_TALENT,
  FONTS,
  INQUIRY_STAGE_META,
  MY_CLIENT_BRAND,
  MY_SHORTLISTS,
  RICH_INQUIRIES,
  meetsClientPlan,
  useProto,
  type AgencyReliability,
  type ClientBooking,
  type ClientBookingPostStatus,
  type ClientInquiry,
  type ClientPage,
  type DiscoverTalent,
  type RichInquiry,
  type Shortlist,
} from "./_state";
import {
  Affordance,
  Avatar,
  Bullet,
  CapsLabel,
  Divider,
  GhostButton,
  Icon,
  IconChip,
  PrimaryButton,
  PrimaryCard,
  SecondaryButton,
  SecondaryCard,
  StatDot,
  StatusCard,
} from "./_primitives";

// ════════════════════════════════════════════════════════════════════
// Surface entry
// ════════════════════════════════════════════════════════════════════

export function ClientSurface() {
  return (
    <div style={{ background: COLORS.surface, minHeight: "calc(100vh - 50px)" }}>
      <ClientTopbar />
      <main
        style={{
          padding: "28px 28px 60px",
          maxWidth: 1240,
          margin: "0 auto",
        }}
      >
        <ClientRouter />
      </main>
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────

function ClientTopbar() {
  const { state, setClientPage, openDrawer } = useProto();
  const brand = MY_CLIENT_BRAND;
  const planMeta = CLIENT_PLAN_META[state.clientPlan];

  return (
    <header
      style={{
        background: "#fff",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        padding: "0 28px",
        position: "sticky",
        top: 50,
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 56,
        }}
      >
        {/* Brand identity */}
        <button
          onClick={() => openDrawer("client-brand-switcher")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: FONTS.body,
          }}
        >
          <Avatar initials={brand.initials} size={28} tone="warm" />
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: -0.1,
              color: COLORS.ink,
            }}
          >
            {brand.name}
          </span>
          <Icon name="chevron-down" size={11} color={COLORS.inkDim} />
        </button>

        {/* Plan chip */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: state.clientPlan === "free" ? "rgba(11,11,13,0.04)" : "rgba(46,125,91,0.10)",
            color: state.clientPlan === "free" ? COLORS.inkMuted : "#1F5C42",
            padding: "3px 9px",
            borderRadius: 999,
            fontFamily: FONTS.body,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          {planMeta.label}
        </span>

        <div style={{ width: 1, height: 22, background: COLORS.borderSoft, margin: "0 8px" }} />

        {/* Page nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
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
                  transition: "color .12s, background .12s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.ink;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.inkMuted;
                }}
              >
                {CLIENT_PAGE_META[p].label}
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -16,
                      left: 12,
                      right: 12,
                      height: 2,
                      background: COLORS.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => openDrawer("client-today-pulse")}
            aria-label="Today pulse"
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
            }}
          >
            <Icon name="mail" size={14} stroke={1.7} />
            <span
              style={{
                position: "absolute",
                top: 7,
                right: 8,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: COLORS.amber,
                boxShadow: "0 0 0 2px #fff",
              }}
            />
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── Router ───────────────────────────────────────────────────────

function ClientRouter() {
  const { state } = useProto();
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
  }
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
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
      <div style={{ flex: 1 }}>
        {eyebrow && (
          <div style={{ marginBottom: 6 }}>
            <CapsLabel>{eyebrow}</CapsLabel>
          </div>
        )}
        <h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: -0.6,
            color: COLORS.ink,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 14,
              color: COLORS.inkMuted,
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 720,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
    </div>
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
    <div style={{ display: "grid", gridTemplateColumns: colMap[cols], gap: 12 }}>{children}</div>
  );
}

// ─── Budget strip (C15) ───────────────────────────────────────────

function BudgetStrip() {
  const { currency, label, spent, total } = CLIENT_Q2_BUDGET;
  const pct = Math.round((spent / total) * 100);
  const remaining = total - spent;
  const overBudget = pct > 85;
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 16px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: FONTS.body,
      }}
    >
      {/* Label */}
      <div style={{ flexShrink: 0 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          {label} budget
        </div>
      </div>

      {/* Bar */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            height: 5,
            background: "rgba(11,11,13,0.07)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              borderRadius: 999,
              background: overBudget ? "#B0303A" : COLORS.ink,
            }}
          />
        </div>
      </div>

      {/* Spent / total */}
      <div style={{ flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
          {currency}{spent.toLocaleString()}
        </span>
        <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
          {" "}/ {currency}{total.toLocaleString()} · {pct}% used
        </span>
      </div>

      {/* Remaining chip */}
      <div
        style={{
          flexShrink: 0,
          padding: "3px 9px",
          borderRadius: 999,
          background: overBudget ? "rgba(176,48,58,0.08)" : "rgba(11,11,13,0.04)",
          fontSize: 11,
          fontWeight: 600,
          color: overBudget ? "#7A2026" : COLORS.inkMuted,
          letterSpacing: 0.3,
          whiteSpace: "nowrap",
        }}
      >
        {currency}{remaining.toLocaleString()} remaining
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TODAY — pulse driven by RICH_INQUIRIES (so client sees real inquiry stages)
// ════════════════════════════════════════════════════════════════════

function ClientTodayPage() {
  const { openDrawer, setClientPage } = useProto();
  const pendingDecisions = RICH_INQUIRIES.filter(
    (i) => i.stage === "offer_pending" && i.offer?.clientApproval === "pending",
  );
  const awaitingAgency = RICH_INQUIRIES.filter(
    (i) => i.stage === "submitted" || i.stage === "coordination",
  );
  const upcoming = CLIENT_BOOKINGS.filter((b) => b.status === "confirmed");

  return (
    <>
      <PageHeader
        eyebrow={`Hi from ${MY_CLIENT_BRAND.name}`}
        title="Today"
        subtitle="Inquiries you sent, offers waiting on you, and bookings on the calendar."
        actions={
          <>
            <GhostButton onClick={() => setClientPage("discover")}>Browse talent</GhostButton>
            <SecondaryButton onClick={() => openDrawer("client-quick-question")}>Quick question</SecondaryButton>
            <PrimaryButton onClick={() => openDrawer("client-send-inquiry")}>New inquiry</PrimaryButton>
          </>
        }
      />

      <Grid cols="4">
        <StatusCard
          label="Need your decision"
          value={pendingDecisions.length}
          caption="offers"
          tone="amber"
          onClick={() => setClientPage("inquiries")}
        />
        <StatusCard
          label="Working on it"
          value={awaitingAgency.length}
          caption="agency replying"
          tone="ink"
          onClick={() => setClientPage("inquiries")}
        />
        <StatusCard
          label="Upcoming bookings"
          value={upcoming.length}
          caption="confirmed"
          tone="green"
          onClick={() => setClientPage("bookings")}
        />
        <StatusCard
          label="Saved shortlists"
          value={MY_SHORTLISTS.length}
          caption="active"
          tone="dim"
          onClick={() => setClientPage("shortlists")}
        />
      </Grid>

      <BudgetStrip />

      <div style={{ height: 20 }} />

      {/* What needs decision */}
      {pendingDecisions.length > 0 && (
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "16px 18px 4px",
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <div
              style={{
                fontFamily: FONTS.body,
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.ink,
                letterSpacing: -0.05,
              }}
            >
              Offers waiting for your approval
            </div>
            <div
              style={{
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.inkMuted,
                marginTop: 2,
              }}
            >
              Each offer shows the talent your coordinator selected and the negotiated rates.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {pendingDecisions.map((i) => (
              <ClientInquiryRow key={i.id} inquiry={i} />
            ))}
          </div>
        </section>
      )}

      <div style={{ height: 12 }} />

      {/* Active conversations — full width */}
      <PrimaryCard
        title="Active conversations"
        description={`${awaitingAgency.length} inquiries where the agency is working on your shortlist. Click any row to open the thread.`}
        icon={<Icon name="mail" size={14} stroke={1.7} />}
        affordance="Open all inquiries"
        meta={<><StatDot tone="ink" /> {awaitingAgency.length} active threads</>}
        onClick={() => setClientPage("inquiries")}
      />

      <div style={{ height: 12 }} />

      {/* Upcoming bookings */}
      {upcoming.length > 0 && (
        <section
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "16px 0 6px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 8,
              padding: "0 18px",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 14,
                  fontWeight: 600,
                  color: COLORS.ink,
                  letterSpacing: -0.05,
                }}
              >
                Upcoming bookings
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: COLORS.inkMuted,
                  marginTop: 2,
                }}
              >
                Locked-in dates with talent confirmed and contracts signed.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setClientPage("bookings")}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.ink,
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                padding: 0,
              }}
            >
              See all bookings →
            </button>
          </div>
          <div>
            {upcoming.slice(0, 3).map((b) => (
              <ClientBookingRow key={b.id} booking={b} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// INQUIRIES — the heart of the client surface, grouped by stage,
// each row opens the shared inquiry-workspace with pov="client"
// ════════════════════════════════════════════════════════════════════

function ClientInquiriesPage() {
  const { openDrawer } = useProto();
  const groups: { id: string; label: string; description: string; filter: (i: RichInquiry) => boolean }[] = [
    {
      id: "decide",
      label: "Decide",
      description: "Offers your agency sent — approve or counter.",
      filter: (i) => i.stage === "offer_pending",
    },
    {
      id: "in-flight",
      label: "In flight",
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
        eyebrow="Inquiries"
        title="Your conversations"
        subtitle="Every inquiry lives as a private thread with your coordinator. Click any row to open the conversation, see the offer, and approve or counter."
        actions={
          <PrimaryButton onClick={() => openDrawer("client-send-inquiry")}>
            Send new inquiry
          </PrimaryButton>
        }
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
                <p
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 12.5,
                    color: COLORS.inkMuted,
                    margin: "3px 0 0",
                  }}
                >
                  {g.description}
                </p>
              </div>
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkDim }}>
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
        <section style={{ marginTop: 32 }}>
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

function ClientInquiryRow({ inquiry, bordered }: { inquiry: RichInquiry; bordered?: boolean }) {
  const { openDrawer } = useProto();
  const meta = INQUIRY_STAGE_META[inquiry.stage];
  return (
    <button
      onClick={() => openDrawer("inquiry-workspace", { inquiryId: inquiry.id, pov: "client" })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: bordered ? "14px 16px" : "12px 0",
        background: "transparent",
        border: "none",
        borderTop: bordered ? `1px solid ${COLORS.borderSoft}` : "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: "background .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(11,11,13,0.02)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {/* Stage dot */}
      <StatDot tone={meta.tone === "red" ? "red" : meta.tone} size={8} />

      {/* Brief & agency */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
            {inquiry.brief}
          </span>
          {inquiry.unreadPrivate > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                background: COLORS.amber,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                padding: "0 6px",
              }}
            >
              {inquiry.unreadPrivate}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
          via {inquiry.agencyName}
          {inquiry.coordinator && (
            <>
              {" · "}coordinator {inquiry.coordinator.name}
            </>
          )}
          {inquiry.date && <> · {inquiry.date}</>}
        </div>
      </div>

      {/* Offer total */}
      {inquiry.offer && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 500, color: COLORS.ink }}>
            {inquiry.offer.total}
          </div>
          <div style={{ fontSize: 10.5, color: COLORS.inkDim, letterSpacing: 0.4, textTransform: "uppercase" }}>
            offer v{inquiry.offer.version}
          </div>
        </div>
      )}

      {/* Stage chip */}
      <span
        style={{
          padding: "3px 9px",
          borderRadius: 999,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          background:
            meta.tone === "green"
              ? "rgba(46,125,91,0.10)"
              : meta.tone === "amber"
                ? "rgba(198,138,30,0.12)"
                : meta.tone === "red"
                  ? "rgba(176,48,58,0.10)"
                  : "rgba(11,11,13,0.04)",
          color:
            meta.tone === "green"
              ? "#1F5C42"
              : meta.tone === "amber"
                ? "#7E5612"
                : meta.tone === "red"
                  ? "#7A2026"
                  : COLORS.inkMuted,
          flexShrink: 0,
        }}
      >
        {meta.label}
      </span>

      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

function LegacyClientInquiryRow({ inquiry }: { inquiry: typeof CLIENT_INQUIRIES[number] }) {
  const { openDrawer } = useProto();
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
      <span style={{ fontSize: 13.5, color: COLORS.ink, fontWeight: 500, flex: 1 }}>{inquiry.brief}</span>
      <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{inquiry.shortlistName} · {inquiry.agency}</span>
      <span
        style={{
          padding: "2px 7px",
          borderRadius: 999,
          fontSize: 10,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          background: "rgba(11,11,13,0.04)",
          color: COLORS.inkMuted,
          fontWeight: 600,
        }}
      >
        Draft
      </span>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// DISCOVER (talent browser, plan-gated)
// ════════════════════════════════════════════════════════════════════

function ClientDiscoverPage() {
  const { state, openDrawer, openUpgrade } = useProto();
  const canAdvanced = meetsClientPlan(state.clientPlan, "pro");
  const [filter, setFilter] = useState<"all" | "available" | "agency-acme">("all");

  const filtered = DISCOVER_TALENT.filter((t) => {
    if (filter === "available") return t.available;
    if (filter === "agency-acme") return t.agency === "Acme Models";
    return true;
  });

  return (
    <>
      <PageHeader
        eyebrow="Discover"
        title="Find talent"
        subtitle="Browse rosters across agencies. Add anyone to a shortlist, then send a single inquiry to all of them at once."
        actions={
          <SecondaryButton
            onClick={() => {
              if (canAdvanced) openDrawer("client-saved-search");
              else openUpgrade({ feature: "Saved searches", requiredPlan: "studio", why: "Save complex filters and re-run them weekly." });
            }}
          >
            Saved searches
          </SecondaryButton>
        }
      />

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {(
          [
            { id: "all", label: "All talent" },
            { id: "available", label: "Available · May" },
            { id: "agency-acme", label: "Acme Models only" },
          ] as const
        ).map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                background: active ? COLORS.ink : "rgba(11,11,13,0.04)",
                color: active ? "#fff" : COLORS.ink,
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <Grid cols="3">
        {filtered.map((t) => (
          <DiscoverCard key={t.id} talent={t} />
        ))}
      </Grid>
    </>
  );
}

function DiscoverCard({ talent }: { talent: DiscoverTalent }) {
  const { openDrawer } = useProto();
  return (
    <button
      onClick={() => openDrawer("client-talent-card", { id: talent.id })}
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: "border-color .12s, box-shadow .12s",
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
          aspectRatio: "4 / 5",
          background: COLORS.cream,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 64,
        }}
      >
        {talent.thumb}
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink }}>{talent.name}</span>
          {talent.available ? (
            <span style={{ fontSize: 10.5, color: "#1F5C42", fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Available</span>
          ) : (
            <span style={{ fontSize: 10.5, color: COLORS.inkDim, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>On hold</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 3 }}>
          {talent.agency} · {talent.city} · {talent.height}
        </div>
      </div>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// SHORTLISTS
// ════════════════════════════════════════════════════════════════════

function ClientShortlistsPage() {
  const { openDrawer } = useProto();
  return (
    <>
      <PageHeader
        eyebrow="Shortlists"
        title="Saved selections"
        subtitle="Group talent by brief. Share with collaborators. Convert any shortlist into an inquiry."
        actions={
          <PrimaryButton onClick={() => openDrawer("client-new-shortlist")}>
            New shortlist
          </PrimaryButton>
        }
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
  const { openDrawer } = useProto();
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
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 18,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: -0.2,
          }}
        >
          {shortlist.name}
        </span>
        <StatDot tone={m.tone === "ink" ? "ink" : m.tone} size={8} />
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: COLORS.inkMuted }}>{shortlist.brief}</p>
      <div style={{ display: "flex", gap: 4 }}>
        {shortlist.thumbs.slice(0, 6).map((t, i) => (
          <span
            key={i}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: COLORS.cream,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            {t}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: COLORS.inkDim }}>
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
            letterSpacing: 0.4,
            textTransform: "uppercase",
            background:
              m.tone === "green"
                ? "rgba(46,125,91,0.10)"
                : m.tone === "amber"
                  ? "rgba(198,138,30,0.12)"
                  : "rgba(11,11,13,0.04)",
            color: m.tone === "green" ? "#1F5C42" : m.tone === "amber" ? "#7E5612" : COLORS.inkMuted,
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
  return (
    <>
      <PageHeader
        eyebrow="Bookings"
        title="Confirmed work"
        subtitle="Locked-in dates, talent, and contracts. Wraps and invoices live here."
      />
      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {CLIENT_BOOKINGS.map((b) => (
          <ClientBookingRow key={b.id} booking={b} />
        ))}
      </div>
    </>
  );
}

function ClientBookingRow({ booking }: { booking: ClientBooking }) {
  const { openDrawer } = useProto();
  const statusMeta: Record<
    ClientBooking["status"],
    { label: string; tone: "ink" | "amber" | "green" | "dim" }
  > = {
    confirmed: { label: "Confirmed", tone: "green" },
    "in-progress": { label: "In progress", tone: "ink" },
    wrapped: { label: "Wrapped", tone: "ink" },
    invoiced: { label: "Invoiced", tone: "dim" },
  };
  const postStatusMeta: Record<
    ClientBookingPostStatus,
    { label: string; tone: "green" | "amber" | "dim" }
  > = {
    "contract-pending": { label: "Contract pending", tone: "amber" },
    "contract-signed": { label: "Contract signed", tone: "dim" },
    "call-sheet-sent": { label: "Call sheet sent", tone: "green" },
    confirmed: { label: "Confirmed", tone: "green" },
    wrapped: { label: "Wrapped", tone: "dim" },
    "invoice-pending": { label: "Invoice pending", tone: "amber" },
    paid: { label: "Paid", tone: "green" },
  };
  const m = statusMeta[booking.status];
  const pm = postStatusMeta[booking.postStatus];
  return (
    <button
      onClick={() => openDrawer("client-booking-detail", { id: booking.id })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "14px 16px",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(11,11,13,0.02)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: COLORS.cream,
          flexShrink: 0,
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.ink, lineHeight: 1 }}>
          {booking.date.split(",")[0].split(" ").slice(-1)[0]}
        </span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>
          {booking.talent} · {booking.shortlistName}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
          {booking.location} · {booking.date}
        </div>
      </div>
      <span style={{ fontSize: 13, color: COLORS.ink, fontWeight: 600, flexShrink: 0 }}>{booking.amount}</span>
      <span
        style={{
          padding: "3px 9px",
          borderRadius: 999,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          background:
            m.tone === "green"
              ? "rgba(46,125,91,0.10)"
              : m.tone === "amber"
                ? "rgba(198,138,30,0.12)"
                : "rgba(11,11,13,0.04)",
          color: m.tone === "green" ? "#1F5C42" : m.tone === "amber" ? "#7E5612" : COLORS.inkMuted,
          flexShrink: 0,
        }}
      >
        {m.label}
      </span>
      {pm && (
        <span
          style={{
            padding: "3px 9px",
            borderRadius: 999,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            background:
              pm.tone === "green"
                ? "rgba(46,125,91,0.10)"
                : pm.tone === "amber"
                  ? "rgba(198,138,30,0.12)"
                  : "rgba(11,11,13,0.04)",
            color:
              pm.tone === "green"
                ? "#1F5C42"
                : pm.tone === "amber"
                  ? "#7E5612"
                  : COLORS.inkMuted,
            flexShrink: 0,
          }}
        >
          {pm.label}
        </span>
      )}
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════

function ClientSettingsPage() {
  const { openDrawer, state } = useProto();
  const planMeta = CLIENT_PLAN_META[state.clientPlan];
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Brand & team"
        subtitle="Where you manage who can see your inquiries, your billing, and your shared brand info."
      />
      <Grid cols="2">
        <PrimaryCard
          title={`${MY_CLIENT_BRAND.name}`}
          description={`${MY_CLIENT_BRAND.industry}. Switch brand context if you book under multiple companies.`}
          icon={<Icon name="user" size={14} stroke={1.7} />}
          affordance="Manage brand"
          onClick={() => openDrawer("client-brand-switcher")}
        />
        <PrimaryCard
          title={`${planMeta.label} plan`}
          description={`${planMeta.theme}. Currently ${planMeta.price}.`}
          icon={<Icon name="credit" size={14} stroke={1.7} />}
          affordance="Open billing"
          onClick={() => openDrawer("client-billing")}
        />
        <SecondaryCard
          title="Team & seats"
          description="Add collaborators (assistants, producers) so they can see inquiry threads."
          affordance="Open team"
          onClick={() => openDrawer("client-team")}
        />
        <SecondaryCard
          title="Contracts archive"
          description="Every signed booking contract, downloadable any time."
          affordance="Open contracts"
          onClick={() => openDrawer("client-contracts")}
        />
        <SecondaryCard
          title="Notifications"
          description="Where you get pinged when an offer arrives or talent confirms."
          affordance="Open settings"
          onClick={() => openDrawer("client-settings")}
        />
      </Grid>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Drawer bodies (client-side)
// ════════════════════════════════════════════════════════════════════

import { DrawerShell } from "./_primitives";

function useSaveAndClose(message = "Saved") {
  const { closeDrawer, toast } = useProto();
  return () => {
    toast(message);
    closeDrawer();
  };
}

function StandardFooter({ onSave, saveLabel = "Save changes" }: { onSave?: () => void; saveLabel?: string }) {
  const save = useSaveAndClose();
  const { closeDrawer } = useProto();
  return (
    <>
      <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
      <PrimaryButton onClick={onSave ?? save}>{saveLabel}</PrimaryButton>
    </>
  );
}

export function ClientTodayPulseDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
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
        <div style={{ padding: 30, textAlign: "center", color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 13 }}>
          You're caught up.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pendingDecisions.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                closeDrawer();
                openDrawer("inquiry-workspace", { inquiryId: i.id, pov: "client" });
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>{i.brief}</div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
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
  const { state, closeDrawer, openDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "client-talent-card";
  const id = state.drawer.payload?.id as string | undefined;
  const t = DISCOVER_TALENT.find((d) => d.id === id);
  if (!t) {
    return (
      <DrawerShell open={open} onClose={closeDrawer} title="Talent">
        <div style={{ color: COLORS.inkMuted }}>No talent selected.</div>
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
        <>
          <SecondaryButton onClick={() => toast(`Added ${t.name} to a shortlist`)}>Add to shortlist</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              closeDrawer();
              openDrawer("client-send-inquiry", { presetTalent: t.id });
            }}
          >
            Send inquiry
          </PrimaryButton>
        </>
      }
    >
      <div
        style={{
          aspectRatio: "4 / 5",
          background: COLORS.cream,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 96,
          marginBottom: 14,
        }}
      >
        {t.thumb}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
      <span style={{ width: 110, fontSize: 11.5, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 13, color: COLORS.ink }}>{value}</span>
    </div>
  );
}

export function ClientShortlistDetailDrawer() {
  const { state, closeDrawer, openDrawer, toast } = useProto();
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
            Send as inquiry
          </PrimaryButton>
        </>
      }
    >
      {/* Talent grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {sl.thumbs.map((t, i) => (
          <span
            key={i}
            style={{
              width: 60,
              height: 60,
              borderRadius: 10,
              background: COLORS.cream,
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
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 12.5,
          color: COLORS.inkMuted,
          marginTop: 8,
        }}
      >
        {sl.count} talent saved · tap any to swap, remove, or add a note.
      </div>

      {/* Agency comparison (C16) */}
      <Divider label="Agency track record" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{rel.agencyName}</span>
                <span style={{ fontSize: 11, color: COLORS.inkMuted }}>
                  {rel.bookingsCompleted} bookings with you
                </span>
              </div>
              {/* On-time bar */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 10.5, color: COLORS.inkMuted, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>On time</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#1F5C42" }}>{rel.onTimeRate}%</span>
                </div>
                <div style={{ height: 4, background: "rgba(11,11,13,0.06)", borderRadius: 999, overflow: "hidden" }}>
                  <div
                    style={{
                      width: barW,
                      height: "100%",
                      background: rel.onTimeRate === 100 ? "#2E7D5B" : rel.onTimeRate > 80 ? COLORS.ink : "#B0303A",
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
              {/* Stats row */}
              <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: COLORS.inkMuted }}>
                <span>
                  <span style={{ fontWeight: 600, color: rel.cancellations > 0 ? "#B0303A" : COLORS.ink }}>
                    {rel.cancellations}
                  </span>{" "}
                  cancellations
                </span>
                <span>
                  <span style={{ fontWeight: 600, color: COLORS.ink }}>{rel.repeatBookings}</span> repeat bookings
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
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "client-new-shortlist";
  const save = useSaveAndClose("Shortlist created");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="New shortlist"
      description="Group talent by brief, then send a single inquiry to all of them."
      footer={<StandardFooter onSave={save} saveLabel="Create shortlist" />}
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
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "client-share-shortlist";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Share shortlist"
      description="Anyone with the link can view the shortlist read-only."
      footer={
        <PrimaryButton onClick={() => { toast("Link copied"); closeDrawer(); }}>Copy link</PrimaryButton>
      }
    >
      <div
        style={{
          padding: 14,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          fontFamily: FONTS.mono,
          fontSize: 12,
          color: COLORS.ink,
          wordBreak: "break-all",
        }}
      >
        https://{MY_CLIENT_BRAND.name.toLowerCase().replace(/\s+/g, "-")}.tulala.digital/sl/abc123
      </div>
    </DrawerShell>
  );
}

export function ClientSendInquiryDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "client-send-inquiry";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Send inquiry"
      description="Your coordinator will reply within hours. They'll set up a private thread with you and a separate group thread with the booked talent."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Save draft</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              toast("Inquiry sent — coordinator will reply soon");
              closeDrawer();
            }}
          >
            Send
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        <FieldGroup label="Brief" defaultValue="Spring lookbook · 3 talent · 1 day" placeholder="" textarea />
        <FieldGroup label="Date" defaultValue="May 6, 2026" placeholder="" />
        <FieldGroup label="Location" defaultValue="Madrid · Estudio Roca" placeholder="" />
        <FieldGroup label="Budget" defaultValue="€2,500/day per talent" placeholder="" />
        <div
          style={{
            padding: 12,
            background: "rgba(46,125,91,0.06)",
            borderRadius: 10,
            border: `1px solid rgba(46,125,91,0.18)`,
            fontSize: 12.5,
            color: "#1F5C42",
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <Icon name="info" size={12} color="#1F5C42" />
          <span>
            You'll get a private thread with your assigned coordinator. The talent are added to a separate group
            thread that you don't see — that way the agency handles logistics with their roster.
          </span>
        </div>
      </div>
    </DrawerShell>
  );
}

function FieldGroup({ label, defaultValue, placeholder, textarea }: { label: string; defaultValue?: string; placeholder?: string; textarea?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: FONTS.body }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.inkMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </span>
      {textarea ? (
        <textarea
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={3}
          style={{
            padding: "9px 12px",
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 13.5,
            color: COLORS.ink,
            outline: "none",
            resize: "none",
            lineHeight: 1.55,
          }}
        />
      ) : (
        <input
          defaultValue={defaultValue}
          placeholder={placeholder}
          style={{
            padding: "9px 12px",
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 13.5,
            color: COLORS.ink,
            outline: "none",
          }}
        />
      )}
    </label>
  );
}

export function ClientInquiryDetailDrawer() {
  // Legacy fallback drawer for CLIENT_INQUIRIES (old draft inquiries that
  // pre-date RichInquiry adoption). Real inquiries open the InquiryWorkspaceDrawer.
  const { state, closeDrawer, openDrawer } = useProto();
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
      <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.6 }}>
        This is a legacy draft inquiry. Once sent, it converts to a Rich Inquiry with private + group threads.
      </div>
    </DrawerShell>
  );
}

export function ClientCounterOfferDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "client-counter-offer";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Counter offer"
      description="Send a counter-rate or new terms back to your coordinator."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Counter sent"); closeDrawer(); }}>Send counter</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        <FieldGroup label="Counter rate" defaultValue="€2,200/day" placeholder="" />
        <FieldGroup
          label="Note to coordinator"
          defaultValue="Budget is firm — can the agency hold rate within €2,200?"
          placeholder=""
          textarea
        />
      </div>
    </DrawerShell>
  );
}

export function ClientBookingDetailDrawer() {
  const { state, closeDrawer, openDrawer, toast } = useProto();
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <KvRow label="Talent" value={b.talent} />
        <KvRow label="Date" value={b.date} />
        <KvRow label="Location" value={b.location} />
        <KvRow label="Total" value={b.amount} />
        <KvRow label="Production" value={postStatusLabel[b.postStatus]} />
      </div>

      {/* C18 — Save to shortlist nudge */}
      {b.status === "confirmed" && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            background: COLORS.cream,
            border: `1px solid rgba(184,134,11,0.18)`,
            borderRadius: 10,
            fontFamily: FONTS.body,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, marginBottom: 4 }}>
            Save this lineup for next time?
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.55 }}>
            Add {b.talent} to a shortlist so you can re-book them quickly without starting from scratch.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <SecondaryButton
              size="sm"
              onClick={() => {
                toast(`${b.talent} added to shortlist`);
              }}
            >
              Add to shortlist
            </SecondaryButton>
            <GhostButton
              size="sm"
              onClick={() => {
                toast("Got it — you can always shortlist talent from the Discover page.");
              }}
            >
              Not now
            </GhostButton>
          </div>
        </div>
      )}
    </DrawerShell>
  );
}

export function ClientContractsDrawer() {
  const { state, closeDrawer } = useProto();
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
            <span style={{ flex: 1, color: COLORS.ink }}>
              {b.talent} · {b.shortlistName}
            </span>
            <span style={{ color: COLORS.inkMuted, fontSize: 11.5 }}>{b.date}</span>
            <a style={{ fontSize: 11.5, color: COLORS.ink, fontWeight: 500, textDecoration: "underline" }}>PDF</a>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

export function ClientTeamDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "client-team";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Team"
      description="Team members can see inquiry threads and bookings for this brand."
      footer={
        <PrimaryButton onClick={() => { toast("Invite sent"); closeDrawer(); }}>Invite member</PrimaryButton>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{m.email}</div>
            </div>
            <span
              style={{
                padding: "2px 8px",
                background: "rgba(11,11,13,0.04)",
                color: COLORS.ink,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                borderRadius: 999,
              }}
            >
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

export function ClientBillingDrawer() {
  const { state, closeDrawer, openUpgrade } = useProto();
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
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
          Plan
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 22,
            fontWeight: 500,
            color: COLORS.ink,
            marginTop: 4,
          }}
        >
          {planMeta.label} — {planMeta.price}
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginTop: 4 }}>{planMeta.theme}</div>
      </div>
    </DrawerShell>
  );
}

export function ClientBrandSwitcherDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "client-brand-switcher";
  const brands = [
    MY_CLIENT_BRAND,
    { id: "br2", name: "Net-a-Porter", initials: "NP", industry: "E-commerce · luxury" },
  ];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Switch brand"
      description="If you book under multiple brands, switch the brand context — inquiries and bookings filter accordingly."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {brands.map((b) => (
          <button
            key={b.id}
            onClick={() => { toast(`Switched to ${b.name}`); closeDrawer(); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: b.id === MY_CLIENT_BRAND.id ? COLORS.cream : "#fff",
              border: `1px solid ${b.id === MY_CLIENT_BRAND.id ? "rgba(184,134,11,0.18)" : COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
            }}
          >
            <Avatar initials={b.initials} size={36} tone="warm" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.ink }}>{b.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{b.industry}</div>
            </div>
            {b.id === MY_CLIENT_BRAND.id && (
              <span style={{ fontSize: 10.5, color: "#1F5C42", fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>
                Current
              </span>
            )}
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

export function ClientSavedSearchDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "client-saved-search";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Saved searches"
      description="Save complex filters and get notified when matching talent become available."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { name: "Madrid · 5'8\"+ · Available May", count: 12 },
          { name: "Acme Models — bridal", count: 4 },
        ].map((s, i) => (
          <button
            key={i}
            onClick={() => { toast(`Search "${s.name}" reopened`); closeDrawer(); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
            }}
          >
            <Icon name="search" size={14} color={COLORS.inkMuted} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{s.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{s.count} matches</div>
            </div>
            <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

export function ClientQuickQuestionDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "client-quick-question";
  const [selectedAgency, setSelectedAgency] = useState("Acme Models");
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Quick question"
      description="Send a message directly to an agency without starting a full inquiry pipeline."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              toast("Message sent — your coordinator will reply shortly");
              closeDrawer();
            }}
          >
            Send message
          </PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
        {/* Agency picker */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: COLORS.inkMuted,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            To agency
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Acme Models", "Praline London", "Maison Sud"].map((a) => {
              const active = selectedAgency === a;
              return (
                <button
                  key={a}
                  onClick={() => setSelectedAgency(a)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    background: active ? COLORS.ink : "rgba(11,11,13,0.04)",
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
        <div
          style={{
            padding: 11,
            background: "rgba(11,11,13,0.03)",
            borderRadius: 8,
            border: `1px solid ${COLORS.borderSoft}`,
            fontSize: 12.5,
            color: COLORS.inkMuted,
            lineHeight: 1.55,
          }}
        >
          This creates a lightweight thread — not a full inquiry. You can convert it to a
          full inquiry with a shortlist and offer at any time.
        </div>
      </div>
    </DrawerShell>
  );
}

export function ClientSettingsDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "client-settings";
  const save = useSaveAndClose();
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Notifications"
      description="Where you get pinged when an offer arrives or talent confirms."
      footer={<StandardFooter onSave={save} />}
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
            <span style={{ flex: 1, fontSize: 13, color: COLORS.ink }}>{r.label}</span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 999,
                background: r.on ? "rgba(46,125,91,0.10)" : "rgba(11,11,13,0.04)",
                color: r.on ? "#1F5C42" : COLORS.inkMuted,
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
