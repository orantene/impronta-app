import type { EditorLocale } from "./editor-i18n";

/**
 * ES templates for the dynamic messages built in
 * `lib/site-admin/builder-node/mobile-health.ts`. Each entry matches the EN
 * sentence shape (capturing the numbers) and rebuilds it in Spanish. An
 * unmatched message passes through unchanged, so a new EN check never breaks.
 */
const TEMPLATES: ReadonlyArray<{ re: RegExp; es: (m: RegExpMatchArray) => string }> = [
  {
    re: /^Text node has (\d+(?:\.\d+)?)px effective font-size on mobile \(minimum: (\d+(?:\.\d+)?)px\)\. Increase the base or mobile font-size override\.$/,
    es: (m) =>
      `El texto tiene un tamaño efectivo de ${m[1]}px en móvil (mínimo: ${m[2]}px). Aumenta el tamaño base o el ajuste para móvil.`,
  },
  {
    re: /^(Button|Icon|Nav) has (width|height) (\d+(?:\.\d+)?)px [^\d]+ the (\d+(?:\.\d+)?)px minimum tap target\. Increase size or remove the explicit dimension\.$/,
    es: (m) =>
      `${m[1] === "Button" ? "El botón" : m[1] === "Icon" ? "El icono" : "La navegación"} tiene ${m[2] === "width" ? "un ancho" : "un alto"} de ${m[3]}px, por debajo de la zona de toque mínima de ${m[4]}px. Aumenta el tamaño o quita la medida fija.`,
  },
  {
    re: /^Row container with buttons\/icons has no gap on mobile .+$/,
    es: () =>
      "La fila con botones o iconos no tiene espacio entre elementos en móvil: las zonas de toque se tocarán. Agrega un espacio (s/m/l) o usa un diseño apilado en móvil.",
  },
  {
    re: /^Container has (?:(\d+)-column grid|(\d+)-item row) with no mobile stack override .+$/,
    es: (m) =>
      `El contenedor tiene ${m[1] ? `una cuadrícula de ${m[1]} columnas` : `una fila de ${m[2]} elementos`} sin ajuste apilado para móvil: es probable que se desborde en teléfonos. Usa el diseño "apilado" en móvil o permite que se envuelva.`,
  },
  {
    re: /^Split block has "collapseOnMobile: false" .+$/,
    es: () =>
      "El bloque dividido mantiene las dos columnas lado a lado en teléfonos, lo que puede apretar o desbordar el contenido.",
  },
  {
    re: /^Node has (minimum width|fixed width) (\d+(?:\.\d+)?)px, which exceeds the narrowest mobile viewport \((\d+)px\)\. .+$/,
    es: (m) =>
      `El elemento tiene ${m[1] === "minimum width" ? "un ancho mínimo" : "un ancho fijo"} de ${m[2]}px, que supera la pantalla móvil más estrecha (${m[3]}px). Fuerza una barra de desplazamiento horizontal en teléfonos. Usa un ancho relativo (%, 100%) o un ajuste para móvil.`,
  },
  {
    re: /^This menu opens off-canvas, but an ancestor block .+$/,
    es: () =>
      "Este menú se abre fuera del lienzo, pero un bloque superior usa desenfoque o filtro, lo que fija el panel a ese bloque en lugar de a la pantalla. Quita el desenfoque en el punto de corte móvil para que el menú cubra toda la pantalla.",
  },
  {
    re: /^This block is set to Fixed, but an ancestor block .+$/,
    es: () =>
      "Este bloque está en posición Fija, pero un bloque superior usa desenfoque, filtro o transformación, lo que lo fija a ese bloque y no a la ventana. Quita ese efecto del bloque superior o mueve este bloque más arriba en la página.",
  },
];

export function localiseMobileHealthMessage(message: string, locale: EditorLocale): string {
  if (locale !== "es") return message;
  for (const { re, es } of TEMPLATES) {
    const m = message.match(re);
    if (m) return es(m);
  }
  return message;
}
