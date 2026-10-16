import "server-only";

/**
 * talent-post-context.ts — who is the talent writing as, and may they publish.
 *
 * One resolver for the talent Posts pages and list action. Same rules as
 * `posts-writer-actions.ts` `talentCtx`: the owner scope comes from the
 * session (`resolvePostScope`), the gate is `talentPosts` (Web Office) read
 * from the talent's own plan, never from client input.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { canPublishPosts } from "@/lib/access/posts-capability";
import { resolvePostScope } from "@/lib/cms/posts-scope";
import type { PostScope } from "@/lib/cms/posts-writer";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadOwnedBusinessWorkspace } from "@/lib/talent-site/server/workspace-site-context";

export type TalentPostContext =
  | {
      ok: true;
      supabase: SupabaseClient;
      scope: PostScope;
      talentProfileId: string;
      canPublish: boolean;
      planKey: string;
    }
  | { ok: false; error: string };

export async function resolveTalentPostContext(): Promise<TalentPostContext> {
  const self = await requireTalentSelf();
  if (!self.ok) return { ok: false, error: self.error };
  const admin = createServiceRoleClient();
  const scope = await resolvePostScope(
    { userId: self.session.user.id, talentProfileId: self.talentProfile.id },
    {
      loadOwnedBusinessWorkspace: (userId) =>
        admin
          ? loadOwnedBusinessWorkspace(admin, userId)
          : Promise.resolve({ ownsBusinessWorkspace: false, tenantId: null }),
    },
  );
  return {
    ok: true,
    supabase: self.session.supabase,
    scope,
    talentProfileId: self.talentProfile.id,
    canPublish: canPublishPosts(self.planKey),
    planKey: self.planKey,
  };
}
