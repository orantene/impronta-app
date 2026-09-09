/**
 * envelope.ts — the uniform shape every command carries.
 *
 * WHAT WAS THERE BEFORE. Five idempotency mechanisms, each correct on its own
 * and none of them composable: `stripe_processed_events` for webhooks, an
 * `orderKey` on the purchase pipeline, unique constraints under the capacity
 * engine, claim-before-execute on the ticket refund cron, and nothing at all on
 * most admin server actions. Which guard a button got depended on which code
 * path happened to be underneath it, and no operator-facing surface could
 * answer "did that go through?" — the question an operator actually asks after
 * a spinner that did not resolve.
 *
 * FIVE FIELDS, EACH EARNING ITS PLACE
 * ───────────────────────────────────
 *   actorUserId      who. Nullable because system sweeps are real actors with
 *                    no user, and inventing one for them makes the audit trail
 *                    lie about who cancelled an event.
 *   tenantId         which workspace. Part of the idempotency uniqueness so a
 *                    key cannot cross a tenant boundary even by accident.
 *   expectedRevision the caller's view of the aggregate. Null means "I did not
 *                    look" — an unconditional write, which is right for a
 *                    create and wrong for an edit.
 *   idempotencyKey   which INTENT. Not which request: a retry of the same
 *                    intent reuses it, which is the entire point.
 *   correlationId    which chain. One id threading a click through its command,
 *                    its outbox messages and the effects they cause, so the
 *                    Exceptions inbox can show a failure next to what caused it.
 *
 * THIS MODULE IS PURE. No database, no `server-only`, no crypto beyond what the
 * Web Crypto API gives both runtimes. It is imported by the runner, by client
 * code minting keys before it calls an action, and by tests — and a client that
 * cannot mint its own key is a client that cannot make its retry idempotent.
 */

export type CommandEnvelope = {
  /** Dotted and namespaced, e.g. `pos.startCollection`. */
  command: string;
  tenantId: string;
  actorUserId: string | null;
  /**
   * Optimistic concurrency token. `null` is an explicit "unconditional", never
   * a default that crept in: a handler that ignores a supplied revision is a
   * lost update, and a handler that demands one on a create cannot create.
   */
  expectedRevision: number | null;
  idempotencyKey: string;
  correlationId: string;
  issuedAt: string;
};

export type CommandEnvelopeInput = {
  command: string;
  tenantId: string;
  actorUserId?: string | null;
  expectedRevision?: number | null;
  idempotencyKey?: string;
  correlationId?: string;
  issuedAt?: string;
};

/**
 * A v4-shaped id that works in both runtimes and in a Node test process.
 *
 * `crypto.randomUUID` is unavailable on insecure origins in some browsers, and
 * a command that cannot mint a correlation id must not become a command that
 * does not run. The fallback is not cryptographically strong and does not need
 * to be: neither a correlation id nor an idempotency key is a credential.
 */
export function newCommandId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`;
  }
}

export function makeEnvelope(input: CommandEnvelopeInput): CommandEnvelope {
  return {
    command: input.command,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    expectedRevision: input.expectedRevision ?? null,
    // A MINTED KEY IS A LAST RESORT, not the normal path. When the caller does
    // not supply one, every retry is a different intent and idempotency
    // degrades to nothing — which is exactly the behaviour we have today, so
    // adopting the envelope never makes a call site worse. It just does not
    // make it better until the caller passes a stable key.
    idempotencyKey: input.idempotencyKey ?? newCommandId(),
    correlationId: input.correlationId ?? newCommandId(),
    issuedAt: input.issuedAt ?? new Date().toISOString(),
  };
}

/**
 * Canonical JSON: object keys sorted at every depth, so two structurally equal
 * argument objects fingerprint the same regardless of how they were built.
 *
 * `JSON.stringify` alone would make `{a:1,b:2}` and `{b:2,a:1}` different
 * requests, and the observable consequence is a spurious `conflict` on a
 * perfectly correct retry — the worst kind of failure, because the client's
 * only remedy is to stop retrying.
 *
 * `undefined` is dropped exactly as `JSON.stringify` drops it, so an explicitly
 * passed `undefined` and an omitted field are the same request. They are.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`)
    .join(",")}}`;
}

/**
 * A hash of what the caller asked for, so a reused key with different arguments
 * is refused rather than answered with the first request's result.
 *
 * `expectedRevision` is deliberately INSIDE the fingerprint. Two requests with
 * the same key and different expected revisions are not the same intent —
 * "update this if it is still at 4" and "update this if it is still at 7" are
 * different questions, and returning the first one's answer to the second is
 * how an optimistic-concurrency check gets silently skipped.
 *
 * `correlationId` and `issuedAt` are deliberately OUTSIDE it. They are
 * observability, and a retry that mints a fresh correlation id is still the
 * same intent; folding them in would make every retry a conflict.
 */
export async function fingerprintRequest(
  envelope: Pick<CommandEnvelope, "command" | "expectedRevision">,
  args: unknown,
): Promise<string> {
  const material = canonicalJson({
    command: envelope.command,
    expectedRevision: envelope.expectedRevision,
    args,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
