import type { Feature } from "./types";

/**
 * Stage 04, Get paid. Plates 13 to 16.
 *
 * Plate 14 is Tier S and `coming`. Money claims here must stay exact: the
 * platform fee is a real number and never gets rounded down in copy.
 */
export const PAID_FEATURES: Feature[] = [
  {
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
        "Checkout, deposits and payouts straight to your account. No separate processor to set up, no plugins, no waiting to be approved by three companies.",
      promise: "Get paid without leaving your own site.",
      popup: [
        [
          "Charge for a booking, take a deposit, or get paid in full, and the money goes to your bank account.",
        ],
        [
          "There is no separate payment provider to sign up with and configure. It is already part of the platform, which is why a deposit can be attached to a service in one setting.",
        ],
      ],
      intro: [
        [
          "The gap between being chosen and being paid is where small businesses lose money. A transfer that never arrives, an invoice chased twice, cash that walked out the door.",
        ],
        [
          "Payments are part of the platform rather than an add on, so the same booking that fills your calendar can take the money at the same moment.",
        ],
      ],
      sections: [
        {
          heading: "Deposits are the quiet revenue fix",
          body: [
            [
              "A deposit changes behaviour. People who pay something up front show up, and the ones who were never serious filter themselves out before they take your Saturday morning.",
            ],
          ],
        },
        {
          heading: "One clear fee, no plan gate",
          body: [
            [
              "The platform fee on booked work is six percent, split three percent to the client and three percent to the seller, with processing included. It is the same on every plan, including the free one, because a business that cannot get paid is not a business.",
            ],
          ],
        },
      ],
      highlights: [
        "Checkout on your own site",
        "Deposits, balances and full prepayment",
        "Payouts to your bank account",
        "Six percent on booked work, processing included",
        "Available on every plan, including free",
      ],
      faq: [
        {
          q: "Do I need my own payment processor account?",
          a: "No. Payments are part of the platform, and your payouts go to the bank account you connect.",
        },
        {
          q: "What does it cost?",
          a: "Six percent on booked work, three from the client and three from the seller, with card processing included in that number. Subscription plans are separate and do not change the fee.",
        },
        {
          q: "When do I get the money?",
          a: "Payouts go to your connected bank account on the standard schedule once your account is verified.",
        },
      ],
    },
    es: {
      name: "Pagos integrados",
      title: "Cobra y recibe el dinero en tu banco",
      subtitle:
        "Cobros, anticipos y depósitos directo a tu cuenta. Sin configurar otro procesador, sin plugins y sin esperar la aprobación de tres empresas.",
      promise: "Cobra sin salir de tu propio sitio.",
      popup: [
        [
          "Cobra una reserva, pide un anticipo o recibe el pago completo, y el dinero llega a tu cuenta bancaria.",
        ],
        [
          "No hay otro proveedor de pagos con el que registrarte y configurar. Ya es parte de la plataforma, y por eso un anticipo se puede activar en un servicio con un solo ajuste.",
        ],
      ],
      intro: [
        [
          "El hueco entre que te eligen y que te pagan es donde los negocios pequeños pierden dinero. Una transferencia que nunca llega, una factura que hay que perseguir dos veces, efectivo que se fue caminando.",
        ],
        [
          "Los pagos son parte de la plataforma y no un complemento, así que la misma reserva que llena tu agenda puede cobrar en ese mismo momento.",
        ],
      ],
      sections: [
        {
          heading: "El anticipo es el arreglo silencioso de tus ingresos",
          body: [
            [
              "Un anticipo cambia el comportamiento. Quien paga algo por adelantado sí llega, y quien nunca iba en serio se filtra solo antes de quedarse con tu sábado por la mañana.",
            ],
          ],
        },
        {
          heading: "Una comisión clara, sin candado por plan",
          body: [
            [
              "La comisión de la plataforma sobre el trabajo reservado es del seis por ciento, tres por ciento del cliente y tres por ciento del vendedor, con el procesamiento incluido. Es igual en todos los planes, incluido el gratuito, porque un negocio que no puede cobrar no es un negocio.",
            ],
          ],
        },
      ],
      highlights: [
        "Cobro en tu propio sitio",
        "Anticipos, saldos y pago completo",
        "Depósitos a tu cuenta bancaria",
        "Seis por ciento sobre trabajo reservado, procesamiento incluido",
        "Disponible en todos los planes, incluido el gratuito",
      ],
      faq: [
        {
          q: "¿Necesito mi propia cuenta de procesador de pagos?",
          a: "No. Los pagos son parte de la plataforma, y tus depósitos llegan a la cuenta bancaria que conectes.",
        },
        {
          q: "¿Cuánto cuesta?",
          a: "Seis por ciento sobre trabajo reservado, tres del cliente y tres del vendedor, con el procesamiento de tarjeta incluido en ese número. Los planes de suscripción son aparte y no cambian la comisión.",
        },
        {
          q: "¿Cuándo recibo el dinero?",
          a: "Los depósitos llegan a tu cuenta bancaria conectada en el calendario estándar, una vez que tu cuenta está verificada.",
        },
      ],
    },
  },


  {
    key: "discounts-and-campaigns",
    plate: 15,
    group: "paid",
    slugEn: "discounts-and-campaigns",
    slugEs: "descuentos-y-campanas",
    tier: "A",
    status: "live",
    related: ["payments", "services-storefront", "analytics", "client-management"],
    en: {
      name: "Discounts & Campaigns",
      title: "Promo codes and launch offers that pay off",
      subtitle:
        "Codes, launch offers, per product deals and free month campaigns, with a limit on how many people can use each one and a record of who did.",
      promise: "Run a real offer, and know what it did.",
      popup: [
        [
          "Create a code, decide what it applies to, cap how many people can use it, and set whether it is one use per customer.",
        ],
        [
          "You see exactly who redeemed it and when, so a campaign is something you can measure rather than something you hope worked.",
        ],
      ],
      intro: [
        [
          "Most small businesses discount by instinct: a number invented on the spot for whoever asked. It works once and teaches the client to ask again.",
        ],
      ],
      sections: [
        {
          heading: "The controls that stop a discount running away",
          body: [
            [
              "A percentage or a fixed amount, applied to everything or only to certain things, for one month or six, limited to a number of people, one per customer, with a start and an end.",
            ],
          ],
        },
        {
          heading: "You can see who used it",
          body: [
            [
              "Every redemption is recorded with the account and the date, so at the end of a campaign you know what you gave away and what you got.",
            ],
          ],
        },
      ],
      highlights: [
        "Percentage or fixed amount",
        "Applies to everything or specific products",
        "Redemption caps and one per customer",
        "Scheduled start and end",
        "Full record of who redeemed",
      ],
      faq: [
        {
          q: "Can I limit a code to a set number of people?",
          a: "Yes. Set the total number of redemptions and the code stops working when it is reached.",
        },
        {
          q: "Can I give a first month free?",
          a: "Yes, free month campaigns are a supported shape, including several months and a discount that repeats for a set period.",
        },
      ],
    },
    es: {
      name: "Descuentos y campañas",
      title: "Códigos y ofertas de lanzamiento que sí sirven",
      subtitle:
        "Códigos, ofertas de lanzamiento, promociones por producto y campañas de meses gratis, con límite de cuántas personas pueden usarlos y registro de quién lo hizo.",
      promise: "Haz una oferta de verdad, y mide qué pasó.",
      popup: [
        [
          "Crea un código, decide a qué aplica, limita cuántas personas pueden usarlo y define si es uno por cliente.",
        ],
        [
          "Ves exactamente quién lo canjeó y cuándo, así que una campaña es algo que puedes medir y no algo que esperas que haya funcionado.",
        ],
      ],
      intro: [
        [
          "La mayoría de los negocios pequeños descuenta por instinto: un número inventado en el momento para quien preguntó. Funciona una vez y le enseña al cliente a volver a pedirlo.",
        ],
      ],
      sections: [
        {
          heading: "Los controles que evitan que un descuento se te salga de las manos",
          body: [
            [
              "Un porcentaje o una cantidad fija, aplicado a todo o solo a ciertas cosas, por un mes o por seis, limitado a un número de personas, uno por cliente, con fecha de inicio y de fin.",
            ],
          ],
        },
        {
          heading: "Puedes ver quién lo usó",
          body: [
            [
              "Cada canje queda registrado con la cuenta y la fecha, así que al terminar una campaña sabes qué regalaste y qué obtuviste.",
            ],
          ],
        },
      ],
      highlights: [
        "Porcentaje o cantidad fija",
        "Aplica a todo o a productos específicos",
        "Límite de canjes y uno por cliente",
        "Inicio y fin programados",
        "Registro completo de quién canjeó",
      ],
      faq: [
        {
          q: "¿Puedo limitar un código a cierto número de personas?",
          a: "Sí. Defines el total de canjes y el código deja de funcionar cuando se alcanza.",
        },
        {
          q: "¿Puedo dar el primer mes gratis?",
          a: "Sí, las campañas de meses gratis son un formato soportado, incluyendo varios meses y un descuento que se repite durante un periodo definido.",
        },
      ],
    },
  },

  {
    key: "commission-engine",
    plate: 16,
    group: "paid",
    slugEn: "commission-engine",
    slugEs: "motor-de-comisiones",
    tier: "B",
    status: "live",
    related: ["payments", "roster-and-team", "bookings-and-offers", "analytics"],
    en: {
      name: "Commission Engine",
      title: "Automatic splits between agency, talent and platform",
      subtitle:
        "Every booked job splits itself according to the rules you set, so nobody is doing percentages in a spreadsheet on a Sunday night.",
      promise: "Everyone paid right, without the spreadsheet.",
      popup: [
        [
          "Set the split once and every booked job applies it: what the agency keeps, what the talent earns, what the platform takes.",
        ],
        [
          "The numbers are recorded per job, so a payout is something you can explain to the person receiving it.",
        ],
      ],
      intro: [
        [
          "Commission is where agency relationships break. Not because anyone is dishonest, but because two people calculated the same job differently and both believe they are right.",
        ],
      ],
      sections: [
        {
          heading: "Rules, not arguments",
          body: [
            [
              "Rates can be set at the level that makes sense: the whole workspace, a particular talent, or a single job when something is genuinely an exception.",
            ],
          ],
        },
        {
          heading: "Recorded at the moment of the booking",
          body: [
            [
              "The split is captured when the job is booked, so changing a rate later does not silently rewrite the history of work that is already done.",
            ],
          ],
        },
      ],
      highlights: [
        "Agency, talent and platform splits",
        "Rates by workspace, talent or single job",
        "Captured per booking, not recalculated later",
        "Feeds payouts and reporting",
      ],
      faq: [
        {
          q: "Can a talent see their own split?",
          a: "Yes. Transparency is the point, and it removes the conversation where two people compare different numbers.",
        },
      ],
    },
    es: {
      name: "Motor de comisiones",
      title: "Repartos automáticos entre agencia, talento y plataforma",
      subtitle:
        "Cada trabajo reservado se reparte según las reglas que definas, para que nadie ande sacando porcentajes en una hoja de cálculo un domingo por la noche.",
      promise: "Todos cobran bien, sin la hoja de cálculo.",
      popup: [
        [
          "Define el reparto una vez y cada trabajo reservado lo aplica: lo que se queda la agencia, lo que gana el talento, lo que toma la plataforma.",
        ],
        [
          "Los números quedan registrados por trabajo, así que un pago es algo que le puedes explicar a quien lo recibe.",
        ],
      ],
      intro: [
        [
          "La comisión es donde se rompen las relaciones con agencias. No porque alguien sea deshonesto, sino porque dos personas calcularon el mismo trabajo distinto y las dos creen tener razón.",
        ],
      ],
      sections: [
        {
          heading: "Reglas, no discusiones",
          body: [
            [
              "Las tarifas se definen en el nivel que tenga sentido: todo el espacio de trabajo, un talento en particular, o un solo trabajo cuando de verdad es una excepción.",
            ],
          ],
        },
        {
          heading: "Registrado en el momento de la reserva",
          body: [
            [
              "El reparto se captura cuando se reserva el trabajo, así que cambiar una tarifa después no reescribe en silencio el historial de lo que ya se hizo.",
            ],
          ],
        },
      ],
      highlights: [
        "Repartos entre agencia, talento y plataforma",
        "Tarifas por espacio, talento o trabajo individual",
        "Capturado por reserva, no recalculado después",
        "Alimenta pagos y reportes",
      ],
      faq: [
        {
          q: "¿El talento puede ver su propio reparto?",
          a: "Sí. De eso se trata la transparencia, y elimina la conversación donde dos personas comparan números distintos.",
        },
      ],
    },
  },
];
