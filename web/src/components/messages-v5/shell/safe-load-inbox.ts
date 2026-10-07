import { settleServerAction } from "@/lib/client/settle-server-action";
import type { ActionResult, InboxFilter, InboxRow } from "@/lib/messaging/types";

type InboxResult = ActionResult<{ rows: InboxRow[]; unreadCount: number }>;
type LoadInbox = (input: { locationSlug: string; filter: InboxFilter }) => Promise<InboxResult>;

/** Re-exported for callers and tests that name the stall. */
export { ServerActionStalledError as InboxActionStalledError } from "@/lib/client/settle-server-action";

/**
 * The inbox server action, bounded (see settleServerAction for why a call can
 * hang). Never rejects or hangs: after a retry it falls back to the
 * "unavailable" refusal so the shell shows its retry state.
 */
export async function safeLoadInbox(
  load: LoadInbox,
  input: { locationSlug: string; filter: InboxFilter },
  retryDelayMs = 2000,
  settleBudgetMs = 4000,
): Promise<InboxResult> {
  try {
    return await settleServerAction(() => load(input), {
      label: "messagingTalentLoadInbox",
      area: "talent-inbox",
      budgetMs: settleBudgetMs,
      retryDelayMs,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
