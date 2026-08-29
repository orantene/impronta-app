import type { Feature } from "./types";

/**
 * Plate 01, Tier S. The second money page of the hub.
 *
 * Target intent: "pagina web para modelos", "crear pagina web profesional",
 * "pagina web para barberia", "website builder for photographers". Competes
 * with Wix and Squarespace, and wins on the thing neither of them does: the
 * site takes bookings and money without a plugin marketplace.
 */
export const WEBSITE_BUILDER_FEATURE: Feature = {
  key: "website-builder",
  plate: 1,
  group: "presence",
  slugEn: "website-builder",
  slugEs: "crear-pagina-web",
  tier: "S",
  status: "live",
  related: ["media-library", "services-storefront", "talent-profiles", "directory"],

  en: {
    name: "Website Builder",
    title: "Build your own professional website",
    subtitle:
      "A real website with your own domain, in English and Spanish, with SEO and publishing checks built in. No designer, no plugins, no monthly surprises.",
    promise: "A real website, not a link in a bio.",

    popup: [
      [
        "Drag things where you want them. Change how it looks on a phone separately from a laptop, and publish when it looks right.",
      ],
      [
        "Your own domain, both languages, and checks that stop you publishing something broken: a missing image description, unreadable contrast, a page nobody can find.",
      ],
      [
        "It plugs into the rest of your business: your ",
        { f: "services-storefront", label: "services and prices" },
        ", your ",
        { f: "media-library", label: "photos" },
        ", and buttons that actually take money.",
      ],
    ],

    intro: [
      [
        "A social profile is rented ground. The algorithm decides who sees it, the rules change without asking you, and the audience belongs to somebody else.",
      ],
      [
        "Your own site is the opposite. It is the one place your work is presented the way you want, found by people searching for what you do, and able to take a booking and a payment without sending anyone somewhere else.",
      ],
    ],

    sections: [
      {
        heading: "Design without fighting a template",
        body: [
          [
            "You get real control. Place elements where you want them, set how they behave on a phone separately from a laptop, use your own colours and type, and add movement where it earns its place.",
          ],
          [
            "More than forty building blocks are ready to use: galleries, forms, pricing tables, embedded video, testimonials, maps. You are arranging finished pieces rather than starting from an empty page, which is the difference between a site that ships this week and one that never does.",
          ],
        ],
      },
      {
        heading: "Two languages, one design",
        body: [
          [
            "Write the page once and give it a Spanish version without rebuilding it. The layout stays identical and only the words change, so you are never maintaining two sites that slowly drift apart.",
          ],
          [
            "This matters more than it sounds. Most small businesses that try to serve two languages end up with one good site and one abandoned one. Here there is only ever one site.",
          ],
        ],
      },
      {
        heading: "It refuses to let you publish something broken",
        body: [
          [
            "Before a page goes live it gets checked: image descriptions for search engines and screen readers, colour contrast a person can actually read, links that lead somewhere, and how the whole thing behaves on a small screen.",
          ],
          [
            "Problems that would cost you visitors block the publish. Smaller suggestions just tell you. It is the review a good agency would give you, running every single time, for free.",
          ],
        ],
      },
      {
        heading: "The part other builders leave to plugins",
        body: [
          [
            "On most website builders, taking a booking or a payment means finding a plugin, paying a second subscription, and hoping the two stay compatible. Here a booking button, a service with a price and a checkout are part of the same product.",
          ],
          [
            "Your site can show your ",
            { f: "services-storefront", label: "menu and prices" },
            ", let someone ",
            { f: "appointments", label: "book a time" },
            ", take a deposit through ",
            { f: "payments", label: "payments built in" },
            ", and drop the whole thing into your inbox as one conversation.",
          ],
        ],
      },
      {
        heading: "Found, not just built",
        body: [
          [
            "A site nobody finds is a business card in a drawer. Titles, descriptions, image text and a sitemap are handled for you, you can verify the site with Google from your dashboard, and redirects keep old links working when you change something.",
          ],
          [
            "You are also listed in the ",
            { f: "directory", label: "Tulala directory" },
            ", which sends you people who were searching for what you do and had never heard your name.",
          ],
        ],
      },
      {
        heading: "Who this is for",
        body: [
          [
            "A barber who wants a page that takes bookings instead of a phone that rings during a haircut. A photographer whose portfolio currently lives in a shared drive. An agency that needs a site their talent can be presented on. A restaurant that wants its own page rather than renting customers from a marketplace.",
          ],
          [
            "It is not for selling physical stock. If your business ships boxes, you want a store. This is for people who sell what they do.",
          ],
        ],
      },
    ],

    highlights: [
      "Your own domain, or a free address to start today",
      "Separate control for desktop, tablet and phone",
      "More than forty ready building blocks",
      "English and Spanish from one design",
      "Publishing checks for SEO, contrast, links and mobile",
      "Blog, forms, galleries and embedded media",
      "Redirects and search engine verification",
      "Booking and payment built in, not bolted on",
    ],

    faq: [
      {
        q: "Do I need to know how to design?",
        a: "No. You start from a finished layout and change what you want. Nothing you do can break the underlying structure of the page, so you cannot get into a state you have to call somebody to fix.",
      },
      {
        q: "Can I use a domain I already own?",
        a: "Yes, on a paid plan you connect your own domain. On the free plan you get an address on ours, so you can be online today and move to your own name later without rebuilding anything.",
      },
      {
        q: "How is this different from Wix or Squarespace?",
        a: "Mostly in what happens after the site looks good. Taking bookings, deposits and payments here is part of the same product rather than a plugin and a second subscription, and your services, calendar and inbox are the same ones the rest of your business runs on.",
      },
      {
        q: "Will people find my site on Google?",
        a: "That is what the publishing checks are for. Titles, descriptions, image text and a sitemap are handled, and you can verify the site with Google directly from your dashboard. Nobody can promise a ranking, but nothing here will be the reason you do not get one.",
      },
      {
        q: "What happens to my site if I stop paying?",
        a: "You drop to the free plan and your site stays online at a free address. We do not take a business offline over a card that expired.",
      },
      {
        q: "Can I sell products too?",
        a: "You can sell services, packages and menus with prices. Physical inventory with shipping is not what this is built for, and we would rather say so than have you find out later.",
      },
    ],
  },

  es: {
    name: "Creador de sitios web",
    title: "Crea tu página web profesional",
    subtitle:
      "Un sitio web de verdad con tu propio dominio, en español e inglés, con SEO y revisiones de publicación incluidas. Sin diseñador, sin plugins, sin sorpresas.",
    promise: "Un sitio de verdad, no un enlace en la bio.",

    popup: [
      [
        "Coloca las cosas donde tú quieras. Ajusta cómo se ve en el teléfono aparte de la computadora, y publica cuando se vea bien.",
      ],
      [
        "Tu propio dominio, los dos idiomas y revisiones que impiden publicar algo roto: una descripción de imagen faltante, contraste ilegible, una página que nadie puede encontrar.",
      ],
      [
        "Se conecta con el resto de tu negocio: tus ",
        { f: "services-storefront", label: "servicios y precios" },
        ", tus ",
        { f: "media-library", label: "fotos" },
        ", y botones que de verdad cobran.",
      ],
    ],

    intro: [
      [
        "Un perfil en redes sociales es terreno rentado. El algoritmo decide quién lo ve, las reglas cambian sin preguntarte y la audiencia le pertenece a alguien más.",
      ],
      [
        "Tu propio sitio es lo contrario. Es el único lugar donde tu trabajo se presenta como tú quieres, donde te encuentra quien busca lo que haces, y donde puedes tomar una reserva y un pago sin mandar a nadie a otro lado.",
      ],
    ],

    sections: [
      {
        heading: "Diseña sin pelearte con una plantilla",
        body: [
          [
            "Tienes control real. Coloca los elementos donde quieras, define cómo se comportan en el teléfono aparte de la computadora, usa tus colores y tus tipografías, y agrega movimiento donde valga la pena.",
          ],
          [
            "Hay más de cuarenta bloques listos para usar: galerías, formularios, tablas de precios, video incrustado, testimonios, mapas. Estás acomodando piezas terminadas en lugar de empezar de una página en blanco, que es la diferencia entre un sitio que sale esta semana y uno que nunca sale.",
          ],
        ],
      },
      {
        heading: "Dos idiomas, un solo diseño",
        body: [
          [
            "Escribe la página una vez y dale su versión en inglés sin volver a construirla. El diseño queda idéntico y solo cambian las palabras, así que nunca mantienes dos sitios que poco a poco dejan de parecerse.",
          ],
          [
            "Esto importa más de lo que suena. La mayoría de los negocios pequeños que intentan atender dos idiomas terminan con un sitio bueno y otro abandonado. Aquí siempre hay un solo sitio.",
          ],
        ],
      },
      {
        heading: "No te deja publicar algo roto",
        body: [
          [
            "Antes de que una página salga al aire se revisa: descripciones de imagen para buscadores y lectores de pantalla, contraste que una persona de verdad pueda leer, enlaces que lleven a algún lado, y cómo se comporta todo en una pantalla chica.",
          ],
          [
            "Los problemas que te costarían visitas bloquean la publicación. Las sugerencias menores solo te avisan. Es la revisión que te daría una buena agencia, corriendo cada vez, sin costo.",
          ],
        ],
      },
      {
        heading: "La parte que otros creadores dejan a los plugins",
        body: [
          [
            "En la mayoría de los creadores de sitios, tomar una reserva o un pago significa buscar un plugin, pagar una segunda suscripción y esperar que los dos sigan siendo compatibles. Aquí un botón de reserva, un servicio con precio y un cobro son parte del mismo producto.",
          ],
          [
            "Tu sitio puede mostrar tu ",
            { f: "services-storefront", label: "menú y tus precios" },
            ", dejar que alguien ",
            { f: "appointments", label: "aparte un horario" },
            ", cobrar un anticipo con ",
            { f: "payments", label: "pagos integrados" },
            ", y dejar todo eso en tu bandeja como una sola conversación.",
          ],
        ],
      },
      {
        heading: "Que te encuentren, no solo que exista",
        body: [
          [
            "Un sitio que nadie encuentra es una tarjeta de presentación en un cajón. Títulos, descripciones, texto de imágenes y mapa del sitio quedan resueltos, puedes verificar el sitio con Google desde tu panel, y las redirecciones mantienen vivos los enlaces viejos cuando cambias algo.",
          ],
          [
            "También apareces en el ",
            { f: "directory", label: "directorio de Tulala" },
            ", que te manda gente que estaba buscando lo que haces y nunca había oído tu nombre.",
          ],
        ],
      },
      {
        heading: "Para quién es esto",
        body: [
          [
            "Una barbería que quiere una página que tome reservas en lugar de un teléfono que suena a media rasurada. Un fotógrafo cuyo portafolio hoy vive en una carpeta compartida. Una agencia que necesita un sitio donde presentar a su talento. Un restaurante que quiere su propia página en vez de rentarle clientes a un marketplace.",
          ],
          [
            "No es para vender inventario físico. Si tu negocio manda cajas, lo que quieres es una tienda. Esto es para quien vende lo que hace.",
          ],
        ],
      },
    ],

    highlights: [
      "Tu propio dominio, o una dirección gratis para empezar hoy",
      "Control separado para computadora, tableta y teléfono",
      "Más de cuarenta bloques listos para usar",
      "Español e inglés desde un mismo diseño",
      "Revisiones de SEO, contraste, enlaces y móvil",
      "Blog, formularios, galerías y medios incrustados",
      "Redirecciones y verificación con buscadores",
      "Reservas y pagos incluidos, no pegados por fuera",
    ],

    faq: [
      {
        q: "¿Necesito saber diseñar?",
        a: "No. Empiezas desde un diseño terminado y cambias lo que quieras. Nada de lo que hagas puede romper la estructura de la página, así que no puedes llegar a un estado que tengas que pedirle a alguien que arregle.",
      },
      {
        q: "¿Puedo usar un dominio que ya tengo?",
        a: "Sí, en un plan de pago conectas tu propio dominio. En el plan gratuito recibes una dirección en el nuestro, así que puedes estar en línea hoy y pasarte a tu propio nombre después sin reconstruir nada.",
      },
      {
        q: "¿En qué se diferencia de Wix o Squarespace?",
        a: "Sobre todo en lo que pasa después de que el sitio se ve bien. Tomar reservas, anticipos y pagos aquí es parte del mismo producto en lugar de un plugin con una segunda suscripción, y tus servicios, tu calendario y tu bandeja son los mismos con los que opera el resto de tu negocio.",
      },
      {
        q: "¿La gente va a encontrar mi sitio en Google?",
        a: "Para eso son las revisiones de publicación. Títulos, descripciones, texto de imágenes y mapa del sitio quedan resueltos, y puedes verificar el sitio con Google desde tu panel. Nadie puede prometerte una posición, pero nada de aquí va a ser la razón por la que no la tengas.",
      },
      {
        q: "¿Qué pasa con mi sitio si dejo de pagar?",
        a: "Bajas al plan gratuito y tu sitio sigue en línea en una dirección gratis. No sacamos del aire a un negocio por una tarjeta que se venció.",
      },
      {
        q: "¿También puedo vender productos?",
        a: "Puedes vender servicios, paquetes y menús con precio. El inventario físico con envíos no es para lo que está hecho esto, y preferimos decírtelo ahora a que lo descubras después.",
      },
    ],
  },
};
