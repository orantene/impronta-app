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
