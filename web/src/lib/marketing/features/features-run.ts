import type { Feature } from "./types";

/**
 * Stage 05, Run and grow. Plates 17 to 21.
 *
 * Plate 21 is the positioning page of the whole hub: a human answers. It must
 * never state a response time we have not committed to, because the entire
 * point is that this promise is real when competitors' are not.
 */
export const RUN_FEATURES: Feature[] = [
  {
    key: "roster-and-team",
    plate: 17,
    group: "run",
    slugEn: "roster-and-team",
    slugEs: "roster-y-equipo",
    tier: "B",
    status: "live",
    related: ["commission-engine", "client-management", "messenger", "talent-profiles"],
    en: {
      name: "Roster & Team Management",
      title: "Manage your roster and your team",
      subtitle:
        "Talent roster, team seats, roles and permissions, and exclusivity, so the right people see the right work and nothing else.",
      promise: "Everyone in the right place, with the right access.",
      popup: [
        [
          "Add the talent you represent and the team who runs the day. Each person gets a role, and the role decides what they can see and do.",
        ],
        [
          "Exclusivity is handled properly, so representation is recorded rather than remembered.",
        ],
      ],
      intro: [
        [
          "An agency runs on who is allowed to do what. Without that written down, either everyone sees everything or one person becomes the bottleneck for every decision.",
        ],
      ],
      sections: [
        {
          heading: "Roles that match real jobs",
          body: [
            [
              "A coordinator, a booker, an owner and the talent themselves do not need the same access. Permissions follow the job rather than a single admin switch.",
            ],
          ],
        },
        {
          heading: "Representation, recorded",
          body: [
            [
              "Exclusive representation is stored on the roster, so who represents whom is a fact in the system rather than an assumption two agencies disagree about.",
            ],
          ],
        },
      ],
      highlights: [
        "Talent roster with status and history",
        "Team seats and roles",
        "Permissions by job, not one admin switch",
        "Exclusivity recorded per talent",
      ],
      faq: [
        {
          q: "Can talent manage their own profile?",
          a: "Yes. Talent can keep their own profile and calendar current while the agency keeps control of representation and client relationships.",
        },
      ],
    },
    es: {
      name: "Roster y equipo",
      title: "Administra tu roster y tu equipo",
      subtitle:
        "Roster de talento, lugares de equipo, roles y permisos, y exclusividad, para que cada quien vea el trabajo que le toca y nada más.",
      promise: "Cada quien en su lugar, con el acceso correcto.",
      popup: [
        [
          "Agrega al talento que representas y al equipo que opera el día a día. Cada persona tiene un rol, y el rol decide qué puede ver y hacer.",
        ],
        [
          "La exclusividad se maneja en serio, así que la representación queda registrada y no solo recordada.",
        ],
      ],
      intro: [
        [
          "Una agencia funciona por quién tiene permiso de hacer qué. Sin eso escrito, o todos ven todo o una sola persona se vuelve el cuello de botella de cada decisión.",
        ],
      ],
      sections: [
        {
          heading: "Roles que corresponden a trabajos reales",
          body: [
            [
              "Un coordinador, un booker, un dueño y el propio talento no necesitan el mismo acceso. Los permisos siguen al puesto y no a un único interruptor de administrador.",
            ],
          ],
        },
        {
          heading: "Representación, registrada",
          body: [
            [
              "La representación exclusiva se guarda en el roster, así que quién representa a quién es un dato del sistema y no una suposición sobre la que dos agencias no se ponen de acuerdo.",
            ],
          ],
        },
      ],
      highlights: [
        "Roster de talento con estatus e historial",
        "Lugares de equipo y roles",
        "Permisos por puesto, no un solo interruptor",
        "Exclusividad registrada por talento",
      ],
      faq: [
        {
          q: "¿El talento puede administrar su propio perfil?",
          a: "Sí. El talento puede mantener al día su perfil y su calendario mientras la agencia conserva el control de la representación y de la relación con los clientes.",
        },
      ],
    },
  },

  {
    key: "client-management",
    plate: 18,
    group: "run",
    slugEn: "client-management",
    slugEs: "gestion-de-clientes",
    tier: "B",
    status: "live",
    related: ["messenger", "inquiry-engine", "reviews-and-trust", "analytics"],
    en: {
      name: "Client Management",
      title: "Know who your clients are",
      subtitle:
        "Client accounts with their history, their favourites and their verification, so a returning client is treated like one.",
      promise: "Remember every client, not just the last one.",
      popup: [
        [
          "Every client has a record: what they booked, what they paid, what they asked for and when they last came back.",
        ],
        [
          "That history sits next to the conversation, so you are never treating a loyal client like a stranger.",
        ],
      ],
      intro: [
        [
          "The cheapest sale you will ever make is to somebody who already paid you once. Most businesses lose those people simply by forgetting them.",
        ],
      ],
      sections: [
        {
          heading: "History that arrives with the message",
          body: [
            [
              "When a client writes, their past work is already attached. No searching, no asking them to remind you what they booked last time.",
            ],
          ],
        },
      ],
      highlights: [
        "Client accounts with full history",
        "Favourites and saved talent",
        "Verification status",
        "History attached to every conversation",
      ],
      faq: [
        {
          q: "Does a client have to register?",
          a: "No. Guests can book and message without an account, and a record is still kept so you can recognise them when they return.",
        },
      ],
    },
    es: {
      name: "Gestión de clientes",
      title: "Conoce a tus clientes",
      subtitle:
        "Cuentas de cliente con su historial, sus favoritos y su verificación, para que a un cliente que regresa se le trate como tal.",
      promise: "Recuerda a cada cliente, no solo al último.",
      popup: [
        [
          "Cada cliente tiene un registro: qué reservó, qué pagó, qué pidió y cuándo fue la última vez que volvió.",
        ],
        [
          "Ese historial vive junto a la conversación, así que nunca tratas como desconocido a un cliente fiel.",
        ],
      ],
      intro: [
        [
          "La venta más barata que vas a hacer es a alguien que ya te pagó una vez. La mayoría de los negocios pierde a esas personas simplemente por olvidarlas.",
        ],
      ],
      sections: [
        {
          heading: "Historial que llega junto con el mensaje",
          body: [
            [
              "Cuando un cliente escribe, su trabajo anterior ya viene adjunto. Sin buscar y sin pedirle que te recuerde qué reservó la vez pasada.",
            ],
          ],
        },
      ],
      highlights: [
        "Cuentas de cliente con historial completo",
        "Favoritos y talento guardado",
        "Estatus de verificación",
        "Historial adjunto a cada conversación",
      ],
      faq: [
        {
          q: "¿El cliente tiene que registrarse?",
          a: "No. Los invitados pueden reservar y escribir sin cuenta, y aun así queda un registro para que puedas reconocerlos cuando regresen.",
        },
      ],
    },
  },

  {
    key: "analytics",
    plate: 19,
    group: "run",
    slugEn: "analytics",
    slugEs: "analiticas",
    tier: "B",
    status: "live",
    related: ["directory", "discounts-and-campaigns", "client-management", "website-builder"],
    en: {
      name: "Analytics",
      title: "See where the money actually comes from",
      subtitle:
        "Which channel brought the inquiries and which brought the money, for each website and each talent.",
      promise: "Stop guessing which effort paid.",
      popup: [
        [
          "Inquiries and revenue by source, so you can tell the difference between the channel that brings attention and the channel that brings income.",
        ],
        [
          "Broken down per site and per talent, because an agency average hides both the star and the problem.",
        ],
      ],
      intro: [
        [
          "Most businesses know their total and nothing else. That is enough to feel good or bad, and not enough to decide anything.",
        ],
      ],
      sections: [
        {
          heading: "Attention and income are different numbers",
          body: [
            [
              "A channel can send plenty of inquiries and very little money. Seeing both next to each other is what stops you spending another month on the wrong one.",
            ],
          ],
        },
      ],
      highlights: [
        "Inquiries and revenue by channel",
        "Per site and per talent",
        "Conversion from request to booked work",
      ],
      faq: [
        {
          q: "Do I need to install a tracking tool?",
          a: "No. The numbers come from your own bookings and inquiries, not from a script you have to add.",
        },
      ],
    },
    es: {
      name: "Analíticas",
      title: "Descubre de dónde viene el dinero de verdad",
      subtitle:
        "Qué canal trajo las solicitudes y cuál trajo el dinero, por cada sitio y por cada talento.",
      promise: "Deja de adivinar qué esfuerzo sí pagó.",
      popup: [
        [
          "Solicitudes e ingresos por origen, para que distingas entre el canal que trae atención y el canal que trae dinero.",
        ],
        [
          "Desglosado por sitio y por talento, porque un promedio de agencia esconde tanto al que destaca como al problema.",
        ],
      ],
      intro: [
        [
          "La mayoría de los negocios conoce su total y nada más. Eso alcanza para sentirse bien o mal, y no alcanza para decidir nada.",
        ],
      ],
      sections: [
        {
          heading: "Atención e ingreso son números distintos",
          body: [
            [
              "Un canal puede mandar muchas solicitudes y muy poco dinero. Ver los dos lado a lado es lo que evita que gastes otro mes en el equivocado.",
            ],
          ],
        },
      ],
      highlights: [
        "Solicitudes e ingresos por canal",
        "Por sitio y por talento",
        "Conversión de solicitud a trabajo reservado",
      ],
      faq: [
        {
          q: "¿Tengo que instalar una herramienta de medición?",
          a: "No. Los números salen de tus propias reservas y solicitudes, no de un script que tengas que agregar.",
        },
      ],
    },
  },

  {
    key: "automations",
    plate: 20,
    group: "run",
    slugEn: "automations",
    slugEs: "automatizaciones",
    tier: "B",
    status: "live",
    related: ["appointments", "reviews-and-trust", "messenger", "client-management"],
    en: {
      name: "Automations",
      title: "The messages that send themselves",
      subtitle:
        "Confirmations, reminders, follow ups and digests that go out without you remembering to send them.",
      promise: "The work that happens while you work.",
      popup: [
        [
          "A confirmation when something is booked, a reminder before it happens, a review request after it is done.",
        ],
        [
          "Nobody notices these when they work, and everybody notices the no show that a reminder would have prevented.",
        ],
      ],
      intro: [
        [
          "The difference between a business that feels organised and one that does not is usually four or five messages nobody had to remember to send.",
        ],
      ],
      sections: [
        {
          heading: "Fewer no shows, more repeat work",
          body: [
            [
              "Reminders reduce the empty slot. Follow ups bring people back. Both are jobs you would do if you had time, running whether you do or not.",
            ],
          ],
        },
      ],
      highlights: [
        "Booking confirmations",
        "Reminders before the appointment",
        "Review requests after the job",
        "Email digests of what needs attention",
      ],
      faq: [
        {
          q: "Can I turn individual ones off?",
          a: "Yes. Each type can be switched off if it does not fit how you work.",
        },
      ],
    },
    es: {
      name: "Automatizaciones",
      title: "Los mensajes que se mandan solos",
      subtitle:
        "Confirmaciones, recordatorios, seguimientos y resúmenes que salen sin que tengas que acordarte de enviarlos.",
      promise: "El trabajo que ocurre mientras tú trabajas.",
      popup: [
        [
          "Una confirmación cuando algo se reserva, un recordatorio antes de que pase, una solicitud de reseña cuando termina.",
        ],
        [
          "Nadie los nota cuando funcionan, y todo el mundo nota la ausencia que un recordatorio habría evitado.",
        ],
      ],
      intro: [
        [
          "La diferencia entre un negocio que se siente organizado y uno que no suele ser cuatro o cinco mensajes que nadie tuvo que acordarse de mandar.",
        ],
      ],
      sections: [
        {
          heading: "Menos ausencias, más trabajo repetido",
          body: [
            [
              "Los recordatorios reducen el horario vacío. Los seguimientos hacen que la gente regrese. Los dos son tareas que harías si tuvieras tiempo, corriendo lo tengas o no.",
            ],
          ],
        },
      ],
      highlights: [
        "Confirmaciones de reserva",
        "Recordatorios antes de la cita",
        "Solicitudes de reseña al terminar",
        "Resúmenes por correo de lo que necesita atención",
      ],
      faq: [
        {
          q: "¿Puedo desactivar alguna en particular?",
          a: "Sí. Cada tipo se puede apagar si no encaja con tu forma de trabajar.",
        },
      ],
    },
  },

];
