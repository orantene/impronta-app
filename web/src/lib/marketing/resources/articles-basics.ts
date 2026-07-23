import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import type { ResourceArticle } from "./types";

/** D1 + D6: how the booking flow works, and why chat-only booking leaks money. */
export const BASICS_ARTICLES: ResourceArticle[] = [
  {
    slug: "how-talent-bookings-work",
    photo: MARKETING_PHOTOS.talentBooking,
    datePublished: "2026-07-23",
    related: ["booking-deposits", "booking-from-dms", "pricing-your-services"],
    en: {
      eyebrow: "Getting booked",
      title: "How talent bookings actually work",
      subtitle:
        "The path from a first message to money in your account, and the four points where most bookings fall apart.",
      intro:
        "Every booking, whether it is a shoot, a gig, a dinner or a session, moves through the same four steps: someone asks, you quote, both sides agree, and money changes hands. What separates people who get booked from people who get ghosted is usually not talent. It is how cleanly those four steps happen.",
      sections: [
        {
          heading: "1. The request",
          body: [
            "A request is useful when it arrives with the facts you need to price the job: the date, what the work is, where it happens, and how long it runs. A request that says only \"how much do you charge?\" is not a lead yet, it is the start of an interview.",
            "This is the cheapest step to fix. If the questions get asked before the conversation starts, your first reply can carry a number instead of another question, and you save a day of back and forth on every enquiry.",
          ],
        },
        {
          heading: "2. The offer",
          body: [
            "An offer is the quote written down: what you will do, when, and for how much. Saying a price in a chat message is not the same thing, because a chat message has no state. Nobody can tell whether it was accepted, and a week later neither of you remembers the exact number.",
            "A written offer also protects you. When the scope changes, and it will, you have something specific to point at rather than a memory of a conversation.",
          ],
        },
        {
          heading: "3. The confirmation",
          body: [
            "A date is either held or it is not. The most common way to lose money in this business is the soft hold: the client says yes, you stop taking other work for that date, and two weeks out they quietly disappear.",
            "The fix is to attach the confirmation to a payment. When accepting the offer means paying something, a confirmed date is a real commitment rather than an intention.",
          ],
        },
        {
          heading: "4. The payment",
          body: [
            "Getting paid should be part of the booking, not a separate chase afterwards. Once the job is done and payment lives somewhere other than the booking, it becomes admin: invoices, reminders, awkward follow-ups.",
            "Keeping the payment attached to the booking also gives you a record. At the end of the year you have a list of jobs and what each one paid, which is the difference between running a business and remembering one.",
          ],
        },
      ],
      faq: [
        {
          q: "What is the difference between an inquiry and a booking?",
          a: "An inquiry is someone asking. A booking is an agreed job: a specific date, a specific price, and usually a payment against it.",
        },
        {
          q: "Should I quote a price in the first reply?",
          a: "If you have the facts, yes. Replying with a number moves the conversation forward. Replying with a question invites a delay.",
        },
        {
          q: "When should I ask for money?",
          a: "At confirmation, not at delivery. A payment is what turns a held date into a booked one.",
        },
        {
          q: "Do I need contracts for small jobs?",
          a: "A written offer that both sides agreed to covers most of what small jobs need: scope, date, price. This is general information, not legal advice.",
        },
      ],
    },
    es: {
      eyebrow: "Cómo te contratan",
      title: "Cómo funciona de verdad una reserva de talento",
      subtitle:
        "El camino del primer mensaje al dinero en tu cuenta, y los cuatro puntos donde se cae la mayoría de las reservas.",
      intro:
        "Toda reserva, sea una sesión, una tocada, una cena o una clase, pasa por los mismos cuatro pasos: alguien pregunta, tú cotizas, ambos acuerdan y el dinero cambia de manos. Lo que separa a quien se llena de trabajo de quien se queda esperando casi nunca es el talento. Es qué tan limpio ocurren esos cuatro pasos.",
      sections: [
        {
          heading: "1. La solicitud",
          body: [
            "Una solicitud sirve cuando llega con los datos que necesitas para poner precio: la fecha, qué es el trabajo, dónde es y cuánto dura. Una que solo dice \"¿cuánto cobras?\" todavía no es un prospecto, es el inicio de un interrogatorio.",
            "Este es el paso más barato de arreglar. Si esas preguntas se hacen antes de que empiece la conversación, tu primera respuesta ya puede llevar un número en lugar de otra pregunta, y te ahorras un día de ida y vuelta en cada solicitud.",
          ],
        },
        {
          heading: "2. La oferta",
          body: [
            "Una oferta es la cotización por escrito: qué vas a hacer, cuándo y por cuánto. Decir un precio en un chat no es lo mismo, porque un mensaje no tiene estado. Nadie sabe si se aceptó, y una semana después ninguno de los dos recuerda la cifra exacta.",
            "La oferta escrita también te protege. Cuando el alcance cambia, y va a cambiar, tienes algo concreto que señalar en lugar del recuerdo de una plática.",
          ],
        },
        {
          heading: "3. La confirmación",
          body: [
            "Una fecha está apartada o no lo está. La forma más común de perder dinero en esto es el apartado blando: el cliente dice que sí, tú dejas de tomar otro trabajo para esa fecha, y dos semanas antes desaparece sin decir nada.",
            "La solución es amarrar la confirmación a un pago. Cuando aceptar la oferta implica pagar algo, una fecha confirmada es un compromiso real y no una intención.",
          ],
        },
        {
          heading: "4. El pago",
          body: [
            "Cobrar debería ser parte de la reserva, no una persecución aparte. Cuando el trabajo ya se hizo y el pago vive en otro lado, se convierte en trámite: facturas, recordatorios, mensajes incómodos.",
            "Mantener el pago pegado a la reserva también te deja un registro. Al final del año tienes una lista de trabajos y cuánto pagó cada uno, que es la diferencia entre llevar un negocio y acordarte de uno.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Cuál es la diferencia entre una solicitud y una reserva?",
          a: "Una solicitud es alguien preguntando. Una reserva es un trabajo acordado: fecha concreta, precio concreto y normalmente un pago de por medio.",
        },
        {
          q: "¿Debo dar precio en la primera respuesta?",
          a: "Si tienes los datos, sí. Responder con un número mueve la conversación. Responder con una pregunta invita a la demora.",
        },
        {
          q: "¿Cuándo debo pedir dinero?",
          a: "En la confirmación, no en la entrega. Un pago es lo que convierte una fecha apartada en una fecha reservada.",
        },
        {
          q: "¿Necesito contrato para trabajos chicos?",
          a: "Una oferta escrita que ambas partes aceptaron cubre casi todo lo que un trabajo chico necesita: alcance, fecha y precio. Esto es información general, no asesoría legal.",
        },
      ],
    },
  },
  {
    slug: "booking-from-dms",
    photo: MARKETING_PHOTOS.systems,
    datePublished: "2026-07-23",
    related: ["how-talent-bookings-work", "booking-deposits", "pricing-your-services"],
    en: {
      eyebrow: "Working smarter",
      title: "Why booking only through DMs loses you money",
      subtitle:
        "Direct messages are a great place to be found and a bad place to run a booking. Here is where the money leaks.",
      intro:
        "Nobody plans to run a business out of an inbox. It happens because that is where the first client arrived, and then the second. The problem is not the messages themselves. It is that a chat thread has no memory, no structure, and no way to tell a real booking from a maybe.",
      sections: [
        {
          heading: "Every enquiry starts from zero",
          body: [
            "In a DM, the client sets the agenda, and the agenda is usually \"how much?\". You then spend several messages extracting the date, the scope and the location, and by the time you can quote, the thread has gone cold.",
            "The same questions get typed again for the next enquiry, and the one after. It is unpaid work you repeat forever.",
          ],
        },
        {
          heading: "Nothing is on record",
          body: [
            "Scroll back three weeks and try to find what you quoted, whether they accepted, and what was included. In a busy inbox that information is technically present and practically gone.",
            "This matters most when something goes wrong: a scope creeps, a date moves, a client remembers a different number than you do.",
          ],
        },
        {
          heading: "Held dates are not really held",
          body: [
            "A yes in a chat costs the client nothing. That is why soft holds evaporate. You turn down other work for a date that was never actually committed.",
            "Attaching a payment to the confirmation is the only reliable fix. It filters out the people who were never going to book, at no cost to the ones who were.",
          ],
        },
        {
          heading: "You look smaller than you are",
          body: [
            "A screenshot of a rate is a different thing from a page that shows the work, the services and the prices. The work can be identical and the second one still wins the job.",
            "This is the part people underestimate. Presentation is not vanity here, it is what makes a stranger comfortable sending you money.",
          ],
        },
      ],
      faq: [
        {
          q: "Should I stop using DMs entirely?",
          a: "No. Direct messages are good for being discovered. They are just a poor place to hold the booking itself. Let people find you there and book somewhere with structure.",
        },
        {
          q: "Will clients actually use a booking page?",
          a: "They will if it is easier than typing. A page that asks three questions and gives a price is less work for the client than a conversation.",
        },
        {
          q: "What if my clients are used to messaging me?",
          a: "They can keep messaging. The difference is that the details and the payment live on the booking rather than in the scroll.",
        },
        {
          q: "Is a link-in-bio page enough?",
          a: "It helps people find you, but it does not take a structured request, produce a priced offer, or take payment. That is the part that saves the time.",
        },
      ],
    },
    es: {
      eyebrow: "Trabajar mejor",
      title: "Por qué reservar solo por mensajes directos te cuesta dinero",
      subtitle:
        "Los mensajes directos son un gran lugar para que te encuentren y un mal lugar para llevar una reserva. Aquí es donde se fuga el dinero.",
      intro:
        "Nadie planea llevar un negocio desde la bandeja de entrada. Pasa porque ahí llegó el primer cliente, y luego el segundo. El problema no son los mensajes. Es que una conversación no tiene memoria, no tiene estructura y no distingue una reserva real de un tal vez.",
      sections: [
        {
          heading: "Cada solicitud empieza de cero",
          body: [
            "En un mensaje directo el cliente marca la agenda, y la agenda casi siempre es \"¿cuánto?\". Entonces gastas varios mensajes sacando la fecha, el alcance y el lugar, y para cuando puedes cotizar la conversación ya se enfrió.",
            "Las mismas preguntas se vuelven a teclear en la siguiente solicitud, y en la que sigue. Es trabajo no pagado que repites para siempre.",
          ],
        },
        {
          heading: "Nada queda registrado",
          body: [
            "Regresa tres semanas en el chat y busca qué cotizaste, si lo aceptaron y qué incluía. En una bandeja ocupada esa información técnicamente está y en la práctica se perdió.",
            "Esto pesa más cuando algo sale mal: el alcance crece, la fecha se mueve, el cliente recuerda un número distinto al tuyo.",
          ],
        },
        {
          heading: "Las fechas apartadas no lo están",
          body: [
            "Un sí en el chat no le cuesta nada al cliente. Por eso los apartados blandos se evaporan. Rechazas otro trabajo por una fecha que nunca estuvo comprometida de verdad.",
            "Amarrar un pago a la confirmación es la única solución confiable. Filtra a quien nunca iba a reservar, sin costo para quien sí.",
          ],
        },
        {
          heading: "Te ves más chico de lo que eres",
          body: [
            "Una captura de pantalla con una tarifa no es lo mismo que una página que muestra el trabajo, los servicios y los precios. El trabajo puede ser idéntico y la segunda igual se queda con la chamba.",
            "Esta parte se subestima. La presentación aquí no es vanidad, es lo que hace que un desconocido se sienta cómodo mandándote dinero.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Debo dejar de usar mensajes directos?",
          a: "No. Los mensajes directos sirven para que te descubran. Solo son un mal lugar para sostener la reserva. Deja que te encuentren ahí y que reserven donde hay estructura.",
        },
        {
          q: "¿De verdad van a usar una página de reservas?",
          a: "La usan si es más fácil que escribir. Una página que hace tres preguntas y da un precio es menos trabajo para el cliente que una conversación.",
        },
        {
          q: "¿Y si mis clientes están acostumbrados a escribirme?",
          a: "Que sigan escribiendo. La diferencia es que los datos y el pago viven en la reserva y no en el scroll.",
        },
        {
          q: "¿Basta con una página de enlaces?",
          a: "Ayuda a que te encuentren, pero no recibe una solicitud ordenada, no genera una oferta con precio ni cobra. Esa es la parte que ahorra tiempo.",
        },
      ],
    },
  },
];
