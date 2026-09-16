/**
 * idempotent.ts — how a storefront write becomes safe to replay.
 *
 * WHY THIS EXISTS. `createPurchase` accepts a `clientOrderKey` and calls it
 * "the idempotency anchor", but nothing persists or checks it: a double-tapped
 * Book button reaches the pipeline twice and mints two orders. The real
 * mechanism in this repo is `lib/commands/run.ts`, whose claim row goes in
 * BEFORE the handler runs so the second copy loses the unique index. Every
 * storefront act that creates money or holds a seat runs through it.
 *
 * REFUSALS ARE NOT REPLAYED. A handler that returns `{ ok: false }` is thrown
 * as a `CommandFailure` with `effects: "none"` so the claim is stamped
 * `failed` and the SAME key can be tried again once the person has fixed what
 * was refused (added an email, picked another time). Only a success is
 * replayed, and a replay hands back the identical result so the widget cannot
 * tell the difference — which is the point.
 *
 * The runner is a DEPENDENCY of every core so the unit tests can drive the
 * seams with `memoryIdempotentRunner()` (`__fixtures__/memory-runner.ts`)
 * without a database; the `.server.ts` files bind `commandIdempotentRunner`
 * over the service-role client.
 */

import { CommandFailure, runCommand, type Admin as CommandAdmin } from "@/lib/commands/run";
import { makeEnvelope } from "@/lib/commands/envelope";

export type IdempotentRequest<T extends { ok: boolean }> = {
  /** Dotted and namespaced, e.g. `storefront.appointment.book`. */
  command: string;
  tenantId: string;
  actorUserId: string | null;
  /** Per CART / per intent. The client regenerates it for a new intent. */
  key: string;
  /** The arguments, fingerprinted so a key reused with different input is a conflict. */
  args: unknown;
  run: () => Promise<T>;
};

export type IdempotentOutcome<T extends { ok: boolean }> =
  | { status: "ok"; result: T; replayed: boolean }
  /** The handler refused. `result` is the handler's own refusal. */
  | { status: "refused"; result: T }
  | { status: "conflict"; code: "fingerprint_mismatch" | "in_flight" | "fenced" }
  | { status: "error"; code: "engine_error"; detail: string };

export type IdempotentRunner = <T extends { ok: boolean }>(
  request: IdempotentRequest<T>,
) => Promise<IdempotentOutcome<T>>;

/** A refusal smuggled through `runCommand` as a failed claim. */
class RefusedRun<T> extends CommandFailure {
  readonly refusal: T;
  constructor(refusal: T, detail: string) {
    super("none", detail);
    this.name = "RefusedRun";
    this.refusal = refusal;
  }
}

function detailOf(refusal: unknown): string {
  if (refusal && typeof refusal === "object") {
    const r = refusal as { code?: unknown; reason?: unknown };
    if (typeof r.code === "string") return r.code;
    if (typeof r.reason === "string") return r.reason;
  }
  return "refused";
}

/** The production runner: claim, run, stamp, through `command_claim`. */
export function commandIdempotentRunner(admin: CommandAdmin): IdempotentRunner {
  return async <T extends { ok: boolean }>(request: IdempotentRequest<T>) => {
    const envelope = makeEnvelope({
      command: request.command,
      tenantId: request.tenantId,
      actorUserId: request.actorUserId,
      idempotencyKey: request.key,
      expectedRevision: null,
    });
    let refused: RefusedRun<T> | null = null;
    const outcome = await runCommand<T>(admin, envelope, request.args, async () => {
      const result = await request.run();
      if (!result.ok) {
        refused = new RefusedRun(result, detailOf(result));
        throw refused;
      }
      return result;
    });
    switch (outcome.status) {
      case "ok":
        return { status: "ok", result: outcome.result, replayed: false };
      case "replayed":
        return { status: "ok", result: outcome.result, replayed: true };
      case "conflict":
        return { status: "conflict", code: "fingerprint_mismatch" };
      case "in_flight":
        return { status: "conflict", code: "in_flight" };
      case "fenced":
        return { status: "conflict", code: "fenced" };
      case "error":
        if (refused) return { status: "refused", result: (refused as RefusedRun<T>).refusal };
        return { status: "error", code: "engine_error", detail: outcome.detail };
    }
  };
}
