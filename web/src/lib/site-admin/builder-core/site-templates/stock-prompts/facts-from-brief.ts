/**
 * stock-prompts/facts-from-brief.ts — the §3c rule: the direction layer is
 * filled from the brief's STATED facts only, after the same prompt redaction
 * the composer applies; nothing is inferred from the business name. Pure.
 */

import { listFact, redactFactsForPrompt, stringFact, type Brief } from "@/lib/tulala/brief-store";
import type { BusinessFamilyId } from "@/lib/words/business-types";
import type { StockPromptFacts } from "./layers";

const DINING: ReadonlySet<BusinessFamilyId> = new Set(["dining"]);

export function stockFactsFromBrief(brief: Brief | null, family: BusinessFamilyId): StockPromptFacts {
  if (!brief) return {};
  const visible = new Set(redactFactsForPrompt(brief.facts).map((f) => f.factKey));
  const str = (key: string) => (visible.has(key) ? stringFact(brief, key) : null);
  const out: StockPromptFacts = {};
  // `work.discipline` is "what kind" (sushi, fine-line tattoo, vinyasa). For a
  // dining business it is the cuisine; elsewhere it is the specialty.
  const discipline = str("work.discipline");
  if (discipline) {
    if (DINING.has(family)) out.cuisine = discipline;
    else out.specialty = discipline;
  }
  const audience = str("brand.audience");
  if (audience) out.clientele = audience;
  const worksFrom = str("business.works_from");
  if (worksFrom) out.setting = worksFrom;
  const words = [str("work.what_you_do"), str("business.description")]
    .concat(visible.has("work.services") ? listFact(brief, "work.services").slice(0, 1) : [])
    .filter((w): w is string => !!w && w.trim().length > 0);
  if (words.length > 0) out.words = words;
  const direction = str("brand.visual_direction");
  if (direction) out.visualDirection = direction;
  return out;
}
