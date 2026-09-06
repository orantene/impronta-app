/**
 * The seam between the print canvas and the print exporter — the ONE step that
 * does not exist yet.
 *
 * Page Builder lays a print piece out on a bleed-size artboard and extracts a
 * `PrintDesign` from its node tree. That extractor is theirs, deliberately: it
 * has to know the concrete BuilderNode KINDS for the QR slot, title, caption and
 * logo, and the canvas-unit -> millimetre SCALE the artboard establishes.
 * Neither exists yet (the print block palette and the artboard are open work),
 * and inventing either would produce an extractor that typechecks, draws a valid
 * PDF, and draws the WRONG PIECE — silently, because nothing on this side can
 * tell a correct extraction from a plausible one.
 *
 * So the seam is declared here and left unimplemented ON PURPOSE. Everything
 * around it — the guard, the link set, the URL composition, the refusal-to-HTTP
 * mapping, the font tracing — is real and exercised. When Page Builder ships
 * `builderTreeToPrintDesign`, this file's `extractPrintDesign` becomes a
 * one-line re-export and the route stops answering 501.
 *
 * The absence is STRUCTURAL rather than a TODO comment: the route asks for an
 * extractor, is handed `null`, and says so with a reason. A missing extractor
 * cannot be mistaken for a design that happens to be empty.
 */
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import type { PrintDesign } from "./print-design";
import type { PrintSizeKey } from "./qr/files";

export type BuilderTreeToPrintDesign = (
  tree: BuilderNodeTree,
  size: PrintSizeKey,
) => PrintDesign;

/**
 * Returns the extractor, or null while Page Builder's half of the seam is
 * unbuilt. Null is the honest answer and the only one available: a stub that
 * returned a default `PrintDesign` would put a real PDF of the wrong layout in
 * an operator's hands, which is worse than a refusal they can read.
 */
export function getPrintDesignExtractor(): BuilderTreeToPrintDesign | null {
  return null;
}

/** Why the export cannot run yet, in words an operator can act on. */
export const EXTRACTOR_MISSING_REASON =
  "The print canvas cannot be turned into a printable file yet: the layout " +
  "reader has not shipped. Nothing is wrong with this design.";
