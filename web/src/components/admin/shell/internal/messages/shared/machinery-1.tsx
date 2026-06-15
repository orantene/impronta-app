import { ReservationThread } from "@/components/reservation-thread";
import { RICH_INQUIRIES, toInquiry, type InquiryRecord, type RichInquiry, type InquiryTalentInvite } from "../../state";
import { type Conversation, type Participant } from "../../talent";
import type { TabDef } from "./machinery-8";
import type { Offer } from "./machinery-9";


// ════════════════════════════════════════════════════════════════════
// Shared TAB SYSTEM — shipped to talent + client per the spec.
// (Admin already has its own tab implementation inside WorkspaceBody.)
// ════════════════════════════════════════════════════════════════════

/**
 * Map an ISO currency code to its symbol for the compact tab badge glyph.
 * Falls back to a neutral dot when the code is unknown or absent — so a
 * USD/GBP offer never renders a hardcoded "€". Uses Intl when available,
 * with a small explicit map for the common cases.
 */
function currencySymbol(code: string | undefined): string {
  if (!code) return "•";
  const explicit: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "$",
    CAD: "$", CHF: "CHF", MXN: "$", BRL: "R$", INR: "₹",
  };
  const upper = code.toUpperCase();
  if (explicit[upper]) return explicit[upper];
  try {
    // Derive the symbol by formatting 0 and stripping digits/spaces.
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: upper,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value;
    return sym && sym.length <= 3 ? sym : "•";
  } catch {
    return "•";
  }
}

/**
 * Build the tab config for the inquiry shell.
 *
 * Same shell, evolved tabs as the record moves through its lifecycle:
 *   - inquiry / coordinating / offer:  client · talent · offer · files · details
 *   - booked / wrapped:                client · talent · logistics · files · payment · details
 *
 * Pov drives lock states (a non-coord talent can't see the client thread,
 * a client can't see the talent group). Booking-stage tabs surface only
 * once the inquiry has converted.
 */
export function buildInquiryTabs(opts: {
  status: "inquiry" | "booked";
  pov: "admin" | "client" | "talent_coord" | "talent";
  unread?: { client?: number; talent?: number; files?: number };
  offerNeedsAttention?: boolean;
  paymentDue?: boolean;
  /** Workspace plan tier — hides team-only surfaces on Free
   *  (no team to coordinate with). Admin-only. */
  planTier?: "free" | "studio" | "agency" | "hub-network" | "network";
  /** ISO currency code of the inquiry/offer (e.g. "USD", "EUR", "GBP").
   *  Drives the payment-due glyph on the Offer tab so it isn't hardcoded
   *  to "€" for non-euro deals. Optional — falls back to a neutral dot. */
  currencyCode?: string;
  /** Surface the admin-only Payment tab. True once payment is relevant —
   *  i.e. the inquiry is approved/booked/converted (a booking exists or is
   *  imminent) so admin can request payment / track status / initiate
   *  payout from the thread instead of leaving to /admin/work. Admin pov
   *  only; client + talent have their own money surfaces. */
  paymentRelevant?: boolean;
  /** F2 — real role='talent' headcount on this inquiry. Gates the Group
   *  tab (the booking-team coordination channel): it only surfaces when
   *  there are ≥2 talents (this talent + ≥1 other). A sole-talent inquiry
   *  has no team to coordinate, so the Group tab is suppressed and the
   *  talent anchors on Client (F1) / Activity instead. Talent pov only. */
  lineupTotal?: number;
}): TabDef[] {
  const { status, pov, unread = {}, offerNeedsAttention, paymentDue, planTier, currencyCode, paymentRelevant, lineupTotal } = opts;

  // Currency-aware payment-due glyph. Never hardcode "€": derive the symbol
  // from the inquiry's currency; if none is supplied, use a neutral dot so a
  // USD/GBP offer never shows a euro sign.
  const payDueGlyph = currencySymbol(currencyCode);

  // Slice B (Messages consolidation v2): admin pov gets the new
  // universal tab set per plan §3. Talent + client keep legacy tabs
  // until Slices C + D migrate them. The unread badges roll up across
  // both client + group threads onto the single Chat tab.
  if (pov === "admin") {
    // Match the talent tab row: flatten the single "Chat" tab (which used a
    // floating sub-toggle) into three native top-level tabs —
    // Client · Group · Activity — exactly like the talent shell (F2). Same
    // ThreadTabBar primitive, same tokens; admin now reads as one clean tab
    // row instead of a tab + a frosted overlay pill.
    const adminTabs: TabDef[] = [
      {
        id: "client",
        label: "Client",
        state: "active",
        badge: unread.client && unread.client > 0 ? unread.client : undefined,
      },
      {
        id: "talent",
        label: "Group",
        state: "active",
        badge: unread.talent && unread.talent > 0 ? unread.talent : undefined,
      },
      {
        id: "activity",
        label: "Activity",
        state: "active",
      },
      {
        id: "lineup",
        label: "Lineup",
        state: "active",
      },
    ];
    if (status === "inquiry") {
      adminTabs.push({
        id: "offer",
        label: "Offer",
        state: "active",
        badge: offerNeedsAttention ? "!" : undefined,
      });
    } else if (status === "booked") {
      adminTabs.push({
        id: "offer",
        label: "Offer",
        state: "active",
        badge: paymentDue ? payDueGlyph : undefined,
      });
    }
    // Admin-only Payment tab — request payment / track status / initiate
    // payout right inside the thread, no detour to /admin/work. Surfaces
    // only once payment is relevant (approved/booked/converted). The
    // PaymentTab body (machinery-6) loads real payment state + renders the
    // admin money actions.
    if (paymentRelevant) {
      adminTabs.push({
        id: "payment",
        label: "Payment",
        state: "active",
        badge: status === "booked" && paymentDue ? payDueGlyph : undefined,
      });
    }
    adminTabs.push({
      id: "event",
      label: "Details",
      state: "active",
    });
    adminTabs.push({
      id: "files",
      label: "Files",
      state: "active",
      badge: unread.files && unread.files > 0 ? unread.files : undefined,
    });
    // Free-tier still hides nothing here — chat sub-toggle handles
    // it: solo workspaces just don't render the Group sub-thread.
    void planTier;
    return adminTabs;
  }

  // F2 (Messages consolidation v2): talent + talent_coord get the
  // flattened tab row — the old Chat tab's [Client | Group | Activity]
  // sub-toggle is promoted to three TOP-LEVEL tabs:
  //   Client · Group · Activity · Lineup · Offer · Details · Files
  //
  // • Client  — the private/client thread. Surfaces ONLY for
  //   talent_coord (the materialized canSeeClientThread gate: a
  //   coordinator participant row on this inquiry). A plain lineup
  //   talent never holds that row, so the tab is omitted entirely —
  //   no empty/locked tab, matching the server read gate exactly.
  // • Group   — the booking-team coordination channel. Surfaces ONLY
  //   when lineupTotal >= 2 (this talent + ≥1 other). A sole-talent
  //   inquiry has no team to coordinate; F1 anchors them on Client.
  // • Activity — read-only money/booking timeline (group thread,
  //   activity mode). Always present.
  //
  // Booked-stage payment surfaces via the offer chip + Details tab,
  // not as a standalone tab.
  if (pov === "talent" || pov === "talent_coord") {
    const chatUnread = unread.talent ?? 0;
    const isCoord = pov === "talent_coord";
    // Group is the team-coordination channel — only meaningful with ≥2
    // talents. undefined lineupTotal (count not yet resolved) defaults
    // to showing it, since Group has always been the talent's primary
    // channel; we only HIDE it on a confirmed sole-talent inquiry.
    const showGroup = lineupTotal === undefined || lineupTotal >= 2;
    const talentTabs: TabDef[] = [];
    if (isCoord) {
      talentTabs.push({
        id: "client",
        label: "Client",
        state: "active",
        badge: unread.client && unread.client > 0 ? unread.client : undefined,
      });
    }
    if (showGroup) {
      talentTabs.push({
        id: "group",
        label: "Group",
        state: "active",
        badge: chatUnread > 0 ? chatUnread : undefined,
      });
    }
    talentTabs.push({
      id: "activity",
      label: "Activity",
      state: "active",
    });
    talentTabs.push({
      id: "lineup",
      label: "Lineup",
      state: "active",
    });
    talentTabs.push({
      id: "offer",
      label: "Offer",
      state: "active",
      badge: offerNeedsAttention ? "!" : (status === "booked" && paymentDue ? payDueGlyph : undefined),
    });
    // WS4 — Booking/Payment tab for the appointed inquiry coordinator only,
    // once a booking exists. Plain talents never get it (they have their own
    // take-home surface). isCoord is defined above; paymentRelevant from opts.
    if (isCoord && paymentRelevant) {
      talentTabs.push({
        id: "payment",
        label: "Booking",
        state: "active",
        badge: status === "booked" && paymentDue ? payDueGlyph : undefined,
      });
    }
    talentTabs.push({
      id: "event",
      label: "Details",
      state: "active",
    });
    talentTabs.push({
      id: "files",
      label: "Files",
      state: "active",
      badge: unread.files && unread.files > 0 ? unread.files : undefined,
    });
    return talentTabs;
  }

  // ── Fallback (client pov) ────────────────────────────────────
  // The actual client surface uses ClientThreadAdapter + the
  // <ReservationThread> primitive directly (no tab dispatch via this
  // builder). This fallback emits the v2 vocabulary if a client-pov
  // caller ever lands here so labels are consistent.
  void planTier;
  return [
    {
      id: "chat",
      label: "Chat",
      state: "active",
      badge: unread.client && unread.client > 0 ? unread.client : undefined,
    },
    { id: "lineup", label: "Lineup", state: "active" },
    {
      id: "offer",
      label: "Offer",
      state: "active",
      badge: offerNeedsAttention ? "!" : (status === "booked" && paymentDue ? payDueGlyph : undefined),
    },
    { id: "event", label: "Details", state: "active" },
    {
      id: "files",
      label: "Files",
      state: "active",
      badge: unread.files && unread.files > 0 ? unread.files : undefined,
    },
  ];
}

// Conversation → InquiryRecord adapter. Talent/client shells consume
// `Conversation`, but the new shared shell components consume the
// canonical `InquiryRecord`. This bridges the two while we retire
// Conversation in a future pass.
// Photo lookup for talents that appear in synthesized inquiries
// (c4 / c5 / c6 / c7 / c8 / c9 / c10 — anywhere convToInquiry can't
// hit RICH_INQUIRIES). Explicit map for named talents in the
// prototype, deterministic pravatar fallback otherwise so the UI
// never renders bare initials.
export const TALENT_PHOTO_BY_NAME: Record<string, string> = {
  "Marta Reyes":     "https://i.pravatar.cc/200?img=5",
  "Lucia Ortiz":     "https://i.pravatar.cc/200?img=47",
  "Camille Roux":    "https://i.pravatar.cc/200?img=44",
  "Marco Vasquez":   "https://i.pravatar.cc/200?img=33",
  "Sofia Herrera":   "https://i.pravatar.cc/200?img=49",
  "Emma Ricci":      "https://i.pravatar.cc/200?img=20",
  "Tomás Navarro":   "https://i.pravatar.cc/200?img=12",
  "Lina Park":       "https://i.pravatar.cc/200?img=30",
  "Kai Lin":         "https://i.pravatar.cc/200?img=14",
  "Yael Soto":       "https://i.pravatar.cc/200?img=23",
  "Cleo Vega":       "https://i.pravatar.cc/200?img=45",
  "Tariq Joubert":   "https://i.pravatar.cc/200?img=68",
  "Anouk Naseri":    "https://i.pravatar.cc/200?img=43",
  "Nadia Köhler":    "https://i.pravatar.cc/200?img=48",
  "Zara Habib":      "https://i.pravatar.cc/200?img=36",
  "Hana Matsumoto":  "https://i.pravatar.cc/200?img=39",
  "Riku Vesa":       "https://i.pravatar.cc/200?img=11",
  "Sofia Andrade":   "https://i.pravatar.cc/200?img=25",
  "Diego Álvarez":   "https://i.pravatar.cc/200?img=8",
};
export function photoForTalent(name: string): string | undefined {
  if (TALENT_PHOTO_BY_NAME[name]) return TALENT_PHOTO_BY_NAME[name];
  // Deterministic fallback — hash the name to one of pravatar's
  // 70 portraits. Same name always picks the same face.
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return `https://i.pravatar.cc/200?img=${(h % 70) + 1}`;
}

export function convToInquiry(conv: Conversation): InquiryRecord {
  // Try the matching RichInquiry first (richer data); fall back to a
  // synthesized record from the Conversation alone.
  const matchingRich = RICH_INQUIRIES.find(r =>
    r.clientName.toLowerCase().includes(conv.client.toLowerCase()) ||
    conv.client.toLowerCase().includes(r.clientName.toLowerCase())
  );
  if (matchingRich) return toInquiry(matchingRich);

  const status: import("../../state").InquiryStatus =
      conv.stage === "booked" ? "booked"
    : conv.stage === "past" ? "wrapped"
    : conv.stage === "cancelled" ? "cancelled"
    : conv.stage === "hold" ? "coordinating"
    : "submitted";

  // Derive talent lineup from the conv's participants (anyone marked
  // isTalent). Map Conversation.Participant → InquiryRecord.talent.
  // Status defaults to "accepted" — production has a real workflow but
  // the fallback path is for jobs without rich inquiry data, where we
  // assume the talent is on the lineup if they're listed at all.
  const derivedTalent = (conv.participants ?? [])
    .filter(p => p.isTalent)
    .map(p => ({
      talentId: `t-${p.name.toLowerCase().replace(/\s+/g, "-")}`,
      name: p.name,
      initials: p.initials,
      photoUrl: photoForTalent(p.name),
      // "accepted" was the legacy value — the canonical InquiryTalentInvite
      // union is invited/declined/hold/confirmed/selected/withdrawn.
      // "confirmed" is the closest semantic match for an on-lineup talent.
      state: "confirmed" as const,
    }));

  return {
    id: conv.id,
    source: { kind: "agency_referral" },
    status,
    createdBy: { id: conv.client, name: conv.client },
    createdAt: `${conv.lastMessage.ageHrs}h ago`,
    title: conv.brief,
    client: { id: conv.client.toLowerCase().replace(/\s+/g, "-"), name: conv.client },
    coordinators: conv.leader ? [{
      id: conv.leader.name.toLowerCase().replace(/\s+/g, "-"),
      name: conv.leader.name,
      initials: conv.leader.initials,
      role: "coordinator",
    }] : [],
    talent: derivedTalent,
    schedule: { start: conv.date ?? "TBC" },
    location: conv.location
      ? { mode: "on_site", city: conv.location.split(" · ")[0], venue: conv.location.split(" · ")[1] }
      : { mode: "tbc" },
    brief: { summary: conv.brief, files: [] },
    threads: { client: `${conv.id}:client`, talentGroup: `${conv.id}:talent` },
    timeline: [],
  };
}
