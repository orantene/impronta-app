import type { Feature } from "./types";

/**
 * Stage 02, Get found. Plates 05 to 07.
 *
 * Plate 06 is Tier S and `coming`: the QR pages rank now and sell a waitlist,
 * never a capability. Nothing here may describe it as shipped.
 */
export const FOUND_FEATURES: Feature[] = [
  {
    key: "directory",
    plate: 5,
    group: "found",
    slugEn: "directory",
    slugEs: "directorio",
    tier: "B",
    status: "live",
    related: ["talent-profiles", "reviews-and-trust", "inquiry-engine", "appointments"],
    en: {
      name: "Directory & Discover",
      title: "Get found by clients and agencies",
      subtitle:
        "Your profile appears across the whole network, with live availability, so people looking for what you do can find and contact you.",
      promise: "Be findable on a Tuesday afternoon.",
      popup: [
        [
          "Clients and agencies search the network by what they need. If it is what you do, you show up, with your work and your availability visible.",
        ],
        [
          "A request from the directory arrives in your inbox like any other, through the same ",
          { f: "inquiry-engine", label: "inquiry engine" },
          ".",
        ],
      ],
      intro: [
        [
          "Having a site is not the same as being found. The directory is where people who do not know your name yet go looking for someone who does what you do.",
        ],
      ],
      sections: [
        {
          heading: "Filtered the way people actually search",
          body: [
            [
              "By what you do, where you are, and when you are free. Availability is read from your real calendar, so nobody wastes your time asking about a day you are already booked.",
            ],
          ],
        },
      ],
      highlights: [
        "Searchable by speciality and location",
        "Live availability from your real calendar",
        "Requests arrive in your normal inbox",
        "Works alongside your own site",
      ],
      faq: [
        {
          q: "Do I have to be in the directory?",
          a: "No. Being listed is a choice, and you can turn it off without affecting your site or your bookings.",
        },
      ],
    },
    es: {
      name: "Directorio y Discover",
      title: "Que te encuentren clientes y agencias",
      subtitle:
        "Tu perfil aparece en toda la red, con disponibilidad real, para que quien busca lo que haces pueda encontrarte y contactarte.",
      promise: "Que te encuentren un martes por la tarde.",
      popup: [
        [
          "Clientes y agencias buscan en la red por lo que necesitan. Si es lo que tú haces, apareces, con tu trabajo y tu disponibilidad a la vista.",
        ],
        [
          "Una solicitud del directorio llega a tu bandeja como cualquier otra, por el mismo ",
          { f: "inquiry-engine", label: "motor de solicitudes" },
          ".",
        ],
      ],
      intro: [
        [
          "Tener un sitio no es lo mismo que ser encontrado. El directorio es donde busca la gente que todavía no sabe tu nombre pero necesita a alguien que haga lo que tú haces.",
        ],
      ],
      sections: [
        {
          heading: "Filtrado como la gente busca de verdad",
          body: [
            [
              "Por lo que haces, dónde estás y cuándo estás libre. La disponibilidad se lee de tu calendario real, así que nadie te hace perder el tiempo preguntando por un día que ya tienes ocupado.",
            ],
          ],
        },
      ],
      highlights: [
        "Búsqueda por especialidad y ubicación",
        "Disponibilidad real desde tu calendario",
        "Las solicitudes llegan a tu bandeja de siempre",
        "Funciona junto con tu propio sitio",
      ],
      faq: [
        {
          q: "¿Tengo que estar en el directorio?",
          a: "No. Aparecer es una decisión tuya, y puedes desactivarlo sin afectar tu sitio ni tus reservas.",
        },
      ],
    },
  },


  {
    key: "reviews-and-trust",
    plate: 7,
    group: "found",
    slugEn: "reviews-and-trust",
    slugEs: "resenas-y-confianza",
    tier: "B",
    status: "live",
    related: ["talent-profiles", "directory", "automations", "client-management"],
    en: {
      name: "Reviews & Trust",
      title: "Proof that closes the deal",
      subtitle:
        "Collect reviews from real bookings, get verified, and show the badges that make a stranger comfortable paying you.",
      promise: "The reason a stranger says yes.",
      popup: [
        [
          "Reviews come from real completed work, so they mean something. They sit on your profile where a new client actually looks.",
        ],
        [
          "Verification and trust badges do the rest: they answer the question every first time client is quietly asking.",
        ],
      ],
      intro: [
        [
          "Nobody hands money to a stranger on the internet without a reason. Reviews are that reason, and the businesses that collect them consistently win the jobs the ones that do not are still explaining themselves for.",
        ],
      ],
      sections: [
        {
          heading: "Asked for automatically, not awkwardly",
          body: [
            [
              "After a job is done, the request goes out on its own through ",
              { f: "automations", label: "automations" },
              ". You never have to send the message that feels like begging.",
            ],
          ],
        },
      ],
      highlights: [
        "Reviews tied to real bookings",
        "Verification badges",
        "Shown on your profile and in the directory",
        "Automatic review requests after a job",
      ],
      faq: [
        {
          q: "Can I delete a bad review?",
          a: "No, and that is the point. Reviews only mean something because they cannot be edited into a highlight reel. You can respond to one.",
        },
      ],
    },
    es: {
      name: "Reseñas y confianza",
      title: "La prueba que cierra el trato",
      subtitle:
        "Reúne reseñas de trabajos reales, obtén verificación y muestra las insignias que hacen que un desconocido se anime a pagarte.",
      promise: "La razón por la que un desconocido dice que sí.",
      popup: [
        [
          "Las reseñas vienen de trabajos realmente terminados, así que significan algo. Van en tu perfil, donde de verdad mira un cliente nuevo.",
        ],
        [
          "La verificación y las insignias de confianza hacen el resto: responden la pregunta que todo cliente primerizo se está haciendo en silencio.",
        ],
      ],
      intro: [
        [
          "Nadie le entrega dinero a un desconocido en internet sin una razón. Las reseñas son esa razón, y los negocios que las juntan con constancia ganan los trabajos que los demás siguen tratando de justificar.",
        ],
      ],
      sections: [
        {
          heading: "Se piden solas, sin incomodidad",
          body: [
            [
              "Cuando el trabajo termina, la solicitud sale sola con las ",
              { f: "automations", label: "automatizaciones" },
              ". Nunca tienes que mandar el mensaje que se siente como estar rogando.",
            ],
          ],
        },
      ],
      highlights: [
        "Reseñas ligadas a reservas reales",
        "Insignias de verificación",
        "Visibles en tu perfil y en el directorio",
        "Solicitud automática al terminar un trabajo",
      ],
      faq: [
        {
          q: "¿Puedo borrar una reseña mala?",
          a: "No, y de eso se trata. Las reseñas valen justamente porque no se pueden editar hasta volverlas un anuncio. Lo que sí puedes hacer es responderla.",
        },
      ],
    },
  },
];
