import { CASE_STUDY_PHOTOS } from "@/lib/marketing/photography";

/**
 * Story content for the marketing "Stories" section. Kept in its own module so
 * the section component stays focused on rendering. Each study is illustrative
 * (links are example subdomains) until real customer pages connect.
 */

export type Motion = "Talent" | "Business" | "Hub" | "Hybrid";

export type CaseStudy = {
  key: keyof typeof CASE_STUDY_PHOTOS;
  motion: Motion;
  plan: string;
  persona: string;
  role: string;
  location: string;
  cardTitle: string;
  cardSummary: string;
  challenge: string;
  approach: string[];
  outcome: { stat: string; label: string }[];
  quote: string;
  link: string;
  tags: string[];
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    key: "singer",
    motion: "Talent",
    plan: "Talent · Max",
    persona: "Daniela Sol",
    role: "Indie singer-songwriter",
    location: "Mexico City",
    cardTitle: "A booking page that sounds like her record",
    cardSummary:
      "Daniela turned a free profile into a personal site with her music built in — and venues book her without a single DM.",
    challenge:
      "Daniela booked gigs through Instagram DMs and a link-in-bio. Promoters couldn't hear her, see her rider, or check a date without three back-and-forth messages — and half never replied.",
    approach: [
      "Built a personal site in one click, then embedded her Spotify and a live reel with the page builder",
      "Published a rate card and availability so venues self-qualify before reaching out",
      "Takes requests through the booking messenger — quote, deposit, and contract in one thread",
      "Upgraded to Talent · Max for a custom domain and unlimited media",
    ],
    outcome: [
      { stat: "3×", label: "more booking requests" },
      { stat: "48 hrs", label: "avg. to a confirmed gig" },
      { stat: "$0", label: "spent on a web developer" },
    ],
    quote: "My link finally sounds like my music. Venues show up already knowing the price.",
    link: "danielasol.tulala.digital",
    tags: ["Page builder", "Spotify embed", "Reservations"],
  },
  {
    key: "massage",
    motion: "Talent",
    plan: "Talent · Max",
    persona: "Renata Cruz",
    role: "Mobile massage therapist",
    location: "Playa del Carmen",
    cardTitle: "Fully booked from one calm link",
    cardSummary:
      "A solo therapist replaced phone-tag with an online reservation page — clients book and pay a deposit while she's mid-session.",
    challenge:
      "Renata lost bookings every time she was on the table and couldn't pick up the phone. Chasing no-shows ate her evenings.",
    approach: [
      "Created a serene one-page site with services, durations, and prices via the page builder",
      "Turned on reservations so clients pick a slot and pay a deposit instantly",
      "Confirmations, reminders, and rescheduling run inside the booking messenger",
      "Offers at-home and in-studio options at different rates",
    ],
    outcome: [
      { stat: "−90%", label: "no-shows after deposits" },
      { stat: "15 hrs", label: "saved on scheduling / mo" },
      { stat: "24/7", label: "booking, even mid-session" },
    ],
    quote: "I haven't answered a 'how much, are you free?' text in months. It just books itself.",
    link: "renata.tulala.digital",
    tags: ["Reservations", "Deposits", "Page builder"],
  },
  {
    key: "wedding",
    motion: "Talent",
    plan: "Talent · Pro",
    persona: "Mateo Ríos",
    role: "Wedding photographer",
    location: "Riviera Maya",
    cardTitle: "Inquiry to signed contract without leaving the chat",
    cardSummary:
      "Mateo books destination weddings end to end — gallery, quote, deposit, and contract — all inside the booking messenger.",
    challenge:
      "Destination couples wanted to see work, get a custom quote, and sign quickly across time zones. Email threads and PDFs slowed every booking to a crawl.",
    approach: [
      "Published a portfolio site with packages and FAQs using the page builder",
      "Couples send an inquiry; Mateo replies with a versioned offer in the booking messenger",
      "Collects the deposit and e-signature in the same thread — no separate invoice tool",
      "Keeps every wedding's files, dates, and payments in one place",
    ],
    outcome: [
      { stat: "2 days", label: "inquiry → signed, on avg." },
      { stat: "+40%", label: "booking conversion" },
      { stat: "1 thread", label: "per wedding, start to finish" },
    ],
    quote: "Couples sign before another photographer even sends their PDF.",
    link: "mateorios.tulala.digital",
    tags: ["Booking messenger", "Offers & deposits", "Weddings"],
  },
  {
    key: "tattoo",
    motion: "Talent",
    plan: "Talent · Max",
    persona: "Iván Mora",
    role: "Tattoo artist",
    location: "Tulum",
    cardTitle: "A waitlist that screens itself",
    cardSummary:
      "Iván swapped a chaotic DM waitlist for a reservation flow with deposits — only serious clients get a slot.",
    challenge:
      "Iván's DMs were full of 'how much?' with no-shows burning prime chair time. Flash drops turned into 200 unanswered messages.",
    approach: [
      "Built a gallery-first site for flash and custom work with the page builder",
      "Clients request a slot and pay a booking deposit to hold it",
      "Custom-piece consults and final designs run through the booking messenger",
      "Flash drops post as bookable inventory — first deposit wins",
    ],
    outcome: [
      { stat: "100%", label: "deposit-backed bookings" },
      { stat: "0", label: "prime-time no-shows" },
      { stat: "5 min", label: "to clear a flash drop" },
    ],
    quote: "Deposits filter the tire-kickers. My chair is booked with people who actually show.",
    link: "ivanmora.tulala.digital",
    tags: ["Reservations", "Deposits", "Gallery site"],
  },
  {
    key: "band",
    motion: "Business",
    plan: "Business · Studio",
    persona: "Costa Brava Collective",
    role: "7-piece live band",
    location: "Cancún & Riviera Maya",
    cardTitle: "Seven musicians, one workspace, split payouts",
    cardSummary:
      "A band runs gigs like a business — shared calendar, one booking site, and automatic per-member payout splits.",
    challenge:
      "Coordinating seven musicians' availability, one bank account, and who-gets-paid-what after every gig was a spreadsheet nightmare.",
    approach: [
      "Spun up a Studio workspace with a booking site built in one click",
      "Each member has a role; the shared calendar blocks dates the moment a gig confirms",
      "Event inquiries → offer → deposit → balance run through the booking messenger",
      "Payouts split automatically per member when an event is paid",
    ],
    outcome: [
      { stat: "7", label: "members, one workspace" },
      { stat: "auto", label: "payout splits per gig" },
      { stat: "+60%", label: "corporate event bookings" },
    ],
    quote: "We finally operate like a company, not a group chat with instruments.",
    link: "costabrava.tulala.digital",
    tags: ["Workspace", "Team roles", "Split payouts"],
  },
  {
    key: "salon",
    motion: "Business",
    plan: "Business · Studio",
    persona: "Casa Rizo",
    role: "Hair salon",
    location: "Tulum",
    cardTitle: "Every chair booked, every stylist on one site",
    cardSummary:
      "A salon put its whole team online — clients pick a stylist, see the price, and book a chair with a deposit.",
    challenge:
      "Five stylists, one phone, and a paper book. Double-bookings and walk-in gaps cost real money every week.",
    approach: [
      "Built a branded salon site with the page builder — services, team, and prices",
      "Each stylist has a bookable calendar; clients choose who and when",
      "Deposits hold the chair; reminders cut the no-shows",
      "The front desk runs the whole day from one workspace inbox",
    ],
    outcome: [
      { stat: "−75%", label: "double-bookings" },
      { stat: "+30%", label: "chair utilization" },
      { stat: "5", label: "stylists, one calendar" },
    ],
    quote: "The book runs itself now. We just cut hair.",
    link: "casarizo.tulala.digital",
    tags: ["Per-stylist booking", "Deposits", "Workspace"],
  },
  {
    key: "models",
    motion: "Business",
    plan: "Business · Agency",
    persona: "Impronta Models",
    role: "Talent & model agency",
    location: "Riviera Maya",
    cardTitle: "An agency roster that books itself",
    cardSummary:
      "Impronta runs a custom-domain roster site and a full inquiry-to-booking pipeline — every request traced to the talent who earned it.",
    challenge:
      "Sending model packages over WhatsApp made a real agency look like a contact. Nothing was structured, nothing was traceable, and rates leaked.",
    approach: [
      "Launched a branded roster site on its own domain with the page builder",
      "Each model has a proper profile — specs, portfolio, availability",
      "Clients inquire; the agency sends versioned offers and converts to bookings in the messenger",
      "Commission and exclusivity tracked automatically per booking",
    ],
    outcome: [
      { stat: "1", label: "branded home for the roster" },
      { stat: "100%", label: "inquiries traced to source" },
      { stat: "+45%", label: "booking conversion" },
    ],
    quote: "We look like the agency we always were — and nothing slips through the cracks.",
    link: "impronta.tulala.digital",
    tags: ["Custom domain", "Inquiry pipeline", "Commission"],
  },
  {
    key: "fitness",
    motion: "Business",
    plan: "Business · Studio",
    persona: "Flota",
    role: "Pilates & movement studio",
    location: "Mexico City",
    cardTitle: "Class packs, memberships, and a site in a weekend",
    cardSummary:
      "A boutique studio launched online bookings, class packs, and an instructor roster without hiring a developer.",
    challenge:
      "Flota ran classes off a messaging app and a notebook. Selling class packs and tracking who'd paid was guesswork.",
    approach: [
      "Built a studio site with schedule, instructors, and pricing via the page builder",
      "Clients reserve a spot in a class and buy multi-class packs",
      "Waitlists and reminders run through the booking messenger",
      "Instructors get role-scoped access to their own schedules",
    ],
    outcome: [
      { stat: "1 weekend", label: "to launch online" },
      { stat: "+50%", label: "class-pack revenue" },
      { stat: "full", label: "classes, real waitlists" },
    ],
    quote: "We sold out our first week of packs before the paint was dry.",
    link: "flota.tulala.digital",
    tags: ["Class booking", "Packages", "Workspace"],
  },
  {
    key: "cityhub",
    motion: "Hub",
    plan: "Hub",
    persona: "Riviera Maya Work",
    role: "City services hub",
    location: "Playa del Carmen → Tulum",
    cardTitle: "The local jobs network for an entire coast",
    cardSummary:
      "A hub aggregates vetted cleaners, hosts, drivers, and handypeople — workers apply, clients browse and book in one place.",
    challenge:
      "Great local workers — housekeepers, hosts, drivers — had no shared, trustworthy place to be found. Villa managers re-hired blind every season.",
    approach: [
      "Launched a Hub workspace with a browse-and-filter directory of local pros",
      "Workers apply to join; the hub vets and approves them",
      "Clients filter by service, area, and availability, then book through the messenger",
      "Inquiry routing keeps each booking attributed to the right pro",
    ],
    outcome: [
      { stat: "120+", label: "vetted local pros" },
      { stat: "6", label: "service categories" },
      { stat: "1", label: "trusted place to hire" },
    ],
    quote: "Villa managers stopped gambling on strangers. They hire from the hub.",
    link: "rivieramayawork.tulala.digital",
    tags: ["Applications", "Browse & filter", "Inquiry routing"],
  },
  {
    key: "chefs",
    motion: "Hub",
    plan: "Hub",
    persona: "Tulum Private Chefs",
    role: "Culinary hub",
    location: "Tulum",
    cardTitle: "A curated chef collective guests actually find",
    cardSummary:
      "A culinary hub lists private chefs by cuisine and party size — guests browse menus and book a dinner in minutes.",
    challenge:
      "Independent private chefs competed on scattered listings and DMs. Guests couldn't compare menus or trust who'd show up.",
    approach: [
      "Built a Hub workspace presenting each chef with menus, photos, and pricing",
      "Chefs apply and publish sample menus through their own profiles",
      "Guests request a date and party size; chefs quote and confirm in the messenger",
      "Deposits secure the booking and the grocery run",
    ],
    outcome: [
      { stat: "25", label: "curated private chefs" },
      { stat: "+70%", label: "bookings vs. solo listings" },
      { stat: "menus", label: "compared before they book" },
    ],
    quote: "Guests pick a chef and a menu like ordering a table — except it comes to the villa.",
    link: "tulumchefs.tulala.digital",
    tags: ["Menus & profiles", "Booking messenger", "Deposits"],
  },
  {
    key: "villa",
    motion: "Hub",
    plan: "Hub",
    persona: "Maya Hospitality Co-op",
    role: "Villa services hub",
    location: "Riviera Maya",
    cardTitle: "Concierge, housekeeping, and chefs under one roof",
    cardSummary:
      "A hospitality co-op gives villa managers one place to staff every stay — concierge, cleaning, chefs, and drivers on demand.",
    challenge:
      "Luxury-rental managers juggled a dozen vendors per property. One bad link in the chain ruined a guest's stay — and the review.",
    approach: [
      "Created a Hub workspace bundling every service a villa needs",
      "Each vendor is a vetted member with availability and rates",
      "Managers assemble a stay's staff and book it all through the messenger",
      "One booking thread, one source of truth per property",
    ],
    outcome: [
      { stat: "8", label: "services, one hub" },
      { stat: "5★", label: "stays, staffed reliably" },
      { stat: "10 min", label: "to staff a full week" },
    ],
    quote: "I staff an entire villa for a week in ten minutes instead of ten phone calls.",
    link: "mayahospitality.tulala.digital",
    tags: ["Multi-service", "Vetted vendors", "Inquiry routing"],
  },
  {
    key: "hybrid",
    motion: "Hybrid",
    plan: "Talent + Workspace",
    persona: "Sofía León",
    role: "Makeup artist → founder, Glow Studio",
    location: "Guadalajara",
    cardTitle: "She started as the talent. Now she runs the studio.",
    cardSummary:
      "Sofía kept her personal talent page and added a workspace for her growing team — one account, two sides of the business.",
    challenge:
      "Sofía outgrew solo bookings. She wanted to bring on two artists and take bigger jobs — without losing her personal brand or starting over.",
    approach: [
      "Kept her Talent page for personal clients and bookings",
      "Opened a Studio workspace, Glow Studio, for the team and bigger events",
      "Toggles between her talent profile and the workspace from one login",
      "Routes solo gigs to herself and event jobs to the team via the messenger",
    ],
    outcome: [
      { stat: "1", label: "account, talent + business" },
      { stat: "3", label: "artists under Glow Studio" },
      { stat: "2×", label: "average job size" },
    ],
    quote: "I didn't have to choose between being the artist and building the business. I'm both.",
    link: "glowstudio.tulala.digital",
    tags: ["Talent + workspace", "Team", "One login"],
  },
];

export type Filter = { label: string; value: Motion | null };

export const FILTERS: Filter[] = [
  { label: "All stories", value: null },
  { label: "Talent", value: "Talent" },
  { label: "Business", value: "Business" },
  { label: "Hubs", value: "Hub" },
  { label: "Hybrid", value: "Hybrid" },
];
