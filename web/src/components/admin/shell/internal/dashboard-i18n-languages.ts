/**
 * Spanish (tú) for the talent languages UI (PR 7): the translatable field
 * badge, Website settings > Languages, the top-bar switch and the FAQ editor.
 * Kept out of dashboard-i18n.ts (size ratchet); spread into RAIL_ES_TEXT.
 * No em dashes.
 */

export const LANGUAGES_ES_TEXT: Record<string, string> = {
  // LocaleField badge
  "{label} language": "Idioma de {label}",
  "primary": "principal",
  "translated": "traducido",
  "missing": "falta",
  "needs review": "por revisar",
  "Translate to {lang} with AI": "Traducir al {lang} con AI",
  "Translated to {lang}. Review it before saving.": "Traducido al {lang}. Revísalo antes de guardar.",
  "AI translation is not available on this plan.": "La traducción con AI no está disponible en este plan.",
  "AI limit reached. Try later or write it yourself.": "Llegaste al límite de AI. Inténtalo más tarde o escríbelo tú.",
  "Translation failed. Try again.": "No se pudo traducir. Inténtalo de nuevo.",
  "The {lang} text changed after this translation. Review it or press AI.":
    "El texto en {lang} cambió después de esta traducción. Revísalo o pulsa AI.",
  "You have unsaved changes.": "Tienes cambios sin guardar.",

  // Website settings > Languages
  "Languages": "Idiomas",
  "Your language": "Tu idioma",
  "Your dashboard, your site's default and its search listing.":
    "Tu panel, el idioma principal de tu sitio y cómo aparece en buscadores.",
  "Suggested from your location.": "Sugerido según tu ubicación.",
  "Also offer your site in": "Ofrece tu sitio también en",
  "Coming soon": "Próximamente",
  "{n} of {total} fields translated to {lang}": "{n} de {total} campos traducidos al {lang}",
  "Use the AI button next to each field.": "Usa el botón AI junto a cada campo.",
  "Show the language switch on your site": "Mostrar el selector de idioma en tu sitio",
  "Visitors can switch between your languages from the header.":
    "Tus visitantes pueden cambiar de idioma desde el encabezado.",
  "Advanced": "Avanzado",
  "{lang} only": "Solo {lang}",
  "{primary} and {secondary}": "{primary} y {secondary}",
  "Switch your primary language to {lang}?": "¿Cambiar tu idioma principal a {lang}?",
  "Your site's default language, links and search listing change. Your {old} text is kept.":
    "Cambian el idioma principal de tu sitio, sus enlaces y cómo aparece en buscadores. Tu texto en {old} se conserva.",
  "Switch language": "Cambiar idioma",
  "Hide {lang} from your site?": "¿Ocultar el {lang} de tu sitio?",
  "Translations are kept, not deleted.": "Las traducciones se conservan, no se borran.",
  "Hide it": "Ocultarlo",
  "{lang} added. Fields still in {primary} show a red {code} dot.":
    "{lang} agregado. Los campos que siguen en {primary} muestran un punto {code} rojo.",
  "Currency": "Moneda",
  "Dashboard language": "Idioma del dashboard",
  "Applies to your dashboard only. Your website has its own languages.":
    "Solo cambia tu dashboard. Tu sitio web tiene sus propios idiomas.",
  "Manage website languages": "Gestionar idiomas del sitio web",
  "Change in Website settings": "Cambiar en Ajustes del sitio",
  "Your site's languages": "Los idiomas de tu sitio",
  "Primary": "Principal",

  // Page title + SEO (Website > Pages)
  "Page title": "Título de la página",
  "SEO title": "Título para buscadores",
  "Meta description": "Descripción para buscadores",
  "Shown in search results and link previews.": "Se muestra en buscadores y al compartir el enlace.",

  // Top bar
  "Manage languages": "Gestionar idiomas",
  "Content language": "Idioma del contenido",

  // FAQ editor
  "Questions and answers": "Preguntas y respuestas",
  "Answer the questions clients ask before they book.":
    "Responde las preguntas que tus clientes hacen antes de reservar.",
  "Question": "Pregunta",
  "Answer": "Respuesta",
  "Add a question": "Agregar una pregunta",
  "Remove question": "Quitar pregunta",
  "Move up": "Subir",
  "Move down": "Bajar",
  "No questions yet.": "Aún no hay preguntas.",
  "Saved": "Guardado",
  "Couldn't save. Try again.": "No se pudo guardar. Inténtalo de nuevo.",
  "Tagline": "Frase corta",

  // Add English (TUL-361)
  "Add English": "Agregar inglés",
  "{n} fields have no English yet": "{n} campos aún no tienen inglés",
  "Ask for a suggestion, edit it, then save. Your own text is never changed.":
    "Pide una sugerencia, edítala y guárdala. Tu texto nunca se modifica.",
  "Review fields": "Revisar campos",
  "Hide list": "Ocultar lista",
  "Photo caption": "Pie de foto",
  "Service name": "Nombre del servicio",
  "Service category": "Categoría del servicio",
  "Ticker word": "Palabra del ticker",
  "Suggest English": "Sugerir inglés",
  "Working...": "Trabajando...",
  "English (review before saving)": "Inglés (revísalo antes de guardar)",
  "Save English": "Guardar inglés",
  "This already has English.": "Esto ya tiene inglés.",
  "You are viewing as someone else. Changes are turned off.":
    "Estás viendo como otra persona. Los cambios están desactivados.",
};
