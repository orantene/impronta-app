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
}): TabDef[] {
  const { status, pov, unread = {}, offerNeedsAttention, paymentDue, planTier } = opts;

  // Slice B (Messages consolidation v2): admin pov gets the new
  // universal tab set per plan §3. Talent + client keep legacy tabs
  // until Slices C + D migrate them. The unread badges roll up across
  // both client + group threads onto the single Chat tab.
  if (pov === "admin") {
    const chatUnread = (unread.client ?? 0) + (unread.talent ?? 0);
    const adminTabs: TabDef[] = [
      {
        id: "chat",
        label: "Chat",
        state: "active",
        badge: chatUnread > 0 ? chatUnread : undefined,
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
        badge: paymentDue ? "€" : undefined,
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

  // Slice C (Messages consolidation v2): talent + talent_coord get
  // the universal tab set. Client + Group + DM live as sub-toggles
  // inside the Chat tab; for plain talent the Client sub-toggle
  // renders locked (Slice G adds the request-to-join flow). Booked-
  // stage payment surfaces via the offer chip + Event tab, not as a
  // standalone tab.
  if (pov === "talent" || pov === "talent_coord") {
    const chatUnread = unread.talent ?? 0;
    const talentTabs: TabDef[] = [
      {
        id: "chat",
        label: "Chat",
        state: "active",
        badge: chatUnread > 0 ? chatUnread : undefined,
      },
      {
        id: "lineup",
        label: "Lineup",
        state: "active",
      },
      {
        id: "offer",
        label: "Offer",
        state: "active",
        badge: offerNeedsAttention ? "!" : (status === "booked" && paymentDue ? "€" : undefined),
      },
      {
        id: "event",
        label: "Details",
        state: "active",
      },
      {
        id: "files",
        label: "Files",
        state: "active",
        badge: unread.files && unread.files > 0 ? unread.files : undefined,
      },
    ];
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
      badge: offerNeedsAttention ? "!" : (status === "booked" && paymentDue ? "€" : undefined),
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
