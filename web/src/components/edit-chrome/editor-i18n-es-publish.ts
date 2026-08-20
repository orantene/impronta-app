/**
 * Spanish strings for the Publish drawer overhaul (2026-08-20): the four-tab
 * strip, the one-click "Fix these for me" action on auto-fixable publish
 * blockers, and the embedded schedule-publish form.
 *
 * Split out so editor-i18n-es.ts stays under the 800-line cap.
 */

export const ES_PUBLISH_TEXT: Record<string, string> = {
  // ── Mobile health — one-click Fix mobile issues (W3-M3) ──────────────────
  "Fix mobile issues": "Corregir problemas de móvil",
  "Fixing…": "Corrigiendo...",
  "One click applies mobile-safe overrides.":
    "Un clic aplica ajustes seguros para móvil.",
  "Could not fix mobile issues. Please try again.":
    "No se pudieron corregir los problemas de móvil. Inténtalo de nuevo.",
  "Fixed {count} mobile issue": "Se corrigió {count} problema de móvil",
  "Fixed {count} mobile issues": "Se corrigieron {count} problemas de móvil",
  "No fixable mobile issues": "No hay problemas de móvil corregibles",
  // ── Tabs ────────────────────────────────────────────────────────────────
  "Checks": "Revisión",
  "Changes": "Cambios",
  "Schedule": "Programar",
  "Publish checks and mobile health": "Verificaciones de publicación y salud móvil",
  "What's going live and the draft vs published diff":
    "Qué se publica y la diferencia entre borrador y publicado",
  "Page title, meta description and search preview":
    "Título de la página, meta descripción y vista previa de búsqueda",
  "Publish later, at a scheduled time": "Publicar más tarde, a una hora programada",
  "Fix these for me": "Corrígelo por mí",
  "Fix {count} of {total} for me": "Corrige {count} de {total} por mí",
  "One click applies safe layout fixes and re-runs the checks. Undo reverts the whole batch.":
    "Un clic aplica correcciones seguras de diseño y vuelve a ejecutar las verificaciones. Deshacer revierte todo el lote.",
  "Could not apply the fixes. Use the Show on canvas buttons to fix each block instead.":
    "No se pudieron aplicar las correcciones. Usa los botones Mostrar en el lienzo para corregir cada bloque.",
  // "Hide" already lives in editor-i18n-es-inspectors.ts.
  "Review": "Revisar",
  // ── Schedule publish form (shared with the Schedule drawer) ───────────────
  "Schedule publish": "Programar publicación",
  "Pick a valid date and time.": "Elige una fecha y hora válidas.",
  "Network error. Try again.": "Error de red. Inténtalo de nuevo.",
  "Currently scheduled for": "Programado actualmente para",
  "No publish scheduled. Pick a future date and time below.":
    "No hay publicación programada. Elige una fecha y hora futuras abajo.",
  "Publish on": "Publicar el",
  "The page publishes automatically once the time arrives. The fire time is your local timezone.":
    "La página se publica automáticamente cuando llega la hora. La hora corresponde a tu zona horaria local.",
  "Schedule saved. The page will publish at the chosen time.":
    "Programación guardada. La página se publicará a la hora elegida.",
  "Cancel scheduled publish": "Cancelar publicación programada",
  "Update schedule": "Actualizar programación",
};
