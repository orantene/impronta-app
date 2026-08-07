import {
  listOwnedFreeWorkspaces,
  normalizeWorkspaceTierInterest,
  type OwnedFreeWorkspace,
} from "./owned-free-workspace";
import { workspaceBelongsToSignupLead } from "./workspace-signup";

/**
 * "One Free workspace per owner" resolution for the self-serve provisioner.
 *
 * Split out of `workspace-signup.server.ts` to keep that file under the
 * 800-line lint cap.
 */

/**
 * The Free workspace this lead itself created, if provisioning previously got
 * as far as inserting the agency row but crashed before stamping
 * `saas_marketing_signups.provisioned_tenant_id`.
 *
 * SCOPE IS DELIBERATE. This used to match ANY owned Free workspace, which made
 * the funnel lie: a signed-in owner who reserved "vera-atelier" on /get-started
 * was silently redirected into their unrelated existing workspace, and the
 * reserved slug was never created. Reuse is now keyed on the lead that created
 * the workspace (or, for legacy rows stamped before `signup_lead_id` existed,
 * on the exact slug this lead reserved) so it only ever recovers THIS signup.
 *
 * The tier-interest match from the ghost-cleanup audit is preserved: a Free
 * workspace left over from a crashed PAID signup must not be silently reused
 * for a differently-priced plan.
 */
export async function findLeadOwnedFreeWorkspace(params: {
  userId: string;
  leadId: string;
  desiredSlug: string;
  currentLeadTierInterest: string | null;
}): Promise<{ tenantId: string; slug: string; displayName: string } | null> {
  const owned = await listOwnedFreeWorkspaces(params.userId);
  const currentTier =
    normalizeWorkspaceTierInterest(params.currentLeadTierInterest) ?? "free";

  for (const workspace of owned) {
    const existingTier = workspace.signupTierInterest ?? "free";
    if (existingTier !== currentTier) continue;

    if (
      !workspaceBelongsToSignupLead({
        workspaceSignupLeadId: workspace.signupLeadId,
        workspaceSlug: workspace.slug,
        leadId: params.leadId,
        desiredSlug: params.desiredSlug,
      })
    ) {
      continue;
    }

    return {
      tenantId: workspace.tenantId,
      slug: workspace.slug,
      displayName: workspace.displayName,
    };
  }

  return null;
}

/**
 * The unrelated Free workspace that blocks creating a second one, or null when
 * the signup may proceed. Paid tiers are never blocked: an owner may run a paid
 * workspace alongside their free one.
 */
export async function findFreeWorkspaceLimitBlocker(params: {
  userId: string;
  currentLeadTierInterest: string | null;
}): Promise<OwnedFreeWorkspace | null> {
  const currentTier =
    normalizeWorkspaceTierInterest(params.currentLeadTierInterest) ?? "free";
  if (currentTier !== "free") return null;
  const owned = await listOwnedFreeWorkspaces(params.userId);
  return owned[0] ?? null;
}
