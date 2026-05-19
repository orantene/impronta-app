"use client";

import { type Conversation } from "./conversations-1";



// ════════════════════════════════════════════════════════════════════
// Client-side mock conversations
//
// The client surface impersonates a single brand at a time (configured
// via clientProfile = "martina" | "gringo"). Each profile gets its own
// portfolio of projects — what THEY commissioned, not the agency or
// talent's full inbox.
//
// Where the talent or admin see "Mango / Bvlgari / Vogue Italia" jobs,
// a client (e.g. "Martina") sees only Martina's own commissioned work.
// One inquiry reused as c6 (so threads stay consistent across talent +
// client roles), plus a handful of client-only projects across stages.
// ════════════════════════════════════════════════════════════════════

export const CLIENT_MOCK_CONVERSATIONS_BY_PROFILE: Record<string, Conversation[]> = {
  martina: [
    // m1 — Sunday Models pool series (active inquiry — same job Marta
    // sees as c6, but framed from Martina's POV: she's the client who
    // briefed it). Different conv id so threads don't collide.
    {
      id: "m1",
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
      ],
      location: "Tulum · Beach Club lobby",
      date: "Sun, Jun 8",
      lastMessage: { sender: "coordinator", preview: "Sara: Sending you Marta's polaroids + 2 alternates today.", ageHrs: 1 },
      unreadCount: 2,
      pinned: {
        coordinatorNote: "Welcome — we'll handle talent + production end-to-end. You only see ${clientName} POV; lineup mechanics stay agency-side.",
      },
    },
    // m2 — Cocktail bar reopening (booked with a different agency)
    {
      id: "m2",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Cocktail bar reopening · 2 hosts · 4h evening",
      stage: "booked",
      agency: "Praline London",
      iAmCoordinator: false,
      source: { kind: "agency-referral", via: "Atelier Roma" },
      leader: { name: "Theo Marsh", role: "Coordinator · Praline London", initials: "TM" },
      participants: [
        { initials: "ZA", name: "Zara Habib", role: "Talent · Praline London", isTalent: true },
        { initials: "TN", name: "Tomás Navarro", role: "Talent · Praline London", isTalent: true },
        { initials: "VS", name: "Vincenzo Sera", role: "Bar manager · Martina" },
      ],
      location: "Tulum · Lobby bar",
      date: "Fri, Jun 13",
      amountToYou: "€1,800 (paid via card on file)",
      lastMessage: { sender: "coordinator", preview: "Theo: Call sheet attached. Hosts arrive at 18:30 · uniform from your wardrobe team.", ageHrs: 6 },
      unreadCount: 1,
      pinned: {
        schedule: "Jun 13 · 19:00–23:00 · floor + meet-and-greet",
        callTime: "18:30",
        coordinatorNote: "Both hosts have served at hospitality events for us before. They know Tulum hours.",
      },
    },
    // m3 — Influencer takeover weekend (wrapped, paid)
    {
      id: "m3",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Influencer takeover · 3 creators · weekend",
      stage: "past",
      outcome: "completed",
      agency: "Self-managed",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Lucia Ortiz", role: "Influencer manager · Self-managed", initials: "LO" },
      participants: [
        { initials: "LO", name: "Lucia Ortiz", role: "Creator", isTalent: true },
        { initials: "DA", name: "Diego Álvarez", role: "Creator", isTalent: true },
        { initials: "CR", name: "Camille Roux", role: "Creator", isTalent: true },
      ],
      location: "Tulum · Pool deck + bar",
      date: "May 10–11",
      amountToYou: "€4,200 (paid May 18 via transfer)",
      lastMessage: { sender: "system", preview: "Wrapped · 47 posts published · paid in full.", ageHrs: 480 },
      unreadCount: 0,
      pinned: {
        schedule: "May 10–11 · open weekend · creators set their own pace",
      },
    },
    // m4 — Fire dancer act for closing party (HOLD — pending decision)
    {
      id: "m4",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Fire dance act · summer closing party",
      stage: "hold",
      agency: "Reyes Movement Studio",
      iAmCoordinator: false,
      source: { kind: "direct", label: "Direct via portfolio" },
      leader: { name: "Marta Reyes", role: "Coordinator · Reyes Movement Studio", initials: "MR" },
      participants: [
        { initials: "MR", name: "Marta Reyes", role: "Coordinator + Talent", isTalent: true },
        { initials: "TJ", name: "Tariq Joubert", role: "Fire dancer", isTalent: true },
        { initials: "AN", name: "Anouk Naseri", role: "Fire dancer", isTalent: true },
      ],
      location: "Tulum · Beach Club main deck",
      date: "Sat, Sep 6",
      lastMessage: { sender: "coordinator", preview: "Marta: Holding Sep 6 for you. Need a yes by Friday so we can lock the dancers' calendars.", ageHrs: 26 },
      unreadCount: 1,
      pinned: {
        rate: { value: "€7,500 total · 3 dancers · 12-min set", status: "client-budget" },
        coordinatorNote: "Same crew as Solstice Festival closing. Insurance + rider already cleared with Solstice — we can reuse for you.",
      },
    },
    // m5 — Press launch hostess (CANCELLED — client had to pull)
    {
      id: "m5",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Press launch · 2 hostesses · single evening",
      stage: "cancelled",
      outcome: "client_cancelled",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "tulala-hub", label: "Tulala Hub · Hospitality vertical" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
        { initials: "ZH", name: "Zara Habib", role: "Talent · Praline London", isTalent: true },
      ],
      location: "Mexico City · Roma Norte popup",
      date: "Apr 28",
      lastMessage: { sender: "you", preview: "You: Cancelling the launch — venue pulled out. Will reach out for the next one.", ageHrs: 192 },
      unreadCount: 0,
      pinned: {
        coordinatorNote: "Cancelled with 2 weeks' notice — Acme waived the cancellation fee per our 8-bookings relationship.",
      },
    },
    // m6 — BRAND-NEW INQUIRY (just landed). Annual photoshoot for the
    // restaurant's print campaign. Demonstrates the NEW pill + coral
    // wash on the client inbox row + first inquiry from this agency.
    {
      id: "m6",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Annual print campaign · food + lifestyle · 2 days",
      stage: "inquiry",
      agency: "Acme Models",
      iAmCoordinator: false,
      source: { kind: "direct", label: "Direct via Acme Models site" },
      leader: { name: "Diego Figueroa", role: "Coordinator · Acme Models", initials: "DF" },
      participants: [
        { initials: "JT", name: "Julia Tenes", role: "Photographer (proposed)" },
      ],
      location: "Tulum · Beach Club deck + private dining room",
      date: "Aug 18–19",
      lastMessage: { sender: "coordinator", preview: "Diego: Your annual campaign brief just landed — proposing 2 talent + photographer for Aug 18–19. Range is comfortable. I'll send a shortlist + budget by EOD.", ageHrs: 0.4 },
      unreadCount: 2,
      seen: false,
      pinned: {
        coordinatorNote: "Brand-new agency relationship for you — Acme came in via your annual print campaign brief. Strong roster + production team in Tulum already.",
      },
    },
    // m7 — BRAND-NEW INQUIRY (referral, just landed). Smaller event
    // booking through a friend agency. Two unseen rows in the inbox
    // shows the NEW-on-top sort working.
    {
      id: "m7",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Tequila tasting · brand activation · 1 evening",
      stage: "inquiry",
      agency: "Praline London",
      iAmCoordinator: false,
      source: { kind: "agency-referral", via: "Atelier Roma" },
      leader: { name: "Theo Marsh", role: "Coordinator · Praline London", initials: "TM" },
      participants: [],
      location: "Tulum · Lobby bar + courtyard",
      date: "Wed, Aug 6",
      lastMessage: { sender: "coordinator", preview: "Theo: Atelier Roma referred you — we have 3 hostesses available for your Tequila Olmeca activation. Budget €1,800 total · 4h evening. Sending profiles now.", ageHrs: 0.2 },
      unreadCount: 1,
      seen: false,
      pinned: {
        coordinatorNote: "Praline London is Atelier Roma's UK partner. They handle our Europe-tier brand activations.",
      },
    },
    // m8 — IN FLIGHT (offer pending). Demonstrates the "needs you"
    // action flag on the inbox row + Approve flow inside the project tab.
    {
      id: "m8",
      client: "Martina Beach Club & Restaurant",
      clientInitials: "MB",
      clientTrust: "verified",
      brief: "Sunset wedding feature · couple shoot · 4h",
      stage: "hold",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "direct", label: "Direct via Atelier Roma" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "ER", name: "Emma Ricci", role: "Talent · Praline London", isTalent: true },
        { initials: "JR", name: "João Ribeiro", role: "Photographer" },
      ],
      location: "Tulum · Cenote + pool deck",
      date: "Sat, Jul 19",
      lastMessage: { sender: "coordinator", preview: "Sara: Offer ready — €4,200 for the talent + photographer + retouching. Approve below to lock the date.", ageHrs: 5 },
      unreadCount: 1,
      pinned: {
        rate: { value: "€4,200 total · 4h shoot · talent + photographer + retouch", status: "client-budget" },
        coordinatorNote: "Atelier Roma's standard couple-shoot package. Emma has shot here twice before — knows the cenote light.",
      },
    },
  ],

  gringo: [
    // g1 — Birthday yacht charter (active inquiry)
    {
      id: "g1",
      client: "The Gringo",
      clientInitials: "TG",
      clientTrust: "basic",
      brief: "Birthday charter · 4 hostesses · day-trip yacht",
      stage: "inquiry",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "MR", name: "Marta Reyes", role: "Talent · Acme Models", isTalent: true },
      ],
      location: "Ibiza · Marina Botafoch",
      date: "Sat, Jul 26",
      lastMessage: { sender: "coordinator", preview: "Sara: Verification pending — once funded the deal moves fast. Confirm card on file?", ageHrs: 4 },
      unreadCount: 2,
      pinned: {
        coordinatorNote: "Personal client (Basic trust). Marta's contact policy is set to allow Basic-tier with verified card. Card upload + identity check is the unlock.",
      },
    },
    // g2 — Past dinner party (one wrapped)
    {
      id: "g2",
      client: "The Gringo",
      clientInitials: "TG",
      clientTrust: "basic",
      brief: "Private dinner · 2 hostesses · 3h",
      stage: "past",
      outcome: "completed",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "ZA", name: "Zara Habib", role: "Talent · Praline London", isTalent: true },
        { initials: "AN", name: "Anouk Naseri", role: "Talent · Acme Models", isTalent: true },
      ],
      location: "Ibiza · Private villa",
      date: "Mar 15",
      amountToYou: "€1,200 (paid Mar 20 via card)",
      lastMessage: { sender: "system", preview: "Wrapped · paid in full.", ageHrs: 1200 },
      unreadCount: 0,
      pinned: {
        coordinatorNote: "Smooth booking. Both talents reported a good experience — green-light for repeat bookings.",
      },
    },
    // g3 — BRAND-NEW INQUIRY (just landed). Spontaneous request via
    // Instagram DM — most realistic Gringo-style channel. Tests the
    // NEW pill on a Basic-trust client (still gates on verification).
    {
      id: "g3",
      client: "The Gringo",
      clientInitials: "TG",
      clientTrust: "basic",
      brief: "Pool party · 6 hostesses · Saturday afternoon",
      stage: "inquiry",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [],
      location: "Ibiza · Hotel Eden private pool",
      date: "Sat, Aug 9",
      lastMessage: { sender: "coordinator", preview: "Sara: Pool party brief landed via your DM. 6 hostesses · 4h afternoon. Need card on file before we can shortlist (Basic-trust standard).", ageHrs: 0.5 },
      unreadCount: 2,
      seen: false,
      pinned: {
        coordinatorNote: "Personal client — verify card before sending profiles. Standard 50% deposit on confirmation, balance on the day.",
      },
    },
    // g4 — IN FLIGHT (booked, awaiting card-on-file balance). Booked
    // via past-relationship trust but balance still owing.
    {
      id: "g4",
      client: "The Gringo",
      clientInitials: "TG",
      clientTrust: "basic",
      brief: "Sunset boat trip · 3 hostesses · 5h evening",
      stage: "booked",
      agency: "Atelier Roma",
      iAmCoordinator: false,
      source: { kind: "instagram-dm" },
      leader: { name: "Sara Mendez", role: "Coordinator · Acme Models", initials: "SM" },
      participants: [
        { initials: "ZA", name: "Zara Habib", role: "Talent · Praline London", isTalent: true },
        { initials: "AN", name: "Anouk Naseri", role: "Talent · Acme Models", isTalent: true },
        { initials: "LO", name: "Lucia Ortiz", role: "Talent · Self-managed", isTalent: true },
      ],
      location: "Ibiza · Marina Botafoch → Cala Llonga",
      date: "Sat, Jul 12",
      amountToYou: "€2,400 booked · €1,200 balance owed",
      lastMessage: { sender: "coordinator", preview: "Sara: Booking locked. Deposit cleared. Balance €1,200 due 48h before sail.", ageHrs: 22 },
      unreadCount: 1,
      pinned: {
        callTime: "17:00 (board) · 22:00 (return)",
        schedule: "Jul 12 · 17:00 board · 18:00 sail · 21:30 return to marina",
        rate: { value: "€2,400 total · paid 50% deposit · €1,200 balance", status: "agreed" },
        coordinatorNote: "Captain Iván briefed — 3 hostesses on the upper deck, dinner served at sunset.",
      },
    },
  ],
};


export type Msg =
  | { id: string; kind: "text"; sender: ConvSender; body: string; ts: string; readBy?: ConvSender[] }
  | { id: string; kind: "image"; sender: ConvSender; caption?: string; count: number; ts: string }
  | { id: string; kind: "file"; sender: ConvSender; filename: string; sizeKB: number; ts: string }
  | { id: string; kind: "voice"; sender: ConvSender; durationSec: number; transcript?: string; ts: string }
  | { id: string; kind: "location"; sender: ConvSender; label: string; ts: string }
  | { id: string; kind: "system"; body: string; ts: string }
  | { id: string; kind: "action-rate"; ts: string; resolved?: string }
  | { id: string; kind: "action-transport"; ts: string; options: string[]; resolved?: string }
  | { id: string; kind: "action-confirm"; label: string; ts: string; resolved?: boolean }
  | { id: string; kind: "calendar-invite"; ts: string; title: string; date: string; resolved?: "yes" | "no" }
  | { id: string; kind: "contract-sign"; ts: string; filename: string; resolved?: boolean }
  | { id: string; kind: "polaroid-request"; ts: string; resolved?: number }
  | { id: string; kind: "payment-receipt"; ts: string; amount: string; method: string };


// "workspace" = the System User. Represents the workspace itself
// (Atelier Roma, Acme Models, etc.) rather than any individual member.
// Used for system-routed messages (booking confirmations, reassign
// events, automated nudges) and for outbound posts a coordinator
// chooses to send "as the workspace" rather than as themselves.
// Renders with the workspace logo + name in chat bubbles, gives
// agencies a coherent voice across coordinator handoffs.
type ConvSender = "you" | "client" | "coordinator" | "agency" | "workspace";
