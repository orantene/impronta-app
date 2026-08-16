/**
 * Spanish editor-chrome strings — INSPECTOR RESET P3 (2026-08-16): overflow
 * split of `editor-i18n-es-inspectors.ts`.
 *
 * That file hit the 800-line `max-lines` cap while this pass added the
 * Content-panel field-kit strings (icon glyph names, the new "Icon size" /
 * "Icon shape" GlyphTiles labels, and two divider/spacer hint lines that only
 * started reaching the `hint` boundary prop once those rows moved onto
 * `FieldRow`). Same pattern as `-section-panels-2.ts`: a second file for the
 * same catalog, spread into the same flat `ES_TEXT` map.
 *
 * REGISTERED with `ES_CATALOG_FILES` in `es-parity.static.test.ts` — see that
 * file's comment for why an unregistered split file is a silent trap.
 *
 * House rules: no em dashes, `{token}` markers kept intact.
 */

export const ES_INSPECTOR_TEXT_2: Record<string, string> = {
  // ── Icon glyph names (icon node, GlyphTiles) ─────────────────────────────
  // BUILDER_ICON_REGISTRY labels, translated at the GlyphTiles boundary.
  // Sparkle/Star/Camera/Calendar/Phone already have entries elsewhere in the
  // catalog (shared flat map); the rest were missing until this pass.
  Heart: "Corazón",
  Check: "Marca de verificación",
  "Arrow right": "Flecha derecha",
  "Map pin": "Pin de mapa",
  Mail: "Correo",
  Play: "Reproducir",
  Users: "Usuarios",
  "Icon size": "Tamaño del ícono",
  "Icon shape": "Forma del ícono",

  // ── Divider / spacer field-kit hint text ─────────────────────────────────
  // Pre-existing copy that only started flowing through the `hint` boundary
  // prop now that these rows are FieldRow-based (GlyphTiles / PresetNumberRow);
  // it had no catalog entry before, so it is added here rather than left as a
  // fallback-to-English gap.
  "Muted draws a fainter line for subtle section breaks.":
    "Atenuado dibuja una línea más tenue para separaciones sutiles entre secciones.",
  "Controls the vertical space this block adds between sections.":
    "Controla el espacio vertical que este bloque agrega entre secciones.",
};
