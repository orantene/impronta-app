"use server";

/**
 * Exceptions inbox actions.
 *
 * THE TENANT IS NEVER A PARAMETER. `requireWorkspaceStaffAction` resolves the
 * workspace from the session, so a staff member cannot read or re-drive another
 * workspace's exceptions by editing one argument — the same structural
 * anti-escalation the door actions are built on.
 *
 * THE VERB IS VALIDATED AGAINST THE CLOSED SET, NOT AGAINST THE SCREEN. The
 * model routes a claimed refund to `inspect` and therefore renders no button
 * for it, but a server action is reachable without the screen: `resumeException`
 * re-checks the row's own state before it does anything, and this only has to
 * refuse a verb that is not a verb.
 *
 * READS USE THE SERVICE ROLE ON PURPOSE. `outbox_messages` has no staff policy
 * at all — deliberately, it is machinery — so an RLS-bound client would show
 * an operator four of the five sources and no indication the fifth existed.
 * Tenant scope is enforced in `loadExceptions` on every read.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import type { CapabilityKey } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { loadExceptions, type ExceptionsLoad } from "@/lib/exceptions/read";
import { resumeException } from "@/lib/exceptions/resume";
import type { ResumeOutcomeKey } from "@/lib/exceptions/outcome-copy";
import { RESUME_VERBS, type ResumeVerb } from "@/lib/exceptions/model";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { resolvePaymentFlag } from "@/lib/payments/payment-review-flags";
import { isPaymentReviewReason } from "@/lib/payments/payment-review-flags-model";

/**
 * TUL-1708: the default guard capability is `agency.workspace.view`, which a `viewer`
 * holds. Of the five RESUME_VERBS this re-drives, `run_refund_intent` moves money, so it
 * keeps the `booking.payment.refund` (admin+) bar the money-moving verb in this queue
 * already needs. The other four are floor operations — re-minting an admission, retrying
 * an engine effect, requeuing an outbox message, recovering an unresolved collection —
 * the same `operate_venue` (editor+) bar day-to-day venue operation requires elsewhere.
 */
const RESUME_VERB_CAPABILITY: Record<ResumeVerb, CapabilityKey> = {
  run_refund_intent: "booking.payment.refund",
  mint_missing_admissions: "operate_venue",
  retry_engine_effect: "operate_venue",
  requeue_outbox_message: "operate_venue",
  recover_unresolved_collection: "operate_venue",
};

export type LoadExceptionsResult =
  | { ok: true; load: ExceptionsLoad }
  | { ok: false; error: string };

export async function loadExceptionsInbox(): Promise<LoadExceptionsResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Exceptions are not set up on this server." };

  try {
    const load = await loadExceptions(admin, {
      tenantId: guard.tenantId,
      tenantSlug: guard.tenantSlug,
    });
    return { ok: true, load };
  } catch (error) {
    logServerError("exceptions.load", error);
    return { ok: false, error: "Could not load the exceptions queue." };
  }
}

export type ResumeExceptionResult =
  | { ok: true; message: string }
  | {
      ok: false;
      /**
       * A key under `dashboard.issues.result.*`. Present when the answer is a
       * DECISION the screen must say in the operator's own language; the
       * screen prefers it over `error`, which is English by construction.
       */
      messageKey?: ResumeOutcomeKey;
      error: string;
    };

/**
 * `idempotencyKey` comes from the CLIENT, and that is not laziness.
 *
 * Only the caller knows whether two clicks were one intent or two. A key
 * minted here would be fresh on every request, which makes the claim table
 * decorative on exactly the surface where an anxious operator double-taps.
 */
export async function resumeExceptionAction(input: {
  verb: string;
  sourceId: string;
  idempotencyKey: string;
}): Promise<ResumeExceptionResult> {
  await requireNotImpersonating();

  // The verb must be checked against the closed set before it can pick a
  // capability — membership in a fixed list of five strings, not a data read,
  // so refusing an unknown verb here leaks nothing.
  if (!(RESUME_VERBS as readonly string[]).includes(input.verb)) {
    return { ok: false, error: "That is not something this queue can re-drive." };
  }
  const guard = await requireWorkspaceStaffAction({
    capability: RESUME_VERB_CAPABILITY[input.verb as ResumeVerb],
  });
  if (!guard.ok) return { ok: false, error: guard.error };

  if (typeof input.sourceId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.sourceId)) {
    return { ok: false, error: "That is not a valid row." };
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 120
  ) {
    return { ok: false, error: "That is not a valid request." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Exceptions are not set up on this server." };

  const result = await resumeException(admin, {
    tenantId: guard.tenantId,
    verb: input.verb as ResumeVerb,
    sourceId: input.sourceId,
    actorUserId: guard.user.id,
    idempotencyKey: input.idempotencyKey,
  });

  if (result.ok) {
    // Three different true things, said as three different sentences. "Done"
    // for all of them would tell an operator a queued refund had already been
    // paid, which is the kind of confident wrong answer that ends in a second
    // manual refund.
    return {
      ok: true,
      message:
        result.outcome === "done"
          ? "Done."
          : result.outcome === "armed"
            ? "Queued. The worker picks it up within a minute."
            : "Already handled — nothing to do.",
    };
  }

  // A KEYED ANSWER WINS OVER BOTH. It is a decision rather than a diagnostic,
  // and a decision has to reach a Spanish or French operator in their own
  // language. `error` still carries the English for anyone reading a log.
  if (result.messageKey) {
    return { ok: false, messageKey: result.messageKey, error: result.reason };
  }

  // THE RUNNER'S SENTENCE WINS WHERE THERE IS ONE. `partial` and `uncertain`
  // carry a message that names what may have landed, and no sentence composed
  // out here from a reason code could say that. The reasons this screen owns
  // are the ones the ROW produced, before any handler ran.
  if (result.message) return { ok: false, error: result.message };

  return {
    ok: false,
    error:
      result.reason === "in_flight"
        ? "Your first attempt is still running."
        : result.reason === "not_found"
          ? "That row is no longer in this workspace."
          : result.reason === "not_resumable"
            ? "This one needs a person: it cannot be safely re-driven."
            : // `failed` is the one reason left that reaches here, and it is the
              // one reason that means the handler asserted it wrote nothing.
              // `seat_lost` never does: it always carries a key, and it is a
              // reason precisely because "nothing changed" is untrue of it.
              "That did not go through. Nothing was changed.",
  };
}

export type ResolvePaymentFlagActionResult =
  | { ok: true; resolved: boolean }
  | { ok: false; error: "not_authorized" | "invalid" | "not_found" | "failed" };

/**
 * Review fix 4 (TUL-1283 / TUL-1284 / M2): "Mark resolved" on a flagged card
 * charge, after a person has refunded or reconciled it in Stripe.
 *
 * BILLING-GATED: `manage_billing` (owners/admins), not the inbox's view
 * capability. The tenant comes from the session, never from the caller.
 * It only stamps `resolved_at` on the flag and moves no money, so it is not a
 * resume verb and needs no idempotency claim (resolving twice is a no-op).
 */
export async function resolvePaymentFlagAction(input: {
  transactionId: string;
  reason: string;
  paymentIntentId: string | null;
}): Promise<ResolvePaymentFlagActionResult> {
  await requireNotImpersonating();
  const guard = await requireWorkspaceStaffAction({ capability: "manage_billing" });
  if (!guard.ok) return { ok: false, error: "not_authorized" };

  if (typeof input.transactionId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.transactionId)) {
    return { ok: false, error: "invalid" };
  }
  if (!isPaymentReviewReason(input.reason)) return { ok: false, error: "invalid" };
  const paymentIntentId = input.paymentIntentId;
  if (paymentIntentId !== null && (typeof paymentIntentId !== "string" || !/^[A-Za-z0-9_]{3,255}$/.test(paymentIntentId))) {
    return { ok: false, error: "invalid" };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "failed" };

  const result = await resolvePaymentFlag(admin, {
    tenantId: guard.tenantId,
    transactionId: input.transactionId,
    reason: input.reason,
    paymentIntentId,
    actorUserId: guard.user.id,
  });
  if (result.ok) return { ok: true, resolved: result.resolved };
  return { ok: false, error: result.error === "not_found" ? "not_found" : "failed" };
}
