/**
 * An in-memory `IdempotentRunner` for the storefront seam tests.
 *
 * IT IS A MODEL OF THE CONTRACT, NOT OF THE RUNNER. The real runner's claim
 * race lives in `lib/commands/run.test.ts`; this one only reproduces the four
 * facts a seam depends on: a success is replayed by key with the identical
 * result, a refusal is NOT replayed, a key reused with different arguments is
 * a conflict, and the handler runs at most once per successful key.
 */

import type { IdempotentOutcome, IdempotentRequest, IdempotentRunner } from "../idempotent";

export function memoryIdempotentRunner() {
  const done = new Map<string, { fingerprint: string; result: { ok: boolean } }>();
  let runs = 0;
  const runner: IdempotentRunner = async <T extends { ok: boolean }>(
    request: IdempotentRequest<T>,
  ): Promise<IdempotentOutcome<T>> => {
    const id = `${request.tenantId}|${request.command}|${request.key}`;
    const fingerprint = JSON.stringify(request.args ?? null);
    const prior = done.get(id);
    if (prior) {
      if (prior.fingerprint !== fingerprint) return { status: "conflict", code: "fingerprint_mismatch" };
      return { status: "ok", result: prior.result as T, replayed: true };
    }
    runs += 1;
    const result = await request.run();
    if (!result.ok) return { status: "refused", result };
    done.set(id, { fingerprint, result });
    return { status: "ok", result, replayed: false };
  };
  return { runner, runs: () => runs };
}
