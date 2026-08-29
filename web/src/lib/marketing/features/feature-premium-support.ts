import type { Feature } from "./types";

/**
 * Plate 21, Tier A. The positioning page of the whole hub.
 *
 * Low search volume, highest conversion value. Nobody googles "premium
 * support", but everybody who is deciding between us and a competitor is
 * quietly asking whether a human will answer when something breaks. This is
 * the page that answers it.
 *
 * NEVER state a response time we have not committed to. The entire argument
 * is that our promise is real where competitors' are theatre, and one invented
 * SLA would destroy that. Everything here is either true today or clearly
 * marked as being built.
 */
export const PREMIUM_SUPPORT_FEATURE: Feature = {
  key: "premium-support",
  plate: 21,
  group: "run",
  slugEn: "premium-support",
  slugEs: "soporte-premium",
  tier: "A",
  status: "live",
  related: ["messenger", "website-builder", "payments", "appointments"],

  en: {
    name: "Premium Support Service",
    title: "A real person answers",
    subtitle:
      "Human support in your language, from people who can actually fix the thing. No bot wall, no ticket that disappears, no loop of help articles.",
    promise: "A human. Every time. In your language.",

    popup: [
      [
        "You will not be handed to a bot that suggests three help articles and closes your ticket. A person reads what you wrote and answers it.",
      ],
      [
        "In your language, and with the access to actually solve the problem rather than explain why it is not their department.",
      ],
    ],

    intro: [
      [
        "You already know the experience we are describing. Something breaks, you look for a way to reach a human, and every path leads back to a chat window asking you to rephrase your question.",
      ],
      [
        "It is a strange thing to do to somebody who is paying you. It is a worse thing to do when what broke is standing between them and their income.",
      ],
    ],

    sections: [
      {
        heading: "Why this is a feature and not a footnote",
        body: [
          [
            "When your booking page is down on a Saturday morning, no help article saves the day. What saves it is somebody who can look at your account and fix it.",
          ],
          [
            "So support here is people first. Automation is used to route a message and to remember your history, never to stand between you and a person who can act.",
          ],
        ],
      },
      {
        heading: "The test nobody else passes",
        body: [
          [
            "Try it on any tool you currently pay for. Count how many clicks it takes to reach a human, and whether that human can do anything beyond apologise.",
          ],
          [
            "That is the bar we are setting ourselves against, and it is a low one, which is exactly why it is worth clearing.",
          ],
        ],
      },
      {
        heading: "In your language",
        body: [
          [
            "Support is answered in Spanish and in English. Explaining an urgent problem in your second language, to somebody who does not speak your first, is a tax nobody should have to pay to get help.",
          ],
        ],
      },
      {
        heading: "It knows your business already",
        body: [
          [
            "Support reads the same ",
            { f: "messenger", label: "inbox" },
            " and the same history you do. You are not re-explaining which workspace, which booking, which client, to somebody starting from nothing.",
          ],
        ],
      },
      {
        heading: "What we will not do",
        body: [
          [
            "We will not put a chatbot in front of a human and call it support. We will not close a ticket because you did not reply within a window. We will not tell you a problem is your browser when it is our bug.",
          ],
          [
            "And when we do not know, we will say so and go find out, rather than sending you an article that does not answer the question.",
          ],
        ],
      },
      {
        heading: "Being built in the open",
        body: [
          [
            "The support centre is being built right now, and as it lands you will see the channels it covers stated plainly on this page. What is already true is the commitment: a person answers, and that person can act.",
          ],
        ],
      },
    ],

    highlights: [
      "A human reads and answers your message",
      "Spanish and English",
      "Support that can act on your account, not just advise",
      "Your history already attached, so you never re-explain",
      "No bot wall between you and a person",
    ],

    faq: [
      {
        q: "Is support only for paid plans?",
        a: "Getting help is not a paid feature. Priority and depth vary by plan, but a person answering you is not something we ration.",
      },
      {
        q: "Do you use AI in support?",
        a: "Where it helps us answer faster and remember your history, yes. As a wall to stop you reaching a human, no. That distinction is the entire point of this page.",
      },
      {
        q: "What if my problem is urgent and my business is stopped?",
        a: "Say so. Something blocking you from taking money is not treated like a general question, and it goes to a person who can act on it.",
      },
      {
        q: "What is your response time?",
        a: "We are not going to publish a number we cannot commit to yet, because a promised time that gets missed is worse than no promise. When the support centre ships we will state it plainly here and hold ourselves to it.",
      },
      {
        q: "Can I talk to someone before I sign up?",
        a: "Yes. If you are trying to work out whether this fits your business, that is exactly the conversation worth having before you spend anything.",
      },
    ],
  },

  es: {
    name: "Soporte premium",
    title: "Te contesta una persona real",
    subtitle:
      "Soporte humano en tu idioma, de gente que sí puede resolver el problema. Sin muro de bots, sin tickets que desaparecen, sin vueltas entre artículos.",
    promise: "Una persona. Siempre. En tu idioma.",

    popup: [
      [
        "No te va a atender un bot que te sugiere tres artículos de ayuda y cierra tu ticket. Una persona lee lo que escribiste y te responde.",
      ],
      [
        "En tu idioma, y con el acceso para resolver el problema de verdad en lugar de explicarte por qué no es su área.",
      ],
    ],

    intro: [
      [
        "Ya conoces la experiencia de la que hablamos. Algo se rompe, buscas cómo llegar a un humano, y todos los caminos regresan a una ventana de chat que te pide reformular tu pregunta.",
      ],
      [
        "Es algo raro de hacerle a alguien que te está pagando. Es peor todavía cuando lo que se rompió está entre esa persona y su ingreso.",
      ],
    ],

    sections: [
      {
        heading: "Por qué esto es una función y no una nota al pie",
        body: [
          [
            "Cuando tu página de reservas se cae un sábado por la mañana, ningún artículo de ayuda salva el día. Lo que lo salva es alguien que puede entrar a tu cuenta y arreglarlo.",
          ],
          [
            "Por eso aquí el soporte es primero de personas. La automatización se usa para dirigir un mensaje y recordar tu historial, nunca para pararse entre tú y alguien que pueda actuar.",
          ],
        ],
      },
      {
        heading: "La prueba que nadie más pasa",
        body: [
          [
            "Pruébalo con cualquier herramienta que pagues hoy. Cuenta cuántos clics te toma llegar a un humano, y si ese humano puede hacer algo más que disculparse.",
          ],
          [
            "Esa es la vara con la que nos medimos, y es una vara baja, que es justamente por lo que vale la pena pasarla.",
          ],
        ],
      },
      {
        heading: "En tu idioma",
        body: [
          [
            "El soporte se responde en español y en inglés. Explicar un problema urgente en tu segundo idioma, a alguien que no habla el primero, es un impuesto que nadie debería pagar para recibir ayuda.",
          ],
        ],
      },
      {
        heading: "Ya conoce tu negocio",
        body: [
          [
            "El soporte lee la misma ",
            { f: "messenger", label: "bandeja de entrada" },
            " y el mismo historial que tú. No estás volviendo a explicar cuál espacio, cuál reserva, cuál cliente, a alguien que empieza de cero.",
          ],
        ],
      },
      {
        heading: "Lo que no vamos a hacer",
        body: [
          [
            "No vamos a poner un chatbot enfrente de un humano y llamarle soporte. No vamos a cerrar un ticket porque no contestaste dentro de una ventana. No vamos a decirte que el problema es tu navegador cuando es nuestro error.",
          ],
          [
            "Y cuando no sepamos, lo vamos a decir y a averiguarlo, en lugar de mandarte un artículo que no responde la pregunta.",
          ],
        ],
      },
      {
        heading: "Construyéndolo a la vista",
        body: [
          [
            "El centro de soporte se está construyendo justo ahora, y conforme avance verás en esta página los canales que cubre, dichos con claridad. Lo que ya es cierto es el compromiso: contesta una persona, y esa persona puede actuar.",
          ],
        ],
      },
    ],

    highlights: [
      "Una persona lee y responde tu mensaje",
      "Español e inglés",
      "Soporte que puede actuar en tu cuenta, no solo aconsejar",
      "Tu historial ya adjunto, para que nunca vuelvas a explicar",
      "Sin muro de bots entre tú y una persona",
    ],

    faq: [
      {
        q: "¿El soporte es solo para planes de pago?",
        a: "Recibir ayuda no es una función de pago. La prioridad y la profundidad varían según el plan, pero que una persona te conteste no es algo que racionemos.",
      },
      {
        q: "¿Usan IA en el soporte?",
        a: "Donde nos ayuda a responder más rápido y a recordar tu historial, sí. Como muro para impedir que llegues a un humano, no. Esa distinción es todo el punto de esta página.",
      },
      {
        q: "¿Y si mi problema es urgente y mi negocio está detenido?",
        a: "Dilo. Algo que te impide cobrar no se trata como una pregunta general, y llega a una persona que puede actuar.",
      },
      {
        q: "¿Cuál es su tiempo de respuesta?",
        a: "No vamos a publicar un número al que todavía no podemos comprometernos, porque un tiempo prometido que se incumple es peor que no prometer nada. Cuando salga el centro de soporte lo diremos aquí con claridad y nos vamos a sostener en él.",
      },
      {
        q: "¿Puedo hablar con alguien antes de registrarme?",
        a: "Sí. Si estás tratando de entender si esto le sirve a tu negocio, esa es justo la conversación que vale la pena tener antes de gastar nada.",
      },
    ],
  },
};
