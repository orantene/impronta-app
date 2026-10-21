import type { HelpEntry } from "./help-registry";

/**
 * Help for the first Edition pillars that the talent dashboard did not have an
 * entry for (TUL-1392): promos, posts, client accounts, getting found on Google
 * and support. Payments and plans, themes and service display are already
 * covered by talent-deposits, talent-payouts, talent-plan, talent-design and
 * talent-services. Labels come from the dashboard strings (messages/*.json and
 * lib/promos/copy/talent.ts), in Spanish first with the English in brackets.
 * Spanish twins live in lib/support/help-corpus-es-edition.ts.
 */
export const TALENT_EDITION_HELP: Record<string, HelpEntry> = {
  "talent-promos": {
    audience: "Talent",
    category: "Promos",
    purpose:
      "Promos lets you offer a discount, a free extra or a secret code to fill the days you have free. The offer shows on your public page and is applied when a client books.",
    youCanHere: [
      "Open Promos and tap Nueva (New), then pick a reason such as Llena tu semana (Fill your week), Último momento (Last minute) or Código secreto (Secret code)",
      "Set the Descuento (Discount), the Fechas (Dates) and the Cupo (Spots) for the offer",
      "See Así lo verán (How clients see it) and your estimated earnings before you go live",
      "Publicar (Publish) it now, Programar (Schedule) it, or Guardar borrador (Save draft)",
      "Follow your promos in the Activas (Live), Programadas (Scheduled) and Pasadas (Past) tabs",
    ],
    ticketCategory: "Billing",
    faqs: [
      {
        q: "How do I create a promo?",
        a: "Open Promos and tap Nueva (New). Pick a reason, adjust the Descuento (Discount), Fechas (Dates) and Cupo (Spots), check Así lo verán (How clients see it) and tap Publicar (Publish).",
      },
      {
        q: "Is my first promo free?",
        a: "Yes. The free plan includes one trial promo, up to 7 days and 5 uses. With Pro you can publish as many as you want, plus codes and personal offers.",
      },
      {
        q: "How do I make a promo code?",
        a: "Pick Código secreto (Secret code) as the reason, or choose Con código (With a code) under Cómo se activa (How it turns on). Codes are part of Pro. Clients type the code under Have a code? when they book.",
      },
      {
        q: "How do I pause or end a promo?",
        a: "Open the promo from the Activas (Live) tab and use Activar o pausar (Turn on or pause). Bookings already made keep their price.",
      },
      {
        q: "What does the client see?",
        a: "The old price crossed out, the new price, and how many spots are left. At checkout the discount shows as its own line. If the offer runs out while they book, nothing is charged and they see the regular price.",
      },
    ],
  },
  "talent-posts": {
    audience: "Talent",
    category: "Posts (Website)",
    purpose:
      "Posts are short articles on your own website. They help people find you on Google. You find them under Website, then Posts.",
    youCanHere: [
      "Open Posts and tap New post (Nuevo post) to write one",
      "Add a title, a cover with a description for Google, and write with blocks",
      "Save it as a draft (free), schedule it, or publish it",
      "Filter your list by All, Published, Drafts and Scheduled",
      "Change how all your posts look with Post design",
    ],
    ticketCategory: "Public site & domains",
    faqs: [
      {
        q: "How do I write a post?",
        a: "Open Posts and tap New post. Add a title first, then write. Your work saves as you go. When you are ready, tap Publish.",
      },
      {
        q: "Why can't I publish my post?",
        a: "Drafts are free, but publishing is part of Web Office (Oficina Web). When you tap Publish on the free plan, a window shows the plan. A post also needs a title before it can be published.",
      },
      {
        q: "What do SEO ready and SEO can improve mean?",
        a: "It is a quick check of how easy Google will find the post. A clear title and a cover with a description raise it.",
      },
      {
        q: "Why does my post say Hidden by Tulala?",
        a: "Tulala hid it from your site. Write to us from Help and we will look at it with you.",
      },
    ],
  },
  "talent-client-account": {
    audience: ["Talent", "Client"],
    category: "Client accounts (Clientes)",
    purpose:
      "Your clients can have an account on your site. They sign in to see their bookings, messages and receipts in one place. You see the people you work with in Clientes (Clients).",
    youCanHere: [
      "Open Clientes (Clients) to see who has booked with you",
      "Tell clients they can sign in on your site to find Mis reservas (My bookings), Mensajes (Messages), Recibos (Receipts) and Mi cuenta (My account)",
      "Answer a client from Mensajes (Messages)",
    ],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "How does a client sign in?",
        a: "From the account button on your site, with Google, a password or a code sent to their email.",
      },
      {
        q: "Where does a client find their receipts?",
        a: "In their account, under Recibos (Receipts). Their bookings are under Mis reservas (My bookings) and messages under Mensajes (Messages).",
      },
      {
        q: "Where do I see my clients?",
        a: "Open Clientes (Clients) in the sidebar.",
      },
    ],
  },
  "talent-get-found": {
    audience: "Talent",
    category: "Get found on Google",
    purpose:
      "Get found shows a score for how easy Google finds you, tells you the next step, and walks you through your Google Business Profile and Google Search Console with your own details already filled in.",
    youCanHere: [
      "Open Get found to see your score and the next thing to fix",
      "Follow the Google Business Profile guide, with your name, city and site prefilled",
      "Follow the Search Console guide to tell Google about your site",
    ],
    ticketCategory: "Public site & domains",
    faqs: [
      {
        q: "How do I show up on Google?",
        a: "Open Get found. Your score checks eight things: site published, 3 services with prices, a bio of at least 120 characters, 5 or more photos, your city, your languages, a review, and your own domain as a bonus. Fix the biggest open one first.",
      },
      {
        q: "How do I set up my Google Business Profile?",
        a: "Open Get found and follow the Google Business Profile guide. It prepares your name, category, city, hours and site address for you to copy into Google.",
      },
      {
        q: "What is Search Console?",
        a: "It is the Google tool that shows how people reach your site. The guide in Get found takes you through verifying your site.",
      },
    ],
  },
  "talent-support": {
    audience: "Talent",
    category: "Support",
    purpose:
      "Support is inside your dashboard. Ask a question and get an answer from the help guides, or reach a real person from Tulala.",
    youCanHere: [
      "Open Help and type your question under How can we help?",
      "Tap Start live chat (Iniciar chat en vivo) to talk to a person, usually within minutes",
      "Tap Start a ticket (Abrir un ticket) when something is broken or missing",
      "Tap Send an idea (Enviar una idea) to tell us what would make Tulala better",
    ],
    ticketCategory: "General",
    faqs: [
      {
        q: "How do I talk to a person?",
        a: "Open Help from your dashboard and tap Start live chat. The message arrives with your account and page already attached, so you do not have to explain who you are.",
      },
      {
        q: "How do I report something broken?",
        a: "Open Help and tap Start a ticket. Say what you were doing and what you expected.",
      },
      {
        q: "Can I ask in Spanish?",
        a: "Yes. Ask in Spanish or English, whichever you prefer.",
      },
    ],
  },
};
