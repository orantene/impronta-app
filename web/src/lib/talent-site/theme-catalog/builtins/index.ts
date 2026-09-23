/**
 * Talent theme gallery BUILT-INS — the code source of truth `sync-builtins
 * .server.ts` upserts into `talent_theme_catalog`, and the fallback
 * `load-catalog.server.ts` serves from directly when the table is empty or
 * unreachable (so the gallery works before the first sync).
 *
 * Order here is display order (mirrors `sort_order` on each entry).
 */
import { boldDesign } from "./designs/bold";
import { defaultDesign } from "./designs/default";
import { editorialDesign } from "./designs/editorial";
import { minimalDesign } from "./designs/minimal";
import { portfolioDesign } from "./designs/portfolio";
import { classicLook } from "./looks/classic";
import { editorialLook } from "./looks/editorial";
import { modernLook } from "./looks/modern";
import { noirLook } from "./looks/noir";
import { softLook } from "./looks/soft";
import { studioLook } from "./looks/studio";
import type { BuiltinDesignEntry, BuiltinLookEntry } from "./types";

export const BUILTIN_DESIGNS: readonly BuiltinDesignEntry[] = [
  defaultDesign,
  editorialDesign,
  minimalDesign,
  portfolioDesign,
  boldDesign,
];

export const BUILTIN_LOOKS: readonly BuiltinLookEntry[] = [
  modernLook,
  softLook,
  classicLook,
  editorialLook,
  studioLook,
  noirLook,
];

export type { BuiltinDesignCategory, BuiltinDesignEntry, BuiltinLookEntry } from "./types";
