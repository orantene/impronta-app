/**
 * trial-eligibility-readers.ts (TUL-1280): the two history reads behind the
 * one-trial-per-customer rule, written against minimal client shapes so tests
 * drive them with fakes (no Supabase, no Stripe). Read-only; nothing here
 * writes a row or calls a Stripe mutation.
 */
import type {
  HistoryRead,
  StripeSubscriptionLite,
  SubscriptionHistoryRow,
} from "./trial-eligibility";

/** How many history rows / Stripe subscriptions to look at. One is enough to refuse. */
export const TRIAL_HISTORY_LIMIT = 20;

type DbResult = { data: unknown; error: unknown };
type DbFilter = PromiseLike<DbResult> & {
  eq: (col: string, v: string) => DbFilter;
  or: (filter: string) => DbFilter;
  limit: (n: number) => DbFilter;
};
export type HistoryDb = { from: (table: string) => { select: (cols: string) => DbFilter } };

export type HistoryStripe = {
  subscriptions: {
    list: (params: { customer: string; status: "all"; limit: number }) => Promise<{
      data: StripeSubscriptionLite[];
    }>;
  };
};

const COLS = "status, trial_end";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function toRead(q: PromiseLike<DbResult>): Promise<HistoryRead<SubscriptionHistoryRow>> {
  const { data, error } = await q;
  if (error) return { data: null, error };
  return { data: (data as SubscriptionHistoryRow[] | null) ?? [], error: null };
}

/**
 * Talent rows for this profile OR this user (the Stripe customer is per user,
 * so a second profile of the same person does not earn a second trial).
 * Ids come from the session-scoped caller; anything not a uuid is refused as a
 * read error (fail closed) rather than spliced into the filter.
 */
export function readTalentSubscriptionHistory(
  db: HistoryDb,
  ids: { talentProfileId: string; userId: string },
): Promise<HistoryRead<SubscriptionHistoryRow>> {
  if (!UUID.test(ids.talentProfileId) || !UUID.test(ids.userId)) {
    return Promise.resolve({ data: null, error: new Error("trial history: non-uuid subject id") });
  }
  return toRead(
    db
      .from("talent_subscriptions")
      .select(COLS)
      .or(`talent_profile_id.eq.${ids.talentProfileId},user_id.eq.${ids.userId}`)
      .limit(TRIAL_HISTORY_LIMIT),
  );
}

/** Workspace rows for this tenant. */
export function readWorkspaceSubscriptionHistory(
  db: HistoryDb,
  tenantId: string,
): Promise<HistoryRead<SubscriptionHistoryRow>> {
  return toRead(
    db.from("workspace_subscriptions").select(COLS).eq("tenant_id", tenantId).limit(TRIAL_HISTORY_LIMIT),
  );
}

/** Every subscription the Stripe customer ever had (status "all"). */
export async function readStripeSubscriptionHistory(
  stripe: HistoryStripe,
  customerId: string,
): Promise<HistoryRead<StripeSubscriptionLite>> {
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: TRIAL_HISTORY_LIMIT,
  });
  return { data: list.data, error: null };
}
