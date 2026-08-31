/**
 * The classic /get-started form, written into a Brief.
 *
 * WHY THIS EXISTS BEFORE ANY CHAT DOES
 * The Brief is the artifact everything downstream reads, so it needs real rows
 * in it before the Agent is built. Wiring the existing form to it means the
 * Settings surface, the Recommendation Engine and the version history are all
 * exercised by live signups from day one, rather than debuting on the same day
 * as the conversation that fills them.
 *
 * WHAT IS AND IS NOT AN INFERENCE HERE
 * Every fact below is `user_stated`, because every one of them is a literal
 * answer the visitor selected or typed. The one thing that would be an
 * inference — reading the free-text description to work out an industry or a
 * roster shape — is deliberately NOT done here. That belongs to the extraction
 * layer, where it lands as `needs_approval` like any other guess.
 *
 * Best-effort by contract: signup must never fail because a brief could not be
 * written. Callers ignore the result.
 */

import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { ensureBrief, recordFacts, type BriefOwner } from "./brief-store.server";
import type { FactInput } from "./brief-store";

export type SignupAudience = "operator" | "agency" | "organization" | "business";
export type SignupRosterBucket = "1-5" | "6-20" | "21-50" | "50+";

export type SignupBriefInput = {
  contactName: string;
  businessName: string;
  businessDescription: string | null;
  audience: SignupAudience;
  rosterSize: SignupRosterBucket | string;
  locale?: string;
  signupLeadId: string;
};

/**
 * Lower bound of a roster bucket, or null when the bucket cannot settle the
 * question.
 *
 * "1-5" returns null on purpose: it contains 1, and 1 means "just me". Reading
 * it as five people would hand the engine a decisive workspace signal off an
 * answer a sole trader gave truthfully.
 */
function rosterLowerBound(bucket: string): number | null {
  switch (bucket) {
    case "6-20":
      return 6;
    case "21-50":
      return 21;
    case "50+":
      return 50;
    default:
      return null;
  }
}

/** The facts a /get-started submission literally asserts. Pure, so it is tested. */
export function factsFromSignup(input: SignupBriefInput): FactInput[] {
  const facts: FactInput[] = [];

  const contactName = input.contactName.trim();
  if (contactName) {
    facts.push({ factKey: "person.name", value: contactName, source: "user_stated" });
  }

  const businessName = input.businessName.trim();
  if (businessName) {
    facts.push({ factKey: "business.name", value: businessName, source: "user_stated" });
    // They came through the workspace funnel and named an operation. That is
    // the definition of "a brand to run" in the object model.
    facts.push({ factKey: "business.exists", value: true, source: "user_stated" });
  }

  const description = input.businessDescription?.trim();
  if (description) {
    facts.push({
      factKey: "business.description",
      value: description,
      source: "user_stated",
      sourceExcerpt: description,
    });
  }

  // The audience radio is the visitor's own answer to "which describes you
  // best", so its consequences are stated, not guessed. The mapping follows
  // `starterAudienceHasRoster`: only `business` is roster-free.
  switch (input.audience) {
    case "agency":
    case "organization":
      facts.push({
        factKey: "business.represents_others",
        value: true,
        source: "user_stated",
      });
      break;
    case "business":
      facts.push({
        factKey: "business.represents_others",
        value: false,
        source: "user_stated",
      });
      break;
    case "operator":
      // A solo professional selling their own work. Recorded as talent
      // evidence, NOT as "works alone": the funnel's own roster question can
      // still say otherwise, and an operator with a roster is a real case.
      facts.push({
        factKey: "work.performs_service_personally",
        value: true,
        source: "user_stated",
      });
      break;
  }

  const seats = rosterLowerBound(input.rosterSize);
  if (seats !== null) {
    facts.push({ factKey: "business.staff_count", value: seats, source: "user_stated" });
    facts.push({
      factKey: "business.represents_others",
      value: true,
      source: "user_stated",
    });
  }

  return facts;
}

/**
 * Create or update the owner's brief from a signup submission.
 *
 * Not snapshotted. A snapshot marks a state someone might want back, and a
 * form submission is the beginning of a brief rather than a revision of one;
 * v1 gets cut when the intake is approved.
 */
export async function writeSignupBrief(
  owner: BriefOwner,
  input: SignupBriefInput,
): Promise<{ briefId: string } | null> {
  try {
    const ensured = await ensureBrief(owner, {
      locale: input.locale,
      signupLeadId: input.signupLeadId,
    });
    if (!ensured.ok) return null;

    const facts = factsFromSignup(input);
    if (facts.length > 0) {
      const result = await recordFacts(ensured.brief.id, facts);
      if (result.rejected.length > 0) {
        // A rejection here is a vocabulary bug, not bad user input: every fact
        // above is built from a validated form field. Worth the log line.
        logServerError(
          "tulala.writeSignupBrief.rejected",
          new Error(result.rejected.map((r) => `${r.factKey}: ${r.error}`).join("; ")),
        );
      }
    }
    return { briefId: ensured.brief.id };
  } catch (err) {
    logServerError("tulala.writeSignupBrief", err);
    return null;
  }
}
