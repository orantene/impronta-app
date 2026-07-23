import {
  CASE_STUDY_PHOTOS,
  MARKETING_PHOTOS,
} from "@/lib/marketing/photography";
import type { TalentCategory } from "./types";

export const PERFORMING_CATEGORIES: TalentCategory[] = [
  {
    slug: "models",
    photo: CASE_STUDY_PHOTOS.models,
    related: ["photographers", "musicians", "chefs"],
    en: {
      eyebrow: "For models",
      title: "A booking page for models",
      subtitle:
        "Show the portfolio, publish your details once, and let clients send a real booking request instead of a DM.",
      intro:
        "Most freelance models lose work in the gap between interest and confirmation. A client likes the look, asks for rates, waits a day, and books someone else. A booking page closes that gap: the portfolio, the measurements, and the request form live at one link you control.",
      steps: [
        {
          title: "Publish the portfolio once",
          body: "A clean grid for your best work, plus the details clients always ask for. Update it in one place instead of re-sending files.",
        },
        {
          title: "Take a structured request",
          body: "Clients send the date, the shoot type, and the usage. You stop re-typing rates and availability in chat.",
        },
        {
          title: "Confirm and get paid",
          body: "Reply with a priced offer, take payment in the same conversation, and keep the booking on record.",
        },
      ],
      faq: [
        {
          q: "Do I need an agency to use this?",
          a: "No. The page is built for models working independently. If you later sign with an agency, your profile can be linked to their roster.",
        },
        {
          q: "Can I ask for a deposit before holding a date?",
          a: "Yes. You send a priced offer in the booking chat and take payment there, so a held date is a paid date.",
        },
        {
          q: "What does it cost to start?",
          a: "Nothing. You get a free page on a free subdomain. Connecting your own domain is a paid upgrade when you want it.",
        },
        {
          q: "Who can see my measurements and details?",
          a: "You choose what appears on the public page. Anything you keep private stays out of the public profile.",
        },
      ],
    },
    es: {
      eyebrow: "Para modelos",
      title: "Una página de reservas para modelos",
      subtitle:
        "Muestra tu portafolio, publica tus datos una sola vez y recibe solicitudes reales en lugar de mensajes sueltos.",
      intro:
        "La mayoría de las modelos independientes pierde trabajo en el hueco entre el interés y la confirmación. Al cliente le gusta tu perfil, pregunta tarifas, espera un día y termina reservando a alguien más. Una página de reservas cierra ese hueco: el portafolio, las medidas y el formulario viven en un solo enlace que tú controlas.",
      steps: [
        {
          title: "Publica el portafolio una vez",
          body: "Una galería limpia con tu mejor trabajo y los datos que siempre te piden. Se actualiza en un solo lugar, sin reenviar archivos.",
        },
        {
          title: "Recibe solicitudes ordenadas",
          body: "El cliente manda la fecha, el tipo de sesión y el uso de las imágenes. Dejas de teclear tarifas y disponibilidad en cada chat.",
        },
        {
          title: "Confirma y cobra",
          body: "Respondes con una oferta con precio, cobras en la misma conversación y la reserva queda registrada.",
        },
      ],
      faq: [
        {
          q: "¿Necesito una agencia para usarlo?",
          a: "No. La página está pensada para modelos que trabajan por su cuenta. Si más adelante firmas con una agencia, tu perfil se puede vincular a su roster.",
        },
        {
          q: "¿Puedo pedir anticipo antes de apartar una fecha?",
          a: "Sí. Mandas una oferta con precio en el chat de reserva y cobras ahí mismo, así una fecha apartada es una fecha pagada.",
        },
        {
          q: "¿Cuánto cuesta empezar?",
          a: "Nada. Tienes una página gratis en un subdominio gratis. Conectar tu propio dominio es una mejora de pago cuando la quieras.",
        },
        {
          q: "¿Quién puede ver mis medidas y datos?",
          a: "Tú eliges qué aparece en la página pública. Lo que dejes privado no se muestra en el perfil.",
        },
      ],
    },
  },
  {
    slug: "musicians",
    photo: CASE_STUDY_PHOTOS.singer,
    related: ["models", "photographers", "chefs"],
    en: {
      eyebrow: "For singers and musicians",
      title: "A booking page for singers and musicians",
      subtitle:
        "Your music, your set list, and a request form that asks for the date, the venue, and the set length up front.",
      intro:
        "Gig enquiries arrive with half the information missing. You reply asking how long the set is, whether there is a PA, and what the budget looks like, and three messages later the date is gone. A booking page asks those questions for you, before the conversation starts.",
      steps: [
        {
          title: "Put the music where clients land",
          body: "Embed your tracks and video, list what you play, and make the whole thing shareable as one link.",
        },
        {
          title: "Get the gig details up front",
          body: "Date, venue, and set length arrive with the request, so your first reply can already have a price on it.",
        },
        {
          title: "Lock the date with a deposit",
          body: "Send a priced offer and take payment in the booking chat, so the date is held by money and not by memory.",
        },
      ],
      faq: [
        {
          q: "Does this work for a band, not just a solo act?",
          a: "Yes. The page represents the act that gets booked, whether that is you alone or a group you lead.",
        },
        {
          q: "Can clients book me for a wedding through this?",
          a: "Yes. Event work is the common case: the request carries the date and venue, and you reply with a priced offer.",
        },
        {
          q: "How do I get paid for a gig?",
          a: "Payment happens in the same booking conversation, so the deposit and the balance stay attached to the job.",
        },
        {
          q: "Can I use my own domain?",
          a: "Yes, on a paid plan. You can start free on a subdomain and connect a domain later without rebuilding the page.",
        },
      ],
    },
    es: {
      eyebrow: "Para cantantes y músicos",
      title: "Una página de reservas para cantantes y músicos",
      subtitle:
        "Tu música, tu repertorio y un formulario que pide la fecha, el lugar y la duración del set desde el principio.",
      intro:
        "Las solicitudes de tocadas llegan con la mitad de la información. Contestas preguntando cuánto dura el set, si hay equipo de sonido y cuál es el presupuesto, y tres mensajes después la fecha ya se fue. Una página de reservas hace esas preguntas por ti, antes de que empiece la conversación.",
      steps: [
        {
          title: "Pon la música donde llega el cliente",
          body: "Integra tus rolas y videos, describe lo que tocas y comparte todo con un solo enlace.",
        },
        {
          title: "Pide los datos desde el inicio",
          body: "La fecha, el lugar y la duración llegan con la solicitud, así tu primera respuesta ya puede llevar precio.",
        },
        {
          title: "Aparta la fecha con anticipo",
          body: "Mandas una oferta con precio y cobras en el chat, para que la fecha quede apartada con dinero y no de palabra.",
        },
      ],
      faq: [
        {
          q: "¿Sirve para una banda o solo para solistas?",
          a: "Sirve para los dos. La página representa al acto que se contrata, seas tú solo o un grupo que tú lideras.",
        },
        {
          q: "¿Me pueden contratar para una boda por aquí?",
          a: "Sí. Los eventos son el caso más común: la solicitud trae la fecha y el lugar, y tú respondes con una oferta con precio.",
        },
        {
          q: "¿Cómo cobro una tocada?",
          a: "El pago ocurre en la misma conversación de reserva, así el anticipo y el resto quedan ligados al trabajo.",
        },
        {
          q: "¿Puedo usar mi propio dominio?",
          a: "Sí, en un plan de pago. Puedes empezar gratis en un subdominio y conectar tu dominio después sin rehacer la página.",
        },
      ],
    },
  },
  {
    slug: "dancers",
    photo: MARKETING_PHOTOS.heroPerform,
    related: ["musicians", "models", "photographers"],
    en: {
      eyebrow: "For dancers and performers",
      title: "A booking page for dancers and performers",
      subtitle:
        "Your reel, your acts, and a request that arrives with the date, the venue, and the run time.",
      intro:
        "Performance work is booked on specifics: how many dancers, how long the set, whether there is a stage and a changing room. Answering that over messages costs you the booking. A booking page asks it once and lets you reply with a price.",
      steps: [
        {
          title: "Lead with the reel",
          body: "Video first, then the acts you perform and the formats you offer, all at one link.",
        },
        {
          title: "Get the event details up front",
          body: "Date, venue, run time, and group size arrive with the request, so nothing is guessed.",
        },
        {
          title: "Confirm with a paid hold",
          body: "Send a priced offer and take payment in the booking chat so the date is properly held.",
        },
      ],
      faq: [
        {
          q: "Can I book as a group, not just solo?",
          a: "Yes. The page represents the act being booked, whether that is you or a troupe you lead.",
        },
        {
          q: "Can I list different act lengths and prices?",
          a: "Yes. Each act or format can carry its own description and price.",
        },
        {
          q: "How do I stop clients holding a date and vanishing?",
          a: "Payment happens on the booking, so a confirmed date is paid rather than a verbal hold.",
        },
        {
          q: "What does it cost to start?",
          a: "Nothing. A free page on a free subdomain, with your own domain available on a paid plan.",
        },
      ],
    },
    es: {
      eyebrow: "Para bailarines y performers",
      title: "Una página de reservas para bailarines y performers",
      subtitle:
        "Tu reel, tus actos y solicitudes que llegan con la fecha, el lugar y la duración.",
      intro:
        "El trabajo de performance se contrata con detalles: cuántos bailarines, cuánto dura el show, si hay escenario y camerino. Resolver eso por mensajes te cuesta la reserva. Una página lo pregunta una vez y te deja responder con un precio.",
      steps: [
        {
          title: "Que el reel vaya primero",
          body: "Video primero, luego los actos que haces y los formatos que ofreces, todo en un enlace.",
        },
        {
          title: "Pide los datos del evento",
          body: "Fecha, lugar, duración y tamaño del grupo llegan con la solicitud, sin adivinar nada.",
        },
        {
          title: "Confirma con un apartado pagado",
          body: "Mandas una oferta con precio y cobras en el chat, así la fecha queda bien apartada.",
        },
      ],
      faq: [
        {
          q: "¿Puedo reservar como grupo y no solo como solista?",
          a: "Sí. La página representa al acto que se contrata, seas tú o una compañía que lideras.",
        },
        {
          q: "¿Puedo listar actos de distinta duración y precio?",
          a: "Sí. Cada acto o formato puede llevar su propia descripción y precio.",
        },
        {
          q: "¿Cómo evito que aparten la fecha y desaparezcan?",
          a: "El pago ocurre en la reserva, así una fecha confirmada está pagada y no apartada de palabra.",
        },
        {
          q: "¿Cuánto cuesta empezar?",
          a: "Nada. Una página gratis en un subdominio gratis, y tu propio dominio en un plan de pago.",
        },
      ],
    },
  },
];
