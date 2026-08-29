import type { Feature } from "./types";

/**
 * Plate 06, Tier S, roadmap.
 *
 * Target intent: "menu QR para restaurante", "codigo QR personalizado",
 * "generar codigo QR gratis". Competes with free QR generators and Linktree,
 * and wins by pointing at things that take money rather than at a page.
 *
 * Not shipped. Every claim below is future tense and the page sells a
 * waitlist, never a capability.
 */
export const QR_ENGINE_FEATURE: Feature = {
  key: "qr-engine",
  plate: 6,
  group: "found",
  slugEn: "qr-engine",
  slugEs: "codigo-qr",
  tier: "S",
  status: "coming",
  related: ["services-storefront", "tables-and-seating", "ticketing", "payments"],

  en: {
    name: "QR Engine",
    title: "Custom QR codes that carry your business",
    subtitle:
      "Branded QR codes for your page, your menu, your booking link or your payment link. Export to PDF, print, share, and see every scan.",
    promise: "The bridge from the street to your business.",

    popup: [
      [
        "A QR code that looks like it belongs to you rather than to a free generator: your colours, your logo, sharp enough to print at any size.",
      ],
      [
        "Point it at what earns: your ",
        { f: "services-storefront", label: "menu" },
        ", a booking link, a discount, or a payment. Export to PDF for the printer, or share it straight to WhatsApp.",
      ],
    ],

    intro: [
      [
        "The sticker on the mirror, the tent card on the table, the poster in the window, the code on the back of a business card. These are the cheapest customers you will ever get, because they are already standing in front of you.",
      ],
      [
        "Most businesses waste them. The code goes to a generic link, or a page that was replaced, or a social profile that asks the visitor to log in first. The scan happens and nothing comes of it.",
      ],
    ],

    sections: [
      {
        heading: "A code that carries money, not just a page",
        body: [
          [
            "Most QR tools stop at a link. Yours will be able to carry a booking, a menu with real prices, a discount code, a tip, or a payment, because the things it points at already live on the same platform.",
          ],
          [
            "That is the whole difference. A generator gives you a black and white square that opens a URL. This gives you a square that starts a transaction.",
          ],
        ],
      },
      {
        heading: "It looks like yours",
        body: [
          [
            "Your colours, your logo in the centre, a shape that matches the rest of your brand. A code that looks cheap makes the business behind it look cheap, and a customer decides which one you are before they scan.",
          ],
        ],
      },
      {
        heading: "Made for printing, not just for screens",
        body: [
          [
            "Export at print quality as a PDF and hand it to a printer, put it on a card, a window, a menu or a shirt. The same code works shared digitally, so one design covers both worlds and you are not maintaining two.",
          ],
        ],
      },
      {
        heading: "Change what is behind it without reprinting",
        body: [
          [
            "The code points at a destination you control. When the offer changes, the season changes, or the menu changes, you update the destination and every printed code that is already in the world keeps working.",
          ],
          [
            "This is the part that saves real money. Reprinting a thousand table cards because a link died is a cost most businesses only discover once.",
          ],
        ],
      },
      {
        heading: "You will see what it did",
        body: [
          [
            "Scans are counted, so the poster in the window and the card on the table stop being a guess. That feeds the same ",
            { f: "analytics", label: "analytics" },
            " as everything else, next to the money each channel actually produced.",
          ],
        ],
      },
    ],

    highlights: [
      "Your branding, your colours, your logo",
      "Points at pages, menus, bookings, discounts or payments",
      "PDF export at print quality",
      "Share to WhatsApp, email and social",
      "Change the destination without reprinting",
      "Scan tracking",
    ],

    faq: [
      {
        q: "When is this available?",
        a: "It is on the roadmap and not shipped yet. Join the waitlist and you will hear the day it opens, before it is announced anywhere else.",
      },
      {
        q: "Will my printed codes still work if I change the page?",
        a: "That is the design. The code points at a destination you control, so you can change what sits behind it without reprinting anything.",
      },
      {
        q: "Can a customer pay from a QR code?",
        a: "That is the intention, using the same payment rail the rest of the platform runs on. Pay at the table, a deposit, or a tip.",
      },
      {
        q: "Do I need a special app to make it work?",
        a: "No. Every modern phone camera reads QR codes without an app, which is exactly why they came back.",
      },
    ],
  },

  es: {
    name: "Motor de QR",
    title: "Códigos QR personalizados para tu negocio",
    subtitle:
      "Códigos QR con tu marca para tu página, tu menú, tu enlace de reservas o de pago. Exporta a PDF, imprime, comparte y mide cada escaneo.",
    promise: "El puente de la calle a tu negocio.",

    popup: [
      [
        "Un código QR que se ve tuyo y no de un generador gratuito: tus colores, tu logo, con la calidad para imprimirse en cualquier tamaño.",
      ],
      [
        "Apúntalo a lo que genera dinero: tu ",
        { f: "services-storefront", label: "menú" },
        ", un enlace de reserva, un descuento o un pago. Exporta a PDF para la imprenta, o compártelo directo a WhatsApp.",
      ],
    ],

    intro: [
      [
        "La calcomanía en el espejo, el letrero en la mesa, el póster en la ventana, el código atrás de una tarjeta. Son los clientes más baratos que vas a conseguir, porque ya están parados frente a ti.",
      ],
      [
        "La mayoría de los negocios los desperdicia. El código lleva a un enlace genérico, o a una página que ya se cambió, o a un perfil que primero le pide al visitante iniciar sesión. El escaneo ocurre y no pasa nada.",
      ],
    ],

    sections: [
      {
        heading: "Un código que lleva dinero, no solo una página",
        body: [
          [
            "La mayoría de las herramientas de QR se quedan en un enlace. El tuyo va a poder llevar una reserva, un menú con precios reales, un código de descuento, una propina o un pago, porque todo eso ya vive en la misma plataforma.",
          ],
          [
            "Esa es toda la diferencia. Un generador te da un cuadro en blanco y negro que abre una URL. Esto te da un cuadro que empieza una venta.",
          ],
        ],
      },
      {
        heading: "Se ve tuyo",
        body: [
          [
            "Tus colores, tu logo al centro, una forma que combina con el resto de tu marca. Un código que se ve barato hace que el negocio detrás se vea barato, y el cliente decide cuál eres antes de escanear.",
          ],
        ],
      },
      {
        heading: "Hecho para imprimir, no solo para pantallas",
        body: [
          [
            "Exporta en calidad de imprenta como PDF y llévalo a imprimir, ponlo en una tarjeta, una ventana, un menú o una playera. El mismo código funciona compartido en digital, así que un diseño cubre los dos mundos y no mantienes dos.",
          ],
        ],
      },
      {
        heading: "Cambia lo que hay detrás sin reimprimir",
        body: [
          [
            "El código apunta a un destino que tú controlas. Cuando cambia la promoción, la temporada o el menú, actualizas el destino y cada código impreso que ya anda por ahí sigue funcionando.",
          ],
          [
            "Esta es la parte que de verdad ahorra dinero. Reimprimir mil tarjetas de mesa porque se murió un enlace es un costo que la mayoría descubre una sola vez.",
          ],
        ],
      },
      {
        heading: "Vas a ver qué hizo",
        body: [
          [
            "Los escaneos se cuentan, así que el póster de la ventana y la tarjeta de la mesa dejan de ser una corazonada. Eso alimenta las mismas ",
            { f: "analytics", label: "analíticas" },
            " que todo lo demás, junto al dinero que de verdad produjo cada canal.",
          ],
        ],
      },
    ],

    highlights: [
      "Con tu marca, tus colores y tu logo",
      "Apunta a páginas, menús, reservas, descuentos o pagos",
      "Exportación a PDF en calidad de imprenta",
      "Comparte a WhatsApp, correo y redes",
      "Cambia el destino sin reimprimir",
      "Medición de escaneos",
    ],

    faq: [
      {
        q: "¿Cuándo estará disponible?",
        a: "Está en la hoja de ruta y todavía no se lanza. Únete a la lista y te avisamos el día que abra, antes de anunciarlo en cualquier otro lado.",
      },
      {
        q: "¿Mis códigos impresos seguirán funcionando si cambio la página?",
        a: "Así está diseñado. El código apunta a un destino que tú controlas, así que puedes cambiar lo que hay detrás sin reimprimir nada.",
      },
      {
        q: "¿Un cliente puede pagar desde un código QR?",
        a: "Esa es la intención, usando el mismo sistema de pagos con el que opera el resto de la plataforma. Pagar en la mesa, dejar un anticipo o una propina.",
      },
      {
        q: "¿Necesito una app especial para que funcione?",
        a: "No. La cámara de cualquier teléfono moderno lee códigos QR sin app, que es justo por lo que volvieron.",
      },
    ],
  },
};
