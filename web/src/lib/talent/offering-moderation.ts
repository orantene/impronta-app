/**
 * TUL-1713: the platform-admin moderation action for services, as a pure decision with injected I/O.
 *
 * Nothing in the app wrote `talent_offerings.moderation_state` before this (TUL-1633 made it fully
 * server-owned, so only direct DB access moved it). The state is the platform's, not the workspace's
 * or the talent's: a workspace cannot approve what the platform rejected. Role scope (PM decision):
 * editor = content, manager = deals + money + curation, admin = config + moderation, owner =
 * domains / billing / payouts. "Moderation" here is the PLATFORM admin's call (super_admin), the
 * level above every workspace role, so a workspace owner cannot self-approve.
 *
 *   set:   state "rejected" or "pending" (pulled from every sell surface by the one sellable rule).
 *   clear: state "approved" (back on sale). Both need a reason; both write an audit row.
 *
 * The caller (a "use server" file) checks the platform role and wires the real deps; this module
 * does no auth of its own and imports nothing server-only, so it is tested with fakes.
 */

export type ModerationState = "pending" | "approved" | "rejected";

export const MODERATION_STATES: readonly ModerationState[] = ["pending", "approved", "rejected"];

export const MODERATION_REASON_MIN = 3;
export const MODERATION_REASON_MAX = 500;

export type StoredOffering = {
  id: string;
  title: string | null;
  tenant_id: string | null;
  talent_profile_id: string | null;
  owner_kind: string | null;
  moderation_state: string | null;
};

export type ModerationAuditEntry = {
  actorId: string;
  action: "platform.offering.moderation.set" | "platform.offering.moderation.clear";
  tenantId: string | null;
  offeringId: string;
  before: ModerationState | null;
  after: ModerationState;
  reason: string;
};

export type ModerationDeps = {
  /** The row, `null` when it does not exist, `"error"` when the read failed. */
  loadOffering: (offeringId: string) => Promise<StoredOffering | null | "error">;
  /** Writes the new state; false when the write failed or touched no row. */
  writeState: (offeringId: string, state: ModerationState) => Promise<boolean>;
  /** Appends the audit row; false when it could not be written. */
  audit: (entry: ModerationAuditEntry) => Promise<boolean>;
  /** After a stored change: refresh the public surfaces that show this item. */
  afterChange: (offering: StoredOffering) => void;
};

export type ModerationInput = { offeringId: unknown; state: unknown; reason: unknown };

export type ModerationResult =
  | { ok: true; changed: boolean; state: ModerationState; audited: boolean }
  | { ok: false; error: string };

function asState(v: unknown): ModerationState | null {
  return typeof v === "string" && (MODERATION_STATES as readonly string[]).includes(v) ? (v as ModerationState) : null;
}

export async function setOfferingModeration(
  deps: ModerationDeps,
  actorId: string,
  input: ModerationInput,
): Promise<ModerationResult> {
  const offeringId = typeof input.offeringId === "string" ? input.offeringId.trim() : "";
  if (!offeringId) return { ok: false, error: "Missing service." };
  const state = asState(input.state);
  if (!state) return { ok: false, error: "Unknown moderation state." };
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < MODERATION_REASON_MIN) return { ok: false, error: "Give a reason for the change." };
  if (reason.length > MODERATION_REASON_MAX) return { ok: false, error: `Keep the reason under ${MODERATION_REASON_MAX} characters.` };

  const stored = await deps.loadOffering(offeringId);
  if (stored === "error") return { ok: false, error: "Failed to save." };
  if (!stored) return { ok: false, error: "That service was not found." };

  const before = asState(stored.moderation_state);
  if (before === state) return { ok: true, changed: false, state, audited: false };

  if (!(await deps.writeState(offeringId, state))) return { ok: false, error: "Failed to save." };

  const audited = await deps.audit({
    actorId,
    action: state === "approved" ? "platform.offering.moderation.clear" : "platform.offering.moderation.set",
    tenantId: stored.tenant_id,
    offeringId,
    before,
    after: state,
    reason,
  });
  deps.afterChange(stored);
  return { ok: true, changed: true, state, audited };
}
