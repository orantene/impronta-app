import "server-only";

/**
 * TUL-1713: the real dependencies for `setOfferingModeration` (service role). Server-only; the
 * "use server" action wires these after it has checked the platform role.
 */
import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { bustTalentSiteCache } from "@/lib/talent-site/cache-tags";
import type { ModerationDeps, ModerationState, StoredOffering } from "@/lib/talent/offering-moderation";

export function realModerationDeps(): ModerationDeps | null {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  return {
    loadOffering: async (offeringId) => {
      const { data, error } = await admin
        .from("talent_offerings")
        .select("id, title, tenant_id, talent_profile_id, owner_kind, moderation_state")
        .eq("id", offeringId)
        .maybeSingle();
      if (error) {
        logServerError("platform.offeringModeration.load", error);
        return "error";
      }
      return (data as StoredOffering | null) ?? null;
    },
    writeState: async (offeringId, state: ModerationState) => {
      const { data, error } = await admin
        .from("talent_offerings")
        .update({ moderation_state: state, updated_at: new Date().toISOString() })
        .eq("id", offeringId)
        .select("id")
        .maybeSingle();
      if (error) {
        logServerError("platform.offeringModeration.write", error);
        return false;
      }
      return Boolean(data);
    },
    audit: async (entry) => {
      const { error } = await admin.from("platform_audit_log").insert({
        actor_profile_id: entry.actorId,
        actor_role: "super_admin",
        action: entry.action,
        target_type: "talent_offerings",
        target_id: entry.offeringId,
        tenant_id: entry.tenantId,
        severity: "warn",
        metadata: { before: entry.before, after: entry.after, reason: entry.reason },
      });
      if (error) {
        logServerError("platform.offeringModeration.audit", error);
        return false;
      }
      return true;
    },
    afterChange: (offering) => {
      try {
        revalidatePath("/");
        if (offering.talent_profile_id) bustTalentSiteCache(offering.talent_profile_id, null);
      } catch (err) {
        logServerError("platform.offeringModeration.afterChange", err);
      }
    },
  };
}
