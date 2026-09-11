/**
 * The kitchen send's result, folded onto the floor's codes.
 *
 * `posSubmitPrep` answers with either the engine's `reason` (`empty`,
 * `not_found`, `wrong_tenant`, `unavailable`) or the route guard's `error`
 * (`not_allowed`, `invalid`, `unavailable`, or a sentence when the session
 * itself is gone). `empty` and the two "gone" reasons get the floor's own
 * kitchen sentences; the guard's words are already in the floor's table; and
 * anything else, including a sentence, is the generic refusal. Pure, so the
 * render test can pin every branch without a server.
 */

import type { FloorOutcome } from "@/components/admin/floor/floor-types";

export function kitchenOutcome(result: {
  ok: boolean;
  reason?: unknown;
  error?: unknown;
  revision?: number;
  amended?: boolean;
}): FloorOutcome {
  if (result.ok) return { ok: true, revision: result.revision, amended: result.amended };
  const raw = typeof result.reason === "string" ? result.reason : typeof result.error === "string" ? result.error : "";
  if (raw === "empty") return { ok: false, reason: "kitchen_empty" };
  if (raw === "not_found" || raw === "wrong_tenant") return { ok: false, reason: "kitchen_not_found" };
  if (raw === "not_allowed" || raw === "invalid") return { ok: false, reason: raw };
  return { ok: false, reason: "unavailable" };
}
