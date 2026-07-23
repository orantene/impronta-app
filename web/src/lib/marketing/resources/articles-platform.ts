import { CASE_STUDY_PHOTOS, MARKETING_PHOTOS } from "@/lib/marketing/photography";
import type { ResourceArticle } from "./types";

/** D8 + D9: your own domain, and running a booking page in two languages. */
export const PLATFORM_ARTICLES: ResourceArticle[] = [
  {
    slug: "custom-domain-vs-subdomain",
    photo: MARKETING_PHOTOS.agencyBuilder,
    datePublished: "2026-07-23",
    related: ["bilingual-booking-page", "pricing-your-services", "booking-from-dms"],
    en: {
      eyebrow: "Your online home",
      title: "Custom domain or free subdomain?",
      subtitle:
        "When a free subdomain is genuinely fine, and the point at which your own domain starts paying for itself.",
      intro:
        "This decision gets treated as a status question and it is really a practical one. A subdomain and a domain both work. They differ in what they cost, what they signal, and crucially in who controls the address if you ever move.",
      sections: [
        {
          heading: "A free subdomain is fine longer than people think",
          body: [
            "If you are starting out, testing whether the work sells, or booking mostly people who already know you, a subdomain costs nothing and does the job. Clients care that the page loads and explains what you do.",
            "Spending money on a domain before you have a page worth visiting is the wrong order. The page is the asset; the address is packaging.",
          ],
        },
        {
          heading: "What your own domain actually buys",
          body: [
            "Three things: it looks established to someone who does not know you, it is easier to say out loud and print, and it is yours. That last point is the one that matters most and gets mentioned least.",
            "With your own domain, the address survives changing tools. Everything printed, linked and remembered keeps working. On any subdomain, moving means the old address stops being yours.",
          ],
        },
        {
          heading: "The point where it starts paying for itself",
          body: [
            "Once you are handing out the address to strangers, putting it on printed material, or spending money to send people to it, the domain is worth having. At that stage you are investing in traffic, and you should own where it lands.",
            "The other trigger is email. Once you want an address at your own domain rather than a generic mailbox, you need the domain anyway.",
          ],
        },
        {
          heading: "Search engines do not care as much as you think",
          body: [
            "A custom domain is not a ranking trick. What moves search results is content people want and a site that is fast and crawlable, on either kind of address.",
            "There is one real consideration: moving later means redirects and a period where search engines re-learn the new address. That is an argument for choosing the domain before you build a lot of links, not an argument that subdomains rank badly.",
          ],
        },
      ],
      faq: [
        {
          q: "Will a custom domain improve my Google rankings?",
          a: "Not by itself. Content and site quality drive rankings. The domain matters for control and perception more than for ranking.",
        },
        {
          q: "Can I start free and move to my own domain later?",
          a: "Yes. On Tulala you can start on a free subdomain and connect your own domain on a paid plan without rebuilding the page.",
        },
        {
          q: "What happens to my links if I move?",
          a: "You will want redirects from the old address, and search engines take a while to fully transfer. It is worth doing, just not repeatedly.",
        },
        {
          q: "Is a subdomain unprofessional?",
          a: "Not to people who already know you. It matters more when strangers are judging you from the address alone.",
        },
      ],
    },
    es: {
      eyebrow: "Tu casa en línea",
      title: "¿Dominio propio o subdominio gratis?",
      subtitle:
        "Cuándo un subdominio gratis está perfectamente bien, y en qué punto tu propio dominio empieza a pagarse solo.",
      intro:
        "Esta decisión se trata como tema de estatus y en realidad es práctica. Un subdominio y un dominio funcionan los dos. Se diferencian en lo que cuestan, lo que comunican y, sobre todo, en quién controla la dirección si algún día te mueves.",
      sections: [
        {
          heading: "Un subdominio gratis sirve más tiempo del que crees",
          body: [
            "Si vas empezando, estás probando si el trabajo se vende, o reservas sobre todo con gente que ya te conoce, un subdominio no cuesta nada y hace el trabajo. Al cliente le importa que la página cargue y explique qué haces.",
            "Gastar en un dominio antes de tener una página que valga la pena visitar es el orden equivocado. La página es el activo; la dirección es el empaque.",
          ],
        },
        {
          heading: "Qué te compra de verdad tu propio dominio",
          body: [
            "Tres cosas: se ve establecido ante quien no te conoce, es más fácil de decir en voz alta y de imprimir, y es tuyo. Lo último es lo que más importa y lo que menos se menciona.",
            "Con dominio propio, la dirección sobrevive al cambio de herramientas. Todo lo impreso, enlazado y recordado sigue funcionando. En cualquier subdominio, mudarte significa que la dirección vieja deja de ser tuya.",
          ],
        },
        {
          heading: "El punto en que empieza a pagarse solo",
          body: [
            "En cuanto le das la dirección a desconocidos, la pones en material impreso o gastas dinero en mandar gente ahí, vale la pena el dominio. En esa etapa estás invirtiendo en tráfico, y conviene ser dueño de dónde aterriza.",
            "El otro disparador es el correo. En cuanto quieres una dirección en tu propio dominio y no un buzón genérico, de todos modos necesitas el dominio.",
          ],
        },
        {
          heading: "A los buscadores les importa menos de lo que crees",
          body: [
            "Un dominio propio no es un truco de posicionamiento. Lo que mueve los resultados es contenido que la gente quiere y un sitio rápido y rastreable, en cualquiera de las dos direcciones.",
            "Sí hay una consideración real: mudarte después implica redirecciones y un periodo en que los buscadores reaprenden la dirección nueva. Eso es argumento para elegir el dominio antes de acumular muchos enlaces, no para decir que los subdominios posicionan mal.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Un dominio propio mejora mi posición en Google?",
          a: "Por sí solo no. Lo que manda es el contenido y la calidad del sitio. El dominio importa más por control y percepción que por posicionamiento.",
        },
        {
          q: "¿Puedo empezar gratis y mudarme después a mi dominio?",
          a: "Sí. En Tulala puedes empezar en un subdominio gratis y conectar tu propio dominio en un plan de pago sin rehacer la página.",
        },
        {
          q: "¿Qué pasa con mis enlaces si me mudo?",
          a: "Vas a querer redirecciones desde la dirección vieja, y los buscadores tardan en transferir del todo. Vale la pena hacerlo, solo que no muchas veces.",
        },
        {
          q: "¿Un subdominio se ve poco profesional?",
          a: "No ante quien ya te conoce. Pesa más cuando un desconocido te juzga solo por la dirección.",
        },
      ],
    },
  },
  {
    slug: "bilingual-booking-page",
    photo: CASE_STUDY_PHOTOS.cityhub,
    datePublished: "2026-07-23",
    related: ["custom-domain-vs-subdomain", "pricing-your-services", "how-talent-bookings-work"],
    en: {
      eyebrow: "Two markets",
      title: "Running a booking page in two languages",
      subtitle:
        "How to serve local and visiting clients without maintaining two sites, and the mistakes that make bilingual pages feel machine-made.",
      intro:
        "If you work anywhere tourists, expats or international clients show up, half your enquiries arrive in a different language from the other half. Most people handle this by picking one language and quietly losing the other half, which is an expensive way to simplify.",
      sections: [
        {
          heading: "Translate the meaning, not the words",
          body: [
            "The fastest way to look amateur in your second language is a literal translation. Phrases that sell in one language often land as stiff or odd in another, and readers notice immediately.",
            "Write the second version as if it were the original, for someone who lives in that language. It should read like you wrote it, because effectively you did.",
          ],
        },
        {
          heading: "Money and dates are where confusion actually costs you",
          body: [
            "Currency is the big one. A visiting client seeing a price with no currency named will assume their own, and the misunderstanding surfaces at the worst moment.",
            "Date formats matter for the same reason: a booking on 03/04 is two different days depending on where the reader is from. Naming the month removes the ambiguity entirely.",
          ],
        },
        {
          heading: "Let the page follow the reader",
          body: [
            "A visitor should land in their language without hunting for a flag icon in a corner. If they do want to switch, the control should be obvious and it should not throw them back to the homepage.",
            "The other half is search: each language version needs its own discoverable address so a search engine can show the right one, rather than one page that changes underneath the same URL.",
          ],
        },
        {
          heading: "Keep both versions in step",
          body: [
            "The common failure is drift. You update prices or services in one language, forget the other, and quote from a page that is months out of date.",
            "Treat them as one piece of content with two renderings rather than two documents. Anything that lets one change without prompting the other will eventually embarrass you.",
          ],
        },
      ],
      faq: [
        {
          q: "Should I just use automatic translation?",
          a: "For your core selling copy, no. Machine translation is obvious to native readers and undermines the professionalism the page exists to convey.",
        },
        {
          q: "Do I need a separate site for each language?",
          a: "No. One page that renders in both languages is easier to keep in step, as long as each version has its own address so search engines can index it.",
        },
        {
          q: "Which language should be the default?",
          a: "Follow the reader where you can, and default to whichever market sends more of your paid work rather than whichever you personally prefer.",
        },
        {
          q: "How do I handle prices for visiting clients?",
          a: "Always name the currency next to the number. Assumed currency is the most expensive misunderstanding in bilingual booking.",
        },
      ],
    },
    es: {
      eyebrow: "Dos mercados",
      title: "Llevar una página de reservas en dos idiomas",
      subtitle:
        "Cómo atender a clientes locales y de fuera sin mantener dos sitios, y los errores que hacen que una página bilingüe se sienta hecha por máquina.",
      intro:
        "Si trabajas donde llegan turistas, extranjeros residentes o clientes internacionales, la mitad de tus solicitudes llega en un idioma y la otra mitad en otro. Casi todos resuelven eligiendo un idioma y perdiendo en silencio la otra mitad, que es una forma cara de simplificar.",
      sections: [
        {
          heading: "Traduce el sentido, no las palabras",
          body: [
            "La manera más rápida de verte amateur en tu segundo idioma es una traducción literal. Frases que venden en un idioma suenan tiesas o raras en otro, y el lector lo nota de inmediato.",
            "Escribe la segunda versión como si fuera la original, para alguien que vive en ese idioma. Debe leerse como si tú la hubieras escrito, porque en los hechos así fue.",
          ],
        },
        {
          heading: "El dinero y las fechas son donde la confusión sí cuesta",
          body: [
            "La moneda es lo principal. Un cliente de fuera que ve un precio sin moneda va a asumir la suya, y el malentendido aparece en el peor momento.",
            "Los formatos de fecha importan por lo mismo: una reserva el 03/04 son dos días distintos según de dónde sea quien lee. Nombrar el mes quita la ambigüedad por completo.",
          ],
        },
        {
          heading: "Deja que la página siga al lector",
          body: [
            "Quien llega debería aterrizar en su idioma sin buscar una banderita en una esquina. Y si quiere cambiar, el control debe ser obvio y no aventarlo de vuelta al inicio.",
            "La otra mitad es la búsqueda: cada versión necesita su propia dirección localizable para que un buscador muestre la correcta, en vez de una sola página que cambia por debajo de la misma URL.",
          ],
        },
        {
          heading: "Mantén las dos versiones al parejo",
          body: [
            "La falla común es que se desfasan. Actualizas precios o servicios en un idioma, olvidas el otro, y terminas cotizando desde una página con meses de atraso.",
            "Trátalas como un solo contenido con dos presentaciones y no como dos documentos. Cualquier arreglo que permita cambiar uno sin recordarte el otro tarde o temprano te va a dejar mal.",
          ],
        },
      ],
      faq: [
        {
          q: "¿Puedo usar traducción automática y ya?",
          a: "Para tu copy de venta, no. La traducción automática es obvia para un lector nativo y tumba justo la profesionalidad que la página busca transmitir.",
        },
        {
          q: "¿Necesito un sitio aparte por idioma?",
          a: "No. Una página que se presenta en los dos idiomas es más fácil de mantener al parejo, siempre que cada versión tenga su propia dirección para que los buscadores la indexen.",
        },
        {
          q: "¿Cuál idioma debe ser el predeterminado?",
          a: "Sigue al lector cuando puedas, y por defecto usa el mercado que te trae más trabajo pagado, no el que tú prefieras.",
        },
        {
          q: "¿Cómo manejo precios para clientes de fuera?",
          a: "Nombra siempre la moneda junto al número. La moneda asumida es el malentendido más caro de una reserva bilingüe.",
        },
      ],
    },
  },
];
