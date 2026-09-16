/**
 * looks/index.ts — the built-in Looks (Layer 1). Code is the source of truth;
 * the Builder Lab syncs them into `site_looks` for import/export (D-TPL-5).
 */

import type { Look, LookId } from "../types";
import { boldLook } from "./bold";
import { classicLook } from "./classic";
import { coastalLook } from "./coastal";
import { darkLook } from "./dark";
import { editorialLook } from "./editorial";
import { emberLook } from "./ember";
import { minimalLook } from "./minimal";
import { nightLook } from "./night";
import { playfulLook } from "./playful";
import { studioLook } from "./studio";
import { warmLook } from "./warm";

export const LOOKS: ReadonlyArray<Look> = [
  emberLook,
  editorialLook,
  warmLook,
  boldLook,
  minimalLook,
  darkLook,
  playfulLook,
  classicLook,
  studioLook,
  coastalLook,
  nightLook,
];

const BY_ID = new Map(LOOKS.map((l) => [l.id, l] as const));

export function getLook(id: LookId | string | null | undefined): Look | null {
  return (id && BY_ID.get(id as LookId)) || null;
}

export { buildLook, type LookRecipe } from "./shared";
