/**
 * Nail Designer (app_nail_designer): the owner's Nail Studio runs unmodified in
 * an iframe (public/apps/nail-studio). This file only holds the zero-config
 * props and the pure helpers the host needs: iframe URL, message guard and the
 * text summary handed to the front-door chat.
 */
import type { BuilderAppNailDesignerNode } from "./types";

export type NailDesignerProps = BuilderAppNailDesignerNode["props"];

/** Zero config: a fresh block carries no props at all. */
export function cloneNailDesignerDefaultProps(): NailDesignerProps {
  return {};
}

export const NAIL_STUDIO_PATH = "/apps/nail-studio/index.html";

export function nailStudioSrc(
  locale: string,
  opts: { layout?: "desktop" | "phone" } = {},
): string {
  const lang = locale.toLowerCase().startsWith("es") ? "es" : "en";
  const layout = opts.layout === "desktop" ? "&layout=desktop" : opts.layout === "phone" ? "&layout=phone" : "";
  return `${NAIL_STUDIO_PATH}?lang=${lang}${layout}`;
}

type StudioNail = { c1?: unknown; c2?: unknown; pattern?: unknown; finish?: unknown; charms?: unknown };
export type NailStudioDesign = { shape?: unknown; length?: unknown; nails?: unknown };

const s = (v: unknown) => (typeof v === "string" ? v : "");

function lengthWord(v: unknown, es: boolean): string {
  const n = typeof v === "number" ? v : 0.38;
  const names = es
    ? ["muy corta", "corta", "media", "larga", "extralarga"]
    : ["very short", "short", "medium", "long", "extra long"];
  const i = n < 0.12 ? 0 : n < 0.25 ? 1 : n < 0.55 ? 2 : n < 0.9 ? 3 : 4;
  return names[i];
}

export type NailStudioHandoff = "chat" | "quote";

/** Short EN/ES text summary of a Nail Studio design (shape, length, colours, pattern, finish, charms). */
export function nailStudioSummary(
  design: NailStudioDesign | null | undefined,
  locale: string,
  handoff: NailStudioHandoff = "chat",
): string {
  const es = locale.toLowerCase().startsWith("es");
  const nails = (Array.isArray(design?.nails) ? design.nails : []) as StudioNail[];
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  const colours = uniq(nails.map((n) => s(n.c1))).slice(0, 4).join(", ");
  const pattern =
    uniq(nails.map((n) => s(n.pattern)).filter((p) => p !== "solid")).join(", ") || (es ? "liso" : "solid");
  const finish = uniq(nails.map((n) => s(n.finish))).join(", ");
  const charms = nails.reduce((a, n) => a + (Array.isArray(n.charms) ? n.charms.length : 0), 0);
  const shape = s(design?.shape) || "almond";
  const len = lengthWord(design?.length, es);
  const detail = es
    ? `forma ${shape}, largo ${len}, colores ${colours || "n/d"}, arte ${pattern}, acabado ${finish || "n/d"}, ${charms} adornos`
    : `${shape} shape, ${len} length, colours ${colours || "n/a"}, pattern ${pattern}, finish ${finish || "n/a"}, ${charms} charms`;
  if (handoff === "quote") {
    return es
      ? `Hola, quiero una cotización para este diseño de uñas: ${detail}.`
      : `Hi, I'd like a quote for this nail design: ${detail}.`;
  }
  return es
    ? `Hola, quiero este diseño de uñas: ${detail}.`
    : `Hi, I'd like this nail design: ${detail}.`;
}

/** Save look → front-door chat/quote only (legacy save/share stay in-app). */
const NAIL_STUDIO_HANDOFF_TYPES = new Set(["chat", "quote"]);

/** Accept a front-door handoff only from our own iframe window and origin. */
export function isNailStudioMessage(
  e: { source: unknown; origin: string; data: unknown },
  frameWindow: unknown,
  origin: string,
): boolean {
  if (!frameWindow || e.source !== frameWindow || e.origin !== origin) return false;
  const d = e.data as { source?: unknown; type?: unknown } | null;
  return !!d && typeof d === "object" && d.source === "nail-designer" && NAIL_STUDIO_HANDOFF_TYPES.has(String(d.type));
}
