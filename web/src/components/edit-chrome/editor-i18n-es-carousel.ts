/**
 * Spanish editor-chrome strings — THE SLIDER INSPECTOR.
 *
 * Split out on the `editor-i18n-es-media.ts` precedent rather than appended to
 * `editor-i18n-es-inspectors-2.ts`: that file exists BECAUSE the inspector
 * catalog crossed the 800-line cap once already, and the slider rebuild adds
 * ~70 strings in one go. Pure data, no logic. Import `ES_TEXT` from
 * `editor-i18n` (the merged map), never this file.
 *
 * Every key here is the English string exactly as it appears in
 * `inspectors/carousel/**` and `inspectors/carousel-slide-manager.tsx`, because
 * both parity guards resolve the literal against this map: the wave-0 guard
 * reads `t("…")` call sites, and the deep-inspector guard reads
 * `label=` / `hint=` / `title=` / `placeholder=` boundary props.
 *
 * COPY RULES OBSERVED HERE
 *   - No em dashes, either language (owner rule, enforced by editor-i18n.test).
 *   - Plain language over spec words, in Spanish too: "Girar solo" rather than
 *     "Autoplay", "Oscurecer detrás del texto" rather than "Scrim".
 *   - "Ken Burns" keeps its name in both languages (it is a person's).
 */

export const ES_CAROUSEL_TEXT: Record<string, string> = {
  // ── Group titles ──────────────────────────────────────────────────────
  "Look and navigation": "Aspecto y navegación",

  // ── Layout group ──────────────────────────────────────────────────────
  "Rail scrolls a row of cards. Hero fills the screen with one image at a time.":
    "Fila desplaza una hilera de tarjetas. Portada llena la pantalla con una imagen a la vez.",
  "Slides visible": "Diapositivas visibles",
  "Slides per view": "Diapositivas por vista",
  "How many cards fit at once. Set each screen size separately.":
    "Cuántas tarjetas caben a la vez. Se define por separado para cada tamaño de pantalla.",
  "Use the desktop value": "Usar el valor de escritorio",
  "Previous and next controls above the row.":
    "Controles de anterior y siguiente sobre la hilera.",
  "One dot per slide, under the row.":
    "Un punto por diapositiva, debajo de la hilera.",
  "How much of the screen one slide fills.":
    "Cuánta pantalla ocupa una diapositiva.",
  Exact: "Exacta",
  "Exact height": "Altura exacta",
  "Used when Height is set to Exact.":
    "Se usa cuando la altura está en Exacta.",
  Short: "Baja",
  Taller: "Más alta",
  "Content down the slide": "Texto de arriba a abajo",
  "Content across the slide": "Texto de lado a lado",
  "Where the words sit vertically.": "Dónde se sitúa el texto en vertical.",
  "Where the words sit horizontally.": "Dónde se sitúa el texto en horizontal.",

  // ── Motion group ──────────────────────────────────────────────────────
  "Rotate on its own": "Girar solo",
  "Paused while you edit, so a slide cannot move out from under you.":
    "Se detiene mientras editas, para que una diapositiva no se mueva sola.",
  "Rotate every": "Girar cada",
  "Time each slide stays on screen.":
    "Tiempo que cada diapositiva permanece en pantalla.",
  Brisk: "Ágil",
  Easy: "Tranquilo",
  "Loop back to the first slide": "Volver a la primera diapositiva",
  "Off means the slider stops on the last slide.":
    "Si está apagado, el carrusel se detiene en la última diapositiva.",
  "Pause when hovered": "Pausar al pasar el cursor",
  "Stops rotating while a visitor's pointer is over the slider.":
    "Deja de girar mientras el cursor del visitante está sobre el carrusel.",
  "Change slides by": "Cambiar de diapositiva con",
  "Fade dissolves one photo into the next. Slide pushes it across.":
    "Fundido disuelve una foto en la siguiente. Deslizar la empuja de lado.",
  "Change takes": "El cambio dura",
  "How long one slide takes to become the next.":
    "Cuánto tarda una diapositiva en convertirse en la siguiente.",
  Quick: "Rápido",
  Languid: "Pausado",
  "Slow zoom on the photo": "Acercamiento lento en la foto",
  "The Ken Burns effect: the active photo drifts in slowly.":
    "El efecto Ken Burns: la foto activa se acerca poco a poco.",
  "Zoom amount": "Cantidad de acercamiento",
  "How far the photo drifts in over one slide.":
    "Cuánto se acerca la foto durante una diapositiva.",

  // ── Look and navigation group ─────────────────────────────────────────
  "Darken behind the words": "Oscurecer detrás del texto",
  "The legibility scrim. Keeps text readable over a bright photo.":
    "La capa de legibilidad. Mantiene el texto legible sobre una foto clara.",
  "Wash colour": "Color de la capa",
  "Dark for light photos, light for dark ones.":
    "Oscura para fotos claras, clara para fotos oscuras.",
  "Wash strength": "Intensidad de la capa",
  "How heavy the wash is over the photo.":
    "Qué tan intensa es la capa sobre la foto.",
  "Darken the corners": "Oscurecer las esquinas",
  "The vignette. Pulls the eye to the middle of the photo.":
    "El viñeteado. Lleva la mirada al centro de la foto.",
  "A fine noise texture over the whole slide.":
    "Una textura fina de ruido sobre toda la diapositiva.",
  "One dot per slide, tappable.": "Un punto por diapositiva, pulsable.",
  "Previous and next controls on the slide.":
    "Controles de anterior y siguiente sobre la diapositiva.",
  "Slide counter": "Contador de diapositivas",
  "Shows 01 / 05 beside the dots.": "Muestra 01 / 05 junto a los puntos.",
  "A thin bar filling as the slides advance.":
    "Una barra delgada que se llena a medida que avanzan las diapositivas.",
  "The small hint that there is more page below.":
    "La pequeña señal de que hay más página debajo.",

  // ── Advanced group ────────────────────────────────────────────────────
  "Words on the slides": "Texto en las diapositivas",
  "Per slide gives each slide its own words. One block keeps the words still while the photos change.":
    "Por diapositiva da a cada una su propio texto. Un bloque mantiene el texto fijo mientras cambian las fotos.",
  "One block": "Un bloque",
  "Accent word": "Palabra destacada",
  "Rendered in the theme's accent, after the heading.":
    "Se muestra con el color de acento del tema, después del título.",
  Subtext: "Texto de apoyo",
  "Main button link": "Enlace del botón principal",
  "Second button": "Botón secundario",
  "Second button link": "Enlace del botón secundario",
  "Talent Agency": "Agencia de talento",
  "Takes effect when the layout is set to Hero.":
    "Se aplica cuando el diseño está en Portada.",

  // ── Slide list ────────────────────────────────────────────────────────
  "Showing slide {n} of {total}": "Mostrando diapositiva {n} de {total}",
  "Show the previous slide": "Mostrar la diapositiva anterior",
  "Show the next slide": "Mostrar la diapositiva siguiente",
  "Click to show": "Clic para mostrar",
};
