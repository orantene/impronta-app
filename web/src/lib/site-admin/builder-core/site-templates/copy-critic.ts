/**
 * Copy critic (Phase 9): the gate between "the model wrote something" and
 * "this ships as someone's website".
 *
 * Two parts. Deterministic first: a headline that another composed site
 * already carries, or one that would fit any business, fails. Then a small
 * model judges what a regex cannot: an invented fact the screener missed, a
 * headline in the wrong language, copy that ignores what the person said.
 * A failure costs one retry of the copy pass with the problems and the
 * headlines to avoid in the prompt; a second failure ships the defaults, not
 * the bad copy. Pure module: the model call is injected.
 */

import type { Bilingual } from "./types";
import type { CopyPassFacts } from "./copy-pass";

export type CriticProblem = { key: string; reason: string };
export type CriticVerdict = { ok: boolean; problems: CriticProblem[]; source: "bank" | "model" | "none" };

export const HEADLINE_KEYS = ["home.offer.headline", "home.closing.headline", "catalogue.headline", "about.headline"] as const;

/** Lines that fit any business. Seeded from the bake-off, where three models wrote the first one for a cleaner, a nail salon and a grill. */
const GENERIC_HEADLINES = [
  "hecho con carino, para ti", "made with care, for you", "done with care, for you",
  "calidad y servicio", "quality and service", "tu mejor opcion", "your best choice",
  "bienvenidos", "welcome", "estamos para servirte", "we are here for you",
  "lo que ofrecemos", "what we offer", "nuestros servicios", "our services",
];

export function normalizeHeadline(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

const GENERIC_NORM = new Set(GENERIC_HEADLINES.map(normalizeHeadline));

/** Word-overlap similarity (Jaccard) after normalization. */
export function headlineSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeHeadline(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(normalizeHeadline(b).split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / (wa.size + wb.size - inter);
}

/**
 * The deterministic half. `bank` is the headline set of recently composed
 * sites (other tenants); a new headline must not equal one or overlap ≥ 0.8.
 */
export function checkHeadlineBank(copy: Record<string, Bilingual>, bank: readonly string[]): CriticProblem[] {
  const problems: CriticProblem[] = [];
  const bankNorm = bank.map(normalizeHeadline).filter(Boolean);
  for (const key of HEADLINE_KEYS) {
    const value = copy[key];
    if (!value) continue;
    for (const locale of ["es", "en"] as const) {
      const text = value[locale];
      if (!text) continue;
      const n = normalizeHeadline(text);
      if (GENERIC_NORM.has(n)) {
        problems.push({ key, reason: `generic headline (${locale}): "${text}"` });
        continue;
      }
      const hit = bankNorm.find((b) => b === n || headlineSimilarity(b, n) >= 0.8);
      if (hit) problems.push({ key, reason: `already used by another site (${locale}): "${text}"` });
    }
  }
  return problems;
}

export const CRITIC_JSON_SCHEMA = {
  name: "copy_critic",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["problems"],
    properties: {
      problems: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "reason"],
          properties: { key: { type: "string" }, reason: { type: "string" } },
        },
      },
    },
  },
} as const;

export function buildCriticPrompt(input: { copy: Record<string, Bilingual>; facts: CopyPassFacts; primaryLocale: "es" | "en" }): { systemPrompt: string; userMessage: string } {
  const system = [
    "You check website copy written for a small local business against the business's facts. You are strict and terse.",
    "Report a problem ONLY for: a fact not in the facts (a service, dish, place, number, claim, award, or promise); copy in the wrong language for its slot (es must be Spanish, en must be English); a headline that could belong to any business; a line that contradicts the facts.",
    "Do not report style preferences. Do not rewrite anything.",
    'Return JSON only: {"problems": [{"key": "<slot key>", "reason": "<one short sentence>"}]}. An empty list means the copy passes.',
  ].join("\n");
  const f = input.facts;
  const facts = [
    `business: ${f.businessName}`,
    `type: ${f.typeLabel.es} / ${f.typeLabel.en}`,
    f.city ? `city: ${f.city}` : null,
    f.audience ? `audience: ${f.audience}` : null,
    f.tone ? `tone: ${f.tone}` : null,
    f.differentiator ? `what makes it different: ${f.differentiator}` : null,
    f.description ? `description: ${f.description.slice(0, 400)}` : null,
    f.services && f.services.length ? `services: ${f.services.join("; ")}` : "services: (none stated)",
  ].filter(Boolean);
  const lines = Object.entries(input.copy).map(([k, v]) => `${k}: es="${v.es}" en="${v.en}"`);
  return {
    systemPrompt: system,
    userMessage: [`PRIMARY LANGUAGE: ${input.primaryLocale}`, "", "FACTS", ...facts, "", "COPY", ...lines, "", "Return only the JSON object."].join("\n"),
  };
}

export function parseCriticReply(raw: string | null): CriticProblem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as { problems?: unknown };
    if (!Array.isArray(parsed.problems)) return null;
    return parsed.problems
      .filter((p): p is { key: unknown; reason: unknown } => !!p && typeof p === "object")
      .map((p) => ({ key: String(p.key ?? "*"), reason: String(p.reason ?? "").slice(0, 200) }))
      .filter((p) => p.reason.length > 0)
      .slice(0, 12);
  } catch {
    return null;
  }
}

/** The retry instruction appended to the copy-pass user message after a failed verdict. */
export function retryInstruction(problems: CriticProblem[], avoidHeadlines: readonly string[]): string {
  const lines = ["", "A reviewer rejected the previous draft. Fix exactly these and return every key again:"];
  for (const p of problems) lines.push(`- ${p.key}: ${p.reason}`);
  if (avoidHeadlines.length) lines.push("", "Headlines already used by other sites, do not write these or anything close:", ...avoidHeadlines.slice(0, 40).map((h) => `- ${h}`));
  return lines.join("\n");
}
