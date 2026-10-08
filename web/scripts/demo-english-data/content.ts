/**
 * TUL-207: the reviewed English text for the Spanish-primary DEMO talents' data
 * rows. Keyed by profile code. Each entry carries the SPANISH source next to the
 * English, copied from the repo's own demo sources:
 *   Alba (TAL-93020)       design-references/maison-v2/content.json + scripts/demo-talents/alba.ts
 *   Renata, Sofía Campos   scripts/demo-talents/demos.ts
 *   Folio demos            design-references/folio/demos.json (service names and
 *                          descriptions use its own nameEn/descEn) + faqFor() in
 *                          src/lib/talent-site/demos/folio-demo-fixtures.ts
 *   Don Ramón (TAL-93212)  src/lib/talent-site/demos/gridline-demo-fixtures-2.ts (its own English block)
 *
 * The plan matches live rows by the EXISTING Spanish text (trimmed,
 * case-insensitive), never by position, and writes only the `en` key. A text
 * field is filled only when the row's Spanish text equals the Spanish source
 * here, so a row a talent rewrote is reported, not overwritten.
 *
 * Rows with no readable Spanish source are NOT invented: they are listed under
 * `needsContent` and printed by the dry run.
 */

export interface Bilingual {
  es: string;
  en: string;
}

export interface ProfileContent {
  /** The site slug the profile must resolve to at run time (second lock after the profile code). */
  siteSlug: string;
  label: string;
  /** talent_offerings: title_i18n and description_i18n. */
  services: Array<{ title: Bilingual; description?: Bilingual }>;
  /** talent_offerings.category_i18n, matched by the row's Spanish category label. */
  categories: Bilingual[];
  /** talent_faq_items: question_i18n and answer_i18n. */
  faq: Array<{ question: Bilingual; answer: Bilingual }>;
  /** What this script cannot fill because the Spanish source is not in the repo. */
  needsContent: string[];
}

export const CONTENT: Readonly<Record<string, ProfileContent>> = {
  "TAL-93020": {
    siteSlug: "alba-nail-artist",
    label: "Alba (maison-v2-demo)",
    services: [
      { title: { es: "Extensiones de volumen ruso 4D con mapeo personalizado", en: "4D Russian volume extensions with custom mapping" }, description: { es: "Abanicos hechos a mano de cuatro pestañas finas, con un mapeo pensado para la forma de tus ojos. Duran de 3 a 4 semanas con retoque.", en: "Handmade fans of four fine lashes, with a map designed for the shape of your eyes. They last 3 to 4 weeks with a touch-up." } },
      { title: { es: "Pestañas clásicas", en: "Classic lashes" }, description: { es: "Una extensión por cada pestaña natural. Discretas, para todos los días.", en: "One extension for each natural lash. Subtle, for every day." } },
      { title: { es: "Lifting y tinte de pestañas", en: "Lash lift and tint" }, description: { es: "Curva desde la raíz sobre tu propia pestaña, con tinte negro. Dura de 6 a 8 semanas.", en: "A curl from the root on your own lash, with black tint. Lasts 6 to 8 weeks." } },
      { title: { es: "Manicura rusa con gel", en: "Russian manicure with gel" }, description: { es: "Cutícula trabajada en seco con torno, nivelación con rubber base y gel del color que elijas.", en: "Cuticle worked dry with an e-file, leveled with rubber base and gel in the color you choose." } },
      { title: { es: "Gel semipermanente en manos", en: "Gel polish on hands" }, description: { es: "Limado, cutícula básica y gel semipermanente. Dura de 2 a 3 semanas.", en: "Shaping, basic cuticle care and gel polish. Lasts 2 to 3 weeks." } },
      { title: { es: "Acrílico esculpido, juego nuevo", en: "Sculpted acrylic, new set" }, description: { es: "Uñas esculpidas en acrílico sobre molde, con la forma y el largo que quieras.", en: "Acrylic nails sculpted on a form, in the shape and length you want." } },
      { title: { es: "Nail art a mano alzada", en: "Freehand nail art" }, description: { es: "Diseños pintados a mano. Mándame tu idea o una foto de referencia y te confirmo tiempo y precio.", en: "Hand-painted designs. Send me your idea or a reference photo and I will confirm time and price." } },
      { title: { es: "Laminado de cejas con diseño", en: "Brow lamination with shaping" }, description: { es: "Cejas peinadas y fijadas hacia arriba, con diseño y depilación con hilo.", en: "Brows brushed up and set, with shaping and threading." } },
      { title: { es: "Novia: uñas y pestañas a domicilio", en: "Bridal: nails and lashes on location" }, description: { es: "Para el día de tu boda, en tu hotel o casa. Incluye prueba previa. Cotizo según fecha, lugar y personas.", en: "For your wedding day, at your hotel or home. Includes a trial first. I quote by date, place and number of people." } },
    ],
    categories: [
      { es: "Pestañas", en: "Lashes" },
      { es: "Uñas", en: "Nails" },
      { es: "Cejas", en: "Brows" },
      { es: "Novias", en: "Bridal" },
    ],
    faq: [
      { question: { es: "¿Puedo hacerme pestañas y uñas el mismo día?", en: "Can I get lashes and nails on the same day?" }, answer: { es: "Sí. Elige los dos servicios y te doy una sola cita: primero pestañas, luego manicura, con 10 minutos entre uno y otro.", en: "Yes. Choose both services and I will give you a single appointment: lashes first, then the manicure, with 10 minutes between the two." } },
      { question: { es: "¿Cuánto duran las extensiones?", en: "How long do the extensions last?" }, answer: { es: "De 3 a 4 semanas. Te recomiendo retoque a las 2 o 3 semanas.", en: "3 to 4 weeks. I recommend a touch-up at 2 or 3 weeks." } },
      { question: { es: "¿Qué pasa si llego tarde?", en: "What if I arrive late?" }, answer: { es: "Te espero hasta 15 minutos. Si vas a llegar más tarde, escríbele a Alba: te dice si se puede hacer el servicio completo o si conviene reprogramar.", en: "I wait up to 15 minutes. If you will be later, message Alba: she will tell you whether the full service can still be done or whether it is better to reschedule." } },
      { question: { es: "¿Cómo pago?", en: "How do I pay?" }, answer: { es: "Para apartar pestañas, pagas en línea con tarjeta un anticipo del 25 % del precio. Los demás servicios no piden pago por adelantado. El resto se paga en persona el día de tu cita: efectivo o transferencia.", en: "To reserve lashes, you pay a 25% deposit online by card. Other services do not ask for payment in advance. The rest is paid in person on the day of your appointment: cash or transfer." } },
      { question: { es: "¿Qué pasa si llego tarde?", en: "What if I arrive late?" }, answer: { es: "Te espero 15 minutos. Después tal vez haya que ajustar el servicio para no retrasar a la siguiente clienta.", en: "I wait 15 minutes. After that, the service may need to be adjusted so the next client is not delayed." } },
      { question: { es: "¿Cómo pago?", en: "How do I pay?" }, answer: { es: "El anticipo de pestañas se paga en línea con tarjeta. El resto, en el estudio con tarjeta, efectivo o transferencia.", en: "The lash deposit is paid online by card. The rest is paid at the studio by card, cash or transfer." } },
    ],
    needsContent: [],
  },
  "TAL-93002": {
    siteSlug: "renata-lashes",
    label: "Renata Salgado",
    services: [
      { title: { es: "Pestañas clásicas", en: "Classic lashes" }, description: { es: "Set completo, una extensión por pestaña natural.", en: "Full set, one extension per natural lash." } },
      { title: { es: "Volumen ruso", en: "Russian volume" }, description: { es: "Set completo con abanicos hechos a mano.", en: "Full set with handmade fans." } },
      { title: { es: "Lifting y tinte", en: "Lift and tint" }, description: { es: "Curvatura natural que dura de 6 a 8 semanas.", en: "Natural curl that lasts 6 to 8 weeks." } },
      { title: { es: "Retoque de pestañas", en: "Lash touch-up" }, description: { es: "Relleno entre 2 y 3 semanas después de tu set.", en: "Fill 2 to 3 weeks after your set." } },
    ],
    categories: [],
    faq: [],
    needsContent: ["FAQ (the Spanish source is not in the repo)", "service category labels (the repo seed has none)"],
  },
  "TAL-93105": {
    siteSlug: "sofia-rinaldi",
    label: "Sofía Rinaldi",
    services: [],
    categories: [],
    faq: [],
    needsContent: ["services, FAQ and category labels (the Spanish source lives outside the repo, in the Demo Foundation batch files)"],
  },
  "TAL-93007": {
    siteSlug: "sofia-barra",
    label: "Sofía Campos (sofia-barra-demo)",
    services: [
      { title: { es: "Barra para evento", en: "Event bar" }, description: { es: "Cinco horas, hasta 60 invitados.", en: "Five hours, up to 60 guests." } },
      { title: { es: "Taller de coctelería", en: "Cocktail workshop" }, description: { es: "Dos horas para grupos pequeños.", en: "Two hours for small groups." } },
    ],
    categories: [],
    faq: [],
    needsContent: ["FAQ (the repo seed has none)", "service category labels (the repo seed has none)"],
  },
  "TAL-93004": {
    siteSlug: "lucia-herrera",
    label: "Lucía Herrera",
    services: [
      { title: { es: "Sesión de catálogo, medio día", en: "Half-day catalog shoot" }, description: { es: "Hasta 4 horas en estudio o locación dentro de CDMX.", en: "Up to 4 hours in studio or on location within Mexico City." } },
      { title: { es: "Campaña", en: "Campaign" }, description: { es: "Día completo; uso en pauta, territorio y viajes se cotizan aparte.", en: "Full day; ad usage, territory and travel are quoted separately." } },
      { title: { es: "Fitting", en: "Fitting" }, description: { es: "Prueba de vestuario antes de la sesión, en tu estudio o showroom.", en: "Wardrobe fitting before the shoot, at your studio or showroom." } },
      { title: { es: "Día de contenido UGC", en: "UGC content day" }, description: { es: "Fotos y video vertical para redes con entrega de archivos.", en: "Vertical photo and video for social media with file delivery." } },
    ],
    categories: [
      { es: "Sesiones", en: "Sessions" },
      { es: "Campañas", en: "Campaigns" },
      { es: "Preproducción", en: "Pre-production" },
      { es: "Contenido", en: "Content" },
    ],
    faq: [
      { question: { es: "¿Viajas fuera de la ciudad?", en: "Do you travel outside the city?" }, answer: { es: "Sí, con traslado cotizado. Cuéntame la ciudad y las fechas.", en: "Yes, with travel quoted separately. Tell me the city and the dates." } },
      { question: { es: "¿Cuánto tarda en responder?", en: "How long does it take you to reply?" }, answer: { es: "El mismo día hábil. Si es urgente, escribe la fecha en el asunto.", en: "The same business day. If it is urgent, put the date in the subject line." } },
      { question: { es: "¿Incluye derechos de uso?", en: "Do the rates include usage rights?" }, answer: { es: "Las tarifas base cubren la sesión. Pauta, territorio y plazo se cotizan aparte.", en: "Base rates cover the session. Ad placement, territory and term are quoted separately." } },
    ],
    needsContent: [],
  },
  "TAL-93111": {
    siteSlug: "noemi-castaneda",
    label: "Noemí Castañeda",
    services: [
      { title: { es: "Desfile", en: "Runway show" }, description: { es: "Show, ensayo y fitting del mismo día, hasta 6 horas en total.", en: "Show, rehearsal and fitting on the same day, up to 6 hours in total." } },
      { title: { es: "Presentación en showroom", en: "Showroom presentation" }, description: { es: "Hasta 3 horas modelando piezas para compradores o prensa.", en: "Up to 3 hours modeling pieces for buyers or press." } },
      { title: { es: "Fitting previo", en: "Pre-show fitting" }, description: { es: "Prueba de vestuario días antes del show.", en: "Wardrobe fitting days before the show." } },
      { title: { es: "Temporada de desfiles", en: "Fashion week season" }, description: { es: "Varios shows en la misma semana de moda.", en: "Several shows in the same fashion week." } },
    ],
    categories: [
      { es: "Pasarela", en: "Runway" },
      { es: "Presentaciones", en: "Presentations" },
      { es: "Preproducción", en: "Pre-production" },
    ],
    faq: [
      { question: { es: "¿Viajas fuera de la ciudad?", en: "Do you travel outside the city?" }, answer: { es: "Sí, con traslado cotizado. Cuéntame la ciudad y las fechas.", en: "Yes, with travel quoted separately. Tell me the city and the dates." } },
      { question: { es: "¿Cuánto tarda en responder?", en: "How long does it take you to reply?" }, answer: { es: "El mismo día hábil. Si es urgente, escribe la fecha en el asunto.", en: "The same business day. If it is urgent, put the date in the subject line." } },
      { question: { es: "¿Incluye derechos de uso?", en: "Do the rates include usage rights?" }, answer: { es: "Las tarifas base cubren la sesión. Pauta, territorio y plazo se cotizan aparte.", en: "Base rates cover the session. Ad placement, territory and term are quoted separately." } },
    ],
    needsContent: [],
  },
  "TAL-93113": {
    siteSlug: "elena-garza-trevino",
    label: "Elena Garza Treviño",
    services: [
      { title: { es: "Sesión lifestyle", en: "Lifestyle session" }, description: { es: "Hasta 4 horas en locación dentro de San Miguel.", en: "Up to 4 hours on location within San Miguel." } },
      { title: { es: "Retrato editorial", en: "Editorial portrait" }, description: { es: "Sesión corta para revista, libro o proyecto personal.", en: "Short session for a magazine, book or personal project." } },
      { title: { es: "Campaña de marca", en: "Brand campaign" }, description: { es: "Día completo con derechos de uso por medios y plazo.", en: "Full day with usage rights by media and term." } },
      { title: { es: "Rodaje fuera de San Miguel", en: "Shoot outside San Miguel" }, description: { es: "Día de trabajo en Querétaro, CDMX o Guanajuato con traslado cubierto.", en: "Working day in Querétaro, Mexico City or Guanajuato with travel covered." } },
    ],
    categories: [
      { es: "Sesiones", en: "Sessions" },
      { es: "Campañas", en: "Campaigns" },
    ],
    faq: [
      { question: { es: "¿Trabajas en español e inglés?", en: "Do you work in Spanish and English?" }, answer: { es: "Sí. Puedo dirigir la sesión en cualquiera de los dos.", en: "Yes. I can run the session in either." } },
      { question: { es: "¿Viajas fuera de la ciudad?", en: "Do you travel outside the city?" }, answer: { es: "Sí, con traslado cotizado. Cuéntame la ciudad y las fechas.", en: "Yes, with travel quoted separately. Tell me the city and the dates." } },
      { question: { es: "¿Cuánto tarda en responder?", en: "How long does it take you to reply?" }, answer: { es: "El mismo día hábil. Si es urgente, escribe la fecha en el asunto.", en: "The same business day. If it is urgent, put the date in the subject line." } },
      { question: { es: "¿Incluye derechos de uso?", en: "Do the rates include usage rights?" }, answer: { es: "Las tarifas base cubren la sesión. Pauta, territorio y plazo se cotizan aparte.", en: "Base rates cover the session. Ad placement, territory and term are quoted separately." } },
    ],
    needsContent: [],
  },
  "TAL-93114": {
    siteSlug: "rafael-hernandez-cuevas",
    label: "Rafa Cuevas",
    services: [
      { title: { es: "Sesión de modelaje", en: "Modeling session" }, description: { es: "Hasta 4 horas de foto en hotel, playa o locación en Vallarta.", en: "Up to 4 hours of photo at a hotel, beach or location in Vallarta." } },
      { title: { es: "Show acústico", en: "Acoustic show" }, description: { es: "Dos sets de 45 minutos con guitarra y equipo de sonido.", en: "Two 45-minute sets with guitar and sound system." } },
      { title: { es: "Canción para ceremonia", en: "Ceremony song" }, description: { es: "Una a tres canciones en vivo durante la ceremonia de boda.", en: "One to three live songs during the wedding ceremony." } },
      { title: { es: "Campaña foto y música", en: "Photo and music campaign" }, description: { es: "Imagen de campaña y jingle o canción en video para la marca.", en: "Campaign image plus a jingle or song on video for the brand." } },
    ],
    categories: [
      { es: "Modelaje", en: "Modeling" },
      { es: "Música en vivo", en: "Live music" },
      { es: "Campañas", en: "Campaigns" },
    ],
    faq: [
      { question: { es: "¿Puedo contratar foto y música el mismo día?", en: "Can I book photo and music on the same day?" }, answer: { es: "Sí. Cotizo paquete cuando la campaña y el show van juntos.", en: "Yes. I quote a package when the campaign and the show go together." } },
      { question: { es: "¿Llevas equipo de sonido?", en: "Do you bring sound equipment?" }, answer: { es: "Llevo un set básico. Para eventos grandes pedimos PA del venue.", en: "I bring a basic set. For large events we ask for the venue's PA system." } },
      { question: { es: "¿Cuánto tarda en responder?", en: "How long does it take you to reply?" }, answer: { es: "El mismo día hábil. Si es urgente, escribe la fecha en el asunto.", en: "The same business day. If it is urgent, put the date in the subject line." } },
      { question: { es: "¿Incluye derechos de uso?", en: "Do the rates include usage rights?" }, answer: { es: "Las tarifas base cubren la sesión. Pauta, territorio y plazo se cotizan aparte.", en: "Base rates cover the session. Ad placement, territory and term are quoted separately." } },
    ],
    needsContent: [],
  },
  "TAL-93212": {
    siteSlug: "ramon-gutierrez-pacheco",
    label: "Don Ramón Arreglos",
    services: [
      { title: { es: "Visita para lista de arreglos", en: "Visit for your repair list" }, description: { es: "Reviso tu lista, te doy precio y resuelvo lo rápido en esa visita.", en: "I review your list, quote it and fix the quick items during that visit." } },
      { title: { es: "Hora de arreglos", en: "Hour of repairs" }, description: { es: "Colgar, ajustar, cambiar chapas o sellar, por hora con herramienta.", en: "Hanging, adjusting, changing locks or sealing, per hour with tools." } },
      { title: { es: "Armado de muebles", en: "Furniture assembly" }, description: { es: "Por mueble mediano como cómoda, escritorio o base de cama.", en: "Per medium piece such as a dresser, desk or bed frame." } },
      { title: { es: "Casa lista antes de llegar", en: "Home ready before you arrive" }, description: { es: "Revisión y arreglos previos a tu temporada; precio según lista.", en: "Inspection and repairs before your season; price depends on the list." } },
    ],
    categories: [
      { es: "Visitas", en: "Visits" },
      { es: "Muebles", en: "Furniture" },
      { es: "Casas de temporada", en: "Seasonal homes" },
    ],
    faq: [
      { question: { es: "¿Qué incluye la visita?", en: "What does the visit include?" }, answer: { es: "Reviso tu lista, te doy precio y resuelvo lo rápido en esa misma visita. Lo que requiere más tiempo queda cotizado.", en: "I review your list, quote it and fix the quick items during that same visit. Anything that needs more time is quoted." } },
      { question: { es: "¿Traes herramienta?", en: "Do you bring tools?" }, answer: { es: "Sí. La visita y la hora de arreglos incluyen mi herramienta. Los materiales se compran contigo, con ticket.", en: "Yes. The visit and the hour of repairs include my tools. Materials are bought with you, with a receipt." } },
      { question: { es: "¿Atiendes casas de temporada?", en: "Do you take care of seasonal homes?" }, answer: { es: "Sí. Reviso y arreglo antes de que llegues, y te mando fotos al terminar. El precio depende de tu lista.", en: "Yes. I inspect and repair before you arrive and send photos when I finish. The price depends on your list." } },
      { question: { es: "¿Puedo escribirte en inglés?", en: "Can I write to you in English?" }, answer: { es: "Sí. El sitio está en español e inglés y recibo tus mensajes en ambos idiomas.", en: "Yes. The site is in Spanish and English, and I receive your messages in both languages." } },
    ],
    needsContent: ["nothing: the repo fixture already carries English for this demo, so rows that have it are skipped"],
  },
};
