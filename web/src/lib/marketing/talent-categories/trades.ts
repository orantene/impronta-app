import { CASE_STUDY_PHOTOS } from "@/lib/marketing/photography";
import type { TalentCategory } from "./types";

/**
 * Trades and professional services: the businesses onboarding now that the
 * site did not previously speak to.
 *
 * The nine original categories are all creative or talent work, so a laundry
 * owner opening our "is this for me" page saw a modelling roster. These four
 * cover the real incoming mix: a restaurant and a pizza maker, a laundry, a
 * jeweller, and an immigration office.
 *
 * TWO CONSTRAINTS RULED BY THE CEO, and both change what these pages may say.
 *
 * The MAKER page (jeweller) sells CUSTOM WORK through inquiry, quote and
 * deposit. It must never promise shipping, delivery, stock or returns:
 * physical fulfilment is not built, and "sell what you do, not what you ship"
 * is our own line. A maker is in scope because the commission is the work.
 *
 * The PROFESSIONAL SERVICES page (immigration office) is in scope as
 * appointment-booked expertise. The page has to say that plainly, because
 * "time, skill and craft" does not read as legal or advisory work unless the
 * page makes the connection for the reader.
 */
export const TRADE_CATEGORIES: TalentCategory[] = [
  {
    slug: "restaurants",
    photo: CASE_STUDY_PHOTOS.chefs,
    related: ["chefs", "cleaners", "barbers"],
    en: {
      eyebrow: "For restaurants and food businesses",
      title: "A booking page for restaurants",
      subtitle:
        "Your menu, your tables and your orders on one page. No commission per order to a delivery app, and no second website to keep in sync.",
      intro:
        "A restaurant usually ends up with three places its information lives: a menu somebody photographed once, a delivery app taking a cut of every order, and a social profile with the opening hours from two summers ago. Whichever one a customer finds is the one that speaks for you.",
      steps: [
        {
          title: "Put the real menu somewhere you control",
          body: "Dishes, prices and what changed this week, on a page you edit yourself. A QR code on the table opens the same menu, so it is never the printed one that went out of date.",
        },
        {
          title: "Take a table booking without a phone call",
          body: "Show the times you actually have, let people pick one, and decide whether it books instantly or waits for you. Ask for a deposit on the bookings where a no show costs you the evening.",
        },
        {
          title: "Take orders for the things worth taking orders for",
          body: "A catering tray, a cake for Saturday, a set menu for twelve. These are the orders that pay, and they arrive as a conversation you can quote on rather than a form you have to chase.",
        },
        {
          title: "One place that is actually current",
          body: "Change a price once and it changes on the page, the QR menu and the booking. Nobody has to remember the third place it was written down.",
        },
      ],
      faq: [
        {
          q: "Does this replace my delivery app?",
          a: "For your own customers, yes. Someone who already knows you can order or book direct instead of through an app that takes a percentage. We do not do the driving, so if you need couriers you still need them.",
        },
        {
          q: "Can customers pay a deposit for a big booking?",
          a: "Yes. You set which bookings ask for one and how much, and you keep it under the rules you set if nobody turns up.",
        },
        {
          q: "What does it cost?",
          a: "The page is free. On a paid booking or order the fee is six percent, three from the customer and three from you, with card processing included in that. The same on every plan.",
        },
        {
          q: "I run a pizza place out of my home kitchen. Is that too small?",
          a: "No. A page, a menu and a way to take an order is exactly the same job whether it is one oven or forty covers.",
        },
      ],
    },
    es: {
      eyebrow: "Para restaurantes y negocios de comida",
      title: "Una página de reservas para restaurantes",
      subtitle:
        "Tu menú, tus mesas y tus pedidos en una sola página. Sin comisión por pedido para una app de reparto, y sin un segundo sitio que mantener al día.",
      intro:
        "Un restaurante casi siempre termina con su información en tres lugares: un menú que alguien fotografió una vez, una app de reparto que se lleva una parte de cada pedido, y un perfil de redes con el horario de hace dos veranos. El que encuentre el cliente es el que habla por ti.",
      steps: [
        {
          title: "Pon el menú de verdad donde tú mandas",
          body: "Platillos, precios y lo que cambió esta semana, en una página que editas tú. Un código QR en la mesa abre ese mismo menú, así nunca es el impreso el que quedó viejo.",
        },
        {
          title: "Recibe una reserva de mesa sin una llamada",
          body: "Muestra los horarios que de verdad tienes, deja que elijan uno, y decide si se reserva al instante o si espera tu confirmación. Pide anticipo en las reservas donde una ausencia te cuesta la noche.",
        },
        {
          title: "Recibe pedidos de lo que sí vale la pena",
          body: "Una charola para un evento, un pastel para el sábado, un menú para doce personas. Esos son los pedidos que dejan, y llegan como una conversación que puedes cotizar en vez de un formulario que tienes que perseguir.",
        },
        {
          title: "Un solo lugar que sí está al día",
          body: "Cambias un precio una vez y cambia en la página, en el menú QR y en la reserva. Nadie tiene que acordarse del tercer lugar donde estaba escrito.",
        },
      ],
      faq: [
        {
          q: "¿Esto reemplaza mi app de reparto?",
          a: "Para tus propios clientes, sí. Quien ya te conoce puede pedir o reservar directo en vez de pasar por una app que se lleva un porcentaje. Nosotros no hacemos el reparto, así que si necesitas repartidores los sigues necesitando.",
        },
        {
          q: "¿Los clientes pueden dejar anticipo en una reserva grande?",
          a: "Sí. Tú defines qué reservas lo piden y de cuánto, y te lo quedas según las reglas que pusiste si no llegan.",
        },
        {
          q: "¿Cuánto cuesta?",
          a: "La página es gratis. En una reserva o pedido pagado la tarifa es seis por ciento, tres del cliente y tres tuyos, con el procesamiento incluido. Igual en todos los planes.",
        },
        {
          q: "Hago pizzas desde la cocina de mi casa. ¿Es muy chico?",
          a: "No. Una página, un menú y una forma de recibir un pedido es exactamente el mismo trabajo con un horno que con cuarenta comensales.",
        },
      ],
    },
  },

  {
    slug: "laundry",
    photo: CASE_STUDY_PHOTOS.villa,
    related: ["cleaners", "restaurants", "barbers"],
    en: {
      eyebrow: "For laundry and dry cleaning",
      title: "A booking page for laundry services",
      subtitle:
        "Pickups, drop offs and what each service costs, on one page. Customers book a slot instead of asking whether you are open.",
      intro:
        "Laundry runs on small repeated jobs from the same people, which is exactly the kind of work that disappears into a phone. A regular messages to ask if you can collect today, you say yes, and the record of it exists only in that chat.",
      steps: [
        {
          title: "Price by service, not by conversation",
          body: "Wash and fold, dry cleaning, ironing, a duvet. Each with its own price so nobody has to ask, and so you are not quoting the same job differently on a busy day.",
        },
        {
          title: "Let people book a pickup window",
          body: "Show the windows you actually collect in and let a customer take one. You decide whether it confirms instantly or waits for you to check the round.",
        },
        {
          title: "Keep the regulars on the page",
          body: "The same people come back every week. Their history, what they usually send and what they last paid all sit on their record instead of in a scroll.",
        },
        {
          title: "Take payment when the work is done",
          body: "Send the total through the same conversation and get paid without a trip to the counter, or take cash if that is how your customer pays.",
        },
      ],
      faq: [
        {
          q: "Most of my customers pay cash. Does that still work?",
          a: "Yes. The booking exists whether or not the money moves online, and cash is not a card payment so no fee applies to it.",
        },
        {
          q: "Can I limit how many pickups I take in a slot?",
          a: "Yes. You set what you can actually handle and the slot closes when it is full, so a round does not get overbooked.",
        },
        {
          q: "Do I need a website already?",
          a: "No. The page is the website. You get one on a free subdomain, and your own domain when you want one.",
        },
        {
          q: "What does it cost?",
          a: "The page is free. On a paid booking the fee is six percent, three from the customer and three from you, with card processing included.",
        },
      ],
    },
    es: {
      eyebrow: "Para lavandería y tintorería",
      title: "Una página de reservas para lavandería",
      subtitle:
        "Recolecciones, entregas y cuánto cuesta cada servicio, en una página. El cliente aparta un horario en vez de preguntar si estás abierto.",
      intro:
        "La lavandería vive de trabajos chicos y repetidos de la misma gente, que es justo el tipo de trabajo que se desaparece en un teléfono. Un cliente de siempre te escribe para preguntar si puedes pasar hoy, le dices que sí, y el único registro de eso queda en ese chat.",
      steps: [
        {
          title: "Cobra por servicio, no por conversación",
          body: "Lavado y doblado, tintorería, planchado, un edredón. Cada uno con su precio para que nadie tenga que preguntar, y para que no cotices el mismo trabajo distinto en un día ocupado.",
        },
        {
          title: "Deja que aparten una ventana de recolección",
          body: "Muestra las ventanas en las que de verdad pasas y deja que el cliente tome una. Tú decides si se confirma al instante o si espera a que revises la ruta.",
        },
        {
          title: "Ten a los de siempre en la página",
          body: "Es la misma gente cada semana. Su historial, lo que suele mandar y cuánto pagó la última vez viven en su registro, no en un scroll.",
        },
        {
          title: "Cobra cuando el trabajo está hecho",
          body: "Manda el total por la misma conversación y cobra sin que tengan que ir al mostrador, o recibe efectivo si así te paga tu cliente.",
        },
      ],
      faq: [
        {
          q: "Casi todos mis clientes pagan en efectivo. ¿Sirve igual?",
          a: "Sí. La reserva existe se haya movido o no el dinero en línea, y el efectivo no es un pago con tarjeta, así que no le aplica tarifa.",
        },
        {
          q: "¿Puedo limitar cuántas recolecciones acepto por horario?",
          a: "Sí. Defines lo que de verdad puedes con, y el horario se cierra cuando se llena, para que una ruta no se sobrecargue.",
        },
        {
          q: "¿Necesito ya un sitio web?",
          a: "No. La página es el sitio web. Te damos uno en un subdominio gratis, y tu propio dominio cuando lo quieras.",
        },
        {
          q: "¿Cuánto cuesta?",
          a: "La página es gratis. En una reserva pagada la tarifa es seis por ciento, tres del cliente y tres tuyos, con el procesamiento incluido.",
        },
      ],
    },
  },
];
