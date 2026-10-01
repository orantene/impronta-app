/**
 * THEME RELEASES: deterministic EN + ES notes for a release the Template
 * Factory publishes from the editor (no authored module exists for it). One
 * plain, talent-facing sentence per item, plus a summary line. Pure: the same
 * items always give the same notes, so a re-run never churns the release.
 *
 * Labels come from the ONE label sources the rest of the product uses:
 * `STYLE_TOKEN_BY_KEY` for tokens, `sectionNameForKey` / `sectionNameForLabel`
 * for sections (the go-live sheet and the update sheet read the same map),
 * `humanKey` as the last resort. No em dashes, no jargon.
 *
 * `polishNotes` is an optional hook for an AI pass; it is NOT implemented here
 * and the deterministic notes are always the fallback.
 */
import { STYLE_TOKEN_BY_KEY } from "@/lib/site-admin/tokens/style-tokens";
import { sectionNameForKey, sectionNameForLabel } from "@/lib/talent-site/history/draft-diff";
import { humanKey } from "../talent-update/view";
import { ROOT_KEY } from "../tree-ops";
import type { ReleaseItem, ReleaseNotes } from "../types";
import type { ReleaseNote } from "./maison-v2";

export type NoteLocale = "en" | "es";

export interface AutoNotesInput {
  /** Design title shown to talents ("Folio"). */
  designTitle: string;
  items: ReadonlyArray<ReleaseItem>;
  /** Bare design key (no `tree:`) to the kit's English `layerLabel`, when known. */
  sectionLabels?: Readonly<Record<string, string>>;
}

export interface AutoNotes {
  notes: ReleaseNote;
  /** Per item id (same id rule as `itemId`). */
  byItemId: Record<string, ReleaseNote>;
  /** The input items with `note` filled where it was missing. */
  items: ReleaseItem[];
}

/** Optional AI polish (interface only). Must return the same ids; on any failure the caller keeps the input. */
export interface NotesPolisher {
  polishNotes?(notes: AutoNotes): Promise<AutoNotes>;
}

const KEEP_EN = "(only if you have not changed it yourself)";
const KEEP_ES = "(solo si no lo cambiaste tú)";

const idOf = (i: ReleaseItem) => i.id ?? `${i.type}:${i.key}`;

function bareKey(item: Pick<ReleaseItem, "key" | "tree">): string {
  const k = item.key;
  if (item.tree && k.startsWith(`${item.tree}:`)) return k.slice(item.tree.length + 1);
  return k.replace(/^(shell|home):/, "");
}

function cleanText(s: string): string {
  return s.replace(/—|–/g, ",").replace(/\s+/g, " ").trim();
}

/** "hero/heading#2" -> the section name of `hero` (talent-facing), in the locale. */
export function sectionName(key: string, locale: NoteLocale, labels: Readonly<Record<string, string>> = {}): string {
  const top = key.split("/")[0]!.replace(/#\d+$/, "");
  const label = labels[top] ?? labels[key];
  const known =
    sectionNameForKey(top, locale) ??
    (label ? sectionNameForLabel(label, locale) : null) ??
    (label ? label.trim() : null) ??
    humanKey(top);
  return cleanText(known);
}

function tokenLabel(key: string, locale: NoteLocale): string {
  const def = STYLE_TOKEN_BY_KEY.get(key);
  return def ? def.label[locale] : humanKey(key);
}

function tokenValue(key: string, value: unknown, locale: NoteLocale): string | null {
  if (typeof value !== "string" || value === "") return null;
  const opt = STYLE_TOKEN_BY_KEY.get(key)?.options?.find((o) => o.value === value);
  return opt ? opt[locale] : value;
}

function tokenNote(item: ReleaseItem): ReleaseNote {
  const keys = item.tokenKeys && item.tokenKeys.length > 0 ? item.tokenKeys : [item.key];
  if (keys.length > 1) {
    const en = keys.map((k) => tokenLabel(k, "en")).join(", ");
    const es = keys.map((k) => tokenLabel(k, "es")).join(", ");
    return { en: `New default style for ${en} ${KEEP_EN}.`, es: `Nuevo estilo por defecto para ${es} ${KEEP_ES}.` };
  }
  const key = keys[0]!;
  const to = item.detail?.to;
  const en = tokenLabel(key, "en");
  const es = tokenLabel(key, "es");
  const vEn = tokenValue(key, to, "en");
  const vEs = tokenValue(key, to, "es");
  if (vEn === null || vEs === null) {
    return { en: `${en} goes back to the standard setting ${KEEP_EN}.`, es: `${es} vuelve al ajuste estándar ${KEEP_ES}.` };
  }
  return { en: `${en} is now ${vEn} by default ${KEEP_EN}.`, es: `${es} ahora es ${vEs} por defecto ${KEEP_ES}.` };
}

function layoutKind(item: ReleaseItem): string | undefined {
  const d = item.detail?.layout;
  if (typeof d === "string") return d;
  const id = idOf(item);
  if (id.endsWith(":removed")) return "removed";
  if (id.endsWith(":order")) return "order";
  if (id.endsWith(":kind")) return "kind";
  return undefined;
}

function noteFor(item: ReleaseItem, title: string, labels: Readonly<Record<string, string>>): ReleaseNote {
  const key = bareKey(item);
  const en = sectionName(key, "en", labels);
  const es = sectionName(key, "es", labels);
  switch (item.type) {
    case "token-default":
      return tokenNote(item);
    case "variant-default":
      return { en: `${en} gets a refreshed design ${KEEP_EN}.`, es: `${es} tiene un diseño renovado ${KEEP_ES}.` };
    case "new-block":
      return { en: `New block: ${en}. You can add it to your page.`, es: `Bloque nuevo: ${es}. Puedes agregarlo a tu página.` };
    case "code":
      return {
        en: `${title} now displays better on every page. Nothing on your page changes.`,
        es: `${title} ahora se ve mejor en todas las páginas. No cambia nada de tu página.`,
      };
    case "critical":
      return { en: `An important fix for ${en}.`, es: `Un arreglo importante para ${es}.` };
    case "layout":
    default: {
      if (item.swap) {
        return { en: `${en} has a new arrangement ${KEEP_EN}.`, es: `${es} cambia de distribución ${KEEP_ES}.` };
      }
      switch (layoutKind(item)) {
        case "removed":
          return {
            en: `The design no longer includes ${en}. If it is on your page, it stays.`,
            es: `El diseño ya no incluye ${es}. Si está en tu página, se queda.`,
          };
        case "order":
          return key === ROOT_KEY || key === ""
            ? {
                en: `The sections of the page are in a new order ${KEEP_EN}.`,
                es: `Las secciones de la página tienen un nuevo orden ${KEEP_ES}.`,
              }
            : { en: `The parts inside ${en} are in a new order ${KEEP_EN}.`, es: `Las partes de ${es} tienen un nuevo orden ${KEEP_ES}.` };
        case "kind":
          return { en: `${en} uses a new kind of block ${KEEP_EN}.`, es: `${es} usa un nuevo tipo de bloque ${KEEP_ES}.` };
        case "nested-new":
        default:
          return { en: `${en} gets a new part.`, es: `${es} tiene una parte nueva.` };
      }
    }
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Deterministic notes for every item (an existing EN+ES note is kept as is). */
export function autoNotes(input: AutoNotesInput): AutoNotes {
  const labels = input.sectionLabels ?? {};
  const title = cleanText(input.designTitle) || "Your design";
  const byItemId: Record<string, ReleaseNote> = {};
  const items = input.items.map((item) => {
    const generated = noteFor(item, title, labels);
    const note: ReleaseNote = {
      en: cleanText(item.note?.en?.trim() ? item.note.en : generated.en),
      es: cleanText(item.note?.es?.trim() ? item.note.es : generated.es),
    };
    byItemId[idOf(item)] = note;
    return { ...item, note };
  });
  const n = items.length;
  const notes: ReleaseNote = {
    en: `${title} update: ${plural(n, "change", "changes")} to the design. Anything you changed yourself stays as you left it.`,
    es: `Actualización de ${title}: ${plural(n, "cambio", "cambios")} en el diseño. Todo lo que cambiaste tú se queda como lo dejaste.`,
  };
  return { notes, byItemId, items };
}

/** Release-row notes shape (`talent_theme_releases.notes`). */
export function toReleaseNotes(n: AutoNotes): ReleaseNotes {
  return { en: n.notes.en, es: n.notes.es, source: "auto" };
}

/** Run the optional polish hook; any failure or id drift keeps the deterministic notes. */
export async function maybePolish(notes: AutoNotes, polisher?: NotesPolisher): Promise<AutoNotes> {
  if (!polisher?.polishNotes) return notes;
  try {
    const out = await polisher.polishNotes(notes);
    const same = Object.keys(out.byItemId).sort().join("|") === Object.keys(notes.byItemId).sort().join("|");
    const filled = out.items.every((i) => i.note?.en?.trim() && i.note?.es?.trim());
    return same && filled && out.notes.en?.trim() && out.notes.es?.trim() ? out : notes;
  } catch {
    return notes;
  }
}
