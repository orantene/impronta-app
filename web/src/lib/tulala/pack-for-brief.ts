/**
 * pack-for-brief.ts — read the pack signals off a Brief.
 *
 * A two-line adapter with its own file, because the alternative is
 * `industry-packs.ts` importing `brief-store.ts` in order to know what a Brief
 * is. The pack layer is deliberately ignorant of storage: it takes three strings
 * and returns a pack, which is why it can be tested with literals and why a
 * future caller with facts from somewhere else can use it unchanged.
 */

import { factValue, listFact, type Brief } from "./brief-store";
import { packForFacts, type IndustryPack } from "./industry-packs";

export function packForBrief(brief: Brief): IndustryPack | null {
  return packForFacts({
    discipline: stringFact(brief, "work.discipline"),
    industry: stringFact(brief, "work.industry"),
    services: listFact(brief, "work.services"),
  });
}

function stringFact(brief: Brief, key: string): string | null {
  const value = factValue(brief, key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
