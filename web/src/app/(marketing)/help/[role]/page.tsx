import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ role: string }> };

const ROLES = ["operators", "agencies", "talents", "clients"] as const;
type Role = (typeof ROLES)[number];

function isRole(s: string): s is Role {
  return (ROLES as readonly string[]).includes(s);
}

type Guide = {
  heading: string;
  body: string;
};

type RoleContent = {
  title: string;
  intro: string;
  guides: Guide[];
  ctaPrimary: { label: string; href: string };
};

const ROLE_LABELS: Record<Role, RoleContent> = {
  operators: {
    title: "Help for independent operators",
    intro:
      "Independent operators run a roster on their own — no agency, no staff, just you and the people you represent. Tulala gives you a polished public URL, an inquiry pipeline that doesn't live in your DMs, and a free plan that stays free until you outgrow it.",
    guides: [
      {
        heading: "Claim your free Tulala URL",
        body:
          "Visit /get-started, pick \"Independent operator,\" enter your name + email, choose your link name (e.g. tulala.digital/your-name), and click \"Create my free workspace.\" Your public roster goes live immediately — no credit card, no review queue.",
      },
      {
        heading: "Add your first 5 people",
        body:
          "Inside your workspace go to Roster → Add talent. You can either invite someone to claim and edit their own profile (they get a magic link) or manually fill the profile yourself. Free plan caps at 5 profiles; Studio at 50.",
      },
      {
        heading: "Send your first inquiry",
        body:
          "Once a client reaches out (DM, email, WhatsApp), open New Inquiry from your dashboard. Type their name, the gig brief, when + where, and which people you're considering. Tulala drafts the offer and tracks it through to confirmation.",
      },
      {
        heading: "Move clients off WhatsApp",
        body:
          "Every inquiry has a shareable link. Send it instead of forwarding photos and PDFs through chat. Clients can browse the proposed talent, approve, request changes — and you have a real timeline + audit log instead of scrollback.",
      },
      {
        heading: "When to upgrade to Studio ($49/mo)",
        body:
          "Studio adds WhatsApp inquiry notifications (so you never miss a fresh DM-to-inquiry conversion), up to 50 profiles, up to 3 seats, and priority email routing. Worth it once you've hit ~10 inquiries/month or want to bring on a coordinator.",
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
          "Settings → Workspace → Domain. Add the domain you own (e.g. agency-name.com). Tulala issues an SSL cert automatically. DNS instructions are shown in the panel — typically a CNAME or A record. SSL is usually live within 5 minutes of correct DNS.",
      },
      {
        heading: "Curate your talent types",
        body:
          "Settings → Roster → Categories on your site → Manage. Toggle which talent categories your agency accepts. Disabled categories disappear from Add Talent forms, public registration, and the directory. EN + ES labels can be overridden per category.",
      },
      {
        heading: "Add coordinators + role-scope access",
        body:
          "Settings → Team & legal → invite by email. Each seat gets one of: Viewer (read-only), Editor (can update profiles), Manager (can send inquiries), Admin (full ops), Owner (one per workspace, can change billing). Inquiry coordination is scoped per-inquiry — a coordinator on one job isn't automatically on the next.",
      },
      {
        heading: "Wire Stripe for booking payments + commission splits",
        body:
          "Settings → Plan & integrations → Stripe Connect. Authorize the platform. Per-talent payout accounts get provisioned automatically once you add a talent's payout method. The booking → invoice → payout flow lives at Operations → Bookings.",
      },
      {
        heading: "Branded inquiry inbox + CMS pages",
        body:
          "Your branded site at your custom domain has full CMS-driven page editing under Website. Inquiry inbox lives at Messages — combined view across all open inquiries with status pills, lineup, offer, event details, files. Status messages and offers are versioned with audit history.",
      },
      {
        heading: "Multi-currency + LATAM-friendly",
        body:
          "Set Settings → Workspace → Default currency. Inquiry pricing, offers, and Stripe transactions all use that currency. Multi-currency talent roster supported — each talent has their own default_currency that flows through to their payout.",
      },
    ],
    ctaPrimary: { label: "Start a 14-day Agency trial", href: "/get-started?audience=agency" },
  },
  talents: {
    title: "Help for talents on a roster",
    intro:
      "If you're on an agency's roster (or you have your own Tulala link as an independent talent), this is where you manage everything a client sees about you — your profile, your availability, your bookings, and your earnings.",
    guides: [
      {
        heading: "Edit your profile",
        body:
          "Sign in, click Talent → Profile. Update your name, languages, height/measurements, social handles, portfolio photos, and a short bio. All fields support EN + ES. Photo uploads take a few minutes to process; you'll see a green pill once they're ready.",
      },
      {
        heading: "Build your personal site (Pro+)",
        body:
          "On the Pro tier ($12/mo) you get a personal landing page at tulala.digital/<your-slug> with 3 templates. On Max ($29/mo) you get all 7 templates + custom composition mode (drag-and-drop sections). Build it under Talent → My Site.",
      },
      {
        heading: "Set your availability",
        body:
          "Talent → Calendar. Mark dates as Available, Hold, or Unavailable. When a client requests you for a specific date, the inquiry flow shows your availability state so the agency can match you correctly. Update weekly so coordination doesn't waste anyone's time.",
      },
      {
        heading: "Manage your bookings + earnings",
        body:
          "Talent → Money. Shows confirmed bookings, pending payouts, and lifetime earnings by currency. PDF income summary for taxes available year-by-year. Pay attention to the commission split — agency rate is shown per booking before you accept.",
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
          "From any talent profile, click \"Inquire about <name>.\" Tell us the gig: brief, date, location, budget. Add other talent to the same inquiry from your cart (top-right). Submit. The agency receives a unified inquiry with all the talent you've selected.",
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { role } = await params;
  if (!isRole(role)) return { title: "Help — Tulala" };
  const c = ROLE_LABELS[role];
  return {
    title: `${c.title} — Tulala`,
    description: c.intro.slice(0, 160),
  };
}

export default async function HelpRolePage({ params }: Props) {
  const { role } = await params;
  if (!isRole(role)) notFound();

  const c = ROLE_LABELS[role];

  return (
    <main
      style={{
        padding: "64px 24px",
        maxWidth: 760,
        margin: "0 auto",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <Link
        href="/help"
        style={{ color: "#1f4a3a", fontSize: "0.85rem", textDecoration: "underline" }}
      >
        ← All help topics
      </Link>
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          marginTop: 16,
          marginBottom: 16,
        }}
      >
        {c.title}
      </h1>
      <p
        style={{
          color: "#555",
          fontSize: "1.05rem",
          lineHeight: 1.55,
          marginBottom: 48,
        }}
      >
        {c.intro}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {c.guides.map((g, i) => (
          <article
            key={i}
            style={{
              padding: "20px 22px",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              background: "#fff",
            }}
          >
            <h2
              style={{
                fontSize: "1.1rem",
                fontWeight: 600,
                marginBottom: 8,
                letterSpacing: "-0.01em",
              }}
            >
              {g.heading}
            </h2>
            <p style={{ color: "#444", fontSize: "0.95rem", lineHeight: 1.6 }}>{g.body}</p>
          </article>
        ))}
      </div>

      <div
        style={{
          marginTop: 48,
          padding: "20px 22px",
          background: "#f0f5f1",
          borderRadius: 12,
          fontSize: "0.95rem",
          color: "#1f4a3a",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <strong>Still stuck?</strong>
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          Email{" "}
          <a
            href="mailto:help@tulala.digital"
            style={{ color: "#1f4a3a", textDecoration: "underline" }}
          >
            help@tulala.digital
          </a>
          {" "}— we read every message and respond inside 24 hours.
        </p>
        <Link
          href={c.ctaPrimary.href}
          style={{
            display: "inline-block",
            marginTop: 4,
            padding: "10px 18px",
            background: "#1f4a3a",
            color: "#fff",
            borderRadius: 999,
            textDecoration: "none",
            fontSize: "0.9rem",
            fontWeight: 600,
            alignSelf: "flex-start",
          }}
        >
          {c.ctaPrimary.label} →
        </Link>
      </div>

      <nav
        style={{
          marginTop: 40,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          paddingTop: 24,
          borderTop: "1px solid #e5e5e5",
        }}
      >
        {ROLES.filter((r) => r !== role).map((other) => (
          <Link
            key={other}
            href={`/help/${other}`}
            style={{
              fontSize: "0.9rem",
              color: "#1f4a3a",
              textDecoration: "underline",
            }}
          >
            {ROLE_LABELS[other].title}
          </Link>
        ))}
      </nav>
    </main>
  );
}
