/**
 * pricing-ladders-copy.ts — EN + ES copy for the two ratified 2026 ladders
 * rendered on /pricing (see `components/marketing/pricing-ladders-section.tsx`).
 *
 * Lives beside `copy.ts` rather than inside it only because `copy.ts` sits at
 * its 800-line ceiling; the contract is identical: `es` is typed as
 * `typeof en`, so TypeScript fails the build the moment a key exists in one
 * language and not the other.
 *
 * Tier NAMES, PRICES, cadence and sale state are NOT here. Those are read from
 * the `product_*` catalog via `loadMarketingTiers`. What lives here is the
 * framing, the one-liners, the bullets and the CTA labels, because those need
 * Spanish and the catalog columns are English-only. Keys match
 * `product_tiers.slug`: the Network tier's slug is `hub`, and the Portfolio
 * tier's slug is `max`.
 *
 * A tier with copy here but no ACTIVE catalog row simply does not render. That
 * is how `website` behaves today: its `product_tiers` row is priced but
 * `is_active=false` until the plan key ships, so the card is absent and the
 * ladder closes up around it. Nothing here changes when it flips on.
 *
 * The only dollar figures below are the worked fee EXAMPLE, which illustrates
 * the 6% split and is not a catalog price.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

const en = {
  eyebrow: "Plans",
  title: "One question picks your column.",
  subtitle:
    "Are you a person, or a business? After that it is just small, medium or large. Nothing stops you from being both later.",
  annualNote:
    "Pay yearly and you pay for ten months instead of twelve. Currency converts for LATAM and the EU. No setup fees, and you can export your data whenever you want.",
  person: {
    label: "For a person",
    blurb: "You sell your own work. Your page, your inquiries, your bookings.",
  },
  business: {
    label: "For a business",
    blurb: "You run the business, with or without a roster of people behind you.",
  },
  salesLed: "Let's talk",
  cadence: {
    month: "per month",
    year: "per year",
    free: "forever",
  },
  talent: {
    free: {
      line: "Your profile page, discovery, and an inquiry inbox.",
      bullets: [
        "Profile page on a tulala address",
        "Listed in Discover",
        "Inquiry inbox",
      ],
      cta: "Start free",
    },
    pro: {
      line: "A premium page, with your name on it instead of ours.",
      bullets: [
        "Page templates, embeds and press",
        "Media kit",
        "Analytics",
        "No Tulala badge",
      ],
      cta: "Create your page",
    },
    max: {
      line: "Everything in Pro, plus a full website that is yours.",
      bullets: [
        "Your own full website",
        "Custom domain",
        "SEO controls",
        "Top placement in Discover",
      ],
      cta: "Create your page",
    },
  },
  workspace: {
    free: {
      line: "A five page site on a tulala address.",
      bullets: ["Five pages", "A tulala address", "Inquiry inbox"],
      cta: "Start free",
    },
    website: {
      line: "A full site for the business, on your own domain. No talent roster.",
      bullets: [
        "Unlimited pages",
        "Your own domain",
        "English and Spanish",
        "Forms inbox and payments",
      ],
      cta: "Get started",
    },
    studio: {
      line: "The website, plus the people behind it.",
      bullets: [
        "Talent roster",
        "Commissions",
        "Coordinated bookings",
        "Team seats",
      ],
      cta: "Start on Studio",
    },
    agency: {
      line: "For a roster and a team with no ceiling on either.",
      bullets: [
        "Unlimited roster and team",
        "Exclusivity",
        "Pitch tools",
        "Priority support",
      ],
      cta: "Start 14-day trial",
    },
    hub: {
      line: "Multi-brand hubs and routing across rosters. Priced with you.",
      bullets: ["Multi-brand hubs", "Cross-roster routing", "Named support"],
      cta: "Book a walkthrough",
    },
  },
  fee: {
    eyebrow: "Transaction fee",
    title: "6% on a paid booking. The same on every plan.",
    body:
      "Three percent is a client surcharge at checkout and three percent comes off the seller side. Card processing is included, and the rate does not change as you move up either ladder.",
    exampleTitle: "A $1,000 booking through an agency",
    rows: [
      { label: "Client pays", value: "$1,030" },
      { label: "Talent receives", value: "$800" },
      { label: "Agency receives", value: "$170" },
      { label: "Tulala keeps", value: "$60" },
    ],
    note:
      "The same 6% whether the booking arrives from the Tulala hub or from the agency's own website. Nothing is charged until a booking is paid.",
  },
};

export type PricingLaddersCopy = typeof en;

const es: PricingLaddersCopy = {
  eyebrow: "Planes",
  title: "Una pregunta define tu columna.",
  subtitle:
    "¿Eres una persona o un negocio? De ahí en adelante solo es chico, mediano o grande. Nada te impide ser las dos cosas más adelante.",
  annualNote:
    "Si pagas por año, pagas diez meses en lugar de doce. La moneda se ajusta para LATAM y la UE. Sin costos de instalación, y puedes exportar tus datos cuando quieras.",
  person: {
    label: "Para una persona",
    blurb: "Vendes tu propio trabajo. Tu página, tus solicitudes, tus reservas.",
  },
  business: {
    label: "Para un negocio",
    blurb: "Llevas el negocio, con o sin un catálogo de personas detrás.",
  },
  salesLed: "Hablemos",
  cadence: {
    month: "al mes",
    year: "al año",
    free: "para siempre",
  },
  talent: {
    free: {
      line: "Tu página de perfil, presencia en Discover y una bandeja de solicitudes.",
      bullets: [
        "Página de perfil en una dirección tulala",
        "Apareces en Discover",
        "Bandeja de solicitudes",
      ],
      cta: "Empieza gratis",
    },
    pro: {
      line: "Una página premium, con tu nombre en vez del nuestro.",
      bullets: [
        "Plantillas de página, embeds y prensa",
        "Media kit",
        "Analítica",
        "Sin sello de Tulala",
      ],
      cta: "Crea tu página",
    },
    max: {
      line: "Todo lo de Pro, más un sitio web completo que es tuyo.",
      bullets: [
        "Tu sitio web completo",
        "Dominio propio",
        "Controles de SEO",
        "Posición destacada en Discover",
      ],
      cta: "Crea tu página",
    },
  },
  workspace: {
    free: {
      line: "Un sitio de cinco páginas en una dirección tulala.",
      bullets: ["Cinco páginas", "Una dirección tulala", "Bandeja de solicitudes"],
      cta: "Empieza gratis",
    },
    website: {
      line: "Un sitio completo para el negocio, en tu propio dominio. Sin catálogo de talento.",
      bullets: [
        "Páginas ilimitadas",
        "Dominio propio",
        "Inglés y español",
        "Bandeja de formularios y pagos",
      ],
      cta: "Empieza",
    },
    studio: {
      line: "El sitio web, más las personas detrás de él.",
      bullets: [
        "Catálogo de talento",
        "Comisiones",
        "Reservas coordinadas",
        "Lugares para tu equipo",
      ],
      cta: "Empieza con Studio",
    },
    agency: {
      line: "Para un catálogo y un equipo sin tope en ninguno de los dos.",
      bullets: [
        "Catálogo y equipo ilimitados",
        "Exclusividad",
        "Herramientas para propuestas",
        "Soporte prioritario",
      ],
      cta: "Prueba de 14 días",
    },
    hub: {
      line: "Hubs de varias marcas y ruteo entre catálogos. El precio se define contigo.",
      bullets: [
        "Hubs de varias marcas",
        "Ruteo entre catálogos",
        "Soporte con nombre y apellido",
      ],
      cta: "Agenda un recorrido",
    },
  },
  fee: {
    eyebrow: "Comisión por transacción",
    title: "6% sobre una reserva pagada. Igual en todos los planes.",
    body:
      "Tres por ciento es un recargo al cliente en el checkout y tres por ciento sale del lado de quien vende. El procesamiento de tarjeta va incluido, y la tasa no cambia conforme subes en cualquiera de las dos columnas.",
    exampleTitle: "Una reserva de $1,000 a través de una agencia",
    rows: [
      { label: "El cliente paga", value: "$1,030" },
      { label: "El talento recibe", value: "$800" },
      { label: "La agencia recibe", value: "$170" },
      { label: "Tulala se queda con", value: "$60" },
    ],
    note:
      "El mismo 6% ya sea que la reserva llegue desde el hub de Tulala o desde el sitio propio de la agencia. No se cobra nada hasta que una reserva se paga.",
  },
};

export function getPricingLaddersCopy(locale: string): PricingLaddersCopy {
  return pickLocale(locale, { en, es });
}
