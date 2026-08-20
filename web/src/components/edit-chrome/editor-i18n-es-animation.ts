/**
 * Spanish strings for the inspector's ANIMATION tab (2026-08-20).
 *
 * Its own file rather than more lines in `editor-i18n-es-inspectors*.ts` for
 * the same reason those two exist: the 800-line `max-lines` budget. Registered
 * in `ES_CATALOG_FILES` (es-parity.static.test.ts) so the duplicate guard sees
 * it, and spread into `ES_TEXT` in `editor-i18n-es.ts`.
 *
 * Only keys that were NOT already in the catalog live here -- "Speed", "Slow",
 * "Advanced", "Zoom in" and friends already had entries, and a second copy
 * would trip the cross-file duplicate guard.
 *
 * Literal characters only. A `\u{...}` escape in any i18n catalog crashes the
 * static scanner and turns main red.
 */

export const ES_ANIMATION_TEXT: Record<string, string> = {
  "Animation":
    "Animación",
  "Animation style":
    "Estilo de animación",
  "How this element arrives on the page. Hover a card to watch it play, then click to apply.":
    "Cómo aparece este elemento en la página. Pasa el cursor sobre una tarjeta para verla en acción y haz clic para aplicarla.",
  "How this block arrives on the page":
    "Cómo aparece este bloque en la página",
  "Animation is one setting for every screen size. You can edit it from any viewport and it applies everywhere.":
    "La animación es un solo ajuste para todos los tamaños de pantalla. Puedes editarla desde cualquier vista y se aplica en todas.",
  "Play it again":
    "Reproducir otra vez",
  "When it plays":
    "Cuándo se reproduce",
  "On scroll into view":
    "Al aparecer en pantalla",
  "When the page loads":
    "Al cargar la página",
  "On hover":
    "Al pasar el cursor",
  "The element sits still until a visitor points at it, then plays. It also plays on keyboard focus.":
    "El elemento se queda quieto hasta que alguien apunta hacia él, y entonces se reproduce. También se reproduce al recibir el foco del teclado.",
  "Plays as the element travels into the visible part of the page.":
    "Se reproduce mientras el elemento entra en la parte visible de la página.",
  "Plays once, as soon as the page paints.":
    "Se reproduce una vez, en cuanto se dibuja la página.",
  "Repeat":
    "Repetición",
  "Just once":
    "Solo una vez",
  "Every time":
    "Cada vez",
  "Plays the first time the element scrolls in, then stays put.":
    "Se reproduce la primera vez que el elemento entra en pantalla y luego se queda quieto.",
  "Playback follows the scroll position, so it runs again on every pass. Browsers without scroll-linked animation play it once on load instead.":
    "La reproducción sigue la posición del scroll, así que vuelve a ejecutarse en cada pasada. Los navegadores sin animación ligada al scroll la reproducen una vez al cargar.",
  "Fine tune":
    "Ajuste fino",
  "Drag for anything between a tenth of a second and two and a half seconds.":
    "Arrastra para elegir entre una décima de segundo y dos segundos y medio.",
  "Animation length in milliseconds":
    "Duración de la animación en milisegundos",
  "Delay":
    "Retardo",
  // "Short" already maps to "Baja" ("low") elsewhere in the catalog, which is
  // the wrong word for a duration -- so the delay chip says "Brief" instead of
  // reusing a key whose Spanish means something else.
  "Brief":
    "Breve",
  "Long":
    "Largo",
  "A short wait before it starts. Stagger a few elements to make a group arrive in sequence.":
    "Una breve espera antes de empezar. Escalona varios elementos para que un grupo aparezca en secuencia.",
  "Distance":
    "Distancia",
  "Travel distance in pixels":
    "Distancia de recorrido en píxeles",
  "How far the element travels before it settles.":
    "Cuánto recorre el elemento antes de asentarse.",
  "Motion feel":
    "Carácter del movimiento",
  "Shapes the acceleration curve. Standard is the right answer almost every time.":
    "Da forma a la curva de aceleración. Estándar es la opción correcta casi siempre.",
  "Gentle":
    "Suave",
  "Playful":
    "Con rebote",
  "Even":
    "Constante",
  "Overrides the choice above. Any CSS timing function: cubic-bezier(), steps(), linear().":
    "Sustituye a la opción de arriba. Cualquier función de tiempo CSS: cubic-bezier(), steps(), linear().",
  "Custom easing curve":
    "Curva de aceleración personalizada",
  "Visitors who ask their device for reduced motion always see this element at rest, with no animation. That setting wins over everything on this tab.":
    "Quienes piden movimiento reducido en su dispositivo siempre ven este elemento en reposo, sin animación. Ese ajuste manda sobre todo lo de esta pestaña.",
  "Fade in":
    "Aparecer",
  "Fade up":
    "Aparecer subiendo",
  "Fade down":
    "Aparecer bajando",
  "Fade left":
    "Aparecer hacia la izquierda",
  "Fade right":
    "Aparecer hacia la derecha",
  "Slide up":
    "Deslizar hacia arriba",
  "Slide down":
    "Deslizar hacia abajo",
  "Slide left":
    "Deslizar hacia la izquierda",
  "Slide right":
    "Deslizar hacia la derecha",
  "Bounce in":
    "Entrar con rebote",
  "Blur in":
    "Entrar desenfocado",
  "Flip in":
    "Entrar girando",
  "No entrance motion":
    "Sin movimiento de entrada",
  "Fades up from invisible, staying put":
    "Aparece desde invisible, sin moverse",
  "Drifts up into place while it fades in":
    "Sube hasta su sitio mientras aparece",
  "Drops into place while it fades in":
    "Baja hasta su sitio mientras aparece",
  "Drifts in from the right while it fades in":
    "Entra desde la derecha mientras aparece",
  "Drifts in from the left while it fades in":
    "Entra desde la izquierda mientras aparece",
  "Travels up from further away":
    "Sube desde más lejos",
  "Travels down from further away":
    "Baja desde más lejos",
  "Travels in from the right edge":
    "Entra desde el borde derecho",
  "Travels in from the left edge":
    "Entra desde el borde izquierdo",
  "Grows from slightly smaller":
    "Crece desde un tamaño algo menor",
  "Settles down from slightly larger":
    "Se asienta desde un tamaño algo mayor",
  "Overshoots a little, then settles":
    "Se pasa un poco y luego se asienta",
  "Sharpens into focus":
    "Se va enfocando",
  "Tips forward onto the page":
    "Se inclina hacia delante sobre la página",
  "Fade, slide, zoom and the rest moved to the Animation tab, where every option previews before you pick it.":
    "Aparecer, deslizar, acercar y el resto se han movido a la pestaña Animación, donde cada opción se previsualiza antes de elegirla.",
  "Moved to the Animation tab":
    "Movido a la pestaña Animación",
};
