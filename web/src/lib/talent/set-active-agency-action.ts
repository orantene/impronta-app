"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { ACTIVE_TALENT_TENANT_COOKIE } from "@/lib/talent/active-agency-context";
import { requirePlatformTalentContext } from "@/lib/talent/platform-talent-context";
import { listTalentAgencyContexts } from "@/lib/talent/active-agency-context";

export async function setActiveTalentAgencyAction(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requirePlatformTalentContext();
  const roster = await listTalentAgencyContexts(ctx.talentProfileId);
  if (!roster.some((r) => r.tenantId === tenantId)) {
    return { ok: false, error: "You are not rostered with that agency." };
  }

  const store = await cookies();
  store.set(ACTIVE_TALENT_TENANT_COOKIE, tenantId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/talent", "layout");
  return { ok: true };
}
