import { CASE_STUDY_PHOTOS, MARKETING_PHOTOS } from "@/lib/marketing/photography";
import type { ResourceArticle } from "./types";

/** D2 + D3: deposits, and how to price your own work. */
export const MONEY_ARTICLES: ResourceArticle[] = [
  {
    slug: "booking-deposits",
    photo: CASE_STUDY_PHOTOS.wedding,
    datePublished: "2026-07-23",
    related: ["how-talent-bookings-work", "pricing-your-services", "booking-from-dms"],
    en: {
      eyebrow: "Getting paid",
      title: "Booking deposits: what to charge and why they work",
      subtitle:
        "A deposit is not about the money up front. It is the thing that separates a real booking from a polite maybe.",
      intro:
        "Most people who start taking deposits do it after getting burned: a date held for weeks, turned-down work, and a client who vanishes. The deposit is usually framed as protection, but its real job is signalling. It tells you which enquiries are serious, early enough to matter.",
      sections: [
        {
          heading: "What a deposit is actually for",
          body: [
            "The obvious purpose is compensation if someone cancels. The more valuable purpose is filtering. Someone willing to pay a small amount to hold a date is a different person from someone who says \"yes, pencil me in\".",
            "That filter costs a serious client nothing, because they were going to pay you anyway. It only inconveniences the people who were never going to book, which is exactly who you want to inconvenience.",
          ],
        },
        {
          heading: "How much to charge",
          body: [
            "There is no universal number, and anyone who gives you one is guessing about your market. The common range across service work is somewhere between a fifth and a half of the total, with the balance due on or shortly after delivery.",
            "Two things matter more than the exact percentage. It should hurt enough that cancelling is a real decision, and it should be small enough that a first-time client does not feel exposed sending it to someone they have not met.",
          ],
        },
        {
          heading: "Make it non-refundable, and say so early",
          body: [
            "A refundable deposit is not a deposit, it is a temporary loan. If you are going to hold a date and turn away other work, the deposit has to be at risk for the client, or it does not change their behaviour.",
            "Say this in writing, at the point of booking, in plain language. Almost every dispute about deposits comes from a client who genuinely did not realise. This is general information, not legal advice, and local consumer rules can apply.",
          ],
        },
        {
          heading: "Attach it to the booking, not to a chat",
          body: [
            "A deposit only does its job if it is clearly tied to a specific date and scope. Sent as a bare transfer with no context, it becomes an argument later about what exactly it was for.",
            "The cleanest version is a priced offer that names the job, which the client pays to accept. Then the deposit, the terms and the date are one object rather than three loosely related memories.",
          ],
        },
      ],
      faq: [
        {
          q: "What is a normal deposit for a booking?",
          a: "It varies by market and job size. A fifth to a half of the total is the common range in service work, with the rest due on or shortly after delivery.",
        },
        {
          q: "Should deposits be refundable?",
          a: "If it is refundable it does not change behaviour, which defeats the point. Whatever you choose, put it in writing before the client pays.",
        },
        {
          q: "Will asking for a deposit scare clients away?",
          a: "It scares away the ones who were not going to book. Clients who are used to hiring professionals expect to be asked.",
        },
        {
          q: "What if a client cancels far in advance?",
          a: "Many people keep the deposit but credit it toward a future date if there is enough notice. That keeps goodwill without giving up the protection.",
        },
      ],
    },
    es: {
      eyebrow: "Cómo cobrar",
      title: "Anticipos: cuánto cobrar y por qué funcionan",
      subtitle:
        "Un anticipo no se trata del dinero por adelantado. Es lo que separa una reserva real de un tal vez amable.",
      intro:
        "Casi todos empiezan a cobrar anticipo después de que los queman: una fecha apartada por semanas, trabajos rechazados y un cliente que desaparece. El anticipo se explica como protección, pero su verdadero trabajo es señalar. Te dice qué solicitudes van en serio, a tiempo para que importe.",
      sections: [
        {
          heading: "Para qué sirve realmente un anticipo",
          body: [
            "El propósito obvio es compensarte si alguien cancela. El más valioso es filtrar. Alguien dispuesto a pagar algo para apartar una fecha es una persona distinta a quien dice \"sí, apúntame\".",
            "Ese filtro no le cuesta nada a un cliente serio, porque de todos modos te iba a pagar. Solo incomoda a quien nunca iba a reservar, que es justo a quien quieres incomodar.",
          ],
        },
        {
          heading: "Cuánto cobrar",
          body: [
            "No hay un número universal, y quien te dé uno está adivinando sobre tu mercado. El rango común en servicios va entre una quinta parte y la mitad del total, y el resto se paga al entregar o poco después.",
            "Dos cosas importan más que el porcentaje exacto. Debe doler lo suficiente para que cancelar sea una decisión real, y ser lo bastante chico para que un cliente nuevo no se sienta expuesto mandándoselo a alguien que no conoce.",
          ],
        },
        {
          heading: "Que no sea reembolsable, y dilo desde el principio",
          body: [
            "Un anticipo reembolsable no es un anticipo, es un préstamo temporal. Si vas a apartar una fecha y rechazar otro trabajo, el anticipo tiene que estar en riesgo para el cliente, o no cambia su comportamiento.",
            "Ponlo por escrito, al momento de reservar, en palabras simples. Casi todo pleito por anticipos viene de un cliente que de verdad no se enteró. Esto es información general, no asesoría legal, y pueden aplicar reglas locales de consumo.",
          ],
        },
        {
          heading: "Amárralo a la reserva, no al chat",
          body: [
            "Un anticipo solo cumple su función si está claramente ligado a una fecha y un alcance concretos. Mandado como una transferencia suelta y sin contexto, después se vuelve una discusión sobre para qué era.",
            "La versión más limpia es una oferta con precio que nombra el trabajo y que el cliente paga para aceptar. Así el anticipo, las condiciones y la fecha son un solo objeto y no tres recuerdos sueltos.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Cuánto es un anticipo normal?",
          a: "Depende del mercado y del tamaño del trabajo. Entre una quinta parte y la mitad del total es el rango común en servicios, y el resto al entregar o poco después.",
        },
        {
          q: "¿El anticipo debe ser reembolsable?",
          a: "Si es reembolsable no cambia el comportamiento, que era el punto. Elijas lo que elijas, ponlo por escrito antes de que el cliente pague.",
        },
        {
          q: "¿Pedir anticipo espanta clientes?",
          a: "Espanta a los que no iban a reservar. Quien está acostumbrado a contratar profesionales espera que se lo pidan.",
        },
        {
          q: "¿Y si cancelan con mucha anticipación?",
          a: "Mucha gente se queda el anticipo pero lo abona a una fecha futura si avisaron con tiempo. Así conservas la buena relación sin perder la protección.",
        },
      ],
    },
  },
  {
    slug: "pricing-your-services",
    photo: MARKETING_PHOTOS.servicePros,
    datePublished: "2026-07-23",
    related: ["booking-deposits", "how-talent-bookings-work", "booking-from-dms"],
    en: {
      eyebrow: "Running the business",
      title: "How to price your services as independent talent",
      subtitle:
        "A practical way to set rates when nobody hands you a rate card, and how to stop rewriting them in every chat.",
      intro:
        "Pricing yourself is uncomfortable because it feels like a statement about your worth. It is not. It is arithmetic about your time, your costs and your market, and the people who charge well are usually not the most talented ones. They are the ones who did the arithmetic.",
      sections: [
        {
          heading: "Start from what a year has to cover",
          body: [
            "Work backwards. Decide what you need to earn in a year, then be honest about how many paid days you can realistically deliver. Not how many days exist, how many you can actually work after admin, travel and the weeks nobody books.",
            "Divide one by the other and you get a floor. It is usually higher than what people are charging, which is exactly the point of doing it.",
          ],
        },
        {
          heading: "Price the job, not the hour",
          body: [
            "Hourly pricing punishes you for being fast and invites clients to audit your time. Pricing the outcome, a session, an event, a package, keeps the conversation on what they are getting.",
            "It also makes you easier to compare favourably. \"A half-day session including edited images\" is a thing someone can say yes to. \"My hourly rate\" is a thing they have to do maths on.",
          ],
        },
        {
          heading: "Charge for the things that are not the work",
          body: [
            "Travel, rush turnarounds, extra revisions, unusual usage rights, an early call time. These are real costs and they are the most commonly given away for free.",
            "You do not have to be aggressive about it. Naming them as line items, even at modest amounts, changes the default from \"included\" to \"available\".",
          ],
        },
        {
          heading: "Write the prices down where clients can see them",
          body: [
            "Rates that live in your head get renegotiated every time, and you will quote inconsistently depending on how the day is going. Published prices do the negotiating for you before the conversation starts.",
            "They also filter. People who cannot afford you stop arriving, which is not a loss. It is the enquiries you were going to decline anyway, minus the time spent declining them.",
          ],
        },
      ],
      faq: [
        {
          q: "Should I publish my prices publicly?",
          a: "Usually yes. Published prices filter out mismatched enquiries before they cost you time, and they stop you quoting inconsistently.",
        },
        {
          q: "What if I am just starting out?",
          a: "Charge less than experienced people if you must, but do the same arithmetic. Starting below your floor sets an anchor that is hard to move later.",
        },
        {
          q: "How often should I raise my rates?",
          a: "When you are turning down work, when you are consistently booked, or when your costs have moved. Those are signals, not a calendar.",
        },
        {
          q: "Should I negotiate?",
          a: "Prefer changing the scope over changing the price. A smaller package at a lower number protects your rate; a discount on the same work does not.",
        },
      ],
    },
    es: {
      eyebrow: "Llevar el negocio",
      title: "Cómo poner precio a tus servicios siendo independiente",
      subtitle:
        "Una forma práctica de fijar tarifas cuando nadie te da un tabulador, y cómo dejar de reescribirlas en cada chat.",
      intro:
        "Ponerte precio incomoda porque se siente como una declaración sobre tu valor. No lo es. Es aritmética sobre tu tiempo, tus costos y tu mercado, y quien cobra bien normalmente no es el más talentoso. Es el que hizo las cuentas.",
      sections: [
        {
          heading: "Empieza por lo que tiene que cubrir el año",
          body: [
            "Ve al revés. Decide cuánto necesitas ganar en un año y sé honesto sobre cuántos días pagados puedes entregar de verdad. No cuántos días existen, sino cuántos puedes trabajar después de trámites, traslados y las semanas en que nadie reserva.",
            "Divide uno entre otro y tienes un piso. Casi siempre sale más alto de lo que la gente está cobrando, que es justo el punto del ejercicio.",
          ],
        },
        {
          heading: "Cobra el trabajo, no la hora",
          body: [
            "Cobrar por hora te castiga por ser rápido e invita al cliente a auditar tu tiempo. Cobrar el resultado, una sesión, un evento, un paquete, mantiene la conversación en lo que van a recibir.",
            "También te hace más fácil de comparar a tu favor. \"Una sesión de medio día con imágenes editadas\" es algo a lo que alguien puede decir que sí. \"Mi tarifa por hora\" es algo que tienen que calcular.",
          ],
        },
        {
          heading: "Cobra lo que no es el trabajo",
          body: [
            "Traslados, entregas urgentes, revisiones extra, usos poco comunes de las imágenes, llamados muy temprano. Son costos reales y son lo que más se regala.",
            "No tienes que ser agresivo. Nombrarlos como conceptos, aunque sea con montos modestos, cambia lo predeterminado de \"incluido\" a \"disponible\".",
          ],
        },
        {
          heading: "Escribe los precios donde el cliente los vea",
          body: [
            "Las tarifas que viven en tu cabeza se renegocian cada vez, y vas a cotizar distinto según cómo venga el día. Los precios publicados negocian por ti antes de que empiece la conversación.",
            "También filtran. Quien no puede pagarte deja de llegar, y eso no es una pérdida. Son las solicitudes que ibas a rechazar de todos modos, menos el tiempo de rechazarlas.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Debo publicar mis precios?",
          a: "Normalmente sí. Los precios publicados filtran solicitudes que no embonan antes de que te cuesten tiempo, y evitan que cotices distinto cada vez.",
        },
        {
          q: "¿Y si apenas estoy empezando?",
          a: "Cobra menos que alguien con experiencia si hace falta, pero haz las mismas cuentas. Empezar debajo de tu piso deja un ancla difícil de mover después.",
        },
        {
          q: "¿Cada cuánto subo mis tarifas?",
          a: "Cuando estás rechazando trabajo, cuando estás lleno de manera constante o cuando tus costos se movieron. Son señales, no un calendario.",
        },
        {
          q: "¿Debo negociar?",
          a: "Mejor cambia el alcance que el precio. Un paquete más chico a un número menor protege tu tarifa; un descuento por el mismo trabajo no.",
        },
      ],
    },
  },
];
