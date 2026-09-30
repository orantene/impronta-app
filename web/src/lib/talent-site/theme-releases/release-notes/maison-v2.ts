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
      en: "New optional block: Before and after, two photos side by side with your own gallery images.",
      es: "Nuevo bloque opcional: Antes y después, dos fotos lado a lado con las imágenes de tu galería.",
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
  /** One atomic choice: the inset's old key and its keyed replacement. */
  layoutKeys: [["layout:home:hero/container#2/image#2:removed", "layout:home:hero/container#2/hero_inset_bl"]],
} as const;

/**
 * Release 2.2 (v15 to v16, update round 2): defaults only, nothing new to
 * place. Token and variant defaults reach untouched parts on their own; a
 * talent's own values always win.
 */
export const MAISON_V2_RELEASE_2_2 = {
  design: "maison-v2",
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
  /** One atomic choice: the old services catalog and its two-column replacement. */
  layoutKeys: [["layout:home:services/services_catalog:removed", "layout:home:services/services_two_col"]],
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
