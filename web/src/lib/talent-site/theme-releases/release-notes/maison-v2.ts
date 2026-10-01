/**
 * THEME RELEASES: authored notes for Maison v2 release 2.1 (EN/ES).
 *
 * The release manager imports this to prefill the draft release: `codeNotes`
 * go to `diffDesignPayloads` (a renderer fix has no payload diff), `byItemId`
 * maps a generated candidate id to its note, `layoutKeys` lists the two
 * candidate layout ids that together are ONE opt-in change (the inset node is
 * removed at its old key and a keyed replacement appears), and `notes` is the
 * release-level summary.
 */
export interface ReleaseNote {
  en: string;
  es: string;
}

export const MAISON_V2_RELEASE_2_1 = {
  design: "maison-v2",
  /** The catalog version this release ships (2.1 = v15). */
  toVersion: 15,
  notes: {
    en: "Maison v2 2.1: a new Before and after block, roomier menu rows, an optional bottom-left hero photo and a cleaner price line on phones.",
    es: "Maison v2 2.1: un nuevo bloque Antes y después, filas del menú con más aire, una foto del inicio opcional abajo a la izquierda y un precio mejor ajustado en móvil.",
  } satisfies ReleaseNote,
  /** Passed to `diffDesignPayloads` as `codeNotes` (becomes `code:1`). */
  codeNotes: [
    {
      en: "Prices in the menu no longer break awkwardly on narrow phones.",
      es: "Los precios del menú ya no se cortan mal en móviles estrechos.",
    },
  ] satisfies ReleaseNote[],
  /** Candidate id (from `diffDesignPayloads`) to note. */
  byItemId: {
    "new-block:home:before_after": {
      en: "New optional block: Before and after, two photos side by side. You choose both photos.",
      es: "Nuevo bloque opcional: Antes y después, dos fotos lado a lado. Tú eliges las dos fotos.",
    },
    "token-default:layout.menu-row-gap": {
      en: "Menu rows have 4px more room between them (only if you have not changed the spacing yourself).",
      es: "Las filas del menú tienen 4px más de espacio entre sí (solo si no cambiaste el espacio tú).",
    },
    "layout:home:hero/container#2/image#2:removed": {
      en: "Hero photo inset moves to the bottom-left. Preview it before you choose.",
      es: "La foto pequeña del inicio pasa abajo a la izquierda. Míralo antes de elegir.",
    },
    "layout:home:hero/container#2/hero_inset_bl": {
      en: "Hero photo inset moves to the bottom-left. Preview it before you choose.",
      es: "La foto pequeña del inicio pasa abajo a la izquierda. Míralo antes de elegir.",
    },
  } satisfies Record<string, ReleaseNote>,
  /**
   * The two candidate layout ids that are ONE opt-in change for the talent
   * (the old inset is removed at its key, a keyed replacement appears).
   */
  layoutKeys: [
    "layout:home:hero/container#2/image#2:removed",
    "layout:home:hero/container#2/hero_inset_bl",
  ],
} as const;

/**
 * Release 2.2 (v15 to v16, update round 2): defaults only, nothing new to
 * place. Token and variant defaults reach untouched parts on their own; a
 * talent's own values always win.
 */
export const MAISON_V2_RELEASE_2_2 = {
  design: "maison-v2",
  toVersion: 16,
  notes: {
    en: "Maison v2 2.2: slightly tighter headings, roomier buttons and reviews that show arrows and up to nine quotes.",
    es: "Maison v2 2.2: títulos un poco más juntos, botones con más espacio interior y reseñas con flechas y hasta nueve citas.",
  } satisfies ReleaseNote,
  codeNotes: [] satisfies ReleaseNote[],
  byItemId: {
    "token-default:type.display-tracking": {
      en: "Headings sit a touch tighter (only if you have not changed the letter spacing yourself).",
      es: "Los títulos quedan un poco más juntos (solo si no cambiaste el espaciado de letras tú).",
    },
    "token-default:button.padding-x": {
      en: "Buttons have a little more room inside (only if you have not changed the button padding yourself).",
      es: "Los botones tienen un poco más de espacio interior (solo si no cambiaste el relleno del botón tú).",
    },
    "variant-default:home:reviews/reviews": {
      en: "Reviews show previous and next arrows and up to nine quotes (only if you have not edited that section).",
      es: "Las reseñas muestran flechas y hasta nueve citas (solo si no editaste esa sección).",
    },
  } satisfies Record<string, ReleaseNote>,
} as const;

/**
 * Release 2.3 (v16 to v17, update round 3): one opt-in layout change and one
 * critical accessibility fix. The services catalog moves to two-column cards
 * under its own key (old key removed + keyed replacement = ONE opt-in change).
 * The critical item names the contact band AND its eyebrow explicitly, so a
 * site that removed the whole band still gets it back with the fix.
 */
export const MAISON_V2_RELEASE_2_3 = {
  design: "maison-v2",
  toVersion: 17,
  /** The removal + keyed replacement of the services catalog is ONE opt-in change. */
  layoutKeys: ["layout:home:services/services_catalog:removed", "layout:home:services/services_two_col"],
  layoutGroupId: "layout:maison-v2:services-two-col",
  notes: {
    en: "Maison v2 2.3: an optional two-column layout for your services and an important readability fix on the contact section.",
    es: "Maison v2 2.3: un diseño opcional de dos columnas para tus servicios y una corrección importante de legibilidad en la sección de contacto.",
  } satisfies ReleaseNote,
  codeNotes: [] satisfies ReleaseNote[],
  byItemId: {
    "layout:home:services/services_catalog:removed": {
      en: "Services move to two columns of cards. Preview it before you choose.",
      es: "Los servicios pasan a dos columnas de tarjetas. Míralo antes de elegir.",
    },
    "layout:home:services/services_two_col": {
      en: "Services move to two columns of cards. Preview it before you choose.",
      es: "Los servicios pasan a dos columnas de tarjetas. Míralo antes de elegir.",
    },
    "variant-default:home:contact/paragraph": {
      en: "Important fix: the small heading above your questions is now dark enough to read easily. It applies to every site, even if you removed or changed that section.",
      es: "Corrección importante: el título pequeño sobre tus preguntas ahora es lo bastante oscuro para leerse bien. Se aplica a todos los sitios, aunque hayas quitado o cambiado esa sección.",
    },
    "variant-default:home:before_after/paragraph": {
      en: "Important fix: the small heading above Before and after is now dark enough to read easily. It only touches that heading, and only on sites that have the block.",
      es: "Corrección importante: el título pequeño sobre Antes y después ahora es lo bastante oscuro para leerse bien. Solo toca ese título, y solo en sitios que tienen el bloque.",
    },
  } satisfies Record<string, ReleaseNote>,
  /**
   * Flagged critical by the admin: forced and announced. The contact band also
   * names itself so a site that removed it gets it back; the optional Before
   * and after block names only its eyebrow (a removed block stays removed).
   */
  criticalIds: ["variant-default:home:contact/paragraph", "variant-default:home:before_after/paragraph"],
  criticalKeys: {
    "variant-default:home:contact/paragraph": ["contact", "contact/paragraph"],
    "variant-default:home:before_after/paragraph": ["before_after/paragraph"],
  },
} as const;

/**
 * Release 2.4 (v17 to v18, update round 4): one new optional block and one
 * reorder. Both are opt-in: the block is offered with a placement picker, and
 * the order change only applies if the talent has not reordered her page.
 */
export const MAISON_V2_RELEASE_2_4 = {
  design: "maison-v2",
  toVersion: 18,
  notes: {
    en: "Maison v2 2.4: a new optional Aftercare tips block, and reviews move up to sit right under the top of your page.",
    es: "Maison v2 2.4: un nuevo bloque opcional de Cuidados posteriores, y las reseñas suben para quedar justo debajo de la parte superior de tu página.",
  } satisfies ReleaseNote,
  codeNotes: [] satisfies ReleaseNote[],
  byItemId: {
    "new-block:home:aftercare": {
      en: "New optional block: Aftercare tips, three short cards you can rewrite for your own work.",
      es: "Nuevo bloque opcional: Cuidados posteriores, tres tarjetas breves que puedes reescribir para tu trabajo.",
    },
    "layout:home:(root):order": {
      en: "Reviews move above your gallery so new visitors see what clients say first. Preview it before you choose.",
      es: "Las reseñas suben sobre tu galería para que quien llega vea primero lo que dicen tus clientes. Míralo antes de elegir.",
    },
  } satisfies Record<string, ReleaseNote>,
} as const;

/**
 * Release 2.5 (v18 to v19, "look only"): a softer look, no engine changes.
 *
 * Automatic (token and variant defaults, reach untouched parts only):
 *   - the soft card look (`shape.chrome`), section spacing and header bar tokens;
 *   - the section rhythm (88px bands, raised-surface bands for the ticker, menu
 *     and About), the ticker band, framed work cards, the hero chip link and the
 *     header's fifth link.
 * Opt-in (layout items, the talent chooses):
 *   - the menu swaps from the 2.3 photo cards to two columns of raised row cards
 *     (removal + keyed replacement = ONE item, like 2.3);
 *   - new About actions: "See services" and "Write me".
 * Hero eyebrow and proof line are content (`{{token}}` text), which a release
 * never rewrites, so they reach newly applied sites only.
 */
export const MAISON_V2_RELEASE_2_5 = {
  design: "maison-v2",
  toVersion: 19,
  /** The removal + keyed replacement of the menu catalog is ONE opt-in change. */
  layoutKeys: ["layout:home:services/services_two_col:removed", "layout:home:services/services_row_cards"],
  layoutGroupId: "layout:maison-v2:services-row-cards",
  notes: {
    en: "Maison v2 2.5: a softer look. Sections alternate between your page color and a raised band, work photos sit in framed cards, your questions and reviews become cards, and you can choose raised menu cards and new buttons under About.",
    es: "Maison v2 2.5: un aspecto más suave. Las secciones alternan entre el color de tu página y una franja elevada, las fotos de trabajo van en tarjetas con marco, tus preguntas y reseñas pasan a tarjetas, y puedes elegir tarjetas elevadas en el menú y nuevos botones en Sobre mí.",
  } satisfies ReleaseNote,
  codeNotes: [] satisfies ReleaseNote[],
  byItemId: {
    "token-default:shape.chrome": {
      en: "Soft cards for your questions, reviews, menu chips and header, and a friendlier look across the page (only if you have not changed the card look yourself).",
      es: "Tarjetas suaves para tus preguntas, reseñas, etiquetas del menú y encabezado, y un aspecto más amable en toda la página (solo si no cambiaste el aspecto de las tarjetas tú).",
    },
    "token-default:layout.section-pad-top": {
      en: "More space above each section on desktop (only if you have not changed the spacing yourself).",
      es: "Más espacio sobre cada sección en escritorio (solo si no cambiaste el espacio tú).",
    },
    "token-default:layout.section-pad-top-phone": {
      en: "More space above each section on phones (only if you have not changed the spacing yourself).",
      es: "Más espacio sobre cada sección en móvil (solo si no cambiaste el espacio tú).",
    },
    "token-default:layout.section-pad-bottom": {
      en: "More space below each section on desktop (only if you have not changed the spacing yourself).",
      es: "Más espacio bajo cada sección en escritorio (solo si no cambiaste el espacio tú).",
    },
    "token-default:layout.section-pad-bottom-phone": {
      en: "More space below each section on phones (only if you have not changed the spacing yourself).",
      es: "Más espacio bajo cada sección en móvil (solo si no cambiaste el espacio tú).",
    },
    "token-default:layout.header-pad-y": {
      en: "A roomier header bar on desktop (only if you have not changed the header spacing yourself).",
      es: "Una barra de encabezado con más aire en escritorio (solo si no cambiaste el espacio del encabezado tú).",
    },
    "token-default:layout.header-pad-y-phone": {
      en: "A slimmer header bar on phones (only if you have not changed the header spacing yourself).",
      es: "Una barra de encabezado más delgada en móvil (solo si no cambiaste el espacio del encabezado tú).",
    },
    "variant-default:shell:header": {
      en: "The header links now include About, and Location replaces Your visit (only if you have not edited the header yourself).",
      es: "Los enlaces del encabezado ahora incluyen Sobre mí, y Ubicación reemplaza a Tu visita (solo si no editaste el encabezado tú).",
    },
    "variant-default:home:hero/container#2/next_free_chip": {
      en: "The next free time card on your hero photo jumps to your menu when tapped (only if you have not edited it).",
      es: "La tarjeta del próximo horario libre sobre tu foto principal lleva a tu menú al tocarla (solo si no la editaste tú).",
    },
    "variant-default:home:reviews": {
      en: "The reviews section has more room above and below (only if you have not edited that section).",
      es: "La sección de reseñas tiene más espacio arriba y abajo (solo si no editaste esa sección).",
    },
    "variant-default:home:gallery/marquee": {
      en: "The ticker becomes a band on the raised surface with a little more air (only if you have not edited it).",
      es: "La cinta de palabras pasa a ser una franja sobre la superficie elevada, con un poco más de aire (solo si no la editaste tú).",
    },
    "variant-default:home:gallery/portfolio": {
      en: "Recent work shows framed cards with the name and an arrow, and up to six photos on phones (only if you have not edited that section).",
      es: "Trabajo reciente muestra tarjetas con marco, con el nombre y una flecha, y hasta seis fotos en móvil (solo si no editaste esa sección).",
    },
    "variant-default:home:services": {
      en: "The menu sits on a raised band with more room around it (only if you have not edited that section).",
      es: "El menú queda sobre una franja elevada con más espacio alrededor (solo si no editaste esa sección).",
    },
    "variant-default:home:before_after": {
      en: "Before and after has more room above and below (only if you have not edited that block).",
      es: "Antes y después tiene más espacio arriba y abajo (solo si no editaste ese bloque).",
    },
    "variant-default:home:aftercare": {
      en: "Aftercare tips have more room above and below (only if you have not edited that block).",
      es: "Cuidados posteriores tiene más espacio arriba y abajo (solo si no editaste ese bloque).",
    },
    "variant-default:home:about": {
      en: "About sits on a raised band with more room around it (only if you have not edited that section).",
      es: "Sobre mí queda sobre una franja elevada con más espacio alrededor (solo si no editaste esa sección).",
    },
    "variant-default:home:visit": {
      en: "Your visit has more room above and below (only if you have not edited that section).",
      es: "Tu visita tiene más espacio arriba y abajo (solo si no editaste esa sección).",
    },
    "variant-default:home:contact": {
      en: "Your questions become cards, two columns on desktop, with more room around them (only if you have not edited that section).",
      es: "Tus preguntas pasan a ser tarjetas, en dos columnas en escritorio, con más espacio alrededor (solo si no editaste esa sección).",
    },
    "layout:home:services/services_two_col:removed": {
      en: "Services move to two columns of raised cards with a soft button. Preview it before you choose.",
      es: "Los servicios pasan a dos columnas de tarjetas elevadas con un botón suave. Míralo antes de elegir.",
    },
    "layout:home:services/services_row_cards": {
      en: "Services move to two columns of raised cards with a soft button. Preview it before you choose.",
      es: "Los servicios pasan a dos columnas de tarjetas elevadas con un botón suave. Míralo antes de elegir.",
    },
    "layout:home:about/container/about_actions": {
      en: "New buttons under your About text: See services, and Write me, which opens the chat. Preview it before you choose.",
      es: "Nuevos botones bajo tu texto de Sobre mí: Ver servicios, y Escríbeme, que abre el chat. Míralo antes de elegir.",
    },
  } satisfies Record<string, ReleaseNote>,
} as const;

/**
 * Release 2.6 (v19 to v20, slice "chrome"): defaults only, nothing new to
 * place. The header gets a phone section switcher (only if the header has not
 * been edited), and the once-per-visit help bubble turns on (only if the
 * talent has not set it herself). Chat and dock improvements ship as platform
 * code for every design: the context card with quick questions, the way back
 * to the booking, services inside the chat, the dock photo and the toasts.
 */
export const MAISON_V2_RELEASE_2_6 = {
  design: "maison-v2",
  toVersion: 20,
  notes: {
    en: "Maison v2 2.6: on phones, a section switcher in the header; a small help bubble above the chat button; a richer chat that keeps your booking one tap away; and a new optional Location section (your address stays private unless you choose to show it).",
    es: "Maison v2 2.6: en teléfonos, un selector de secciones en el encabezado; una burbuja de ayuda sobre el botón del chat; un chat más completo que mantiene tu reserva a un toque; y una nueva sección opcional de Ubicación (tu dirección sigue privada a menos que elijas mostrarla).",
  } satisfies ReleaseNote,
  codeNotes: [
    {
      en: "Chat: a card for the service you are asking about with three quick questions, a Back to my booking button, and your services inside the chat.",
      es: "Chat: una tarjeta del servicio por el que preguntas con tres preguntas rápidas, un botón Volver a mi reserva y tus servicios dentro del chat.",
    },
    {
      en: "A small help bubble appears above the chat button once per visit, after a visitor scrolls. It turns on when you apply this update; you can switch it off in the theme panel.",
      es: "Aparece una burbuja de ayuda pequeña sobre el botón del chat, una vez por visita, cuando la persona hace scroll. Se activa al aplicar esta actualización; puedes apagarla en el panel del tema.",
    },
    {
      en: "The booking bar shows your photo on the chat button, and its notices are clearer. If a time is taken while booking, you see it on the time step with three times that still fit.",
      es: "La barra de reserva muestra tu foto en el botón del chat y sus avisos son más claros. Si un horario se ocupa mientras reservas, lo ves en el paso de la hora con tres horarios que sí caben.",
    },
  ] satisfies ReleaseNote[],
  byItemId: {
    "variant-default:shell:header": {
      en: "On phones, your header shows the current section with a menu of every section (only if you have not edited your header).",
      es: "En teléfonos, tu encabezado muestra la sección actual con un menú de todas las secciones (solo si no editaste tu encabezado).",
    },
    "new-block:home:location": {
      en: "New optional block: Location. It shows your zone, hours and how to arrive, and follows the address setting in Services, Defaults (zone only, exact address after booking, or public).",
      es: "Nuevo bloque opcional: Ubicación. Muestra tu zona, tu horario y cómo llegar, y sigue el ajuste de dirección en Servicios, Valores predeterminados (solo la zona, dirección exacta al reservar, o pública).",
    },
  } satisfies Record<string, ReleaseNote>,
} as const;

/**
 * Release 2.7 (v20 to v21, "hero + footer"; v20 is the chrome and location
 * slice): the hero and the footer follow the talent's own profile.
 *
 * Automatic (design defaults, reach untouched parts only):
 *   - the four hero lines (headline, eyebrow, tagline, proof line) become LIVE:
 *     the platform fills them from her profile at render time, so her headline,
 *     trade and city, tagline, years, languages and reviews stay true without a
 *     re-apply. A line she rewrote keeps her words;
 *   - the footer color token (light by default, dark as an option in the theme
 *     drawer) only matters to the new footer.
 * Opt-in (layout item, the talent chooses):
 *   - the footer becomes the light rich footer ("Nos vemos pronto.", a booking
 *     button, Where and Contact columns from her profile). The removal of the
 *     dark band and the keyed replacement are ONE item, like the 2.5 menu swap.
 * Content (the menu intro line "Prices in MXN.", the seeded headline) is text a
 * release never rewrites, so it reaches newly applied sites only.
 */
/** One talent-facing change: the nodes inside the old footer band go with its removal. */
const FOOTER_RICH_NOTE: ReleaseNote = {
  en: "A new light footer: a big 'See you soon.', a booking button, and Where and Contact columns filled in from your profile. Preview it before you choose.",
  es: "Un pie de página claro y nuevo: un gran 'Nos vemos pronto.', un botón para reservar y columnas de Dónde y Contacto que se llenan desde tu perfil. Míralo antes de elegir.",
};
const FOOTER_BAND_PARTS = [
  "layout:shell:footer/heading:removed",
  "layout:shell:footer/button:removed",
  "layout:shell:footer/container:removed",
  "layout:shell:footer/container/social_links:removed",
  "layout:shell:footer/container/paragraph:removed",
] as const;

const VISIT_TO_LOCATION_NOTE: ReleaseNote = {
  en: "Location replaces the Your visit section, so your zone and hours show once. If you do not have the Location section yet it is added in the same step, so you never lose your visit info. The header link follows it. Preview it before you choose.",
  es: "Ubicación reemplaza la sección Tu visita, así tu zona y tu horario se muestran una sola vez. Si aún no tienes la sección de Ubicación, se agrega en el mismo paso, así nunca pierdes la información de tu visita. El enlace del encabezado la sigue. Míralo antes de elegir.",
};

export const MAISON_V2_RELEASE_2_7 = {
  design: "maison-v2",
  toVersion: 21,
  /** The removal of the dark footer band (and its parts) + the keyed rich footer are ONE opt-in change. */
  layoutKeys: ["layout:shell:footer:removed", "layout:shell:footer_rich", ...FOOTER_BAND_PARTS],
  layoutGroupId: "layout:maison-v2:footer-rich",
  notes: {
    en: "Maison v2 2.7: your top section follows your profile. The big line, the trade and city, the short line and the proof line (years, languages, reviews) are filled in from your profile and stay up to date. You can also choose a new light footer with your zone, hours and Instagram. Also, Location replaces Your visit so your zone and hours show once, and the phone section switcher starts with Home.",
    es: "Maison v2 2.7: tu portada sigue tu perfil. La frase grande, el oficio y la ciudad, la línea corta y la línea de confianza (años, idiomas, reseñas) se llenan desde tu perfil y se mantienen al día. También puedes elegir un pie de página claro con tu zona, horario e Instagram. Además, Ubicación reemplaza a Tu visita para que tu zona y tu horario se muestren una sola vez, y el selector de secciones en teléfonos empieza con Inicio.",
  } satisfies ReleaseNote,
  codeNotes: [
    {
      en: "The phone section switcher now starts with Home (01 Home) before your other sections.",
      es: "El selector de secciones en teléfonos ahora empieza con Inicio (01 Inicio) antes de tus otras secciones.",
    },
    {
      en: "On phones the header stays on one row: a long name is shortened with an ellipsis instead of pushing the section switcher down.",
      es: "En teléfonos el encabezado se queda en una sola fila: un nombre largo se acorta con puntos suspensivos en lugar de empujar el selector de secciones.",
    },
    {
      en: "One dock for booking and chat: when the bottom bar has its own chat button, the round chat button no longer shows on top of it.",
      es: "Un solo dock para reservar y chatear: cuando la barra inferior tiene su propio botón de chat, el botón redondo de chat ya no aparece encima.",
    },
  ] satisfies ReleaseNote[],
  /** Location REPLACES the visit band: ONE atomic opt-in swap that also carries the header link. */
  extraGroups: [
    {
      keys: ["layout:home:visit:removed", "layout:home:visit/visit:removed"],
      groupId: "layout:maison-v2:visit-to-location",
      foldIds: ["variant-default:shell:header"],
      alsoKeys: ["home:location"],
      swap: { from: "visit", to: "location", ensure: true },
    },
  ],
  byItemId: {
    "variant-default:home:hero/container/heading": {
      en: "Your big hero line can follow the headline in your profile, or a line for your trade, or your name. Write your own and it stays yours (only if you have not edited that line).",
      es: "La frase grande de tu portada puede seguir el titular de tu perfil, o una frase de tu oficio, o tu nombre. Escribe la tuya y se queda tuya (solo si no editaste esa línea).",
    },
    "variant-default:home:hero/container/paragraph": {
      en: "The small line above your headline shows your trade and city from your profile (only if you have not edited it).",
      es: "La línea pequeña sobre tu titular muestra tu oficio y tu ciudad desde tu perfil (solo si no la editaste tú).",
    },
    "variant-default:home:hero/container/paragraph#2": {
      en: "The short line under your headline follows the tagline in your profile (only if you have not edited it).",
      es: "La línea corta bajo tu titular sigue el lema de tu perfil (solo si no la editaste tú).",
    },
    "variant-default:home:hero/container/paragraph#3": {
      en: "The line under your hero buttons shows your years of craft, languages and reviews from your profile, and hides itself when you have none (only if you have not edited it).",
      es: "La línea bajo los botones de tu portada muestra tus años de oficio, idiomas y reseñas desde tu perfil, y se oculta si no tienes ninguno (solo si no la editaste tú).",
    },
    "token-default:footer.tone": {
      en: "A new footer color option in your theme: light on the page surface, or a dark band. It only affects the new footer.",
      es: "Una nueva opción de color del pie de página en tu tema: claro sobre la superficie de la página, o una franja oscura. Solo afecta al pie de página nuevo.",
    },
    "layout:home:visit:removed": VISIT_TO_LOCATION_NOTE,
    "layout:home:visit/visit:removed": VISIT_TO_LOCATION_NOTE,
    "variant-default:shell:header": {
      en: "The header link to Location points at the Location section (applied together with the swap).",
      es: "El enlace Ubicación del encabezado lleva a la sección de Ubicación (se aplica junto con el cambio).",
    },
    "layout:shell:footer:removed": FOOTER_RICH_NOTE,
    "layout:shell:footer_rich": FOOTER_RICH_NOTE,
    ...Object.fromEntries(FOOTER_BAND_PARTS.map((id) => [id, FOOTER_RICH_NOTE])),
  } satisfies Record<string, ReleaseNote>,
} as const;

/**
 * Release 2.8 (v21 to v22, "desktop location + strip"): the Location section is
 * two columns on desktop with the mockup's heading, rows and generated zone
 * illustration, and the Tulala strip matches the mockup. All of it ships as
 * platform code for every design; the one payload change is that the Location
 * heading's eyebrow follows the default ("Tu visita") instead of staying empty
 * (only if the talent has not written her own), and the footer line takes the
 * mockup's size (40px phone, 64px desktop; only if she has not set her own).
 *
 * ONE release, two slices. Location + footer size (above) are automatic defaults. The page
 * order is OPT-IN and arrives as ONE layout item: the default page order is the proposal's,
 * Hero, Work, Menu, Reviews, About, FAQ, Location. A talent's page is never reordered silently.
 * Before and after and Aftercare tips are not in the proposal: they leave the default page and
 * stay available as optional blocks (`DesignPayload.optionalBlocks`). Their removal is NOT an
 * item (`dropIdPrefixes`): a talent who has them keeps them, and choosing the new order moves
 * only the sections the design still lists.
 */
export const MAISON_V2_RELEASE_2_8 = {
  design: "maison-v2",
  toVersion: 22,
  dropIdPrefixes: ["layout:home:before_after", "layout:home:aftercare"],
  notes: {
    en: "Maison v2 2.8: your Location section now sits side by side on desktop (map card left, details right) with the heading Where to find me, a zone drawing, and clear rows for zone, address and hours. The bar at the bottom shows your name, adds Cookies and moves the Tulala credit to the right. You can also choose the new page order (work, menu, reviews, about, questions, location); nothing moves until you do.",
    es: "Maison v2 2.8: tu sección de Ubicación ahora va en dos columnas en escritorio (el mapa a la izquierda y los detalles a la derecha), con el título Dónde encontrarme, un dibujo de tu zona y filas claras de zona, dirección y horario. La barra de abajo muestra tu nombre, suma Cookies y lleva el crédito de Tulala a la derecha. También puedes elegir el nuevo orden de la página (trabajo, menú, reseñas, sobre mí, preguntas, ubicación); nada se mueve hasta que lo hagas.",
  } satisfies ReleaseNote,
  codeNotes: [
    {
      en: "Location on desktop: two columns, a street-grid drawing of your zone with a dashed circle, rows with icons (zone, exact address, hours, arrival) and a long arrival note folded to two lines with Read more.",
      es: "Ubicación en escritorio: dos columnas, un dibujo de calles de tu zona con un círculo punteado, filas con iconos (zona, dirección exacta, horario, llegada) y una nota de llegada larga plegada a dos líneas con Ver más.",
    },
    {
      en: "The bottom bar names your site with your name, has a Cookies link in the Tulala group, shows Site made with Tulala.digital on the right, and drops its Language group when your header already has the language switch.",
      es: "La barra de abajo nombra tu sitio con tu nombre, tiene un enlace de Cookies en el grupo de Tulala, muestra Sitio creado con Tulala.digital a la derecha y quita su grupo de Idioma cuando tu encabezado ya tiene el selector de idioma.",
    },
  ] satisfies ReleaseNote[],
  byItemId: {
    // Order slice (opt-in).
    "layout:home:(root):order": {
      en: "Your page order follows the design: work and menu first, then reviews, about, questions and location. Sections you added stay where they are. Preview it before you choose.",
      es: "El orden de tu página sigue al diseño: primero trabajo y menú, luego reseñas, sobre mí, preguntas y ubicación. Las secciones que agregaste se quedan donde están. Míralo antes de elegir.",
    },
    // Desktop parity slice (automatic): the hero lede width.
    "variant-default:home:hero/container/paragraph#2": {
      en: "The short line under your headline wraps at the proposal's width, narrower on phones (only if you have not edited it).",
      es: "La línea corta bajo tu titular se corta al ancho de la propuesta, más angosto en teléfonos (solo si no la editaste tú).",
    },
    // Location + footer size slice (automatic).
    "token-default:type.footer-title-size": {
      en: "The big footer line is 40px on phones, as in the proposal (only if you have not set your own size).",
      es: "La frase grande del pie de página mide 40px en teléfonos, como en la propuesta (solo si no pusiste tu propio tamaño).",
    },
    "token-default:type.footer-title-size-desktop": {
      en: "The big footer line is 64px on desktop, as in the proposal (only if you have not set your own size).",
      es: "La frase grande del pie de página mide 64px en escritorio, como en la propuesta (solo si no pusiste tu propio tamaño).",
    },
    "variant-default:home:location/visit": {
      en: "The small line above your Location heading reads Your visit by default (only if you have not written your own).",
      es: "La línea pequeña sobre el título de Ubicación dice Tu visita por defecto (solo si no escribiste la tuya).",
    },
  } satisfies Record<string, ReleaseNote>,
} as const;
