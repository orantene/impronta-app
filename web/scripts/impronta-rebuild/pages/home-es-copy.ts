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
  "Build your lineup, send it in one message":
    "Arma tu lineup y envíalo en un solo mensaje",
  "Browse the whole roster": "Explora el roster completo",
  "Every represented face, filterable by discipline, language and city.":
    "Cada rostro representado, con filtros por disciplina, idioma y ciudad.",
  "Save the ones you like": "Guarda los que te gusten",
  "The heart on any profile keeps your shortlist while you browse.":
    "El corazón de cada perfil guarda tu preselección mientras exploras.",
  "Send it as one message": "Envíalo en un solo mensaje",
  "Your whole lineup reaches a coordinator in a single brief.":
    "Tu lineup completo llega a un coordinador en un único brief.",
  "We confirm and coordinate": "Confirmamos y coordinamos",
  "Availability, rates and logistics, handled end to end. First reply within 24 hours.":
    "Disponibilidad, tarifas y logística, gestionadas de principio a fin. Primera respuesta en menos de 24 horas.",
  "International Models & Talent Agency · Riviera Maya":
    "Agencia Internacional de Modelos y Talento · Riviera Maya",
  "Impronta is a boutique talent and model agency based on the Riviera Maya, working internationally. Models, hosts, performers, DJs and culinary talent, every one of them met, vetted and represented by an agency that answers for the booking end to end.":
    "Impronta es una agencia boutique de modelos y talento con base en la Riviera Maya y alcance internacional. Modelos, anfitriones, performers, DJs y talento culinario, cada uno conocido en persona, verificado y representado por una agencia que responde por la reserva de principio a fin.",
  "Our talents": "Nuestro talento",
  "Each one is a working roster with real people on it. Browse the talent your brief needs, or search the full directory across all of them.":
    "Cada uno es un roster activo con personas reales. Explora el talento que tu brief necesita, o busca en el directorio completo.",
  "An agency that answers for every booking":
    "Una agencia que responde por cada reserva",
  "Where we work": "Dónde trabajamos",
  "Local faces, international reach": "Rostros locales, alcance internacional",
  "The roster lives on the Riviera Maya and travels for the brief. Hover a city to see the faces working it.":
    "El roster vive en la Riviera Maya y viaja cuando el brief lo pide. Pasa el cursor por una ciudad para ver los rostros que trabajan ahí.",
  "Markets appear here as talent join the roster.":
    "Los mercados aparecen aquí conforme el talento se suma al roster.",
  "An Impronta model in a white top with both arms raised above her head, against a white studio backdrop.":
    "Una modelo de Impronta en top blanco con ambos brazos levantados sobre la cabeza, sobre un fondo de estudio blanco.",
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

  // ── the show teaser (replaced the agency-positioning statement) ───────────
  "Coming soon": "Muy pronto",
  "A show built for": "Un show hecho para",
  "Impronta is producing an original stage show for resorts, beach clubs and hotels along the coast: one company, cast from the roster and rehearsed by the agency, that arrives ready to run on your stage. Venues can hold a date now, and casting is open to performers.":
    "Impronta está produciendo un show original para resorts, beach clubs y hoteles de la costa: una sola compañía, con casting del roster y ensayos a cargo de la agencia, que llega lista para presentarse en tu escenario. Los venues ya pueden apartar fecha y el casting está abierto para performers.",
  "Read more": "Leer más",

  // ── the studio promo (replaced plate II) ──────────────────────────────────
  "The studio": "El estudio",
  "Book the room": "Reserva el espacio",
  "where the work happens.": "donde se hace el trabajo.",
  "Impronta has its own photo studio, and you do not need to be represented by the agency to use it. Book a session for your first portfolio, for a book that no longer looks like you, or simply for good photographs of yourself.":
    "Impronta tiene su propio estudio fotográfico, y no necesitas estar representado por la agencia para usarlo. Reserva una sesión para tu primer portafolio, para un book que ya no se te parece, o simplemente para tener buenas fotos tuyas.",
  "Book a session": "Reserva una sesión",
  "An Impronta model seated in an open white shirt and ripped jeans, hand at his chin, against a white studio backdrop.":
    "Un modelo de Impronta sentado, con camisa blanca abierta y jeans rotos, la mano en el mentón, sobre un fondo de estudio blanco.",

  // ── events band ───────────────────────────────────────────────────────────
  Events: "Eventos",
  "Your event, staffed end to end": "Tu evento, con todo el personal cubierto",
  "One brief covers all of it: hosts and hostesses for the door, performers for the moment the night peaks, a DJ to hold the room, and the faces your brand is remembered by. Build the lineup yourself from the roster, or tell us the date and we build it for you.":
    "Un solo brief cubre todo: anfitriones y edecanes para la entrada, performers para el momento más alto de la noche, un DJ que sostenga la sala y los rostros con los que se recuerda tu marca. Arma tú mismo el line-up desde el roster, o dinos la fecha y lo armamos nosotros.",
  "Start building your lineup": "Empieza a armar tu line-up",
  "Tell us about your event": "Cuéntanos de tu evento",

  // ── closing ───────────────────────────────────────────────────────────────
  "The right face is": "El rostro indicado está",
  "one brief away.": "a un brief de distancia.",
  "Tell us who you are looking for and where. We match the talent, confirm the availability and coordinate the rest.":
    "Cuéntanos a quién buscas y dónde. Nosotros encontramos el talento, confirmamos la disponibilidad y coordinamos el resto.",
  "Browse the roster": "Explorar el directorio",

  // ── image alt text (read by screen readers and by search) ─────────────────
  "An Impronta model in a black bodysuit and tinted sunglasses, photographed against a warm tan studio backdrop.":
    "Una modelo de Impronta en body negro y lentes de sol ambarinos, fotografiada sobre un fondo de estudio color arena.",
  "An Impronta fashion model in a black bodysuit and tinted sunglasses, seated against a warm tan studio backdrop.":
    "Una modelo de moda de Impronta en body negro y lentes de sol ambarinos, sentada sobre un fondo de estudio color arena.",
  "An Impronta model crouching in a black bodysuit and black heels, photographed against a white studio backdrop.":
    "Una modelo de Impronta en cuclillas, con body negro y tacones negros, fotografiada sobre un fondo de estudio blanco.",
  "Close-up studio portrait of an Impronta model with her hands framing her face, against a pale backdrop.":
    "Retrato de estudio en primer plano de una modelo de Impronta con las manos enmarcando su rostro, sobre un fondo claro.",
  "An Impronta model in a white tank top and light jeans, smiling in front of a pale studio backdrop.":
    "Una modelo de Impronta en top blanco y jeans claros, sonriendo frente a un fondo de estudio claro.",
  "An Impronta model reclining in an open white shirt and light jeans on a white studio backdrop.":
    "Un modelo de Impronta recostado, con camisa blanca abierta y jeans claros, sobre un fondo de estudio blanco.",
  "An Impronta model standing in a white shirt over a black top and light jeans, against a grey studio backdrop.":
    "Una modelo de Impronta de pie, con camisa blanca sobre top negro y jeans claros, sobre un fondo de estudio gris.",
  "An Impronta model in a white tank top, smiling, photographed against a white studio backdrop.":
    "Una modelo de Impronta en top blanco, sonriendo, fotografiada sobre un fondo de estudio blanco.",
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
