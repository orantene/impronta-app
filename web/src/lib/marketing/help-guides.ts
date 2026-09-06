import { RESTAURANTS, SALONS, SHOPS } from "./help-guides-businesses";
import type { HelpGuideRoleContent } from "./help-guides-types";
import { PLAN_SEAT_CAPS } from "@/lib/saas/plan-seat-caps";
import { PLAN_LIMITS } from "@/lib/access/plan-limits";

export type { HelpGuide, HelpGuideRoleContent, HelpGuideTranslation } from "./help-guides-types";

/**
 * Audiences /help is written for.
 *
 * The first four are the talent-agency shapes this product started as. The
 * last three are businesses that sell their own work — the shape that is
 * actually onboarding now, and which until these existed was handed roster and
 * commission instructions for a business it does not run.
 */
export const HELP_GUIDE_ROLES = [
  "operators",
  "agencies",
  "talents",
  "clients",
  "restaurants",
  "salons",
  "shops",
] as const;
export type HelpGuideRole = (typeof HELP_GUIDE_ROLES)[number];

export function isHelpGuideRole(s: string): s is HelpGuideRole {
  return (HELP_GUIDE_ROLES as readonly string[]).includes(s);
}

const AGENCY_ROLE_LABELS: Record<
  "operators" | "agencies" | "talents" | "clients",
  HelpGuideRoleContent
> = {
  operators: {
    title: "Help for independent operators",
    intro:
      "Independent operators run a roster on their own, no agency, no staff, just you and the people you represent. Tulala gives you a polished public URL, an inquiry pipeline that doesn't live in your DMs, and a free plan that stays free until you outgrow it.",
    guides: [
      {
        heading: "Claim your free Tulala URL",
        body:
          "Visit /get-started, pick \"Independent operator,\" enter your name + email, choose your link name (e.g. tulala.digital/your-name), and click \"Create my free workspace.\" Your public roster goes live immediately, no credit card, no review queue.",
      },
      {
        heading: "Add your first 5 people",
        body:
          "Inside your workspace go to Roster → Add talent. You can either invite someone to claim and edit their own profile (they get a magic link) or manually fill the profile yourself. Free plan caps at 10 profiles; Studio at 50.",
      },
      {
        heading: "Send your first inquiry",
        body:
          "Once a client reaches out (DM, email, WhatsApp), open New Inquiry from your dashboard. Type their name, the gig brief, when + where, and which people you're considering. Tulala drafts the offer and tracks it through to confirmation.",
      },
      {
        heading: "Move clients off WhatsApp",
        body:
          "Every inquiry has a shareable link. Send it instead of forwarding photos and PDFs through chat. Clients can browse the proposed talent, approve, request changes, and you have a real timeline + audit log instead of scrollback.",
      },
      {
        heading: "When to upgrade to Studio ($29/mo)",
        body:
          `Studio raises your roster to ${PLAN_SEAT_CAPS.studio} profiles and your team to ${PLAN_LIMITS.studio.max_team_seats} seats. Worth it once you've hit ~10 inquiries/month or want to bring on a coordinator.`,
      },
    ],
    ctaPrimary: { label: "Start free", href: "/get-started?audience=operator" },
  },
  agencies: {
    title: "Help for representation agencies",
    intro:
      "Tulala runs the full talent agency stack: branded site on your own domain, taxonomy-driven roster, multi-seat team with role-scoped access, CMS pages, inquiry → offer → booking pipeline, commission splits, Stripe Connect payouts.",
    guides: [
      {
        heading: "Set up your custom domain",
        body:
          "Settings → Workspace → Domain. Add the domain you own (e.g. agency-name.com). Tulala issues an SSL cert automatically. DNS instructions are shown in the panel, typically a CNAME or A record. SSL is usually live within 5 minutes of correct DNS.",
      },
      {
        heading: "Curate your talent types",
        body:
          "Settings → Roster & profile fields → Categories on your site → Manage. Toggle which talent categories your agency accepts. Disabled categories disappear from Add Talent forms, public registration, and the directory. EN + ES labels can be overridden per category.",
      },
      {
        heading: "Add coordinators + role-scope access",
        body:
          "Settings → Team & legal → invite by email. Each seat gets one of: Viewer (read-only), Editor (can update profiles), Manager (can send inquiries), Admin (full ops), Owner (one per workspace, can change billing). Inquiry coordination is scoped per-inquiry, a coordinator on one job isn't automatically on the next.",
      },
      {
        heading: "Wire Stripe for booking payments + commission splits",
        body:
          "Settings → Plan & integrations → Stripe Connect. Authorize the platform. Per-talent payout accounts get provisioned automatically once you add a talent's payout method. The booking → invoice → payout flow lives at Operations → Bookings.",
      },
      {
        heading: "Branded inquiry inbox + CMS pages",
        body:
          "Your branded site at your custom domain has full CMS-driven page editing under Website. Inquiry inbox lives at Messages, combined view across all open inquiries with status pills, lineup, offer, event details, files. Status messages and offers are versioned with audit history.",
      },
      {
        heading: "Multi-currency + LATAM-friendly",
        body:
          "Set Settings → Workspace → Default currency. Inquiry pricing, offers, and Stripe transactions all use that currency. Multi-currency talent roster supported, each talent has their own default_currency that flows through to their payout.",
      },
    ],
    ctaPrimary: { label: "Start a 14-day Agency trial", href: "/get-started?audience=agency" },
  },
  talents: {
    title: "Help for talents on a roster",
    intro:
      "If you're on an agency's roster (or you have your own Tulala link as an independent talent), this is where you manage everything a client sees about you, your profile, your availability, your bookings, and your earnings.",
    guides: [
      {
        heading: "Edit your profile",
        body:
          "Sign in, click Talent → Profile. Update your name, languages, height/measurements, social handles, portfolio photos, and a short bio. All fields support EN + ES. Photo uploads take a few minutes to process; you'll see a green pill once they're ready.",
      },
      {
        heading: "Build your personal site (Pro+)",
        body:
          "On the Pro tier ($9/mo) you get a personal landing page at tulala.digital/<your-slug> with 3 templates. On Portfolio ($15/mo) you get all 7 templates + custom composition mode (drag-and-drop sections). Build it under Talent → My Site.",
      },
      {
        heading: "Set your availability",
        body:
          "Talent → Calendar. Mark dates as Available, Hold, or Unavailable. When a client requests you for a specific date, the inquiry flow shows your availability state so the agency can match you correctly. Update weekly so coordination doesn't waste anyone's time.",
      },
      {
        heading: "Manage your bookings + earnings",
        body:
          "Talent → Money. Shows confirmed bookings, pending payouts, and lifetime earnings by currency. PDF income summary for taxes available year-by-year. Pay attention to the commission split, agency rate is shown per booking before you accept.",
      },
      {
        heading: "Connect your payout method",
        body:
          "Talent → Settings → Payouts. Connect via Stripe (bank, card, or local rail depending on country). Once verified you receive payouts automatically when bookings close. The first payout has a 7-day hold; subsequent ones are 2 business days.",
      },
      {
        heading: "Switch between agencies",
        body:
          "If multiple agencies represent you, Talent → Reach → Agencies shows each one and your exclusivity status. You can only have one exclusive agency at a time; non-exclusive arrangements let you accept work via any of them.",
      },
    ],
    ctaPrimary: { label: "Sign in", href: "/login" },
  },
  clients: {
    title: "Help for clients booking talent",
    intro:
      "Tulala makes booking talent feel less like emailing PDFs back and forth. Browse the roster, pick the people you want, send one inquiry, and we draft the offer + handle approvals + collect payment.",
    guides: [
      {
        heading: "Browse the directory",
        body:
          "Hit the agency's main URL (e.g. improntamodels.com) and click Discover or Directory. Filter by city, height, availability, experience level, languages. Click any card to open the full profile with portfolio, measurements, and an Inquire button.",
      },
      {
        heading: "Send an inquiry",
        body:
          "From any talent profile, click \"Inquire about <name>.\" Tell us the gig: brief, date, location, budget. Add other talent to the same inquiry from your lineup (top-right). Submit. The agency receives a unified inquiry with all the talent you've selected.",
      },
      {
        heading: "Approve or counter an offer",
        body:
          "Once the agency drafts an offer (usually within 24 hours), you get an email with a link. Review the offer: which talent, dates, locations, rates, commission split. You can approve, request changes, or decline. All revisions are tracked in the inquiry timeline.",
      },
      {
        heading: "Pay for a confirmed booking",
        body:
          "When the offer is approved, the agency sends a payment request. Pay by card (Stripe), bank transfer, or platform credit. Funds are held in escrow until the booking is delivered, then split between the agency and the talent automatically per the agreed commission.",
      },
      {
        heading: "Build a shortlist for future projects",
        body:
          "Save talent to your favorites list (heart icon on each card). When you have a new gig, open the shortlist, send one inquiry, and the whole list goes to the agency at once. Useful for repeat clients running multiple campaigns per quarter.",
      },
    ],
    ctaPrimary: { label: "Browse a directory", href: "https://improntamodels.com/directory" },
  },
};

/**
 * Every audience, agency shapes and business shapes together.
 *
 * Consumers iterate this rather than the two halves: the /help pages, the
 * cross-links between roles, and the guest AI grounding corpus all pick it up
 * without knowing a business guide is a different kind of thing, because it
 * is not.
 */
export const ROLE_LABELS: Record<HelpGuideRole, HelpGuideRoleContent> = {
  ...AGENCY_ROLE_LABELS,
  restaurants: RESTAURANTS,
  salons: SALONS,
  shops: SHOPS,
};
