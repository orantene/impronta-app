/**
 * Server action for the recommendation review screen.
 *
 * One action: accept what was recommended, possibly edited. "Keep talking" is a
 * plain link back to the conversation and needs no server round trip.
 *
 * WHY THE CHOICE IS RE-VALIDATED HERE
 * ───────────────────────────────────
 * The form posts what the visitor picked, and a form post is untrusted input. It
 * is checked against the LAWS rather than against the recommendation, because
 * the visitor is allowed to disagree with the engine — that is the whole point
 * of the override telemetry — but nobody is allowed to create a shape the
 * product cannot run. "Talent Profile for a limited company" is not a
 * preference, it is a broken profile and a broken directory.
 *
 * This is also the first place the law module is actually load-bearing. It was
 * written and tested in isolation; here it decides.
 */

"use server";

import { redirect } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { loadBrief } from "@/lib/tulala/brief-store.server";
import { recommendForBrief } from "@/lib/tulala/engine.server";
import { checkLaws } from "@/lib/tulala/laws";
import { proposalFromBrief } from "@/lib/tulala/laws-bridge";
import { resolveBriefOwner } from "@/lib/tulala/owner.server";
import {
  approveRecommendation,
  type ApprovedChoice,
} from "@/lib/tulala/approve.server";
import type { Recommendation } from "@/lib/tulala/engine";

export type ReviewActionState = { error: string | null };

/**
 * Accept the recommendation and hand off to the existing signup pipeline.
 *
 * Redirects on success, so it never returns in the happy path. `redirect` is
 * implemented by throwing, which is why nothing here wraps it in a try/catch:
 * catching that throw would turn every success into a silent failure.
 */
export async function acceptRecommendation(
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const resolved = await resolveBriefOwner();
  if (!resolved) return { error: "Your session expired. Start again?" };

  const brief = await loadBrief(resolved.owner);
  if (!brief) return { error: "There is nothing to set up yet." };

  // Re-run rather than trust a posted recommendation. The catalog may have
  // changed between render and submit, and a plan key from a form is a plan key
  // the visitor could have edited.
  const locale = await getRequestLocale();
  const { recommendation } = await recommendForBrief(brief, {
    persist: false,
    scope: { sessionId: resolved.guestSessionId, userId: resolved.userId, locale },
  });

  const choice = readChoice(formData, recommendation);

  const violations = checkLaws(
    proposalFromBrief(brief, {
      talentProfile: choice.talentProfile,
      workspace: choice.workspace,
      workspaceType: choice.workspaceType,
    }),
  );
  if (violations.length > 0) {
    const first = violations[0]!;
    return { error: `${capitalize(first.because)}. Try this instead: ${first.remedy}.` };
  }

  const result = await approveRecommendation({
    owner: resolved.owner,
    brief,
    recommendation,
    choice,
    email: formEmail(formData),
    locale,
    scope: { sessionId: resolved.guestSessionId, userId: resolved.userId },
  });

  if (!result.ok) return { error: result.error };

  redirect(result.nextPath);
}

/**
 * Read the posted choice, defaulting every field to what was recommended.
 *
 * Defaulting rather than requiring: the screen only renders controls for fields
 * it lets the visitor change, and a missing field must mean "no objection", not
 * "false". Reading a missing checkbox as false would silently strip the talent
 * profile off anyone who used the plain Continue button.
 */
function readChoice(formData: FormData, recommendation: Recommendation): ApprovedChoice {
  const posted = (key: string): string | null => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  };

  const shape = posted("shape");
  const talentProfile =
    shape === "talent_only" || shape === "both"
      ? true
      : shape === "workspace_only"
        ? false
        : recommendation.structure.talentProfile;
  const workspace =
    shape === "workspace_only" || shape === "both"
      ? true
      : shape === "talent_only"
        ? false
        : recommendation.structure.workspace;

  const workspaceType = workspace
    ? (normalizeWorkspaceType(posted("workspaceType")) ??
      normalizeWorkspaceType(recommendation.structure.workspaceType) ??
      "business")
    : null;

  return {
    talentProfile,
    workspace,
    workspaceType,
    // Plan comes from the engine, never from the form. The visitor picks WHAT to
    // build on this screen; they pick what to PAY on the checkout that follows,
    // where the real price and trial terms are shown. Honouring a plan key from
    // this post would let it select a tier whose price it was never shown.
    workspacePlan: workspace ? recommendation.plans.workspace : null,
    talentPlan: talentProfile ? recommendation.plans.talent : null,
  };
}

function normalizeWorkspaceType(value: string | null): "talent" | "business" | null {
  return value === "talent" || value === "business" ? value : null;
}

function formEmail(formData: FormData): string | null {
  const raw = formData.get("email");
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  // Deliberately loose. The real validation is the lead row's constraint and the
  // checkout that follows; a strict regex here that rejects a valid address is a
  // worse outcome than one that accepts a typo the visitor can see and fix.
  return value.includes("@") && value.length >= 3 && value.length <= 254 ? value : null;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
