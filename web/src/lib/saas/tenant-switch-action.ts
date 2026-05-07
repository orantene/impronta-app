"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  TENANT_COOKIE_NAME,
  getCurrentUserTenants,
} from "@/lib/saas";

/**
 * Switches the active tenant workspace for the current session.
 *
 * Validates the target tenant is in the user's memberships list (platform
 * super_admins see synthetic memberships for every agency, so they can switch
 * anywhere). Writes the tenant id to the `impronta.active_tenant_id` cookie
 * which {@link getTenantScope} reads on subsequent requests.
 *
 * Fail-hard: if the target id doesn't match any membership, the cookie stays
 * unchanged and the user is redirected back to `/admin` so the resolver can
 * re-render with a safe default.
 */
export async function switchActiveTenant(formData: FormData): Promise<void> {
  const targetRaw = formData.get("tenant_id");
  if (typeof targetRaw !== "string" || targetRaw.length === 0) {
    redirect("/admin");
  }
  const target = targetRaw.trim();

  const tenants = await getCurrentUserTenants();
  const match = tenants.find((t) => t.tenant_id === target);
  if (!match) {
    redirect("/admin");
  }

  const cookieStore = await cookies();
  cookieStore.set(TENANT_COOKIE_NAME, target, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // ~90 days — the switcher is an admin convenience, not a security boundary.
    maxAge: 60 * 60 * 24 * 90,
  });

  revalidatePath("/admin", "layout");
  redirect("/admin");
}
