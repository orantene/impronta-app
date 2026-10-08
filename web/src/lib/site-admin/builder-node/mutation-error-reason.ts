/**
 * mutation-error-reason.ts — plain-language ES/EN reasons for builder mutation
 * failures (TUL-81). Pure: the toast shows `headline` + `reason`, never the raw
 * code. Each reason says what happened and what to do, for a business owner.
 * No em dashes (house rule). Kept in-module (not the ES catalog) so the pair
 * lives and is tested together.
 */

import type { BuilderNodeOperationKind } from "./operations";
import type { BuilderNodeMutationCode } from "./mutation-feedback";

export { describeBuilderNodeIssues } from "./mutation-issue-detail";

export type MutationReasonLocale = "en" | "es";

export interface MutationReasonText {
  en: string;
  es: string;
}

/** Every code the builder can raise. Adding a code to the union without a row here fails the typecheck. */
export const MUTATION_ERROR_REASONS: Record<BuilderNodeMutationCode, MutationReasonText> = {
  NODE_NOT_FOUND: {
    en: "That block is no longer on the page, maybe it was already removed or the page changed. Reload the page and try again.",
    es: "Ese bloque ya no está en la página, quizá se eliminó o la página cambió. Recarga la página e inténtalo de nuevo.",
  },
  NODE_AMBIGUOUS: {
    en: "Two blocks on this page share the same internal id, so we can't change the right one safely. Reload the page and try again.",
    es: "Dos bloques de esta página comparten el mismo id interno, así que no podemos cambiar el correcto con seguridad. Recarga la página e inténtalo de nuevo.",
  },
  NODE_KIND_NOT_DUPLICABLE: {
    en: "This kind of block can't be duplicated on its own. Duplicate the whole section instead.",
    es: "Este tipo de bloque no se puede duplicar por separado. Duplica la sección completa.",
  },
  PARENT_NOT_FOUND: {
    en: "The place you chose no longer exists on the page. Pick another spot, or reload the page and try again.",
    es: "El lugar que elegiste ya no existe en la página. Elige otro sitio o recarga la página e inténtalo de nuevo.",
  },
  PARENT_DOES_NOT_ALLOW_CHILDREN: {
    en: "This block can't hold other blocks. Select a section first, then add the block inside it.",
    es: "Este bloque no puede contener otros bloques. Selecciona primero una sección y añade el bloque dentro.",
  },
  ROOT_KIND_NOT_ALLOWED: {
    en: "This kind of block can't sit directly on the page. Add it inside a section instead.",
    es: "Este tipo de bloque no puede ir directamente en la página. Añádelo dentro de una sección.",
  },
  CHILD_KIND_NOT_ALLOWED: {
    en: "That container doesn't accept this kind of block. Choose a different section or container for it.",
    es: "Ese contenedor no acepta este tipo de bloque. Elige otra sección u otro contenedor.",
  },
  INVALID_MOVE_TARGET: {
    en: "A block can't be moved inside itself or into one of its own parts. Choose a different destination.",
    es: "Un bloque no se puede mover dentro de sí mismo ni de una de sus partes. Elige otro destino.",
  },
  VALIDATION_FAILED: {
    en: "Some settings on this block don't fit together, so the change wasn't applied. Review the block's settings and try again.",
    es: "Algunos ajustes de este bloque no encajan entre sí, así que el cambio no se aplicó. Revisa los ajustes del bloque e inténtalo de nuevo.",
  },
  NO_CHANGE: {
    en: "Nothing changed, the block already looks like that. Make a different edit if you wanted something new.",
    es: "No hubo cambios, el bloque ya está así. Haz otra edición si querías algo distinto.",
  },
  GUARDED_NODE: {
    en: "This area is protected by your plan or the site's design, so it can't be changed here. Pick another element, or check your plan options.",
    es: "Esta zona está protegida por tu plan o por el diseño del sitio, así que no se puede cambiar aquí. Elige otro elemento o revisa las opciones de tu plan.",
  },
  VERSION_CONFLICT: {
    en: "This page was changed in another tab or by someone else, so your last change wasn't saved. Reload the latest version, or keep editing this copy to overwrite theirs.",
    es: "Esta página se cambió en otra pestaña o por otra persona, así que tu último cambio no se guardó. Recarga la última versión o sigue con esta copia para sobrescribir la otra.",
  },
  SAVE_FAILED: {
    en: "We couldn't save your change, maybe the connection dropped. Check your internet and try again. If it keeps happening, reload the editor.",
    es: "No pudimos guardar tu cambio, quizá se cortó la conexión. Revisa tu internet e inténtalo de nuevo. Si sigue pasando, recarga el editor.",
  },
};

export const UNKNOWN_MUTATION_REASON: MutationReasonText = {
  en: "Something went wrong and the change wasn't applied. Try again. If it keeps happening, reload the editor.",
  es: "Algo salió mal y el cambio no se aplicó. Inténtalo de nuevo. Si sigue pasando, recarga el editor.",
};

const HEADLINES: Record<BuilderNodeOperationKind | "default", MutationReasonText> = {
  insert: { en: "Couldn't add that block", es: "No se pudo añadir ese bloque" },
  move: { en: "Couldn't move that block", es: "No se pudo mover ese bloque" },
  remove: { en: "Couldn't delete that block", es: "No se pudo eliminar ese bloque" },
  duplicate: { en: "Couldn't duplicate that block", es: "No se pudo duplicar ese bloque" },
  paste: { en: "Couldn't paste here", es: "No se pudo pegar aquí" },
  patch: { en: "Couldn't apply that change", es: "No se pudo aplicar ese cambio" },
  default: { en: "Couldn't apply that change", es: "No se pudo aplicar ese cambio" },
};

export interface MutationErrorReason {
  headline: string;
  reason: string;
}

/** Plain headline (from the operation) and full reason (from the code). Never echoes the raw code. */
export function describeMutationError(input: {
  code?: string;
  operation?: BuilderNodeOperationKind;
  locale: MutationReasonLocale;
}): MutationErrorReason {
  const { locale } = input;
  const known = input.code && Object.prototype.hasOwnProperty.call(MUTATION_ERROR_REASONS, input.code)
    ? MUTATION_ERROR_REASONS[input.code as BuilderNodeMutationCode]
    : UNKNOWN_MUTATION_REASON;
  const head = HEADLINES[input.operation ?? "default"] ?? HEADLINES.default;
  return { headline: head[locale], reason: known[locale] };
}
