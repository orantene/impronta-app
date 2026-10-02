/**
 * Add-gallery structural lock (2026-10-01, P0).
 *
 * A Free-plan talent site has `structuralEdits === false` (no
 * `personalSiteSections`). The builder gate (`guardBuilderNodeMutation`)
 * refuses every insert / paste / duplicate on such a surface, and the server
 * tree guard refuses any new nested node id. The gallery used to offer every
 * card anyway, so a click went straight into that refusal. This helper is the
 * gallery's side of the SAME rule, so a card is shown locked exactly when the
 * gate would refuse it.
 *
 * Shell variants are not inserts (they swap the header/footer through their
 * own action), so they stay available.
 *
 * PURE: no React, no IO.
 */
import type { AddGalleryItem } from "./types";

export function isGalleryItemStructurallyLocked(
  item: Pick<AddGalleryItem, "tab">,
  structuralEdits: boolean | undefined,
): boolean {
  if (structuralEdits !== false) return false;
  return item.tab !== "shell";
}

const LOCKED_HINT = {
  en: {
    title: "Adding new blocks is part of Web Office",
    body: "On the free plan you can edit, hide and reorder everything already on your page.",
    cta: "See plans",
    badge: "Web Office",
  },
  es: {
    title: "Añadir bloques nuevos es parte de Web Office",
    body: "Con el plan gratuito puedes editar, ocultar y reordenar todo lo que ya tiene tu página.",
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
