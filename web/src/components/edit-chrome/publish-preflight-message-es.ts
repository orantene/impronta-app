import type { EditorLocale } from "./editor-i18n";
import { editorT } from "./editor-i18n";

/**
 * Localise publish-preflight messages that arrive from the server as English
 * (TUL-81 / W5-1). Static catalogue keys go through `editorT`; a few dynamic
 * shapes (locale lists, Free-plan ratchet) use templates. Unmatched text
 * passes through so a new EN check never breaks the drawer.
 */
const TEMPLATES: ReadonlyArray<{
  re: RegExp;
  es: (m: RegExpMatchArray) => string;
}> = [
  {
    re: /^Missing published homepage snapshot for locales?: (.+)\.$/,
    es: (m) =>
      `Falta la captura publicada de la página de inicio para el idioma${m[1]!.includes(",") ? "s" : ""}: ${m[1]}.`,
  },
  {
    re: /^Required slot "(.+)" is empty\. Add at least one section before publishing\.$/,
    es: (m) =>
      `El espacio obligatorio "${m[1]}" está vacío. Agrega al menos una sección antes de publicar.`,
  },
];

export function localisePublishPreflightMessage(
  message: string,
  locale: EditorLocale,
): string {
  if (locale !== "es") return message;

  let working = message;
  const freeSuffix = " (Free publish policy)";
  const hadFree = working.endsWith(freeSuffix);
  if (hadFree) working = working.slice(0, -freeSuffix.length);

  const altSuffix = " Add alt text before publishing.";
  const hadAlt = working.endsWith(altSuffix);
  if (hadAlt) working = working.slice(0, -altSuffix.length);

  let out = editorT(working, "es");
  if (out === working) {
    for (const { re, es } of TEMPLATES) {
      const m = working.match(re);
      if (m) {
        out = es(m);
        break;
      }
    }
  }

  if (hadAlt) out = `${out}${editorT(altSuffix, "es")}`;
  if (hadFree) out = `${out}${editorT(freeSuffix, "es")}`;
  return out;
}
