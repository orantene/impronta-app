/**
 * Spanish editor-chrome strings — THE MEDIA SURFACES.
 *
 * Split out of `editor-i18n-es.ts` when that file hit its 800-line cap while
 * the retired legacy assets drawer was being replaced by the shared
 * `<MediaLibrary>`. Pure data, no logic. Import `ES_TEXT` from `editor-i18n`
 * (which re-exports the merged map) rather than this file.
 *
 * WHY THESE KEYS ARE MIRRORED AT ALL
 * Every string here is a DASHBOARD i18n key: its canonical copy lives in
 * `messages/{en,es}.json` and the component reads it through `useT`. It is
 * repeated in this catalog because `es-parity.static.test.ts` scans every
 * `t("…")` call under `components/edit-chrome/**` and resolves the argument
 * against `ES_TEXT` / `MESSAGES.es`, so a key that exists ONLY in the JSON
 * catalog reads to that guard as an untranslated string. Keep both copies in
 * step: the JSON is what renders, this is what the guard reads.
 */

export const ES_MEDIA_TEXT: Record<string, string> = {
  // ── Media picker two-key locks (phase 3, 2026-08-14) ──────────────────
  "dashboard.mediaPickerLock.badge": "Bloqueada",
  "dashboard.mediaPickerLock.aWorkspace": "un espacio de trabajo",
  "dashboard.mediaPickerLock.ownedByWorkspace":
    "{workspace} es dueño de esta foto, así que solo puede aparecer en su sitio. Pídeles que la liberen y podrás usarla aquí.",
  "dashboard.mediaPickerLock.masterOff":
    "{workspace} es dueño de esta foto y la mantiene solo en su sitio. Pídeles que la liberen y podrás usarla aquí.",
  // B9 (2026-08-15) — the lock note told talents to "ask them to release it"
  // and gave them nowhere to do it. This is that door.
  "dashboard.mediaPickerLock.requestRelease": "Pedir liberación",

  // ── MediaField (media rebuild seam 4, 2026-08-16) ─────────────────────
  "dashboard.mediaField.pickerTitle": "Biblioteca de medios",
  "dashboard.mediaField.add": "Agregar",
  "dashboard.mediaField.replace": "Reemplazar",
  "dashboard.mediaField.change": "Cambiar",
  "dashboard.mediaField.clear": "Quitar",
  "dashboard.mediaField.pasteUrl": "Pegar URL",
  "dashboard.mediaField.hideUrl": "Ocultar URL",
  "dashboard.mediaField.dropToUpload": "Suelta para subir",
  "dashboard.mediaField.uploading": "Subiendo",
  "dashboard.mediaField.uploadFailed": "No se pudo subir",
  "dashboard.mediaField.loadingDimensions": "Cargando dimensiones...",

  // ── Assets surface on the shared library (2026-08-16) ─────────────────
  // The left rail's "Assets" entry used to open a second, worse media library
  // of its own (`assets-drawer.tsx`, deleted). It opens `<MediaLibrary>` now.
  "dashboard.mediaLibrary.assetsTitle": "Biblioteca de recursos",
  "dashboard.mediaLibrary.assetsMeta": "Biblioteca de medios del espacio",
  "dashboard.mediaLibrary.assetCount": "{count} archivos",
  "dashboard.mediaLibrary.needsAttention": "Requiere atención",
  "dashboard.mediaLibrary.uploading": "Subiendo",
  "dashboard.mediaLibrary.uploadedChip": "Subido",
  "dashboard.mediaLibrary.uploadHintVideo":
    "MP4 o WebM, hasta 30 MB. Ideal para fondos: unos 15 MB, 1080p, de 15 a 30 segundos, sin sonido.",
  "dashboard.mediaLibrary.uploadHintAssets":
    "Imágenes hasta 30 MB (se comprimen automáticamente), videos hasta 30 MB, documentos hasta 25 MB.",
  "dashboard.mediaLibrary.errFileTooLarge":
    "Demasiado grande (máx. {max} MB), no se subió:",
  "dashboard.mediaLibrary.cropSaveFailed":
    "No se pudo guardar la imagen recortada. Inténtalo de nuevo.",
  "dashboard.mediaLibrary.usedBadge": "En uso {count}",
  "dashboard.mediaLibrary.usedBadgeTitle":
    "Se usa en {count} secciones de este sitio",
  "dashboard.mediaLibrary.unusedBadge": "Sin usar",
  "dashboard.mediaLibrary.unusedBadgeTitle":
    "Todavía ninguna sección usa este archivo",
};
