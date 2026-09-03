import type { HelpGuideRoleContent } from "./help-guides-types";

/**
 * Help guides for businesses that sell their own work, not a roster.
 *
 * Every guide on /help was written for the talent-agency shape: rosters,
 * profiles, commission splits, representing other people. A restaurant owner
 * who opens support today is handed instructions for a business they do not
 * run, which is worse than an empty page — it tells them they are in the wrong
 * product. These three cover the shapes that are actually onboarding.
 *
 * They are also the first guides with Spanish bodies. The rest of /help is
 * English-only, and the guest AI corpus deliberately drops English guides from
 * the Spanish grounding rather than answer a Spanish visitor out of an English
 * source. Because these are authored here rather than translated later, they
 * carry `es` and reach Spanish visitors on day one.
 *
 * Nothing here promises behaviour the product does not have. Where the system
 * genuinely does not do something — chasing a no-show, say — the guide says so
 * plainly. A guide that oversells generates the support ticket it was written
 * to prevent.
 */

export const RESTAURANTS: HelpGuideRoleContent = {
  title: "Help for restaurants, cafés and food businesses",
  intro:
    "You cook, people order. Tulala gives you a page with your real menu on it, orders that arrive in one inbox instead of six chat apps, and a record of what was ordered and whether it was paid. The free plan stays free until you outgrow it.",
  guides: [
    {
      heading: "Claim your page",
      body:
        'Go to /get-started, enter your name and email, and pick your link (for example tulala.digital/your-place). The page is live immediately, with no card and no review queue. You can point your own domain at it later from Settings without changing anything else.',
    },
    {
      heading: "Build a menu people can order from",
      body:
        'Open Menu in your workspace and add each dish with a name, price and photo. Group them into sections the way your printed menu is grouped. One thing to watch when you edit your site: the Add gallery has two menu blocks. "Menu — orderable" is the one connected to your real items and the order button. "Menu — display only" is decoration; it looks right and takes no orders.',
    },
    {
      heading: "Take your first order",
      body:
        "When someone orders, it arrives in Messages as a thread with the lines, quantities and total already written out, and it shows up in Bookings. You accept or decline it there. Nothing is hidden behind a separate orders app, and nothing depends on you seeing a notification in time.",
    },
    {
      heading: "Sell a limited number of something",
      body:
        "Set a quantity on an item (twelve seats at a cooking class, forty portions of the Sunday special) and Tulala holds each one as it is ordered. When they run out, the item stops accepting orders on its own. If an order is declined or cancelled, its portions go back into the pool.",
    },
    {
      heading: "Get paid",
      body:
        "Connect Stripe from Settings and each accepted order can carry a payment request. Card payments settle to your Stripe account. Cash is not a Stripe method — if someone pays at the counter, mark the order paid yourself so your totals stay honest.",
    },
  ],
  ctaPrimary: { label: "Start free", href: "/get-started?audience=restaurant" },
  es: {
    title: "Ayuda para restaurantes, cafeterías y negocios de comida",
    intro:
      "Tú cocinas, la gente pide. Tulala te da una página con tu menú real, pedidos que llegan a una sola bandeja en vez de a seis chats, y un registro de qué se pidió y si se pagó. El plan gratuito sigue siendo gratuito hasta que se te quede corto.",
    guides: [
      {
        heading: "Reclama tu página",
        body:
          "Entra en /get-started, pon tu nombre y tu correo, y elige tu enlace (por ejemplo tulala.digital/tu-local). La página queda publicada al momento, sin tarjeta y sin cola de revisión. Más adelante puedes apuntar tu propio dominio desde Ajustes sin cambiar nada más.",
      },
      {
        heading: "Arma un menú desde el que se pueda pedir",
        body:
          'Abre Menú en tu espacio de trabajo y añade cada plato con nombre, precio y foto. Agrúpalos como los tienes en la carta impresa. Ojo al editar tu sitio: en la galería hay dos bloques de menú. "Menú — con pedidos" es el que está conectado a tus platos y al botón de pedir. "Menú — solo mostrar" es decorativo: se ve bien y no recibe ningún pedido.',
      },
      {
        heading: "Recibe tu primer pedido",
        body:
          "Cuando alguien pide, el pedido llega a Mensajes como una conversación con las líneas, las cantidades y el total ya escritos, y aparece en Reservas. Ahí lo aceptas o lo rechazas. No hay una app de pedidos aparte, y no depende de que veas una notificación a tiempo.",
      },
      {
        heading: "Vende una cantidad limitada de algo",
        body:
          "Ponle una cantidad a un plato (doce plazas en un taller de cocina, cuarenta raciones del especial del domingo) y Tulala va apartando cada una según se pide. Cuando se acaban, el plato deja de aceptar pedidos solo. Si un pedido se rechaza o se cancela, sus raciones vuelven a estar disponibles.",
      },
      {
        heading: "Cobra",
        body:
          "Conecta Stripe desde Ajustes y cada pedido aceptado puede llevar una solicitud de pago. Los pagos con tarjeta llegan a tu cuenta de Stripe. El efectivo no es un método de Stripe: si alguien paga en el mostrador, marca tú el pedido como pagado para que tus totales sigan siendo reales.",
      },
    ],
  },
};

export const SALONS: HelpGuideRoleContent = {
  title: "Help for salons, barbers and wellness studios",
  intro:
    "Your product is time. Tulala publishes what you offer and how long it takes, puts your availability on one calendar, and turns \"are you free Thursday?\" into a booking you can see instead of a message you have to remember.",
  guides: [
    {
      heading: "Claim your page",
      body:
        "Go to /get-started, enter your name and email, and pick your link. The page is live immediately, no card required. Add your address, hours and photos from your workspace, and point your own domain at it later from Settings if you have one.",
    },
    {
      heading: "List services with real durations",
      body:
        "Add each service with its price and how long it actually takes, chair time included. Durations are not decoration — they are what stops the calendar from stacking a forty-minute cut on top of a two-hour colour. If a service varies, list the longer version; overrunning is worse than finishing early.",
    },
    {
      heading: "Open your calendar",
      body:
        "Set the hours you take appointments. Everything booked lands on one calendar, and Tulala will not offer a slot that is already taken. Block holidays and personal time on the same calendar — if it is not on there, it is bookable.",
    },
    {
      heading: "Add the people who work with you",
      body:
        "Invite each stylist, barber or therapist from Settings. They get their own login and their own column on the calendar, so a client books a person, not just an hour. Each one has a role, so a new hire can take bookings without seeing your billing.",
    },
    {
      heading: "Confirmations, reminders and the ones who do not show",
      body:
        "Confirmations go out automatically when an appointment is made, and reminders before it. Tulala does not chase a no-show or charge a cancellation fee for you — if that matters to your business, take a deposit through a payment request when you confirm, and say so on your page.",
    },
  ],
  ctaPrimary: { label: "Start free", href: "/get-started?audience=salon" },
  es: {
    title: "Ayuda para salones, barberías y estudios de bienestar",
    intro:
      "Tu producto es el tiempo. Tulala publica lo que ofreces y cuánto dura, pone tu disponibilidad en un solo calendario, y convierte el \"¿tienes hueco el jueves?\" en una cita que puedes ver en vez de un mensaje que tienes que recordar.",
    guides: [
      {
        heading: "Reclama tu página",
        body:
          "Entra en /get-started, pon tu nombre y tu correo, y elige tu enlace. La página queda publicada al momento, sin tarjeta. Añade tu dirección, tu horario y tus fotos desde el espacio de trabajo, y si tienes dominio propio lo apuntas después desde Ajustes.",
      },
      {
        heading: "Publica tus servicios con duraciones reales",
        body:
          "Añade cada servicio con su precio y lo que tarda de verdad, contando el tiempo en la silla. Las duraciones no son decorativas: son lo que impide que el calendario meta un corte de cuarenta minutos encima de un color de dos horas. Si un servicio varía, pon la versión larga; pasarse es peor que acabar antes.",
      },
      {
        heading: "Abre tu calendario",
        body:
          "Define las horas en las que atiendes. Todo lo que se reserva cae en un solo calendario, y Tulala no ofrece un hueco que ya está ocupado. Bloquea también vacaciones y asuntos personales ahí mismo: si no está en el calendario, se puede reservar.",
      },
      {
        heading: "Suma a las personas que trabajan contigo",
        body:
          "Invita a cada estilista, barbero o terapeuta desde Ajustes. Cada uno tiene su acceso y su columna en el calendario, así que el cliente reserva con una persona, no solo una hora. Cada uno tiene un rol, de modo que alguien nuevo puede recibir citas sin ver tu facturación.",
      },
      {
        heading: "Confirmaciones, recordatorios y quien no aparece",
        body:
          "Las confirmaciones salen solas al crear la cita, y los recordatorios antes. Tulala no persigue a quien no aparece ni le cobra una penalización por ti: si eso te importa, pide un anticipo con una solicitud de pago al confirmar, y dilo en tu página.",
      },
    ],
  },
};

export const SHOPS: HelpGuideRoleContent = {
  title: "Help for shops, makers and studios",
  intro:
    "You make or stock things and sell them to people who found you. Tulala gives you a page that shows what you have, an inbox for the custom jobs that do not fit a product, and one place where an order, a conversation and a payment stay attached to each other.",
  guides: [
    {
      heading: "Claim your page",
      body:
        "Go to /get-started, enter your name and email, and pick your link. The page is live immediately, no card required. Add photos, your story and where you are, and point your own domain at it later from Settings.",
    },
    {
      heading: "List what you sell",
      body:
        "Add each item with a price, photos and a description. Set a quantity on anything you have a finite number of and Tulala holds each one as it is ordered, then stops selling when they run out. Cancelled orders return their stock, so the number stays true without you watching it.",
    },
    {
      heading: "Take custom and commission work",
      body:
        "A commission is a conversation before it is a price, so it starts as an inquiry rather than a checkout. The request arrives in Messages, you agree the scope, and you send back an offer with the real number on it. The whole exchange stays on one thread instead of scattering across email.",
    },
    {
      heading: "Say how people get their things",
      body:
        "Pickup, local delivery and shipping are yours to arrange, and the one thing that reliably generates a message is not saying which you do. Put it on your page in plain words — where to collect, what you post, what it costs — and you will answer it once instead of every week.",
    },
    {
      heading: "Get paid",
      body:
        "Connect Stripe from Settings and send a payment request against an order or an agreed commission. Card payments settle to your Stripe account. If someone pays you in person or by transfer, mark it paid yourself so the record matches reality.",
    },
  ],
  ctaPrimary: { label: "Start free", href: "/get-started?audience=shop" },
  es: {
    title: "Ayuda para tiendas, artesanos y estudios",
    intro:
      "Haces o vendes cosas a gente que te ha encontrado. Tulala te da una página que muestra lo que tienes, una bandeja para los encargos que no caben en un producto, y un sitio donde el pedido, la conversación y el pago siguen unidos.",
    guides: [
      {
        heading: "Reclama tu página",
        body:
          "Entra en /get-started, pon tu nombre y tu correo, y elige tu enlace. La página queda publicada al momento, sin tarjeta. Añade fotos, tu historia y dónde estás, y apunta tu propio dominio después desde Ajustes.",
      },
      {
        heading: "Publica lo que vendes",
        body:
          "Añade cada artículo con precio, fotos y descripción. Ponle cantidad a todo lo que tengas en número limitado y Tulala va apartando cada unidad según se pide, y deja de venderlo cuando se acaba. Los pedidos cancelados devuelven su stock, así que el número se mantiene solo.",
      },
      {
        heading: "Acepta encargos y trabajos a medida",
        body:
          "Un encargo es una conversación antes que un precio, así que empieza como una consulta y no como una compra. La petición llega a Mensajes, acordáis el alcance, y tú respondes con una oferta con el número real. Todo el intercambio se queda en un hilo en vez de repartirse por correo.",
      },
      {
        heading: "Explica cómo recibe la gente sus cosas",
        body:
          "La recogida, el reparto local y el envío los organizas tú, y lo que genera mensajes sin falta es no decir cuál haces. Ponlo en tu página con palabras claras — dónde se recoge, qué envías, cuánto cuesta — y lo contestas una vez en vez de cada semana.",
      },
      {
        heading: "Cobra",
        body:
          "Conecta Stripe desde Ajustes y envía una solicitud de pago sobre un pedido o un encargo acordado. Los pagos con tarjeta llegan a tu cuenta de Stripe. Si te pagan en persona o por transferencia, márcalo como pagado para que el registro coincida con la realidad.",
      },
    ],
  },
};
