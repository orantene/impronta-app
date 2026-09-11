/**
 * The Floor mode's words, in one function.
 *
 * The board's own words are `floorBoardCopy` (`components/admin/floor`),
 * shared with the workspace's Live Floor; what is built here is the till's
 * chrome around it: the rail, the header's chips, the Orders screen's title.
 */

import { floorBoardCopy, type FloorBoardCopy } from "@/components/admin/floor/floor-copy";
import { chromeCopy, posModeLabel, type PosChromeCopy } from "@/components/admin/pos/pos-copy";
import type { Translator } from "@/components/admin/pos/translator";

export type FloorCopy = {
  readonly board: FloorBoardCopy;
  readonly chrome: PosChromeCopy;
  readonly modeLabel: string;
};

export function floorCopy(tr: Translator): FloorCopy {
  return {
    board: floorBoardCopy(tr),
    chrome: chromeCopy(tr),
    modeLabel: posModeLabel(tr, "floor"),
  };
}
