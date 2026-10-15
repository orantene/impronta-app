/**
 * The `posts_feed` inspector's own copy (es + en, no em dashes). Kept beside
 * the widget, not in messages/*.json, so the widget ships as one unit.
 */
import type { PostsFeedDemoTrade, PostsFeedField, PostsFeedPagination, PostsFeedSort, PostsFeedSource } from "./posts-feed-model";

type Copy = {
  style: string;
  styleInfo: string;
  content: string;
  eyebrow: string;
  heading: string;
  optional: string;
  source: string;
  sources: Record<PostsFeedSource, string>;
  pick: string;
  pickInfo: string;
  picked: string;
  noPicked: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  filters: string;
  category: string;
  anyCategory: string;
  chooseCategory: string;
  advanced: string;
  exclude: string;
  sort: string;
  sorts: Record<PostsFeedSort, string>;
  limit: string;
  columns: string;
  show: string;
  fields: Record<PostsFeedField, string>;
  pagination: string;
  paginations: Record<PostsFeedPagination, string>;
  paginationInfo: string;
  empty: string;
  emptyPlaceholder: string;
  emptyInfo: string;
  demoTrade: string;
  demoTrades: Record<PostsFeedDemoTrade, string>;
  loading: string;
  loadError: string;
  noPosts: string;
};

export const POSTS_FEED_INSPECTOR_COPY: { es: Copy; en: Copy } = {
  es: {
    style: "Estilo",
    styleInfo: "Siete diseños. Todos se adaptan al celular y usan los colores y letras de tu tema.",
    content: "Contenido",
    eyebrow: "Antetítulo",
    heading: "Título",
    optional: "Opcional",
    source: "Qué posts",
    sources: { latest: "Los más recientes", featured: "Destacados", hand_picked: "Elegidos a mano", category: "De una categoría" },
    pick: "Elegir posts",
    pickInfo: "Marca los posts y ordénalos. Se muestran en este orden.",
    picked: "Elegidos",
    noPicked: "Todavía no elegiste posts.",
    moveUp: "Subir",
    moveDown: "Bajar",
    remove: "Quitar",
    filters: "Filtros",
    category: "Categoría",
    anyCategory: "Todas las categorías",
    chooseCategory: "Elegir categoría",
    advanced: "Avanzado",
    exclude: "Ocultar estos posts",
    sort: "Orden",
    sorts: { newest: "Más nuevos primero", oldest: "Más antiguos primero", featured_first: "Destacados primero" },
    limit: "Cantidad por página",
    columns: "Columnas en escritorio",
    show: "Mostrar",
    fields: {
      cover: "Portada",
      category: "Categoría",
      date: "Fecha",
      excerpt: "Resumen",
      readingTime: "Tiempo de lectura",
      author: "Autor",
      readMore: "Leer más",
    },
    pagination: "Paginación",
    paginations: { none: "Sin paginación", load_more: "Botón Ver más" },
    paginationInfo: "Hasta 4 páginas en el bloque.",
    empty: "Si no hay posts",
    emptyPlaceholder: "Ocultar el bloque",
    emptyInfo: "Vacío: el bloque se oculta en tu sitio. En el editor ves posts de ejemplo.",
    demoTrade: "Posts de ejemplo",
    demoTrades: {
      general: "General",
      beauty: "Belleza",
      wellness: "Bienestar",
      fitness: "Fitness",
      food: "Comida",
      events: "Eventos y música",
    },
    loading: "Cargando tus posts…",
    loadError: "No pudimos cargar tus posts.",
    noPosts: "Todavía no hay posts publicados.",
  },
  en: {
    style: "Style",
    styleInfo: "Seven designs. All fit phones and use your theme colours and fonts.",
    content: "Content",
    eyebrow: "Eyebrow",
    heading: "Heading",
    optional: "Optional",
    source: "Which posts",
    sources: { latest: "Latest", featured: "Featured", hand_picked: "Hand-picked", category: "From a category" },
    pick: "Pick posts",
    pickInfo: "Tick posts and order them. They show in this order.",
    picked: "Picked",
    noPicked: "No posts picked yet.",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Remove",
    filters: "Filters",
    category: "Category",
    anyCategory: "All categories",
    chooseCategory: "Choose a category",
    advanced: "Advanced",
    exclude: "Hide these posts",
    sort: "Sort",
    sorts: { newest: "Newest first", oldest: "Oldest first", featured_first: "Featured first" },
    limit: "Posts per page",
    columns: "Desktop columns",
    show: "Show",
    fields: {
      cover: "Cover",
      category: "Category",
      date: "Date",
      excerpt: "Excerpt",
      readingTime: "Reading time",
      author: "Author",
      readMore: "Read more",
    },
    pagination: "Pagination",
    paginations: { none: "None", load_more: "Load more button" },
    paginationInfo: "Up to 4 pages in the block.",
    empty: "When there are no posts",
    emptyPlaceholder: "Hide the block",
    emptyInfo: "Empty: the block hides on your site. The editor shows example posts.",
    demoTrade: "Example posts",
    demoTrades: {
      general: "General",
      beauty: "Beauty",
      wellness: "Wellness",
      fitness: "Fitness",
      food: "Food",
      events: "Events and music",
    },
    loading: "Loading your posts…",
    loadError: "Could not load your posts.",
    noPosts: "No published posts yet.",
  },
};

export function postsFeedInspectorCopy(locale: string | null | undefined): Copy {
  return (locale ?? "").toLowerCase().startsWith("es") ? POSTS_FEED_INSPECTOR_COPY.es : POSTS_FEED_INSPECTOR_COPY.en;
}
