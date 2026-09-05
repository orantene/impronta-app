import type { Feature } from "./types";

/**
 * Plate 11, Tier S, roadmap.
 *
 * Target intent: "sistema de reservaciones para restaurantes", "reservas
 * restaurante online", "software de reservaciones". Competes with OpenTable
 * and CoverManager, whose real moat is card-on-file no-show protection plus a
 * directory. We have the card rail and the directory, and the restaurant's
 * own website on top.
 *
 * SHIPPED 2026-09-04. Was still flagged "coming" the next morning, and the
 * guest AI derives its grounding from this flag, so the first answer the
 * assistant ever gave a real visitor told a restaurant owner that our own
 * table reservations "are on our roadmap, but not live yet" and offered him a
 * waitlist. He could have booked a table that minute.
 *
 * Verified before flipping, because "live" here is a claim we make to
 * strangers: `venues` and `venue_service_windows` carry real rows (El Paisa is
 * seeded with two windows), the public path has `loadReserveAvailability` and
 * `submitReservation`, deposits are real (`splitForfeiture` with its own
 * tests), and nothing gates it per tenant or behind a wave.
 */
export const TABLES_FEATURE: Feature = {
  key: "tables-and-seating",
  plate: 11,
  group: "booked",
  slugEn: "tables-and-seating",
  slugEs: "mesas-y-reservaciones",
  tier: "S",
  status: "live",
  related: ["appointments", "qr-engine", "payments", "website-builder"],

  en: {
    name: "Tables & Seating",
    title: "Restaurant reservations on your own site",
    subtitle:
      "Reservations with party size and service windows, taken from your own site, with deposits that put an end to no shows.",
    promise: "Your dining room, bookable from your own page.",

    popup: [
      [
        "Your service windows, your party sizes, your rules. Guests reserve from your own website instead of a marketplace that rents you your own customers.",
      ],
      [
        "Deposits end the no show problem, and the reservation lands on the same calendar and in the same inbox as everything else you run.",
      ],
    ],

    intro: [
      [
        "A reservation marketplace charges you to reach a guest who was already searching for your restaurant by name, then keeps that guest as theirs. You pay for the introduction every single time, including the tenth time.",
      ],
      [
        "Taking your own direct bookings does not mean leaving the marketplace on day one. It means stopping the part where you pay a commission on the people who already knew where they were going.",
      ],
    ],

    sections: [
      {
        heading: "A dining room is a calendar with a shape",
        body: [
          [
            "Party size, service windows and how long a table turns decide what is genuinely available. The page never offers a table for six at eight o'clock if there is no table for six at eight o'clock.",
          ],
          [
            "You set the shape of the room and the rules of the service, and the availability follows from that rather than from a number somebody typed in.",
          ],
        ],
      },
      {
        heading: "Deposits end the no show",
        body: [
          [
            "A Friday table for eight that does not arrive is not a small loss, it is the whole evening for that table. A deposit changes who carries that risk, and it filters the bookings that were never serious.",
          ],
          [
            "You set the amount, the window in which it is refundable, and what happens when somebody does not turn up. Guests who respect the booking never notice it exists.",
          ],
        ],
      },
      {
        heading: "The same engine that books a haircut",
        body: [
          [
            "Reservations share the POLICY layer with ",
            { f: "appointments", label: "appointments" },
            ": the same deposits, the same reminders, the same inbox, the same calendar. They do not share the booking engine, which is built around one subject of capacity per offering. That is an honest limit rather than a missing feature, and it is why the policy behaves predictably from day one.",
          ],
        ],
      },
      {
        heading: "The table itself becomes a channel",
        body: [
          [
            "A ",
            { f: "qr-engine", label: "QR code" },
            " on the table can show the menu, take the next reservation, or collect a tip. The cheapest marketing you own is the customer already sitting in your dining room.",
          ],
        ],
      },
      {
        heading: "Guests you can actually recognise",
        body: [
          [
            "Repeat guests build a history in your own ",
            { f: "client-management", label: "client list" },
            ": what they booked, how often, whether they showed. That is yours, not a marketplace's, and it is what lets you treat a regular like a regular.",
          ],
        ],
      },
    ],

    highlights: [
      "Party sizes and service windows you define",
      "Party size and service windows",
      "Deposits and no show protection",
      "Reservations on your own website and domain",
      "Shared calendar and inbox with the rest of the business",
      "Guests recorded in your own client list",
    ],

    faq: [
      {
        q: "When is this available?",
        a: "It is live now. Add your venue, set your service windows, and your page starts taking reservations.",
      },
      {
        q: "Do I have to leave my current reservation system?",
        a: "Not on day one. Most restaurants start by taking their own direct bookings here, where there is no commission on a guest who already knew the name, and keep the marketplace for discovery while they decide.",
      },
      {
        q: "What about walk ins?",
        a: "Reservations record what was booked rather than who is currently sitting down, so a walk in does not consume a slot. Keep counting walk ins the way you do today, and let the reservation list be the part that is already handled for you.",
      },
      {
        q: "Can I take a deposit only for large parties?",
        a: "That is the intent. The rule belongs to the service and the party size rather than to the whole restaurant, in the same way a deposit rule belongs to a service rather than an account.",
      },
    ],
  },

  es: {
    name: "Mesas y reservaciones",
    title: "Reservaciones de restaurante en tu propio sitio",
    subtitle:
      "Reservaciones con número de personas y horarios de servicio, desde tu propio sitio, con anticipos que acaban con las ausencias.",
    promise: "Tu comedor, reservable desde tu propia página.",

    popup: [
      [
        "Tus horarios de servicio, tus tamaños de grupo, tus reglas. Los comensales reservan desde tu propio sitio en lugar de un marketplace que te renta a tus propios clientes.",
      ],
      [
        "Los anticipos acaban con el problema de las ausencias, y la reservación llega al mismo calendario y a la misma bandeja que todo lo demás que operas.",
      ],
    ],

    intro: [
      [
        "Un marketplace de reservaciones te cobra por llegar a un comensal que ya estaba buscando tu restaurante por nombre, y después se queda con ese comensal como suyo. Pagas la presentación cada vez, incluida la décima.",
      ],
      [
        "Tomar tus propias reservas directas no significa dejar el marketplace el primer día. Significa dejar de pagar comisión por la gente que ya sabía a dónde iba.",
      ],
    ],

    sections: [
      {
        heading: "Un comedor es un calendario con forma",
        body: [
          [
            "El número de personas, los horarios de servicio y cuánto dura una mesa deciden qué hay disponible de verdad. La página nunca ofrece una mesa para seis a las ocho si no hay mesa para seis a las ocho.",
          ],
          [
            "Tú defines la forma del salón y las reglas del servicio, y la disponibilidad sale de ahí en lugar de un número que alguien escribió a mano.",
          ],
        ],
      },
      {
        heading: "El anticipo acaba con la ausencia",
        body: [
          [
            "Una mesa para ocho un viernes que no llega no es una pérdida chica, es la noche completa de esa mesa. Un anticipo cambia quién carga ese riesgo, y filtra las reservas que nunca iban en serio.",
          ],
          [
            "Tú defines el monto, la ventana en la que es reembolsable y qué pasa si alguien no se presenta. El comensal que respeta su reserva nunca se entera de que existe.",
          ],
        ],
      },
      {
        heading: "El mismo motor que agenda un corte de cabello",
        body: [
          [
            "Las reservaciones comparten la capa de REGLAS con ",
            { f: "appointments", label: "citas y reservas" },
            ": los mismos anticipos, los mismos recordatorios, la misma bandeja, el mismo calendario. Lo que no comparten es el motor de reservas, que está construido alrededor de un solo sujeto de capacidad por servicio. Ese es un límite honesto y no una función que falte, y es la razón por la que las reglas se comportan de forma predecible desde el primer día.",
          ],
        ],
      },
      {
        heading: "La mesa misma se vuelve un canal",
        body: [
          [
            "Un ",
            { f: "qr-engine", label: "código QR" },
            " en la mesa puede mostrar el menú, tomar la siguiente reservación o recibir una propina. El marketing más barato que tienes es el cliente que ya está sentado en tu comedor.",
          ],
        ],
      },
      {
        heading: "Comensales que sí puedes reconocer",
        body: [
          [
            "Los comensales que regresan van formando un historial en tu propia ",
            { f: "client-management", label: "lista de clientes" },
            ": qué reservaron, cada cuánto, si llegaron. Eso es tuyo y no de un marketplace, y es lo que te permite tratar a un cliente frecuente como cliente frecuente.",
          ],
        ],
      },
    ],

    highlights: [
      "Tamaños de grupo y horarios de servicio que tú defines",
      "Tamaño de grupo y horarios de servicio",
      "Anticipos y protección contra ausencias",
      "Reservaciones en tu propio sitio y dominio",
      "Calendario y bandeja compartidos con el resto del negocio",
      "Comensales registrados en tu propia lista de clientes",
    ],

    faq: [
      {
        q: "¿Cuándo estará disponible?",
        a: "Ya está disponible. Añade tu local, define tus horarios de servicio y tu página empieza a aceptar reservas.",
      },
      {
        q: "¿Tengo que dejar mi sistema de reservaciones actual?",
        a: "El primer día no. La mayoría empieza tomando aquí sus reservas directas, donde no hay comisión por un comensal que ya conocía el nombre, y conserva el marketplace para descubrimiento mientras decide.",
      },
      {
        q: "¿Y los que llegan sin reservación?",
        a: "Las reservaciones registran lo que se apartó, no quién está sentado en ese momento, así que quien llega sin reservación no ocupa un lugar del sistema. Sigue contándolos como hasta ahora, y deja que la lista de reservaciones sea la parte que ya está resuelta.",
      },
      {
        q: "¿Puedo pedir anticipo solo para grupos grandes?",
        a: "Esa es la intención. La regla pertenece al servicio y al tamaño del grupo, no a todo el restaurante, igual que una regla de anticipo pertenece a un servicio y no a una cuenta.",
      },
    ],
  },
};
