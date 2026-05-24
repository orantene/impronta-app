"use server";

/**
 * Platform-admin user management server actions.
 *
 * These run with the service-role client and are gated on super_admin.
 * Currently covers:
 *  - Email confirmation (useful for localhost QA and prod support).
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requirePlatformAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };
  const role = getPlatformRole(session.profile);
  if (role !== "super_admin") return { ok: false, error: "Forbidden." };
  return { ok: true, userId: session.user.id };
}

/**
 * Force-confirm a user's email address.
 *
 * Useful on localhost (email delivery disabled) and for prod support cases
 * where a user never received the confirmation link. The service-role client
 * has access to `auth.admin.updateUserById`.
 */
export async function confirmPlatformUserEmail(
  userId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });

  if (error) {
    logServerError("platform/confirmUserEmail", error);
    return { ok: false, error: error.message ?? "Failed to confirm email." };
  }

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

export type UserActivitySnapshot = {
  inquiryCount: number;
  bookingCount: number;
  lastFiveInquiries: Array<{
    id: string;
    title: string | null;
    status: string | null;
    createdAt: string;
    workspaceName: string | null;
  }>;
};

/**
 * Get activity snapshot for a platform user: inquiry/booking counts and recent inquiries.
 *
 * For `human`: queries inquiries where client_user_id matches the user.
 * For `unclaimed_talent`: returns empty (unclaimed talent profiles don't appear as inquiry clients).
 *
 * Returns null only on auth failure; returns zero snapshot on DB errors.
 */
export async function getPlatformUserActivity(
  targetId: string,
  targetKind: "human" | "unclaimed_talent",
): Promise<UserActivitySnapshot | null> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return null;

  if (!targetId?.trim()) return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };

  // Unclaimed talent profiles don't create inquiries as clients.
  if (targetKind === "unclaimed_talent") {
    return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };

  try {
    // Fetch inquiry count and last 5 inquiries for this client
    const { data: inquiries, error: inquiryError } = await admin
      .from("inquiries")
      .select(
        "id, contact_name, status, created_at, tenant_id",
        { count: "exact" },
      )
      .eq("client_user_id", targetId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (inquiryError) {
      logServerError("platform/getPlatformUserActivity.inquiries", inquiryError);
      return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };
    }

    const inquiryCount = inquiries?.length ?? 0;

    // Fetch booking count
    let bookingCount = 0;
    if (inquiryCount > 0 && inquiries) {
      const inquiryIds = inquiries.map((i) => i.id);
      const { count, error: bookingCountError } = await admin
        .from("agency_bookings")
        .select("id", { count: "exact", head: true })
        .in("inquiry_id", inquiryIds);

      if (bookingCountError) {
        logServerError("platform/getPlatformUserActivity.bookings", bookingCountError);
      } else {
        bookingCount = count ?? 0;
      }
    }

    // Fetch workspace names for the inquiries
    const workspaceLookup: Record<string, string> = {};
    if (inquiryCount > 0 && inquiries) {
      const tenantIds = [...new Set(inquiries.map((i) => i.tenant_id).filter(Boolean))];
      if (tenantIds.length > 0) {
        const { data: tenants, error: tenantError } = await admin
          .from("tenants")
          .select("id, display_name")
          .in("id", tenantIds);

        if (!tenantError && tenants) {
          tenants.forEach((t: { id: string; display_name: string }) => {
            workspaceLookup[t.id] = t.display_name;
          });
        }
      }
    }

    const lastFiveInquiries = (inquiries ?? []).map((inq: { id: string; contact_name: string; status: string; created_at: string; tenant_id: string }) => ({
      id: inq.id,
      title: inq.contact_name || null,
      status: inq.status,
      createdAt: inq.created_at,
      workspaceName: inq.tenant_id ? (workspaceLookup[inq.tenant_id] ?? null) : null,
    }));

    return {
      inquiryCount,
      bookingCount,
      lastFiveInquiries,
    };
  } catch (err) {
    logServerError("platform/getPlatformUserActivity", err);
    return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };
  }
}
