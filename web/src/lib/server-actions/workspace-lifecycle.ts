"use server";

/**
 * Workspace lifecycle server actions.
 *
 * Implements the two safe, bounded actions from
 * `web/docs/workspace-lifecycle-design-2026-05-21.md`:
 *
 *   1. `leaveWorkspace(tenantId)`         — non-owner self-removal
 *   2. `archiveOwnedWorkspace(tenantId, confirmSlug)`
 *                                          — owner-only soft archive
 *                                            (sets agencies.status='archived')
 *
 * Owner-lockout invariant (§2 of the design doc): every workspace must
 * always have exactly one active owner. Therefore an owner CANNOT use
 * `leaveWorkspace` — they must archive (or, in a future workstream,
 * transfer ownership) first.
 *
 * Auth model: a talent who created their own workspace keeps `app_role`
 * = 'talent' (the hybrid identity preserves talent identity), so the
 * generic `requireStaff` guard rejects them even when they ARE the owner.
 * This module checks `agency_memberships.role` directly for the target
 * tenant + caller — workspace-scoped authority, not global role.
 *
 * Both actions return `ServerActionResult`. The caller (a client component)
 * is expected to `router.replace("/talent")` on success so the user lands
 * on a surface they still have access to.
 */

import { revalidatePath } from "next/cache";

import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import type { ServerActionResult } from "./result";

// ─── 1. Leave workspace (non-owner self-removal) ─────────────────────────────

export async function leaveWorkspace(
  tenantId: string,
): Promise<ServerActionResult> {
  try {
    if (!tenantId || typeof tenantId !== "string") {
      return {
        ok: false,
        error: "Missing workspace.",
        reason: "validation",
      };
    }

    const session = await getCachedActorSession();
    if (!session?.user) {
      return {
        ok: false,
        error: "You must be signed in.",
        reason: "unauthenticated",
      };
    }
    const user = session.user;

    const admin = createServiceRoleClient();
    if (!admin) {
      return { ok: false, error: "Service unavailable.", reason: "unexpected" };
    }

    // Look up the caller's active membership in this tenant.
    const { data: self, error: selfErr } = await admin
      .from("agency_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (selfErr) {
      logServerError("workspace-lifecycle.leaveWorkspace.lookup", selfErr);
      return { ok: false, error: "Unexpected error.", reason: "unexpected" };
    }

    const role = (self as { role?: string } | null)?.role ?? null;
    if (!role) {
      return {
        ok: false,
        error: "You're not an active member of this workspace.",
        reason: "forbidden",
      };
    }

    // Owner-lockout: owners can't leave — they must archive or transfer first.
    if (role === "owner") {
      return {
        ok: false,
        error:
          "Workspace owners can't leave. Archive the workspace or transfer ownership first.",
        reason: "forbidden",
      };
    }

    const { error: updateErr } = await admin
      .from("agency_memberships")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
        removed_by: user.id,
      })
      .eq("tenant_id", tenantId)
      .eq("profile_id", user.id);

    if (updateErr) {
      logServerError("workspace-lifecycle.leaveWorkspace.update", updateErr);
      return {
        ok: false,
        error: "Couldn't leave the workspace.",
        reason: "unexpected",
      };
    }

    // Clear default coordinator if it pointed to us.
    await admin
      .from("agencies")
      .update({ default_coordinator_user_id: null })
      .eq("id", tenantId)
      .eq("default_coordinator_user_id", user.id);

    scheduleWorkspaceAudit({
      tenantId,
      category: "team",
      action: "team.member.left",
      summary: `${user.email ?? "A member"} left the workspace`,
      targetType: "membership",
      targetId: user.id,
      targetLabel: user.email ?? null,
      metadata: { role },
    });

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("workspace-lifecycle.leaveWorkspace", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

// ─── 2. Archive workspace (owner-only soft delete) ───────────────────────────

export async function archiveOwnedWorkspace(
  tenantId: string,
  confirmSlug: string,
): Promise<ServerActionResult> {
  try {
    if (!tenantId || typeof tenantId !== "string") {
      return {
        ok: false,
        error: "Missing workspace.",
        reason: "validation",
      };
    }

    const session = await getCachedActorSession();
    if (!session?.user) {
      return {
        ok: false,
        error: "You must be signed in.",
        reason: "unauthenticated",
      };
    }
    const user = session.user;

    const admin = createServiceRoleClient();
    if (!admin) {
      return { ok: false, error: "Service unavailable.", reason: "unexpected" };
    }

    // Resolve workspace + owner check in a single read.
    const { data: tenantRow, error: tenantErr } = await admin
      .from("agencies")
      .select("id, slug, status")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantErr) {
      logServerError("workspace-lifecycle.archive.tenantLookup", tenantErr);
      return { ok: false, error: "Unexpected error.", reason: "unexpected" };
    }

    const tenant = tenantRow as {
      id: string;
      slug: string;
      status: string;
    } | null;
    if (!tenant) {
      return {
        ok: false,
        error: "Workspace not found.",
        reason: "not_found",
      };
    }

    // Typed-confirmation gate — protects against accidental archives.
    if ((confirmSlug ?? "").trim().toLowerCase() !== tenant.slug.toLowerCase()) {
      return {
        ok: false,
        error: `To confirm archiving, type the workspace slug: ${tenant.slug}`,
        reason: "forbidden",
      };
    }

    // Owner-only.
    const { data: self, error: selfErr } = await admin
      .from("agency_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (selfErr) {
      logServerError("workspace-lifecycle.archive.selfLookup", selfErr);
      return { ok: false, error: "Unexpected error.", reason: "unexpected" };
    }

    const role = (self as { role?: string } | null)?.role ?? null;
    if (role !== "owner") {
      return {
        ok: false,
        error: "Only the workspace owner can archive this workspace.",
        reason: "forbidden",
      };
    }

    const { error: updateErr } = await admin
      .from("agencies")
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (updateErr) {
      logServerError(
        "workspace-lifecycle.archive.update",
        updateErr,
      );
      return {
        ok: false,
        error: "Couldn't archive the workspace.",
        reason: "unexpected",
      };
    }

    scheduleWorkspaceAudit({
      tenantId,
      category: "settings",
      action: "workspace.archived",
      summary: "Workspace archived",
      targetType: "workspace",
      targetId: tenantId,
      targetLabel: tenant.slug,
    });

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("workspace-lifecycle.archiveOwnedWorkspace", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}
