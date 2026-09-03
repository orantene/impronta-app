import { CASE_STUDY_PHOTOS } from "@/lib/marketing/photography";
import type { TalentCategory } from "./types";

/**
 * Service trades: work sold by the visit rather than by the shoot or the gig.
 *
 * The other three groups cover people booked for an event. These two are
 * booked for a Tuesday, repeatedly, by the same clients, which changes what
 * the page has to argue: not "how do I get discovered" but "how do I stop
 * running my week through WhatsApp".
 *
 * Both are gaps the geographic expansion work identified. Cleaning was called
 * out as probably the highest return opportunity in that analysis, and the
 * barber shop is the persona this product has been designed around from the
 * beginning without ever having a page.
 *
 * Every claim is checked against the shipped product, as `types.ts` requires.
 * Online booking went live this week, so these pages may reference a calendar;
 * they would have been lying to say so a fortnight ago.
 */
export const SERVICE_CATEGORIES: TalentCategory[] = [
  {
    slug: "cleaners",
    photo: CASE_STUDY_PHOTOS.villa,
    related: ["chefs", "coaches", "beauty"],
    en: {
      eyebrow: "For cleaners and property services",
      title: "A booking page for cleaners",
      subtitle:
        "Stop running your week through WhatsApp. Put your services and your hours on one page, take the booking, and get paid without chasing anyone.",
      intro:
        "Most cleaning work arrives as a message. Someone asks if you are free Thursday, you scroll back to check, you agree a price from memory, and three weeks later you are trying to remember who still owes you. It works until you have enough clients that it does not.",
      steps: [
        {
          title: "Price the work the way you actually sell it",
          body: "A one bedroom is not a four bedroom, and a move out clean is not a weekly. List each as its own service with its own price and its own duration, so nobody has to ask what it costs.",
        },
        {
          title: "Put your hours online and let people pick",
          body: "Show the times you actually work. A client picks a real slot instead of asking whether Thursday works, and you decide whether it books instantly, waits for your approval, or needs a deposit first.",
        },
        {
          title: "Take the deposit up front",
          body: "A no show on a two hour job is two hours you cannot sell again. Ask for a deposit when the service needs one, and keep it under the rules you set.",
        },
        {
          title: "Keep the regulars without keeping a spreadsheet",
          body: "Every booking and every message stays on the client's record, so you can see who books what, how often, and what they last paid, without scrolling through a year of chat.",
        },
      ],
      faq: [
        {
          q: "Do my clients need to download anything?",
          a: "No. They open a link, pick a time, and pay. No app, no account, no password to reset.",
        },
        {
          q: "Can I still take cash?",
          a: "Yes. Not everything runs through a card, and the booking still exists whether or not the money moved online.",
        },
        {
          q: "What does it cost?",
          a: "The page is free. When you take a paid booking the fee is six percent, three from the client and three from you, with card processing included in that. It does not change by plan.",
        },
        {
          q: "I work with two other cleaners. Does that work?",
          a: "Yes, and it does not cost more per person. Add them, and the calendar covers all of you.",
        },
      ],
    },
    es: {
      eyebrow: "Para limpieza y servicios de propiedad",
      title: "Una página de reservas para limpieza",
      subtitle:
        "Deja de llevar tu semana por WhatsApp. Pon tus servicios y tus horarios en una página, recibe la reserva y cobra sin andar persiguiendo a nadie.",
      intro:
        "Casi todo el trabajo de limpieza llega por mensaje. Alguien pregunta si tienes libre el jueves, tú te pones a buscar hacia arriba en el chat, acuerdas un precio de memoria, y tres semanas después estás tratando de acordarte de quién te quedó debiendo. Funciona hasta que tienes suficientes clientes para que deje de funcionar.",
      steps: [
        {
          title: "Cobra el trabajo como de verdad lo vendes",
          body: "Una recámara no es lo mismo que cuatro, y una limpieza de salida no es una semanal. Pon cada una como su propio servicio, con su precio y su duración, para que nadie tenga que preguntar cuánto cuesta.",
        },
        {
          title: "Pon tus horarios en línea y deja que elijan",
          body: "Muestra las horas en las que de verdad trabajas. El cliente escoge un horario real en lugar de preguntarte si puedes el jueves, y tú decides si se reserva al instante, si espera tu aprobación, o si primero necesita anticipo.",
        },
        {
          title: "Cobra el anticipo por adelantado",
          body: "Que no lleguen a un trabajo de dos horas son dos horas que ya no puedes vender. Pide anticipo cuando el servicio lo amerite, y quédatelo según las reglas que tú pusiste.",
        },
        {
          title: "Conserva a los de siempre sin llevar una hoja de cálculo",
          body: "Cada reserva y cada mensaje se queda en el registro del cliente, así ves quién reserva qué, cada cuándo, y cuánto pagó la última vez, sin revisar un año de chat.",
        },
      ],
      faq: [
        {
          q: "¿Mis clientes tienen que descargar algo?",
          a: "No. Abren un enlace, escogen una hora y pagan. Sin app, sin cuenta, sin contraseña que recuperar.",
        },
        {
          q: "¿Puedo seguir cobrando en efectivo?",
          a: "Sí. No todo pasa por tarjeta, y la reserva existe igual, se haya movido o no el dinero en línea.",
        },
        {
          q: "¿Cuánto cuesta?",
          a: "La página es gratis. Cuando recibes una reserva pagada la tarifa es seis por ciento, tres del cliente y tres tuyos, con el procesamiento de tarjeta incluido en ese número. No cambia según el plan.",
        },
        {
          q: "Trabajo con otras dos personas. ¿Sirve igual?",
          a: "Sí, y no cuesta más por persona. Agrégalas y el calendario las cubre a todas.",
        },
      ],
    },
  },

  {
    slug: "barbers",
    photo: CASE_STUDY_PHOTOS.salon,
    related: ["beauty", "tattoo-artists", "wellness"],
    en: {
      eyebrow: "For barbers and barbershops",
      title: "A booking page for barbers",
      subtitle:
        "Your chair, online. Clients pick a real time, you decide the rules, and the whole shop runs off one calendar.",
      intro:
        "A barbershop already has a booking system. It is your phone, your memory, and a notebook by the till. That system works right up until two people think they have the same four o'clock.",
      steps: [
        {
          title: "List every service with its own time",
          body: "A skin fade is not a beard trim. Give each one its real duration so the calendar stops double booking you, and price them where clients can see.",
        },
        {
          title: "Decide how each service books",
          body: "Some cuts can book instantly. A long appointment might need your approval, or a deposit first. You set that per service rather than for the whole shop.",
        },
        {
          title: "One calendar for every chair",
          body: "Add the other barbers. Clients can pick a person or just pick a time, and nobody has to check with anyone before saying yes.",
        },
        {
          title: "Get a website, not just a booking link",
          body: "Your own page with your work, your prices and your hours on it, on your own domain when you want one. Not a profile inside somebody else's app.",
        },
      ],
      faq: [
        {
          q: "Can I stop last minute bookings?",
          a: "Yes. Set the minimum notice you want and the slot closes that many hours ahead. You also set how far in advance people can book.",
        },
        {
          q: "What happens when someone does not show up?",
          a: "If the service asked for a deposit, you keep it under the rules you set. You can also mark the booking as a no show so your history stays honest.",
        },
        {
          q: "Do I pay per barber?",
          a: "No. There is no per seat fee. Adding people to the shop does not change what you pay.",
        },
        {
          q: "What does it cost?",
          a: "The page is free. On a paid booking the fee is six percent, three from the client and three from you, with card processing included. The same on every plan.",
        },
      ],
    },
    es: {
      eyebrow: "Para barberos y barberías",
      title: "Una página de reservas para barberos",
      subtitle:
        "Tu silla, en línea. El cliente escoge una hora real, tú pones las reglas, y toda la barbería corre con un solo calendario.",
      intro:
        "Una barbería ya tiene sistema de reservas. Es tu teléfono, tu memoria y una libreta junto a la caja. Ese sistema funciona perfecto hasta que dos personas creen que tienen las cuatro de la tarde.",
      steps: [
        {
          title: "Pon cada servicio con su propio tiempo",
          body: "Un fade no es un arreglo de barba. Dale a cada uno su duración real para que el calendario deje de empalmarte, y pon los precios donde el cliente los vea.",
        },
        {
          title: "Decide cómo se reserva cada servicio",
          body: "Algunos cortes pueden reservarse al instante. Una cita larga quizá necesite tu aprobación, o anticipo primero. Eso lo defines por servicio, no para toda la barbería.",
        },
        {
          title: "Un calendario para todas las sillas",
          body: "Agrega a los demás barberos. El cliente puede escoger persona o solo escoger hora, y nadie tiene que preguntarle a nadie antes de decir que sí.",
        },
        {
          title: "Ten un sitio web, no nada más un enlace de reservas",
          body: "Tu propia página con tu trabajo, tus precios y tus horarios, en tu propio dominio cuando lo quieras. No un perfil dentro de la app de alguien más.",
        },
      ],
      faq: [
        {
          q: "¿Puedo evitar reservas de último minuto?",
          a: "Sí. Defines el aviso mínimo y el horario se cierra esas horas antes. También defines con cuánta anticipación se puede reservar.",
        },
        {
          q: "¿Qué pasa si alguien no llega?",
          a: "Si el servicio pidió anticipo, te lo quedas según las reglas que pusiste. También puedes marcar la reserva como ausencia para que tu historial siga siendo real.",
        },
        {
          q: "¿Pago por cada barbero?",
          a: "No. No cobramos por persona. Agregar gente a la barbería no cambia lo que pagas.",
        },
        {
          q: "¿Cuánto cuesta?",
          a: "La página es gratis. En una reserva pagada la tarifa es seis por ciento, tres del cliente y tres tuyos, con el procesamiento incluido. Igual en todos los planes.",
        },
      ],
    },
  },
];
