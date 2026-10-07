import { createHash } from "node:crypto";

import type { PolicyAnswers } from "./answers";
import type { CustomClauses } from "./custom-clauses";
import type { PolicyFacts } from "./facts";
import { POLICY_TEMPLATE_VERSION, renderPolicyText } from "./render";

/** JSON with sorted keys, so equal content always serialises identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Content hash of a policy version: the facts, the answers, the template
 * version and the rendered ES + EN text. Any change a client would read
 * changes the hash; nothing else does.
 */
export function policyContentHash(facts: PolicyFacts, answers: PolicyAnswers, customClauses?: CustomClauses | null): string {
  // `cc` joins the payload only when clauses exist, so a version without them
  // hashes byte-identically to every version published before this field.
  const payload = {
    ...(customClauses ? { cc: customClauses } : {}),
    t: POLICY_TEMPLATE_VERSION,
    facts,
    answers,
    es: renderPolicyText(facts, answers, "es").text,
    en: renderPolicyText(facts, answers, "en").text,
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
