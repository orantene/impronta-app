/**
 * posts-feed-demo.ts: the example posts shown when a `posts_feed` widget has no
 * posts yet (TUL-1164). Kept OUT of `posts-feed-model.ts` on purpose: that file
 * ships in the admin client bundle, and the ~50 example titles, excerpts and
 * photo names are only ever needed server-side, either for a demo account's
 * published site (`posts-feed-sources.ts`) or for the builder canvas through
 * `posts-feed-demo-action.ts`. It deliberately has no `server-only` marker:
 * `posts-feed.test.tsx` imports it from a lane that has no server-only shim, and
 * `posts-feed-demo-bundle.static.test.ts` is what keeps every client module from
 * importing it.
 */
import { POSTS_FEED_MAX_FETCH, type PostsFeedCard, type PostsFeedDemoTrade } from "./posts-feed-model";

/**
 * Platform imagery that ships in `/public/marketing/photos` (first-party,
 * root-relative so every tenant host serves it). The DB-backed
 * `platform_stock_images` pool needs a query; this pure fallback cannot make
 * one, so it uses the bundled platform photos.
 */
const PHOTO = (name: string) => `/marketing/photos/${name}.jpg`;

type DemoSeed = { es: [string, string, string]; en: [string, string, string]; img: string; min: number };

/** [title, excerpt, category] per locale. Six per trade. */
const DEMO: Record<PostsFeedDemoTrade, DemoSeed[]> = {
  general: [
    { es: ["Cómo trabajamos, paso a paso", "Del primer mensaje a la entrega, sin sorpresas.", "Proceso"], en: ["How we work, step by step", "From the first message to delivery, no surprises.", "Process"], img: PHOTO("mk-hero-business"), min: 4 },
    { es: ["Cinco preguntas antes de reservar", "Lo que conviene saber para elegir bien.", "Guía"], en: ["Five questions before you book", "What to know to choose well.", "Guide"], img: PHOTO("mk-audience-business"), min: 3 },
    { es: ["Detrás de un proyecto reciente", "Qué pedía el cliente y cómo lo resolvimos.", "Casos"], en: ["Behind a recent project", "What the client asked for and how we solved it.", "Stories"], img: PHOTO("agency-workspace-builder"), min: 5 },
    { es: ["Precios claros, sin letra chica", "Cómo armamos un presupuesto y qué incluye.", "Guía"], en: ["Clear prices, no fine print", "How we build a quote and what it includes.", "Guide"], img: PHOTO("mk-hero-service"), min: 3 },
    { es: ["Lo nuevo de esta temporada", "Servicios, horarios y novedades del equipo.", "Novedades"], en: ["New this season", "Services, hours and team news.", "News"], img: PHOTO("hub-agency-discovery"), min: 2 },
    { es: ["Preguntas frecuentes, respondidas", "Tiempos, pagos y cambios de fecha.", "Ayuda"], en: ["Frequently asked questions, answered", "Timing, payments and date changes.", "Help"], img: PHOTO("service-pros-lifestyle"), min: 4 },
  ],
  beauty: [
    { es: ["Cómo cuidar tu manicura una semana más", "Tres hábitos simples que hacen la diferencia.", "Cuidados"], en: ["Make your manicure last a week longer", "Three simple habits that make the difference.", "Aftercare"], img: PHOTO("mk-hero-service"), min: 3 },
    { es: ["Tendencias de color para esta temporada", "Los tonos que más piden en el estudio.", "Tendencias"], en: ["Colour trends for this season", "The shades clients ask for most.", "Trends"], img: PHOTO("talent-services-hero"), min: 4 },
    { es: ["Antes de tu primera cita", "Qué traer, cuánto dura y cómo prepararte.", "Guía"], en: ["Before your first appointment", "What to bring, how long it takes, how to prepare.", "Guide"], img: PHOTO("service-pros-lifestyle"), min: 3 },
    { es: ["Peinados para eventos que duran toda la noche", "Técnicas que resisten baile, calor y fotos.", "Eventos"], en: ["Event hair that lasts all night", "Techniques that survive dancing, heat and photos.", "Events"], img: PHOTO("mk-models-party"), min: 5 },
    { es: ["Mi kit de productos favoritos", "Lo que uso en el estudio y por qué.", "Productos"], en: ["My favourite product kit", "What I use in the studio and why.", "Products"], img: PHOTO("mk-audience-talent"), min: 4 },
    { es: ["Piel sana entre una cita y otra", "Rutina corta para mantener el resultado.", "Cuidados"], en: ["Healthy skin between appointments", "A short routine to keep the result.", "Aftercare"], img: PHOTO("mk-hero-business"), min: 3 },
  ],
  wellness: [
    { es: ["Diez minutos para bajar el estrés", "Una rutina de respiración para cualquier día.", "Bienestar"], en: ["Ten minutes to lower stress", "A breathing routine for any day.", "Wellbeing"], img: PHOTO("service-pros-lifestyle"), min: 3 },
    { es: ["Qué esperar de tu primer masaje", "Duración, presión y cómo comunicarte.", "Guía"], en: ["What to expect from your first massage", "Length, pressure and how to speak up.", "Guide"], img: PHOTO("mk-hero-service"), min: 4 },
    { es: ["Dormir mejor empieza de día", "Pequeños cambios con gran efecto en la noche.", "Hábitos"], en: ["Better sleep starts in the daytime", "Small changes with a big effect at night.", "Habits"], img: PHOTO("mk-audience-hub"), min: 5 },
    { es: ["Estiramientos para quien trabaja sentado", "Cuatro movimientos para cuello y espalda.", "Movimiento"], en: ["Stretches for desk workers", "Four moves for neck and back.", "Movement"], img: PHOTO("talent-services-hero"), min: 3 },
    { es: ["Por qué el descanso también es progreso", "Recuperarse es parte del proceso.", "Bienestar"], en: ["Why rest is progress too", "Recovery is part of the process.", "Wellbeing"], img: PHOTO("mk-audience-business"), min: 4 },
    { es: ["Rituales de fin de semana", "Ideas sencillas para empezar el lunes en calma.", "Hábitos"], en: ["Weekend rituals", "Simple ideas to start Monday calm.", "Habits"], img: PHOTO("agency-workspace-builder"), min: 2 },
  ],
  fitness: [
    { es: ["Tu primera semana de entrenamiento", "Un plan realista para empezar sin lesiones.", "Entrenamiento"], en: ["Your first training week", "A realistic plan to start without injury.", "Training"], img: PHOTO("mk-hero-perform"), min: 5 },
    { es: ["Qué comer antes de entrenar", "Opciones rápidas según la hora del día.", "Nutrición"], en: ["What to eat before training", "Quick options for any time of day.", "Nutrition"], img: PHOTO("service-pros-lifestyle"), min: 4 },
    { es: ["Fuerza en casa con lo mínimo", "Una rutina con banda y peso corporal.", "Entrenamiento"], en: ["Strength at home with the bare minimum", "A routine with a band and bodyweight.", "Training"], img: PHOTO("mk-audience-talent"), min: 4 },
    { es: ["Cómo medir tu progreso de verdad", "Más allá de la báscula.", "Progreso"], en: ["How to really measure progress", "Beyond the scale.", "Progress"], img: PHOTO("mk-hero-service"), min: 3 },
    { es: ["Movilidad: el hábito que nadie hace", "Cinco minutos que cambian tu entrenamiento.", "Movilidad"], en: ["Mobility: the habit nobody does", "Five minutes that change your training.", "Mobility"], img: PHOTO("mk-audience-hub"), min: 3 },
    { es: ["Entrenar en grupo vs. personal", "Cuál conviene según tu objetivo.", "Guía"], en: ["Group vs. personal training", "Which suits your goal.", "Guide"], img: PHOTO("event-night-beams"), min: 4 },
  ],
  food: [
    { es: ["El menú de temporada ya llegó", "Platos nuevos con producto local.", "Menú"], en: ["The seasonal menu is here", "New dishes with local produce.", "Menu"], img: PHOTO("mk-hosts-restaurant"), min: 3 },
    { es: ["Detrás de la cocina", "Un día con el equipo, del mercado al servicio.", "Equipo"], en: ["Behind the kitchen", "A day with the team, from market to service.", "Team"], img: PHOTO("mk-hero-business"), min: 5 },
    { es: ["Cómo reservar para grupos", "Mesas largas, menús cerrados y anticipos.", "Guía"], en: ["How to book for groups", "Long tables, set menus and deposits.", "Guide"], img: PHOTO("mk-audience-business"), min: 3 },
    { es: ["Maridajes fáciles para la casa", "Tres combinaciones que siempre funcionan.", "Recetas"], en: ["Easy pairings at home", "Three combinations that always work.", "Recipes"], img: PHOTO("service-pros-lifestyle"), min: 4 },
    { es: ["Noche de cocina en vivo", "Fechas, cupo y qué incluye la experiencia.", "Eventos"], en: ["Live cooking night", "Dates, places and what the experience includes.", "Events"], img: PHOTO("event-night-fire"), min: 2 },
    { es: ["Nuestros proveedores locales", "Quién cultiva lo que llega a tu plato.", "Origen"], en: ["Our local suppliers", "Who grows what reaches your plate.", "Sourcing"], img: PHOTO("mk-audience-hub"), min: 4 },
  ],
  events: [
    { es: ["Así se arma un show en vivo", "Del ensayo a la última canción.", "Detrás de escena"], en: ["How a live show comes together", "From rehearsal to the last song.", "Backstage"], img: PHOTO("event-night-beams"), min: 5 },
    { es: ["Cómo contratar música para tu evento", "Tiempos, sonido y lo que debes preguntar.", "Guía"], en: ["How to book music for your event", "Timing, sound and what to ask.", "Guide"], img: PHOTO("independent-singer-booking"), min: 4 },
    { es: ["La noche que no olvidamos", "Crónica de una fecha especial.", "Crónicas"], en: ["The night we will not forget", "The story of a special date.", "Stories"], img: PHOTO("event-night-fire"), min: 3 },
    { es: ["Vestuario y escena", "Cómo elegimos la imagen de cada presentación.", "Estilo"], en: ["Wardrobe and stage", "How we choose the look of each show.", "Style"], img: PHOTO("event-night-runway"), min: 3 },
    { es: ["Próximas fechas", "Dónde vernos este mes.", "Agenda"], en: ["Upcoming dates", "Where to see us this month.", "Agenda"], img: PHOTO("event-night-silks"), min: 2 },
    { es: ["Preguntas de quien organiza", "Rider técnico, horarios y anticipos.", "Guía"], en: ["Questions from organisers", "Tech rider, schedules and deposits.", "Guide"], img: PHOTO("mk-hero-perform"), min: 4 },
  ],
};

const DEMO_DATES = {
  es: ["Hoy", "Ayer", "Hace 3 días", "La semana pasada", "Hace 2 semanas", "El mes pasado"],
  en: ["Today", "Yesterday", "3 days ago", "Last week", "2 weeks ago", "Last month"],
} as const;

const DEMO_AUTHOR = { es: "Equipo", en: "The team" } as const;

/** Demo example cards. They link nowhere and say so (`demo: true`). */
export function demoPostsFeedCards(trade: PostsFeedDemoTrade, locale: string, count: number): PostsFeedCard[] {
  const lang = (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
  const seeds = DEMO[trade] ?? DEMO.general;
  return Array.from({ length: Math.max(0, Math.min(POSTS_FEED_MAX_FETCH, count)) }, (_, i) => {
    const seed = seeds[i % seeds.length]!;
    const [title, excerpt, category] = seed[lang];
    return {
      id: `demo-${trade}-${i + 1}`,
      path: "#",
      title,
      excerpt,
      category,
      date: DEMO_DATES[lang][i % DEMO_DATES[lang].length],
      imageUrl: seed.img,
      imageAlt: title,
      readingMinutes: seed.min,
      author: DEMO_AUTHOR[lang],
      featured: i === 0,
      demo: true,
    };
  });
}
