/**
 * brief-store.ts — the pure half of Brief handling.
 *
 * Shapes, snapshot building, and the fact-merge rules. No DB handle, so every
 * rule below is testable as a literal and the server module stays a thin
 * translation layer over these decisions.
 */

import {
  factKeyDef,
  isKnownFactKey,
  validateFactValue,
  type FactCategory,
} from "./fact-keys";

// ─── Shapes ───────────────────────────────────────────────────────────────────

export type FactSource =
  | "user_stated"
  | "url_import"
  | "ai_inference"
  | "system_derived";

export type FactStatus = "confirmed" | "needs_approval" | "suggested" | "rejected";

export type BriefFact = {
  factKey: string;
  value: unknown;
  source: FactSource;
  confidence: number;
  status: FactStatus;
  sourceExcerpt: string | null;
  sourceUrl: string | null;
  questionId: string | null;
  questionVersion: number | null;
  updatedAt: string | null;
};

export type BriefStatus =
  | "discovering"
  | "ready_for_review"
  | "approved"
  | "provisioned"
  | "abandoned";

export type Brief = {
  id: string;
  status: BriefStatus;
  locale: string;
  currentVersion: number;
  engineVersion: string | null;
  profileId: string | null;
  guestSessionId: string | null;
  signupLeadId: string | null;
  talentProfileId: string | null;
  tenantId: string | null;
  facts: BriefFact[];
  updatedAt: string | null;
};

/** A fact on its way in. `confidence` and `status` are derived when omitted. */
export type FactInput = {
  factKey: string;
  value: unknown;
  source: FactSource;
  confidence?: number;
  status?: FactStatus;
  sourceExcerpt?: string | null;
  sourceUrl?: string | null;
  questionId?: string | null;
  questionVersion?: number | null;
};

// ─── Provenance rules ─────────────────────────────────────────────────────────

/**
 * Longest excerpt we keep. Matches the DB CHECK, and both exist on purpose: the
 * constraint is the guarantee, this is the friendly truncation so a long answer
 * stores a usable quote instead of failing the insert.
 */
export const MAX_SOURCE_EXCERPT = 500;

/**
 * The status a fact is allowed to arrive with.
 *
 * The one rule: a model may propose, only a human may confirm (decision L20).
 * Enforced here AND by a CHECK constraint, because this is precisely the rule a
 * future caller will bypass by passing `status: "confirmed"` to save a step.
 *
 * `url_import` is treated as an inference, not as testimony. A heading scraped
 * off someone's homepage is a good guess about their business name, not a
 * statement they made to us today, and the difference is exactly what the
 * confirm step is for.
 */
export function resolveIncomingStatus(input: FactInput): FactStatus {
  if (input.status === "rejected") return "rejected";
  switch (input.source) {
    case "user_stated":
      // The user said it. Nothing to approve.
      return "confirmed";
    case "system_derived":
      // Derived from objects that already exist, so it is as true as they are.
      return "confirmed";
    case "ai_inference":
    case "url_import":
      return input.status === "suggested" ? "suggested" : "needs_approval";
  }
}

/**
 * Default confidence by source, when a caller does not supply one.
 *
 * Not cosmetic: the engine weights evidence by confidence, so an unlabelled
 * inference defaulting to 1.0 would let a guess outvote a statement.
 */
export function resolveIncomingConfidence(input: FactInput): number {
  if (typeof input.confidence === "number" && Number.isFinite(input.confidence)) {
    return Math.min(1, Math.max(0, input.confidence));
  }
  switch (input.source) {
    case "user_stated":
    case "system_derived":
      return 1;
    case "url_import":
      return 0.7;
    case "ai_inference":
      return 0.5;
  }
}

export type NormalizedFact = {
  factKey: string;
  value: unknown;
  source: FactSource;
  confidence: number;
  status: FactStatus;
  sourceExcerpt: string | null;
  sourceUrl: string | null;
  questionId: string | null;
  questionVersion: number | null;
};

export type NormalizeResult =
  | { ok: true; fact: NormalizedFact }
  | { ok: false; error: string };

/**
 * Validate and complete one incoming fact.
 *
 * Rejects unknown keys rather than storing them. `fact_key` is unconstrained in
 * SQL so packs can extend the vocabulary; that makes this function the only
 * thing standing between a typo and a permanently unreadable row.
 */
export function normalizeFact(input: FactInput): NormalizeResult {
  if (!isKnownFactKey(input.factKey)) {
    return { ok: false, error: `Unknown fact key: ${input.factKey}` };
  }
  const validated = validateFactValue(input.factKey, input.value);
  if (!validated.ok) return { ok: false, error: validated.error };

  const excerpt = input.sourceExcerpt?.trim() || null;

  return {
    ok: true,
    fact: {
      factKey: input.factKey,
      value: validated.value,
      source: input.source,
      confidence: resolveIncomingConfidence(input),
      status: resolveIncomingStatus(input),
      sourceExcerpt: excerpt ? excerpt.slice(0, MAX_SOURCE_EXCERPT) : null,
      sourceUrl: input.sourceUrl?.trim() || null,
      questionId: input.questionId?.trim() || null,
      questionVersion: input.questionVersion ?? null,
    },
  };
}

/**
 * Should an incoming fact replace the one already stored under that key?
 *
 * The table holds one row per key, so every re-statement is a potential
 * overwrite and this is the rule that decides. The ordering that matters:
 *
 *   - The user always wins. If she says "actually, four artists", that replaces
 *     whatever we inferred, at any confidence. A system that argues with a
 *     correction is worse than one that never guessed.
 *   - A guess never overwrites a confirmed fact. This is the failure mode the
 *     whole provenance layer exists to prevent: a later, breezier inference
 *     quietly replacing something the user actually told us.
 *   - Between two guesses, higher confidence wins; ties keep the existing row so
 *     repeated extraction of the same value does not churn `updated_at`.
 */
export function shouldReplaceFact(
  existing: BriefFact | null,
  incoming: NormalizedFact,
): boolean {
  if (!existing) return true;
  if (existing.status === "rejected") {
    // A rejected fact is a decision, not a gap. Only the user reopens it.
    return incoming.source === "user_stated";
  }
  const incomingIsHuman = incoming.source === "user_stated";
  const existingIsHuman = existing.source === "user_stated";
  if (incomingIsHuman) return true;
  if (existingIsHuman) return false;
  if (existing.status === "confirmed" && incoming.status !== "confirmed") return false;
  return incoming.confidence > existing.confidence;
}

// ─── Reading a brief ──────────────────────────────────────────────────────────

/** Facts the engine may score: confirmed, or a guess nobody has rejected. */
export function scorableFacts(brief: Brief): BriefFact[] {
  return brief.facts.filter((f) => f.status !== "rejected");
}

/** Facts the user has actually agreed to. */
export function confirmedFacts(brief: Brief): BriefFact[] {
  return brief.facts.filter((f) => f.status === "confirmed");
}

/** Facts waiting on a human, which is what the approval screen renders. */
export function factsAwaitingApproval(brief: Brief): BriefFact[] {
  return brief.facts.filter(
    (f) => f.status === "needs_approval" || f.status === "suggested",
  );
}

export function factValue(brief: Brief, key: string): unknown {
  return brief.facts.find((f) => f.factKey === key && f.status !== "rejected")?.value;
}

export function booleanFact(brief: Brief, key: string): boolean | null {
  const v = factValue(brief, key);
  return typeof v === "boolean" ? v : null;
}

export function stringFact(brief: Brief, key: string): string | null {
  const v = factValue(brief, key);
  return typeof v === "string" && v.trim() ? v : null;
}

export function numberFact(brief: Brief, key: string): number | null {
  const v = factValue(brief, key);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function listFact(brief: Brief, key: string): string[] {
  const v = factValue(brief, key);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Grouped for the Settings surface. Empty categories are omitted. */
export function factsByCategory(
  brief: Brief,
): Array<{ category: FactCategory; facts: BriefFact[] }> {
  const order: FactCategory[] = [
    "identity",
    "work",
    "business",
    "presence",
    "operations",
    "brand",
    "goals",
    // Last, because it is craft detail rather than anything that decided the
    // shape or the plan. Someone scanning this screen to check we understood
    // them should hit the load-bearing facts first.
    "industry",
  ];
  return order
    .map((category) => ({
      category,
      facts: brief.facts.filter(
        (f) => factKeyDef(f.factKey)?.category === category && f.status !== "rejected",
      ),
    }))
    .filter((g) => g.facts.length > 0);
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export type BriefSnapshot = {
  /** Vocabulary version, so a restored snapshot can be read correctly later. */
  vocabularyVersion: number;
  engineVersion: string | null;
  status: BriefStatus;
  locale: string;
  facts: Array<{
    factKey: string;
    value: unknown;
    source: FactSource;
    confidence: number;
    status: FactStatus;
    sourceExcerpt: string | null;
    sourceUrl: string | null;
  }>;
};

/**
 * Build the immutable snapshot stored on a version row.
 *
 * Self-contained on purpose: it carries the whole fact set, including
 * provenance, so restoring v2 does not depend on which fact rows happen to
 * exist now. A snapshot holding only a diff would make "restore" a no-op the
 * moment the current facts drifted, which is the only time anyone restores.
 *
 * Question ids are deliberately NOT snapshotted. They are instrumentation about
 * how we asked, not part of what the user's business is, and keeping them out
 * means restoring a version cannot resurrect a retired question id.
 */
export function buildSnapshot(brief: Brief, vocabularyVersion: number): BriefSnapshot {
  return {
    vocabularyVersion,
    engineVersion: brief.engineVersion,
    status: brief.status,
    locale: brief.locale,
    facts: brief.facts.map((f) => ({
      factKey: f.factKey,
      value: f.value,
      source: f.source,
      confidence: f.confidence,
      status: f.status,
      sourceExcerpt: f.sourceExcerpt,
      sourceUrl: f.sourceUrl,
    })),
  };
}

/**
 * Read a snapshot back into fact inputs for a restore.
 *
 * Restored facts keep their original source and status rather than becoming
 * `user_stated`. Restoring is not re-stating: a guess that was pending approval
 * in v2 must still be pending approval after the restore, or "restore" would
 * launder every unapproved inference into a confirmed one.
 */
export function factsFromSnapshot(snapshot: BriefSnapshot): FactInput[] {
  if (!snapshot || !Array.isArray(snapshot.facts)) return [];
  return snapshot.facts
    .filter((f) => f && typeof f.factKey === "string" && isKnownFactKey(f.factKey))
    .map((f) => ({
      factKey: f.factKey,
      value: f.value,
      source: f.source,
      confidence: f.confidence,
      status: f.status,
      sourceExcerpt: f.sourceExcerpt ?? null,
      sourceUrl: f.sourceUrl ?? null,
    }));
}

// ─── Prompt redaction ─────────────────────────────────────────────────────────

/**
 * The fact set with names and contact details removed, for prompts.
 *
 * Classification never needs to know someone's surname: whether she needs a
 * workspace depends on whether she takes a cut, not on what she is called.
 * Same stance as `entitlements.redactForPrompt`, which strips prices for the
 * same reason.
 */
export function redactFactsForPrompt(
  facts: BriefFact[],
): Array<{ factKey: string; value: unknown; source: FactSource; confidence: number }> {
  return facts
    .filter((f) => !factKeyDef(f.factKey)?.personal)
    .map((f) => ({
      factKey: f.factKey,
      value: f.value,
      source: f.source,
      confidence: f.confidence,
    }));
}
