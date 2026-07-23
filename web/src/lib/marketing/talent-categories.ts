import { CASE_STUDY_PHOTOS, type MarketingPhoto } from "@/lib/marketing/photography";

/**
 * Talent-category landing pages (`/for/{slug}`).
 *
 * Pillar A of the organic content plan (`docs/_seo-run/keyword-map.md`). One
 * page per kind of work, each showing what a booking actually looks like for
 * THAT category. Two-segment paths on purpose: `/for/models` can never collide
 * with a single-segment tenant slug.
 *
 * Every claim here must be true of the shipped product: a free page on a free
 * subdomain, a structured inquiry that becomes an offer, payment taken in the
 * booking chat, your own domain on a paid plan, and the shared discovery
 * network. Nothing aspirational, nothing invented.
 */

export type CategoryStep = { title: string; body: string };
export type CategoryFaq = { q: string; a: string };

export type CategoryContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  intro: string;
  steps: CategoryStep[];
  faq: CategoryFaq[];
};

export type TalentCategory = {
  slug: string;
  photo: MarketingPhoto;
  /** Sibling slugs cross-linked at the foot of the page. */
  related: string[];
  en: CategoryContent;
  es: CategoryContent;
};

export const TALENT_CATEGORIES: TalentCategory[] = [
  {
    slug: "models",
    photo: CASE_STUDY_PHOTOS.models,
    related: ["photographers", "musicians", "chefs"],
    en: {
      eyebrow: "For models",
      title: "A booking page for models",
      subtitle:
        "Show the portfolio, publish your details once, and let clients send a real booking request instead of a DM.",
      intro:
        "Most freelance models lose work in the gap between interest and confirmation. A client likes the look, asks for rates, waits a day, and books someone else. A booking page closes that gap: the portfolio, the measurements, and the request form live at one link you control.",
      steps: [
        {
          title: "Publish the portfolio once",
          body: "A clean grid for your best work, plus the details clients always ask for. Update it in one place instead of re-sending files.",
        },
        {
          title: "Take a structured request",
          body: "Clients send the date, the shoot type, and the usage. You stop re-typing rates and availability in chat.",
        },
        {
          title: "Confirm and get paid",
          body: "Reply with a priced offer, take payment in the same conversation, and keep the booking on record.",
        },
      ],
      faq: [
        {
          q: "Do I need an agency to use this?",
          a: "No. The page is built for models working independently. If you later sign with an agency, your profile can be linked to their roster.",
        },
        {
          q: "Can I ask for a deposit before holding a date?",
          a: "Yes. You send a priced offer in the booking chat and take payment there, so a held date is a paid date.",
        },
        {
          q: "What does it cost to start?",
          a: "Nothing. You get a free page on a free subdomain. Connecting your own domain is a paid upgrade when you want it.",
        },
        {
          q: "Who can see my measurements and details?",
          a: "You choose what appears on the public page. Anything you keep private stays out of the public profile.",
        },
      ],
    },
    es: {
      eyebrow: "Para modelos",
      title: "Una página de reservas para modelos",
      subtitle:
        "Muestra tu portafolio, publica tus datos una sola vez y recibe solicitudes reales en lugar de mensajes sueltos.",
      intro:
        "La mayoría de las modelos independientes pierde trabajo en el hueco entre el interés y la confirmación. Al cliente le gusta tu perfil, pregunta tarifas, espera un día y termina reservando a alguien más. Una página de reservas cierra ese hueco: el portafolio, las medidas y el formulario viven en un solo enlace que tú controlas.",
      steps: [
        {
          title: "Publica el portafolio una vez",
          body: "Una galería limpia con tu mejor trabajo y los datos que siempre te piden. Se actualiza en un solo lugar, sin reenviar archivos.",
        },
        {
          title: "Recibe solicitudes ordenadas",
          body: "El cliente manda la fecha, el tipo de sesión y el uso de las imágenes. Dejas de teclear tarifas y disponibilidad en cada chat.",
        },
        {
          title: "Confirma y cobra",
          body: "Respondes con una oferta con precio, cobras en la misma conversación y la reserva queda registrada.",
        },
      ],
      faq: [
        {
          q: "¿Necesito una agencia para usarlo?",
          a: "No. La página está pensada para modelos que trabajan por su cuenta. Si más adelante firmas con una agencia, tu perfil se puede vincular a su roster.",
        },
        {
          q: "¿Puedo pedir anticipo antes de apartar una fecha?",
          a: "Sí. Mandas una oferta con precio en el chat de reserva y cobras ahí mismo, así una fecha apartada es una fecha pagada.",
        },
        {
          q: "¿Cuánto cuesta empezar?",
          a: "Nada. Tienes una página gratis en un subdominio gratis. Conectar tu propio dominio es una mejora de pago cuando la quieras.",
        },
        {
          q: "¿Quién puede ver mis medidas y datos?",
          a: "Tú eliges qué aparece en la página pública. Lo que dejes privado no se muestra en el perfil.",
        },
      ],
    },
  },
  {
    slug: "musicians",
    photo: CASE_STUDY_PHOTOS.singer,
    related: ["models", "photographers", "chefs"],
    en: {
      eyebrow: "For singers and musicians",
      title: "A booking page for singers and musicians",
      subtitle:
        "Your music, your set list, and a request form that asks for the date, the venue, and the set length up front.",
      intro:
        "Gig enquiries arrive with half the information missing. You reply asking how long the set is, whether there is a PA, and what the budget looks like, and three messages later the date is gone. A booking page asks those questions for you, before the conversation starts.",
      steps: [
        {
          title: "Put the music where clients land",
          body: "Embed your tracks and video, list what you play, and make the whole thing shareable as one link.",
        },
        {
          title: "Get the gig details up front",
          body: "Date, venue, and set length arrive with the request, so your first reply can already have a price on it.",
        },
        {
          title: "Lock the date with a deposit",
          body: "Send a priced offer and take payment in the booking chat, so the date is held by money and not by memory.",
        },
      ],
      faq: [
        {
          q: "Does this work for a band, not just a solo act?",
          a: "Yes. The page represents the act that gets booked, whether that is you alone or a group you lead.",
        },
        {
          q: "Can clients book me for a wedding through this?",
          a: "Yes. Event work is the common case: the request carries the date and venue, and you reply with a priced offer.",
        },
        {
          q: "How do I get paid for a gig?",
          a: "Payment happens in the same booking conversation, so the deposit and the balance stay attached to the job.",
        },
        {
          q: "Can I use my own domain?",
          a: "Yes, on a paid plan. You can start free on a subdomain and connect a domain later without rebuilding the page.",
        },
      ],
    },
    es: {
      eyebrow: "Para cantantes y músicos",
      title: "Una página de reservas para cantantes y músicos",
      subtitle:
        "Tu música, tu repertorio y un formulario que pide la fecha, el lugar y la duración del set desde el principio.",
      intro:
        "Las solicitudes de tocadas llegan con la mitad de la información. Contestas preguntando cuánto dura el set, si hay equipo de sonido y cuál es el presupuesto, y tres mensajes después la fecha ya se fue. Una página de reservas hace esas preguntas por ti, antes de que empiece la conversación.",
      steps: [
        {
          title: "Pon la música donde llega el cliente",
          body: "Integra tus rolas y videos, describe lo que tocas y comparte todo con un solo enlace.",
        },
        {
          title: "Pide los datos desde el inicio",
          body: "La fecha, el lugar y la duración llegan con la solicitud, así tu primera respuesta ya puede llevar precio.",
        },
        {
          title: "Aparta la fecha con anticipo",
          body: "Mandas una oferta con precio y cobras en el chat, para que la fecha quede apartada con dinero y no de palabra.",
        },
      ],
      faq: [
        {
          q: "¿Sirve para una banda o solo para solistas?",
          a: "Sirve para los dos. La página representa al acto que se contrata, seas tú solo o un grupo que tú lideras.",
        },
        {
          q: "¿Me pueden contratar para una boda por aquí?",
          a: "Sí. Los eventos son el caso más común: la solicitud trae la fecha y el lugar, y tú respondes con una oferta con precio.",
        },
        {
          q: "¿Cómo cobro una tocada?",
          a: "El pago ocurre en la misma conversación de reserva, así el anticipo y el resto quedan ligados al trabajo.",
        },
        {
          q: "¿Puedo usar mi propio dominio?",
          a: "Sí, en un plan de pago. Puedes empezar gratis en un subdominio y conectar tu dominio después sin rehacer la página.",
        },
      ],
    },
  },
  {
    slug: "chefs",
    photo: CASE_STUDY_PHOTOS.chefs,
    related: ["musicians", "models", "photographers"],
    en: {
      eyebrow: "For private chefs",
      title: "A booking page for private chefs",
      subtitle:
        "Your menus, your service area, and a request that arrives with the date, the headcount, and the dietary notes.",
      intro:
        "A private dinner is quoted on details: how many guests, which menu, whose kitchen, what people cannot eat. Collecting that over messages takes a day and costs you bookings. A booking page collects it in one step and lets you answer with a real price.",
      steps: [
        {
          title: "Publish the menus",
          body: "Show what you cook and what each service includes, so clients arrive already knowing what they are asking for.",
        },
        {
          title: "Take the brief in one step",
          body: "Date, guest count, location, and dietary notes come in together, which is everything you need to quote.",
        },
        {
          title: "Quote, confirm, and get paid",
          body: "Send a priced offer for the menu they chose and take payment in the same conversation.",
        },
      ],
      faq: [
        {
          q: "Can I price per person instead of a flat fee?",
          a: "Yes. You write the offer, so you can price the way you actually work, per head or per service.",
        },
        {
          q: "Can I show different menus at different prices?",
          a: "Yes. Each service you offer can carry its own description and price on your page.",
        },
        {
          q: "Do I need my own website already?",
          a: "No. The page is the website. You get one free on a subdomain, and you can connect your own domain on a paid plan.",
        },
        {
          q: "How do I handle a client who cancels?",
          a: "Because payment happens on the booking, a confirmed date is a paid date rather than a verbal hold.",
        },
      ],
    },
    es: {
      eyebrow: "Para chefs privados",
      title: "Una página de reservas para chefs privados",
      subtitle:
        "Tus menús, tu zona de servicio y solicitudes que llegan con la fecha, el número de comensales y las restricciones.",
      intro:
        "Una cena privada se cotiza con detalles: cuántos invitados, qué menú, en qué cocina y qué no puede comer la gente. Juntar todo eso por mensajes toma un día y te cuesta reservas. Una página lo recoge en un paso y te deja responder con un precio real.",
      steps: [
        {
          title: "Publica los menús",
          body: "Muestra lo que cocinas y qué incluye cada servicio, para que el cliente llegue sabiendo qué está pidiendo.",
        },
        {
          title: "Recibe el brief completo",
          body: "Fecha, número de personas, lugar y restricciones llegan juntos, que es justo lo que necesitas para cotizar.",
        },
        {
          title: "Cotiza, confirma y cobra",
          body: "Mandas una oferta con precio por el menú que eligieron y cobras en la misma conversación.",
        },
      ],
      faq: [
        {
          q: "¿Puedo cobrar por persona en vez de precio fijo?",
          a: "Sí. Tú escribes la oferta, así que puedes cobrar como realmente trabajas, por persona o por servicio.",
        },
        {
          q: "¿Puedo mostrar varios menús con precios distintos?",
          a: "Sí. Cada servicio que ofreces puede llevar su propia descripción y precio en tu página.",
        },
        {
          q: "¿Necesito ya tener un sitio web?",
          a: "No. La página es el sitio. Tienes una gratis en un subdominio y puedes conectar tu dominio en un plan de pago.",
        },
        {
          q: "¿Qué pasa si el cliente cancela?",
          a: "Como el pago ocurre en la reserva, una fecha confirmada es una fecha pagada y no un apartado de palabra.",
        },
      ],
    },
  },
  {
    slug: "photographers",
    photo: CASE_STUDY_PHOTOS.wedding,
    related: ["models", "musicians", "chefs"],
    en: {
      eyebrow: "For photographers",
      title: "A booking page for photographers",
      subtitle:
        "Your portfolio, your packages, and enquiries that arrive with the date, the shoot type, and the usage already answered.",
      intro:
        "Photography enquiries stall on scope. A client asks what you charge, you ask what the shoot is for, and the thread dies before anyone names a date. A booking page asks for the shoot type, the date, and the usage up front, so your first reply can be a quote instead of a question.",
      steps: [
        {
          title: "Lead with the work",
          body: "A portfolio that loads fast and reads like a studio site, not a social feed you have to scroll.",
        },
        {
          title: "Publish your packages",
          body: "List what each session includes and what it costs, so price questions stop arriving in the inbox.",
        },
        {
          title: "Book it and take the retainer",
          body: "Send a priced offer for the package they picked and take payment in the booking conversation.",
        },
      ],
      faq: [
        {
          q: "Can I show different packages for weddings and portraits?",
          a: "Yes. Each service carries its own description and price, so different shoot types can be priced differently.",
        },
        {
          q: "Can I take a retainer before the shoot date?",
          a: "Yes. You send a priced offer and take payment in the booking chat, so the date is held against a payment.",
        },
        {
          q: "Is this a replacement for my portfolio site?",
          a: "It can be. The page is a real site with your work on it, and the booking flow is built in rather than bolted on.",
        },
        {
          q: "What happens after a client books?",
          a: "The booking, the messages, and the payment stay together in one record, so nothing lives only in your inbox.",
        },
      ],
    },
    es: {
      eyebrow: "Para fotógrafos",
      title: "Una página de reservas para fotógrafos",
      subtitle:
        "Tu portafolio, tus paquetes y solicitudes que llegan con la fecha, el tipo de sesión y el uso ya respondidos.",
      intro:
        "Las solicitudes de fotografía se atoran en el alcance. El cliente pregunta cuánto cobras, tú preguntas para qué es la sesión, y la conversación se muere antes de que alguien diga una fecha. Una página pide el tipo de sesión, la fecha y el uso desde el inicio, así tu primera respuesta es una cotización y no otra pregunta.",
      steps: [
        {
          title: "Que se vea el trabajo primero",
          body: "Un portafolio que carga rápido y se lee como el sitio de un estudio, no como un feed que hay que scrollear.",
        },
        {
          title: "Publica tus paquetes",
          body: "Di qué incluye cada sesión y cuánto cuesta, para que las preguntas de precio dejen de llegar al inbox.",
        },
        {
          title: "Reserva y cobra el anticipo",
          body: "Mandas una oferta con precio por el paquete que eligieron y cobras en la conversación de reserva.",
        },
      ],
      faq: [
        {
          q: "¿Puedo mostrar paquetes distintos para bodas y retratos?",
          a: "Sí. Cada servicio lleva su propia descripción y precio, así cada tipo de sesión se cobra distinto.",
        },
        {
          q: "¿Puedo cobrar anticipo antes de la sesión?",
          a: "Sí. Mandas una oferta con precio y cobras en el chat, así la fecha queda apartada contra un pago.",
        },
        {
          q: "¿Sustituye a mi sitio de portafolio?",
          a: "Puede hacerlo. La página es un sitio real con tu trabajo, y el flujo de reservas viene integrado, no pegado por fuera.",
        },
        {
          q: "¿Qué pasa después de que el cliente reserva?",
          a: "La reserva, los mensajes y el pago quedan juntos en un mismo registro, así nada vive solo en tu correo.",
        },
      ],
    },
  },
];

export function getTalentCategory(slug: string): TalentCategory | undefined {
  return TALENT_CATEGORIES.find((c) => c.slug === slug);
}

export function getCategoryContent(
  category: TalentCategory,
  locale: string,
): CategoryContent {
  return locale === "es" ? category.es : category.en;
}
