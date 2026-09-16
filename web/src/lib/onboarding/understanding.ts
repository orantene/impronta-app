/**
 * Onboarding module — "Here is what I understood".
 *
 * Pure. Turns a brief (facts with provenance) plus the CTA's intent into the
 * card the person sees: the path (talent / business / both), the essentials
 * for that path each marked known · assumed · missing, the follow-up
 * questions that remain, a business-type chip proposal, and a link name.
 *
 * Rules (screen-spec v3.3 "How the AI decides"):
 *  - the path comes from the words; the CTA's intent only breaks a tie, and a
 *    genuine tie is asked, never guessed;
 *  - "known" = the person said it (user_stated or confirmed); "assumed" = the
 *    model or an import proposed it and nobody confirmed; "missing" = nothing;
 *  - "later" = things the module never asks (logo lives in the builder);
 *  - nothing here invents a fact; a fork tap is a choice, not a fact.
 */

import type { Brief, BriefFact, FactSource } from "@/lib/tulala/brief-store";
import { booleanFact, listFact, stringFact } from "@/lib/tulala/brief-store";
import { normalizeWorkspaceSlugCandidate } from "@/lib/saas/workspace-signup";

import type { OnboardingIntent, OnboardingPath } from "./module-state";
import { MODULE_QUESTIONS, type ModuleQuestionId } from "./module-questions";

export type EssentialId =
  | "name"
  | "what"
  | "city"
  | "services"
  | "businessName"
  | "offer"
  | "hours"
  | "whatsapp"
  | "logo"
  | "kind";

export type LineStatus = "known" | "assumed" | "missing" | "later";

export type UnderstoodLine = {
  id: EssentialId;
  factKey: string;
  /** Catalog key for the label: `public.onboarding.lines.<id>`. */
  labelKey: string;
  value: string | null;
  status: LineStatus;
  source: FactSource | null;
  confidence: number | null;
  /** How the person fixes it on the card. */
  edit: { kind: "inline" } | { kind: "question"; questionId: ModuleQuestionId } | { kind: "none" };
};

export type TypeChip = {
  /** Free text the model read (`work.industry` or `work.discipline`). */
  query: string;
  status: "known" | "assumed";
};

export type Understanding = {
  path: OnboardingPath;
  pathConfidence: "clear" | "ambiguous";
  pathSource: "words" | "intent" | "user";
  lines: UnderstoodLine[];
  followUps: ModuleQuestionId[];
  typeChip: TypeChip | null;
  linkName: { slug: string; from: "business.name" | "person.professional_name" | "person.name" } | null;
  /** Fewer than three essentials known or assumed: not enough to build on. */
  tooLittle: boolean;
};

const KNOWN_SOURCES: ReadonlySet<FactSource> = new Set(["user_stated", "system_derived"]);

function fact(brief: Brief, key: string): BriefFact | null {
  return brief.facts.find((f) => f.factKey === key && f.status !== "rejected") ?? null;
}

function lineStatus(f: BriefFact | null, hasValue: boolean): LineStatus {
  if (!f || !hasValue) return "missing";
  if (f.status === "confirmed" || KNOWN_SOURCES.has(f.source)) return "known";
  return "assumed";
}

function displayValue(f: BriefFact | null): string | null {
  if (!f) return null;
  const v = f.value;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    const strs = v.filter((x): x is string => typeof x === "string" && !!x.trim());
    if (strs.length) return strs.join(" · ");
    const titled = v
      .map((x) => (x && typeof x === "object" && "title" in x ? String((x as { title: unknown }).title) : null))
      .filter((x): x is string => !!x);
    return titled.length ? titled.join(" · ") : null;
  }
  return null;
}

/**
 * The path from the words. Business signals: a business name, "business
 * exists", a menu, staff. Talent signals: "works alone", a discipline with no
 * business signal, "employed by other". Both: a discipline or "performs the
 * service personally" alongside a business signal.
 */
export function decidePath(
  brief: Brief,
  intent: OnboardingIntent,
  userChoice: OnboardingPath | null,
): Pick<Understanding, "path" | "pathConfidence" | "pathSource"> {
  if (userChoice) return { path: userChoice, pathConfidence: "clear", pathSource: "user" };

  const businessName = stringFact(brief, "business.name");
  const businessExists = booleanFact(brief, "business.exists");
  const hasStaff = booleanFact(brief, "business.has_staff");
  const menu = listFact(brief, "menu.items").length > 0 || listFact(brief, "menu.categories").length > 0;
  const worksAlone = booleanFact(brief, "business.works_alone");
  const employed = booleanFact(brief, "business.employed_by_other");
  const discipline = stringFact(brief, "work.discipline");
  const performsPersonally = booleanFact(brief, "work.performs_service_personally");
  const goalsWebsite = booleanFact(brief, "goals.wants_website");
  const focusBusiness = booleanFact(brief, "goals.focus_on_business");
  const talentStillActive = booleanFact(brief, "goals.talent_still_active");

  const businessSignal = !!businessName || businessExists === true || menu || hasStaff === true;
  const soloSignal = worksAlone === true || employed === true || (!!discipline && !businessSignal);

  if (businessSignal) {
    const personal = performsPersonally === true || talentStillActive === true || (!!discipline && !menu && hasStaff !== true && focusBusiness !== true);
    if (personal && worksAlone !== true) return { path: "both", pathConfidence: "clear", pathSource: "words" };
    if (personal && worksAlone === true) return { path: "both", pathConfidence: "clear", pathSource: "words" };
    return { path: "business", pathConfidence: "clear", pathSource: "words" };
  }
  if (soloSignal) {
    if (goalsWebsite === true && intent === "business") return { path: "business", pathConfidence: "ambiguous", pathSource: "intent" };
    return { path: "talent", pathConfidence: "clear", pathSource: "words" };
  }
  // No signal at all: the CTA decides, and we say so by asking when unknown.
  if (intent === "talent") return { path: "talent", pathConfidence: "clear", pathSource: "intent" };
  if (intent === "business") return { path: "business", pathConfidence: "clear", pathSource: "intent" };
  return { path: "talent", pathConfidence: "ambiguous", pathSource: "intent" };
}

function line(
  brief: Brief,
  id: EssentialId,
  factKey: string,
  edit: UnderstoodLine["edit"],
  opts: { later?: boolean } = {},
): UnderstoodLine {
  const f = fact(brief, factKey);
  const value = displayValue(f);
  const status: LineStatus = opts.later ? "later" : lineStatus(f, value !== null);
  return {
    id,
    factKey,
    labelKey: `public.onboarding.lines.${id}`,
    value,
    status,
    source: f?.source ?? null,
    confidence: f?.confidence ?? null,
    edit,
  };
}

/** The person's name for the card: professional name first, else name. */
function personNameLine(brief: Brief): UnderstoodLine {
  const pro = fact(brief, "person.professional_name");
  const key = pro && displayValue(pro) ? "person.professional_name" : "person.name";
  return line(brief, "name", key, { kind: "question", questionId: "name" });
}

export function essentialsFor(brief: Brief, path: OnboardingPath): UnderstoodLine[] {
  const talent: UnderstoodLine[] = [
    personNameLine(brief),
    line(brief, "what", "work.discipline", { kind: "question", questionId: "basics" }),
    line(brief, "city", "person.city", { kind: "question", questionId: "basics" }),
    line(brief, "services", "work.services", { kind: "question", questionId: "services" }),
  ];
  const business: UnderstoodLine[] = [
    line(brief, "businessName", "business.name", { kind: "inline" }),
    line(brief, "kind", "work.industry", { kind: "question", questionId: "kind_of_business" }),
    line(brief, "offer", "work.services", { kind: "question", questionId: "services" }),
    line(brief, "city", "person.city", { kind: "question", questionId: "basics" }),
    line(brief, "hours", "business.hours", { kind: "question", questionId: "two_quick_things" }),
    line(brief, "whatsapp", "presence.whatsapp", { kind: "question", questionId: "two_quick_things" }),
    line(brief, "logo", "brand.logo_url", { kind: "none" }, { later: true }),
  ];
  if (path === "talent") return talent;
  if (path === "business") return business;
  // both: the business card, plus the person's own name and discipline
  // (services is already there as "offer": same fact, one line)
  const seen = new Set(business.map((l) => l.factKey));
  return [...business, ...talent.filter((l) => !seen.has(l.factKey))];
}

/** A discipline that reads as a kind of business, for the type chip. */
export function typeChipFor(brief: Brief, path: OnboardingPath): TypeChip | null {
  const industry = fact(brief, "work.industry");
  const discipline = fact(brief, "work.discipline");
  const f = path === "talent" ? (discipline ?? industry) : (industry ?? discipline);
  const query = displayValue(f);
  if (!f || !query) return null;
  return { query, status: lineStatus(f, true) === "known" ? "known" : "assumed" };
}

export function linkNameFor(brief: Brief, path: OnboardingPath): Understanding["linkName"] {
  const candidates: Array<Understanding["linkName"] extends infer L ? (L extends { from: infer F } ? F : never) : never> =
    path === "talent"
      ? ["person.professional_name", "person.name"]
      : ["business.name", "person.professional_name", "person.name"];
  for (const from of candidates) {
    const v = stringFact(brief, from);
    if (!v) continue;
    const slug = normalizeWorkspaceSlugCandidate(v);
    if (slug) return { slug, from };
  }
  return null;
}

export function buildUnderstanding(input: {
  brief: Brief;
  intent: OnboardingIntent;
  userPath?: OnboardingPath | null;
}): Understanding {
  const decided = decidePath(input.brief, input.intent, input.userPath ?? null);
  const lines = essentialsFor(input.brief, decided.path);
  const followUps: ModuleQuestionId[] = [];
  if (decided.pathConfidence === "ambiguous") followUps.push("fork");
  for (const q of MODULE_QUESTIONS) {
    if (q.id === "fork" || q.id === "link_name" || q.id === "link_confirm") continue;
    if (q.askWhen({ lines, path: decided.path }) && !followUps.includes(q.id)) followUps.push(q.id);
  }
  const usable = lines.filter((l) => l.status === "known" || l.status === "assumed").length;
  return {
    ...decided,
    lines,
    followUps,
    typeChip: typeChipFor(input.brief, decided.path),
    linkName: linkNameFor(input.brief, decided.path),
    tooLittle: usable < 2,
  };
}
