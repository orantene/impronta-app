import { CASE_STUDY_PHOTOS } from "@/lib/marketing/photography";
import type { TalentCategory } from "./types";

/**
 * The two categories that stretch the positioning, and the rules that keep
 * each of them honest.
 *
 * MAKERS. A jeweller is in scope because the commission IS the work: a
 * conversation, a quote, a deposit, then something made by hand. This page
 * must never promise shipping, delivery, stock, inventory or returns. None of
 * that is built, and "sell what you do, not what you ship" is our own line.
 * If a maker reads this page and expects a store with a cart, we have
 * mis-sold. So the page says out loud what it is not.
 *
 * PROFESSIONAL SERVICES. An immigration office is appointment-booked
 * expertise. "Time, skill and craft" does not read as legal or advisory work
 * unless the page makes that connection for the reader, so it makes it in the
 * first line rather than hoping they infer it.
 *
 * Neither page gives legal, immigration or financial advice, and neither
 * implies we vet or certify anyone's credentials.
 */
export const PROFESSION_CATEGORIES: TalentCategory[] = [
  {
    slug: "makers",
    photo: CASE_STUDY_PHOTOS.tattoo,
    related: ["tattoo-artists", "photographers", "chefs"],
    en: {
      eyebrow: "For jewellers and makers",
      title: "A page for commissioned work",
      subtitle:
        "For work that starts as a conversation. Show what you have made, agree the piece, take a deposit, and get paid when it is done.",
      intro:
        "Commissioned work does not fit a shop. There is no stock to list and no button that says add to basket, because the price depends on the stone, the size and what the person actually wants. What you need is somewhere to show the work and a way to run the conversation that follows.",
      steps: [
        {
          title: "Show the work, not a catalogue",
          body: "Photographs of pieces you have made, with what each one was and roughly what that kind of commission costs. People are buying your hand, so the portfolio is the pitch.",
        },
        {
          title: "Let an inquiry arrive with the details in it",
          body: "Ask the questions you always end up asking anyway: occasion, timing, budget, materials. The conversation starts where it usually gets to after four messages.",
        },
        {
          title: "Quote the piece, take the deposit",
          body: "Send a real quote for that commission rather than a fixed price for a thing. Take a deposit before you buy materials, and the remainder when the work is finished.",
        },
        {
          title: "Keep the whole commission in one thread",
          body: "The brief, the sketches, the change of mind about the setting, the payments. All on one record, so six months later you can see exactly what was agreed.",
        },
      ],
      faq: [
        {
          q: "Can I sell finished pieces from stock?",
          a: "Not well, and we would rather say so. There is no inventory, no shipping and no returns handling here. This is built for commissioned work agreed in a conversation. If you mostly sell ready made pieces that need posting, a shop platform will serve you better.",
        },
        {
          q: "Do you handle delivery?",
          a: "No. How the piece reaches the customer is between you and them. We handle the inquiry, the quote, the deposit and the payment.",
        },
        {
          q: "Can I take a deposit and the rest later?",
          a: "Yes. That is the normal shape of a commission, so it is the normal shape here: a deposit to start and the balance when the work is done.",
        },
        {
          q: "What does it cost?",
          a: "The page is free. On a paid commission the fee is six percent, three from the client and three from you, with card processing included. The same on every plan.",
        },
      ],
    },
    es: {
      eyebrow: "Para joyeros y creadores",
      title: "Una página para trabajo por encargo",
      subtitle:
        "Para trabajo que empieza como una conversación. Muestra lo que has hecho, acuerda la pieza, recibe un anticipo y cobra cuando esté lista.",
      intro:
        "El trabajo por encargo no cabe en una tienda. No hay inventario que listar ni un botón que diga agregar al carrito, porque el precio depende de la piedra, del tamaño y de lo que la persona de verdad quiere. Lo que necesitas es dónde mostrar el trabajo y cómo llevar la conversación que viene después.",
      steps: [
        {
          title: "Muestra el trabajo, no un catálogo",
          body: "Fotos de piezas que has hecho, con qué fue cada una y más o menos cuánto cuesta un encargo así. Te están comprando tus manos, así que el portafolio es el argumento.",
        },
        {
          title: "Deja que la solicitud llegue con los detalles",
          body: "Pregunta lo que siempre terminas preguntando: ocasión, tiempos, presupuesto, materiales. La conversación empieza donde normalmente llega después de cuatro mensajes.",
        },
        {
          title: "Cotiza la pieza, recibe el anticipo",
          body: "Manda una cotización real de ese encargo en vez de un precio fijo de una cosa. Recibe anticipo antes de comprar material, y el resto cuando el trabajo esté terminado.",
        },
        {
          title: "Ten todo el encargo en un solo hilo",
          body: "El brief, los bocetos, el cambio de opinión sobre el engaste, los pagos. Todo en un registro, para que seis meses después veas exactamente qué se acordó.",
        },
      ],
      faq: [
        {
          q: "¿Puedo vender piezas terminadas de inventario?",
          a: "No bien, y preferimos decirlo. Aquí no hay inventario, ni envíos, ni manejo de devoluciones. Esto está hecho para trabajo por encargo acordado en una conversación. Si vendes sobre todo piezas listas que hay que mandar por paquetería, una plataforma de tienda te va a servir mejor.",
        },
        {
          q: "¿Ustedes manejan la entrega?",
          a: "No. Cómo llega la pieza al cliente es entre tú y él. Nosotros manejamos la solicitud, la cotización, el anticipo y el pago.",
        },
        {
          q: "¿Puedo cobrar anticipo y el resto después?",
          a: "Sí. Esa es la forma normal de un encargo, así que es la forma normal aquí: anticipo para empezar y el saldo cuando el trabajo está hecho.",
        },
        {
          q: "¿Cuánto cuesta?",
          a: "La página es gratis. En un encargo pagado la tarifa es seis por ciento, tres del cliente y tres tuyos, con el procesamiento incluido. Igual en todos los planes.",
        },
      ],
    },
  },

  {
    slug: "professional-services",
    photo: CASE_STUDY_PHOTOS.cityhub,
    related: ["coaches", "makers", "restaurants"],
    en: {
      eyebrow: "For advisors, consultants and professional practices",
      title: "A booking page for professional services",
      subtitle:
        "Consultations booked by appointment, with the intake questions asked before the meeting instead of during it.",
      intro:
        "An immigration office, an accountant, a consultant. The work is expertise sold by the appointment, and the first fifteen minutes of every first meeting go on questions that could have been answered beforehand.",
      steps: [
        {
          title: "Publish what a consultation actually is",
          body: "How long it takes, what it costs, and what you can help with. People hesitate to book when they cannot tell whether their situation is the kind you handle.",
        },
        {
          title: "Ask the intake questions before the meeting",
          body: "The details you always need arrive with the booking, so the appointment starts with the actual matter rather than with paperwork.",
        },
        {
          title: "Decide how each appointment books",
          body: "A short first consultation might book instantly. A longer one might wait for your approval, or ask for payment up front. You set that per service.",
        },
        {
          title: "Keep the matter in one place",
          body: "Messages, documents the client sends, what was agreed and what was paid, on one record per client rather than across a chat and an inbox.",
        },
      ],
      faq: [
        {
          q: "Is this suitable for a regulated practice?",
          a: "It handles booking, intake, messaging and payment. It is not case management software and it does not certify or vet anyone's credentials or qualifications. Your professional and regulatory obligations are yours, exactly as they are today.",
        },
        {
          q: "Can clients send documents securely?",
          a: "Clients can attach files to the conversation, which stays on your workspace record. Judge for yourself whether that meets the standard your field requires for a given document.",
        },
        {
          q: "Can I charge for the first consultation?",
          a: "Yes, or make it free. You set that per service, and you can ask for payment at booking so a paid consultation is settled before the time is held.",
        },
        {
          q: "What does it cost?",
          a: "The page is free. On a paid booking the fee is six percent, three from the client and three from you, with card processing included. The same on every plan.",
        },
      ],
    },
    es: {
      eyebrow: "Para asesores, consultores y despachos",
      title: "Una página de citas para servicios profesionales",
      subtitle:
        "Consultas por cita, con las preguntas de admisión hechas antes de la reunión en vez de durante ella.",
      intro:
        "Un despacho de migración, un contador, un consultor. El trabajo es experiencia vendida por cita, y los primeros quince minutos de cada primera reunión se van en preguntas que se pudieron contestar antes.",
      steps: [
        {
          title: "Publica qué es de verdad una consulta",
          body: "Cuánto dura, cuánto cuesta y en qué puedes ayudar. La gente duda en agendar cuando no sabe si su caso es de los que tú llevas.",
        },
        {
          title: "Haz las preguntas de admisión antes de la cita",
          body: "Los datos que siempre necesitas llegan con la reserva, así la cita empieza con el asunto real y no con el papeleo.",
        },
        {
          title: "Decide cómo se agenda cada cita",
          body: "Una primera consulta corta puede agendarse al instante. Una más larga puede esperar tu aprobación, o pedir pago por adelantado. Eso lo defines por servicio.",
        },
        {
          title: "Ten el asunto en un solo lugar",
          body: "Mensajes, documentos que manda el cliente, qué se acordó y qué se pagó, en un registro por cliente en vez de repartido entre un chat y un correo.",
        },
      ],
      faq: [
        {
          q: "¿Sirve para un despacho regulado?",
          a: "Maneja agenda, admisión, mensajería y pago. No es software de gestión de casos y no certifica ni valida las credenciales o cédulas de nadie. Tus obligaciones profesionales y regulatorias siguen siendo tuyas, igual que hoy.",
        },
        {
          q: "¿Los clientes pueden mandar documentos de forma segura?",
          a: "El cliente puede adjuntar archivos a la conversación, que queda en el registro de tu workspace. Tú juzgas si eso cumple el estándar que tu campo exige para un documento en particular.",
        },
        {
          q: "¿Puedo cobrar la primera consulta?",
          a: "Sí, o dejarla gratis. Lo defines por servicio, y puedes pedir el pago al agendar para que una consulta pagada quede saldada antes de apartar el tiempo.",
        },
        {
          q: "¿Cuánto cuesta?",
          a: "La página es gratis. En una cita pagada la tarifa es seis por ciento, tres del cliente y tres tuyos, con el procesamiento incluido. Igual en todos los planes.",
        },
      ],
    },
  },
];
