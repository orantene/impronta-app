/**
 * trial-eligibility-readers.ts (TUL-1280): the history reads behind the
 * one-trial-per-USER rule, written against minimal client shapes so tests
 * drive them with fakes (no Supabase, no Stripe). Read-only; nothing here
 * writes a row or calls a Stripe mutation.
 *
 * Product rule (consultant, PM ratifies): one trial per user across talent AND
 * workspaces. A person who trialed as a talent, or in any workspace they own
 * or belong to, gets no new trial by signing up another workspace or profile.
 */
import type {
  HistoryRead,
  StripeSubscriptionLite,
  SubscriptionHistoryRow,
} from "./trial-eligibility";

/** How many history rows / Stripe subscriptions to look at. One is enough to refuse. */
export const TRIAL_HISTORY_LIMIT = 20;

/** Membership statuses that mean the person actually joined the workspace. */
export const JOINED_MEMBERSHIP_STATUSES = ["active", "pending_acceptance", "suspended", "removed"];

type DbResult = { data: unknown; error: unknown };
type DbFilter = PromiseLike<DbResult> & {
  eq: (col: string, v: string) => DbFilter;
  in: (col: string, v: readonly string[]) => DbFilter;
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

export type TrialHistorySubject =
  | { kind: "talent"; talentProfileId: string; userId: string }
  /** buyerUserId missing: per-workspace history only (the caller logs it). */
  | { kind: "workspace"; tenantId: string; buyerUserId?: string | null }
  /** A signed-in person with no checkout subject yet (trial doors, plan cards). */
  | { kind: "user"; userId: string };

type Read = HistoryRead<SubscriptionHistoryRow>;

const COLS = "status, trial_end";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badId = (): Read => ({ data: null, error: new Error("trial history: non-uuid subject id") });

async function toRead(q: PromiseLike<DbResult>): Promise<Read> {
  const { data, error } = await q;
  if (error) return { data: null, error };
  return { data: (data as SubscriptionHistoryRow[] | null) ?? [], error: null };
}

/** Any error wins (fail closed); otherwise every source's rows together. */
export function mergeHistoryReads(reads: Read[]): Read {
  const failed = reads.find((r) => r.error);
  if (failed) return { data: null, error: failed.error };
  return { data: reads.flatMap((r) => r.data ?? []), error: null };
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
): Promise<Read> {
  if (!UUID.test(ids.talentProfileId) || !UUID.test(ids.userId)) return Promise.resolve(badId());
  return toRead(
    db
      .from("talent_subscriptions")
      .select(COLS)
      .or(`talent_profile_id.eq.${ids.talentProfileId},user_id.eq.${ids.userId}`)
      .limit(TRIAL_HISTORY_LIMIT),
  );
}

/** Workspace rows for this tenant. */
export function readWorkspaceSubscriptionHistory(db: HistoryDb, tenantId: string): Promise<Read> {
  return toRead(
    db.from("workspace_subscriptions").select(COLS).eq("tenant_id", tenantId).limit(TRIAL_HISTORY_LIMIT),
  );
}

/** Workspace rows of every workspace this user owns or joined (agency_memberships.profile_id = auth user id). */
export async function readUserWorkspaceHistory(db: HistoryDb, userId: string): Promise<Read> {
  const { data, error } = await db
    .from("agency_memberships")
    .select("tenant_id")
    .eq("profile_id", userId)
    .in("status", JOINED_MEMBERSHIP_STATUSES)
    .limit(100);
  if (error) return { data: null, error };
  const tenantIds = [
    ...new Set(((data as { tenant_id?: string | null }[] | null) ?? []).flatMap((m) => (m.tenant_id ? [m.tenant_id] : []))),
  ];
  if (tenantIds.length === 0) return { data: [], error: null };
  return toRead(
    db.from("workspace_subscriptions").select(COLS).in("tenant_id", tenantIds).limit(TRIAL_HISTORY_LIMIT),
  );
}

/** Talent rows of this user (any profile). */
function readUserTalentHistory(db: HistoryDb, userId: string): Promise<Read> {
  return toRead(db.from("talent_subscriptions").select(COLS).eq("user_id", userId).limit(TRIAL_HISTORY_LIMIT));
}

/** Everything the one-trial-per-user rule looks at for this subject. */
export async function readSubjectHistory(db: HistoryDb, subject: TrialHistorySubject): Promise<Read> {
  if (subject.kind === "talent") {
    return mergeHistoryReads(
      await Promise.all([
        readTalentSubscriptionHistory(db, subject),
        UUID.test(subject.userId) ? readUserWorkspaceHistory(db, subject.userId) : badId(),
      ]),
    );
  }
  if (subject.kind === "user") {
    if (!UUID.test(subject.userId)) return badId();
    return mergeHistoryReads(
      await Promise.all([readUserTalentHistory(db, subject.userId), readUserWorkspaceHistory(db, subject.userId)]),
    );
  }
  const buyer = subject.buyerUserId;
  if (!buyer) return readWorkspaceSubscriptionHistory(db, subject.tenantId);
  if (!UUID.test(buyer)) return badId();
  return mergeHistoryReads(
    await Promise.all([
      readWorkspaceSubscriptionHistory(db, subject.tenantId),
      readUserTalentHistory(db, buyer),
      readUserWorkspaceHistory(db, buyer),
    ]),
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
