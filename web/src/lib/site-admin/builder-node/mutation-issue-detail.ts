/**
 * mutation-issue-detail.ts — plain-language ES/EN "Details" lines for builder
 * mutation failures. Pure: the toast shows `describeBuilderNodeIssue(...)`, never
 * the raw `path`, node id or developer message. Each text says what is wrong and
 * what to do, for a business owner. No em dashes (house rule). Kept in-module
 * (not the ES catalog) so the pair lives and is tested together, same as
 * `mutation-error-reason.ts`.
 */

import type { MutationReasonLocale, MutationReasonText } from "./mutation-error-reason";

export interface BuilderNodeIssueInput {
  path: string;
  message: string;
}

/** Every kind of issue the operations and the tree validator can raise. */
export type BuilderNodeIssueKind =
  | "NODE_MISSING"
  | "NODE_DUPLICATE_ID"
  | "PARENT_MISSING"
  | "PARENT_NO_NESTING"
  | "PARENT_LIMITED_KINDS"
  | "PARENT_NEEDS_CONTAINER"
  | "ROOT_NEEDS_SECTION"
  | "SOURCE_PARENT_UNRESOLVED"
  | "GROUP_KEEP_ONE_REMOVE"
  | "GROUP_KEEP_ONE_MOVE"
  | "MOVE_PICK_OTHER_PARENT"
  | "MOVE_TO_SIBLING_OR_ANCESTOR"
  | "TEXT_NEEDS_HEADING_OR_PARAGRAPH"
  | "DESTINATION_POSITION"
  | "EMPTY_UPDATE"
  | "TREE_NOT_LIST"
  | "TREE_TOO_DEEP"
  | "TREE_BAD_NODE"
  | "TREE_MISSING_ID"
  | "TREE_DUPLICATE_ID"
  | "TREE_UNKNOWN_KIND"
  | "TREE_ROOT_KIND"
  | "TREE_CHILD_KIND"
  | "TREE_BAD_SETTINGS"
  | "TREE_NO_CHILDREN"
  | "TREE_NEEDS_CHILDREN"
  | "TREE_GENERIC";

export const BUILDER_NODE_ISSUE_TEXTS: Record<BuilderNodeIssueKind, MutationReasonText> = {
  NODE_MISSING: {
    en: "The block you picked is no longer on the page. Reload the page and try again.",
    es: "El bloque que elegiste ya no está en la página. Recarga la página e inténtalo de nuevo.",
  },
  NODE_DUPLICATE_ID: {
    en: "Two blocks on the page share the same internal id, so this one can't be changed safely. Reload the page and try again.",
    es: "Dos bloques de la página comparten el mismo id interno, así que este no se puede cambiar con seguridad. Recarga la página e inténtalo de nuevo.",
  },
  PARENT_MISSING: {
    en: "The place you chose no longer exists on the page. Pick another spot, or reload the page and try again.",
    es: "El lugar que elegiste ya no existe en la página. Elige otro sitio o recarga la página e inténtalo de nuevo.",
  },
  PARENT_NO_NESTING: {
    en: "That block can't hold other blocks. Choose a section or container instead.",
    es: "Ese bloque no puede contener otros bloques. Elige una sección o un contenedor.",
  },
  PARENT_LIMITED_KINDS: {
    en: "That container only accepts certain kinds of blocks, and this one isn't one of them. Choose a different container.",
    es: "Ese contenedor solo acepta ciertos tipos de bloques y este no es uno de ellos. Elige otro contenedor.",
  },
  PARENT_NEEDS_CONTAINER: {
    en: "Blocks can only go inside a section, container, accordion or tabs. Choose one of those as the destination.",
    es: "Los bloques solo pueden ir dentro de una sección, un contenedor, un acordeón o unas pestañas. Elige uno de ellos como destino.",
  },
  ROOT_NEEDS_SECTION: {
    en: "This block can't sit directly on the page. Place it inside a section instead.",
    es: "Este bloque no puede ir directamente en la página. Colócalo dentro de una sección.",
  },
  SOURCE_PARENT_UNRESOLVED: {
    en: "We couldn't find where this block currently lives. Reload the page and try again.",
    es: "No encontramos dónde está este bloque ahora mismo. Recarga la página e inténtalo de nuevo.",
  },
  GROUP_KEEP_ONE_REMOVE: {
    en: "An accordion or tabs group needs at least one item. Add another item before deleting this one.",
    es: "Un acordeón o unas pestañas necesitan al menos un elemento. Añade otro elemento antes de eliminar este.",
  },
  GROUP_KEEP_ONE_MOVE: {
    en: "An accordion or tabs group needs at least one item. Add another item before moving this one out.",
    es: "Un acordeón o unas pestañas necesitan al menos un elemento. Añade otro elemento antes de sacar este.",
  },
  MOVE_PICK_OTHER_PARENT: {
    en: "A block can't be moved into itself. Choose a different destination.",
    es: "Un bloque no se puede mover dentro de sí mismo. Elige otro destino.",
  },
  MOVE_TO_SIBLING_OR_ANCESTOR: {
    en: "A block can't be moved inside one of its own parts. Move it next to it, or to a container above it.",
    es: "Un bloque no se puede mover dentro de una de sus propias partes. Muévelo a un lado o a un contenedor que lo contenga.",
  },
  TEXT_NEEDS_HEADING_OR_PARAGRAPH: {
    en: "This only works on headings and paragraphs. Select a heading or a paragraph and try again.",
    es: "Esto solo funciona con títulos y párrafos. Selecciona un título o un párrafo e inténtalo de nuevo.",
  },
  DESTINATION_POSITION: {
    en: "That position isn't available. Choose a different spot for the block.",
    es: "Esa posición no está disponible. Elige otro lugar para el bloque.",
  },
  EMPTY_UPDATE: {
    en: "There was nothing to change. Edit at least one setting before saving.",
    es: "No había nada que cambiar. Edita al menos un ajuste antes de guardar.",
  },
  TREE_NOT_LIST: {
    en: "The page content isn't in the expected shape. Reload the editor and try again.",
    es: "El contenido de la página no tiene la forma esperada. Recarga el editor e inténtalo de nuevo.",
  },
  TREE_TOO_DEEP: {
    en: "Blocks are nested too many levels deep. Place the block closer to the top of the page.",
    es: "Los bloques están anidados en demasiados niveles. Coloca el bloque más cerca de la parte superior de la página.",
  },
  TREE_BAD_NODE: {
    en: "One of the blocks on the page is damaged. Reload the editor, and if it keeps happening, contact support.",
    es: "Uno de los bloques de la página está dañado. Recarga el editor y, si sigue pasando, contacta con soporte.",
  },
  TREE_MISSING_ID: {
    en: "One of the blocks has no internal id. Reload the editor, and if it keeps happening, contact support.",
    es: "Uno de los bloques no tiene id interno. Recarga el editor y, si sigue pasando, contacta con soporte.",
  },
  TREE_DUPLICATE_ID: {
    en: "Two blocks on the page share the same internal id. Reload the page and try again.",
    es: "Dos bloques de la página comparten el mismo id interno. Recarga la página e inténtalo de nuevo.",
  },
  TREE_UNKNOWN_KIND: {
    en: "One of the blocks is a type this editor doesn't recognize. Remove it or replace it with another block.",
    es: "Uno de los bloques es de un tipo que este editor no reconoce. Elimínalo o sustitúyelo por otro bloque.",
  },
  TREE_ROOT_KIND: {
    en: "This kind of block can't sit directly on the page. Place it inside a section instead.",
    es: "Este tipo de bloque no puede ir directamente en la página. Colócalo dentro de una sección.",
  },
  TREE_CHILD_KIND: {
    en: "That container doesn't accept this kind of block. Choose a different container for it.",
    es: "Ese contenedor no acepta este tipo de bloque. Elige otro contenedor.",
  },
  TREE_BAD_SETTINGS: {
    en: "Some settings of this block have values that aren't allowed. Review the block's settings and try again.",
    es: "Algunos ajustes de este bloque tienen valores que no se permiten. Revisa los ajustes del bloque e inténtalo de nuevo.",
  },
  TREE_NO_CHILDREN: {
    en: "This kind of block can't hold other blocks inside it. Place them next to it instead.",
    es: "Este tipo de bloque no puede contener otros bloques. Colócalos a su lado.",
  },
  TREE_NEEDS_CHILDREN: {
    en: "This block is missing its inner content. Reload the editor and try again.",
    es: "A este bloque le falta su contenido interior. Recarga el editor e inténtalo de nuevo.",
  },
  TREE_GENERIC: {
    en: "Something about the page structure doesn't fit. Reload the editor and try again.",
    es: "Algo de la estructura de la página no encaja. Recarga el editor e inténtalo de nuevo.",
  },
};

/** Shown for any issue we don't recognize (never echoes the raw message). */
export const UNKNOWN_BUILDER_NODE_ISSUE_TEXT: MutationReasonText = {
  en: "This change doesn't fit the page layout. Try a different spot, or reload the editor and try again.",
  es: "Este cambio no encaja en el diseño de la página. Prueba en otro sitio o recarga el editor e inténtalo de nuevo.",
};

/** Maps a raw `{path, message}` issue to its kind, or `null` when unrecognized. */
export function classifyBuilderNodeIssue(
  issue: BuilderNodeIssueInput,
): BuilderNodeIssueKind | null {
  const path = issue.path.trim();
  const msg = issue.message.trim();
  if (path === "target.index") return "DESTINATION_POSITION";
  if (path === "target.patch") return "EMPTY_UPDATE";
  if (path === "target.node") return "TEXT_NEEDS_HEADING_OR_PARAGRAPH";
  if (path === "source.group") {
    return /moving this one out/i.test(msg) ? "GROUP_KEEP_ONE_MOVE" : "GROUP_KEEP_ONE_REMOVE";
  }
  if (path === "source.parent") return "SOURCE_PARENT_UNRESOLVED";
  if (path === "source.nodeId") {
    return /duplicated block id/i.test(msg) ? "NODE_DUPLICATE_ID" : "NODE_MISSING";
  }
  if (path === "target.root") return "ROOT_NEEDS_SECTION";
  if (path === "target.parentId") {
    if (/^Missing parent id/i.test(msg)) return "PARENT_MISSING";
    if (/different destination parent/i.test(msg)) return "MOVE_PICK_OTHER_PARENT";
    if (/sibling container|ancestors/i.test(msg)) return "MOVE_TO_SIBLING_OR_ANCESTOR";
    return null;
  }
  if (path === "target.parent") {
    if (/does not allow nested blocks/i.test(msg)) return "PARENT_NO_NESTING";
    if (/^Allowed child kinds/i.test(msg)) return "PARENT_LIMITED_KINDS";
    if (/^Choose a section/i.test(msg)) return "PARENT_NEEDS_CONTAINER";
    return null;
  }
  // Tree validator issues (paths like "0.children.1.props", or "root").
  if (/must be an array/i.test(msg)) return "TREE_NOT_LIST";
  if (/exceeds max depth/i.test(msg)) return "TREE_TOO_DEEP";
  if (/^Node must be an object/i.test(msg)) return "TREE_BAD_NODE";
  if (/id must be a non-empty string/i.test(msg)) return "TREE_MISSING_ID";
  if (/^Duplicate node id/i.test(msg)) return "TREE_DUPLICATE_ID";
  if (/kind is unknown/i.test(msg)) return "TREE_UNKNOWN_KIND";
  if (/^Root cannot contain node kind/i.test(msg)) return "TREE_ROOT_KIND";
  if (/is not allowed under/i.test(msg)) return "TREE_CHILD_KIND";
  if (/does not allow children/i.test(msg)) return "TREE_NO_CHILDREN";
  if (/requires a children array/i.test(msg)) return "TREE_NEEDS_CHILDREN";
  if (/(^|\.)props$/.test(path)) return "TREE_BAD_SETTINGS";
  if (path === "target.tree" || path === "target.child" || /^tree\[/.test(path)) {
    return "TREE_GENERIC";
  }
  return null;
}

/** Plain sentence for one issue. Never echoes the raw path, id or developer message. */
export function describeBuilderNodeIssue(
  issue: BuilderNodeIssueInput,
  locale: MutationReasonLocale,
): string {
  const kind = classifyBuilderNodeIssue(issue);
  const text = kind ? BUILDER_NODE_ISSUE_TEXTS[kind] : UNKNOWN_BUILDER_NODE_ISSUE_TEXT;
  return text[locale];
}

/** Up to 3 distinct plain sentences for a failure's issues. */
export function describeBuilderNodeIssues(
  issues: ReadonlyArray<BuilderNodeIssueInput> | undefined,
  locale: MutationReasonLocale,
): ReadonlyArray<string> {
  if (!issues || issues.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const issue of issues) {
    const line = describeBuilderNodeIssue(issue, locale);
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= 3) break;
  }
  return out;
}
