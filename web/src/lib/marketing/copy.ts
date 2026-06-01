/**
 * Marketing copy — EN + ES, in one typed module.
 *
 * Voice: real marketing talk, not AI filler. English is punchy and concrete;
 * Spanish is natural Mexican Spanish using "tú" — written to sell, not
 * translated word-for-word. `es` is typed as `typeof en`, so TypeScript fails
 * the build if a key is missing in either language.
 *
 * Server components: `getMarketingCopy(await getRequestLocale())`.
 * Client components: receive `locale` as a prop and call `getMarketingCopy(locale)`.
 */

const en = {
  nav: {
    platform: {
      label: "Platform",
      blurb: "One place to build a business around people — and get paid.",
      items: [
        {
          label: "One-click page builder",
          description: "Your services website and business workspace, generated in a click.",
        },
        {
          label: "Booking messenger",
          description: "Inquiry → offer → booking → payment, all inside one chat.",
        },
        { label: "The network", description: "Opt into shared, cross-roster discovery." },
        {
          label: "Integrations & API",
          description: "Embed your roster anywhere, or build on the API.",
        },
        { label: "How it works", description: "The full platform tour, end to end." },
      ],
    },
    solutions: {
      label: "Solutions",
      blurb: "However you work — sell your own services, run a business, or both.",
      items: [
        {
          label: "For talent",
          description: "Sell your services from one page. Free to start.",
        },
        {
          label: "For business",
          description: "Run an agency, studio, or salon on your own domain.",
        },
        { label: "For hubs", description: "Build a city-wide network of vetted pros." },
        {
          label: "Talent + workspace",
          description: "Be the talent and run the business. One account.",
        },
      ],
    },
    discover: {
      label: "Discover",
      blurb: "Browse the whole network — then start a conversation.",
      items: [
        { label: "Browse talent", description: "Every roster, one global directory." },
        { label: "Agencies & hubs", description: "Find where your talent can grow next." },
        { label: "The network", description: "How shared, opt-in discovery works." },
      ],
    },
    pricing: "Pricing",
    stories: "Stories",
    joinAsTalent: "Join as talent",
    signIn: "Sign in",
    startFree: "Start free",
  },

  hero: {
    eyebrow: "The talent business platform",
    titleLine1: "Your talent is",
    titleLine2: "worth money.",
    subhead:
      "Open a free page and start taking requests in minutes. When you're ready, build your own site and business workspace in one click — and take bookings and payments right inside the chat.",
    ctaTalent: "Sell your work — free",
    ctaBusiness: "Start a business",
    trust: ["Free forever", "No code", "Bookings & payments built in"],
  },

  audience: {
    eyebrow: "Who it's for",
    title: "Built for how you work.",
    subtitle:
      "Sell your own services, run a full business, or curate a hub — Tulala scales with you. And you don't have to pick just one.",
    talent: {
      eyebrow: "For talent",
      title: "Sell your work.",
      subtitle:
        "Give your skill a page, a booking flow, and room to grow — without building anything first.",
      points: [
        "Free profile and shareable link",
        "Reservations and payments built in",
        "Apply to agencies and hubs anytime",
      ],
      cta: "Start as talent",
    },
    business: {
      eyebrow: "For business",
      title: "Run the business.",
      subtitle:
        "A branded site on your own domain, your team, and inquiries that turn into real bookings.",
      points: [
        "Custom domain and branded pages",
        "Roles and permissions for your team",
        "Inquiry → offer → booking pipeline",
      ],
      cta: "Build a business",
    },
    hub: {
      eyebrow: "For hubs",
      title: "Build a network.",
      subtitle:
        "Curate vetted pros into a searchable hub clients book from and talent apply to join.",
      points: [
        "Browse-and-filter directory",
        "Applications and approvals",
        "Routed, attributed bookings",
      ],
      cta: "Explore hubs",
    },
  },

  footer: {
    description:
      "The talent business platform — sell your services, run your business, get paid.",
    columns: {
      platform: {
        label: "Platform",
        items: [
          "One-click page builder",
          "Booking messenger",
          "The network",
          "Integrations & API",
          "How it works",
        ],
      },
      solutions: {
        label: "Solutions",
        items: ["For talent", "For business", "For hubs", "Talent + workspace"],
      },
      discover: {
        label: "Discover",
        items: ["Browse talent", "Agencies & hubs", "Stories"],
      },
      company: {
        label: "Company",
        items: ["Pricing", "Start free", "FAQ", "Privacy", "Terms"],
      },
    },
  },
};

export type MarketingCopy = typeof en;

const es: MarketingCopy = {
  nav: {
    platform: {
      label: "Plataforma",
      blurb: "Un solo lugar para construir un negocio alrededor de tu gente — y cobrar.",
      items: [
        {
          label: "Constructor de páginas en un clic",
          description: "Tu sitio de servicios y tu panel de negocio, en un solo clic.",
        },
        {
          label: "Mensajería de reservas",
          description: "Solicitud → oferta → reserva → pago, todo en un mismo chat.",
        },
        { label: "La red", description: "Súmate al descubrimiento compartido entre catálogos." },
        {
          label: "Integraciones y API",
          description: "Inserta tu catálogo donde sea, o construye sobre la API.",
        },
        { label: "Cómo funciona", description: "El recorrido completo de la plataforma." },
      ],
    },
    solutions: {
      label: "Soluciones",
      blurb: "Como sea que trabajes — vende tus servicios, lleva un negocio, o las dos cosas.",
      items: [
        {
          label: "Para talento",
          description: "Vende tus servicios desde una sola página. Gratis para empezar.",
        },
        {
          label: "Para negocios",
          description: "Lleva una agencia, estudio o salón en tu propio dominio.",
        },
        { label: "Para hubs", description: "Crea una red local de profesionales verificados." },
        {
          label: "Talento + negocio",
          description: "Sé el talento y lleva el negocio. Una sola cuenta.",
        },
      ],
    },
    discover: {
      label: "Explora",
      blurb: "Explora toda la red — y empieza una conversación.",
      items: [
        { label: "Explorar talento", description: "Todos los catálogos, un solo directorio." },
        { label: "Agencias y hubs", description: "Encuentra dónde crecer." },
        { label: "La red", description: "Cómo funciona el descubrimiento compartido." },
      ],
    },
    pricing: "Precios",
    stories: "Historias",
    joinAsTalent: "Únete como talento",
    signIn: "Entrar",
    startFree: "Empieza gratis",
  },

  hero: {
    eyebrow: "La plataforma del negocio del talento",
    titleLine1: "Tu talento",
    titleLine2: "vale dinero.",
    subhead:
      "Abre una página gratis y empieza a recibir solicitudes en minutos. Cuando estés listo, crea tu propio sitio y tu panel de negocio en un clic — y cobra reservas y pagos desde el mismo chat.",
    ctaTalent: "Vende tu trabajo — gratis",
    ctaBusiness: "Abre tu negocio",
    trust: ["Gratis para siempre", "Sin código", "Reservas y pagos incluidos"],
  },

  audience: {
    eyebrow: "Para quién es",
    title: "Hecho para tu forma de trabajar.",
    subtitle:
      "Vende tus servicios, lleva un negocio completo o crea un hub — Tulala crece contigo. Y no tienes que elegir solo uno.",
    talent: {
      eyebrow: "Para talento",
      title: "Vende tu trabajo.",
      subtitle:
        "Dale a tu oficio una página, un flujo de reservas y espacio para crecer — sin construir nada primero.",
      points: [
        "Perfil gratis y enlace para compartir",
        "Reservas y pagos incluidos",
        "Postúlate a agencias y hubs cuando quieras",
      ],
      cta: "Empieza como talento",
    },
    business: {
      eyebrow: "Para negocios",
      title: "Lleva el negocio.",
      subtitle:
        "Un sitio con tu marca en tu propio dominio, tu equipo, y solicitudes que se vuelven reservas reales.",
      points: [
        "Dominio propio y páginas con tu marca",
        "Roles y permisos para tu equipo",
        "Flujo de solicitud → oferta → reserva",
      ],
      cta: "Crea tu negocio",
    },
    hub: {
      eyebrow: "Para hubs",
      title: "Crea una red.",
      subtitle:
        "Reúne profesionales verificados en un hub donde los clientes reservan y el talento se postula.",
      points: [
        "Directorio para buscar y filtrar",
        "Postulaciones y aprobaciones",
        "Reservas dirigidas y atribuidas",
      ],
      cta: "Explora los hubs",
    },
  },

  footer: {
    description:
      "La plataforma del negocio del talento — vende tus servicios, lleva tu negocio, cobra.",
    columns: {
      platform: {
        label: "Plataforma",
        items: [
          "Constructor en un clic",
          "Mensajería de reservas",
          "La red",
          "Integraciones y API",
          "Cómo funciona",
        ],
      },
      solutions: {
        label: "Soluciones",
        items: ["Para talento", "Para negocios", "Para hubs", "Talento + negocio"],
      },
      discover: {
        label: "Explora",
        items: ["Explorar talento", "Agencias y hubs", "Historias"],
      },
      company: {
        label: "Empresa",
        items: ["Precios", "Empieza gratis", "Preguntas frecuentes", "Privacidad", "Términos"],
      },
    },
  },
};

export function getMarketingCopy(locale: string): MarketingCopy {
  return locale === "es" ? es : en;
}
