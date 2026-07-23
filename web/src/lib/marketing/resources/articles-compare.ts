import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import type { ResourceArticle } from "./types";

/**
 * Commercial-investigation comparisons: category-level, not against named
 * products. Each answers "should I use a booking page or [category]?" and
 * says plainly when the other category is the right call.
 */
export const COMPARE_ARTICLES: ResourceArticle[] = [
  {
    slug: "booking-page-vs-link-in-bio",
    photo: MARKETING_PHOTOS.talentBooking,
    datePublished: "2026-07-23",
    related: ["booking-from-dms", "how-talent-bookings-work", "custom-domain-vs-subdomain"],
    en: {
      eyebrow: "Choosing your setup",
      title: "Booking page or link-in-bio page?",
      subtitle:
        "They solve different problems. One points people somewhere. The other takes the request, prices it, and gets paid.",
      intro:
        "Both live in your social bio and both are one link. That is where the similarity ends. A link-in-bio page is a menu of links: your latest post, your shop, your other profiles, a way to send people somewhere with one tap. A booking page is a single page built to do one job: turn a stranger into a priced, confirmed, paid booking. Picking between them is really a question of what happens after someone taps the link.",
      sections: [
        {
          heading: "What a link-in-bio page is actually good at",
          body: [
            "If your problem is that a social bio only allows one link and you have five things to point people at, a link-in-bio page solves that cleanly. It is cheap, quick to set up, and asks nothing of the visitor beyond a tap.",
            "It is also the right call if you are not taking bookings at all yet: you are building an audience, sending people to a shop you do not run, or just consolidating profiles. Do not add booking machinery you do not need yet.",
          ],
        },
        {
          heading: "Where it stops helping",
          body: [
            "A link-in-bio page has no memory of who visited or what they wanted. Someone taps through, likes what they see, and then has to message you to ask a price, which puts you straight back into typing the same questions in your DMs.",
            "It cannot hold a date, cannot produce a written offer, and cannot take a payment. Those three things are what actually stop an interested stranger from disappearing, and a list of links does not do any of them.",
          ],
        },
        {
          heading: "What a booking page adds",
          body: [
            "A booking page asks the questions up front: the date, the scope, the details you need to price the job. The visitor answers once instead of you typing the same three questions into every DM.",
            "From there it can produce an actual offer, hold the date against a payment, and keep the whole thing on record. That is the difference between a page that sends someone into a conversation and a page that finishes the conversation for you.",
          ],
        },
        {
          heading: "How to decide",
          body: [
            "If you are early, mostly booking people who already know you, or not selling a bookable service at all, a link-in-bio page is genuinely the simpler and cheaper right answer. Do not overbuild.",
            "Once you are fielding enquiries from strangers and typing the same price into the same DM for the fifth time this week, that is the sign the request needs somewhere to land that does more than point.",
          ],
        },
      ],
      faq: [
        {
          q: "Can I use both at the same time?",
          a: "Yes. A common setup is a link-in-bio page that lists your links, with one of them pointing to the booking page. They are not mutually exclusive, they do different jobs.",
        },
        {
          q: "Is a link-in-bio page enough if I only get a few enquiries a month?",
          a: "It can be. If the volume is low and you do not mind typing prices by hand, the cost of adding a booking page may not be worth it yet. Revisit this once the DMs start repeating.",
        },
        {
          q: "Does a booking page replace my social profiles?",
          a: "No. It replaces the step after someone finds you, not the finding itself. You still need people to arrive from somewhere, usually social.",
        },
        {
          q: "Which one looks more professional?",
          a: "Neither is inherently more professional. What reads as professional is whether the page matches what you are actually asking someone to do: browse, or book.",
        },
      ],
    },
    es: {
      eyebrow: "Elegir tu configuración",
      title: "¿Página de reservas o página de enlaces?",
      subtitle:
        "Resuelven problemas distintos. Una manda gente a algún lado. La otra recibe la solicitud, la cotiza y cobra.",
      intro:
        "Las dos viven en tu bio de redes y las dos son un solo link. Ahí se acaba el parecido. Una página de enlaces es un menú de links: tu última publicación, tu tienda, tus otros perfiles, una forma de mandar gente a algún lado con un toque. Una página de reservas es una sola página hecha para un trabajo: convertir a un desconocido en una reserva cotizada, confirmada y pagada. Elegir entre las dos es en realidad una pregunta sobre qué pasa después de que alguien toca el link.",
      sections: [
        {
          heading: "En qué es buena de verdad una página de enlaces",
          body: [
            "Si tu problema es que la bio de redes solo permite un link y tienes cinco cosas a las que apuntar, una página de enlaces lo resuelve limpio. Es barata, rápida de armar y no le pide nada al visitante más que un toque.",
            "También es la decisión correcta si todavía no estás tomando reservas: estás construyendo audiencia, mandando gente a una tienda que no manejas tú, o solo juntando perfiles. No agregues maquinaria de reservas que todavía no necesitas.",
          ],
        },
        {
          heading: "Dónde deja de ayudar",
          body: [
            "Una página de enlaces no tiene memoria de quién la visitó ni qué quería. Alguien toca, le gusta lo que ve, y luego tiene que escribirte para preguntar precio, lo que te regresa directo a teclear las mismas preguntas en tus mensajes directos.",
            "No puede apartar una fecha, no puede generar una oferta por escrito y no puede cobrar. Esas tres cosas son las que de verdad evitan que un desconocido interesado desaparezca, y una lista de links no hace ninguna.",
          ],
        },
        {
          heading: "Qué agrega una página de reservas",
          body: [
            "Una página de reservas hace las preguntas desde el inicio: la fecha, el alcance, los datos que necesitas para poner precio. El visitante responde una vez en lugar de que tú teclees las mismas tres preguntas en cada mensaje directo.",
            "De ahí puede generar una oferta real, apartar la fecha contra un pago y dejar todo en registro. Esa es la diferencia entre una página que manda a alguien a una conversación y una que termina la conversación por ti.",
          ],
        },
        {
          heading: "Cómo decidir",
          body: [
            "Si vas empezando, reservas sobre todo con gente que ya te conoce, o no vendes un servicio que se reserve, una página de enlaces de verdad es la respuesta más simple y barata. No sobreconstruyas.",
            "En cuanto empiezas a recibir solicitudes de desconocidos y tecleas el mismo precio en el mismo mensaje directo por quinta vez esta semana, esa es la señal de que la solicitud necesita un lugar donde aterrizar que haga más que apuntar.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Puedo usar las dos al mismo tiempo?",
          a: "Sí. Una configuración común es una página de enlaces que lista tus links, con uno de ellos apuntando a la página de reservas. No se excluyen, hacen trabajos distintos.",
        },
        {
          q: "¿Basta una página de enlaces si solo recibo pocas solicitudes al mes?",
          a: "Puede bastar. Si el volumen es bajo y no te molesta teclear precios a mano, el costo de agregar una página de reservas quizá todavía no valga la pena. Revísalo cuando los mensajes directos empiecen a repetirse.",
        },
        {
          q: "¿Una página de reservas reemplaza mis perfiles de redes?",
          a: "No. Reemplaza el paso después de que alguien te encuentra, no el encontrarte. Sigues necesitando que la gente llegue de algún lado, casi siempre redes sociales.",
        },
        {
          q: "¿Cuál se ve más profesional?",
          a: "Ninguna es más profesional por sí sola. Lo que se lee como profesional es si la página coincide con lo que en verdad le estás pidiendo a alguien que haga: mirar, o reservar.",
        },
      ],
    },
  },
  {
    slug: "booking-page-vs-diy-website",
    photo: MARKETING_PHOTOS.systems,
    datePublished: "2026-07-23",
    related: ["how-talent-bookings-work", "booking-from-dms", "custom-domain-vs-subdomain"],
    en: {
      eyebrow: "Choosing your setup",
      title: "Booking page or your own website, built from scratch?",
      subtitle:
        "A DIY site wins on design freedom. It loses on the booking pipeline, because you end up stitching it from separate tools.",
      intro:
        "Building your own site with a general website builder, a form plugin and a separate payment link is a completely reasonable path, and for some people it is the right one. The trade-off is specific: you get to design exactly what you want, and you take on the job of making a form, an offer, a confirmation and a payment act like one connected process instead of four separate tools that happen to sit on the same page.",
      sections: [
        {
          heading: "Where a DIY site genuinely wins",
          body: [
            "Total design control is real and it matters to some people: exact layout, exact fonts, a portfolio that looks nothing like anyone else's. If your work is the kind where the site itself is a piece of your portfolio, a general website builder gives you a blank canvas a purpose-built booking page will not.",
            "It also wins if booking is a small part of what the site does. A studio, a shop, a personal brand with booking as one section among many is a legitimate reason to want a general-purpose tool rather than a page built around one job.",
          ],
        },
        {
          heading: "The part that gets stitched together",
          body: [
            "A contact form collects a message. It does not price a job. To get from message to priced offer you are usually typing a quote by hand, in email or in a chat, separate from the form that started it.",
            "A payment link is not aware of what was booked or when. It just moves money. Connecting a specific payment to a specific date and a specific offer becomes something you track yourself, in a spreadsheet or in memory, which is exactly the manual work a built-in pipeline removes.",
          ],
        },
        {
          heading: "Maintenance is a real cost, not a footnote",
          body: [
            "A general website builder, a form tool and a payment processor are three separate accounts, three separate places that can break, and three separate things to keep working together as each one updates on its own schedule.",
            "None of this shows up on day one. It shows up much later, when a plugin update changes how the form submits, or the payment link and the calendar quietly drift out of sync and nobody notices until a client shows up on a date you already rebooked.",
          ],
        },
        {
          heading: "How to decide",
          body: [
            "If the site itself is the product, or design freedom matters more to you than the booking flow, build it yourself and accept the stitching as the cost of that freedom.",
            "If the booking flow is the product, meaning what actually earns you money is a clean path from request to paid confirmation, a page built around that one job will get you there with less to maintain, even though the design is more constrained.",
          ],
        },
      ],
      faq: [
        {
          q: "Can I add booking to a site I already built?",
          a: "Often, yes, by linking out to a dedicated booking page from your existing site. You keep your design and hand the pipeline itself to a tool built for it.",
        },
        {
          q: "Is a DIY site cheaper?",
          a: "Sometimes at the start. Once you add a form tool and a payment processor as separate line items, and count your own time keeping them working together, the gap narrows or reverses.",
        },
        {
          q: "Why does connecting the payment to the booking matter so much?",
          a: "Because that is what turns a soft yes into a held date. A payment link with no memory of the booking cannot do that on its own.",
        },
        {
          q: "Is a DIY site ever the right long-term choice?",
          a: "Yes, for people whose site is genuinely part of the work, such as a portfolio-led practice where booking is secondary. It is the wrong choice when the booking pipeline is the whole point.",
        },
      ],
    },
    es: {
      eyebrow: "Elegir tu configuración",
      title: "¿Página de reservas o tu propio sitio hecho desde cero?",
      subtitle:
        "Un sitio hecho por tu cuenta gana en libertad de diseño. Pierde en la mecánica de reserva, porque la terminas armando con herramientas sueltas.",
      intro:
        "Armar tu propio sitio con un constructor de sitios general, un plugin de formularios y un link de pago aparte es un camino totalmente razonable, y para algunas personas es el correcto. El costo es específico: puedes diseñar exactamente lo que quieres, y a cambio te toca a ti hacer que un formulario, una oferta, una confirmación y un pago se comporten como un solo proceso conectado en lugar de cuatro herramientas sueltas que coinciden en la misma página.",
      sections: [
        {
          heading: "Dónde gana de verdad un sitio hecho por tu cuenta",
          body: [
            "El control total del diseño es real y a algunas personas les importa mucho: el layout exacto, las fuentes exactas, un portafolio que no se parezca al de nadie más. Si tu trabajo es del tipo donde el sitio mismo es parte de tu portafolio, un constructor de sitios general te da un lienzo en blanco que una página de reservas hecha para un fin no te va a dar.",
            "También gana cuando la reserva es una parte chica de lo que hace el sitio. Un estudio, una tienda, una marca personal donde reservar es una sección entre varias es una razón legítima para querer una herramienta de propósito general en lugar de una página armada alrededor de un solo trabajo.",
          ],
        },
        {
          heading: "La parte que se termina cosiendo a mano",
          body: [
            "Un formulario de contacto recibe un mensaje. No cotiza un trabajo. Para pasar del mensaje a una oferta con precio, normalmente terminas escribiendo la cotización a mano, por correo o por chat, separada del formulario que la originó.",
            "Un link de pago no sabe qué se reservó ni para cuándo. Solo mueve dinero. Conectar un pago concreto con una fecha concreta y una oferta concreta se vuelve algo que tienes que llevar tú, en una hoja de cálculo o de memoria, que es justo el trabajo manual que un flujo integrado elimina.",
          ],
        },
        {
          heading: "El mantenimiento es un costo real, no una nota al pie",
          body: [
            "Un constructor de sitios general, una herramienta de formularios y un procesador de pagos son tres cuentas separadas, tres lugares distintos que se pueden romper y tres cosas que mantener funcionando juntas mientras cada una se actualiza en su propio calendario.",
            "Nada de esto se nota el primer día. Se nota mucho después, cuando una actualización de plugin cambia cómo se envía el formulario, o el link de pago y el calendario se desincronizan sin que nadie lo note hasta que un cliente llega en una fecha que ya habías vuelto a reservar.",
          ],
        },
        {
          heading: "Cómo decidir",
          body: [
            "Si el sitio en sí es el producto, o la libertad de diseño te importa más que el flujo de reserva, constrúyelo tú y acepta la costura como el precio de esa libertad.",
            "Si el flujo de reserva es el producto, es decir, lo que de verdad te genera dinero es un camino limpio de la solicitud a la confirmación pagada, una página armada alrededor de ese único trabajo te va a llevar ahí con menos que mantener, aunque el diseño esté más limitado.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Puedo agregar reservas a un sitio que ya construí?",
          a: "Muchas veces sí, enlazando desde tu sitio actual hacia una página de reservas dedicada. Conservas tu diseño y le entregas la mecánica a una herramienta hecha para eso.",
        },
        {
          q: "¿Un sitio hecho por tu cuenta es más barato?",
          a: "A veces al inicio. En cuanto sumas una herramienta de formularios y un procesador de pagos como partidas aparte, y cuentas tu propio tiempo manteniéndolos coordinados, la diferencia se cierra o se revierte.",
        },
        {
          q: "¿Por qué importa tanto conectar el pago con la reserva?",
          a: "Porque eso es lo que convierte un sí blando en una fecha apartada. Un link de pago sin memoria de la reserva no puede hacer eso por sí solo.",
        },
        {
          q: "¿Un sitio hecho por tu cuenta puede ser la elección correcta a largo plazo?",
          a: "Sí, para quien el sitio es de verdad parte del trabajo, como una práctica basada en portafolio donde reservar es secundario. Es la elección equivocada cuando el flujo de reserva es todo el punto.",
        },
      ],
    },
  },
];
