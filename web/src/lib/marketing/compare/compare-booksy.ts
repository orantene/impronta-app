import type { Comparison } from "./types";

/**
 * Booksy. Pricing read from public sources on 2 September 2026.
 *
 * The honest core of this page: Booksy's subscription scales per staff member
 * and their Boost marketplace takes 30% of a new client's first visit. Ours is
 * a flat 6% on booked work with no per-seat fee. That is a real difference and
 * it does not need exaggerating.
 *
 * What they genuinely do better is stated on the page: Boost is a marketplace
 * with actual demand in it. We do not have that yet, and a barber choosing
 * between us needs to know it.
 */
export const BOOKSY_COMPARISON: Comparison = {
  key: "booksy",
  competitor: "Booksy",
  slugEn: "tulala-vs-booksy",
  slugEs: "tulala-vs-booksy",
  pricingCheckedOn: "2 September 2026",
  sources: [
    { label: "Booksy pricing", url: "https://booksy.com/en-us/for-business/pricing" },
  ],

  en: {
    title: "Tulala vs Booksy",
    subtitle:
      "Both take bookings. One charges per staff member and takes a cut of your new clients. The other charges one flat rate and gives you a website.",
    intro: [
      "If you are on Booksy and looking, it is usually one of two reasons. The bill grows every time you hire someone, or you noticed what Boost takes out of a new client's first visit.",
      "Here is the difference in plain numbers, with their pricing as published on their own site and ours as published on ours. Check both before you decide. We would rather you verify this than trust us.",
    ],
    tableHeading: "The numbers side by side",
    rows: [
      {
        label: "Monthly cost to start",
        tulala: "Free. You can take a booking without paying anything.",
        them: "From $29.99 a month for the first user.",
      },
      {
        label: "Cost when you hire",
        tulala: "Nothing changes. There is no per seat fee.",
        them: "About $20 more per staff member, per month.",
      },
      {
        label: "Cut of a new client",
        tulala: "Six percent of the booking. The same for a new client and a regular.",
        them: "Boost takes 30% of a new client's first visit, minimum $10, capped at $100. One time per client.",
      },
      {
        label: "Card processing",
        tulala: "Included in the six percent.",
        them: "Roughly 2.49% to 2.69% plus a per transaction fee, on top.",
      },
      {
        label: "Your own website",
        tulala: "Included. Your own domain, your pages, your storefront.",
        them: "A profile on their marketplace, not a site you own.",
      },
      {
        label: "Does the rate change by plan",
        tulala: "No. Six percent on every plan, including free.",
        them: "Subscription tier changes what you pay monthly.",
      },
    ],
    honestHeading: "Where Booksy is genuinely stronger",
    honest: [
      "Booksy has a marketplace with real demand in it. People open the app looking for a barber near them, and Boost puts you in front of those people. That is worth something, and it is why the 30% exists.",
      "We do not have that yet. Our directory is young. If your whole business depends on strangers finding you inside an app today, Booksy does that and we do not.",
      "They have been doing this longer, in more cities, with more integrations. If you need something niche that they support and we do not, that is a real reason to stay.",
    ],
    fitHeading: "Who should actually switch",
    fit: [
      "You already have your own clients and you are paying to keep them in someone else's app.",
      "You have staff, and the per seat cost is now a real number every month.",
      "You want a website you own, on your own domain, not a profile page.",
      "You would rather pay one predictable rate than a subscription plus a marketplace cut plus processing.",
    ],
    ctaHeading: "Try it without moving anything",
    ctaBody:
      "Open a free page, put one service on it, and send it to a client. Nothing to cancel, nothing to migrate, and you will know within a day whether it works for you.",
  },

  es: {
    title: "Tulala vs Booksy",
    subtitle:
      "Las dos reciben reservas. Una te cobra por cada persona de tu equipo y se lleva una parte de tus clientes nuevos. La otra cobra una sola tarifa y te da un sitio web.",
    intro: [
      "Si estás en Booksy y andas buscando, casi siempre es por una de dos razones. La cuenta crece cada vez que contratas a alguien, o te diste cuenta de cuánto se lleva Boost de la primera visita de un cliente nuevo.",
      "Aquí está la diferencia en números claros, con sus precios publicados en su propio sitio y los nuestros en el nuestro. Revisa los dos antes de decidir. Preferimos que lo verifiques a que nos creas.",
    ],
    tableHeading: "Los números lado a lado",
    rows: [
      {
        label: "Costo mensual para empezar",
        tulala: "Gratis. Puedes recibir una reserva sin pagar nada.",
        them: "Desde $29.99 al mes por el primer usuario.",
      },
      {
        label: "Costo cuando contratas",
        tulala: "No cambia nada. No cobramos por persona.",
        them: "Unos $20 más por cada persona del equipo, al mes.",
      },
      {
        label: "Parte de un cliente nuevo",
        tulala: "Seis por ciento de la reserva. Igual para un cliente nuevo que para uno de siempre.",
        them: "Boost se lleva 30% de la primera visita de un cliente nuevo, mínimo $10 y máximo $100. Una sola vez por cliente.",
      },
      {
        label: "Procesamiento de tarjeta",
        tulala: "Incluido en el seis por ciento.",
        them: "Aproximadamente 2.49% a 2.69% más una tarifa por transacción, aparte.",
      },
      {
        label: "Tu propio sitio web",
        tulala: "Incluido. Tu dominio, tus páginas, tu tienda.",
        them: "Un perfil en su marketplace, no un sitio que sea tuyo.",
      },
      {
        label: "¿Cambia la tarifa según el plan?",
        tulala: "No. Seis por ciento en todos los planes, incluido el gratis.",
        them: "El plan cambia lo que pagas al mes.",
      },
    ],
    honestHeading: "En qué Booksy sí es más fuerte",
    honest: [
      "Booksy tiene un marketplace con demanda real. La gente abre la app buscando una barbería cerca, y Boost te pone frente a esas personas. Eso vale algo, y por eso existe el 30%.",
      "Nosotros todavía no tenemos eso. Nuestro directorio es nuevo. Si tu negocio entero depende hoy de que desconocidos te encuentren dentro de una app, Booksy hace eso y nosotros no.",
      "Llevan más tiempo, en más ciudades, con más integraciones. Si necesitas algo específico que ellos soportan y nosotros no, esa es una razón real para quedarte.",
    ],
    fitHeading: "Quién debería cambiarse de verdad",
    fit: [
      "Ya tienes tus propios clientes y estás pagando por mantenerlos en la app de alguien más.",
      "Tienes equipo, y el costo por persona ya es un número que sientes cada mes.",
      "Quieres un sitio web tuyo, en tu dominio, no una página de perfil.",
      "Prefieres pagar una sola tarifa predecible que una suscripción más una comisión de marketplace más el procesamiento.",
    ],
    ctaHeading: "Pruébalo sin mover nada",
    ctaBody:
      "Abre una página gratis, pon un servicio y mándasela a un cliente. Nada que cancelar, nada que migrar, y en un día sabrás si te sirve.",
  },
};
