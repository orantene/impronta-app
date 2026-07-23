"use client";

import { useState, useEffect } from "react";
import { loadInquiryLineup, type InquiryParticipant } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { COLORS, useAdminShell, type RichInquiry, type InquiryTalentInvite } from "../../state";
import { getEffectiveOffer } from "../conversation-stash";
import { currentTalentId } from "../messages-shared";
import { OfferTab } from "./machinery-12";
import type { LineupRow, Offer, OfferStage, UnitType } from "./machinery-9";


export const MOCK_OFFER_FOR_CONV: Record<string, Offer> = {
  c1: {
    conversationId: "c1",
    stage: "coordinator_review",
    clientBudget: { amount: 2500, unitType: "day", currency: "EUR", note: "Cap per talent · negotiable on usage" },
    agencyFee: 600,
    coordinatorPct: 50,
    expiresInHours: 24,
    coordinators: [
      { id: "co-sara", name: "Sara Bianchi", initials: "SB" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead model · Spring lookbook",
        unitType: "day", units: 1, costRate: 2400, clientRate: 2900,
        notes: "Full editorial, 1 day Madrid", status: "submitted" },
      { id: "r2", talentId: "t-tomas", talentName: "Tomás Núñez", initials: "TN",
        role: "Supporting model",
        unitType: "day", units: 1, costRate: 2200, clientRate: 2600,
        status: "submitted" },
      { id: "r3", talentId: "t-zara", talentName: "Zara Hadid", initials: "ZH",
        role: "Beauty close-ups",
        unitType: "day", units: 1, costRate: 1800, clientRate: 2100,
        notes: "Rate not yet confirmed", status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 28 · 10:14", actor: "Joana (client)", body: "Submitted inquiry · €2,500/day cap", tone: "info" },
      { id: "t2", ts: "Apr 28 · 11:02", actor: "System",         body: "Sara assigned as coordinator" },
      { id: "t3", ts: "Apr 28 · 14:30", actor: "Marta",          body: "Submitted rate · €2,400/day", tone: "success" },
      { id: "t4", ts: "Apr 28 · 16:11", actor: "Tomás",          body: "Submitted rate · €2,200/day", tone: "success" },
    ],
  },
  c2: {
    conversationId: "c2",
    stage: "awaiting_talent",
    clientBudget: { amount: 5000, unitType: "contract", currency: "EUR", note: "3-day total contract · jewelry editorial" },
    agencyFee: 800,
    coordinatorPct: 40,
    coordinators: [
      { id: "co-sara", name: "Sara Bianchi", initials: "SB" },
      { id: "co-marco", name: "Marco Pellegrini", initials: "MP" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Editorial · Bvlgari jewelry",
        unitType: "contract", units: 1, costRate: 0, clientRate: 0,
        status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 26 · 09:00", actor: "Joana (client)", body: "Hold opened · €5,000 total contract" },
      { id: "t2", ts: "Apr 26 · 09:14", actor: "System",         body: "Marta invited · awaiting rate" },
    ],
  },
  // c3 — Vogue Italia · BOOKED. Marta is the talent (NOT coord;
  // Ana Vega coordinates this from Acme Models). Offer accepted Apr 12,
  // contract signed same day, polaroids approved Apr 14, on set
  // May 14–15. Two-talent shoot — Emma Ricci is on the lineup too.
  c3: {
    conversationId: "c3",
    stage: "accepted",
    clientBudget: { amount: 10000, unitType: "contract", currency: "EUR", note: "2-day editorial · cover + spread · 12mo EU usage" },
    agencyFee: 1200,
    coordinatorPct: 40,
    coordinators: [
      { id: "co-ana", name: "Ana Vega", initials: "AV" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · cover + editorial spread",
        unitType: "contract", units: 1, costRate: 4000, clientRate: 5800,
        notes: "2 days on set · Madrid → Milan travel covered",
        status: "approved" },
      { id: "r2", talentId: "t-emma", talentName: "Emma Ricci", initials: "ER",
        role: "Co-talent · editorial spread",
        unitType: "contract", units: 1, costRate: 3000, clientRate: 4200,
        notes: "Praline London representation",
        status: "approved" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 8 · 14:00",  actor: "Francesca (Vogue)", body: "Inquiry opened · €10k total · 2-day editorial", tone: "info" },
      { id: "t2", ts: "Apr 9 · 11:30",  actor: "Ana Vega",          body: "Marta + Emma proposed · rates submitted" },
      { id: "t3", ts: "Apr 10 · 16:00", actor: "Vogue Italia",      body: "Approved both talents · contract drafted" },
      { id: "t4", ts: "Apr 12 · 14:01", actor: "System",            body: "Booking accepted · contract signed", tone: "success" },
    ],
  },

  // c4 — Stella McCartney · CANCELLED (campaign moved to Q3). Hold
  // released Apr 30, never reached "sent" stage. Kept on the books so
  // the talent can review what was offered when it re-opens in Q3.
  c4: {
    conversationId: "c4",
    stage: "expired",
    clientBudget: { amount: 2200, unitType: "day", currency: "EUR", note: "Single day · SS27 lookbook · Paris" },
    agencyFee: 350,
    coordinatorPct: 50,
    coordinators: [
      { id: "co-anna", name: "Anna Bernard", initials: "AB" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lookbook · single day",
        unitType: "day", units: 1, costRate: 1800, clientRate: 2200,
        status: "submitted" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 18 · 10:00", actor: "Stella's team", body: "Hold opened · May 14 · €2,200/day cap", tone: "info" },
      { id: "t2", ts: "Apr 18 · 11:30", actor: "Marta Reyes",   body: "Held · ready to confirm on lock" },
      { id: "t3", ts: "Apr 22 · 09:18", actor: "Anna Bernard",  body: "Stella's team finalising wardrobe + creative" },
      { id: "t4", ts: "1d 12h ago",     actor: "System",        body: "Stella McCartney cancelled · campaign moved to Q3", tone: "warn" },
    ],
  },

  // c5 — Loewe · WRAPPED. Single-day capsule editorial at ESTUDIO ROCA,
  // 2 talents (Marta + Diego). Paid in full Apr 25. Past stage doesn't
  // surface this tab to talent (Booking + Payment cover it) but admin
  // and coords can audit.
  c5: {
    conversationId: "c5",
    stage: "accepted",
    clientBudget: { amount: 7000, unitType: "contract", currency: "EUR", note: "1 day · capsule editorial · 2 talent" },
    agencyFee: 900,
    coordinatorPct: 50,
    coordinators: [
      { id: "co-rocio", name: "Rocío Castro", initials: "RC" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · capsule editorial",
        unitType: "day", units: 1, costRate: 3200, clientRate: 4000,
        status: "approved" },
      { id: "r2", talentId: "t-diego", talentName: "Diego Albarracín", initials: "DA",
        role: "Co-talent · capsule editorial",
        unitType: "day", units: 1, costRate: 2400, clientRate: 3000,
        status: "approved" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 4 · 11:00",  actor: "Loewe team",   body: "Direct booking · 2 talents · €7k contract", tone: "info" },
      { id: "t2", ts: "Apr 5 · 09:30",  actor: "Rocío Castro", body: "Marta + Diego proposed · standard ESTUDIO ROCA setup" },
      { id: "t3", ts: "Apr 7 · 14:00",  actor: "Loewe team",   body: "Approved · contract sent" },
      { id: "t4", ts: "Apr 8 · 11:00",  actor: "System",       body: "Booking accepted · call sheet shared", tone: "success" },
      { id: "t5", ts: "Apr 18 · 17:30", actor: "System",       body: "Wrapped · selects approved Apr 22", tone: "success" },
      { id: "t6", ts: "Apr 25 · 09:14", actor: "System",       body: "Invoice cleared · €3,200 transferred to Marta", tone: "success" },
    ],
  },

  // c6 — Martina Beach Club · INQUIRY. New Tulala Hub client. Brief
  // landed an hour ago — Marta hasn't quoted yet. The "submit my rate"
  // CTA sits on the Offer tab until she puts a number in.
  c6: {
    conversationId: "c6",
    stage: "awaiting_talent",
    clientBudget: { amount: 2800, unitType: "day", currency: "EUR", note: "Sunday models · sunset series · 4 dates" },
    agencyFee: 420,
    coordinatorPct: 50,
    expiresInHours: 48,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · Sunday models · sunset",
        unitType: "day", units: 1, costRate: 0, clientRate: 0,
        notes: "Hotel covered (1 night) · golden-hour shoot · first of 4 dates",
        status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "1h ago", actor: "Martina González", body: "Inquiry submitted via Tulala Hub · €2,800/day cap", tone: "info" },
      { id: "t2", ts: "1h ago", actor: "System",           body: "Routed to Acme Models · Sara assigned" },
      { id: "t3", ts: "1h ago", actor: "Sara Mendez",      body: "Marta invited · awaiting rate" },
    ],
  },

  // c7 — Solstice Festival · BOOKED. Marta is COORDINATOR (Reyes
  // Movement Studio). Three dancers — Marta + Tariq + Anouk — for the
  // closing performance. Multi-row offer reflects the crew. Marta's
  // workspace keeps the full margin (her own studio).
  c7: {
    conversationId: "c7",
    stage: "accepted",
    clientBudget: { amount: 7500, unitType: "contract", currency: "EUR", note: "8-min closing set · 3 dancers · main stage" },
    agencyFee: 900,
    coordinatorPct: 100,
    coordinators: [
      { id: "co-marta", name: "Marta Reyes", initials: "MR", alsoTalentId: currentTalentId() },
      { id: "co-cleo",  name: "Cleo Vega",   initials: "CV" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead dancer + coordinator",
        unitType: "event", units: 1, costRate: 2400, clientRate: 2800,
        notes: "Coord margin captured separately via Reyes Movement Studio",
        status: "approved" },
      { id: "r2", talentId: "t-tariq", talentName: "Tariq Joubert", initials: "TJ",
        role: "Fire dancer · poi",
        unitType: "event", units: 1, costRate: 2100, clientRate: 2400,
        status: "approved" },
      { id: "r3", talentId: "t-anouk", talentName: "Anouk Naseri", initials: "AN",
        role: "Fire dancer · choreography lead",
        unitType: "event", units: 1, costRate: 2100, clientRate: 2300,
        notes: "Choreo finalised · cue list shared",
        status: "approved" },
    ],
    timeline: [
      { id: "t1", ts: "May 25 · 11:04", actor: "Bea Velasco (Solstice)", body: "Direct booking · €7,500 · 3 dancers · Cala Llonga main stage", tone: "info" },
      { id: "t2", ts: "May 25 · 12:30", actor: "Marta Reyes",            body: "Crew proposed · Marta + Tariq + Anouk · €7,500 covers all" },
      { id: "t3", ts: "May 26 · 18:20", actor: "Marta Reyes",            body: "Crew bios + 30s clips uploaded for festival approval" },
      { id: "t4", ts: "May 28 · 09:00", actor: "Solstice",               body: "Approved all 3 · insurance + rider attached", tone: "success" },
      { id: "t5", ts: "May 28 · 09:01", actor: "System",                 body: "Booking locked · Sat Jun 21 · 22:30 stage time", tone: "success" },
    ],
  },

  // c8 — Adidas Originals · CANCELLED (counter rejected). Negotiation
  // sequence: Sara quoted €2,400, Riku countered €1,500, Sara
  // re-countered €1,800, Adidas held at €1,400 + buyout. Closed after
  // 3 rounds. Offer history kept so Marta sees the full trail when
  // she re-opens.
  c8: {
    conversationId: "c8",
    stage: "rejected",
    clientBudget: { amount: 1400, unitType: "day", currency: "EUR", note: "Final cap · global usage · 12mo" },
    agencyFee: 240,
    coordinatorPct: 50,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Featured dancer · spec reel",
        unitType: "day", units: 1, costRate: 1800, clientRate: 2400,
        notes: "Counter v3 · held the line on global usage; Adidas declined",
        status: "declined" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 14 · 09:00", actor: "Riku Vesa (Adidas)", body: "Inquiry · 3–4 dancers · global digital + paid social", tone: "info" },
      { id: "t2", ts: "Apr 14 · 13:00", actor: "Sara Mendez",        body: "v1 quote · €2,400/day · global 12mo usage" },
      { id: "t3", ts: "Apr 16 · 14:30", actor: "Riku Vesa",          body: "Counter · €1,500/day · budget tighter than expected", tone: "warn" },
      { id: "t4", ts: "Apr 16 · 14:45", actor: "Sara Mendez",        body: "v2 counter · €1,800/day · holding global" },
      { id: "t5", ts: "Apr 18 · 10:00", actor: "Riku Vesa",          body: "v3 cap · €1,400 + buyout · final from Adidas", tone: "warn" },
      { id: "t6", ts: "4d ago",         actor: "System",             body: "Closed · €1,400 doesn't pencil for global · they went elsewhere", tone: "warn" },
    ],
  },

  // c9 — Lyra Skincare · EXPIRED. Cold email, unverified brand, never
  // responded after Sara's quote. Auto-closed after 14d silence.
  c9: {
    conversationId: "c9",
    stage: "expired",
    clientBudget: { amount: 600, unitType: "event", currency: "EUR", note: "4h hostess slot · BCN pop-up" },
    agencyFee: 100,
    coordinatorPct: 50,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Hostess · 4h pop-up",
        unitType: "event", units: 1, costRate: 500, clientRate: 600,
        notes: "Outside Marta's usual lane but agreed for the right number",
        status: "submitted" },
    ],
    timeline: [
      { id: "t1", ts: "Apr 18 · 16:00", actor: "Lyra (cold)", body: "Inquiry via cold email · brand unverified", tone: "warn" },
      { id: "t2", ts: "Apr 19 · 09:00", actor: "Sara Mendez", body: "v1 quote sent · €600 for 4h · standard rate" },
      { id: "t3", ts: "Apr 26 · 10:00", actor: "System",      body: "Reminder sent · no client reply in 7 days" },
      { id: "t4", ts: "10d ago",        actor: "System",      body: "Auto-closed · no response in 14 days", tone: "warn" },
    ],
  },

  // c11 — Aesop · NEW INQUIRY (just landed). Aesop posted a €3,200/day
  // budget; Marta hasn't quoted yet. The talent row sits in "pending"
  // so the Offer tab renders her per-row Submit-rate button + the
  // empty-state guard falls through (offer exists, just awaiting talent).
  c11: {
    conversationId: "c11",
    stage: "awaiting_talent",
    clientBudget: { amount: 3200, unitType: "day", currency: "EUR", note: "Single day · skincare editorial · full editorial usage" },
    agencyFee: 480,
    coordinatorPct: 50,
    expiresInHours: 36,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · skincare editorial",
        unitType: "day", units: 1, costRate: 0, clientRate: 0,
        notes: "Aesop asked for editorial-trained talent · brand-new client",
        status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "30m ago", actor: "Eun-jin Im (Aesop)", body: "Inquiry · €3,200/day · single day Berlin · 12mo editorial usage", tone: "info" },
      { id: "t2", ts: "27m ago", actor: "System",             body: "Routed to Acme Models · Sara assigned" },
      { id: "t3", ts: "25m ago", actor: "Sara Mendez",        body: "Marta invited · awaiting rate" },
    ],
  },

  // c12 — Lacoste · NEW INQUIRY (just landed). Direct via the Acme
  // roster page; Lacoste's brand manager Joana set a €2,400/day cap
  // for 2 days. Marta has not submitted a rate yet.
  c12: {
    conversationId: "c12",
    stage: "awaiting_talent",
    clientBudget: { amount: 2400, unitType: "day", currency: "EUR", note: "2 days · SS27 sportswear · €2,400/day per talent" },
    agencyFee: 600,
    coordinatorPct: 50,
    expiresInHours: 72,
    coordinators: [
      { id: "co-sara", name: "Sara Mendez", initials: "SM" },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · SS27 sportswear lookbook",
        unitType: "day", units: 2, costRate: 0, clientRate: 0,
        notes: "Direct inbound · Lacoste saw your Mango lookbook",
        status: "pending" },
    ],
    timeline: [
      { id: "t1", ts: "10m ago", actor: "Joana Rivera (Lacoste)", body: "Inquiry · €2,400/day · 2 days Lisbon · pre-qualified", tone: "info" },
      { id: "t2", ts: "9m ago",  actor: "Sara Mendez",            body: "Direct route — Marta invited · awaiting rate" },
    ],
  },

  // c10 — Atelier Noir Bridal · BOOKED. Marta is COORDINATOR. Two
  // talents: Marta + Nadia Köhler. Returning client (Atelier shot with
  // Reyes Movement Studio last year) — booked at +5% YoY.
  c10: {
    conversationId: "c10",
    stage: "accepted",
    clientBudget: { amount: 11200, unitType: "contract", currency: "EUR", note: "2 days · 2 talents · €2,800/day each · couture exclusivity" },
    agencyFee: 1400,
    coordinatorPct: 100,
    coordinators: [
      { id: "co-marta", name: "Marta Reyes", initials: "MR", alsoTalentId: currentTalentId() },
    ],
    rows: [
      { id: "r1", talentId: currentTalentId(), talentName: "Marta Reyes", initials: "MR",
        role: "Lead · bridal SS27 + coordinator",
        unitType: "day", units: 2, costRate: 2800, clientRate: 3200,
        notes: "Returning rate · +5% year-over-year",
        status: "approved" },
      { id: "r2", talentId: "t-nadia", talentName: "Nadia Köhler", initials: "NK",
        role: "Co-talent · bridal SS27",
        unitType: "day", units: 2, costRate: 2800, clientRate: 3200,
        notes: "Reyes Movement Studio representation · NDA signed Jun 15",
        status: "approved" },
    ],
    timeline: [
      { id: "t1", ts: "Jun 8 · 14:04",  actor: "Valeria Moss (Atelier)", body: "Returning client · 2 days · 2 talents · couture", tone: "info" },
      { id: "t2", ts: "Jun 8 · 16:18",  actor: "Marta Reyes",             body: "Crew proposed · Marta + Nadia · €2,800/day each (+5% YoY)" },
      { id: "t3", ts: "Jun 9 · 10:00",  actor: "Atelier Noir",            body: "Approved both rates · booking confirmation incoming", tone: "success" },
      { id: "t4", ts: "Jun 10 · 11:00", actor: "System",                  body: "Booking accepted · contract signed", tone: "success" },
      { id: "t5", ts: "Jun 15 · 15:30", actor: "Marta Reyes",             body: "NDA bundle uploaded · both talents signed" },
    ],
  },
};

// Workspace RichInquiry IDs (RI-XXX) reuse the same offer fixtures so the
// admin shell renders rich content. Aliasing happens at lookup time so the
// per-id mocks above stay readable.
export const RICH_OFFER_ALIAS: Record<string, string> = {
  "RI-201": "c1",  // Mango · Spring lookbook (coordinator review)
  "RI-202": "c2",  // Bvlgari (awaiting talent rates)
  "RI-203": "c3",  // Vogue Italia · BOOKED (offer accepted)
};
export function getOffer(id: string): Offer | undefined {
  // Reads through the module-level override store so mutations made
  // by any pov (talent submits rate, client approves, admin sends to
  // client) appear in every other shell that views the same offer.
  const directKey = MOCK_OFFER_FOR_CONV[id] ? id : RICH_OFFER_ALIAS[id];
  if (!directKey) return undefined;
  return getEffectiveOffer(directKey);
}

// ── OfferTab ──
export type OfferPov =
  | { kind: "admin" }
  | { kind: "client" }
  | { kind: "talent"; talentId: string; isCoordinator: boolean };

export const STAGE_LABEL: Record<OfferStage, { label: string; tone: string; bg: string; clientLabel?: string }> = {
  no_offer:           { label: "No offer yet",         tone: COLORS.inkMuted,    bg: "rgba(11,11,13,0.05)" },
  client_budget:      { label: "Budget submitted",     tone: COLORS.indigoDeep,  bg: COLORS.indigoSoft, clientLabel: "Sent · awaiting team" },
  awaiting_talent:    { label: "Awaiting talent",      tone: COLORS.coral,       bg: COLORS.coralSoft,  clientLabel: "Team building offer" },
  talent_submitted:   { label: "Talent submitted",     tone: COLORS.indigoDeep,  bg: COLORS.indigoSoft, clientLabel: "Team building offer" },
  coordinator_review: { label: "Coordinator review",   tone: COLORS.indigoDeep,  bg: COLORS.indigoSoft, clientLabel: "Team building offer" },
  sent:               { label: "Sent to client",       tone: COLORS.accentDeep,  bg: COLORS.accentSoft, clientLabel: "Awaiting your decision" },
  reviewing:          { label: "Client reviewing",     tone: COLORS.accentDeep,  bg: COLORS.accentSoft, clientLabel: "You're reviewing" },
  countered:          { label: "Counter received",     tone: COLORS.amberDeep,   bg: COLORS.amberSoft,  clientLabel: "Counter sent" },
  accepted:           { label: "Accepted",             tone: COLORS.successDeep, bg: COLORS.successSoft, clientLabel: "Accepted" },
  rejected:           { label: "Rejected",             tone: COLORS.coralDeep,   bg: COLORS.coralSoft,   clientLabel: "Declined" },
  expired:            { label: "Expired",              tone: COLORS.inkMuted,    bg: "rgba(11,11,13,0.05)", clientLabel: "Expired" },
};

// i18n sibling for STAGE_LABEL (additive — the English map above stays for
// non-localized consumers). Localized consumers keep switching on the raw
// `OfferStage` union but render `t(STAGE_LABEL_KEYS[stage].labelKey)` (and
// the client variant via `clientLabelKey`). Keys live under
// `dashboard.adminTabs.offer.stage.*`.
export const STAGE_LABEL_KEYS: Record<OfferStage, { labelKey: string; clientLabelKey?: string }> = {
  no_offer:           { labelKey: "dashboard.adminTabs.offer.stage.noOffer" },
  client_budget:      { labelKey: "dashboard.adminTabs.offer.stage.budgetSubmitted",   clientLabelKey: "dashboard.adminTabs.offer.stage.clientSentAwaiting" },
  awaiting_talent:    { labelKey: "dashboard.adminTabs.offer.stage.awaitingTalent",     clientLabelKey: "dashboard.adminTabs.offer.stage.clientTeamBuilding" },
  talent_submitted:   { labelKey: "dashboard.adminTabs.offer.stage.talentSubmitted",    clientLabelKey: "dashboard.adminTabs.offer.stage.clientTeamBuilding" },
  coordinator_review: { labelKey: "dashboard.adminTabs.offer.stage.coordinatorReview",  clientLabelKey: "dashboard.adminTabs.offer.stage.clientTeamBuilding" },
  sent:               { labelKey: "dashboard.adminTabs.offer.stage.sentToClient",       clientLabelKey: "dashboard.adminTabs.offer.stage.clientAwaitingDecision" },
  reviewing:          { labelKey: "dashboard.adminTabs.offer.stage.clientReviewing",    clientLabelKey: "dashboard.adminTabs.offer.stage.clientYoureReviewing" },
  countered:          { labelKey: "dashboard.adminTabs.offer.stage.counterReceived",    clientLabelKey: "dashboard.adminTabs.offer.stage.clientCounterSent" },
  accepted:           { labelKey: "dashboard.adminTabs.offer.stage.accepted",           clientLabelKey: "dashboard.adminTabs.offer.stage.accepted" },
  rejected:           { labelKey: "dashboard.adminTabs.offer.stage.rejected",           clientLabelKey: "dashboard.adminTabs.offer.stage.clientDeclined" },
  expired:            { labelKey: "dashboard.adminTabs.offer.stage.expired",            clientLabelKey: "dashboard.adminTabs.offer.stage.expired" },
};

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  hour:     "/hour",
  day:      "/day",
  contract: "total contract",
  event:    "/event",
};

// i18n sibling for UNIT_TYPE_LABEL (additive — the English map above stays
// for non-localized consumers). Localized consumers resolve
// `t(UNIT_TYPE_LABEL_KEYS[unitType])`. Keys live under
// `dashboard.enums.unitType.*`.
export const UNIT_TYPE_LABEL_KEYS: Record<UnitType, string> = {
  hour:     "dashboard.enums.unitType.hour",
  day:      "dashboard.enums.unitType.day",
  contract: "dashboard.enums.unitType.contract",
  event:    "dashboard.enums.unitType.event",
};

export function fmtMoney(n: number, currency: string) {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function rowSubtotal(r: LineupRow, side: "cost" | "client") {
  const rate = side === "cost" ? r.costRate : r.clientRate;
  return rate * (r.units || 0);
}

/**
 * The "what do I do now?" descriptor for the sticky action bar at the top
 * of the Offer tab (and the shell action bar in machinery-6).
 *
 * i18n contract (wave 26): this function is a pure logic resolver and MUST
 * NOT return user-facing English. It returns:
 *   - `labelKey` + `labelParams` — a STABLE catalog key + interpolation
 *     params; each consumer renders `interpolate(t(labelKey), labelParams)`
 *     via its OWN translator.
 *   - `cta` / `secondary` — the raw English union values, kept because
 *     downstream code switches on them as logic discriminants
 *     (`next.cta === "Submit my rate"` in machinery-12, `action.cta ??
 *     action.secondary` as a title in machinery-6). NEVER render these
 *     directly; render `ctaKey` / `secondaryKey` instead.
 *   - `ctaKey` / `secondaryKey` — catalog keys for the button labels.
 *
 * `labelParams.closureWhy` carries the runtime closure reason lifted from
 * the timeline (fixture data, e.g. "campaign moved to Q3"); it is injected
 * as-is and is intentionally out of the localization scope — only the
 * surrounding template ("Offer closed · {why}") is localized. Keys live
 * under `dashboard.adminTabs.nextAction.*`.
 */
export type NextAction = {
  labelKey: string;
  labelParams?: Record<string, string | number>;
  cta?: string;
  ctaKey?: string;
  ctaTone?: "primary" | "success";
  secondary?: string;
  secondaryKey?: string;
  subtle?: boolean;
};
const NA = "dashboard.adminTabs.nextAction";
export function nextActionFor(offer: Offer, pov: OfferPov): NextAction {
  const s = offer.stage;
  // Coord first name powers personalized active-state copy. Passed as an
  // interpolation param; falls back to a localized "the coordinator" token
  // (resolved at the render site) so messages stay grammatical when no
  // coord is set (rare — most fixtures have one).
  const coordName = offer.coordinators[0]?.name?.split(" ")[0] ?? null;
  const coordParams: Record<string, string | number> = coordName ? { coord: coordName } : {};
  // Pull the freshest closure-tone timeline entry. When the offer is
  // dead, this carries the actual reason ("campaign moved to Q3",
  // "no response in 14 days") so we can show *why* it closed instead
  // of a generic "expired". Strips any leading closure-verb prefix
  // ("Closed · ", "Auto-closed · ", "Cancelled · ") so the next
  // template can re-prepend "Closed · " without duplicating.
  const closureEvt = [...offer.timeline].reverse().find(e => e.tone === "warn");
  const closureWhy = closureEvt
    ? closureEvt.body.replace(
        /^(?:auto-?closed|closed|cancelled|canceled|rejected|expired)\s*[·:—-]?\s*/i,
        "",
      ).trim()
    : null;

  if (pov.kind === "client") {
    if (s === "no_offer")          return { labelKey: `${NA}.clientNoOffer`, cta: "Add budget", ctaKey: `${NA}.ctaAddBudget`, ctaTone: "primary" };
    if (s === "client_budget")     return { labelKey: `${NA}.clientBudgetSent`, subtle: true };
    if (s === "awaiting_talent" || s === "talent_submitted" || s === "coordinator_review")
                                   return coordName
                                     ? { labelKey: `${NA}.clientLockingRates`, labelParams: coordParams, subtle: true }
                                     : { labelKey: `${NA}.clientLockingRatesGeneric`, subtle: true };
    if (s === "sent" || s === "reviewing")
                                   return { labelKey: `${NA}.clientOfferReady`, cta: "Approve", ctaKey: `${NA}.ctaApprove`, ctaTone: "success", secondary: "Request change", secondaryKey: `${NA}.secRequestChange` };
    if (s === "countered")         return { labelKey: `${NA}.clientCounterInFlight`, subtle: true };
    if (s === "accepted")          return { labelKey: `${NA}.clientBooked`, subtle: true };
    if (s === "rejected")          return closureWhy ? { labelKey: `${NA}.clientClosedWhy`, labelParams: { closureWhy }, subtle: true } : { labelKey: `${NA}.clientClosedNoAccept`, subtle: true };
    if (s === "expired")           return closureWhy ? { labelKey: `${NA}.clientClosedWhy`, labelParams: { closureWhy }, subtle: true } : { labelKey: `${NA}.clientClosedWindow`, subtle: true };
  }

  if (pov.kind === "talent") {
    const myRow = offer.rows.find(r => r.talentId === pov.talentId);
    // ── Terminal stages first ─────────────────────────────────────
    // Once an offer is dead the row's pending/submitted status is
    // stale — the message should explain *why* it closed, not invite
    // a stale action. closureWhy pulls the human reason from the
    // timeline ("campaign moved to Q3", "auto-closed · 14 days").
    if (s === "rejected") {
      if (closureWhy) return { labelKey: `${NA}.talentClosedWhy`, labelParams: { closureWhy }, subtle: true };
      return myRow?.status === "declined"
        ? { labelKey: `${NA}.talentClosedNoBudge`, subtle: true }
        : { labelKey: `${NA}.talentClosedPassed`, subtle: true };
    }
    if (s === "expired") {
      return closureWhy
        ? { labelKey: `${NA}.talentClosedWhy`, labelParams: { closureWhy }, subtle: true }
        : { labelKey: `${NA}.talentAutoClosed`, subtle: true };
    }
    // ── Active stages, ordered by talent's row state ──────────────
    if (myRow?.status === "pending") {
      // Inquiry has a published cap → "match the cap" wording.
      // Otherwise the talent is opening the negotiation.
      return {
        labelKey: offer.clientBudget ? `${NA}.talentDropRate` : `${NA}.talentOpenConversation`,
        cta: "Submit my rate", ctaKey: `${NA}.ctaSubmitRate`, ctaTone: "primary",
      };
    }
    if (myRow?.status === "submitted" && (s === "talent_submitted" || s === "coordinator_review" || s === "awaiting_talent")) {
      return coordName
        ? { labelKey: `${NA}.talentRateReceived`, labelParams: coordParams, subtle: true }
        : { labelKey: `${NA}.talentRateReceivedGeneric`, subtle: true };
    }
    if (myRow?.status === "submitted" && (s === "sent" || s === "reviewing")) {
      return offer.expiresInHours !== undefined && offer.expiresInHours <= 24
        ? { labelKey: `${NA}.talentClientHasOfferHours`, labelParams: { hours: offer.expiresInHours }, subtle: true }
        : { labelKey: `${NA}.talentClientHasOffer`, subtle: true };
    }
    if (myRow?.status === "submitted") return { labelKey: `${NA}.talentRateIn`, subtle: true };
    if (myRow?.status === "approved")  return { labelKey: `${NA}.talentBooked`, subtle: true };
    if (myRow?.status === "countered") {
      return {
        labelKey: `${NA}.talentWantsNegotiate`,
        cta: "Review counter", ctaKey: `${NA}.ctaReviewCounter`, ctaTone: "primary",
        secondary: "Hold firm", secondaryKey: `${NA}.secHoldFirm`,
      };
    }
    if (myRow?.status === "declined")  return { labelKey: `${NA}.talentYouDeclined`, subtle: true };
    if (pov.isCoordinator)             return { labelKey: `${NA}.talentCoordShapeOffer`, cta: "Send to client", ctaKey: `${NA}.ctaSendToClient`, ctaTone: "primary" };
  }

  // ── Admin / coordinator workspace pov ──
  if (s === "no_offer" || s === "client_budget") return { labelKey: `${NA}.adminInviteGather`, cta: "Add talent", ctaKey: `${NA}.ctaAddTalent`, ctaTone: "primary" };
  if (s === "awaiting_talent") {
    const pending = offer.rows.filter(r => r.status === "pending").length;
    if (pending > 0) {
      return {
        labelKey: pending === 1 ? `${NA}.adminWaitingOneRate` : `${NA}.adminWaitingRates`,
        labelParams: { pending },
        cta: "Nudge talent", ctaKey: `${NA}.ctaNudgeTalent`, ctaTone: "primary",
      };
    }
    return { labelKey: `${NA}.adminWaitingRatesIdle`, ctaTone: "primary", subtle: true };
  }
  if (s === "talent_submitted" || s === "coordinator_review")
                                                 return { labelKey: `${NA}.adminAllRatesIn`, cta: "Send to client", ctaKey: `${NA}.ctaSendToClient`, ctaTone: "primary" };
  if (s === "sent" || s === "reviewing")         return { labelKey: `${NA}.adminOfferWithClient`, subtle: true };
  if (s === "countered")                         return { labelKey: `${NA}.adminClientCountered`, cta: "Review counter", ctaKey: `${NA}.ctaReviewCounter`, ctaTone: "primary" };
  if (s === "accepted")                          return { labelKey: `${NA}.adminAccepted`, cta: "Call sheet", ctaKey: `${NA}.ctaCallSheet`, ctaTone: "success" };
  if (s === "rejected")                          return closureWhy ? { labelKey: `${NA}.adminClosedWhy`, labelParams: { closureWhy }, subtle: true } : { labelKey: `${NA}.adminClosedRejected`, subtle: true };
  if (s === "expired")                           return closureWhy ? { labelKey: `${NA}.adminClosedWhy`, labelParams: { closureWhy }, subtle: true } : { labelKey: `${NA}.adminClosedWindow`, subtle: true };
  return { labelKey: `${NA}.emptyDash`, subtle: true };
}

/**
 * Map an `inquiry_participants` row (talent role) into the legacy
 * InquiryTalentInvite shape consumed across the admin shell. Used by the
 * live-lineup override hook so Project / Lineup drawer / Offer / etc. all
 * read from the canonical DB lineup instead of the mock requirementGroups.
 */
export function mapParticipantToInvite(p: InquiryParticipant): InquiryTalentInvite {
  const name = p.talentDisplayName ?? p.talentProfileId ?? "Talent";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "T";
  const state: InquiryTalentInvite["state"] =
      p.status === "active"   ? "confirmed"
    : p.status === "declined" ? "declined"
    : p.status === "removed"  ? "withdrawn"
    : "invited";
  return {
    talentId: p.talentProfileId ?? p.id,
    name,
    initials,
    state,
  };
}

/**
 * Returns the live `inquiry_participants` lineup as InquiryTalentInvite[],
 * or `null` for mock inquiries (non-UUID ids) and while loading. Consumers
 * should `??` against the legacy `inquiry.talent` so mock surfaces still
 * render their fixture data:
 *
 *   const live = useLiveLineupOverride(inquiry.id);
 *   const lineup = live ?? inquiry.talent;
 *
 * Fixes the 2026-05-12 audit P0 where Live lineup chip showed N talent but
 * the Project / Lineup drawer / etc. tabs reported "No talent yet" because
 * they were reading the legacy `requirementGroups`-derived field.
 */
export function useLiveLineupOverride(inquiryId: string): InquiryTalentInvite[] | null {
  const { effectiveTenant, toast } = useAdminShell();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inquiryId);
  const [rows, setRows] = useState<InquiryParticipant[] | null>(null);
  useEffect(() => {
    if (!isUuid) return;
    let cancelled = false;
    loadInquiryLineup(effectiveTenant.slug, inquiryId).then((r) => {
      if (cancelled) return;
      if (r.ok) setRows(r.data ?? []);
      else toast(`Lineup is showing cached data: ${r.error}`);
    });
    return () => { cancelled = true; };
  }, [inquiryId, isUuid, effectiveTenant.slug, toast]);
  if (!isUuid) return null;
  if (rows == null) return null;
  return rows.map(mapParticipantToInvite);
}
