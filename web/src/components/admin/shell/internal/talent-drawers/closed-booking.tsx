"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/closed-booking — Phase 1d body chunk.
// Owns: TalentClosedBookingDrawer, TalentEarningsDetailDrawer.
// Private helpers: SourceChip, MOCK_CLOSED_DETAIL, netOf.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { COLORS, EARNINGS_ROWS, FONTS, useAdminShell } from "../state";
import {
  Avatar,
  Divider,
  DrawerShell,
  Icon,
  SecondaryButton,
} from "../primitives";
import { KvRow, SectionLabel } from "./shared";

// ─── Closed booking (read-only past-work archive) ────────────────────
// Opens when a talent clicks a row in "Recent earnings" on Today.
// Shows what the booking WAS — team, key facts, archived chat — so a
// talent can look back at past work without leaving Today. Read-only by
// design: this isn't a booking workflow, it's a portfolio entry.

export function TalentClosedBookingDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-closed-booking";
  const earningId = (state.drawer.payload?.earningId as string) ?? "e1";
  const e = EARNINGS_ROWS.find((x) => x.id === earningId) ?? EARNINGS_ROWS[0]!;
  const idx = EARNINGS_ROWS.findIndex((x) => x.id === earningId);
  const prev = idx > 0 ? EARNINGS_ROWS[idx - 1] : null;
  const next = idx < EARNINGS_ROWS.length - 1 ? EARNINGS_ROWS[idx + 1] : null;

  // Mock per-booking detail (in production, derived from the booking +
  // archived inquiry thread). Different shape per client to demonstrate
  // variety.
  const detail = MOCK_CLOSED_DETAIL[e.id] ?? MOCK_CLOSED_DETAIL.default!;

  // Repeat-client signal — count of bookings + lifetime earnings with
  // this client across all completed bookings. Surfaces "this is your
  // 5th gig with Vogue Italia" as a relationship signal.
  const sameClient = EARNINGS_ROWS.filter((x) => x.client === e.client);
  const lifetimeAmount = sameClient.reduce((sum, x) => {
    const num = parseFloat(x.amount.replace(/[^0-9.]/g, ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
  const currency = e.amount.match(/[€£$]/)?.[0] ?? "€";
  const lifetimeLabel = `${currency}${lifetimeAmount.toLocaleString()}`;
  const isRepeat = sameClient.length > 1;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${e.client} · ${detail.brief}`}
      description={interpolate(t("dashboard.talentDrawers.closedBooking.titleSuffix"), { workDate: e.workDate, payoutDate: e.payoutDate })}
      width={580}
      footer={
        <>
          <button
            type="button"
            onClick={() => prev && openDrawer("talent-closed-booking", { earningId: prev.id })}
            disabled={!prev}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 7,
              padding: "7px 11px",
              fontFamily: FONTS.body,
              fontSize: 12,
              color: prev ? COLORS.ink : COLORS.inkDim,
              cursor: prev ? "pointer" : "not-allowed",
            }}
          >
            ← {t("dashboard.talentDrawers.closedBooking.newer")}
          </button>
          <button
            type="button"
            onClick={() => next && openDrawer("talent-closed-booking", { earningId: next.id })}
            disabled={!next}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 7,
              padding: "7px 11px",
              fontFamily: FONTS.body,
              fontSize: 12,
              color: next ? COLORS.ink : COLORS.inkDim,
              cursor: next ? "pointer" : "not-allowed",
            }}
          >
            {t("dashboard.talentDrawers.closedBooking.older")} →
          </button>
          <div style={{ flex: 1 }} />
          <SecondaryButton onClick={() => openDrawer("talent-chat-archive")}>
            📄 {t("dashboard.talentDrawers.closedBooking.archiveThread")}
          </SecondaryButton>
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
        </>
      }
    >
      {/* Closed/archived banner — visual cue that this is read-only. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "rgba(11,11,13,0.04)",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 8,
          marginBottom: 12,
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.inkMuted,
        }}
      >
        <Icon name="lock" size={12} stroke={1.7} />
        <span>{interpolate(t("dashboard.talentDrawers.closedBooking.archivedBanner"), { payoutDate: e.payoutDate })}</span>
        <span style={{ marginLeft: "auto", fontWeight: 600 }} className="text-admin-ink">
          {e.amount}
        </span>
      </div>

      {/* Source attribution — answers "where did this booking come from?"
          The chip + optional "you brought" pill teach the talent the value
          of each distribution channel over time. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          fontFamily: FONTS.body,
          fontSize: 11.5,
        }}
      >
        <SourceChip source={e.source} />
        {e.broughtTeam && e.team && e.team.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, fontWeight: 600, fontSize: 11 }} className="bg-admin-coral-soft text-admin-coral-deep">
            <Icon name="user" size={10} stroke={1.8} />
            {interpolate(t("dashboard.talentDrawers.closedBooking.youBrought"), { names: e.team.join(", ") })}
          </span>
        )}
        {!e.team || e.team.length === 0 ? (
          <span style={{ padding: "3px 8px", borderRadius: 999, background: "rgba(11,11,13,0.05)", fontWeight: 500, fontSize: 11 }} className="text-admin-ink-muted">
            {t("dashboard.talentDrawers.closedBooking.solo")}
          </span>
        ) : null}
      </div>

      {/* Repeat-client signal — only shows for clients with > 1 booking.
          Sage tone to mark a relationship; meaningful info for a talent
          looking back at career history. */}
      {isRepeat && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: "rgba(46,125,91,0.08)",
            border: `1px solid rgba(46,125,91,0.18)`,
            borderRadius: 8,
            marginBottom: 16,
            fontFamily: FONTS.body,
            fontSize: 12.5,
          }}
        >
          <Icon name="check" size={12} stroke={1.7} color={COLORS.green} />
          <span style={{ fontWeight: 500 }} className="text-admin-success-deep">
            {interpolate(t("dashboard.talentDrawers.closedBooking.repeatSignal"), { count: sameClient.length, client: e.client, amount: lifetimeLabel })}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Booking facts */}
        <section>
          <SectionLabel>{t("dashboard.talentDrawers.closedBooking.sectionBooking")}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <KvRow label={t("dashboard.talentDrawers.closedBooking.labelDateWorked")} value={e.workDate} />
            <KvRow label={t("dashboard.talentDrawers.closedBooking.labelLocation")} value={detail.location} />
            <KvRow label={t("dashboard.talentDrawers.closedBooking.labelCallTime")} value={detail.call} />
            <KvRow label={t("dashboard.talentDrawers.closedBooking.labelAgency")} value={e.agency} />
            <KvRow label={t("dashboard.talentDrawers.closedBooking.labelFeePaid")} value={e.amount} />
          </div>
        </section>

        {/* Team — who else was on the booking */}
        <section>
          <SectionLabel>{t("dashboard.talentDrawers.closedBooking.sectionWhoWasThere")}</SectionLabel>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              marginTop: 8,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {detail.team.map((p, i) => (
              <div
                key={p.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                }}
              >
                <Avatar
                  size={28}
                  tone="auto"
                  hashSeed={p.name}
                  initials={p.name
                    .split(/\s+/)
                    .map((w) => w.charAt(0))
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                />
                <div className="flex-1 min-w-0">
                  <div style={{ fontWeight: 500 }} className="text-admin-ink">{p.name}</div>
                  <div className="text-admin-ink-muted text-admin-11">{p.role}</div>
                </div>
                {p.you && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", padding: "2px 7px", borderRadius: 999 }} className="bg-admin-coral-soft text-admin-coral-deep">
                    {t("dashboard.talentDrawers.closedBooking.you")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Chat archive — read-only snapshot */}
        <section>
          <SectionLabel>{t("dashboard.talentDrawers.closedBooking.sectionArchivedChat")}</SectionLabel>
          <div style={{ marginTop: 8, padding: "12px 14px", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 12, fontFamily: FONTS.body, fontSize: 12.5 }} className="bg-admin-surface-alt">
            {detail.chat.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11 }} className="text-admin-ink-muted">
                  <span style={{ fontWeight: 600 }} className="text-admin-ink">{m.from}</span>
                  <span className="text-admin-ink-dim">· {m.when}</span>
                </div>
                <div style={{ lineHeight: 1.5 }} className="text-admin-ink">{m.body}</div>
              </div>
            ))}
            <div style={{ marginTop: 4, paddingTop: 10, borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 11, textAlign: "center" }} className="text-admin-ink-dim">
              {interpolate(t("dashboard.talentDrawers.closedBooking.threadClosedNote"), { count: detail.chat.length })}
            </div>
          </div>
        </section>

        {/* What was delivered */}
        {detail.delivered && (
          <section>
            <SectionLabel>{t("dashboard.talentDrawers.closedBooking.sectionDelivered")}</SectionLabel>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.7 }} className="text-admin-ink">
              {detail.delivered.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Client review — when present. Sage soft surface + 5-star rating
            + quoted feedback. Builds the talent's portfolio of validation
            over time. */}

        {/* Contract section intentionally not rendered: signed-PDF retrieval
            from booking_contracts is not wired yet, so a download row here would
            be a fake CTA. Re-add when contracts are stored + fetchable. */}

        {detail.review && (
          <section>
            <SectionLabel>{t("dashboard.talentDrawers.closedBooking.sectionClientReview")}</SectionLabel>
            <div
              style={{
                marginTop: 8,
                padding: "12px 14px",
                background: "rgba(46,125,91,0.06)",
                border: `1px solid rgba(46,125,91,0.16)`,
                borderRadius: 10,
                fontFamily: FONTS.body,
                fontSize: 12.5,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 13, letterSpacing: 1 }} className="text-admin-green">
                  {"★".repeat(detail.review.rating)}
                  <span style={{ opacity: 0.6 }} className="text-admin-ink-dim">
                    {"★".repeat(5 - detail.review.rating)}
                  </span>
                </span>
                <span className="text-admin-ink-muted text-admin-11h">
                  {detail.review.author}
                </span>
              </div>
              <div style={{ lineHeight: 1.6, fontStyle: "italic" }} className="text-admin-ink">
                &quot;{detail.review.body}&quot;
              </div>
            </div>
          </section>
        )}
      </div>
    </DrawerShell>
  );
}

/**
 * Source chip in the closed-booking drawer header. Tone-coded by kind so
 * the talent learns where each booking came from at a glance:
 *   agency      slate    standard agency-routed
 *   hub         indigo   Tulala Hub or external aggregator
 *   personal    royal    talent's premium personal page (Pro+)
 *   studio      sage     studio / free-book partner
 *   marketplace amber    open marketplace
 */
function SourceChip({ source }: { source: import("../state").EarningSource }) {
  const t = useT();
  const labelFor = (s: typeof source) => {
    switch (s.kind) {
      case "agency":
        return t("dashboard.talentDrawers.sources.agency");
      case "hub":
        return interpolate(t("dashboard.talentDrawers.sources.via"), { name: s.name });
      case "personal":
        return t("dashboard.talentDrawers.sources.personal");
      case "studio":
        return interpolate(t("dashboard.talentDrawers.sources.via"), { name: s.name });
      case "marketplace":
        return interpolate(t("dashboard.talentDrawers.sources.via"), { name: s.name });
      case "manual":
        return t("dashboard.talentDrawers.sources.manual");
    }
  };
  const palette: Record<typeof source.kind, { bg: string; fg: string }> = {
    agency: { bg: COLORS.amberSoft, fg: COLORS.amberDeep },
    hub: { bg: COLORS.indigoSoft, fg: COLORS.indigoDeep },
    personal: { bg: COLORS.royalSoft, fg: COLORS.royalDeep },
    studio: { bg: COLORS.successSoft, fg: COLORS.successDeep },
    marketplace: { bg: COLORS.amberSoft, fg: COLORS.amberDeep },
    manual: { bg: COLORS.coralSoft, fg: COLORS.coralDeep },
  };
  const c = palette[source.kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: -0.05,
      }}
    >
      {labelFor(source)}
    </span>
  );
}

// Mock chat + team per closed booking. Three distinct shapes to show the
// drawer renders differently based on what actually happened on each job.
const MOCK_CLOSED_DETAIL: Record<
  string,
  {
    brief: string;
    location: string;
    call: string;
    team: { name: string; role: string; you?: boolean }[];
    chat: { from: string; when: string; body: string }[];
    delivered?: string[];
    review?: { author: string; rating: number; body: string };
  }
> = {
  e1: {
    brief: "Spring campaign · 1 day",
    location: "Madrid · ESTUDIO ROCA",
    call: "08:30 — 18:00",
    team: [
      { name: "Marta Reyes", role: "Talent · lead", you: true },
      { name: "Tomás Navarro", role: "Talent" },
      { name: "Inés López", role: "Producer · Zara" },
      { name: "Lia Roca", role: "Stylist" },
      { name: "Studio Roca", role: "Photographer" },
      { name: "Ana Vega", role: "Coordinator · Acme Models" },
    ],
    chat: [
      {
        from: "Ana Vega",
        when: "Mar 22 · 10:14",
        body: "Zara spring campaign confirmed for Mar 28. Marta + Tomás on lead, Studio Roca shooting.",
      },
      {
        from: "Marta",
        when: "Mar 22 · 10:31",
        body: "Confirmed. Will bring nude underwear + neutrals as briefed.",
      },
      {
        from: "Inés López",
        when: "Mar 27 · 17:02",
        body: "Reminder — call time 08:30 sharp. Coffee from 08:15. Forecast says light rain so we're going indoors only.",
      },
      {
        from: "Marta",
        when: "Mar 28 · 19:48",
        body: "Wrapped. Great energy on set, thanks all 🙏",
      },
    ],
    delivered: ["12 looks · Zara spring campaign", "Hero image (selected by client)"],
    review: {
      author: "Inés López · Producer · Zara",
      rating: 5,
      body: "Marta is a complete pro — on time, prepared, and sets the tone for the whole crew. We'll book her again for the autumn campaign.",
    },
  },
  e2: {
    brief: "Editorial · spring/summer campaign",
    location: "London · Studio 2C",
    call: "07:00 — 16:30",
    team: [
      { name: "Marta Reyes", role: "Talent · solo", you: true },
      { name: "James Hart", role: "Producer · Burberry" },
      { name: "Olive Carter", role: "Stylist" },
      { name: "Praline London", role: "Coordinator" },
    ],
    chat: [
      {
        from: "Praline London",
        when: "Mar 5 · 09:20",
        body: "Burberry editorial confirmed for Mar 10. Solo booking, you're carrying the campaign.",
      },
      {
        from: "Marta",
        when: "Mar 5 · 09:42",
        body: "Confirmed. Travel to London Mar 9, Studio 2C call at 07:00.",
      },
      {
        from: "James Hart",
        when: "Mar 10 · 18:11",
        body: "Brilliant work today, Marta. We'll send selects within two weeks.",
      },
    ],
    delivered: ["8 final selects · Burberry SS editorial", "Behind-the-scenes carousel"],
  },
  e3: {
    brief: "Editorial spread · 2 day shoot",
    location: "Milan · Studio 5",
    call: "07:00 — 19:00",
    team: [
      { name: "Marta Reyes", role: "Talent", you: true },
      { name: "Lina Park", role: "Talent" },
      { name: "Paolo Bianchi", role: "Photographer · Vogue Italia" },
      { name: "Ana Vega", role: "Coordinator · Acme Models" },
    ],
    chat: [
      {
        from: "Ana Vega",
        when: "Feb 24 · 14:30",
        body: "Vogue Italia editorial confirmed Mar 1–2 in Milan. You + Lina Park.",
      },
      {
        from: "Marta",
        when: "Feb 24 · 14:51",
        body: "Confirmed. Booking flights for Feb 29.",
      },
      {
        from: "Paolo Bianchi",
        when: "Mar 2 · 21:15",
        body: "Grazie a tutte. Pages will run in the May issue.",
      },
    ],
    delivered: ["8-page editorial spread (May issue)", "Cover try"],
    review: {
      author: "Paolo Bianchi · Photographer",
      rating: 5,
      body: "Una pleasure assoluta. Marta brought presence and patience to a difficult two-day shoot. Highly recommended.",
    },
  },
  // Solo gig sourced via Tulala Hub. Demonstrates a non-agency channel
  // delivering paid work — the kind of booking that would be invisible
  // before the Hub became a distribution surface.
  e6: {
    brief: "Brand campaign · 1 day",
    location: "Berlin · Studio Mitte",
    call: "09:00 — 17:00",
    team: [
      { name: "Marta Reyes", role: "Talent · solo", you: true },
      { name: "Hanna Berg", role: "Producer · Bumble" },
      { name: "Studio Mitte", role: "Photographer" },
    ],
    chat: [
      {
        from: "Tulala Hub",
        when: "Mar 30 · 11:24",
        body: "Bumble forwarded an inquiry for you via the Tulala Hub. Solo, 1 day in Berlin Apr 5.",
      },
      {
        from: "Marta",
        when: "Mar 30 · 11:48",
        body: "Confirmed. I'll travel up Apr 4.",
      },
      {
        from: "Hanna Berg",
        when: "Apr 5 · 17:32",
        body: "Wrap. Selects in 10 days, payout via Tulala Hub.",
      },
    ],
    delivered: ["6 final selects · spring brand campaign"],
  },

  // Personal-page gig where Marta brought her friend Carla as the second
  // talent. Marta acted as de-facto coordinator. Demonstrates the
  // talent-as-coordinator path that exists when distribution comes
  // through her own premium page.
  e7: {
    brief: "Capsule editorial · 2 talent · 1 day",
    location: "Madrid · ESTUDIO ROCA",
    call: "08:00 — 18:00",
    team: [
      { name: "Marta Reyes", role: "Talent · brought the team", you: true },
      { name: "Carla Vega", role: "Talent · brought by Marta" },
      { name: "Loewe team", role: "Producer · Loewe" },
      { name: "Studio Roca", role: "Photographer" },
    ],
    chat: [
      {
        from: "Loewe",
        when: "Apr 1 · 09:12",
        body: "Hi Marta — found you via your page. We need two talent for a capsule day on Apr 12. Can you bring a second?",
      },
      {
        from: "Marta",
        when: "Apr 1 · 09:34",
        body: "Yes — Carla Vega works well with me. Sending her details now. Day rate €1,800/talent · €3,600 total.",
      },
      {
        from: "Loewe",
        when: "Apr 1 · 10:02",
        body: "Approved. See you both Apr 12.",
      },
      {
        from: "Marta",
        when: "Apr 12 · 18:47",
        body: "Wrapped. Carla and I had a great day. Gracias 🙏",
      },
    ],
    delivered: [
      "8-look capsule editorial · 2 talent",
      "Hero campaign image · selected by client",
    ],
  },

  default: {
    brief: "Closed booking",
    location: "—",
    call: "—",
    team: [{ name: "Marta Reyes", role: "Talent", you: true }],
    chat: [],
  },
};

// ─── Earnings detail ────────────────────────────────────────────

export function TalentEarningsDetailDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-earnings-detail";
  const id = (state.drawer.payload?.id as string) ?? "e1";
  const e = EARNINGS_ROWS.find((x) => x.id === id) ?? EARNINGS_ROWS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`${e.client} · ${e.amount}`}
      description={interpolate(t("dashboard.talentDrawers.closedBooking.earningsPaidVia"), { payoutDate: e.payoutDate, agency: e.agency })}
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>}
    >
      <div className="flex flex-col gap-3.5">
        <KvRow label={t("dashboard.talentDrawers.closedBooking.labelDateWorked")} value={e.workDate} />
        <KvRow label={t("dashboard.talentDrawers.closedBooking.labelPaidOn")} value={e.payoutDate} />
        <KvRow label={t("dashboard.talentDrawers.closedBooking.labelAgency")} value={e.agency} />
        <KvRow label={t("dashboard.talentDrawers.closedBooking.labelClient")} value={e.client} />
        <KvRow label={t("dashboard.talentDrawers.closedBooking.labelGross")} value={e.amount} />
        <KvRow label={t("dashboard.talentDrawers.closedBooking.labelAgencyCut")} value="20%" />
        <KvRow label={t("dashboard.talentDrawers.closedBooking.labelNetToYou")} value={netOf(e.amount)} />
        <Divider label={t("dashboard.talentDrawers.closedBooking.documents")} />
        <button style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, fontFamily: FONTS.body, fontSize: 13, cursor: "pointer", textAlign: "left", width: "100%" }} className="text-admin-ink">
          <Icon name="external" size={13} />
          {t("dashboard.talentDrawers.closedBooking.bookingContract")}
          <span style={{ marginLeft: "auto", fontSize: 11.5 }} className="text-admin-ink-muted">{interpolate(t("dashboard.talentDrawers.closedBooking.pages"), { count: 2 })}</span>
        </button>
        <button style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, fontFamily: FONTS.body, fontSize: 13, cursor: "pointer", textAlign: "left", width: "100%" }} className="text-admin-ink">
          <Icon name="external" size={13} />
          {t("dashboard.talentDrawers.closedBooking.payoutStatement")}
          <span style={{ marginLeft: "auto", fontSize: 11.5 }} className="text-admin-ink-muted">{interpolate(t("dashboard.talentDrawers.closedBooking.page"), { count: 1 })}</span>
        </button>
      </div>
    </DrawerShell>
  );
}

function netOf(gross: string): string {
  const num = parseFloat(gross.replace(/[^0-9.]/g, "")) || 0;
  const symbol = gross.match(/[^0-9.,\s]/)?.[0] ?? "€";
  return `${symbol}${Math.round(num * 0.8).toLocaleString()}`;
}
