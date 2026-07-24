/**
 * Editor chrome i18n — message catalog for builder UI strings (EN/ES).
 * Page content locale is separate; this covers panels, drawers, and tips.
 *
 * Extends the existing editor-i18n idiom with the pattern proven at scale by
 * `components/admin/shell/internal/dashboard-i18n.ts`: an English-text-keyed
 * `Record<string, string>` (`ES_TEXT`), so call sites wrap existing hardcoded
 * copy in `t("Exact English string")` rather than threading a new semantic key
 * through every component. `editorT` tries the legacy semantic-key table FIRST
 * (the one pre-existing consumer, navigator-panel.tsx), then `ES_TEXT`, then
 * falls back to the input unchanged — so tenant-authored / admin-overridden
 * strings that don't match a dictionary entry pass through instead of breaking.
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

export const MESSAGES: Record<EditorLocale, Record<MessageKey, string>> = {
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

function isMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(MESSAGES.en, key);
}

/**
 * English-text-keyed catalog (dashboard-i18n idiom). Wrap any hardcoded
 * editor-chrome string in `t("...")`; if it's not in this table (tenant
 * overrides, dynamic content, or a string not yet covered) the original
 * English passes through unchanged rather than throwing or rendering blank.
 *
 * Coverage: W2-C6 landed the main flow (topbar, command dock, add gallery,
 * publish drawer, inspector rail + design panel, structure/pages, page
 * settings, common toasts); W5-A4 added the deep per-block inspector Content
 * tabs. Layout/Style/Motion/Data tabs and builder-node-content remain a
 * follow-up (see the W5-A4 PR for the exact deferred list).
 */
import { ES_TEXT } from "./editor-i18n-es";

export { ES_TEXT };

/** Substring-anchored template lookups (`{placeholder}` still needs a
 *  caller-side `.replace()`, same convention as dashboard-i18n.ts). */

function isMessageKeyOrText(key: string): key is MessageKey {
  return isMessageKey(key);
}

/**
 * Unified translate function. Accepts either a legacy semantic `MessageKey`
 * (kept for the one pre-existing consumer) or an arbitrary English string
 * (the W2-C6 bulk-coverage idiom). Falls back to the input unchanged when no
 * translation exists — safe for tenant overrides / dynamic content.
 */
export function editorT(key: string, locale: EditorLocale = "en"): string {
  if (isMessageKeyOrText(key)) {
    return MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
  }
  if (locale !== "es") return key;
  return ES_TEXT[key] ?? key;
}

/** Client-only navigator-language guess, used only as the pre-hydration seed
 *  before the cookie read resolves (see useEditorLocale). */
export function detectEditorLocale(): EditorLocale {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language.toLowerCase();
  return lang.startsWith("es") ? "es" : "en";
}
