/**
 * Glossary of talent-commerce terms (`/resources/glossary`).
 *
 * One page with anchor links, not one page per term. Per-term micro-pages from
 * day one would be thin-page risk; they only earn their own URL if this page
 * demonstrably ranks and specific terms pull impressions.
 *
 * Definitions are plain-language and vendor-neutral. They describe how the
 * industry uses the word, not how Tulala implements it, so the page stays
 * useful (and citable) to someone who never signs up.
 */

export type GlossaryTerm = {
  /** Anchor id, kebab-case. */
  id: string;
  en: { term: string; definition: string };
  es: { term: string; definition: string };
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: "booking-inquiry",
    en: {
      term: "Booking inquiry",
      definition:
        "A request to hire someone for specific work. A useful inquiry carries the date, the type of work, the location and the duration, which is everything needed to quote.",
    },
    es: {
      term: "Solicitud de reserva",
      definition:
        "Una petición para contratar a alguien para un trabajo concreto. Una buena solicitud trae la fecha, el tipo de trabajo, el lugar y la duración, que es todo lo necesario para cotizar.",
    },
  },
  {
    id: "offer",
    en: {
      term: "Offer",
      definition:
        "A written quote for a specific job: what will be done, when, and for how much. Unlike a price mentioned in chat, an offer can be accepted or declined and stays on record.",
    },
    es: {
      term: "Oferta",
      definition:
        "Una cotización escrita para un trabajo concreto: qué se hará, cuándo y por cuánto. A diferencia de un precio dicho en el chat, una oferta se puede aceptar o rechazar y queda registrada.",
    },
  },
  {
    id: "deposit",
    en: {
      term: "Deposit",
      definition:
        "A partial payment made to confirm a booking and hold a date. Its practical job is filtering: it separates clients who intend to book from those who are still deciding.",
    },
    es: {
      term: "Anticipo",
      definition:
        "Un pago parcial para confirmar una reserva y apartar una fecha. Su función práctica es filtrar: separa a quien va a reservar de quien sigue decidiendo.",
    },
  },
  {
    id: "retainer",
    en: {
      term: "Retainer",
      definition:
        "An amount paid to reserve someone's availability over a period, rather than for one job. Common for ongoing or repeat work.",
    },
    es: {
      term: "Iguala",
      definition:
        "Un monto pagado para reservar la disponibilidad de alguien durante un periodo, no por un solo trabajo. Común en trabajo continuo o recurrente.",
    },
  },
  {
    id: "date-hold",
    en: {
      term: "Hold (date hold)",
      definition:
        "A provisional reservation of a date before confirmation. A hold with no payment attached is a soft hold, and soft holds are the most common way to lose a booked day.",
    },
    es: {
      term: "Apartado de fecha",
      definition:
        "Una reserva provisional de una fecha antes de confirmar. Un apartado sin pago es un apartado blando, y así es como más se pierde un día ya reservado.",
    },
  },
  {
    id: "no-show",
    en: {
      term: "No-show",
      definition:
        "A client or talent who fails to appear for a confirmed booking. Deposits exist largely to make no-shows cost something.",
    },
    es: {
      term: "No presentación",
      definition:
        "Un cliente o talento que no llega a una reserva confirmada. Los anticipos existen en buena medida para que no presentarse cueste algo.",
    },
  },
  {
    id: "cancellation-window",
    en: {
      term: "Cancellation window",
      definition:
        "The notice period within which a booking can be cancelled under stated terms, and after which a fee or forfeited deposit applies.",
    },
    es: {
      term: "Ventana de cancelación",
      definition:
        "El plazo de aviso dentro del cual se puede cancelar una reserva bajo las condiciones acordadas, y pasado el cual aplica un cargo o se pierde el anticipo.",
    },
  },
  {
    id: "day-rate",
    en: {
      term: "Day rate",
      definition:
        "The price for a full day of work, usually defined by an agreed number of hours. A half-day rate is typically more than half the day rate, because the day is still broken up.",
    },
    es: {
      term: "Tarifa por día",
      definition:
        "El precio por un día completo de trabajo, normalmente definido por un número de horas acordado. La tarifa de medio día suele ser más de la mitad, porque el día igual se parte.",
    },
  },
  {
    id: "rate-card",
    en: {
      term: "Rate card",
      definition:
        "A published list of services and prices. Its main value is doing the negotiating before the conversation starts, and keeping quotes consistent.",
    },
    es: {
      term: "Tabulador de tarifas",
      definition:
        "Una lista publicada de servicios y precios. Su mayor valor es negociar antes de que empiece la conversación y mantener las cotizaciones consistentes.",
    },
  },
  {
    id: "usage-rights",
    en: {
      term: "Usage rights",
      definition:
        "Where, how long and in what media a client may use the work produced. Priced separately from the shoot itself, because broader usage is worth more.",
    },
    es: {
      term: "Derechos de uso",
      definition:
        "Dónde, por cuánto tiempo y en qué medios puede usar el cliente el trabajo producido. Se cobra aparte de la sesión, porque un uso más amplio vale más.",
    },
  },
  {
    id: "buyout",
    en: {
      term: "Buyout",
      definition:
        "A payment for broad or unlimited usage rights, often in place of a time-limited licence.",
    },
    es: {
      term: "Buyout",
      definition:
        "Un pago por derechos de uso amplios o ilimitados, normalmente en lugar de una licencia con límite de tiempo.",
    },
  },
  {
    id: "comp-card",
    en: {
      term: "Comp card",
      definition:
        "A model's summary card: a few key images plus measurements and contact details. The digital equivalent is a profile page with the same information.",
    },
    es: {
      term: "Comp card",
      definition:
        "La tarjeta resumen de una modelo: algunas imágenes clave más medidas y datos de contacto. Su equivalente digital es un perfil con la misma información.",
    },
  },
  {
    id: "epk",
    en: {
      term: "EPK (electronic press kit)",
      definition:
        "A performer's package of music or video, biography, photos and technical requirements, used to pitch for gigs.",
    },
    es: {
      term: "EPK (kit de prensa electrónico)",
      definition:
        "El paquete de un artista con música o video, biografía, fotos y requerimientos técnicos, que se usa para conseguir tocadas.",
    },
  },
  {
    id: "portfolio",
    en: {
      term: "Portfolio",
      definition:
        "The curated selection of work shown to prospective clients. Curation matters more than volume: the weakest piece sets the expectation.",
    },
    es: {
      term: "Portafolio",
      definition:
        "La selección curada de trabajo que se muestra a clientes potenciales. La curaduría importa más que la cantidad: la pieza más débil marca la expectativa.",
    },
  },
  {
    id: "tear-sheet",
    en: {
      term: "Tear sheet",
      definition:
        "A page from a published piece of work, used as evidence of professional credits.",
    },
    es: {
      term: "Tear sheet",
      definition:
        "Una página de un trabajo publicado, usada como prueba de créditos profesionales.",
    },
  },
  {
    id: "casting",
    en: {
      term: "Casting",
      definition:
        "The process of selecting talent for a specific job, usually by reviewing profiles and often through an audition or callback.",
    },
    es: {
      term: "Casting",
      definition:
        "El proceso de seleccionar talento para un trabajo específico, normalmente revisando perfiles y a menudo con una audición o callback.",
    },
  },
  {
    id: "callback",
    en: {
      term: "Callback",
      definition:
        "A second round of a casting, for a shortlist of candidates from the first round.",
    },
    es: {
      term: "Callback",
      definition:
        "Una segunda ronda de casting, para una lista corta de candidatos de la primera ronda.",
    },
  },
  {
    id: "roster",
    en: {
      term: "Roster",
      definition:
        "The group of talent an agency or network represents or lists.",
    },
    es: {
      term: "Roster",
      definition:
        "El grupo de talento que una agencia o red representa o lista.",
    },
  },
  {
    id: "mother-agency",
    en: {
      term: "Mother agency",
      definition:
        "The agency that first signs and develops a model's career, and typically keeps a share when other agencies book them.",
    },
    es: {
      term: "Agencia madre",
      definition:
        "La agencia que firma y desarrolla primero la carrera de una modelo, y que normalmente conserva una parte cuando otras agencias la contratan.",
    },
  },
  {
    id: "exclusivity",
    en: {
      term: "Exclusivity",
      definition:
        "An arrangement where talent may only be represented or booked through one agency, usually within a defined market or period.",
    },
    es: {
      term: "Exclusividad",
      definition:
        "Un acuerdo donde el talento solo puede ser representado o contratado por una agencia, normalmente dentro de un mercado o periodo definido.",
    },
  },
  {
    id: "commission",
    en: {
      term: "Commission",
      definition:
        "The percentage an agency or platform takes from a booking. Who pays it, the talent or the client, varies by market and should always be stated up front.",
    },
    es: {
      term: "Comisión",
      definition:
        "El porcentaje que toma una agencia o plataforma de una reserva. Quién la paga, el talento o el cliente, varía por mercado y siempre debe decirse desde el inicio.",
    },
  },
  {
    id: "split",
    en: {
      term: "Split",
      definition:
        "How a booking's money is divided between the parties involved, such as talent, agency and any referring party.",
    },
    es: {
      term: "Reparto",
      definition:
        "Cómo se divide el dinero de una reserva entre las partes involucradas, como talento, agencia y quien haya referido.",
    },
  },
  {
    id: "coordinator",
    en: {
      term: "Coordinator",
      definition:
        "The person who runs a job end to end: briefing talent, confirming logistics and keeping the client informed.",
    },
    es: {
      term: "Coordinador",
      definition:
        "La persona que lleva un trabajo de principio a fin: informa al talento, confirma la logística y mantiene al cliente al tanto.",
    },
  },
  {
    id: "staffing",
    en: {
      term: "Staffing",
      definition:
        "Placing multiple people into roles for an event or campaign, usually at short notice and at volume.",
    },
    es: {
      term: "Staffing",
      definition:
        "Colocar a varias personas en roles para un evento o campaña, normalmente con poco aviso y en volumen.",
    },
  },
  {
    id: "gig",
    en: {
      term: "Gig",
      definition:
        "A single booked engagement, most often used for performance work.",
    },
    es: {
      term: "Tocada / chamba",
      definition:
        "Un compromiso reservado individual, término usado sobre todo para trabajo de performance.",
    },
  },
  {
    id: "booking-confirmation",
    en: {
      term: "Booking confirmation",
      definition:
        "The point at which a held date becomes committed, ideally evidenced by an accepted offer and a payment rather than a message saying yes.",
    },
    es: {
      term: "Confirmación de reserva",
      definition:
        "El momento en que una fecha apartada queda comprometida, idealmente con una oferta aceptada y un pago, no con un mensaje que dice que sí.",
    },
  },
  {
    id: "payout",
    en: {
      term: "Payout",
      definition:
        "The transfer of earned money to the person who did the work, after any commission or fees are deducted.",
    },
    es: {
      term: "Pago al talento",
      definition:
        "La transferencia del dinero ganado a quien hizo el trabajo, después de descontar comisiones o cargos.",
    },
  },
  {
    id: "chargeback",
    en: {
      term: "Chargeback",
      definition:
        "A payment reversed by the client's bank or card issuer after it was made. Clear written terms and a record of what was agreed are the main defence.",
    },
    es: {
      term: "Contracargo",
      definition:
        "Un pago revertido por el banco o emisor de la tarjeta del cliente después de hecho. Las condiciones escritas claras y el registro de lo acordado son la principal defensa.",
    },
  },
];
