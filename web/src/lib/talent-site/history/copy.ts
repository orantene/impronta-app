/**
 * EN + ES copy for the talent site history: entry summaries (stored on the row)
 * and the builder chrome (drawer, draft chip, conflict notice). Pure.
 * House rule: no em dashes in user copy.
 */
import type { HistoryKind } from "./types";

export type HistoryLocale = "en" | "es";

export interface Bilingual {
  en: string;
  es: string;
}

export function pick(copy: Bilingual, locale: string | null | undefined): string {
  return typeof locale === "string" && locale.toLowerCase().startsWith("es") ? copy.es : copy.en;
}

/** The optimistic-concurrency notice (a write lost the draft_rev race). */
export const CONFLICT_COPY: Bilingual = {
  en: "Updated in another tab · Reload",
  es: "Actualizado en otra pestaña · Recargar",
};

// ── Entry summaries ──────────────────────────────────────────────────────────

const SUMMARY: Record<HistoryKind, Bilingual> = {
  edit: { en: "Edited your site", es: "Editaste tu sitio" },
  colors: { en: "Changed colours and fonts", es: "Cambiaste colores y fuentes" },
  design_apply: { en: "Applied a new design", es: "Aplicaste un diseño nuevo" },
  theme_update: { en: "Design update applied", es: "Actualización del diseño aplicada" },
  restore: { en: "Restored an earlier version", es: "Restauraste una versión anterior" },
  publish: { en: "Published your site", es: "Publicaste tu sitio" },
  auto_improve: { en: "Improved by Tulala", es: "Mejorado por Tulala" },
};

export function summaryFor(kind: HistoryKind): Bilingual {
  return SUMMARY[kind];
}

export function editSummary(surface: "page" | "shell", pageTitle?: string | null): Bilingual {
  if (surface === "shell") {
    return { en: "Edited header and footer", es: "Editaste el encabezado y el pie" };
  }
  const title = pageTitle?.trim();
  return title
    ? { en: `Edited ${title}`, es: `Editaste ${title}` }
    : { en: "Edited a page", es: "Editaste una página" };
}

export function designApplySummary(designName: string | null | undefined): Bilingual {
  const name = designName?.trim();
  return name
    ? { en: `Applied the ${name} design`, es: `Aplicaste el diseño ${name}` }
    : SUMMARY.design_apply;
}

export function lookSummary(lookName: string | null | undefined): Bilingual {
  const name = lookName?.trim();
  return name
    ? { en: `Changed the look to ${name}`, es: `Cambiaste el estilo a ${name}` }
    : SUMMARY.colors;
}

export function themeUpdateSummary(
  designName: string | null | undefined,
  toVersion: number | null | undefined,
  keptCount: number,
  versionLabel?: string | null,
): Bilingual {
  void toVersion; // the internal design version number is not talent language
  const name = designName?.trim() || "Design";
  const label = versionLabel?.trim();
  const keptEn = keptCount > 0 ? ` · kept ${keptCount} of your edits` : "";
  const keptEs = keptCount > 0 ? ` · conservamos ${keptCount} de tus cambios` : "";
  return {
    en: label ? `You applied ${name} update ${label}${keptEn}` : `You applied the ${name} update${keptEn}`,
    es: label ? `Aplicaste la actualización ${label} de ${name}${keptEs}` : `Aplicaste la actualización de ${name}${keptEs}`,
  };
}

/**
 * "Undid the Maison v2 update · kept your 1 later edit". `laterEdits` is the
 * count of edits she saved after the apply (from history); null = not certain,
 * so the line says "kept your later edits" without a number (`anyKept`).
 */
export function undoUpdateSummary(designName: string | null | undefined, laterEdits: number | null, anyKept = false): Bilingual {
  const name = designName?.trim();
  const n = laterEdits ?? 0;
  const keptEn = n > 0 ? ` · kept your ${n} later edit${n === 1 ? "" : "s"}` : anyKept ? " · kept your later edits" : "";
  const keptEs =
    n > 0
      ? ` · conservamos ${n === 1 ? "tu edición posterior" : `tus ${n} ediciones posteriores`}`
      : anyKept
        ? " · conservamos tus ediciones posteriores"
        : "";
  return {
    en: `${name ? `Undid the ${name} update` : "Undid the design update"}${keptEn}`,
    es: `${name ? `Deshiciste la actualización ${name}` : "Deshiciste la actualización del diseño"}${keptEs}`,
  };
}

export function restoreSummary(fromAt: string): Bilingual {
  const d = new Date(fromAt);
  const fmt = (l: string) =>
    Number.isNaN(d.getTime())
      ? fromAt
      : d.toLocaleString(l, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  return {
    en: `Restored the version from ${fmt("en-US")}`,
    es: `Restauraste la versión del ${fmt("es-MX")}`,
  };
}

// ── Builder chrome ───────────────────────────────────────────────────────────

export const CHROME_COPY = {
  historyTitle: { en: "History", es: "Historial" },
  publishedOnly: { en: "Published only", es: "Solo publicadas" },
  preview: { en: "Preview", es: "Vista previa" },
  restore: { en: "Restore", es: "Restaurar" },
  restoreConfirm: {
    en: "Restore this version to your draft? Nothing is deleted and nothing goes live until you publish.",
    es: "¿Restaurar esta versión en tu borrador? No se borra nada y nada se publica hasta que publiques.",
  },
  undoUpdate: { en: "Undo this update", es: "Deshacer esta actualización" },
  undoConfirm: {
    en: "Undo only this design update? Your later edits stay.",
    es: "¿Deshacer solo esta actualización del diseño? Tus cambios posteriores se conservan.",
  },
  cancel: { en: "Cancel", es: "Cancelar" },
  close: { en: "Close", es: "Cerrar" },
  previewing: { en: "Previewing a saved version · read only", es: "Vista previa de una versión guardada · solo lectura" },
  live: { en: "Live", es: "Publicada" },
  byTalent: { en: "You", es: "Tú" },
  byTulala: { en: "Tulala", es: "Tulala" },
  bySystem: { en: "System", es: "Sistema" },
  empty: { en: "No history yet", es: "Aún no hay historial" },
  draftChip: { en: "Draft", es: "Borrador" },
  whatWillGoLive: { en: "What will go live", es: "Lo que se publicará" },
  noChanges: { en: "No unpublished changes", es: "No hay cambios sin publicar" },
  before: { en: "Before", es: "Antes" },
  after: { en: "After", es: "Después" },
  added: { en: "Added", es: "Nuevo" },
  removed: { en: "Removed", es: "Quitado" },
  changed: { en: "Changed", es: "Cambiado" },
  colours: { en: "Colours and fonts", es: "Colores y fuentes" },
  header: { en: "Header and footer", es: "Encabezado y pie" },
  liveJustNow: { en: "Live · just now", es: "Publicado · justo ahora" },
  viewSite: { en: "View site", es: "Ver sitio" },
  sitePublished: { en: "Site published", es: "Sitio publicado" },
  applying: { en: "Applying a design. Publish waits until it finishes.", es: "Aplicando un diseño. Publicar espera a que termine." },
} as const satisfies Record<string, Bilingual>;

export const FIRST_PUBLISH_COPY = {
  chip: { en: "Draft · not live yet", es: "Borrador · aún no publicado" },
  title: {
    en: "Your whole site goes live for the first time",
    es: "Todo tu sitio se publica por primera vez",
  },
} as const satisfies Record<string, Bilingual>;

export function firstPublishSummary(pages: number, sections: number): Bilingual {
  return {
    en: `${pages} page${pages === 1 ? "" : "s"} · ${sections} section${sections === 1 ? "" : "s"}, with your colours and fonts.`,
    es: `${pages} página${pages === 1 ? "" : "s"} · ${sections} sección${sections === 1 ? "" : "es"}, con tus colores y fuentes.`,
  };
}

export function unpublishedChangesLabel(n: number): Bilingual {
  return {
    en: `Draft · ${n} unpublished change${n === 1 ? "" : "s"}`,
    es: `Borrador · ${n} cambio${n === 1 ? "" : "s"} sin publicar`,
  };
}
