import type { Comparison } from "./types";

/**
 * OpenTable. The ownership argument, not the price argument.
 *
 * The sharpest thing about this comparison is not that we are cheaper. It is
 * WHAT THE MONEY BUYS. On OpenTable's entry plan a restaurant pays a cover fee
 * on diners who book through the restaurant's OWN WEBSITE, not just diners who
 * arrive from OpenTable's network. Higher plans waive that. So the cheapest
 * way in is the one that charges you for your own customers, and the way to
 * stop paying for them is to pay more.
 *
 * That is rent for access to a relationship the restaurant already had, and
 * when the restaurant stops paying, the relationship leaves with the platform.
 * We charge nothing per booking on any plan, and the customer list belongs to
 * the tenant. In Spanish the line lands harder than in English: tus clientes
 * son tuyos, tu pagina es tuya, tu lista es tuya.
 *
 * SOURCING, and it is a limitation worth publishing. OpenTable's own pricing
 * page timed out on repeated attempts, so these figures come from public
 * reporting rather than from their site directly. The page says so. A
 * comparison whose whole job is being checkable cannot begin by overstating
 * how well we checked it.
 */
export const OPENTABLE_COMPARISON: Comparison = {
  key: "opentable",
  competitor: "OpenTable",
  slugEn: "tulala-vs-opentable",
  slugEs: "tulala-vs-opentable",
  pricingCheckedOn: "4 September 2026",
  sources: [
    {
      label: "OpenTable for Restaurants pricing",
      url: "https://www.opentable.com/restaurant-solutions/products/pricing",
    },
  ],
  sourceCaveat: {
    en: "OpenTable's own pricing page did not load when we checked, so the figures below come from public reporting rather than from their site directly. Read their page before you decide, and tell us if we have it wrong.",
    es: "La página de precios de OpenTable no cargó cuando la revisamos, así que las cifras de abajo vienen de reportes públicos y no de su sitio directamente. Lee su página antes de decidir, y dinos si nos equivocamos.",
  },

  en: {
    title: "Tulala vs OpenTable",
    subtitle:
      "The question is not which is cheaper. It is whether you are renting access to your own customers.",
    intro: [
      "OpenTable fills empty tables. That is a real service and for some restaurants it is worth every penny, particularly a new room in a busy city that nobody has heard of yet.",
      "The part worth reading carefully is what happens to the diners you already had. On the entry plan, a cover fee applies to bookings that come through your own website, not only to diners who found you on OpenTable. The plans that waive that cost more per month. So the cheapest way in is the one that charges you for your own regulars, and the way to stop paying for them is to pay more.",
    ],
    tableHeading: "The numbers side by side",
    rows: [
      {
        label: "Monthly cost to start",
        tulala: "Free. You can take a booking without paying anything.",
        them: "Reported at $149 a month for the entry plan, rising to about $299 and $499.",
      },
      {
        label: "Fee per diner from your OWN website",
        tulala: "None, on every plan including free.",
        them: "Reported at about $1.50 per cover on the entry plan. Waived on the higher plans.",
      },
      {
        label: "Fee per diner from their network",
        tulala: "We do not have a diner network, so there is nothing to charge for.",
        them: "Reported at about $1.00 to $1.50 per cover depending on plan.",
      },
      {
        label: "What a busy month costs",
        tulala: "The plan price. Table bookings do not carry a fee.",
        them: "The plan price plus every cover. Volume is what makes it expensive, so the better your month, the larger the bill.",
      },
      {
        label: "Who owns the customer list",
        tulala: "You do, on every plan. Export it whenever you want.",
        them: "Diners who arrive through the network are theirs. Access to them stops when you stop paying.",
      },
      {
        label: "Your own website",
        tulala: "Included. Your domain, your pages, your menu, your storefront.",
        them: "A reservation widget you place on a site you build elsewhere.",
      },
    ],
    honestHeading: "Where OpenTable is genuinely stronger",
    honest: [
      "They have diners. Millions of people open OpenTable looking for somewhere to eat tonight, and if you need to fill a Tuesday in a room nobody knows yet, that is worth paying for. We do not have that, and pretending otherwise would not survive a single week of use.",
      "Their floor management is deeper than ours: table combinations, pacing, shift handovers, waitlists at scale. A hundred cover restaurant with a complex floor should look hard at what they lose by leaving.",
      "The cover fee model is not unreasonable in itself. Charging for a diner they genuinely introduced is a fair trade. The part worth questioning is the entry plan charging for diners who came from your own website.",
    ],
    fitHeading: "Who should actually switch",
    fit: [
      "Most of your bookings come from people who already know you, and you are paying per head for them.",
      "Your monthly bill grows on your best months, which is exactly backwards.",
      "You want your menu, your bookings and your website in one place instead of a widget bolted onto a site you maintain separately.",
      "You want the customer list to be yours when you leave, not a reason you cannot.",
    ],
    ctaHeading: "Keep OpenTable and try this alongside",
    ctaBody:
      "You do not have to choose on day one. Put your own page up, send it to your regulars, and let the network keep doing what the network is good at. If your own bookings move across, you will see it in a month.",
  },

  es: {
    title: "Tulala vs OpenTable",
    subtitle:
      "La pregunta no es cuál es más barato. Es si estás pagando renta por el acceso a tus propios clientes.",
    intro: [
      "OpenTable llena mesas vacías. Ese es un servicio real y para algunos restaurantes vale cada peso, sobre todo un lugar nuevo en una ciudad ocupada del que todavía nadie ha oído.",
      "Lo que vale la pena leer con cuidado es qué pasa con los comensales que ya tenías. En el plan de entrada se cobra una cuota por reserva que llega desde tu propio sitio web, no solo por los que te encontraron en OpenTable. Los planes que quitan ese cobro cuestan más al mes. Así que la forma más barata de entrar es la que te cobra por tus propios clientes de siempre, y la forma de dejar de pagar por ellos es pagar más.",
    ],
    tableHeading: "Los números lado a lado",
    rows: [
      {
        label: "Costo mensual para empezar",
        tulala: "Gratis. Puedes recibir una reserva sin pagar nada.",
        them: "Se reporta en $149 al mes el plan de entrada, subiendo a unos $299 y $499.",
      },
      {
        label: "Cuota por comensal de TU propio sitio",
        tulala: "Ninguna, en todos los planes incluido el gratis.",
        them: "Se reporta en unos $1.50 por comensal en el plan de entrada. Se quita en los planes más caros.",
      },
      {
        label: "Cuota por comensal de su red",
        tulala: "No tenemos red de comensales, así que no hay nada que cobrar.",
        them: "Se reporta entre $1.00 y $1.50 por comensal según el plan.",
      },
      {
        label: "Cuánto cuesta un mes bueno",
        tulala: "El precio del plan. Las reservas de mesa no llevan cuota.",
        them: "El precio del plan más cada comensal. El volumen es lo que lo encarece, así que entre mejor el mes, más grande la cuenta.",
      },
      {
        label: "De quién es la lista de clientes",
        tulala: "Tuya, en todos los planes. Expórtala cuando quieras.",
        them: "Los comensales que llegan por la red son suyos. El acceso a ellos se acaba cuando dejas de pagar.",
      },
      {
        label: "Tu propio sitio web",
        tulala: "Incluido. Tu dominio, tus páginas, tu menú, tu tienda.",
        them: "Un widget de reservas que pones en un sitio que construyes en otro lado.",
      },
    ],
    honestHeading: "En qué OpenTable sí es más fuerte",
    honest: [
      "Ellos tienen comensales. Millones de personas abren OpenTable buscando dónde cenar hoy, y si necesitas llenar un martes en un lugar que nadie conoce, eso vale lo que cuesta. Nosotros no tenemos eso, y fingir lo contrario no aguantaría ni una semana de uso.",
      "Su manejo de piso es más profundo que el nuestro: combinaciones de mesas, ritmo de servicio, cambios de turno, listas de espera grandes. Un restaurante de cien comensales con un piso complicado debería ver bien qué pierde al irse.",
      "El modelo de cobro por comensal no es irrazonable en sí. Cobrar por un comensal que de verdad te presentaron es un trato justo. Lo que vale la pena cuestionar es que el plan de entrada cobre por comensales que llegaron de tu propio sitio.",
    ],
    fitHeading: "Quién debería cambiarse de verdad",
    fit: [
      "La mayoría de tus reservas viene de gente que ya te conoce, y estás pagando por cabeza por ellos.",
      "Tu cuenta mensual crece en tus mejores meses, que es exactamente al revés.",
      "Quieres tu menú, tus reservas y tu sitio en un solo lugar en vez de un widget pegado a un sitio que mantienes aparte.",
      "Quieres que la lista de clientes sea tuya cuando te vayas, no la razón por la que no puedes irte.",
    ],
    ctaHeading: "Quédate con OpenTable y prueba esto en paralelo",
    ctaBody:
      "No tienes que elegir el primer día. Levanta tu propia página, mándasela a tus clientes de siempre, y deja que la red siga haciendo lo que la red hace bien. Si tus propias reservas se mueven para acá, lo vas a ver en un mes.",
  },
};
