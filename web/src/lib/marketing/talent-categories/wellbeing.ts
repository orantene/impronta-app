import { CASE_STUDY_PHOTOS } from "@/lib/marketing/photography";
import type { TalentCategory } from "./types";

export const WELLBEING_CATEGORIES: TalentCategory[] = [
  {
    slug: "beauty",
    photo: CASE_STUDY_PHOTOS.salon,
    related: ["models", "photographers", "wellness"],
    en: {
      eyebrow: "For makeup artists and stylists",
      title: "A booking page for makeup artists and stylists",
      subtitle:
        "Your portfolio, your services, and requests that arrive with the date, the look, and the number of people.",
      intro:
        "Bridal and editorial work lives or dies on the details: how many faces, what time is call, is it on location. A booking page collects that with the request so your first reply can be a real quote instead of another question.",
      steps: [
        {
          title: "Show the work by service",
          body: "Bridal, editorial, events. Each with its own images so clients see the look they are booking.",
        },
        {
          title: "Ask the questions that set the price",
          body: "Date, call time, number of people, and location come in together with the request.",
        },
        {
          title: "Quote and take the deposit",
          body: "Send a priced offer for the service they chose and take payment in the same conversation.",
        },
      ],
      faq: [
        {
          q: "Can I price per person for a bridal party?",
          a: "Yes. You write the offer, so you can price per face, per hour, or per package.",
        },
        {
          q: "Can I charge for travel to a location?",
          a: "Yes. The offer is yours to write, so travel can be a line in the price you send.",
        },
        {
          q: "Do I need a separate website?",
          a: "No. The page is the site, free on a subdomain, with your own domain on a paid plan.",
        },
        {
          q: "How do I handle a client who reschedules?",
          a: "The booking, the messages, and the payment stay in one record, so the history is never in doubt.",
        },
      ],
    },
    es: {
      eyebrow: "Para maquillistas y estilistas",
      title: "Una página de reservas para maquillistas y estilistas",
      subtitle:
        "Tu portafolio, tus servicios y solicitudes que llegan con la fecha, el look y cuántas personas son.",
      intro:
        "El trabajo de novias y editorial depende de los detalles: cuántas personas, a qué hora es el llamado, si es en locación. Una página recoge eso junto con la solicitud, así tu primera respuesta es una cotización real y no otra pregunta.",
      steps: [
        {
          title: "Muestra el trabajo por servicio",
          body: "Novias, editorial, eventos. Cada uno con sus imágenes para que el cliente vea el look que contrata.",
        },
        {
          title: "Pregunta lo que define el precio",
          body: "Fecha, hora de llamado, número de personas y locación llegan juntos con la solicitud.",
        },
        {
          title: "Cotiza y cobra el anticipo",
          body: "Mandas una oferta con precio por el servicio elegido y cobras en la misma conversación.",
        },
      ],
      faq: [
        {
          q: "¿Puedo cobrar por persona para un cortejo de novia?",
          a: "Sí. Tú escribes la oferta, así que puedes cobrar por persona, por hora o por paquete.",
        },
        {
          q: "¿Puedo cobrar el traslado a una locación?",
          a: "Sí. La oferta la escribes tú, así que el traslado puede ser una línea más del precio.",
        },
        {
          q: "¿Necesito un sitio web aparte?",
          a: "No. La página es el sitio, gratis en un subdominio, y tu propio dominio en un plan de pago.",
        },
        {
          q: "¿Qué pasa si el cliente cambia la fecha?",
          a: "La reserva, los mensajes y el pago quedan en un mismo registro, así el historial nunca se pierde.",
        },
      ],
    },
  },
  {
    slug: "coaches",
    photo: CASE_STUDY_PHOTOS.fitness,
    related: ["wellness", "dancers", "musicians"],
    en: {
      eyebrow: "For coaches and trainers",
      title: "A booking page for coaches and trainers",
      subtitle:
        "Your programs, your availability, and clients who book and pay without a back and forth.",
      intro:
        "Coaching income leaks in the gap between a keen client and a confirmed session. If booking means agreeing a time in chat and chasing payment afterwards, some of those sessions never happen. A page where the program is priced and bookable closes that gap.",
      steps: [
        {
          title: "Publish the programs",
          body: "Single sessions, blocks, or ongoing coaching, each with what it includes and what it costs.",
        },
        {
          title: "Let clients ask properly",
          body: "The request carries the goal, the format, and the timing, so you can answer once.",
        },
        {
          title: "Confirm and take payment",
          body: "Send a priced offer for the program they picked and take payment in the same conversation.",
        },
      ],
      faq: [
        {
          q: "Can I sell a block of sessions, not just one?",
          a: "Yes. Each program can be priced however you sell it, single or as a block.",
        },
        {
          q: "Does this work for online coaching?",
          a: "Yes. The flow is the same whether the session is in person or remote.",
        },
        {
          q: "How do clients pay?",
          a: "In the booking conversation, against the offer you sent, so payment and session stay linked.",
        },
        {
          q: "Can I use my own domain?",
          a: "Yes, on a paid plan. Start free on a subdomain and connect a domain when you want.",
        },
      ],
    },
    es: {
      eyebrow: "Para coaches y entrenadores",
      title: "Una página de reservas para coaches y entrenadores",
      subtitle:
        "Tus programas, tu disponibilidad y clientes que reservan y pagan sin tanta ida y vuelta.",
      intro:
        "El ingreso del coaching se fuga en el hueco entre un cliente interesado y una sesión confirmada. Si reservar significa acordar hora por chat y después perseguir el pago, algunas de esas sesiones nunca ocurren. Una página donde el programa ya tiene precio y se puede reservar cierra ese hueco.",
      steps: [
        {
          title: "Publica los programas",
          body: "Sesiones sueltas, paquetes o acompañamiento continuo, cada uno con qué incluye y cuánto cuesta.",
        },
        {
          title: "Deja que pregunten bien",
          body: "La solicitud trae el objetivo, el formato y los horarios, así respondes una sola vez.",
        },
        {
          title: "Confirma y cobra",
          body: "Mandas una oferta con precio por el programa elegido y cobras en la misma conversación.",
        },
      ],
      faq: [
        {
          q: "¿Puedo vender un paquete de sesiones y no solo una?",
          a: "Sí. Cada programa se cobra como tú lo vendes, suelto o por paquete.",
        },
        {
          q: "¿Sirve para coaching en línea?",
          a: "Sí. El flujo es el mismo, sea presencial o remoto.",
        },
        {
          q: "¿Cómo pagan los clientes?",
          a: "En la conversación de reserva, contra la oferta que mandaste, así pago y sesión quedan ligados.",
        },
        {
          q: "¿Puedo usar mi propio dominio?",
          a: "Sí, en un plan de pago. Empiezas gratis en un subdominio y conectas tu dominio cuando quieras.",
        },
      ],
    },
  },
  {
    slug: "wellness",
    photo: CASE_STUDY_PHOTOS.massage,
    related: ["coaches", "beauty", "chefs"],
    en: {
      eyebrow: "For massage and wellness pros",
      title: "A booking page for massage and wellness pros",
      subtitle:
        "Your treatments, your rates, and appointments that are booked and paid rather than pencilled in.",
      intro:
        "Wellness work is repeat business, and repeat business dies from friction. If every appointment needs a message thread to arrange and another to get paid, clients drift. A page that lists the treatments and takes the booking keeps the calendar honest.",
      steps: [
        {
          title: "List the treatments",
          body: "What each session is, how long it runs, and what it costs, so nobody has to ask.",
        },
        {
          title: "Take the booking cleanly",
          body: "The request carries the treatment, the date, and where it happens, in one step.",
        },
        {
          title: "Get paid on the appointment",
          body: "Send a priced offer and take payment in the booking chat, so the slot is properly held.",
        },
      ],
      faq: [
        {
          q: "Can I offer both in-studio and mobile visits?",
          a: "Yes. Each treatment can describe where it happens and be priced accordingly.",
        },
        {
          q: "Can I take payment up front?",
          a: "Yes. Payment happens against the offer in the booking chat, so the slot is held by a payment.",
        },
        {
          q: "Is this useful for repeat clients?",
          a: "Yes. Each booking keeps its own record of messages and payment, so history is never lost.",
        },
        {
          q: "What does it cost to start?",
          a: "Nothing. A free page on a free subdomain, with your own domain on a paid plan.",
        },
      ],
    },
    es: {
      eyebrow: "Para masajistas y bienestar",
      title: "Una página de reservas para masajistas y bienestar",
      subtitle:
        "Tus tratamientos, tus tarifas y citas que quedan reservadas y pagadas, no apuntadas a lápiz.",
      intro:
        "El bienestar vive de la clientela que regresa, y esa clientela se pierde por fricción. Si cada cita necesita una conversación para agendarse y otra para cobrarse, la gente se va. Una página que lista los tratamientos y toma la reserva mantiene la agenda honesta.",
      steps: [
        {
          title: "Lista los tratamientos",
          body: "Qué es cada sesión, cuánto dura y cuánto cuesta, para que nadie tenga que preguntar.",
        },
        {
          title: "Recibe la reserva completa",
          body: "La solicitud trae el tratamiento, la fecha y el lugar, en un solo paso.",
        },
        {
          title: "Cobra en la cita",
          body: "Mandas una oferta con precio y cobras en el chat, así el horario queda bien apartado.",
        },
      ],
      faq: [
        {
          q: "¿Puedo ofrecer en estudio y a domicilio?",
          a: "Sí. Cada tratamiento puede describir dónde ocurre y cobrarse en consecuencia.",
        },
        {
          q: "¿Puedo cobrar por adelantado?",
          a: "Sí. El pago va contra la oferta en el chat de reserva, así el horario queda apartado con un pago.",
        },
        {
          q: "¿Sirve para clientes que regresan?",
          a: "Sí. Cada reserva guarda su propio registro de mensajes y pago, así el historial nunca se pierde.",
        },
        {
          q: "¿Cuánto cuesta empezar?",
          a: "Nada. Una página gratis en un subdominio gratis, y tu propio dominio en un plan de pago.",
        },
      ],
    },
  },
];
