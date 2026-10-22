/**
 * TUL-1368 · Approving a join application puts the workspace's terms in front of the talent.
 *
 * The terms card (TUL-1368) reads a PENDING workspace_talent_terms version. Invite, direct add
 * and Discover-join approval send one (TUL-1476); approving an APPLICATION did not, so the
 * talent joined with nothing to accept and the card never appeared. This sends the workspace's
 * default terms for its model, once per join:
 *   - only when the approve actually put the talent on the roster (new row, reactivated
 *     removed/archived row, or a repair that wrote the row), never when they were already active;
 *   - not again while a pending version already waits for the talent (double click, repair);
 *   - only for an owner or admin (the RPC enforces it too); a manager's approve still succeeds.
 * Joining never fails because of terms. Pure of Next and of the real client: deps are injected.
 */
import {
  joinTermsInputFor,
  type JoinTermsInput,
  type JoinTermsOutcome,
} from "@/lib/service-hub/join-terms";
import type { WorkModel } from "@/lib/service-hub/terms";

export type ProposeAfterApproveDeps = {
  /** True when a pending terms version already waits for this talent in this workspace. */
  hasPendingTerms: (tenantId: string, talentProfileId: string) => Promise<boolean>;
  loadContext: (tenantId: string, userId: string) => Promise<{ defaultModel: WorkModel; canPropose: boolean; workspaceCurrency: string | null }>;
  propose: (args: { tenantId: string; talentProfileId: string; input: JoinTermsInput; defaultModel: WorkModel }) => Promise<JoinTermsOutcome>;
};

export async function proposeDefaultTermsAfterApprove(
  args: { tenantId: string; talentProfileId: string; userId: string; rosterAdded: boolean },
  deps: ProposeAfterApproveDeps,
): Promise<JoinTermsOutcome> {
  if (!args.rosterAdded) return "skipped";
  try {
    if (await deps.hasPendingTerms(args.tenantId, args.talentProfileId)) return "skipped";
    const ctx = await deps.loadContext(args.tenantId, args.userId);
    if (!ctx.canPropose) return "not_allowed";
    return await deps.propose({
      tenantId: args.tenantId,
      talentProfileId: args.talentProfileId,
      input: joinTermsInputFor(ctx.defaultModel, ctx.workspaceCurrency),
      defaultModel: ctx.defaultModel,
    });
  } catch {
    return "failed";
  }
}
