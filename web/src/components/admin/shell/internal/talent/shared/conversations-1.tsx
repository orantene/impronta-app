// ════════════════════════════════════════════════════════════════════
// MESSAGES — chat-first inquiry/booking surface
// ────────────────────────────────────────────────────────────────────
// Premium Messenger-style two-pane experience that absorbs the legacy
// Inbox. Conversation list on the left, full-bleed thread on the right.
//
// Design principles per product direction (2026-04-26):
//   1. Chat IS the inquiry/booking record. Every interaction lives in
//      one timeline.
//   2. Action items live INLINE in the chat as message bubbles
//      (rate input, transport pick, confirm). No separate panels.
//   3. Stage-aware visuals + permissions: Inquiry (open) / Booked
//      (locked-info, you see only your take-home) / Past (read-only).
//   4. Mobile-first sizing — built to feel native when wrapped as a
//      PWA / native quick-messenger.
//   5. Pinned info cards at the top of every thread: brief, location
//      with map link, transport, schedule, your rate, leader.
//   6. Rich content support: text, image, file, voice note, location
//      pin, calendar invite, contract sign-off, payment receipt,
//      polaroid request, system messages (stage transitions).
// ════════════════════════════════════════════════════════════════════

export type MsgStage = "inquiry" | "hold" | "booked" | "past" | "cancelled";


export type Participant = {
  initials: string;
  name: string;
  role: string;
  /** Whether the participant is a Tulala talent (clickable → profile). */
  isTalent?: boolean;
};


/**
 * Where the inquiry came from — surfaced as a small chip in the header
 * so the talent knows who reached them and through which channel.
 *   - tulala-hub      → Tulala discovery / public roster
 *   - direct          → Client reached the agency or talent directly
 *   - agency-referral → Routed by another agency / coordinator
 *   - instagram-dm    → Inbound IG message (off-platform origin)
 *   - email           → Cold email
 */
export type ConvSource =
  | { kind: "tulala-hub"; label?: string }
  | { kind: "direct"; label?: string }
  | { kind: "agency-referral"; via?: string }
  | { kind: "instagram-dm" }
  | { kind: "email"; from?: string };


/** Outcome detail when stage = past or cancelled. Lets the UI tell the
 *  difference between "completed and paid" vs "client cancelled" vs
 *  "client never replied" vs "talent declined". */
export type ConvOutcome =
  | "completed"           // shoot wrapped, paid in full
  | "client_cancelled"    // client pulled out
  | "client_rejected"     // client rejected the offer / countered too low
  | "client_no_response"  // expired — client ghosted
  | "talent_declined"     // talent declined the inquiry
  | "agency_dropped";     // agency couldn't fulfill


export type Conversation = {
  id: string;
  client: string;
  clientInitials: string;
  clientTrust: import("../../state").ClientTrustLevel;
  brief: string;
  stage: MsgStage;
  agency: string;
  /** Agency slug when loaded from cross-agency bridge. */
  agencySlug?: string;
  leader: { name: string; role: string; initials: string };
  /** Crew + other talents on this shoot. Surfaced on-demand via a
   *  thread-header chip; not forced into the always-visible UI. */
  participants?: Participant[];
  location?: string;
  date?: string;
  /** Talent's take-home — only set when booked. Hides full offer per spec. */
  amountToYou?: string;
  /** Last message preview line — for the conversation list rail. */
  lastMessage: { sender: "you" | "client" | "coordinator" | "agency" | "system" | "workspace"; preview: string; ageHrs: number };
  unreadCount: number;
  /** True when the current talent (Marta) is the coordinator on this
   *  job — runs her own workspace, talks to client directly, organizes
   *  other talents. Drives the talent_coord pov + tab visibility. */
  iAmCoordinator?: boolean;
  /** Where the inquiry came from. Surfaces as a chip in the header. */
  source?: ConvSource;
  /** Closure detail when stage is past or cancelled. */
  outcome?: ConvOutcome;
  /** Pinned info cards — what the coordinator/client/agency entered. */
  pinned: {
    transport?: string;
    schedule?: string;
    callTime?: string;
    rate?: { value: string; status: "you-quoted" | "client-budget" | "agreed" };
    coordinatorNote?: string;
    /** Extras pulled in for richer logistics on booked shoots. */
    hotel?: string;
    parking?: string;
  };
  /** True when the talent has never opened this conversation. Drives a
   *  distinct row tint + "NEW" pill so brand-new inquiries stand out
   *  visually from regular unread state. Defaults to true (already
   *  opened) when omitted, so existing seed data renders unchanged. */
  seen?: boolean;
};


export const MOCK_CONVERSATIONS: Conversation[] = [
  // ──────────────────────────────────────────────────────────────────
  // c1 — Mango · Spring lookbook · INQUIRY (non-coord, awaiting Marta's rate)
  // Source: Direct client of Acme Models. Verified client. Coordinator
  // is asking Marta for a quote — primary action surface.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c1",
    client: "Mango",
    clientInitials: "M",
    clientTrust: "verified",
    brief: "Spring lookbook",
    stage: "inquiry",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "direct", label: "Direct to Acme Models" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "CR", name: "Camille Roux", role: "Talent · Acme Models", isTalent: true },
      { initials: "JR", name: "João Ribeiro", role: "Photographer" },
      { initials: "LV", name: "Lia Varga", role: "Stylist · Mango in-house" },
      { initials: "AM", name: "Anaïs Moreau", role: "MUA" },
    ],
    location: "Madrid · Calle de Velázquez 18",
    date: "Wed, May 14",
    lastMessage: { sender: "coordinator", preview: "What's your rate for a 1-day Madrid shoot? Mango asking.", ageHrs: 5 },
    unreadCount: 2,
    pinned: {
      transport: "Taxi reimbursed (keep receipts) · Mango covers hotel night before",
      schedule: "May 14 · call 08:00 · wrap by 18:00",
      callTime: "08:00",
      rate: { value: "—", status: "you-quoted" },
      coordinatorNote: "Mango is keen — they liked your editorial reel. Pricing decision is yours; I'll close once we hear back from them.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c2 — Bvlgari · Jewelry campaign · HOLD (gold client, exclusive talent)
  // Source: Tulala Hub. Marta on hold while client decides — hold
  // deadline is the urgent action.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c2",
    client: "Bvlgari",
    clientInitials: "B",
    clientTrust: "gold",
    brief: "Editorial · jewelry campaign",
    stage: "hold",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "tulala-hub", label: "Tulala Hub · Discover" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "PM", name: "Paolo Marchetti", role: "Photographer" },
      { initials: "GS", name: "Giulia Sarti", role: "Stylist · Bvlgari in-house" },
    ],
    location: "Milan · TBC (likely Studio Verde)",
    date: "May 18–20",
    lastMessage: { sender: "client", preview: "Holding the dates — call sheet by Friday. Scope is jewelry close-ups + 1 lifestyle frame.", ageHrs: 18 },
    unreadCount: 1,
    pinned: {
      transport: "Driver from your hotel each day · car included",
      schedule: "May 18–20 · call 07:30 · 3 day shoot",
      callTime: "07:30",
      rate: { value: "€4,000–6,000", status: "client-budget" },
      coordinatorNote: "Hold is locked. Confirming budget when call sheet drops.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c3 — Vogue Italia · Editorial spread · BOOKED (gold, confirmed)
  // Source: Direct, long-standing relationship. Marta is set day +4 —
  // logistics, polaroids, contract are the focus now.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c3",
    client: "Vogue Italia",
    clientInitials: "VI",
    clientTrust: "gold",
    brief: "Editorial spread · 2 days",
    stage: "booked",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "direct", label: "Long-standing client" },
    leader: { name: "Ana Vega", role: "Coordinator · Acme Models", initials: "AV" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "ER", name: "Emma Ricci", role: "Talent · Praline London", isTalent: true },
      { initials: "MR", name: "Mario Rossi", role: "Photographer" },
      { initials: "FB", name: "Francesca Bianchi", role: "Creative director · Vogue" },
      { initials: "EL", name: "Elena Lombardi", role: "Fashion editor" },
      { initials: "AP", name: "Aaron Park", role: "MUA" },
    ],
    location: "Milan · Studio 5, Via Tortona 27",
    date: "May 14–15",
    amountToYou: "€3,200 (your take · paid 14d after wrap)",
    lastMessage: { sender: "coordinator", preview: "Call sheet attached. Hair/makeup at 06:30, on set 07:00. Confirm by EOD?", ageHrs: 4 },
    unreadCount: 1,
    pinned: {
      transport: "Bus pickup at 06:00 from your hotel · driver Marco · WhatsApp +39 333 111 2222",
      schedule: "May 14 · call 07:00 · wrap by 19:00 · May 15 · call 08:00 · wrap by 17:00",
      callTime: "07:00",
      rate: { value: "—", status: "agreed" },
      hotel: "Magna Pars Suites · walk to studio · check-in May 13",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c4 — Stella McCartney · Lookbook · CANCELLED (client cancelled)
  // Source: Agency referral. Was a hold — got cancelled when Stella
  // shifted the campaign to next quarter. Outcome captured.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c4",
    client: "Stella McCartney",
    clientInitials: "SM",
    clientTrust: "verified",
    brief: "Lookbook · single day",
    stage: "cancelled",
    outcome: "client_cancelled",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "agency-referral", via: "Praline London (sister agency)" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "JD", name: "Julien Dubois", role: "Photographer" },
      { initials: "AB", name: "Anna Bernard", role: "Stylist · Stella in-house" },
    ],
    location: "Paris · TBC",
    date: "May 14",
    lastMessage: { sender: "system", preview: "Stella McCartney cancelled — campaign moved to Q3. Hold released.", ageHrs: 36 },
    unreadCount: 0,
    pinned: {
      coordinatorNote: "Stella's team apologized — they're shifting their summer campaign to Q3 due to a designer change. They asked to keep you on the shortlist for Aug.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c5 — Loewe · Capsule editorial · WRAPPED (past, paid in full)
  // Source: Direct. Successful shoot, paid out, selects delivered.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c5",
    client: "Loewe",
    clientInitials: "L",
    clientTrust: "gold",
    brief: "Capsule editorial · 2 talent · 1 day",
    stage: "past",
    outcome: "completed",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "direct", label: "Direct to Acme Models" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "LO", name: "Lucia Ortiz", role: "Talent · Acme Models", isTalent: true },
      { initials: "DA", name: "Diego Álvarez", role: "Photographer" },
      { initials: "RC", name: "Rocío Castro", role: "Art director · Loewe" },
      { initials: "AM", name: "Anaïs Moreau", role: "MUA" },
    ],
    location: "Madrid · ESTUDIO ROCA",
    date: "Apr 18",
    amountToYou: "€3,600 (paid Apr 25 via transfer)",
    lastMessage: { sender: "system", preview: "Booking wrapped. Selects shared. Paid in full.", ageHrs: 168 },
    unreadCount: 0,
    pinned: {
      transport: "Drove yourself · €120 fuel + tolls reimbursed",
      schedule: "Apr 18 · call 09:00 · wrap by 16:30",
      rate: { value: "—", status: "agreed" },
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c6 — Martina Beach Club · Sunday models series · INQUIRY (host job)
  // Source: Tulala Hub (new client). Verified. Brief just landed —
  // primary action is Marta's rate.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c6",
    client: "Martina Beach Club & Restaurant",
    clientInitials: "MB",
    clientTrust: "verified",
    brief: "Sunday models · summer pool series",
    stage: "inquiry",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "tulala-hub", label: "Tulala Hub · Hospitality vertical" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "JT", name: "Julia Tenes", role: "Photographer" },
      { initials: "RA", name: "Rafa Aragón", role: "Creative director · Martina" },
    ],
    location: "Tulum · Beach Club lobby",
    date: "Sun, Jun 8",
    lastMessage: { sender: "coordinator", preview: "Brief just landed — they want a sunset series. €2,800/day plus hotel. Open?", ageHrs: 1 },
    unreadCount: 3,
    pinned: {
      transport: "Hotel covered (1 night) · Uber to set reimbursed",
      schedule: "Jun 8 · call 14:00 · golden hour shoot · wrap by 21:00",
      callTime: "14:00",
      coordinatorNote: "Martina is a new client but the GM is a friend of the agency — let's make this a great first impression.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c7 — Solstice Festival · Fire dance closing · BOOKED — Marta is
  // the COORDINATOR. She runs her own free workspace ("Reyes Movement
  // Studio"), invited Cleo Vega as co-coordinator. 3 fire dancers
  // booked for the festival closing performance.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c7",
    client: "Solstice Festival · Production Co.",
    clientInitials: "SF",
    clientTrust: "silver",
    brief: "Fire dance · festival closing performance",
    stage: "booked",
    agency: "Reyes Movement Studio",
    iAmCoordinator: true,
    source: { kind: "direct", label: "Direct via your portfolio" },
    leader: { name: "Marta Reyes", role: "Coordinator · Reyes Movement Studio", initials: "MR" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Coordinator + Talent", isTalent: true },
      { initials: "CV", name: "Cleo Vega", role: "Co-coordinator · invited" },
      { initials: "TJ", name: "Tariq Joubert", role: "Fire dancer", isTalent: true },
      { initials: "AN", name: "Anouk Naseri", role: "Fire dancer", isTalent: true },
      { initials: "JL", name: "Joaquín Lima", role: "Stage manager · Solstice" },
      { initials: "BV", name: "Bea Velasco", role: "Producer · Solstice" },
    ],
    location: "Ibiza · Cala Llonga main stage",
    date: "Sat, Jun 21",
    amountToYou: "€2,400 (your dancer fee · plus 12% agency margin to your studio)",
    lastMessage: { sender: "client", preview: "Confirmed insurance & rider. Need updated bios + portrait shots for the program by Jun 14.", ageHrs: 2 },
    unreadCount: 4,
    pinned: {
      transport: "Boat transfer from Marina Botafoch · 18:00 · group ride · driver Iván",
      schedule: "Jun 21 · sound check 19:00 · stage 22:30 · 8 min set",
      callTime: "19:00",
      rate: { value: "—", status: "agreed" },
      hotel: "Hostal del Mar · 2 nights · check-in Jun 20",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c8 — Adidas · Dance commercial spec · CANCELLED (client rejected)
  // Source: Tulala Hub. Client wanted lower rate, agency held firm,
  // client went elsewhere. Outcome captured.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c8",
    client: "Adidas Originals · Spec dance reel",
    clientInitials: "AO",
    clientTrust: "verified",
    brief: "Dance commercial spec · 1 day",
    stage: "cancelled",
    outcome: "client_rejected",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "tulala-hub", label: "Tulala Hub · Featured dancers" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "RV", name: "Riku Vesa", role: "Director" },
    ],
    location: "Berlin · Holzmarkt",
    date: "Apr 30",
    lastMessage: { sender: "system", preview: "Adidas declined the v3 counter — their max was €1,400 + buyout. Closed.", ageHrs: 96 },
    unreadCount: 0,
    pinned: {
      rate: { value: "€2,400 → countered to €1,800 → declined", status: "agreed" },
      coordinatorNote: "We held the line at €1,800 — their counter at €1,400 was too low for the usage scope (12-month global). They went with another agency. Worth keeping their producer on file.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c9 — Lyra Skincare · Pop-up launch · CANCELLED (client ghosted)
  // Source: Email cold inbound. Client never responded after offer
  // was sent. Auto-expired after 14 days.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c9",
    client: "Lyra Skincare · Pop-up launch event",
    clientInitials: "LS",
    clientTrust: "basic",
    brief: "Hostess · product launch · 4 hours",
    stage: "cancelled",
    outcome: "client_no_response",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "email", from: "events@lyraskincare.com" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
    ],
    location: "Barcelona · Passeig de Gràcia (TBC)",
    date: "May 22",
    lastMessage: { sender: "system", preview: "Inquiry expired — no client response in 14 days. Auto-closed.", ageHrs: 240 },
    unreadCount: 0,
    pinned: {
      coordinatorNote: "Cold inbound — they reached out unverified. Sent a v1 offer at €600 for 4h. Heard nothing back. Common with first-time event clients.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c10 — Atelier Noir · Bridal campaign · BOOKED — Marta is the
  // COORDINATOR (her own workspace). NDA workflow: client sent NDA,
  // Marta organized the dancer team to sign and uploaded back to
  // Files. Real "dispatch the team" coordinator pattern.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c10",
    client: "Atelier Noir Bridal Collective",
    clientInitials: "AN",
    clientTrust: "gold",
    brief: "Bridal SS27 campaign · 2 talent · 2 days",
    stage: "booked",
    agency: "Reyes Movement Studio",
    iAmCoordinator: true,
    source: { kind: "direct", label: "Returning workspace client" },
    leader: { name: "Marta Reyes", role: "Coordinator · Reyes Movement Studio", initials: "MR" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Coordinator + Talent", isTalent: true },
      { initials: "NK", name: "Nadia Köhler", role: "Talent · Reyes Movement Studio", isTalent: true },
      { initials: "ES", name: "Elise Sandoval", role: "Photographer" },
      { initials: "VM", name: "Valeria Moss", role: "Creative director · Atelier Noir" },
      { initials: "HB", name: "Henrietta Bloom", role: "Wardrobe · Atelier Noir" },
    ],
    location: "Lisbon · Convento da Cartuxa",
    date: "Jul 4–5",
    amountToYou: "€2,800/day · 2 days · €5,600 total",
    lastMessage: { sender: "you", preview: "NDA + model release uploaded — all 2 talents signed. We're set for Lisbon.", ageHrs: 6 },
    unreadCount: 0,
    pinned: {
      transport: "Flights covered · BCN→LIS · group transfer to convento",
      schedule: "Jul 4 · call 06:30 · golden hour open · Jul 5 · indoor dawn light",
      callTime: "06:30",
      rate: { value: "—", status: "agreed" },
      hotel: "Pousada do Convento · check-in Jul 3 evening",
      coordinatorNote: "Returning client — Atelier shot with us last year. NDA stricter this time (couture pieces). All paperwork must clear before fitting.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c11 — Aesop · BRAND-NEW INQUIRY (just landed, never opened by Marta).
  // Tulala Hub direct, beauty/wellness vertical. seen: false drives the
  // "NEW" tint + pill in the inbox row.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c11",
    client: "Aesop",
    clientInitials: "A",
    clientTrust: "verified",
    brief: "Beauty editorial · skincare campaign · 1 day",
    stage: "inquiry",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "tulala-hub", label: "Tulala Hub · Beauty vertical" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "HD", name: "Hilde Dorn", role: "Photographer" },
      { initials: "EI", name: "Eun-jin Im", role: "Creative director · Aesop" },
    ],
    location: "Berlin · TBC (likely Studio Mitte)",
    date: "Mon, May 26",
    lastMessage: { sender: "coordinator", preview: "Aesop just reached out — beauty editorial, single day, Berlin. Strong fit for your editorial reel. Open?", ageHrs: 0.4 },
    unreadCount: 2,
    seen: false,
    pinned: {
      schedule: "May 26 · single day · call TBC · 8h shoot",
      coordinatorNote: "Brand-new client via the Hub — Aesop's marketing team specifically asked for editorial-trained talent. Worth a strong yes.",
    },
  },

  // ──────────────────────────────────────────────────────────────────
  // c12 — Lacoste · BRAND-NEW INQUIRY (just landed, never opened).
  // Direct via Acme's roster page, sportswear lookbook, 2-day Lisbon.
  // ──────────────────────────────────────────────────────────────────
  {
    id: "c12",
    client: "Lacoste",
    clientInitials: "L",
    clientTrust: "silver",
    brief: "Lookbook · SS27 sportswear · 2 days",
    stage: "inquiry",
    agency: "Atelier Roma",
    iAmCoordinator: false,
    source: { kind: "direct", label: "Acme Models roster page" },
    leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
    participants: [
      { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      { initials: "JR", name: "Joana Rivera", role: "Brand manager · Lacoste" },
      { initials: "PT", name: "Pedro Teixeira", role: "Photographer" },
    ],
    location: "Lisbon · Belém riverside",
    date: "Jun 3–4",
    lastMessage: { sender: "client", preview: "Saw your Mango lookbook — would love to put you on our SS27 shortlist. 2-day Lisbon, June. Open to a chat?", ageHrs: 0.15 },
    unreadCount: 3,
    seen: false,
    pinned: {
      schedule: "Jun 3–4 · 2 days · call TBC",
      coordinatorNote: "Lacoste came in directly via the roster page — first inbound from them in 18 months. Quote at the top of your range; they came pre-qualified.",
    },
  },
];
