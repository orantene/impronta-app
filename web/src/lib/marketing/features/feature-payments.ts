import type { Feature } from "./types";

/**
 * Plate 13, Tier A.
 *
 * Target intent: "cobrar en linea sin tramites", "recibir pagos con tarjeta",
 * "cobrar anticipos". The differentiator is that payments are part of the
 * platform rather than an integration, so a deposit is one setting on a
 * service instead of a processor account plus a plugin.
 *
 * FEE ACCURACY IS NON-NEGOTIABLE HERE. Six percent total, three from the
 * client and three from the seller, processing included, same on every plan.
 * Never round it, never omit the split, never imply it is lower.
 */
export const PAYMENTS_FEATURE: Feature = {
  key: "payments",
  plate: 13,
  group: "paid",
  slugEn: "payments",
  slugEs: "pagos-integrados",
  tier: "A",
  status: "live",
  related: ["appointments", "bookings-and-offers", "commission-engine", "services-storefront"],

  en: {
    name: "Payments Built In",
    title: "Take payments and get paid to your bank",
    subtitle:
      "Checkout, deposits and payouts straight to your account. No separate processor to set up, no plugins, no waiting on three companies to approve you.",
    promise: "Get paid without leaving your own site.",

    popup: [
      [
        "Charge for a booking, take a deposit, or get paid in full, and the money goes to your bank account.",
      ],
      [
        "There is no separate payment provider to sign up with and configure. It is part of the platform, which is why a deposit is one setting on a ",
        { f: "services-storefront", label: "service" },
        " rather than a project.",
      ],
    ],

    intro: [
      [
        "The gap between being chosen and being paid is where small businesses lose money. A transfer that never arrives, an invoice chased twice, cash that walked out of the door, a client who says they will pay next week.",
      ],
      [
        "Payments here are part of the platform rather than something you add to it, so the same booking that fills your calendar can take the money at the same moment.",
      ],
    ],

    sections: [
      {
        heading: "Deposits are the quiet revenue fix",
        body: [
          [
            "A deposit changes behaviour. People who have paid something show up, and the ones who were never serious filter themselves out before they take your Saturday morning.",
          ],
          [
            "It costs you nothing to ask for and it is the single highest leverage change most service businesses can make. You set the amount, when it is refundable, and what happens if somebody does not appear.",
          ],
        ],
      },
      {
        heading: "One clear fee, and no plan gate",
        body: [
          [
            "The platform fee on booked work is six percent: three percent from the client and three percent from the seller, with card processing included in that number.",
          ],
          [
            "It is the same on every plan including the free one. A business that cannot get paid is not a business, so we do not put the money rail behind a subscription.",
          ],
        ],
      },
      {
        heading: "Where the money lands",
        body: [
          [
            "Payouts go to the bank account you connect, on the standard schedule, once your account is verified. You are the merchant of record for your own work, not a balance in somebody else's wallet waiting to be released.",
          ],
        ],
      },
      {
        heading: "It is the same rail everything else runs on",
        body: [
          [
            "A deposit on an ",
            { f: "appointments", label: "appointment" },
            ", a balance on a quoted ",
            { f: "bookings-and-offers", label: "job" },
            ", a discount from a ",
            { f: "discounts-and-campaigns", label: "campaign" },
            ", and an agency split from the ",
            { f: "commission-engine", label: "commission engine" },
            " all move through the same place, with one report at the end of the month.",
          ],
        ],
      },
    ],

    highlights: [
      "Checkout on your own site",
      "Deposits, balances and full prepayment",
      "Payouts to your own bank account",
      "Six percent on booked work, processing included",
      "Available on every plan, including free",
      "One report across bookings, jobs and campaigns",
    ],

    faq: [
      {
        q: "Do I need my own payment processor account?",
        a: "No. Payments are part of the platform, and your payouts go to the bank account you connect.",
      },
      {
        q: "What exactly does it cost?",
        a: "Six percent on booked work: three from the client and three from the seller, with card processing included in that number. Subscription plans are separate and do not change the fee.",
      },
      {
        q: "When do I get the money?",
        a: "Payouts go to your connected bank account on the standard schedule once your account is verified.",
      },
      {
        q: "Can I still take cash?",
        a: "Yes. Plenty of services get paid in person, and a service can be set to book online and pay in the chair. Taking a card is an option, not an obligation.",
      },
      {
        q: "What about refunds?",
        a: "You can refund from the booking, and the fee treatment follows the refund. Your cancellation policy is what decides who keeps a deposit, and you set that per service.",
      },
    ],
  },

  es: {
    name: "Pagos integrados",
    title: "Cobra y recibe el dinero en tu banco",
    subtitle:
      "Cobros, anticipos y depósitos directo a tu cuenta. Sin configurar otro procesador, sin plugins y sin esperar que tres empresas te aprueben.",
    promise: "Cobra sin salir de tu propio sitio.",

    popup: [
      [
        "Cobra una reserva, pide un anticipo o recibe el pago completo, y el dinero llega a tu cuenta bancaria.",
      ],
      [
        "No hay otro proveedor de pagos con el que registrarte y configurar. Es parte de la plataforma, y por eso un anticipo es un ajuste en un ",
        { f: "services-storefront", label: "servicio" },
        " y no un proyecto.",
      ],
    ],

    intro: [
      [
        "El hueco entre que te eligen y que te pagan es donde los negocios pequeños pierden dinero. Una transferencia que nunca llega, una factura que persigues dos veces, efectivo que se fue caminando, un cliente que dice que paga la próxima semana.",
      ],
      [
        "Aquí los pagos son parte de la plataforma y no algo que le agregas, así que la misma reserva que llena tu agenda puede cobrar en ese mismo momento.",
      ],
    ],

    sections: [
      {
        heading: "El anticipo es el arreglo silencioso de tus ingresos",
        body: [
          [
            "Un anticipo cambia el comportamiento. Quien ya pagó algo sí llega, y quien nunca iba en serio se filtra solo antes de quedarse con tu sábado por la mañana.",
          ],
          [
            "No te cuesta nada pedirlo y es el cambio con más impacto que puede hacer la mayoría de los negocios de servicios. Tú defines el monto, cuándo es reembolsable y qué pasa si alguien no aparece.",
          ],
        ],
      },
      {
        heading: "Una comisión clara, y sin candado por plan",
        body: [
          [
            "La comisión de la plataforma sobre el trabajo reservado es del seis por ciento: tres por ciento del cliente y tres por ciento del vendedor, con el procesamiento de tarjeta incluido en ese número.",
          ],
          [
            "Es igual en todos los planes, incluido el gratuito. Un negocio que no puede cobrar no es un negocio, así que no ponemos el cobro detrás de una suscripción.",
          ],
        ],
      },
      {
        heading: "Dónde cae el dinero",
        body: [
          [
            "Los depósitos llegan a la cuenta bancaria que conectes, en el calendario estándar, una vez que tu cuenta está verificada. Tú eres el responsable comercial de tu propio trabajo, no un saldo en la cartera de alguien más esperando que lo liberen.",
          ],
        ],
      },
      {
        heading: "Es el mismo sistema con el que corre todo lo demás",
        body: [
          [
            "Un anticipo de una ",
            { f: "appointments", label: "cita" },
            ", el saldo de un ",
            { f: "bookings-and-offers", label: "trabajo cotizado" },
            ", un descuento de una ",
            { f: "discounts-and-campaigns", label: "campaña" },
            " y un reparto de agencia del ",
            { f: "commission-engine", label: "motor de comisiones" },
            " se mueven por el mismo lugar, con un solo reporte a fin de mes.",
          ],
        ],
      },
    ],

    highlights: [
      "Cobro en tu propio sitio",
      "Anticipos, saldos y pago completo",
      "Depósitos a tu propia cuenta bancaria",
      "Seis por ciento sobre trabajo reservado, procesamiento incluido",
      "Disponible en todos los planes, incluido el gratuito",
      "Un solo reporte entre reservas, trabajos y campañas",
    ],

    faq: [
      {
        q: "¿Necesito mi propia cuenta de procesador de pagos?",
        a: "No. Los pagos son parte de la plataforma, y tus depósitos llegan a la cuenta bancaria que conectes.",
      },
      {
        q: "¿Cuánto cuesta exactamente?",
        a: "Seis por ciento sobre trabajo reservado: tres del cliente y tres del vendedor, con el procesamiento de tarjeta incluido en ese número. Los planes de suscripción son aparte y no cambian la comisión.",
      },
      {
        q: "¿Cuándo recibo el dinero?",
        a: "Los depósitos llegan a tu cuenta bancaria conectada en el calendario estándar, una vez que tu cuenta está verificada.",
      },
      {
        q: "¿Puedo seguir cobrando en efectivo?",
        a: "Sí. Muchos servicios se pagan en persona, y un servicio se puede configurar para reservarse en línea y pagarse en la silla. Cobrar con tarjeta es una opción, no una obligación.",
      },
      {
        q: "¿Y los reembolsos?",
        a: "Puedes reembolsar desde la reserva, y el tratamiento de la comisión sigue al reembolso. Tu política de cancelación es la que decide quién se queda un anticipo, y eso lo defines por servicio.",
      },
    ],
  },
};
