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
  /**
   * The two candidate layout ids that are ONE opt-in change for the talent
   * (the old inset is removed at its key, a keyed replacement appears).
   */
  layoutKeys: [
    "layout:home:hero/container#2/image#2:removed",
    "layout:home:hero/container#2/hero_inset_bl",
  ],
} as const;
