/** ES + EN copy for the owner's service hub screen (TUL-1369). Inline so shared messages files stay untouched. */
export type OwnerHubCopy = {
  title: string;
  notReady: string;
  loadFailed: string;
  queueTitle: string;
  queueEmpty: string;
  addTo: string; // {name}
  newEntry: string;
  skip: string;
  suggestionsTitle: string;
  groupThese: string; // {n}
  differs: string;
  entriesTitle: string;
  entriesEmpty: string;
  own: string;
  members: string; // {n}
  settings: string;
  name: string;
  category: string;
  hubPrice: string;
  showWho: string;
  showName: string;
  showPortfolio: string;
  showHidden: string;
  clientContact: string;
  contactWorkspace: string;
  contactTalent: string;
  bookingType: string;
  bookingRequest: string;
  bookingInstant: string;
  featured: string;
  hiddenLabel: string;
  save: string;
  saved: string;
  adminOnly: string;
  mergeInto: string;
  merge: string;
  split: string;
  splitHint: string;
  addOwnTitle: string;
  addOwn: string;
  blockedCategory: string;
  blockedDuration: string;
  blockedBookingType: string;
  notAllowed: string;
  failed: string;
  price: string;
  duration: string;
  minutes: string;
};

export const OWNER_HUB_COPY: Record<"en" | "es", OwnerHubCopy> = {
  en: {
    title: "Service hub",
    notReady: "The service hub is not available yet.",
    loadFailed: "Could not load the service hub. Try again in a moment.",
    queueTitle: "To review",
    queueEmpty: "Nothing to review.",
    addTo: "Add to {name}",
    newEntry: "Make a new entry",
    skip: "Skip",
    suggestionsTitle: "Suggested groups",
    groupThese: "Group these {n}",
    differs: "Differs",
    entriesTitle: "What you sell",
    entriesEmpty: "No entries yet.",
    own: "Yours",
    members: "{n} people",
    settings: "Settings",
    name: "Name",
    category: "Category",
    hubPrice: "Hub price",
    showWho: "Show who",
    showName: "Name",
    showPortfolio: "Portfolio only",
    showHidden: "Hidden",
    clientContact: "Who talks to the client",
    contactWorkspace: "The workspace",
    contactTalent: "The person",
    bookingType: "Booking type",
    bookingRequest: "On request",
    bookingInstant: "Instant",
    featured: "Feature",
    hiddenLabel: "Hide",
    save: "Save",
    saved: "Saved.",
    adminOnly: "Only admins can change this.",
    mergeInto: "Merge into",
    merge: "Merge",
    split: "Split out selected",
    splitHint: "Pick people to move into their own entry.",
    addOwnTitle: "Your own services",
    addOwn: "Add to the list",
    blockedCategory: "Different category.",
    blockedDuration: "Length differs by more than 15 minutes.",
    blockedBookingType: "Different booking type.",
    notAllowed: "Your role cannot do that.",
    failed: "Could not do that. Try again in a moment.",
    price: "Price",
    duration: "Length",
    minutes: "min",
  },
  es: {
    title: "Hub de servicios",
    notReady: "El hub de servicios aún no está disponible.",
    loadFailed: "No se pudo cargar el hub de servicios. Inténtalo de nuevo en un momento.",
    queueTitle: "Por revisar",
    queueEmpty: "Nada por revisar.",
    addTo: "Agregar a {name}",
    newEntry: "Crear una entrada nueva",
    skip: "Omitir",
    suggestionsTitle: "Grupos sugeridos",
    groupThese: "Agrupar estos {n}",
    differs: "Cambia",
    entriesTitle: "Lo que vendes",
    entriesEmpty: "Aún no hay entradas.",
    own: "Tuyo",
    members: "{n} personas",
    settings: "Ajustes",
    name: "Nombre",
    category: "Categoría",
    hubPrice: "Precio en el hub",
    showWho: "Mostrar quién",
    showName: "Nombre",
    showPortfolio: "Solo portafolio",
    showHidden: "Oculto",
    clientContact: "Quién habla con el cliente",
    contactWorkspace: "El espacio de trabajo",
    contactTalent: "La persona",
    bookingType: "Tipo de reserva",
    bookingRequest: "Por solicitud",
    bookingInstant: "Inmediata",
    featured: "Destacar",
    hiddenLabel: "Ocultar",
    save: "Guardar",
    saved: "Guardado.",
    adminOnly: "Solo los administradores pueden cambiar esto.",
    mergeInto: "Unir con",
    merge: "Unir",
    split: "Separar lo seleccionado",
    splitHint: "Elige personas para pasarlas a su propia entrada.",
    addOwnTitle: "Tus propios servicios",
    addOwn: "Agregar a la lista",
    blockedCategory: "Categoría distinta.",
    blockedDuration: "La duración difiere más de 15 minutos.",
    blockedBookingType: "Tipo de reserva distinto.",
    notAllowed: "Tu rol no puede hacer eso.",
    failed: "No se pudo hacer. Inténtalo de nuevo en un momento.",
    price: "Precio",
    duration: "Duración",
    minutes: "min",
  },
};

export function ownerHubCopy(locale: string): OwnerHubCopy {
  return locale.toLowerCase().startsWith("es") ? OWNER_HUB_COPY.es : OWNER_HUB_COPY.en;
}

export function blockerSentence(c: OwnerHubCopy, blockers: readonly string[]): string {
  const map: Record<string, string> = { category: c.blockedCategory, duration: c.blockedDuration, booking_type: c.blockedBookingType };
  return blockers.map((b) => map[b]).filter(Boolean).join(" ");
}
