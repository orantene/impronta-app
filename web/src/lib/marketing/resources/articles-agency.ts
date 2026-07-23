import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import type { ResourceArticle } from "./types";

/** D4 + D5: representation, and how commission actually works. */
export const AGENCY_ARTICLES: ResourceArticle[] = [
  {
    slug: "do-you-need-an-agency",
    photo: MARKETING_PHOTOS.agency,
    datePublished: "2026-07-23",
    related: ["how-agency-commissions-work", "pricing-your-services", "booking-paperwork"],
    en: {
      eyebrow: "Representation",
      title: "Do you still need an agency?",
      subtitle:
        "Independent, represented, or both. An honest look at what an agency actually provides and what you can now do yourself.",
      intro:
        "The question is usually framed as a loyalty test, which is unhelpful. An agency is a service you buy with a share of your income. The useful question is not whether agencies are good, it is which parts of what they do you still need someone else to do.",
      sections: [
        {
          heading: "What an agency genuinely provides",
          body: [
            "Access is the real product. A good agency has relationships with clients you cannot reach by yourself, and being on their roster puts you in rooms you would not otherwise enter. That is difficult to replicate and worth paying for.",
            "The rest is administration and credibility: chasing payment, negotiating on your behalf, and being an established name that makes a nervous client comfortable. These are valuable, but they are no longer scarce.",
          ],
        },
        {
          heading: "What you can now do yourself",
          body: [
            "Presentation, structured enquiries, quoting, taking payment, and keeping records are all things an independent person can now do to a professional standard. That was not true fifteen years ago, and it is the reason the independent path is viable at all.",
            "What does not become easier on your own is demand. Tools fix how you handle work that arrives. They do not, by themselves, make it arrive.",
          ],
        },
        {
          heading: "The hybrid case, which is most people",
          body: [
            "In practice, plenty of people are represented for one kind of work and independent for another: an agency handles the campaigns, and direct clients come to them for everything else.",
            "This is usually the strongest position, because your income is not tied to one relationship. It does require being clear with everyone about which work goes through whom, and honouring any exclusivity you have agreed to.",
          ],
        },
        {
          heading: "How to decide",
          body: [
            "Look at where your last ten jobs came from. If most were introduced by someone else, you are buying access and the commission is doing its job. If most came to you directly, you are paying a share of income for administration you already handle.",
            "That is the whole calculation. It is worth redoing once a year, because the answer changes as your reputation grows.",
          ],
        },
      ],
      faq: [
        {
          q: "Can I be independent and with an agency at the same time?",
          a: "Often yes, but it depends entirely on what you signed. Exclusivity clauses may limit a market, a category, or a period, so read the agreement before taking direct work.",
        },
        {
          q: "Do I need an agency to look professional?",
          a: "No. Presentation is now something you control directly. Credibility comes from how your work and your process look, not from whose roster you are on.",
        },
        {
          q: "What does an agency do that I cannot?",
          a: "Introduce you to clients who do not know you exist. That is the part worth paying for; most of the rest is administration.",
        },
        {
          q: "Is going independent risky?",
          a: "The risk is demand, not admin. If your bookings currently come from an agency's relationships, leaving removes the source before it removes the work.",
        },
      ],
    },
    es: {
      eyebrow: "Representación",
      title: "¿Todavía necesitas una agencia?",
      subtitle:
        "Independiente, representado o las dos. Una mirada honesta a lo que de verdad aporta una agencia y a lo que ya puedes hacer tú.",
      intro:
        "La pregunta suele plantearse como una prueba de lealtad, y así no sirve. Una agencia es un servicio que pagas con una parte de tus ingresos. La pregunta útil no es si las agencias son buenas, sino qué partes de lo que hacen todavía necesitas que las haga alguien más.",
      sections: [
        {
          heading: "Lo que una agencia sí aporta",
          body: [
            "El acceso es el producto real. Una buena agencia tiene relaciones con clientes a los que tú no llegas solo, y estar en su roster te lleva a lugares donde no entrarías de otra forma. Eso es difícil de replicar y vale la pena pagarlo.",
            "Lo demás es administración y credibilidad: perseguir pagos, negociar por ti y ser un nombre establecido que tranquiliza a un cliente nervioso. Son cosas valiosas, pero ya no son escasas.",
          ],
        },
        {
          heading: "Lo que ya puedes hacer tú",
          body: [
            "Presentación, solicitudes ordenadas, cotizar, cobrar y llevar registro son cosas que hoy una persona independiente puede hacer a nivel profesional. Hace quince años no era así, y por eso el camino independiente es viable.",
            "Lo que no se vuelve más fácil por tu cuenta es la demanda. Las herramientas arreglan cómo manejas el trabajo que llega. No hacen, por sí solas, que llegue.",
          ],
        },
        {
          heading: "El caso híbrido, que es el de casi todos",
          body: [
            "En la práctica, mucha gente está representada para un tipo de trabajo y es independiente para otro: la agencia lleva las campañas, y los clientes directos los buscan para todo lo demás.",
            "Suele ser la posición más fuerte, porque tu ingreso no depende de una sola relación. Eso sí, exige ser claro con todos sobre qué trabajo va por dónde y respetar cualquier exclusividad que hayas firmado.",
          ],
        },
        {
          heading: "Cómo decidir",
          body: [
            "Mira de dónde salieron tus últimos diez trabajos. Si a la mayoría te los presentó alguien más, estás comprando acceso y la comisión está haciendo su trabajo. Si la mayoría llegó directo a ti, estás pagando una parte de tu ingreso por administración que ya haces.",
            "Ese es todo el cálculo. Conviene rehacerlo una vez al año, porque la respuesta cambia conforme crece tu nombre.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Puedo ser independiente y estar en una agencia a la vez?",
          a: "Muchas veces sí, pero depende por completo de lo que firmaste. Las cláusulas de exclusividad pueden limitar un mercado, una categoría o un periodo, así que lee el acuerdo antes de tomar trabajo directo.",
        },
        {
          q: "¿Necesito agencia para verme profesional?",
          a: "No. La presentación ya es algo que tú controlas. La credibilidad viene de cómo se ven tu trabajo y tu proceso, no del roster en el que estés.",
        },
        {
          q: "¿Qué hace una agencia que yo no pueda?",
          a: "Presentarte con clientes que no saben que existes. Esa es la parte que vale la pena pagar; casi todo lo demás es administración.",
        },
        {
          q: "¿Es riesgoso volverse independiente?",
          a: "El riesgo es la demanda, no la administración. Si hoy tus reservas vienen de las relaciones de una agencia, salirte quita la fuente antes de quitar el trabajo.",
        },
      ],
    },
  },
  {
    slug: "how-agency-commissions-work",
    photo: MARKETING_PHOTOS.hubDiscovery,
    datePublished: "2026-07-23",
    related: ["do-you-need-an-agency", "pricing-your-services", "booking-paperwork"],
    en: {
      eyebrow: "Money",
      title: "How agency commissions actually work",
      subtitle:
        "Who takes a cut, who pays it, and the questions to ask before you sign anything.",
      intro:
        "Commission is simple in principle and confusing in practice, because two different arrangements use the same word. Knowing which one you are in tells you what you actually earn from a booking, which is a strange thing to be unsure about.",
      sections: [
        {
          heading: "Deducted from you, or added to the client",
          body: [
            "In the first arrangement, the client pays a fee and the agency keeps a percentage before paying you. Your rate and the client's cost are the same number, and the commission comes out of your side.",
            "In the second, the agency adds its fee on top of your rate. You receive what you quoted and the client pays more than that. Both are normal. What is not normal is not knowing which one applies to you.",
          ],
        },
        {
          heading: "Rates vary, and anyone quoting a universal number is guessing",
          body: [
            "Percentages differ by market, category, and how much the agency actually does. Rather than anchor on a number you read somewhere, ask what the rate is, what it covers, and whether it changes for repeat clients.",
            "The important comparison is not the percentage in isolation. A higher rate from someone who brings you consistent work is better than a lower rate from someone who brings you nothing.",
          ],
        },
        {
          heading: "Where splits get complicated",
          body: [
            "More than two parties often have a claim: a mother agency, a booking agency in another market, or whoever referred the job. Each may take a share, and they are usually taken in sequence rather than all from the original total.",
            "Ask for the arithmetic on a real example rather than the policy in the abstract. A worked example of a job at a specific price surfaces assumptions that a percentage on its own hides.",
          ],
        },
        {
          heading: "What to confirm before you sign",
          body: [
            "Four things: the percentage, whether it is deducted or added, when you get paid relative to when the client pays, and what happens if the client pays late or not at all.",
            "That last one matters more than people expect. Some arrangements pay you on client payment, others on a fixed schedule regardless. The difference decides who carries the risk of a slow client.",
          ],
        },
      ],
      faq: [
        {
          q: "Who pays the commission, me or the client?",
          a: "It depends on the arrangement. It is either deducted from your fee or added to the client's cost. Confirm which one before you agree to anything.",
        },
        {
          q: "What is a normal commission rate?",
          a: "It varies by market, category and how much the agency does. Ask what the rate is and what it covers rather than relying on a figure quoted elsewhere.",
        },
        {
          q: "Can more than one party take a cut?",
          a: "Yes. A mother agency, a booking agency and a referrer can all have a claim. Ask for the arithmetic on a real example.",
        },
        {
          q: "Does Tulala take a commission?",
          a: "The free workspace plan takes no commission on bookings. See the pricing page for what each plan includes.",
        },
      ],
    },
    es: {
      eyebrow: "Dinero",
      title: "Cómo funcionan de verdad las comisiones de agencia",
      subtitle:
        "Quién se lleva una parte, quién la paga y qué preguntar antes de firmar.",
      intro:
        "La comisión es simple en teoría y confusa en la práctica, porque dos arreglos distintos usan la misma palabra. Saber en cuál estás te dice cuánto ganas de verdad por una reserva, que es algo raro de no tener claro.",
      sections: [
        {
          heading: "Se te descuenta a ti, o se le suma al cliente",
          body: [
            "En el primer arreglo, el cliente paga una tarifa y la agencia se queda un porcentaje antes de pagarte. Tu tarifa y el costo del cliente son el mismo número, y la comisión sale de tu lado.",
            "En el segundo, la agencia suma su tarifa encima de la tuya. Tú recibes lo que cotizaste y el cliente paga más que eso. Los dos son normales. Lo que no es normal es no saber cuál te aplica.",
          ],
        },
        {
          heading: "Los porcentajes varían, y quien te dé un número universal está adivinando",
          body: [
            "Los porcentajes cambian según el mercado, la categoría y cuánto hace realmente la agencia. En vez de anclarte a un número que leíste, pregunta cuál es la tarifa, qué cubre y si cambia con clientes recurrentes.",
            "La comparación importante no es el porcentaje solo. Una tarifa más alta de alguien que te trae trabajo constante es mejor que una más baja de alguien que no te trae nada.",
          ],
        },
        {
          heading: "Dónde se complican los repartos",
          body: [
            "Muchas veces hay más de dos partes con derecho: una agencia madre, una agencia de otro mercado o quien refirió el trabajo. Cada una puede llevarse una parte, y normalmente se toman en secuencia y no todas del total original.",
            "Pide las cuentas sobre un ejemplo real y no la política en abstracto. Un ejemplo con un precio concreto saca a la luz supuestos que un porcentaje solo esconde.",
          ],
        },
        {
          heading: "Qué confirmar antes de firmar",
          body: [
            "Cuatro cosas: el porcentaje, si se descuenta o se suma, cuándo te pagan respecto a cuándo paga el cliente, y qué pasa si el cliente paga tarde o no paga.",
            "Lo último importa más de lo que la gente cree. Algunos arreglos te pagan cuando paga el cliente; otros, en una fecha fija pase lo que pase. Esa diferencia define quién carga con el riesgo de un cliente lento.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Quién paga la comisión, yo o el cliente?",
          a: "Depende del arreglo. O se descuenta de tu tarifa o se suma al costo del cliente. Confirma cuál antes de aceptar nada.",
        },
        {
          q: "¿Cuál es una comisión normal?",
          a: "Varía según mercado, categoría y cuánto hace la agencia. Pregunta cuál es la tarifa y qué cubre, en vez de confiar en una cifra citada por ahí.",
        },
        {
          q: "¿Puede llevarse una parte más de uno?",
          a: "Sí. Una agencia madre, una agencia de reservas y quien refirió pueden tener derecho. Pide las cuentas con un ejemplo real.",
        },
        {
          q: "¿Tulala cobra comisión?",
          a: "El plan gratuito de workspace no cobra comisión sobre las reservas. Revisa la página de precios para ver qué incluye cada plan.",
        },
      ],
    },
  },
];
