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
    dashboard: "Dashboard",
    newWorkspace: "New workspace",
    signOut: "Sign out",
  },

  hero: {
    eyebrow: "The talent business platform",
    titleLine1: "Your talent and services",
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

  flagship: {
    eyebrow: "The platform",
    title: "Two things no one else has put in one place.",
    subtitle:
      "A builder that ships your whole business in a click — and a messenger where the conversation becomes the booking, and the payment.",
    builder: {
      eyebrow: "One-click page builder",
      title: "Your website and your workspace. One click.",
      body: "Describe your business once. Tulala builds the services website your clients see and the workspace you run it from — wired together, on-brand, live in minutes. This is the 2027 builder: repeaters, a media library, motion, and real data binding, with zero code.",
      bullets: [
        "One prompt → a public site and a private workspace, instantly",
        "Drag-and-drop refinement when you want it; AI when you don't",
        "Your brand, your domain, your design system on every page",
        "The same builder powers a solo page or a 50-person roster",
      ],
      cta: "Build yours free",
    },
    messenger: {
      eyebrow: "Booking messenger",
      title: "Where the chat becomes the booking — and the payment.",
      body: "Every inquiry lands in one thread. Send a versioned offer, get it approved, take a deposit or the full amount, and turn it into a confirmed booking — without leaving the conversation. Messages and money, finally in the same place.",
      bullets: [
        "Inquiry → offer → approval → booking, one thread",
        "Collect deposits or full payment right inside the chat",
        "Versioned offers and multi-party approvals built in",
        "Every booking traceable to the source that earned it",
      ],
      cta: "See how it works",
    },
    support: [
      { title: "Reservations & deposits", body: "Calendars, slots, and deposits that quietly kill no-shows." },
      { title: "The shared network", body: "Opt into cross-roster discovery and get found by new clients." },
      { title: "Talent + workspace", body: "Be the talent and run the business — from one login." },
    ],
    builderMock: {
      prompt: "A booking site for my massage studio",
      services: "Services website",
      workspace: "Business workspace",
    },
  },

  tour: {
    eyebrow: "Product tour",
    title: "Everything they see. Everything you run.",
    subtitle:
      "A public page clients can book from, profiles that show your work properly, and an inbox where inquiries turn into paid bookings — all wired together.",
    tabs: [
      {
        label: "Your page",
        eyebrow: "01 · Public site",
        title: "A site that's ready to book in minutes.",
        body: "A real, editorial-grade page with your work front and centre. Your subdomain on day one, your own domain whenever you want it. No developer, no template feel.",
      },
      {
        label: "Profiles",
        eyebrow: "02 · Public profiles",
        title: "Every person, presented properly.",
        body: "Portfolio, services, availability, and one clean booking button — on one shareable link. The way selling your work was always supposed to look online.",
      },
      {
        label: "Bookings inbox",
        eyebrow: "03 · Booking pipeline",
        title: "From inquiry to paid booking, in one place.",
        body: "Structured inquiries, versioned offers, approvals, and traceable bookings. Everything a real business needs that a group chat can't give you.",
      },
    ],
    mockFeatured: "Featured roster",
    mockHeading: "People worth booking.",
    mockAvailable: "Available",
  },

  network: {
    eyebrow: "The network",
    titleLine1: "You're not alone on a link.",
    titleLine2: "You're on a network.",
    paragraph:
      "Talent finds agencies and hubs to apply to, clients discover the right people, and businesses grow beyond their own site. It's an opportunity feed, not a static list.",
    bullets: [
      {
        title: "Talent applies where they fit",
        body: "Find open agencies and hubs and apply right from your talent dashboard.",
      },
      {
        title: "Businesses keep their own brand",
        body: "Every workspace keeps its site, roster, and bookings — and still gets found through shared discovery.",
      },
      {
        title: "Your data stays yours",
        body: "Opt in any time, opt out any time. Your roster, brand, and relationships are always portable.",
      },
    ],
    ctaPrimary: "Browse agencies & hubs",
    ctaSecondary: "How the hub works",
    diagramEyebrow: "Agencies & hubs",
    diagramCaption: "Search the network before you apply.",
    tagOpen: "Open",
  },

  pricing: {
    eyebrow: "Pricing",
    title: "Start free. Grow when you're ready.",
    subtitle:
      "Every plan takes you from inquiry to booked and paid — for free. Paid tiers add roster size, branding, and channels as your business grows.",
    footnote:
      "Currency converts for LATAM & EU. Annual plans save 20%. No setup fees, and your data is always yours — export anytime.",
    mostPopular: "Most popular",
  },

  faq: {
    eyebrow: "Frequently asked",
    title: "The short version.",
    subtitle: "What people ask before signing up. Straight answers — no fluff.",
    stillQuestions: "Still have questions?",
    seeAll: "See all FAQs",
    items: [
      {
        q: "Who is Tulala for?",
        a: "Anyone who sells their work or runs a business around people — singers, chefs, stylists, cleaners, photographers, coaches; salons, studios and agencies; and city hubs that connect local pros with clients. If you've ever booked work over WhatsApp, this is for you.",
      },
      {
        q: "Is there really a free plan?",
        a: "Yes — a genuinely useful free plan, not a trial in disguise. You get a free page, a shareable link, reservations, and a real inquiry inbox. No credit card required.",
      },
      {
        q: "Can I use my own domain?",
        a: "Yes, on the paid plans. Bring your own domain and get full control over your pages, design, and brand. Your site looks like a real business — because it is one.",
      },
      {
        q: "How is this different from Squarespace or Notion?",
        a: "Those are just for presentation — you'd still juggle bookings in WhatsApp, payments somewhere else, and your schedule in your head. Tulala is the whole thing: a site, a booking flow, payments, and a shared discovery network — built around how service businesses actually work.",
      },
      {
        q: "Do I have to be on the shared network?",
        a: "No. The network is opt-in, per business and per profile. Run Tulala as a private branded site, appear in the network, or both — you control what's discoverable.",
      },
      {
        q: "What happens to my data if I leave?",
        a: "It stays yours. Full export of your profiles, media, and booking history is available on every paid plan. No lock-in, no hostage data.",
      },
      {
        q: "Can my team work in it together?",
        a: "Yes — paid plans support multiple users with roles and permissions: owners, admins, coordinators, assistants. Everyone works in the same place with the right level of access.",
      },
      {
        q: "Does it work outside the US?",
        a: "Yes. Spanish and English, multi-currency pricing, and a design that travels cleanly across markets. Built for LATAM, North America, and Europe out of the box.",
      },
    ],
  },

  stories: {
    eyebrow: "Stories",
    title: "One platform. Every kind of talent business.",
    subtitle:
      "From a solo singer to a city-wide services hub — see how people use Tulala to sell their work, run their business, or both. Tap any story to read it.",
    footnote:
      "Illustrative stories that show what's possible today. Real customer pages connect here as they launch.",
    filters: ["All stories", "Talent", "Business", "Hubs", "Hybrid"],
    readStory: "Read the story",
    challengeLabel: "The challenge",
    approachLabel: "How they use Tulala",
    resultLabel: "The result",
    previewCta: "Preview the page",
    exampleNote: "Example page · live link coming soon",
  },

  finalCta: {
    eyebrow: "Start where you are. Grow as you go.",
    titleLine1: "Turn work into money.",
    titleLine2: "Run a real business.",
    subhead:
      "Open a free page and start taking requests today. When you're ready, launch your own site, collect inquiries, and run the whole business.",
    ctaTalent: "Sell your work — free",
    ctaBusiness: "Start a business",
    trust: [
      "Free subdomain",
      "No credit card",
      "Full export any time",
      "Upgrade to your own domain",
    ],
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
    dashboard: "Tu panel",
    newWorkspace: "Nuevo workspace",
    signOut: "Cerrar sesión",
  },

  hero: {
    eyebrow: "La plataforma del negocio del talento",
    titleLine1: "Tu talento y tus servicios",
    titleLine2: "valen dinero.",
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

  flagship: {
    eyebrow: "La plataforma",
    title: "Dos cosas que nadie más había juntado en un solo lugar.",
    subtitle:
      "Un constructor que lanza todo tu negocio en un clic — y una mensajería donde la conversación se vuelve la reserva, y el pago.",
    builder: {
      eyebrow: "Constructor de páginas en un clic",
      title: "Tu sitio y tu panel de negocio. Un clic.",
      body: "Describe tu negocio una vez. Tulala crea el sitio de servicios que ven tus clientes y el panel desde donde lo manejas — conectados, con tu marca, en vivo en minutos. Este es el constructor 2027: repetidores, biblioteca de medios, animación y datos reales, sin una línea de código.",
      bullets: [
        "Una instrucción → un sitio público y un panel privado, al instante",
        "Arrastra y suelta cuando quieras; IA cuando no",
        "Tu marca, tu dominio, tu diseño en cada página",
        "El mismo constructor sirve para una página o un catálogo de 50 personas",
      ],
      cta: "Crea el tuyo gratis",
    },
    messenger: {
      eyebrow: "Mensajería de reservas",
      title: "Donde el chat se vuelve la reserva — y el pago.",
      body: "Cada solicitud llega a un solo hilo. Envía una oferta, consigue la aprobación, cobra un anticipo o el total, y conviértelo en una reserva confirmada — sin salir de la conversación. Los mensajes y el dinero, por fin en el mismo lugar.",
      bullets: [
        "Solicitud → oferta → aprobación → reserva, un solo hilo",
        "Cobra anticipos o el pago completo dentro del chat",
        "Ofertas con versiones y aprobaciones de varias partes",
        "Cada reserva con su origen, siempre rastreable",
      ],
      cta: "Mira cómo funciona",
    },
    support: [
      { title: "Reservas y anticipos", body: "Calendarios, horarios y anticipos que acaban con las ausencias." },
      { title: "La red compartida", body: "Súmate al descubrimiento entre catálogos y que te encuentren nuevos clientes." },
      { title: "Talento + negocio", body: "Sé el talento y lleva el negocio — desde un solo acceso." },
    ],
    builderMock: {
      prompt: "Un sitio de reservas para mi estudio de masajes",
      services: "Sitio de servicios",
      workspace: "Panel de negocio",
    },
  },

  tour: {
    eyebrow: "Recorrido del producto",
    title: "Todo lo que ven. Todo lo que manejas.",
    subtitle:
      "Una página pública desde donde te reservan, perfiles que muestran bien tu trabajo, y una bandeja donde las solicitudes se vuelven reservas pagadas — todo conectado.",
    tabs: [
      {
        label: "Tu página",
        eyebrow: "01 · Sitio público",
        title: "Un sitio listo para reservar en minutos.",
        body: "Una página de verdad, con calidad editorial y tu trabajo al frente. Tu subdominio desde el primer día, tu propio dominio cuando quieras. Sin desarrollador, sin cara de plantilla.",
      },
      {
        label: "Perfiles",
        eyebrow: "02 · Perfiles públicos",
        title: "Cada persona, presentada como se debe.",
        body: "Portafolio, servicios, disponibilidad y un solo botón de reserva — en un enlace para compartir. Como siempre debió verse vender tu trabajo en línea.",
      },
      {
        label: "Bandeja de reservas",
        eyebrow: "03 · Flujo de reservas",
        title: "De la solicitud a la reserva pagada, en un solo lugar.",
        body: "Solicitudes estructuradas, ofertas con versiones, aprobaciones y reservas rastreables. Todo lo que un negocio de verdad necesita y un grupo de chat no te da.",
      },
    ],
    mockFeatured: "Catálogo destacado",
    mockHeading: "Gente que vale la pena reservar.",
    mockAvailable: "Disponible",
  },

  network: {
    eyebrow: "La red",
    titleLine1: "No estás solo con un enlace.",
    titleLine2: "Estás en una red.",
    paragraph:
      "El talento encuentra agencias y hubs para postularse, los clientes descubren a las personas indicadas, y los negocios crecen más allá de su propio sitio. Es un feed de oportunidades, no una lista estática.",
    bullets: [
      {
        title: "El talento se postula donde encaja",
        body: "Encuentra agencias y hubs abiertos y postúlate desde tu panel de talento.",
      },
      {
        title: "Los negocios conservan su marca",
        body: "Cada workspace mantiene su sitio, su catálogo y sus reservas — y aun así lo encuentran en el descubrimiento compartido.",
      },
      {
        title: "Tus datos son tuyos",
        body: "Súmate cuando quieras, sal cuando quieras. Tu catálogo, tu marca y tus relaciones siempre son portables.",
      },
    ],
    ctaPrimary: "Explora agencias y hubs",
    ctaSecondary: "Cómo funciona el hub",
    diagramEyebrow: "Agencias y hubs",
    diagramCaption: "Busca en la red antes de postularte.",
    tagOpen: "Abierto",
  },

  pricing: {
    eyebrow: "Precios",
    title: "Empieza gratis. Crece cuando estés listo.",
    subtitle:
      "Todos los planes te llevan de la solicitud a reservado y pagado — gratis. Los planes de pago suman tamaño de catálogo, marca y canales conforme creces.",
    footnote:
      "La moneda se ajusta para LATAM y la UE. Los planes anuales ahorran 20%. Sin costos de instalación, y tus datos siempre son tuyos — expórtalos cuando quieras.",
    mostPopular: "Más popular",
  },

  faq: {
    eyebrow: "Preguntas frecuentes",
    title: "La versión corta.",
    subtitle: "Lo que la gente pregunta antes de registrarse. Respuestas claras, sin rollo.",
    stillQuestions: "¿Te quedan dudas?",
    seeAll: "Ver todas las preguntas",
    items: [
      {
        q: "¿Para quién es Tulala?",
        a: "Para quien vende su trabajo o lleva un negocio alrededor de personas — cantantes, chefs, estilistas, personal de limpieza, fotógrafos, coaches; salones, estudios y agencias; y hubs locales que conectan profesionales con clientes. Si alguna vez agendaste trabajo por WhatsApp, esto es para ti.",
      },
      {
        q: "¿De verdad hay un plan gratis?",
        a: "Sí — un plan gratis de verdad útil, no una prueba disfrazada. Tienes una página gratis, un enlace para compartir, reservas y una bandeja de solicitudes real. Sin tarjeta.",
      },
      {
        q: "¿Puedo usar mi propio dominio?",
        a: "Sí, en los planes de pago. Trae tu dominio y controla por completo tus páginas, diseño y marca. Tu sitio se ve como un negocio de verdad — porque lo es.",
      },
      {
        q: "¿En qué se diferencia de Squarespace o Notion?",
        a: "Esos son solo para presentar — seguirías cuadrando reservas por WhatsApp, los pagos por otro lado y la agenda en tu cabeza. Tulala es todo junto: un sitio, un flujo de reservas, pagos y una red de descubrimiento — hecho para cómo funcionan de verdad los negocios de servicios.",
      },
      {
        q: "¿Estoy obligado a aparecer en la red compartida?",
        a: "No. La red es opcional, por negocio y por perfil. Usa Tulala como un sitio privado con tu marca, aparece en la red, o las dos cosas — tú decides qué se puede descubrir.",
      },
      {
        q: "¿Qué pasa con mis datos si me voy?",
        a: "Siguen siendo tuyos. Puedes exportar tus perfiles, medios e historial de reservas en cualquier plan de pago. Sin candados, sin datos secuestrados.",
      },
      {
        q: "¿Mi equipo puede trabajar conmigo ahí?",
        a: "Sí — los planes de pago permiten varios usuarios con roles y permisos: dueños, administradores, coordinadores, asistentes. Todos trabajan en el mismo lugar con el acceso que les toca.",
      },
      {
        q: "¿Funciona fuera de EE. UU.?",
        a: "Sí. Español e inglés, precios en varias monedas, y un diseño que viaja bien entre mercados. Hecho para LATAM, Norteamérica y Europa desde el primer día.",
      },
    ],
  },

  stories: {
    eyebrow: "Historias",
    title: "Una plataforma. Cada tipo de negocio de talento.",
    subtitle:
      "De una cantante independiente a un hub de servicios para toda una ciudad — mira cómo la gente usa Tulala para vender su trabajo, llevar su negocio, o las dos cosas. Toca cualquier historia para leerla.",
    footnote:
      "Historias ilustrativas de lo que ya es posible hoy. Las páginas de clientes reales se conectan aquí conforme se lanzan.",
    filters: ["Todas", "Talento", "Negocios", "Hubs", "Híbrido"],
    readStory: "Leer la historia",
    challengeLabel: "El reto",
    approachLabel: "Cómo usan Tulala",
    resultLabel: "El resultado",
    previewCta: "Ver la página",
    exampleNote: "Página de ejemplo · enlace real pronto",
  },

  finalCta: {
    eyebrow: "Empieza donde estás. Crece a tu ritmo.",
    titleLine1: "Convierte tu trabajo en dinero.",
    titleLine2: "Lleva un negocio de verdad.",
    subhead:
      "Abre una página gratis y empieza a recibir solicitudes hoy. Cuando estés listo, lanza tu propio sitio, recibe tus solicitudes y lleva todo el negocio.",
    ctaTalent: "Vende tu trabajo — gratis",
    ctaBusiness: "Abre tu negocio",
    trust: [
      "Subdominio gratis",
      "Sin tarjeta",
      "Exporta cuando quieras",
      "Conecta tu propio dominio",
    ],
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
