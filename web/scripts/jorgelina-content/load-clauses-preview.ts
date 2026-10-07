/**
 * The public /politicas text as a visitor reads it, built with the app's own
 * functions: `renderPolicyText` (what publish stamps into the version) and
 * `buildPolicyPage` (what the page shows from that snapshot, plus the
 * "Reglas del estudio" list). Nothing is re-implemented here, only formatted.
 */

import type { PolicyAnswers } from "../../src/lib/talent-policies/answers";
import type { CustomClauses } from "../../src/lib/talent-policies/custom-clauses";
import type { PolicyFacts } from "../../src/lib/talent-policies/facts";
import { buildPolicyPage } from "../../src/lib/talent-policies/public";
import { renderPolicyText } from "../../src/lib/talent-policies/render";
import type { PublishedPolicy } from "../../src/lib/talent-policies/store";

export function renderPublicPolicyPreview(input: { facts: unknown; answers: PolicyAnswers; customClauses: CustomClauses }): string {
  const facts = input.facts as PolicyFacts;
  const published: PublishedPolicy = {
    version: 0,
    contentHash: "",
    answers: input.answers,
    facts,
    textEs: renderPolicyText(facts, input.answers, "es").text,
    textEn: renderPolicyText(facts, input.answers, "en").text,
    publishedAt: "",
    customClauses: input.customClauses,
  };
  const out: string[] = [];
  for (const locale of ["es", "en"] as const) {
    const page = buildPolicyPage({ doc: "booking", locale, published });
    out.push(`===== /politicas (${locale.toUpperCase()}): ${page.title} =====`);
    for (const c of page.clauses) out.push(`${c.n}. ${c.title}`, c.body, "");
    if (page.custom) {
      out.push(page.custom.heading);
      page.custom.items.forEach((t, i) => out.push(`${i + 1}. ${t}`));
      out.push("");
    }
  }
  return out.join("\n");
}
