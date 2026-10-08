/**
 * TUL-80 / TUL-124: placeholder copy for the layout section library, keyed by
 * the authored (agency, English) string. Non-agency sites (solo talent and
 * business) never get roster wording or invented reviews; every row has
 * Spanish. House rule: no em dashes in user copy.
 */
export type Variant = { en: string; es: string };
export interface CopyRow {
  agency: Variant;
  talent: Variant;
  business?: Variant;
}

/** Row where the agency English is the key itself. */
function r(key: string, agencyEs: string, soloEn: string, soloEs: string): [string, CopyRow] {
  const solo = { en: soloEn, es: soloEs };
  return [key, { agency: { en: key, es: agencyEs }, talent: solo }];
}

const REVIEW_EN = "Add a real review from one of your clients here.";
const REVIEW_ES = "Agrega aquí una reseña real de uno de tus clientes.";

export const EXTRA_ROWS: ReadonlyArray<[string, CopyRow]> = [
  r("Social proof", "Prueba social", "Reviews", "Reseñas"),
  r("Trusted by leading brands", "Con la confianza de marcas líderes", "What clients say", "Lo que dicen mis clientes"),
  r(
    "Working with this team was seamless from first inquiry to final delivery. The talent matched our brand exactly.",
    "Trabajar con este equipo fue sencillo desde la primera consulta hasta la entrega final. El talento encajó con nuestra marca.",
    REVIEW_EN,
    REVIEW_ES,
  ),
  r(
    "We've worked with agencies across three continents — this experience stood apart. Responsive, professional, and exceptional results.",
    "Hemos trabajado con agencias en tres continentes, y esta experiencia destacó. Atentos, profesionales y con resultados excepcionales.",
    REVIEW_EN,
    REVIEW_ES,
  ),
  r(
    "The roster depth is remarkable. We found our lead for a global campaign in under 48 hours.",
    "La variedad del roster es notable. Encontramos a nuestra protagonista para una campaña global en menos de 48 horas.",
    REVIEW_EN,
    REVIEW_ES,
  ),
  r("Agency partner", "Socio de agencia", "Client name", "Nombre del cliente"),
  r("Production studio", "Estudio de producción", "Client name", "Nombre del cliente"),
  r("Brand team", "Equipo de marca", "Client name", "Nombre del cliente"),
  r("Global campaign lead", "Líder de campaña global", "Role or business", "Cargo o negocio"),
  r("Executive producer", "Productor ejecutivo", "Role or business", "Cargo o negocio"),
  r("Marketing director", "Directora de marketing", "Role or business", "Cargo o negocio"),
  r("Common questions", "Preguntas frecuentes", "Common questions", "Preguntas frecuentes"),
  r("Things people ask before they book.", "Lo que suelen preguntar antes de reservar.", "Things people ask before they book.", "Lo que suelen preguntar antes de reservar."),
  r("Answers to the most common questions. Anything else? Reach out.", "Respuestas a las dudas más comunes. ¿Algo más? Escríbenos.", "Answers to the most common questions. Anything else? Reach out.", "Respuestas a las dudas más comunes. ¿Algo más? Escríbeme."),
  r("What's included in a booking?", "¿Qué incluye una reserva?", "What's included in a booking?", "¿Qué incluye una reserva?"),
  r(
    "All sessions include scouting, scheduling, and coordination through confirmation.",
    "Todas las sesiones incluyen búsqueda de talento, agenda y coordinación hasta la confirmación.",
    "Every booking includes scheduling and coordination through confirmation.",
    "Cada reserva incluye agenda y coordinación hasta la confirmación.",
  ),
  r("How quickly can you respond?", "¿En cuánto tiempo responden?", "How quickly can you respond?", "¿En cuánto tiempo respondes?"),
  r(
    "Inquiries are answered within 24 business hours.",
    "Las consultas se responden en un máximo de 24 horas hábiles.",
    "Inquiries are answered within 24 business hours.",
    "Las consultas se responden en un máximo de 24 horas hábiles.",
  ),
  r("Do you travel?", "¿Viajan?", "Do you travel?", "¿Te desplazas?"),
  r(
    "Yes — domestic and international. Travel costs are billed at cost.",
    "Sí, dentro y fuera del país. Los gastos de viaje se facturan a costo.",
    "Yes, within the country and abroad. Travel costs are billed at cost.",
    "Sí, dentro y fuera del país. Los gastos de viaje se facturan a costo.",
  ),
  r("Ready when you are", "Listos cuando tú lo estés", "Ready when you are", "Listos cuando tú lo estés"),
  r(
    "Planning an event, shoot, activation, or private experience?",
    "¿Planeas un evento, sesión, activación o experiencia privada?",
    "Planning something special?",
    "¿Planeas algo especial?",
  ),
  r(
    "Tell us the brief and your market. We'll match the right talent — a coordinator replies personally.",
    "Cuéntanos el brief y tu mercado. Te propondremos al talento ideal y un coordinador responde personalmente.",
    "Tell us what you have in mind and we will reply personally.",
    "Cuéntanos qué tienes en mente y te responderemos personalmente.",
  ),
  r(
    "Agency-managed end to end — no direct talent contact.",
    "Gestionado por la agencia de principio a fin, sin contacto directo con el talento.",
    "We reply personally to every message.",
    "Respondemos personalmente cada mensaje.",
  ),
  r("Start an inquiry", "Iniciar una consulta", "Get in touch", "Contactar"),
  r("Explore talent", "Explorar talento", "See services", "Ver servicios"),
  r("Explore the roster", "Explorar el roster", "See services", "Ver servicios"),
  r("View roster", "Ver roster", "See services", "Ver servicios"),
  r("Ready to start?", "¿Listo para empezar?", "Ready to start?", "¿Listo para empezar?"),
  r(
    "Tell us about your project and our team will respond personally.",
    "Cuéntanos tu proyecto y nuestro equipo responderá personalmente.",
    "Tell us about your project and we will respond personally.",
    "Cuéntanos tu proyecto y responderemos personalmente.",
  ),
  r("Let's work together", "Trabajemos juntos", "Let's work together", "Trabajemos juntos"),
  r(
    "Tell us about your project and we'll respond quickly.",
    "Cuéntanos tu proyecto y responderemos pronto.",
    "Tell us about your project and we'll respond quickly.",
    "Cuéntanos tu proyecto y responderemos pronto.",
  ),
  r("Get in touch", "Ponte en contacto", "Get in touch", "Contacto"),
  r("Contact us", "Contáctanos", "Contact us", "Contáctanos"),
  r(
    "Send a message and our team will get back to you.",
    "Envía un mensaje y nuestro equipo te responderá.",
    "Send a message and we will get back to you.",
    "Envía un mensaje y te responderemos.",
  ),
  r("Your headline here", "Tu titular aquí", "Your headline here", "Tu titular aquí"),
  r("Built for scale", "Hecho para crecer", "Experience that shows", "Experiencia que se nota"),
  r("Talent represented", "Talento representado", "Clients served", "Clientes atendidos"),
  r("Years of experience", "Años de experiencia", "Years of experience", "Años de experiencia"),
  r("Markets worldwide", "Mercados en el mundo", "Places served", "Lugares donde trabajamos"),
  r("Outline the packages and support you provide.", "Resume los paquetes y el apoyo que ofreces.", "Outline the packages and support you provide.", "Resume los paquetes y el apoyo que ofreces."),
  r("Representation", "Representación", "Service one", "Servicio uno"),
  r("Casting", "Casting", "Service two", "Servicio dos"),
  r("Production", "Producción", "Service three", "Servicio tres"),
  r("Talent management, bookings, and career support.", "Gestión de talento, reservas y apoyo de carrera.", "Describe what is included in this service.", "Describe qué incluye este servicio."),
  r("Brief matching and roster curation.", "Selección según el brief y curaduría del roster.", "Describe what is included in this service.", "Describe qué incluye este servicio."),
  r("On-set coordination and client liaison.", "Coordinación en set y enlace con el cliente.", "Describe what is included in this service.", "Describe qué incluye este servicio."),
  r("What we offer", "Lo que ofrecemos", "What we offer", "Lo que ofrecemos"),
  r("• Talent representation and bookings", "• Representación de talento y reservas", "• Your first service", "• Tu primer servicio"),
  r("• Casting and brief matching", "• Casting y selección según el brief", "• Your second service", "• Tu segundo servicio"),
  r("• On-set coordination and logistics", "• Coordinación en set y logística", "• Your third service", "• Tu tercer servicio"),
];
