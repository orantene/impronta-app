/**
 * Spanish strings for the builder chrome that used to render in English for
 * Spanish talents (F88): save chip, mobile health panel, zoom HUD, first-paint
 * tip. Split out so editor-i18n-es.ts stays under the 800-line cap.
 */

export const ES_TALENT_CHROME_TEXT: Record<string, string> = {
  "We loaded the latest version. Undo history started fresh.":
    "Cargamos la versión más reciente. El historial de deshacer empezó de nuevo.",
  "We reloaded this page. Undo history started fresh.":
    "Recargamos esta página. El historial de deshacer empezó de nuevo.",
  "This section": "Esta sección",
  "This page changed in another tab. Your last change was not saved.":
    "Esta página cambió en otra pestaña. Tu último cambio no se guardó.",
  "Loads the newest version. Your last change is dropped and undo starts over.":
    "Carga la versión más reciente. Tu último cambio se descarta y deshacer empieza de nuevo.",
  "Saves this copy over the other tab. Undo keeps working.":
    "Guarda esta copia sobre la otra pestaña. Deshacer sigue funcionando.",
  "This page changed in another tab. Choose Load the latest or Keep this copy.":
    "Esta página cambió en otra pestaña. Elige Cargar lo más reciente o Seguir con esta copia.",
  "also open in another tab of yours": "también abierta en otra pestaña tuya",
  "You have this page open in another tab. Edits there can conflict.":
    "Tienes esta página abierta en otra pestaña. Los cambios allí pueden chocar.",
  "You have this page open in {n} other tabs. Edits there can conflict.":
    "Tienes esta página abierta en {n} pestañas más. Los cambios allí pueden chocar.",
  "First publish: your whole site goes live": "Primera publicación: todo tu sitio sale en vivo",
  "Open full": "Abrir completo",
  "Browser tab + Google": "Pestaña del navegador y Google",
  "Meta description": "Descripción para buscadores",
  "Loading your page…": "Cargando tu página...",
  "No changes since your last publish.": "No hay cambios desde tu última publicación.",
  "just now": "justo ahora",
  "{n}s ago": "hace {n} s",
  "{n}m ago": "hace {n} min",
  "{n}h ago": "hace {n} h",
  "Visitors still see the last published version until you publish.":
    "Los visitantes siguen viendo la última versión publicada hasta que publiques.",
  "Click to save now (⌘S).": "Haz clic para guardar ahora (⌘S).",
  "Mobile health": "Salud en móvil",
  "All clear": "Todo en orden",
  "{n} block publish": "{n} bloquea la publicación",
  "{n} blocks publish": "{n} bloquean la publicación",
  "{n} advisory": "{n} aviso",
  "{n} advisories": "{n} avisos",
  "{n} item": "{n} elemento",
  "{n} items": "{n} elementos",
  "No mobile issues detected in the builder tree. Tap targets, font sizes, and layout widths all look fine.":
    "No se detectaron problemas en móvil. Los botones, los tamaños de letra y los anchos se ven bien.",
  "Rows marked “Blocks publish” force horizontal scrolling on phones and must be fixed before you can publish.":
    "Las filas marcadas “Bloquea la publicación” fuerzan el desplazamiento horizontal en teléfonos y hay que corregirlas antes de publicar.",
  "The rest are advisory, review them before going live.":
    "El resto son avisos: revísalos antes de publicar.",
  "Advisory only, these do not block publish. Review them before going live on mobile devices.":
    "Solo son avisos, no bloquean la publicación. Revísalos antes de salir en vivo en móvil.",
  "Something on your page needs fixing before you can publish. Fix the items marked Blocker above. Warnings do not stop publish.":
    "Hay algo en tu página que debes corregir antes de publicar. Corrige los elementos marcados como Bloqueo arriba. Los avisos no impiden publicar.",
  "There is a problem with a section of your page. Save again or contact support.":
    "Hay un problema con una sección de tu página. Guarda de nuevo o contacta a soporte.",
  "Tiny text": "Texto muy pequeño",
  "Tap target": "Zona de toque",
  "Overflow": "Desbordamiento",
  "Trapped menu": "Menú atrapado",
  "Trapped fixed block": "Bloque fijo atrapado",
  "Blocks publish": "Bloquea la publicación",
  "Scroll canvas to {id}": "Ir a {id} en el lienzo",
  "Click any section to edit · Press ⌘K for quick actions":
    "Haz clic en cualquier sección para editarla · Pulsa ⌘K para acciones rápidas",
  "Dismiss tip": "Cerrar consejo",
  "Canvas zoom controls": "Controles de zoom del lienzo",
  "Zoom out (⌘−)": "Alejar (⌘−)",
  "Click to reset to 100%": "Haz clic para volver al 100%",
  "Zoom in (⌘+)": "Acercar (⌘+)",
  "Fit page (⌘⇧F)": "Ajustar la página (⌘⇧F)",
  "Hide rulers (⌘R)": "Ocultar reglas (⌘R)",
  "Show rulers (⌘R)": "Mostrar reglas (⌘R)",
  "Revisions": "Revisiones",
  "No revisions yet": "Aún no hay revisiones",
  "{n} entry": "{n} entrada",
  "{n} entries": "{n} entradas",
  "Undo / Redo": "Deshacer / Rehacer",
  "(⌘Z / ⌘⇧Z) depth is preserved across reloads (up to 10 steps).": "(⌘Z / ⌘⇧Z) se conserva al recargar (hasta 10 pasos).",
  "Restore": "Restaurar",
  "replaces your draft with a saved snapshot, review the canvas, then publish when ready.": "reemplaza tu borrador con una versión guardada; revisa el lienzo y publica cuando estés lista.",
  "Use the": "Usa el botón",
  "button to select two revisions and see a structural diff. Use the": "para elegir dos revisiones y ver las diferencias. Usa el botón",
  "button to name a checkpoint.": "para nombrar un punto de control.",
};
