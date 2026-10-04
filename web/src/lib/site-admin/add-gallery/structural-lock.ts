/**
 * Add-gallery structural lock (2026-10-01, P0; Track B 2026-10-02: no Move).
 *
 * A Free-plan talent site has `structuralEdits === false` (no
 * `personalSiteSections`). The builder gate (`guardBuilderNodeMutation`)
 * refuses insert / paste / duplicate / move on such a surface, and the server
 * tree guard refuses any new nested node id or a reorder. The gallery used to
 * offer every card anyway, so a click went straight into that refusal. This
 * helper is the gallery's side of the SAME rule, so a card is shown locked
 * exactly when the gate would refuse an insert.
 *
 * Shell variants are not inserts (they swap the header/footer through their
 * own action), so they stay available.
 *
 * PURE: no React, no IO.
 */
import type { AddGalleryItem } from "./types";

/** True when this surface is a Free talent site with structure locked. */
export function isStructureEditLocked(
  structuralEdits: boolean | undefined,
): boolean {
  return structuralEdits === false;
}

export function isGalleryItemStructurallyLocked(
  item: Pick<AddGalleryItem, "tab">,
  structuralEdits: boolean | undefined,
): boolean {
  if (!isStructureEditLocked(structuralEdits)) return false;
  return item.tab !== "shell";
}

const LOCKED_HINT = {
  en: {
    title: "Available on Web Office",
    body: "On the free plan you can edit text and images, and hide or show blocks. Adding, moving, duplicating and pasting need Web Office.",
    cta: "See plans",
    badge: "Web Office",
  },
  es: {
    title: "Disponible en Oficina Web",
    body: "Con el plan gratuito puedes editar textos e imágenes, y ocultar o mostrar bloques. Añadir, mover, duplicar y pegar es de Oficina Web.",
    cta: "Ver planes",
    badge: "Web Office",
  },
} as const;

export type GalleryLockedHint = (typeof LOCKED_HINT)["en"] | (typeof LOCKED_HINT)["es"];

export function galleryLockedHint(locale?: string | null): GalleryLockedHint {
  return locale === "es" ? LOCKED_HINT.es : LOCKED_HINT.en;
}

/** Where the upgrade hint sends a talent. A hard link: see TalentMaxBuilderMount. */
export const GALLERY_LOCKED_UPGRADE_HREF = "/talent/settings";
