import { CASE_STUDY_PHOTOS } from "@/lib/marketing/photography";
import type { TalentCategory } from "./types";

export const CRAFT_CATEGORIES: TalentCategory[] = [
  {
    slug: "chefs",
    photo: CASE_STUDY_PHOTOS.chefs,
    related: ["musicians", "models", "photographers"],
    en: {
      eyebrow: "For private chefs",
      title: "A booking page for private chefs",
      subtitle:
        "Your menus, your service area, and a request that arrives with the date, the headcount, and the dietary notes.",
      intro:
        "A private dinner is quoted on details: how many guests, which menu, whose kitchen, what people cannot eat. Collecting that over messages takes a day and costs you bookings. A booking page collects it in one step and lets you answer with a real price.",
      steps: [
        {
          title: "Publish the menus",
          body: "Show what you cook and what each service includes, so clients arrive already knowing what they are asking for.",
        },
        {
          title: "Take the brief in one step",
          body: "Date, guest count, location, and dietary notes come in together, which is everything you need to quote.",
        },
        {
          title: "Quote, confirm, and get paid",
          body: "Send a priced offer for the menu they chose and take payment in the same conversation.",
        },
      ],
      faq: [
        {
          q: "Can I price per person instead of a flat fee?",
          a: "Yes. You write the offer, so you can price the way you actually work, per head or per service.",
        },
        {
          q: "Can I show different menus at different prices?",
          a: "Yes. Each service you offer can carry its own description and price on your page.",
        },
        {
          q: "Do I need my own website already?",
          a: "No. The page is the website. You get one free on a subdomain, and you can connect your own domain on a paid plan.",
        },
        {
          q: "How do I handle a client who cancels?",
          a: "Because payment happens on the booking, a confirmed date is a paid date rather than a verbal hold.",
        },
      ],
    },
    es: {
      eyebrow: "Para chefs privados",
      title: "Una página de reservas para chefs privados",
      subtitle:
        "Tus menús, tu zona de servicio y solicitudes que llegan con la fecha, el número de comensales y las restricciones.",
      intro:
        "Una cena privada se cotiza con detalles: cuántos invitados, qué menú, en qué cocina y qué no puede comer la gente. Juntar todo eso por mensajes toma un día y te cuesta reservas. Una página lo recoge en un paso y te deja responder con un precio real.",
      steps: [
        {
          title: "Publica los menús",
          body: "Muestra lo que cocinas y qué incluye cada servicio, para que el cliente llegue sabiendo qué está pidiendo.",
        },
        {
          title: "Recibe el brief completo",
          body: "Fecha, número de personas, lugar y restricciones llegan juntos, que es justo lo que necesitas para cotizar.",
        },
        {
          title: "Cotiza, confirma y cobra",
          body: "Mandas una oferta con precio por el menú que eligieron y cobras en la misma conversación.",
        },
      ],
      faq: [
        {
          q: "¿Puedo cobrar por persona en vez de precio fijo?",
          a: "Sí. Tú escribes la oferta, así que puedes cobrar como realmente trabajas, por persona o por servicio.",
        },
        {
          q: "¿Puedo mostrar varios menús con precios distintos?",
          a: "Sí. Cada servicio que ofreces puede llevar su propia descripción y precio en tu página.",
        },
        {
          q: "¿Necesito ya tener un sitio web?",
          a: "No. La página es el sitio. Tienes una gratis en un subdominio y puedes conectar tu dominio en un plan de pago.",
        },
        {
          q: "¿Qué pasa si el cliente cancela?",
          a: "Como el pago ocurre en la reserva, una fecha confirmada es una fecha pagada y no un apartado de palabra.",
        },
      ],
    },
  },
  {
    slug: "photographers",
    photo: CASE_STUDY_PHOTOS.wedding,
    related: ["models", "musicians", "chefs"],
    en: {
      eyebrow: "For photographers",
      title: "A booking page for photographers",
      subtitle:
        "Your portfolio, your packages, and enquiries that arrive with the date, the shoot type, and the usage already answered.",
      intro:
        "Photography enquiries stall on scope. A client asks what you charge, you ask what the shoot is for, and the thread dies before anyone names a date. A booking page asks for the shoot type, the date, and the usage up front, so your first reply can be a quote instead of a question.",
      steps: [
        {
          title: "Lead with the work",
          body: "A portfolio that loads fast and reads like a studio site, not a social feed you have to scroll.",
        },
        {
          title: "Publish your packages",
          body: "List what each session includes and what it costs, so price questions stop arriving in the inbox.",
        },
        {
          title: "Book it and take the retainer",
          body: "Send a priced offer for the package they picked and take payment in the booking conversation.",
        },
      ],
      faq: [
        {
          q: "Can I show different packages for weddings and portraits?",
          a: "Yes. Each service carries its own description and price, so different shoot types can be priced differently.",
        },
        {
          q: "Can I take a retainer before the shoot date?",
          a: "Yes. You send a priced offer and take payment in the booking chat, so the date is held against a payment.",
        },
        {
          q: "Is this a replacement for my portfolio site?",
          a: "It can be. The page is a real site with your work on it, and the booking flow is built in rather than bolted on.",
        },
        {
          q: "What happens after a client books?",
          a: "The booking, the messages, and the payment stay together in one record, so nothing lives only in your inbox.",
        },
      ],
    },
    es: {
      eyebrow: "Para fotógrafos",
      title: "Una página de reservas para fotógrafos",
      subtitle:
        "Tu portafolio, tus paquetes y solicitudes que llegan con la fecha, el tipo de sesión y el uso ya respondidos.",
      intro:
        "Las solicitudes de fotografía se atoran en el alcance. El cliente pregunta cuánto cobras, tú preguntas para qué es la sesión, y la conversación se muere antes de que alguien diga una fecha. Una página pide el tipo de sesión, la fecha y el uso desde el inicio, así tu primera respuesta es una cotización y no otra pregunta.",
      steps: [
        {
          title: "Que se vea el trabajo primero",
          body: "Un portafolio que carga rápido y se lee como el sitio de un estudio, no como un feed que hay que scrollear.",
        },
        {
          title: "Publica tus paquetes",
          body: "Di qué incluye cada sesión y cuánto cuesta, para que las preguntas de precio dejen de llegar al inbox.",
        },
        {
          title: "Reserva y cobra el anticipo",
          body: "Mandas una oferta con precio por el paquete que eligieron y cobras en la conversación de reserva.",
        },
      ],
      faq: [
        {
          q: "¿Puedo mostrar paquetes distintos para bodas y retratos?",
          a: "Sí. Cada servicio lleva su propia descripción y precio, así cada tipo de sesión se cobra distinto.",
        },
        {
          q: "¿Puedo cobrar anticipo antes de la sesión?",
          a: "Sí. Mandas una oferta con precio y cobras en el chat, así la fecha queda apartada contra un pago.",
        },
        {
          q: "¿Sustituye a mi sitio de portafolio?",
          a: "Puede hacerlo. La página es un sitio real con tu trabajo, y el flujo de reservas viene integrado, no pegado por fuera.",
        },
        {
          q: "¿Qué pasa después de que el cliente reserva?",
          a: "La reserva, los mensajes y el pago quedan juntos en un mismo registro, así nada vive solo en tu correo.",
        },
      ],
    },
  },
  {
    slug: "tattoo-artists",
    photo: CASE_STUDY_PHOTOS.tattoo,
    related: ["beauty", "photographers", "models"],
    en: {
      eyebrow: "For tattoo artists",
      title: "A booking page for tattoo artists",
      subtitle:
        "Your flash, your healed work, and requests that arrive with the placement, the size, and the reference.",
      intro:
        "Tattoo enquiries are half-formed by nature. Someone sends a screenshot with no size, no placement, and no budget, and you spend a day getting to a quote. A booking page asks for those three things first, so the conversation starts where it used to end.",
      steps: [
        {
          title: "Show flash and healed work",
          body: "Your available designs and how the work heals, which is what serious clients look for.",
        },
        {
          title: "Take a brief that can be quoted",
          body: "Placement, size, and reference images arrive with the request instead of three messages later.",
        },
        {
          title: "Book with a deposit",
          body: "Send a priced offer and take the deposit in the booking chat, so the chair time is held.",
        },
      ],
      faq: [
        {
          q: "Can I take a deposit to stop no-shows?",
          a: "Yes. The deposit is a priced offer paid in the booking chat, attached to the appointment.",
        },
        {
          q: "Can clients send reference images with the request?",
          a: "Yes. The request carries the reference along with placement and size.",
        },
        {
          q: "Does this replace my booking DMs?",
          a: "It replaces the part that wastes time. The conversation continues in one place, with the details already answered.",
        },
        {
          q: "What does it cost to start?",
          a: "Nothing. A free page on a free subdomain, with your own domain on a paid plan.",
        },
      ],
    },
    es: {
      eyebrow: "Para tatuadores",
      title: "Una página de reservas para tatuadores",
      subtitle:
        "Tu flash, tu trabajo cicatrizado y solicitudes que llegan con la zona, el tamaño y la referencia.",
      intro:
        "Las solicitudes de tatuaje llegan a medias por naturaleza. Alguien manda una captura sin tamaño, sin zona y sin presupuesto, y te lleva un día llegar a una cotización. Una página pide esas tres cosas primero, así la conversación empieza donde antes terminaba.",
      steps: [
        {
          title: "Muestra flash y trabajo cicatrizado",
          body: "Tus diseños disponibles y cómo cicatriza el trabajo, que es lo que mira un cliente serio.",
        },
        {
          title: "Recibe un brief que se pueda cotizar",
          body: "Zona, tamaño y referencias llegan con la solicitud y no tres mensajes después.",
        },
        {
          title: "Reserva con anticipo",
          body: "Mandas una oferta con precio y cobras el anticipo en el chat, así la silla queda apartada.",
        },
      ],
      faq: [
        {
          q: "¿Puedo cobrar anticipo para evitar que no lleguen?",
          a: "Sí. El anticipo es una oferta con precio que se paga en el chat y queda ligada a la cita.",
        },
        {
          q: "¿Pueden mandar imágenes de referencia con la solicitud?",
          a: "Sí. La solicitud lleva la referencia junto con la zona y el tamaño.",
        },
        {
          q: "¿Sustituye mis mensajes directos?",
          a: "Sustituye la parte que te hace perder tiempo. La conversación sigue en un solo lugar, con los datos ya resueltos.",
        },
        {
          q: "¿Cuánto cuesta empezar?",
          a: "Nada. Una página gratis en un subdominio gratis, y tu propio dominio en un plan de pago.",
        },
      ],
    },
  },
];
