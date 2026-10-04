"use server";

/** Save as new design: platform-admin gated server action (TALENT designs only). */
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createDesignFromDraft } from "@/lib/talent-site/theme-template/new-design.server";

import { evaluateFactoryGate, guardedFactoryRun, type FactoryResult } from "./talent-factory-gate";

export async function actionSaveAsNewDesign(input: {
  sourceDesign: string;
  nameEn: string;
  nameEs: string;
}): Promise<FactoryResult<{ slug: string; href: string }>> {
  const session = await getCachedActorSession();
  const gate = evaluateFactoryGate({ user: session.user, profile: session.profile });
  return guardedFactoryRun(gate, async (userId) => {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    try {
      const res = await createDesignFromDraft(admin, {
        sourceDesign: String(input.sourceDesign ?? "").slice(0, 64),
        name: { en: String(input.nameEn ?? ""), es: String(input.nameEs ?? "") },
        actorId: userId,
      });
      return res.ok ? { ok: true, data: { slug: res.slug, href: res.href } } : { ok: false, error: res.error };
    } catch (err) {
      logServerError("newDesign.action", err);
      return { ok: false, error: err instanceof Error ? err.message : "Could not create the design." };
    }
  });
}
