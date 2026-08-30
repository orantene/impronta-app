import type { Feature } from "./types";

/**
 * Plate 10, Tier S. The flagship money page of the hub.
 *
 * Target intent: "sistema de citas para barberia", "agenda de citas online",
 * "sistema de reservas", "appointment booking system". Displaces Booksy,
 * Fresha and Calendly, none of which give the business its own website.
 *
 * STATUS: LIVE as of 2026-08-30, confirmed by the owner once the appointments
 * engine shipped. It was held at `coming` until then on purpose, because
 * claiming a booking feature before a customer can take a booking is the one
 * thing that would cost trust. The waitlist banner and the "not yet" answer
 * came off in the same change that flipped the flag; a page that says `live`
 * while its own FAQ says "not yet" is worse than either.
 */
export const APPOINTMENTS_FEATURE: Feature = {
  key: "appointments",
  plate: 10,
  group: "booked",
  slugEn: "appointments",
  slugEs: "citas-y-reservas",
  tier: "S",
  status: "live",
  related: ["inquiry-engine", "payments", "messenger", "tables-and-seating"],

  en: {
    name: "Appointments & Reservations",
    title: "Online booking and appointments",
    subtitle:
      "Put your calendar online so clients pick a real time. You decide if it books instantly, waits for your approval, or takes a deposit first.",
    promise: "Your calendar, open for business.",

    popup: [
      [
        "Clients see the times you are actually free and pick one. No back and forth, no missed messages, no double bookings.",
      ],
      [
        "You choose how much control you want per service: approve every request, let regulars book instantly, or ask for a deposit before the slot is held.",
      ],
      [
        "Every booking lands in the same ",
        { f: "messenger", label: "inbox" },
        " as the rest of your work, on the same calendar.",
      ],
    ],

    intro: [
      [
        "The fastest way to lose a client is to answer tomorrow. Someone wants a haircut on Saturday, sends a message on Friday night, and books somewhere else before you wake up.",
      ],
      [
        "Online booking fixes that without you doing anything. Your working hours go in once. From then on, people see the times you are genuinely free and take one, at midnight, on a Sunday, while you sleep.",
      ],
    ],

    sections: [
      {
        heading: "You decide how a slot gets taken",
        body: [
          [
            "Not every business wants the same thing, and not every service inside one business wants the same thing either. A quick haircut can book itself. A four hour tattoo should not.",
          ],
          [
            "So the rule is set per service, not per account. A barber can let a fade book instantly and pay in the chair, and still require approval and a deposit for a full colour job. You are never forced into somebody else's idea of how your day works.",
          ],
        ],
      },
      {
        heading: "Five ways to book, one for each kind of work",
        body: [
          [
            "Ask first, and you approve every request before the time is held. Good for a cleaner who wants to see the address before saying yes.",
          ],
          [
            "Book instantly and pay in person, which is how most barbers, salons and nail studios actually work. Book with a deposit, so a no show costs the client and not you. Book with full payment up front, for classes and sessions. Or set a standing appointment that repeats every week or every two weeks, which is how a cleaner or a trainer keeps a client for a year.",
          ],
        ],
      },
      {
        heading: "One calendar, even when you work in two worlds",
        body: [
          [
            "This is the part other booking tools cannot do. If an agency books you for a shoot on Friday, Friday disappears from your public booking page automatically. If a client books a haircut on Saturday morning, the agency sees you are busy.",
          ],
          [
            "There is no syncing step and no second calendar to keep in line, because it is one calendar. Your ",
            { f: "bookings-and-offers", label: "agency work" },
            " and your own clients write to the same place.",
          ],
        ],
      },
      {
        heading: "It is the same system that answers your messages",
        body: [
          [
            "A booking is not a separate silo. It arrives through the same ",
            { f: "inquiry-engine", label: "inquiry engine" },
            " as every other request, so it lands in one inbox with a thread, a history and a client attached.",
          ],
          [
            "That also means a conversation can become a booking. Someone messages asking about availability, you propose a time inside the chat, they confirm, and it is on your calendar. No app switching, nothing retyped.",
          ],
        ],
      },
      {
        heading: "Money, when you want it",
        body: [
          [
            "Deposits and prepayment run on ",
            { f: "payments", label: "payments built in" },
            ", so the money reaches your bank without a separate processor account or a plugin to install.",
          ],
          [
            "You set the cancellation window and what happens if someone does not show. The people who respect your time are unaffected. The ones who waste it stop being free.",
          ],
        ],
      },
    ],

    highlights: [
      "Working hours, breaks, holidays and buffers between jobs",
      "Approve first, instant, deposit, prepaid or repeating, set per service",
      "Deposits and no show protection",
      "Automatic confirmations and reminders",
      "Guest booking with no account required",
      "One shared calendar across your own clients and agency work",
    ],

    faq: [
      {
        q: "Can I use this today?",
        a: "Yes. Online booking is live. Turn it on from your dashboard, set your hours and how each service should book, and your page starts taking real appointments.",
      },
      {
        q: "Do my clients need an account to book?",
        a: "No. A client books as a guest with a name and a contact detail, and gets a link to reschedule or cancel. Making people sign up before they can pay you is a good way to lose them.",
      },
      {
        q: "Can I stop people booking last minute?",
        a: "Yes. You set the minimum notice, so a slot closes to new bookings whatever number of hours ahead you choose, and you set how far in advance people can book.",
      },
      {
        q: "What happens if someone does not show up?",
        a: "If the service takes a deposit, you keep it under the rules you set. You can also mark the booking as a no show so your history stays accurate.",
      },
      {
        q: "I work at the client's home, not mine. Does that work?",
        a: "Yes. A service can be set to happen at the client's address, which asks for the address at booking and leaves travel time between jobs.",
      },
      {
        q: "Can two clients book the same slot at the same second?",
        a: "No. A slot is held the moment someone takes it, and the second person is told it just went. Double booking is prevented in the database itself, not by hoping.",
      },
      {
        q: "Does this replace my agency bookings?",
        a: "No, it sits beside them. Agency work and your own clients share one calendar and one inbox, so neither can book you twice.",
      },
    ],
  },

  es: {
    name: "Citas y reservas",
    title: "Sistema de citas y reservas en línea",
    subtitle:
      "Pon tu agenda en línea para que tus clientes elijan un horario real. Tú decides si se reserva al instante, espera tu aprobación o pide anticipo.",
    promise: "Tu agenda, abierta para vender.",

    popup: [
      [
        "Tus clientes ven los horarios en los que realmente estás libre y eligen uno. Sin mensajes de ida y vuelta, sin citas empalmadas.",
      ],
      [
        "Tú decides cuánto control quieres en cada servicio: aprobar cada solicitud, dejar que los clientes de siempre reserven al instante, o pedir un anticipo antes de apartar el horario.",
      ],
      [
        "Cada reserva llega a la misma ",
        { f: "messenger", label: "bandeja de entrada" },
        " que el resto de tu trabajo, en el mismo calendario.",
      ],
    ],

    intro: [
      [
        "La forma más rápida de perder a un cliente es contestarle mañana. Alguien quiere un corte el sábado, te escribe el viernes por la noche y reserva en otro lado antes de que despiertes.",
      ],
      [
        "Las reservas en línea resuelven eso sin que tú hagas nada. Configuras tu horario una vez. De ahí en adelante la gente ve los horarios en los que de verdad estás libre y toma uno, a medianoche, en domingo, mientras duermes.",
      ],
    ],

    sections: [
      {
        heading: "Tú decides cómo se aparta un horario",
        body: [
          [
            "No todos los negocios quieren lo mismo, y ni siquiera todos los servicios dentro de un mismo negocio quieren lo mismo. Un corte rápido se puede reservar solo. Un tatuaje de cuatro horas no debería.",
          ],
          [
            "Por eso la regla se define por servicio, no por cuenta. Una barbería puede dejar que un fade se reserve al instante y se pague en la silla, y aun así pedir aprobación y anticipo para un trabajo de color completo. Nunca te obligamos a trabajar como alguien más imaginó tu día.",
          ],
        ],
      },
      {
        heading: "Cinco formas de reservar, una para cada tipo de trabajo",
        body: [
          [
            "Pedir primero, y tú apruebas cada solicitud antes de apartar el horario. Ideal para quien limpia casas y quiere ver la dirección antes de decir que sí.",
          ],
          [
            "Reservar al instante y pagar en persona, que es como trabajan de verdad la mayoría de barberías, salones y estudios de uñas. Reservar con anticipo, para que una ausencia le cueste al cliente y no a ti. Reservar con pago completo por adelantado, para clases y sesiones. O dejar una cita fija que se repite cada semana o cada quince días, que es como quien hace limpieza o entrena conserva a un cliente durante un año.",
          ],
        ],
      },
      {
        heading: "Un solo calendario, aunque trabajes en dos mundos",
        body: [
          [
            "Esta es la parte que otras herramientas de reservas no pueden hacer. Si una agencia te reserva para una sesión el viernes, el viernes desaparece solo de tu página pública de reservas. Si un cliente aparta un corte el sábado por la mañana, la agencia ve que estás ocupado.",
          ],
          [
            "No hay que sincronizar nada ni mantener un segundo calendario al día, porque es un solo calendario. Tu ",
            { f: "bookings-and-offers", label: "trabajo con agencias" },
            " y tus propios clientes escriben en el mismo lugar.",
          ],
        ],
      },
      {
        heading: "Es el mismo sistema que responde tus mensajes",
        body: [
          [
            "Una reserva no vive aparte. Llega por el mismo ",
            { f: "inquiry-engine", label: "motor de solicitudes" },
            " que cualquier otra petición, así que aterriza en una sola bandeja, con su conversación, su historial y su cliente.",
          ],
          [
            "Eso también significa que una conversación puede convertirse en reserva. Alguien pregunta por disponibilidad, tú propones un horario dentro del chat, la persona confirma y queda en tu calendario. Sin cambiar de aplicación y sin volver a escribir nada.",
          ],
        ],
      },
      {
        heading: "El dinero, cuando tú quieras",
        body: [
          [
            "Los anticipos y los pagos por adelantado funcionan con ",
            { f: "payments", label: "pagos integrados" },
            ", así que el dinero llega a tu banco sin abrir una cuenta con otro procesador ni instalar plugins.",
          ],
          [
            "Tú defines la ventana de cancelación y qué pasa si alguien no llega. A quien respeta tu tiempo no le afecta en nada. A quien lo desperdicia deja de salirle gratis.",
          ],
        ],
      },
    ],

    highlights: [
      "Horarios, descansos, días festivos y tiempo entre trabajos",
      "Aprobar primero, instantáneo, anticipo, prepago o recurrente, por servicio",
      "Anticipos y protección contra ausencias",
      "Confirmaciones y recordatorios automáticos",
      "Reserva como invitado, sin crear cuenta",
      "Un calendario compartido entre tus clientes y el trabajo de agencia",
    ],

    faq: [
      {
        q: "¿Puedo usarlo hoy?",
        a: "Sí. Las reservas en línea ya están disponibles. Actívalas desde tu panel, define tus horarios y cómo se reserva cada servicio, y tu página empieza a recibir citas reales.",
      },
      {
        q: "¿Mis clientes necesitan cuenta para reservar?",
        a: "No. El cliente reserva como invitado con su nombre y un dato de contacto, y recibe un enlace para reagendar o cancelar. Obligar a la gente a registrarse antes de poder pagarte es una buena forma de perderla.",
      },
      {
        q: "¿Puedo evitar reservas de último minuto?",
        a: "Sí. Tú defines el aviso mínimo, así que un horario se cierra a nuevas reservas las horas antes que tú elijas, y también defines con cuánta anticipación se puede reservar.",
      },
      {
        q: "¿Qué pasa si alguien no llega?",
        a: "Si el servicio pide anticipo, te lo quedas según las reglas que definiste. También puedes marcar la reserva como ausencia para que tu historial siga siendo real.",
      },
      {
        q: "Trabajo en casa del cliente, no en la mía. ¿Funciona igual?",
        a: "Sí. Un servicio se puede configurar para realizarse en la dirección del cliente, lo que pide la dirección al reservar y deja tiempo de traslado entre trabajos.",
      },
      {
        q: "¿Dos clientes pueden apartar el mismo horario al mismo tiempo?",
        a: "No. El horario queda apartado en el momento en que alguien lo toma, y a la segunda persona se le avisa que acaba de ocuparse. El empalme se evita en la base de datos, no con suerte.",
      },
      {
        q: "¿Esto reemplaza mis reservas con agencias?",
        a: "No, convive con ellas. El trabajo de agencia y tus propios clientes comparten un calendario y una bandeja de entrada, así que ninguno te puede reservar dos veces.",
      },
    ],
  },
};
