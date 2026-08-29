import type { Feature } from "./types";

/**
 * Plate 14, Tier S, roadmap.
 *
 * Target intent: "vender boletos sin comision", "boletos para eventos",
 * "vender entradas online". Competes with Eventbrite and Boletia on the two
 * things that actually hurt a venue: the cut, and who owns the audience.
 *
 * Not shipped. Fee language stays deliberately careful: the intent is stated
 * as intent, and exact terms are promised before launch rather than quoted now.
 */
export const TICKETING_FEATURE: Feature = {
  key: "ticketing",
  plate: 14,
  group: "paid",
  slugEn: "ticketing",
  slugEs: "boletos",
  tier: "S",
  status: "coming",
  related: ["payments", "qr-engine", "website-builder", "appointments"],

  en: {
    name: "Ticketing",
    title: "Sell tickets from your own website",
    subtitle:
      "Capacity limits, a QR pass on every ticket and scanning at the door. Your event, your page, your audience, your money.",
    promise: "Your event, on your page, at your price.",

    popup: [
      [
        "Sell entry to your own events from your own site. Set the capacity, the price and the dates, and let people buy.",
      ],
      [
        "Every ticket carries a ",
        { f: "qr-engine", label: "QR pass" },
        " you scan at the door, and the money moves through ",
        { f: "payments", label: "payments built in" },
        ".",
      ],
    ],

    intro: [
      [
        "Ticketing platforms take a cut of every ticket and put their brand on your event. Worse, they keep the audience. Next time you are paying again to reach the same people who already came once.",
      ],
      [
        "Selling from your own page changes both halves of that. The margin stays with you, and so does the relationship.",
      ],
    ],

    sections: [
      {
        heading: "The event page is your page",
        body: [
          [
            "Built with the same ",
            { f: "website-builder", label: "website builder" },
            " as the rest of your site, on your own domain, in your own design. Not a listing on somebody else's marketplace with your name in small type.",
          ],
          [
            "Which also means the people who come for the event land on your business, see what else you do, and can book it.",
          ],
        ],
      },
      {
        heading: "Capacity, and the door",
        body: [
          [
            "Set how many people can come and sell until it is full. Different ticket types for different prices, early and late, member and guest.",
          ],
          [
            "At the door you scan the pass on the phone, and the list matches what was actually sold. No paper list, no arguing with somebody who says they bought one.",
          ],
        ],
      },
      {
        heading: "The audience stays yours",
        body: [
          [
            "Everyone who buys a ticket becomes a record in your ",
            { f: "client-management", label: "client list" },
            " rather than a row in a marketplace's database. When you run the next event you already know who came to the last one.",
          ],
          [
            "That is the part that compounds. A venue that owns its audience gets cheaper to fill every time; one that rents it pays full price forever.",
          ],
        ],
      },
      {
        heading: "It is the same money rail as everything else",
        body: [
          [
            "Ticket sales settle to your bank account through the same ",
            { f: "payments", label: "payments" },
            " as your bookings, with the same reporting and the same payouts. One place to look when you want to know what a month was worth.",
          ],
        ],
      },
    ],

    highlights: [
      "Events on your own domain",
      "Capacity limits and multiple ticket types",
      "A QR pass on every ticket",
      "Scan at the door",
      "Buyers land in your own client list",
      "Money to your own account, on your existing rail",
    ],

    faq: [
      {
        q: "When is this available?",
        a: "It is on the roadmap and not shipped yet. Join the waitlist and you will hear the day it opens.",
      },
      {
        q: "How will the fees compare to Eventbrite?",
        a: "The intention is to charge the same platform fee as other booked work rather than a separate ticketing rate. We will publish the exact terms before it ships, because a fee you discover at checkout is not a fee, it is a surprise.",
      },
      {
        q: "Do buyers need an account?",
        a: "No. Somebody buying a ticket should not have to create a login first, and the plan is guest checkout with the pass sent to them.",
      },
      {
        q: "Can I check people in without internet at the door?",
        a: "That is a known requirement for venues and it is part of the design work. We will say plainly what it does and does not handle when it ships.",
      },
    ],
  },

  es: {
    name: "Boletos",
    title: "Vende boletos desde tu propio sitio",
    subtitle:
      "Límites de cupo, un pase QR en cada boleto y escaneo en la puerta. Tu evento, tu página, tu público, tu dinero.",
    promise: "Tu evento, en tu página, a tu precio.",

    popup: [
      [
        "Vende la entrada a tus propios eventos desde tu sitio. Define el cupo, el precio y las fechas, y deja que la gente compre.",
      ],
      [
        "Cada boleto lleva un ",
        { f: "qr-engine", label: "pase QR" },
        " que escaneas en la puerta, y el dinero se mueve con ",
        { f: "payments", label: "pagos integrados" },
        ".",
      ],
    ],

    intro: [
      [
        "Las plataformas de boletos se llevan una parte de cada entrada y ponen su marca en tu evento. Peor todavía, se quedan con el público. La próxima vez estás pagando otra vez para llegar a la misma gente que ya fue.",
      ],
      [
        "Vender desde tu propia página cambia las dos mitades de eso. El margen se queda contigo, y la relación también.",
      ],
    ],

    sections: [
      {
        heading: "La página del evento es tu página",
        body: [
          [
            "Hecha con el mismo ",
            { f: "website-builder", label: "creador de sitios" },
            " que el resto de tu sitio, en tu propio dominio, con tu propio diseño. No un anuncio en el marketplace de alguien más con tu nombre en letra chica.",
          ],
          [
            "Eso también significa que quien llega por el evento aterriza en tu negocio, ve qué más haces y lo puede reservar.",
          ],
        ],
      },
      {
        heading: "Cupo, y puerta",
        body: [
          [
            "Define cuánta gente cabe y vende hasta llenarlo. Distintos tipos de boleto para distintos precios, temprano y tarde, socio e invitado.",
          ],
          [
            "En la puerta escaneas el pase en el teléfono y la lista coincide con lo que de verdad se vendió. Sin lista en papel y sin discutir con alguien que dice que sí compró.",
          ],
        ],
      },
      {
        heading: "El público se queda contigo",
        body: [
          [
            "Cada persona que compra un boleto se vuelve un registro en tu ",
            { f: "client-management", label: "lista de clientes" },
            " en lugar de una fila en la base de datos de un marketplace. Cuando armes el siguiente evento ya sabes quién fue al anterior.",
          ],
          [
            "Esa es la parte que se acumula. Un lugar que es dueño de su público se llena más barato cada vez; el que lo renta paga precio completo para siempre.",
          ],
        ],
      },
      {
        heading: "Es el mismo sistema de cobro que todo lo demás",
        body: [
          [
            "La venta de boletos llega a tu cuenta bancaria por los mismos ",
            { f: "payments", label: "pagos" },
            " que tus reservas, con los mismos reportes y los mismos depósitos. Un solo lugar donde mirar cuando quieres saber cuánto valió un mes.",
          ],
        ],
      },
    ],

    highlights: [
      "Eventos en tu propio dominio",
      "Límites de cupo y varios tipos de boleto",
      "Un pase QR en cada boleto",
      "Escaneo en la puerta",
      "Los compradores entran a tu propia lista de clientes",
      "El dinero a tu cuenta, por tu sistema de siempre",
    ],

    faq: [
      {
        q: "¿Cuándo estará disponible?",
        a: "Está en la hoja de ruta y todavía no se lanza. Únete a la lista y te avisamos el día que abra.",
      },
      {
        q: "¿Cómo serán las comisiones comparadas con Eventbrite?",
        a: "La intención es cobrar la misma comisión de plataforma que al resto del trabajo reservado, en lugar de una tarifa aparte para boletos. Vamos a publicar los términos exactos antes del lanzamiento, porque una comisión que descubres al pagar no es una comisión, es una sorpresa.",
      },
      {
        q: "¿Los compradores necesitan cuenta?",
        a: "No. Quien compra un boleto no debería tener que crear un usuario primero, y el plan es compra como invitado con el pase enviado a la persona.",
      },
      {
        q: "¿Puedo registrar entradas sin internet en la puerta?",
        a: "Es un requisito conocido para lugares con eventos y es parte del trabajo de diseño. Cuando salga vamos a decir con claridad qué resuelve y qué no.",
      },
    ],
  },
};
