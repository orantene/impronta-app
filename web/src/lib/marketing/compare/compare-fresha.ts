import type { Comparison } from "./types";

/**
 * Fresha. Pricing read from public sources on 2 September 2026.
 *
 * Fresha markets itself as free and is not, which is the honest hook for this
 * page: a subscription per bookable team member, 20% of a new marketplace
 * client's first booking, and processing on top. Ours is 6% with processing
 * inside it.
 *
 * As with Booksy, what they do better is on the page. Their marketplace has
 * demand and ours does not yet.
 */
export const FRESHA_COMPARISON: Comparison = {
  key: "fresha",
  competitor: "Fresha",
  slugEn: "tulala-vs-fresha",
  slugEs: "tulala-vs-fresha",
  pricingCheckedOn: "2 September 2026",
  sources: [
    { label: "Fresha pricing", url: "https://www.fresha.com/for-business/pricing" },
  ],

  en: {
    title: "Tulala vs Fresha",
    subtitle:
      "Fresha is marketed as free. It is not. Here is what each of us actually takes, with the fees written out rather than assembled from footnotes.",
    intro: [
      "Fresha's headline is free software. The cost arrives in three places instead: a subscription per bookable team member, a cut of any new client who finds you through their marketplace, and card processing on top of both.",
      "None of that is hidden exactly, but it is spread out, and a fee you have to assemble from three places is a fee you will feel misled by later. So here it is in one table, theirs as published on their site and ours as published on ours.",
    ],
    tableHeading: "The numbers side by side",
    rows: [
      {
        label: "Monthly cost to start",
        tulala: "Free, and free stays free. You can take a booking without paying anything.",
        them: "From about $19.95 a month solo, or about $14.95 per bookable team member.",
      },
      {
        label: "Cost when you hire",
        tulala: "Nothing changes. There is no per seat fee.",
        them: "The per member charge grows with the team.",
      },
      {
        label: "Cut of a new client",
        tulala: "Six percent of the booking, the same for everyone.",
        them: "20% of a new marketplace client's first booking, minimum $6, one time per client.",
      },
      {
        label: "Card processing",
        tulala: "Included in the six percent.",
        them: "Roughly 2.19% to 3.30% plus about $0.20 per transaction, on top.",
      },
      {
        label: "Your own website",
        tulala: "Included. Your own domain, your pages, your storefront.",
        them: "A marketplace profile and a booking widget, not a site you own.",
      },
      {
        label: "What you pay on your OWN client",
        tulala: "Six percent, and nothing else.",
        them: "No marketplace cut on your own clients, but the subscription and processing still apply.",
      },
    ],
    honestHeading: "Where Fresha is genuinely stronger",
    honest: [
      "Fresha's marketplace is large and people use it to find salons. If new clients discovering you inside an app is how you grow today, they can do that now and we cannot.",
      "Their product is deep on salon and spa operations specifically: inventory, commissions, detailed staff scheduling. If you need that depth, you should weigh it seriously.",
      "The 20% applies only to a genuinely new marketplace client's first booking, not to your own clients and not to repeat visits. That is a fairer structure than it first sounds, and we would rather say so than let you think otherwise.",
    ],
    fitHeading: "Who should actually switch",
    fit: [
      "Most of your clients already know you, and you are paying a subscription to serve people you brought yourself.",
      "You have a team, and the per member cost has become the largest line.",
      "You want your own website and domain rather than a profile inside someone else's app.",
      "You would rather explain one number to yourself at the end of the month.",
    ],
    ctaHeading: "Try it without moving anything",
    ctaBody:
      "Open a free page, put one service on it, and send it to a client. Nothing to cancel and nothing to migrate while you find out whether it fits.",
  },

  es: {
    title: "Tulala vs Fresha",
    subtitle:
      "Fresha se anuncia como gratis. No lo es. Esto es lo que de verdad se lleva cada una, con las tarifas escritas completas y no armadas entre notas al pie.",
    intro: [
      "El titular de Fresha es software gratis. El costo aparece en otros tres lugares: una suscripción por cada persona del equipo que recibe reservas, una parte de cada cliente nuevo que te encuentra en su marketplace, y el procesamiento de tarjeta encima de las dos cosas.",
      "No está escondido exactamente, pero está repartido, y una tarifa que tienes que armar de tres pedazos es una tarifa con la que te vas a sentir engañado después. Así que aquí está en una sola tabla, la suya publicada en su sitio y la nuestra en el nuestro.",
    ],
    tableHeading: "Los números lado a lado",
    rows: [
      {
        label: "Costo mensual para empezar",
        tulala: "Gratis, y lo gratis sigue gratis. Puedes recibir una reserva sin pagar nada.",
        them: "Desde unos $19.95 al mes en solitario, o unos $14.95 por cada persona que recibe reservas.",
      },
      {
        label: "Costo cuando contratas",
        tulala: "No cambia nada. No cobramos por persona.",
        them: "El cargo por persona crece con el equipo.",
      },
      {
        label: "Parte de un cliente nuevo",
        tulala: "Seis por ciento de la reserva, igual para todos.",
        them: "20% de la primera reserva de un cliente nuevo del marketplace, mínimo $6, una sola vez por cliente.",
      },
      {
        label: "Procesamiento de tarjeta",
        tulala: "Incluido en el seis por ciento.",
        them: "Aproximadamente 2.19% a 3.30% más unos $0.20 por transacción, aparte.",
      },
      {
        label: "Tu propio sitio web",
        tulala: "Incluido. Tu dominio, tus páginas, tu tienda.",
        them: "Un perfil en el marketplace y un widget de reservas, no un sitio que sea tuyo.",
      },
      {
        label: "Qué pagas por TU propio cliente",
        tulala: "Seis por ciento, y nada más.",
        them: "No hay comisión de marketplace por tus propios clientes, pero la suscripción y el procesamiento siguen aplicando.",
      },
    ],
    honestHeading: "En qué Fresha sí es más fuerte",
    honest: [
      "El marketplace de Fresha es grande y la gente lo usa para encontrar salones. Si tu crecimiento hoy depende de que clientes nuevos te descubran dentro de una app, ellos ya lo hacen y nosotros no.",
      "Su producto es profundo en operación de salón y spa: inventario, comisiones, horarios detallados del equipo. Si necesitas esa profundidad, tómalo en serio.",
      "El 20% aplica solo a la primera reserva de un cliente realmente nuevo del marketplace, no a tus propios clientes ni a las visitas siguientes. Es una estructura más justa de lo que suena al principio, y preferimos decirlo a dejar que pienses otra cosa.",
    ],
    fitHeading: "Quién debería cambiarse de verdad",
    fit: [
      "La mayoría de tus clientes ya te conoce, y estás pagando una suscripción por atender a gente que tú mismo trajiste.",
      "Tienes equipo, y el costo por persona ya es la línea más grande.",
      "Quieres tu propio sitio y tu dominio, no un perfil dentro de la app de alguien más.",
      "Prefieres explicarte un solo número a fin de mes.",
    ],
    ctaHeading: "Pruébalo sin mover nada",
    ctaBody:
      "Abre una página gratis, pon un servicio y mándasela a un cliente. Nada que cancelar y nada que migrar mientras averiguas si te acomoda.",
  },
};
