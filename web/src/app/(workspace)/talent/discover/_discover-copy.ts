// Talent Discover page copy, en + es (2026-10-07): the page was English-only.
// Pure so a test can import it; the page picks the table from the request locale.

export type DiscoverCopy = {
  discover: string;
  noProfile: string;
  unnamed: string;
  backToProfile: string;
  presenceTitle: string;
  presenceLede: string;
  liveOnDiscover: string;
  pendingApproval: string;
  notOnDiscover: string;
  enableHint: string;
  cardPreview: string;
  exclusive: string;
  cardPreviewHint: string;
  last30Days: string;
  favoritedBy: string;
  clients: string;
  onShortlists: string;
  appearances: string;
  discoverInquiries: string;
  received: string;
  statsNote: string;
  travelReach: string;
  homeBase: string;
  notSet: string;
  travelRadius: string;
  remoteNoTravel: string;
  kmFromHome: (km: number) => string;
  radiusNotSet: string;
  remoteWork: string;
  remoteOnly: string;
  openInPersonRemote: string;
  travelHint: string;
  editProfile: string;
  viewPublicPage: string;
  trustSignals: string;
};

const EN: DiscoverCopy = {
  discover: "Discover",
  noProfile: "You don't have a talent profile yet. Create one to appear on Discover.",
  unnamed: "Unnamed",
  backToProfile: "← Back to profile",
  presenceTitle: "Your Discover presence",
  presenceLede: "How clients find you on Tulala Discover: your card preview, travel reach, and 30-day performance.",
  liveOnDiscover: "You're live on Discover",
  pendingApproval: "Discover enabled, pending profile approval",
  notOnDiscover: "Not on Discover yet",
  enableHint: "enable it from your profile's Identity section",
  cardPreview: "Card preview",
  exclusive: "exclusive",
  cardPreviewHint:
    "This is the card clients see in the Discover grid. Add a hero photo + primary category to make it complete.",
  last30Days: "Last 30 days",
  favoritedBy: "Favorited by",
  clients: "clients",
  onShortlists: "On shortlists",
  appearances: "appearances",
  discoverInquiries: "Discover inquiries",
  received: "received",
  statsNote:
    "Favorites + shortlist counts are all-time totals; inquiries are the last 30 days. Per-impression analytics roll out with the discover-index event pipeline.",
  travelReach: "Travel reach",
  homeBase: "Home base",
  notSet: "Not set",
  travelRadius: "Travel radius",
  remoteNoTravel: "Remote only, no travel",
  kmFromHome: (km) => `${km} km from home base`,
  radiusNotSet: "Not set (clients can't filter you by distance)",
  remoteWork: "Remote work",
  remoteOnly: "Remote-only",
  openInPersonRemote: "Open to in-person + remote",
  travelHint:
    "Set travel radius + home base in your profile's Service Areas section so clients filtering by location can find you.",
  editProfile: "✎ Edit profile",
  viewPublicPage: "↗ View public page",
  trustSignals: "🛡 Trust signals",
};

const ES: DiscoverCopy = {
  discover: "Discover",
  noProfile: "Todavía no tienes un perfil de talento. Crea uno para aparecer en Discover.",
  unnamed: "Sin nombre",
  backToProfile: "← Volver al perfil",
  presenceTitle: "Tu presencia en Discover",
  presenceLede: "Cómo te encuentran los clientes en Tulala Discover: la vista previa de tu tarjeta, tu alcance de viaje y el rendimiento de 30 días.",
  liveOnDiscover: "Estás visible en Discover",
  pendingApproval: "Discover activado, pendiente de aprobación del perfil",
  notOnDiscover: "Aún no estás en Discover",
  enableHint: "actívalo en la sección Identidad de tu perfil",
  cardPreview: "Vista previa de la tarjeta",
  exclusive: "exclusivo",
  cardPreviewHint:
    "Esta es la tarjeta que ven los clientes en la cuadrícula de Discover. Agrega una foto principal y una categoría principal para completarla.",
  last30Days: "Últimos 30 días",
  favoritedBy: "Guardado en favoritos por",
  clients: "clientes",
  onShortlists: "En listas de selección",
  appearances: "apariciones",
  discoverInquiries: "Consultas desde Discover",
  received: "recibidas",
  statsNote:
    "Los favoritos y las listas de selección son totales históricos; las consultas son de los últimos 30 días. El análisis por impresión llegará con el sistema de eventos de Discover.",
  travelReach: "Alcance de viaje",
  homeBase: "Ubicación base",
  notSet: "Sin definir",
  travelRadius: "Radio de viaje",
  remoteNoTravel: "Solo remoto, sin viajar",
  kmFromHome: (km) => `${km} km desde tu ubicación base`,
  radiusNotSet: "Sin definir (los clientes no pueden filtrarte por distancia)",
  remoteWork: "Trabajo remoto",
  remoteOnly: "Solo remoto",
  openInPersonRemote: "Disponible presencial y remoto",
  travelHint:
    "Define el radio de viaje y tu ubicación base en la sección Zonas de servicio de tu perfil para que los clientes que filtran por ubicación te encuentren.",
  editProfile: "✎ Editar perfil",
  viewPublicPage: "↗ Ver página pública",
  trustSignals: "🛡 Señales de confianza",
};

export function discoverCopy(locale: string | null | undefined): DiscoverCopy {
  return locale?.toLowerCase().startsWith("es") ? ES : EN;
}
