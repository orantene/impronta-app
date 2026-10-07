import * as Sentry from "@sentry/nextjs";

import type { ActionResult, InboxFilter, InboxRow } from "@/lib/messaging/types";

type InboxResult = ActionResult<{ rows: InboxRow[]; unreadCount: number }>;
type LoadInbox = (input: { locationSlug: string; filter: InboxFilter }) => Promise<InboxResult>;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Thrown when the action promise never settles within the budget. */
export class InboxActionStalledError extends Error {
  constructor(ms: number) {
    super(`messagingTalentLoadInbox did not settle within ${ms}ms`);
    this.name = "InboxActionStalledError";
  }
}

/**
 * Next's router action queue marks a pending server action `discarded` when a
 * navigation (router.replace/push, popstate) is dispatched while it is in
 * flight, and a discarded action's promise is NEVER resolved or rejected
 * (next/dist/client/components/app-router-instance.js, runAction ->
 * handleResult). On a direct load of /talent/inbox the first inbox call races
 * the shell's mount-time navigation, so `await load()` hung forever: the POST
 * returned 200 with rows, the shell stayed on the skeleton. Bound every call.
 */
function withSettleBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new InboxActionStalledError(ms)), ms);
  });
  return Promise.race([promise, stalled]).finally(() => clearTimeout(timer));
}

function report(error: unknown, attempt: number): void {
  const e = error as { name?: unknown; message?: unknown; digest?: unknown } | null;
  Sentry.captureException(error, {
    tags: { area: "talent-inbox", action: "messagingTalentLoadInbox" },
    extra: {
      attempt,
      name: typeof e?.name === "string" ? e.name : null,
      message: typeof e?.message === "string" ? e.message : String(error),
      digest: typeof e?.digest === "string" ? e.digest : null,
    },
  });
}

/**
 * Calls the inbox server action and never rejects or hangs. A transport
 * failure, or a call that never settles (discarded by a navigation, above), is reported to Sentry, retried
 * once after `retryDelayMs`, and then surfaces as the "unavailable" refusal so
 * the shell leaves its skeleton and shows the existing retry state.
 */
export async function safeLoadInbox(
  load: LoadInbox,
  input: { locationSlug: string; filter: InboxFilter },
  retryDelayMs = 2000,
  settleBudgetMs = 4000,
): Promise<InboxResult> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await withSettleBudget(load(input), settleBudgetMs);
    } catch (error) {
      report(error, attempt);
      if (attempt === 1) await wait(retryDelayMs);
    }
  }
  return { ok: false, reason: "unavailable" };
}
