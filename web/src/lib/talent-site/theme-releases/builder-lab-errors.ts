/**
 * Spanish for the operator-facing errors the Builder Lab server actions return (TUL-208 F11).
 *
 * The actions return `{ ok: false, error }` in English. Some also return `errorEs` (the authored
 * gate, publish); the rest did not, so a Spanish-speaking operator saw English in the middle of a
 * Spanish screen. This module is the one place that localizes them: `localizeBuilderLabError`
 * prefers a server-sent `errorEs`, then the exact-string table, then the interpolated patterns, and
 * falls back to the English text so nothing is ever hidden. Pure.
 *
 * `builder-lab-errors.test.ts` scans the action sources for every literal `error: "..."` and fails
 * when one has no Spanish here, so a new error cannot ship English-only.
 */

export type BuilderLabLang = "en" | "es";

export const BUILDER_LAB_ERROR_ES: Readonly<Record<string, string>> = {
  "Not signed in.": "No has iniciado sesión.",
  "Super admin access required.": "Se necesita acceso de superadministrador.",
  "Server configuration error.": "Error de configuración del servidor.",
  "Release not found.": "No se encontró la entrega.",
  "This release is archived.": "Esta entrega está archivada.",
  "This release is paused. Resume it first.": "Esta entrega está en pausa. Reanúdala primero.",
  "Unknown channel.": "Canal desconocido.",
  "Unknown design.": "Diseño desconocido.",
  "Unknown design or draft revision.": "Diseño o revisión del borrador desconocidos.",
  "Bad run id.": "Identificador de ejecución no válido.",
  "Set a rollout % above 0 before opening to talents.": "Define un % de despliegue mayor que 0 antes de abrirlo a los talentos.",
  "Publish to demos first.": "Publica primero en los demos.",
  "Run a dry run first. No channel change without a report.": "Haz primero una prueba. No se cambia de canal sin un informe.",
  "The dry run belongs to another release. Run it again.": "La prueba pertenece a otra entrega. Vuelve a hacerla.",
  "Items changed after the dry run. Run it again.": "Los elementos cambiaron después de la prueba. Vuelve a hacerla.",
  "Design not found in the catalog.": "No se encontró el diseño en el catálogo.",
  "Both names are required (80 characters max).": "Se necesitan los dos nombres (80 caracteres como máximo).",
  "Source design not found.": "No se encontró el diseño de origen.",
  "Could not check existing designs.": "No se pudieron revisar los diseños existentes.",
  "Could not create the design.": "No se pudo crear el diseño.",
  "Could not open the new design in the editor.": "No se pudo abrir el diseño nuevo en el editor.",
  "Action failed.": "La acción falló.",
};

type Pattern = { re: RegExp; es: (m: RegExpMatchArray) => string };

/** Errors that carry a number, a channel or a build message. The tail is passed through untouched. */
export const BUILDER_LAB_ERROR_PATTERNS: readonly Pattern[] = [
  { re: /^(\d+) site\(s\) failed the dry run\. Fix or rerun\.$/, es: (m) => `${m[1]} sitio(s) fallaron en la prueba. Corrige o vuelve a probar.` },
  { re: /^Move one step at a time: (.+) to the next channel\.$/, es: (m) => `Avanza un paso a la vez: de ${m[1]} al siguiente canal.` },
  { re: /^Catalog is at v(\d+), release targets v(\d+)\.$/, es: (m) => `El catálogo está en la v${m[1]}, la entrega apunta a la v${m[2]}.` },
  { re: /^Base build failed: (.+)$/s, es: (m) => `Falló la compilación base: ${m[1]}` },
  { re: /^Target build failed: (.+)$/s, es: (m) => `Falló la compilación de destino: ${m[1]}` },
  { re: /^Publish failed: (.+)\.$/s, es: (m) => `No se pudo publicar: ${m[1]}.` },
];

export function localizeBuilderLabError(error: string, lang: BuilderLabLang, errorEs?: string | null): string {
  if (lang !== "es") return error;
  if (typeof errorEs === "string" && errorEs.trim()) return errorEs;
  const exact = BUILDER_LAB_ERROR_ES[error];
  if (exact) return exact;
  for (const p of BUILDER_LAB_ERROR_PATTERNS) {
    const m = error.match(p.re);
    if (m) return p.es(m);
  }
  return error;
}
