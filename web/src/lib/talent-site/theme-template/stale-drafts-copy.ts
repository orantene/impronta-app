/** EN + ES copy for the Builder Lab "stale drafts" panel (no em dashes). */
import type { StaleDraftAction, StaleDraftReason } from "./stale-drafts";

export type StaleDraftsLang = "en" | "es";

export interface StaleDraftsCopy {
  title: string;
  lead: string;
  empty: string;
  colDesign: string;
  colAge: string;
  colBase: string;
  colSites: string;
  colRecommend: string;
  age: (days: number) => string;
  stale: string;
  base: (base: number, latest: number | null) => string;
  sites: (real: number, demo: number) => string;
  noRelease: string;
  action: Record<StaleDraftAction, string>;
  reason: Record<StaleDraftReason, string>;
  publishDemos: string;
  discard: string;
  working: string;
  edit: string;
  confirmPublish: (design: string) => string;
  confirmDiscard: (design: string) => string;
  confirmYes: string;
  confirmCancel: string;
  deleteNote: string;
  published: (design: string, version: number, demos: number) => string;
  discarded: (design: string) => string;
  genericError: string;
  dryRunButton: string;
  dryRunLoading: string;
  dryRunBanner: (design: string, sites: number) => string;
  dryRunNeeded: string;
  dryRunNotOpened: string;
  dryRunItems: (n: number) => string;
  dryRunNoItems: string;
  dryRunPins: string;
  dryRunNoBase: (versions: string) => string;
  dryRunContentOnly: string;
}

export const STALE_DRAFTS_COPY: Record<StaleDraftsLang, StaleDraftsCopy> = {
  en: {
    title: "Stale drafts",
    lead: "Open factory drafts, oldest first. Publish a draft to demos or discard it. Nothing here opens a release to talents.",
    empty: "No open drafts.",
    colDesign: "Design",
    colAge: "Age",
    colBase: "Version",
    colSites: "Sites",
    colRecommend: "Recommended",
    age: (d) => (d === 0 ? "today" : d === 1 ? "1 day" : `${d} days`),
    stale: "stale",
    base: (b, l) => (l === null ? `based on v${b}` : `based on v${b}, latest v${l}`),
    sites: (r, d) => `${r} real, ${d} demo`,
    noRelease: "no release yet",
    action: {
      "publish-to-demos": "Publish to demos",
      discard: "Discard",
      "delete-candidate": "Delete candidate",
      keep: "Keep",
    },
    reason: {
      "stale-with-changes": "Older than the stale window and it holds real design changes.",
      "stale-no-changes": "Older than the stale window and identical to its base. Nothing to release.",
      fresh: "Recently edited. Leave it for now.",
      "qa-empty": "QA design with no content and no sites.",
      "behind-latest": "The design moved on since this draft was opened. Publishing would be refused. Reopen or discard.",
      "copy-only": "Only copy or translations changed. Builder Lab cannot publish those yet.",
      "no-base": "The base snapshot is missing, so changes cannot be measured.",
    },
    publishDemos: "Publish to demos",
    discard: "Discard draft",
    working: "Working...",
    edit: "Open editor",
    confirmPublish: (d) =>
      `Publish the ${d} draft as a new version and update its demos? Real talents are not touched. The release stays off until you open it.`,
    confirmDiscard: (d) => `Discard the open ${d} draft? Its edits are closed and no longer shown in the editor.`,
    confirmYes: "Continue",
    confirmCancel: "Cancel",
    deleteNote: "Discard only closes the draft. Removing the design itself is a separate step for the PM.",
    published: (d, v, n) => `${d} published as v${v}. ${n} ${n === 1 ? "demo" : "demos"} updated.`,
    discarded: (d) => `${d} draft discarded.`,
    genericError: "Something went wrong. Nothing was changed.",
    dryRunButton: "Review first publish",
    dryRunLoading: "Reading...",
    dryRunBanner: (d, n) =>
      `${d} has ${n} real ${n === 1 ? "site" : "sites"} and has never had a release. Read what the first publish would change before you publish.`,
    dryRunNeeded: "Review the first publish to enable the button.",
    dryRunNotOpened:
      "Publishing moves the release to demos only. Real sites see these changes only after the release is opened to talents.",
    dryRunItems: (n) => `${n} ${n === 1 ? "change" : "changes"} the real sites would be offered`,
    dryRunNoItems: "No design changes for existing sites.",
    dryRunPins: "Real sites by version",
    dryRunNoBase: (v) => `No base snapshot for ${v}. For those sites only new blocks can be offered.`,
    dryRunContentOnly: "Only reach new sites",
  },
  es: {
    title: "Borradores antiguos",
    lead: "Borradores abiertos de la fábrica, los más antiguos primero. Publica un borrador en las demos o descártalo. Nada aquí abre una versión a los talentos.",
    empty: "No hay borradores abiertos.",
    colDesign: "Diseño",
    colAge: "Antigüedad",
    colBase: "Versión",
    colSites: "Sitios",
    colRecommend: "Recomendado",
    age: (d) => (d === 0 ? "hoy" : d === 1 ? "1 día" : `${d} días`),
    stale: "antiguo",
    base: (b, l) => (l === null ? `basado en v${b}` : `basado en v${b}, última v${l}`),
    sites: (r, d) => `${r} reales, ${d} demo`,
    noRelease: "sin versión publicada",
    action: {
      "publish-to-demos": "Publicar en demos",
      discard: "Descartar",
      "delete-candidate": "Candidato a borrar",
      keep: "Mantener",
    },
    reason: {
      "stale-with-changes": "Pasó el plazo y tiene cambios reales de diseño.",
      "stale-no-changes": "Pasó el plazo y es igual a su base. No hay nada que publicar.",
      fresh: "Editado hace poco. Déjalo por ahora.",
      "qa-empty": "Diseño de QA sin contenido y sin sitios.",
      "behind-latest": "El diseño avanzó desde que se abrió este borrador. Publicarlo sería rechazado. Vuelve a abrirlo o descártalo.",
      "copy-only": "Solo cambiaron textos o traducciones. Builder Lab aún no puede publicarlos.",
      "no-base": "Falta la versión base, así que no se pueden medir los cambios.",
    },
    publishDemos: "Publicar en demos",
    discard: "Descartar borrador",
    working: "Trabajando...",
    edit: "Abrir editor",
    confirmPublish: (d) =>
      `¿Publicar el borrador de ${d} como una versión nueva y actualizar sus demos? Los talentos reales no se tocan. La versión queda cerrada hasta que la abras.`,
    confirmDiscard: (d) => `¿Descartar el borrador abierto de ${d}? Sus ediciones se cierran y ya no aparecen en el editor.`,
    confirmYes: "Continuar",
    confirmCancel: "Cancelar",
    deleteNote: "Descartar solo cierra el borrador. Quitar el diseño en sí es otro paso para el PM.",
    published: (d, v, n) => `${d} publicado como v${v}. ${n} ${n === 1 ? "demo actualizada" : "demos actualizadas"}.`,
    discarded: (d) => `Borrador de ${d} descartado.`,
    genericError: "Algo salió mal. No se cambió nada.",
    dryRunButton: "Revisar la primera publicación",
    dryRunLoading: "Leyendo...",
    dryRunBanner: (d, n) =>
      `${d} tiene ${n} ${n === 1 ? "sitio real" : "sitios reales"} y nunca ha tenido una versión publicada. Lee qué cambiaría la primera publicación antes de publicar.`,
    dryRunNeeded: "Revisa la primera publicación para habilitar el botón.",
    dryRunNotOpened:
      "Publicar mueve la versión solo a demos. Los sitios reales ven estos cambios solo cuando la versión se abre a los talentos.",
    dryRunItems: (n) => `${n} ${n === 1 ? "cambio" : "cambios"} que se ofrecerían a los sitios reales`,
    dryRunNoItems: "No hay cambios de diseño para los sitios existentes.",
    dryRunPins: "Sitios reales por versión",
    dryRunNoBase: (v) => `No hay versión base para ${v}. A esos sitios solo se les pueden ofrecer bloques nuevos.`,
    dryRunContentOnly: "Solo llegan a sitios nuevos",
  },
};
