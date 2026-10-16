/**
 * TUL-404: the FIRST release of a design that never had one (Gridline: eight
 * demos pinned to a v1 that no release row covers). Builder Lab's publish path
 * only mints vN+1 from a changed draft, so a design whose draft equals its
 * catalog row reports "No changes to publish" and can never reach a channel.
 *
 * This plan creates a DRAFT release for the catalog version itself (from = to),
 * with no items. Everything after it is the normal release page: dry run, then
 * Publish to demos, one step at a time. Pure: no I/O.
 */
import type { ReleaseNotes } from "./types";

export interface FirstReleaseFacts {
  design: string;
  title: string;
  /** Catalog row version; null when the design is not in the catalog. */
  catalogVersion: number | null;
  /** Every release row of the design, archived included. */
  releaseRows: number;
  /** Non-demo sites on the design (any pinned version). */
  realSites: number;
}

export type FirstReleasePlan =
  | { ok: true; version: number; notes: ReleaseNotes }
  | { ok: false; error: string; errorEs: string };

export function planFirstRelease(f: FirstReleaseFacts): FirstReleasePlan {
  if (f.catalogVersion === null || !Number.isInteger(f.catalogVersion) || f.catalogVersion < 1) {
    return { ok: false, error: "Design not found in the catalog.", errorEs: "El diseño no está en el catálogo." };
  }
  if (f.releaseRows > 0) {
    return {
      ok: false,
      error: "This design already has releases. Publish a new version from its draft instead.",
      errorEs: "Este diseño ya tiene lanzamientos. Publica una nueva versión desde su borrador.",
    };
  }
  if (f.realSites > 0) {
    return {
      ok: false,
      error: `${f.realSites} talent site(s) already use this design. A first release needs a PM decision for them.`,
      errorEs: `${f.realSites} sitio(s) de talentos ya usan este diseño. Un primer lanzamiento necesita una decisión del PM para ellos.`,
    };
  }
  const v = f.catalogVersion;
  return {
    ok: true,
    version: v,
    notes: { en: `First release of ${f.title} (v${v}).`, es: `Primera versión de ${f.title} (v${v}).` },
  };
}
