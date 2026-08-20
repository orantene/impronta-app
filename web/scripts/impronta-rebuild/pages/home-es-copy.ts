/**
 * Spanish copy for the homepage.
 *
 * A MAP, not a second tree. The Spanish homepage is the English one with
 * different words — same sections, same order, same images — so expressing it
 * as a copy map keeps structural parity BY CONSTRUCTION. A parallel `home-es.ts`
 * would be 500 lines that drift the first time someone edits one and not the
 * other, and the drift would be invisible until an operator compared the two
 * pages side by side.
 *
 * Every entry is keyed by the exact English string. `home-es.ts` walks the
 * English tree, swaps visitor-facing text through this map, and a test fails if
 * ANY visitor-facing string comes out untranslated — so adding a sentence to the
 * English homepage breaks the build rather than silently shipping English on
 * the Spanish page.
 *
 * NOT translated on purpose:
 *   - "Impronta" and division names an agency uses in English in this market
 *     ("Performers", "DJs") — a Mexican casting brief says "performers", and
 *     translating a term the client does not use makes the page read as foreign.
 *   - Numerals and symbols ("27+", "<24h", "100%", "01".."04", "I.", "II.", "“").
 *
 * OWNER REVIEW: this copy is mine, not Alejandra's. It is written to be
 * publishable rather than placeholder, but every line is editable in the
 * builder and the owner should read it before it is treated as final.
 */

export const HOME_ES_COPY: Record<string, string> = {
  "A wall of Impronta roster portraits from recent shoots.":
    "Un muro de retratos del roster de Impronta de shoots recientes.",
  "Search everyone, filter by discipline, language and city":
    "Busca a todos, filtra por disciplina, idioma y ciudad",
  // ── hero ──────────────────────────────────────────────────────────────────
  "Models & Talent Agency · Tulum · Riviera Maya":
    "Agencia de Modelos y Talento · Tulum · Riviera Maya",
  "Faces that carry": "Rostros que llevan",
  "the Riviera Maya.": "la Riviera Maya.",
  "Impronta is a boutique talent and model agency in Tulum and Playa del Carmen. Models, hosts, performers, DJs and culinary talent, every one of them met, vetted and represented by an agency that answers for the booking end to end.":
    "Impronta es una agencia boutique de modelos y talento en Tulum y Playa del Carmen. Modelos, anfitriones, performers, DJs y talento culinario: a cada uno lo conocemos en persona, lo verificamos y lo representamos como agencia que responde por la reserva de principio a fin.",
  "Book talent": "Reservar talento",
  "Explore the roster": "Ver el directorio",
  "Agency-managed end to end · first reply within 24 hours":
    "Gestionado por la agencia de principio a fin · primera respuesta en menos de 24 horas",

  // ── marquee + divisions ───────────────────────────────────────────────────
  "Fashion Models": "Modelos de Moda",
  "Hosts & Promoters": "Anfitriones y Promotores",
  Performers: "Performers",
  "Music & DJs": "Música y DJs",
  "Full Roster": "Directorio completo",
  "The divisions": "Las divisiones",
  "One agency, four disciplines": "Una agencia, cuatro disciplinas",
  "Every division is a working roster, not a category label. Browse the discipline your brief needs, or search the full directory across all of them.":
    "Cada división es un roster activo, no una etiqueta. Explora la disciplina que pide tu brief o busca en el directorio completo.",
  "Editorial, runway, campaign and e-commerce":
    "Editorial, pasarela, campaña y e-commerce",
  "Event hosts, hostesses and brand ambassadors":
    "Anfitriones, edecanes y embajadores de marca",
  "Dancers, acts and live entertainment":
    "Bailarines, actos y entretenimiento en vivo",
  "DJs, musicians and curated sound": "DJs, músicos y sonido curado",
  "Explore →": "Explorar →",
  "The full roster": "El directorio completo",
  "Search every represented profile by discipline, look, language and city.":
    "Busca cada perfil representado por disciplina, look, idioma y ciudad.",
  "Open the directory": "Abrir el directorio",

  // ── featured ──────────────────────────────────────────────────────────────
  Selected: "Selección",
  "FEATURED TALENT": "TALENTO DESTACADO",
  Request: "Solicitar",
  "Featured profiles appear here as talent are added to the roster.":
    "Los perfiles destacados aparecen aquí conforme se suma talento al roster.",

  // ── editorial plates ──────────────────────────────────────────────────────
  "She does not walk the runway. She decides where it leads.":
    "No solo camina la pasarela. Decide hacia dónde lleva.",
  "Behind every face, a room of people answerable for every detail.":
    "Detrás de cada rostro, un equipo que responde por cada detalle.",

  // ── statement ─────────────────────────────────────────────────────────────
  "The Impronta way": "La forma Impronta",
  "We do not list faces.": "No listamos rostros.",
  "We stand behind them.": "Respondemos por ellos.",
  "Anyone can build a directory. We built an agency. Before a face reaches your shortlist it has been met in person, its portfolio reviewed, its availability confirmed and its rates agreed. When you book through Impronta, a real coordinator is answerable for every detail, from the first reply to the wrap of the event.":
    "Cualquiera puede armar un directorio. Nosotros construimos una agencia. Antes de que un rostro llegue a tu lista, lo conocimos en persona, revisamos su portafolio, confirmamos su disponibilidad y acordamos sus tarifas. Cuando reservas con Impronta, hay un coordinador real que responde por cada detalle, desde la primera respuesta hasta el cierre del evento.",
  "Reviewed, agency-approved talent only":
    "Solo talento revisado y aprobado por la agencia",
  "Availability confirmed before you commit":
    "Disponibilidad confirmada antes de que te comprometas",
  "Rates, usage and logistics handled for you":
    "Tarifas, usos y logística resueltos por nosotros",

  // ── process ───────────────────────────────────────────────────────────────
  "How it works": "Cómo funciona",
  "A clear, professional process": "Un proceso claro y profesional",
  "Tell us the brief": "Cuéntanos el brief",
  "Dates, market, budget range and the look or skill you need. A sentence is enough to start.":
    "Fechas, mercado, rango de presupuesto y el look o la habilidad que necesitas. Con una frase basta para empezar.",
  "We shortlist options": "Preparamos una preselección",
  "A curated selection from the roster, with availability already checked against your dates.":
    "Una selección curada del roster, con la disponibilidad ya verificada para tus fechas.",
  "Confirm talent": "Confirmas el talento",
  "You choose. We secure the booking, agree rates and usage, and put it in writing.":
    "Tú eliges. Nosotros aseguramos la reserva, acordamos tarifas y usos, y lo dejamos por escrito.",
  "We coordinate": "Coordinamos",
  "Call times, fittings, logistics and on-site coordination, handled by the agency.":
    "Horarios, pruebas de vestuario, logística y coordinación en sitio, a cargo de la agencia.",

  // ── social proof ──────────────────────────────────────────────────────────
  "Client words": "Lo que dicen los clientes",
  "Booked once, booked again": "Reservan una vez y vuelven",
  "The shortlist landed the same day, availability already confirmed. We cast a full activation team in one call.":
    "La preselección llegó el mismo día, con la disponibilidad ya confirmada. Armamos el equipo completo de una activación en una sola llamada.",
  "Event producer · Tulum": "Productora de eventos · Tulum",
  "One coordinator, one thread, zero chasing. The talent arrived briefed, on time and camera-ready.":
    "Un coordinador, un solo hilo, cero perseguir a nadie. El talento llegó briefeado, puntual y listo para cámara.",
  "Brand marketing lead · Mexico City":
    "Responsable de marketing de marca · Ciudad de México",
  "We have worked with agencies in three countries. The level of care here is what kept us coming back.":
    "Hemos trabajado con agencias en tres países. El nivel de cuidado aquí es lo que nos hizo volver.",
  "Creative director · Riviera Maya": "Director creativo · Riviera Maya",

  // ── stats ─────────────────────────────────────────────────────────────────
  "By the numbers": "En números",
  "A working agency, not a listing site":
    "Una agencia que opera, no un sitio de listados",
  "Represented talent": "Talento representado",
  Divisions: "Divisiones",
  "First reply": "Primera respuesta",
  "Agency-managed": "Gestionado por la agencia",

  // ── conversion bands ──────────────────────────────────────────────────────
  "For clients": "Para clientes",
  "Casting for a brand, event or production?":
    "¿Buscas casting para una marca, un evento o una producción?",
  "Tell us the brief and your dates. A coordinator replies personally with a shortlist of available, agency-approved talent.":
    "Cuéntanos el brief y tus fechas. Un coordinador responde personalmente con una preselección de talento disponible y aprobado por la agencia.",
  "Start an inquiry": "Enviar una solicitud",
  "How booking works": "Cómo funciona la reserva",
  "For talent": "Para talento",
  "Model, host, performer, DJ or chef?":
    "¿Eres modelo, anfitrión, performer, DJ o chef?",
  "Apply for representation. If your profile fits the roster, we meet in person, build your professional profile and put you in front of real briefs.":
    "Postúlate para representación. Si tu perfil encaja con el roster, nos conocemos en persona, construimos tu perfil profesional y te ponemos frente a briefs reales.",
  "Apply for representation": "Postularme para representación",
  "What representation means": "Qué significa la representación",
  Start: "Empezar",

  // ── closing ───────────────────────────────────────────────────────────────
  "The right face is": "El rostro indicado está",
  "one brief away.": "a un brief de distancia.",
  "Tell us who you are looking for and where. We match the talent, confirm the availability and coordinate the rest.":
    "Cuéntanos a quién buscas y dónde. Nosotros encontramos el talento, confirmamos la disponibilidad y coordinamos el resto.",
  "Browse the roster": "Explorar el directorio",

  // ── image alt text (read by screen readers and by search) ─────────────────
  "Editorial photograph of an Impronta model at golden hour on the Riviera Maya coast.":
    "Fotografía editorial de una modelo de Impronta a la hora dorada en la costa de la Riviera Maya.",
  "Impronta fashion model in an editorial look, photographed against Tulum architecture.":
    "Modelo de moda de Impronta en un look editorial, fotografiada frente a la arquitectura de Tulum.",
  "Impronta event hostess welcoming guests at a beachfront brand activation.":
    "Edecán de Impronta recibiendo invitados en una activación de marca frente al mar.",
  "Impronta performer mid-show under stage light at a Tulum venue.":
    "Performer de Impronta en pleno show bajo las luces de un venue en Tulum.",
  "Impronta DJ behind the decks at an open-air Riviera Maya event.":
    "DJ de Impronta en la cabina durante un evento al aire libre en la Riviera Maya.",
  "Full-bleed editorial photograph of a model walking through a dramatic Tulum setting.":
    "Fotografía editorial a sangre completa de una modelo caminando en un escenario imponente de Tulum.",
  "Editorial portrait of a represented Impronta talent, lit against a dark studio backdrop.":
    "Retrato editorial de un talento representado por Impronta, iluminado sobre un fondo de estudio oscuro.",
  "Behind the scenes at an Impronta production, the team at work around the talent.":
    "Detrás de cámaras en una producción de Impronta, el equipo trabajando alrededor del talento.",
};

/**
 * Strings a visitor sees that stay in English by DESIGN — numerals, symbols,
 * and the discipline words this market uses in English. Listed explicitly so
 * the "nothing untranslated" test can tell a deliberate choice from an
 * oversight.
 */
export const HOME_ES_KEEP_ENGLISH: ReadonlySet<string> = new Set([
  "Performers",
  "Music & DJs",
  "27+",
  "5",
  "<24h",
  "100%",
  "01",
  "02",
  "03",
  "04",
  "I.",
  "II.",
  "“",
]);
