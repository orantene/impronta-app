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
  // ── TUL-76 plain-language blockers ───────────────────────────────────────
  "Your page needs a main title. Add a heading at the top, for example in your hero.":
    "Tu página necesita un título principal. Agrega un encabezado arriba, por ejemplo en tu portada.",
  "{section} has a field that needs attention. Open it and check that required fields are filled in.":
    "{section} tiene un campo que necesita atención. Ábrelo y revisa que los campos obligatorios estén llenos.",
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
  "Nothing could be fixed automatically. Use the Show on canvas buttons to fix each block.":
    "No se pudo corregir nada automáticamente. Usa los botones Mostrar en el lienzo para corregir cada bloque.",
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
  "Brand identity": "Identidad de marca",
  "Complete your brand identity to publish: upload a logo, or use your business name as your logo.":
    "Completa tu identidad de marca para publicar: sube un logo o usa el nombre de tu negocio como logo.",
  "Upload my logo": "Subir mi logo",
  "Use my business name as my logo": "Usar el nombre de mi negocio como logo",
  // ── TUL-326 publish-disabled / hard-block reasons ─────────────────────────
  "Publishing. Please wait.": "Publicando. Espera un momento.",
  "This page changed in another tab or session. Resolve the conflict banner first: Reload latest or Keep editing this copy.":
    "Esta página cambió en otra pestaña o sesión. Resuelve primero el aviso de conflicto: Recargar lo más reciente o Seguir editando esta copia.",
  "Saving draft. Try again in a moment.":
    "Guardando el borrador. Inténtalo de nuevo en un momento.",
  "Unsaved changes. Autosave is catching up; try again in a moment.":
    "Hay cambios sin guardar. El autoguardado se está poniendo al día; inténtalo de nuevo en un momento.",
  "Fix {count} mobile overflow issue to publish.":
    "Corrige {count} problema de desbordamiento en móvil para publicar.",
  "Fix {count} mobile overflow issues to publish.":
    "Corrige {count} problemas de desbordamiento en móvil para publicar.",
  "Fix {count} blocking publish check above before publishing.":
    "Corrige {count} verificación de publicación bloqueante arriba antes de publicar.",
  "Fix {count} blocking publish checks above before publishing.":
    "Corrige {count} verificaciones de publicación bloqueantes arriba antes de publicar.",
  "{count} section missing from the latest published version. Reload composition to recover.":
    "Falta {count} sección de la última versión publicada. Recarga la composición para recuperarla.",
  "{count} sections missing from the latest published version. Reload composition to recover.":
    "Faltan {count} secciones de la última versión publicada. Recarga la composición para recuperarlas.",
  "Page version unavailable. Reload and try again.":
    "La versión de la página no está disponible. Recarga e inténtalo de nuevo.",
  "This page changed in another tab or session. Use the conflict banner to reload latest or keep editing this copy, then publish.":
    "Esta página cambió en otra pestaña o sesión. Usa el aviso de conflicto para recargar lo más reciente o seguir editando esta copia, y luego publica.",
  "{count} block overflows the mobile viewport horizontally. A page that scrolls sideways on phones cannot be published. Use \"Show on canvas\" above to fix each one, then publish.":
    "{count} bloque se desborda horizontalmente en la vista móvil. Una página que se desplaza de lado en teléfonos no se puede publicar. Usa \"Mostrar en el lienzo\" arriba para corregir cada uno, y luego publica.",
  "{count} blocks overflow the mobile viewport horizontally. A page that scrolls sideways on phones cannot be published. Use \"Show on canvas\" above to fix each one, then publish.":
    "{count} bloques se desbordan horizontalmente en la vista móvil. Una página que se desplaza de lado en teléfonos no se puede publicar. Usa \"Mostrar en el lienzo\" arriba para corregir cada uno, y luego publica.",
  "Page version is unavailable. Reload and try again.":
    "La versión de la página no está disponible. Recarga e inténtalo de nuevo.",
};
