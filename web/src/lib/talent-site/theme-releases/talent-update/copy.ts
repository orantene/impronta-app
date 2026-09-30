/**
 * THEME RELEASES (Phase 4): EN + ES copy for the talent update experience.
 * House rule: no em dashes in user copy. Pure.
 */
import type { Bilingual } from "@/lib/talent-site/history/copy";
import type { UpdateSummary, WhatsNewGroup } from "./view";

export type UpdateLocale = "en" | "es";

export function updateLocale(locale: string | null | undefined): UpdateLocale {
  return typeof locale === "string" && locale.toLowerCase().startsWith("es") ? "es" : "en";
}

export const UPDATE_COPY = {
  whatsNew: { en: "What's new", es: "Novedades" },
  notNow: { en: "Not now", es: "Ahora no" },
  bannerBody: {
    en: "Preview it with your content first. Your edits are kept and nothing goes live until you publish.",
    es: "Pruébala primero con tu contenido. Tus cambios se conservan y nada se publica hasta que publiques.",
  },
  previewOnSite: { en: "Preview on my site", es: "Ver en mi sitio" },
  previewHint: {
    en: "Opens your site with the update in a new tab. Nothing is saved.",
    es: "Abre tu sitio con la actualización en otra pestaña. No se guarda nada.",
  },
  apply: { en: "Apply to my draft", es: "Aplicar a mi borrador" },
  applying: { en: "Applying…", es: "Aplicando…" },
  addBlock: { en: "Add this block", es: "Agregar este bloque" },
  placeAfter: { en: "Place it after", es: "Colócalo después de" },
  placeTop: { en: "At the top of the page", es: "Al inicio de la página" },
  addHere: { en: "Add to my draft", es: "Agregar a mi borrador" },
  blockAdded: {
    en: "Block added to your draft. Publish when you are ready.",
    es: "Bloque agregado a tu borrador. Publica cuando estés lista.",
  },
  close: { en: "Close", es: "Cerrar" },
  cancel: { en: "Cancel", es: "Cancelar" },
  loading: { en: "Checking your site…", es: "Revisando tu sitio…" },
  draftOnly: {
    en: "Applies to your draft only. Undo it any time from History.",
    es: "Se aplica solo a tu borrador. Puedes deshacerla cuando quieras desde Historial.",
  },
  failed: { en: "Something went wrong. Try again.", es: "Algo salió mal. Inténtalo de nuevo." },
  version: { en: "Version", es: "Versión" },
  screenshotAlt: { en: "Screenshot of this change", es: "Captura de este cambio" },
} as const satisfies Record<string, Bilingual>;

export const GROUP_COPY: Record<WhatsNewGroup, Bilingual & { hintEn: string; hintEs: string }> = {
  critical: {
    en: "Important fixes",
    es: "Arreglos importantes",
    hintEn: "Applied for everyone so your site keeps working.",
    hintEs: "Se aplican a todas para que tu sitio siga funcionando.",
  },
  auto: {
    en: "Automatic improvements",
    es: "Mejoras automáticas",
    hintEn: "Only on parts you have not changed.",
    hintEs: "Solo en las partes que no has cambiado.",
  },
  blocks: {
    en: "New blocks you can add",
    es: "Bloques nuevos que puedes agregar",
    hintEn: "Optional. You pick where they go.",
    hintEs: "Opcionales. Tú eliges dónde van.",
  },
  layout: {
    en: "Layout changes",
    es: "Cambios de diseño",
    hintEn: "Opt in: preview first, then apply.",
    hintEs: "Opcionales: pruébalos primero y luego aplícalos.",
  },
};

export function bannerTitle(designTitle: string, locale: UpdateLocale): string {
  return locale === "es" ? `${designTitle} tiene una actualización` : `${designTitle} has an update`;
}

/** Toast after Apply: "Update applied to your draft · we kept N of your edits". */
export function appliedToast(kept: number, locale: UpdateLocale): string {
  if (locale === "es") {
    return kept > 0
      ? `Actualización aplicada a tu borrador · conservamos ${kept} de tus cambios`
      : "Actualización aplicada a tu borrador";
  }
  return kept > 0
    ? `Update applied to your draft · we kept ${kept} of your edits`
    : "Update applied to your draft";
}

/** The preview panel's "kept your edits" line. */
export function keptLine(s: UpdateSummary, locale: UpdateLocale): string {
  if (s.kept === 0) {
    return locale === "es" ? "No cambiaste nada de lo que toca esta actualización." : "You have not changed anything this update touches.";
  }
  const parts = s.keptLabels.length > 0 ? `: ${s.keptLabels.join(", ")}` : "";
  return locale === "es"
    ? `Conservamos ${s.kept} de tus cambios${parts}`
    : `We keep ${s.kept} of your edits${parts}`;
}

export function changesLine(s: UpdateSummary, locale: UpdateLocale): string {
  const n = s.applied + s.added;
  return locale === "es"
    ? `${n} cambio${n === 1 ? "" : "s"} del diseño en tu borrador`
    : `${n} design change${n === 1 ? "" : "s"} to your draft`;
}

/** History summary for an Add this block entry. */
export function addBlockSummary(designTitle: string, blockLabel: string): Bilingual {
  return {
    en: `Added the ${blockLabel} block from ${designTitle}`,
    es: `Agregaste el bloque ${blockLabel} de ${designTitle}`,
  };
}

/** History summary for an automatic improvement. */
export function autoImproveSummary(designTitle: string, changed: number): Bilingual {
  const tailEn = changed > 0 ? ` · ${designTitle} (${changed} change${changed === 1 ? "" : "s"})` : ` · ${designTitle}`;
  const tailEs = changed > 0 ? ` · ${designTitle} (${changed} cambio${changed === 1 ? "" : "s"})` : ` · ${designTitle}`;
  return { en: `Improved by Tulala${tailEn}`, es: `Mejorado por Tulala${tailEs}` };
}
