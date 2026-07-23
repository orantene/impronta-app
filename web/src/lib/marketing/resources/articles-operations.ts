import { CASE_STUDY_PHOTOS, MARKETING_PHOTOS } from "@/lib/marketing/photography";
import type { ResourceArticle } from "./types";

/** D7 + D10: the paper trail of a job, and enforcing a no-show policy. */
export const OPERATIONS_ARTICLES: ResourceArticle[] = [
  {
    slug: "booking-paperwork",
    photo: MARKETING_PHOTOS.welcome,
    datePublished: "2026-07-23",
    related: ["booking-deposits", "how-talent-bookings-work", "no-show-policy"],
    en: {
      eyebrow: "Getting paid",
      title: "The paper trail of a booking",
      subtitle:
        "What to write down for a job so that scope, price and payment are never a matter of memory. General information, not legal advice.",
      intro:
        "Most disputes between talent and clients are not bad faith. They are two people remembering a conversation differently, weeks apart, with money attached. A small amount of written record removes almost all of it, and it does not require a lawyer or a ten-page contract.",
      sections: [
        {
          heading: "The four things that must be written down",
          body: [
            "What you will do, when you will do it, what it costs, and what happens if plans change. Everything else is refinement. If those four are recorded somewhere both sides can see, you have covered the situations that actually come up.",
            "Notice that three of the four are things people happily discuss out loud and then never write anywhere. That gap is the whole problem.",
          ],
        },
        {
          heading: "An accepted offer is already a record",
          body: [
            "A written offer that the client accepted covers scope, date and price by definition. For most small and mid-sized jobs, that is the paperwork, and it is far more useful than a signed document nobody reads.",
            "The important property is not formality, it is that the acceptance is unambiguous and timestamped. \"Sounds good\" in a message thread is weaker than accepting a specific offer.",
          ],
        },
        {
          heading: "Write down what happens when things change",
          body: [
            "Scope creep, a moved date, a cancellation, extra hours on the day. These are the normal life of a booking, not exotic edge cases, and they are where money quietly leaks.",
            "You do not need elaborate terms. A sentence on rescheduling and a sentence on cancellation, agreed before the job, prevents the awkward conversation happening at the worst possible moment.",
          ],
        },
        {
          heading: "Keep the record attached to the job",
          body: [
            "A record you cannot find is not a record. When the offer, the messages and the payment live in one place tied to a specific booking, answering a question a year later takes seconds.",
            "This also matters at tax time and when a client asks for history. Scattering it across an inbox, a payment app and a notes file is how people end up guessing about their own income.",
          ],
        },
      ],
      faq: [
        {
          q: "Do I need a formal contract for every job?",
          a: "For most small jobs, an accepted written offer covering scope, date and price does the work. Larger or riskier engagements may warrant a proper contract. This is general information, not legal advice.",
        },
        {
          q: "Is a chat message legally enough?",
          a: "It can carry weight, but it is hard to point to later and easy to dispute. An explicit accepted offer is clearer for both sides.",
        },
        {
          q: "What should I do when scope changes mid-job?",
          a: "Write the change down and confirm the new price before doing the extra work, not after. Afterwards it is a favour you already performed.",
        },
        {
          q: "How long should I keep records?",
          a: "Long enough to cover your tax obligations, which vary by country. Keeping them attached to the booking makes this effortless rather than a filing project.",
        },
      ],
    },
    es: {
      eyebrow: "Cómo cobrar",
      title: "El rastro en papel de una reserva",
      subtitle:
        "Qué dejar por escrito para que alcance, precio y pago nunca dependan de la memoria. Información general, no asesoría legal.",
      intro:
        "Casi ningún pleito entre talento y cliente es de mala fe. Son dos personas que recuerdan distinto una plática, semanas después y con dinero de por medio. Un poco de registro escrito elimina casi todo eso, y no requiere abogado ni un contrato de diez páginas.",
      sections: [
        {
          heading: "Las cuatro cosas que sí deben quedar por escrito",
          body: [
            "Qué vas a hacer, cuándo, cuánto cuesta y qué pasa si cambian los planes. Todo lo demás es refinamiento. Si esas cuatro quedan registradas donde ambos las vean, ya cubriste las situaciones que de verdad ocurren.",
            "Fíjate que tres de las cuatro son cosas que la gente platica con gusto y luego no escribe en ningún lado. Ese hueco es todo el problema.",
          ],
        },
        {
          heading: "Una oferta aceptada ya es un registro",
          body: [
            "Una oferta escrita que el cliente aceptó cubre alcance, fecha y precio por definición. Para la mayoría de los trabajos chicos y medianos, ese es el papeleo, y sirve mucho más que un documento firmado que nadie lee.",
            "Lo importante no es la formalidad, es que la aceptación sea inequívoca y tenga fecha. Un \"va, suena bien\" en el chat es más débil que aceptar una oferta concreta.",
          ],
        },
        {
          heading: "Escribe qué pasa cuando algo cambia",
          body: [
            "Que crezca el alcance, que se mueva la fecha, que cancelen, que se alarguen las horas el mismo día. Eso es la vida normal de una reserva, no casos raros, y ahí es donde se fuga el dinero sin ruido.",
            "No necesitas condiciones elaboradas. Una frase sobre reprogramar y una sobre cancelar, acordadas antes del trabajo, evitan tener esa plática incómoda en el peor momento posible.",
          ],
        },
        {
          heading: "Mantén el registro pegado al trabajo",
          body: [
            "Un registro que no encuentras no es un registro. Cuando la oferta, los mensajes y el pago viven en un mismo lugar ligado a una reserva concreta, responder una duda un año después toma segundos.",
            "También importa en temporada de impuestos y cuando un cliente te pide historial. Repartirlo entre el correo, una app de pagos y unas notas es como la gente acaba adivinando sobre su propio ingreso.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Necesito contrato formal en cada trabajo?",
          a: "Para la mayoría de los trabajos chicos, una oferta escrita y aceptada con alcance, fecha y precio hace el trabajo. Proyectos grandes o de más riesgo pueden ameritar un contrato. Esto es información general, no asesoría legal.",
        },
        {
          q: "¿Un mensaje de chat es suficiente legalmente?",
          a: "Puede tener peso, pero es difícil de señalar después y fácil de discutir. Una oferta aceptada de forma explícita es más clara para los dos.",
        },
        {
          q: "¿Qué hago si el alcance cambia a medio trabajo?",
          a: "Deja el cambio por escrito y confirma el nuevo precio antes de hacer el trabajo extra, no después. Después ya es un favor que ya hiciste.",
        },
        {
          q: "¿Cuánto tiempo guardo los registros?",
          a: "Lo suficiente para cubrir tus obligaciones fiscales, que varían por país. Tenerlos pegados a la reserva hace que esto no sea un proyecto de archivo.",
        },
      ],
    },
  },
  {
    slug: "no-show-policy",
    photo: CASE_STUDY_PHOTOS.salon,
    datePublished: "2026-07-23",
    related: ["booking-deposits", "booking-paperwork", "pricing-your-services"],
    en: {
      eyebrow: "Protecting your time",
      title: "A no-show policy that actually holds",
      subtitle:
        "How to write a cancellation and no-show policy people respect, and why the wording matters far less than the enforcement.",
      intro:
        "Almost everyone who has been stood up writes a policy afterwards. Most of those policies never get enforced, because enforcing them means an uncomfortable conversation with someone you would like to work with again. A policy that only exists on a page changes nothing.",
      sections: [
        {
          heading: "A policy without a payment is a wish",
          body: [
            "If nothing is held, there is nothing to enforce. You are left asking someone who already let you down to now send you money, which almost nobody does.",
            "This is why a deposit is the mechanism and the policy is only the explanation. The deposit enforces itself: you already have it, and the policy describes what happens to it.",
          ],
        },
        {
          heading: "Say it in one short paragraph, before they pay",
          body: [
            "Three facts: how much notice is needed to move or cancel, what happens to the deposit inside that window, and what happens outside it. Plain language, no legal formatting.",
            "It has to be visible before payment, not buried afterwards. A policy someone meets for the first time when you are enforcing it feels like a trap, and they will tell people it was one.",
          ],
        },
        {
          heading: "Pick a notice window you can defend",
          body: [
            "The right window is roughly how long it takes you to fill the slot. A one-hour appointment might need a day; a full-day booking that you turned other work down for needs considerably more.",
            "Setting a window far longer than you could plausibly need is the most common mistake. It reads as unfair and it is what makes people argue instead of complying.",
          ],
        },
        {
          heading: "Enforce it, but keep the door open",
          body: [
            "The workable middle ground is common: keep the deposit if they cancel late, but credit it toward a future booking if they reschedule with reasonable notice. You are protected and the relationship survives.",
            "What quietly destroys a policy is applying it selectively. If it is waived whenever someone pushes back, everyone learns that pushing back works.",
          ],
        },
      ],
      faq: [
        {
          q: "How much notice should I require?",
          a: "Roughly the time it takes you to fill the slot. A short appointment might need a day; a full-day booking needs considerably more.",
        },
        {
          q: "Should I ever waive the policy?",
          a: "Occasionally, for genuine emergencies and good clients. Just be aware that waiving it whenever someone objects teaches everyone that objecting works.",
        },
        {
          q: "What if a client disputes the charge?",
          a: "Your defence is the record: a visible policy shown before payment and an accepted offer. This is general information, not legal advice, and local consumer rules can apply.",
        },
        {
          q: "Does a policy make me look unfriendly?",
          a: "Not if it is stated plainly and up front. Clients who hire professionals expect one; it is being surprised by a policy that annoys people.",
        },
      ],
    },
    es: {
      eyebrow: "Protege tu tiempo",
      title: "Una política de cancelación que sí se sostiene",
      subtitle:
        "Cómo escribir una política de cancelación y no presentación que la gente respete, y por qué la redacción importa mucho menos que aplicarla.",
      intro:
        "Casi todo el que ha sido dejado plantado escribe una política después. Casi ninguna de esas políticas se aplica, porque aplicarla implica una plática incómoda con alguien con quien te gustaría volver a trabajar. Una política que solo existe en una página no cambia nada.",
      sections: [
        {
          heading: "Una política sin pago es un deseo",
          body: [
            "Si no hay nada apartado, no hay nada que aplicar. Te quedas pidiéndole dinero a alguien que ya te falló, y eso casi nadie lo manda.",
            "Por eso el anticipo es el mecanismo y la política es solo la explicación. El anticipo se aplica solo: ya lo tienes, y la política describe qué pasa con él.",
          ],
        },
        {
          heading: "Dilo en un párrafo corto, antes de que paguen",
          body: [
            "Tres datos: cuánta anticipación se necesita para mover o cancelar, qué pasa con el anticipo dentro de ese plazo y qué pasa fuera de él. En palabras simples, sin formato legal.",
            "Tiene que verse antes del pago, no quedar enterrada después. Una política que alguien conoce justo cuando se la aplicas se siente como una trampa, y así la va a contar.",
          ],
        },
        {
          heading: "Elige un plazo que puedas defender",
          body: [
            "El plazo correcto es más o menos lo que tardas en volver a llenar el lugar. Una cita de una hora quizá necesite un día; una reserva de día completo por la que rechazaste otro trabajo necesita bastante más.",
            "Poner un plazo mucho más largo del que realmente necesitas es el error más común. Se lee como injusto y es lo que hace que la gente discuta en vez de cumplir.",
          ],
        },
        {
          heading: "Aplícala, pero deja la puerta abierta",
          body: [
            "El punto medio que sí funciona es común: te quedas el anticipo si cancelan tarde, pero lo abonas a una reserva futura si reprograman con aviso razonable. Quedas protegido y la relación sobrevive.",
            "Lo que mata una política en silencio es aplicarla a modo. Si se perdona cada vez que alguien reclama, todos aprenden que reclamar funciona.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Cuánta anticipación debo pedir?",
          a: "Más o menos lo que tardas en volver a llenar el lugar. Una cita corta quizá un día; una reserva de día completo, bastante más.",
        },
        {
          q: "¿Debo perdonar la política alguna vez?",
          a: "De vez en cuando, ante emergencias reales y con buenos clientes. Solo ten claro que perdonarla cada vez que alguien reclama le enseña a todos que reclamar funciona.",
        },
        {
          q: "¿Y si el cliente disputa el cargo?",
          a: "Tu defensa es el registro: una política visible mostrada antes del pago y una oferta aceptada. Esto es información general, no asesoría legal, y pueden aplicar reglas locales de consumo.",
        },
        {
          q: "¿Una política me hace ver poco amable?",
          a: "No si la dices claro y desde el principio. Quien contrata profesionales espera una; lo que molesta es que la política te tome por sorpresa.",
        },
      ],
    },
  },
];
