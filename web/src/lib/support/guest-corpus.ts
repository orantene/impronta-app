import {
  MARKETING_FEATURES,
  getFeatureContent,
  type Feature,
  type Para,
} from "@/lib/marketing/features";
import { SUPPORT_AGENT } from "./support-persona";
import { ROLE_LABELS } from "@/lib/marketing/help-guides";
import { getPricingLaddersCopy } from "@/lib/marketing/pricing-ladders-copy";
import type { HelpCorpusEntry } from "./help-corpus";

export const ROADMAP_PREFIX = "ON THE ROADMAP, not yet available: ";

export type GuestCorpusLocale = "en" | "es";

export function paraToText(p: Para): string {
  return p
    .map((seg) => (typeof seg === "string" ? seg : seg.label))
    .join("");
}

function salesEntries(locale: GuestCorpusLocale): HelpCorpusEntry[] {
  if (locale === "es") {
    return [
      {
        slug: "sales-free-plan",
        purpose:
          "Tulala tiene un plan gratis para siempre. Puedes abrir un workspace gratis, publicar un roster y recibir solicitudes sin tarjeta. El plan gratis se queda gratis hasta que crezcas. Precio del plan gratis: $0. Empieza en /get-started.",
        youCanHere: [
          "Crear un workspace gratis sin tarjeta",
          "Publicar un roster y una página en una dirección tulala",
          "Recibir solicitudes en la bandeja",
        ],
        faqs: [
          {
            q: "¿Cuánto cuesta el plan gratis?",
            a: "Cero. El plan gratis cuesta $0 y se queda gratis. Studio es $29 al mes cuando lo necesitas.",
          },
          {
            q: "¿Hay prueba gratis para agencias?",
            a: "Sí. Agency tiene una prueba de 14 días. Empieza en /get-started?audience=agency.",
          },
        ],
        category: "pricing",
        ticketCategory: "paid",
      },
      {
        slug: "sales-booking-cut",
        purpose:
          "El cliente paga el precio más una tarifa de servicio de Tulala de 1.5%, igual en todos los planes. Tulala no le quita nada al precio de quien vende. Ejemplo: una reserva de $1,000, el cliente paga $1,015 y Tulala se queda con $15. El procesamiento de tarjeta lo cobra el procesador a costo: por defecto lo absorbe quien vende, o puede hacer que lo cubra el cliente desde la configuración. No se cobra nada hasta que una reserva se paga.",
        youCanHere: [
          "Ver la tarifa de 1.5% en /pricing",
          "La misma tarifa de 1.5% desde el hub o desde el sitio de la agencia",
        ],
        faqs: [
          {
            q: "¿Cuánto se queda Tulala de cada reserva?",
            a: "1.5% sobre una reserva pagada, y lo paga el cliente. En el ejemplo de $1,000, Tulala se queda con $15.",
          },
        ],
        category: "pricing",
        ticketCategory: "paid",
      },
      {
        slug: "sales-reach-human",
        purpose:
          `Puedes hablar con una persona. Pide un humano en el chat o escribe en /contact. ${SUPPORT_AGENT.name}, el fundador, lee cada mensaje. El chat de soporte en tulala.digital responde primero y luego puede pasarte con ${SUPPORT_AGENT.name}.`,
        youCanHere: [
          "Pedir un humano en el chat de soporte",
          "Enviar el formulario en /contact",
        ],
        faqs: [
          {
            q: "¿Cómo hablo con una persona?",
            a: "Pide un humano en este chat o usa /contact. Te responde una persona real.",
          },
        ],
        category: "support",
        ticketCategory: "run",
      },
      {
        slug: "sales-where-team",
        purpose:
          `Tulala es una empresa pequeña. El equipo está entre México y Estados Unidos. El fundador se llama ${SUPPORT_AGENT.name}. Soporte en español e inglés.`,
        youCanHere: ["Preguntar en español o inglés", `Hablar con ${SUPPORT_AGENT.name}`],
        faqs: [
          {
            q: "¿Dónde está el equipo?",
            a: `Entre México y Estados Unidos. ${SUPPORT_AGENT.name} lee el soporte.`,
          },
        ],
        category: "about",
        ticketCategory: "run",
      },
      {
        slug: "sales-spanish-support",
        purpose:
          "Sí, hay soporte en español. Puedes preguntar en español. El sitio tiene páginas en español en /es. El chat responde en el idioma de tu pregunta.",
        youCanHere: ["Preguntar en español", "Abrir /es/pricing y /es/funciones"],
        faqs: [
          {
            q: "¿Atienden en español?",
            a: "Sí. Puedes escribir en español y te respondemos en español.",
          },
        ],
        category: "support",
        ticketCategory: "run",
      },
      {
        slug: "sales-data-export",
        purpose:
          "Puedes exportar tus datos cuando quieras. No hay costo de instalación. Si te vas, te llevas roster, clientes y reservas.",
        youCanHere: ["Exportar datos desde el workspace", "Irte sin perder el roster"],
        faqs: [
          {
            q: "¿Puedo exportar mis datos?",
            a: "Sí. Puedes exportar tus datos cuando quieras.",
          },
        ],
        category: "trust",
        ticketCategory: "run",
      },
      {
        slug: "sales-from-spreadsheet",
        purpose:
          "Si hoy corres el negocio en una hoja de cálculo o WhatsApp, puedes pasar a Tulala. Importas el roster, publicas una página, y las solicitudes dejan de vivir en tus mensajes.",
        youCanHere: [
          "Empezar gratis y cargar el roster",
          "Pasar clientes del chat a una solicitud con timeline",
        ],
        faqs: [
          {
            q: "¿Puedo migrar desde Excel o WhatsApp?",
            a: "Sí. Empiezas gratis, cargas el roster, y las solicitudes quedan en Tulala en vez del chat.",
          },
        ],
        category: "onboarding",
        ticketCategory: "found",
      },
      {
        slug: "sales-what-is-tulala",
        purpose:
          "Tulala es la plataforma para vender tu trabajo y correr el negocio: página, solicitudes, reservas y pagos. Para talento, operadores y agencias. No es solo un directorio.",
        youCanHere: [
          "Vender tu trabajo desde una página",
          "Correr un roster y una agencia",
        ],
        faqs: [
          {
            q: "¿Qué es Tulala?",
            a: "Una plataforma para vender tu trabajo y operar el negocio: página, solicitudes, reservas y pagos.",
          },
        ],
        category: "about",
        ticketCategory: "presence",
      },
    ];
  }

  return [
    {
      slug: "sales-free-plan",
      purpose:
        "Tulala has a free plan that stays free. You can open a workspace, publish a roster, and take inquiries with no credit card. Free plan price: $0. Start at /get-started.",
      youCanHere: [
        "Create a free workspace with no card",
        "Publish a roster on a tulala address",
        "Receive inquiries in the inbox",
      ],
      faqs: [
        {
          q: "How much is the free plan?",
          a: "Zero. The free plan is $0 and stays free. Studio is $29/mo when you outgrow it.",
        },
        {
          q: "Is there a free trial for agencies?",
          a: "Yes. Agency has a 14-day trial. Start at /get-started?audience=agency.",
        },
      ],
      category: "pricing",
      ticketCategory: "paid",
    },
    {
      slug: "sales-booking-cut",
      purpose:
        "The client pays the price plus a 1.5% Tulala service fee, the same on every plan. Tulala takes nothing from the seller's price. Example: a $1,000 booking, the client pays $1,015 and Tulala keeps $15. Card processing is charged at cost by the payment processor: by default the seller absorbs it, or can have the client cover it in settings. Nothing is charged until a booking is paid.",
      youCanHere: [
        "See the 1.5% fee on /pricing",
        "Same 1.5% fee from the hub or the agency's own site",
      ],
      faqs: [
        {
          q: "What is Tulala's cut on a booking?",
          a: "1.5% on a paid booking, paid by the client. On a $1,000 booking example, Tulala keeps $15.",
        },
      ],
      category: "pricing",
      ticketCategory: "paid",
    },
    {
      slug: "sales-reach-human",
      purpose:
        `You can talk to a person. Ask for a human in this chat or write on /contact. ${SUPPORT_AGENT.name}, the founder, reads every message. The chat on tulala.digital answers first and can hand you to ${SUPPORT_AGENT.name}.`,
      youCanHere: ["Ask for a human in this chat", "Send the form on /contact"],
      faqs: [
        {
          q: "How do I reach a person?",
          a: "Ask for a human in this chat or use /contact. A real person answers.",
        },
      ],
      category: "support",
      ticketCategory: "run",
    },
    {
      slug: "sales-where-team",
      purpose:
        `Tulala is a small company. The team sits between Mexico and the United States. The founder is ${SUPPORT_AGENT.name}. Support is in English and Spanish.`,
      youCanHere: ["Ask in English or Spanish", `Talk to ${SUPPORT_AGENT.name}`],
      faqs: [
        {
          q: "Where is the team?",
          a: `Between Mexico and the United States. ${SUPPORT_AGENT.name} reads support.`,
        },
      ],
      category: "about",
      ticketCategory: "run",
    },
    {
      slug: "sales-spanish-support",
      purpose:
        "Yes, there is Spanish support. You can ask in Spanish. The site has Spanish pages under /es. The chat answers in the language of your question.",
      youCanHere: ["Ask in Spanish", "Open /es/pricing and /es/funciones"],
      faqs: [
        {
          q: "Do you support Spanish?",
          a: "Yes. Write in Spanish and we answer in Spanish.",
        },
      ],
      category: "support",
      ticketCategory: "run",
    },
    {
      slug: "sales-data-export",
      purpose:
        "You can export your data whenever you want. No setup fees. If you leave, you take roster, clients, and bookings with you.",
      youCanHere: ["Export data from the workspace", "Leave without losing the roster"],
      faqs: [
        {
          q: "Can I export my data?",
          a: "Yes. You can export your data whenever you want.",
        },
      ],
      category: "trust",
      ticketCategory: "run",
    },
    {
      slug: "sales-from-spreadsheet",
      purpose:
        "If you run the business in a spreadsheet or WhatsApp today, you can move to Tulala. Load the roster, publish a page, and inquiries stop living in your DMs.",
      youCanHere: [
        "Start free and load the roster",
        "Move clients from chat into a tracked inquiry",
      ],
      faqs: [
        {
          q: "Can I migrate from Excel or WhatsApp?",
          a: "Yes. Start free, load the roster, and inquiries live in Tulala instead of chat.",
        },
      ],
      category: "onboarding",
      ticketCategory: "found",
    },
    {
      slug: "sales-what-is-tulala",
      purpose:
        "Tulala is the platform to sell your work and run the business: page, inquiries, bookings, and payments. For talent, operators, and agencies. It is not just a directory.",
      youCanHere: ["Sell your work from a page", "Run a roster and an agency"],
      faqs: [
        {
          q: "What is Tulala?",
          a: "A platform to sell your work and run the business: page, inquiries, bookings, and payments.",
        },
      ],
      category: "about",
      ticketCategory: "presence",
    },
  ];
}

function featureToEntry(feature: Feature, locale: GuestCorpusLocale): HelpCorpusEntry {
  const content = getFeatureContent(feature, locale);
  const purposeRaw = `${content.promise} ${content.subtitle}`.trim();
  const purpose =
    feature.status === "coming" ? `${ROADMAP_PREFIX}${purposeRaw}` : purposeRaw;
  return {
    slug: `feature:${feature.key}`,
    purpose,
    youCanHere: content.highlights,
    faqs: content.faq.map((f) => ({ q: f.q, a: f.a })),
    category: feature.group,
    ticketCategory: feature.group,
  };
}

function pricingEntries(locale: GuestCorpusLocale): HelpCorpusEntry[] {
  const copy = getPricingLaddersCopy(locale);
  const feeRows = copy.fee.rows.map((r) => `${r.label} ${r.value}`).join(". ");
  return [
    {
      slug: "pricing-ladders",
      purpose: `${copy.title} ${copy.subtitle} ${copy.annualNote}`,
      youCanHere: [
        copy.person.blurb,
        copy.business.blurb,
        ...copy.talent.free.bullets,
        ...copy.workspace.free.bullets,
        ...copy.workspace.studio.bullets,
        ...copy.workspace.agency.bullets,
      ],
      faqs: [
        { q: copy.talent.free.line, a: copy.talent.free.bullets.join(". ") },
        { q: copy.workspace.studio.line, a: copy.workspace.studio.bullets.join(". ") },
        { q: copy.workspace.agency.line, a: copy.workspace.agency.bullets.join(". ") },
      ],
      category: "pricing",
      ticketCategory: "paid",
    },
    {
      slug: "pricing-fee",
      purpose: `${copy.fee.title} ${copy.fee.body} ${copy.fee.exampleTitle}: ${feeRows}. ${copy.fee.note}`,
      youCanHere: copy.fee.rows.map((r) => `${r.label}: ${r.value}`),
      faqs: [{ q: copy.fee.title, a: copy.fee.body }],
      category: "pricing",
      ticketCategory: "paid",
    },
  ];
}

/**
 * The /help role guides, as grounding.
 *
 * Most of /help is ENGLISH-ONLY. Those guides were once added to the Spanish
 * corpus verbatim, which is worse than leaving them out — the retriever is
 * bag-of-words over the entry text, so Spanish query tokens score ~0 against
 * English bodies and contribute nothing, while the English text still lands in
 * the prompt and invites the model to answer a Spanish visitor with English
 * source material.
 *
 * So the guard was a blanket `locale !== "en" -> []`. That was right while no
 * guide had Spanish, and wrong the moment one did: the business guides
 * (restaurants, salons, shops) are authored in both languages, and a blanket
 * rule would have hidden the only guides written for the businesses actually
 * signing up from every Spanish visitor.
 *
 * The rule is now per-role and derived from the content: a role reaches the
 * Spanish corpus if it HAS Spanish, and is skipped if it does not. No list to
 * keep in sync — translating an existing role makes it appear here on its own.
 */
function helpGuideEntries(locale: GuestCorpusLocale): HelpCorpusEntry[] {
  const entries: HelpCorpusEntry[] = [];
  for (const [role, content] of Object.entries(ROLE_LABELS)) {
    const text = locale === "en" ? content : content.es;
    if (!text) continue;
    entries.push({
      slug: `help:${role}`,
      purpose: `${text.title}. ${text.intro}`,
      youCanHere: text.guides.map((g) => g.heading),
      faqs: text.guides.map((g) => ({ q: g.heading, a: g.body })),
      category: "help",
      ticketCategory: role === "clients" ? "found" : "run",
    });
  }
  return entries;
}

/**
 * Marketing-only grounding for guest support AI. Never includes DRAWER_HELP
 * and never includes confirmed-insight rows.
 */
export function buildGuestCorpus(locale: GuestCorpusLocale): HelpCorpusEntry[] {
  const features = MARKETING_FEATURES.map((f) => featureToEntry(f, locale));
  return [...features, ...pricingEntries(locale), ...helpGuideEntries(locale), ...salesEntries(locale)];
}

export function flattenGroundingText(entries: HelpCorpusEntry[]): string {
  return entries
    .map((e) =>
      [e.purpose, ...e.youCanHere, ...e.faqs.flatMap((f) => [f.q, f.a])].join(" "),
    )
    .join("\n");
}
