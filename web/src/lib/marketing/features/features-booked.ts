import type { Feature } from "./types";

/**
 * Stage 03, Get booked. Plates 08, 09, 11 and 12.
 *
 * Plate 10 (Appointments) lives in its own module because it carries Tier S
 * long form. Plate 11 is Tier S and `coming`.
 */
export const BOOKED_FEATURES: Feature[] = [
  {
    key: "inquiry-engine",
    plate: 8,
    group: "booked",
    slugEn: "inquiry-engine",
    slugEs: "motor-de-solicitudes",
    tier: "B",
    status: "live",
    related: ["messenger", "appointments", "bookings-and-offers", "client-management"],
    en: {
      name: "Inquiry Engine",
      title: "Every request in one organised funnel",
      subtitle:
        "Requests from your website, your profile, the directory and every button you publish land in one place, structured and impossible to lose.",
      promise: "Nothing gets lost, ever.",
      popup: [
        [
          "Every way someone can reach you feeds one funnel. A form on your site, a button on your profile, a directory search, a booking, all of it arrives structured and in order.",
        ],
        [
          "That is why your ",
          { f: "messenger", label: "inbox" },
          " and your ",
          { f: "appointments", label: "calendar" },
          " always agree with each other. They are downstream of the same engine.",
        ],
      ],
      intro: [
        [
          "Most businesses lose work in the gaps: a message in one app, a form email in another, a note on paper. The request that never got answered is almost never the one you decided to ignore.",
        ],
      ],
      sections: [
        {
          heading: "Structured, not just received",
          body: [
            [
              "A request arrives with the thing being asked for, the date, the contact and the history attached, so you are not reconstructing a job from three sentences and a memory.",
            ],
          ],
        },
        {
          heading: "One engine is why the rest can be honest",
          body: [
            [
              "Because bookings, quotes and conversations all come through here, your calendar cannot disagree with your inbox and your client history cannot go missing. It is one system with different windows onto it.",
            ],
          ],
        },
      ],
      highlights: [
        "Every entry point feeds one funnel",
        "Structured requests, not loose emails",
        "Full history attached to every client",
        "Feeds bookings, quotes and the calendar",
      ],
      faq: [
        {
          q: "What if someone just emails me?",
          a: "Publish your form and your booking links and most requests come through them. Anything that arrives another way can be added so the history stays complete.",
        },
      ],
    },
    es: {
      name: "Motor de solicitudes",
      title: "Todas las solicitudes en un solo embudo",
      subtitle:
        "Las solicitudes de tu sitio, tu perfil, el directorio y cada botón que publiques llegan a un solo lugar, ordenadas e imposibles de perder.",
      promise: "Nada se pierde, nunca.",
      popup: [
        [
          "Todas las formas en que alguien puede contactarte alimentan un mismo embudo. Un formulario en tu sitio, un botón en tu perfil, una búsqueda en el directorio, una reserva, todo llega ordenado y en su lugar.",
        ],
        [
          "Por eso tu ",
          { f: "messenger", label: "bandeja de entrada" },
          " y tu ",
          { f: "appointments", label: "calendario" },
          " siempre coinciden. Los dos vienen del mismo motor.",
        ],
      ],
      intro: [
        [
          "La mayoría de los negocios pierde trabajo en los huecos: un mensaje en una app, un correo de formulario en otra, una nota en papel. La solicitud que nunca se contestó casi nunca es la que decidiste ignorar.",
        ],
      ],
      sections: [
        {
          heading: "Ordenadas, no solo recibidas",
          body: [
            [
              "Una solicitud llega con lo que se está pidiendo, la fecha, el contacto y el historial adjunto, así que no estás reconstruyendo un trabajo con tres frases y tu memoria.",
            ],
          ],
        },
        {
          heading: "Un solo motor es lo que permite que lo demás sea honesto",
          body: [
            [
              "Como las reservas, las cotizaciones y las conversaciones pasan por aquí, tu calendario no puede contradecir a tu bandeja y el historial de un cliente no se puede perder. Es un solo sistema con distintas ventanas.",
            ],
          ],
        },
      ],
      highlights: [
        "Todos los puntos de entrada alimentan un embudo",
        "Solicitudes ordenadas, no correos sueltos",
        "Historial completo por cliente",
        "Alimenta reservas, cotizaciones y calendario",
      ],
      faq: [
        {
          q: "¿Y si alguien simplemente me manda un correo?",
          a: "Publica tu formulario y tus enlaces de reserva y la mayoría llegará por ahí. Lo que entre por otro lado se puede registrar para que el historial quede completo.",
        },
      ],
    },
  },

  {
    key: "messenger",
    plate: 9,
    group: "booked",
    slugEn: "messenger",
    slugEs: "mensajeria",
    tier: "B",
    status: "live",
    related: ["inquiry-engine", "bookings-and-offers", "appointments", "premium-support"],
    en: {
      name: "Unified Messenger",
      title: "One inbox for every conversation",
      subtitle:
        "Clients, guests, talent and your team in one place, with one thread per job so nothing is scattered across four apps.",
      promise: "One thread per job. That is all.",
      popup: [
        [
          "Clients, guests who have no account, talent and your own team all message in one inbox, organised by job rather than by app.",
        ],
        [
          "The thread carries the whole story: the original request, the ",
          { f: "bookings-and-offers", label: "quote" },
          ", the booking and the payment. Nobody has to ask what was agreed.",
        ],
      ],
      intro: [
        [
          "The real cost of scattered messages is not the time spent looking. It is the client who asked a question on a Thursday and got an answer that contradicts what somebody else told them on Monday.",
        ],
      ],
      sections: [
        {
          heading: "The thread is the record",
          body: [
            [
              "Everything about a job stays with the job: what was asked, what was quoted, what was agreed and what was paid. Handing work to a teammate does not mean re explaining it.",
            ],
          ],
        },
        {
          heading: "Guests can talk to you without signing up",
          body: [
            [
              "A first time client should not have to create an account to ask a question. They message as a guest and you still get the thread, the history and the contact.",
            ],
          ],
        },
      ],
      highlights: [
        "Clients, guests, talent and team in one inbox",
        "One thread per job",
        "Request, quote, booking and payment in context",
        "Guest conversations with no account required",
      ],
      faq: [
        {
          q: "Can my team see everything?",
          a: "You control that with roles. People see the conversations their job needs and not the ones it does not.",
        },
      ],
    },
    es: {
      name: "Mensajería",
      title: "Una sola bandeja para cada conversación",
      subtitle:
        "Clientes, invitados, talento y tu equipo en un solo lugar, con una conversación por trabajo para que nada quede regado en cuatro apps.",
      promise: "Una conversación por trabajo. Nada más.",
      popup: [
        [
          "Clientes, invitados sin cuenta, talento y tu propio equipo escriben en una sola bandeja, organizada por trabajo y no por aplicación.",
        ],
        [
          "La conversación carga toda la historia: la solicitud original, la ",
          { f: "bookings-and-offers", label: "cotización" },
          ", la reserva y el pago. Nadie tiene que preguntar qué se acordó.",
        ],
      ],
      intro: [
        [
          "El costo real de los mensajes regados no es el tiempo que pierdes buscando. Es el cliente que preguntó algo un jueves y recibió una respuesta que contradice lo que otra persona le dijo el lunes.",
        ],
      ],
      sections: [
        {
          heading: "La conversación es el registro",
          body: [
            [
              "Todo lo de un trabajo se queda con el trabajo: qué se pidió, qué se cotizó, qué se acordó y qué se pagó. Pasarle el trabajo a alguien del equipo no significa volver a explicarlo.",
            ],
          ],
        },
        {
          heading: "Los invitados te escriben sin registrarse",
          body: [
            [
              "Un cliente primerizo no debería tener que crear una cuenta para hacer una pregunta. Escribe como invitado y tú igual recibes la conversación, el historial y el contacto.",
            ],
          ],
        },
      ],
      highlights: [
        "Clientes, invitados, talento y equipo en una bandeja",
        "Una conversación por trabajo",
        "Solicitud, cotización, reserva y pago en contexto",
        "Conversaciones de invitados sin cuenta",
      ],
      faq: [
        {
          q: "¿Mi equipo puede ver todo?",
          a: "Eso lo controlas con los roles. Cada quien ve las conversaciones que su trabajo necesita y no las que no.",
        },
      ],
    },
  },


  {
    key: "bookings-and-offers",
    plate: 12,
    group: "booked",
    slugEn: "bookings-and-offers",
    slugEs: "cotizaciones-y-ofertas",
    tier: "B",
    status: "live",
    related: ["inquiry-engine", "payments", "commission-engine", "messenger"],
    en: {
      name: "Bookings & Offers",
      title: "Quotes and offers for bigger jobs",
      subtitle:
        "For work that needs a conversation first: quotes, commercial terms, deposits, confirmations and call sheets, all in the same thread.",
      promise: "From a question to a signed job.",
      popup: [
        [
          "Not every job is a slot on a calendar. A campaign, an event or a production needs a quote, terms and an agreement before anyone commits.",
        ],
        [
          "You build the offer, send it in the ",
          { f: "messenger", label: "same thread" },
          ", and when it is accepted it becomes a real booking with a deposit and a confirmation.",
        ],
      ],
      intro: [
        [
          "Big jobs die in the gap between interest and agreement. A quote sent as a message gets lost, terms live in someone's memory, and by the time it is confirmed nobody agrees on what was included.",
        ],
      ],
      sections: [
        {
          heading: "The offer is a document, not a message",
          body: [
            [
              "Line items, rates, what is included and what is not, and the terms that apply. When it is accepted, everything it says becomes the booking, so there is no second interpretation later.",
            ],
          ],
        },
        {
          heading: "Everything the day itself needs",
          body: [
            [
              "Call sheets, notes, locations and confirmations for a PDF the client can hold. The parts that usually live in a separate document live with the job.",
            ],
          ],
        },
      ],
      highlights: [
        "Quotes with line items and rates",
        "Commercial terms and deposits",
        "Accepted offer becomes the booking",
        "PDF confirmations and call sheets",
      ],
      faq: [
        {
          q: "How is this different from appointments?",
          a: "Appointments are for work that fits a time slot and books itself. Offers are for work that needs to be scoped and agreed first. Both end up on the same calendar.",
        },
      ],
    },
    es: {
      name: "Cotizaciones y ofertas",
      title: "Cotizaciones y ofertas para trabajos grandes",
      subtitle:
        "Para el trabajo que primero necesita conversación: cotizaciones, términos comerciales, anticipos, confirmaciones y call sheets, en la misma conversación.",
      promise: "De una pregunta a un trabajo cerrado.",
      popup: [
        [
          "No todo trabajo es un horario en un calendario. Una campaña, un evento o una producción necesitan cotización, términos y un acuerdo antes de que alguien se comprometa.",
        ],
        [
          "Armas la oferta, la envías en la ",
          { f: "messenger", label: "misma conversación" },
          ", y cuando la aceptan se convierte en una reserva real con anticipo y confirmación.",
        ],
      ],
      intro: [
        [
          "Los trabajos grandes se mueren en el hueco entre el interés y el acuerdo. Una cotización enviada como mensaje se pierde, los términos viven en la memoria de alguien, y para cuando se confirma nadie coincide en qué estaba incluido.",
        ],
      ],
      sections: [
        {
          heading: "La oferta es un documento, no un mensaje",
          body: [
            [
              "Conceptos, tarifas, qué incluye y qué no, y los términos que aplican. Cuando se acepta, todo lo que dice se convierte en la reserva, así que después no hay una segunda interpretación.",
            ],
          ],
        },
        {
          heading: "Todo lo que el día necesita",
          body: [
            [
              "Call sheets, notas, ubicaciones y confirmaciones en PDF que el cliente puede guardar. Las partes que suelen vivir en un documento aparte viven con el trabajo.",
            ],
          ],
        },
      ],
      highlights: [
        "Cotizaciones con conceptos y tarifas",
        "Términos comerciales y anticipos",
        "La oferta aceptada se vuelve la reserva",
        "Confirmaciones en PDF y call sheets",
      ],
      faq: [
        {
          q: "¿En qué se diferencia de las citas?",
          a: "Las citas son para trabajo que cabe en un horario y se reserva solo. Las ofertas son para trabajo que primero hay que definir y acordar. Los dos terminan en el mismo calendario.",
        },
      ],
    },
  },
];
