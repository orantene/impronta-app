/**
 * Editor chrome i18n — message catalog for builder UI strings (EN/ES).
 *
 * Page content locale is separate; this covers panels, drawers, and tips.
 */

export type EditorLocale = "en" | "es";

type MessageKey =
  | "layers.panel"
  | "inspector.panel"
  | "theme.panel"
  | "publish.panel"
  | "pageSettings.panel"
  | "zoom.fit"
  | "zoom.reset"
  | "compact.inspector.hint";

const MESSAGES: Record<EditorLocale, Record<MessageKey, string>> = {
  en: {
    "layers.panel": "Layers",
    "inspector.panel": "Inspector",
    "theme.panel": "Theme",
    "publish.panel": "Publish",
    "pageSettings.panel": "Page settings",
    "zoom.fit": "Fit",
    "zoom.reset": "100%",
    "compact.inspector.hint": "Swipe up for the inspector",
  },
  es: {
    "layers.panel": "Capas",
    "inspector.panel": "Inspector",
    "theme.panel": "Tema",
    "publish.panel": "Publicar",
    "pageSettings.panel": "Ajustes de página",
    "zoom.fit": "Ajustar",
    "zoom.reset": "100%",
    "compact.inspector.hint": "Desliza hacia arriba para el inspector",
  },
};

export function editorT(
  key: MessageKey,
  locale: EditorLocale = "en",
): string {
  return MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
}

export function detectEditorLocale(): EditorLocale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language.toLowerCase();
  return lang.startsWith("es") ? "es" : "en";
}
