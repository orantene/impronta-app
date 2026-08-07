"use server";

import { revalidatePath } from "next/cache";
import {
  addAlternate,
  removeAlternate,
  reorderAlternates,
  promoteAlternate,
} from "@/lib/inquiry/inquiry-engine-alternates";
import type { EngineErr } from "@/lib/inquiry/inquiry-engine.types";
import type { ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR } from "@/lib/server/safe-error";

// Deep-plan W9 — "use server" wrappers for the inquiry waitlist / alternates
// engine. Staff-authorized (requireWorkspaceStaffAction), tenant-scoped, and they
// revalidate the admin work path. NO type exports from this module (Turbopack
// strips type exports from "use server" files → prod build failure); shared
// types live in @/lib/inquiry/alternates-types.

function mapAlternateEngineFailure(res: EngineErr): ActionResult {
  if (res.forbidden) {
    return { ok: false, code: "permission_denied", message: "You cannot change this waitlist." };
  }
  if (res.conflict) {
    return { ok: false, code: "version_conflict", message: "This inquiry was updated. Refresh and try again." };
  }
  if (res.rateLimited) {
    return { ok: false, code: "timeout", message: "Too many attempts. Try again shortly." };
  }
  if (res.reason === "post_booking_immutable") {
    return { ok: false, code: "locked_status", message: "This inquiry no longer allows roster edits." };
  }
  if (res.error === "already_on_waitlist") {
    return { ok: false, code: "precondition_failed", message: "That talent is already on the waitlist." };
  }
  if (res.error === "talent_already_active") {
    return { ok: false, code: "precondition_failed", message: "That talent is already booked on this inquiry." };
  }
  if (res.error === "talent_already_invited") {
    return { ok: false, code: "precondition_failed", message: "That talent is already invited to this inquiry." };
  }
  const msg = res.error ?? CLIENT_ERROR.update;
  return { ok: false, code: "precondition_failed", message: msg };
}

export async function addAlternateAction(formData: FormData): Promise<ActionResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const talentProfileId = String(formData.get("talent_profile_id") ?? "").trim();
  const requirementGroupIdRaw = String(formData.get("requirement_group_id") ?? "").trim();
  const noteRaw = String(formData.get("note") ?? "").trim();

  if (!inquiryId || !talentProfileId) {
    return { ok: false, code: "validation_error", message: "Missing fields." };
  }

  const res = await addAlternate(supabase, {
    inquiryId,
    tenantId,
    talentProfileId,
    requirementGroupId: requirementGroupIdRaw || null,
    note: noteRaw || null,
    actorUserId: user.id,
  });

  if (!res.success) {
    return mapAlternateEngineFailure(res);
  }

  revalidatePath(`/admin/work/${inquiryId}`);
  return { ok: true, message: "Added to the waitlist." };
}

export async function removeAlternateAction(formData: FormData): Promise<ActionResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const alternateId = String(formData.get("alternate_id") ?? "").trim();
  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();

  if (!alternateId) {
    return { ok: false, code: "validation_error", message: "Missing alternate." };
  }

  const res = await removeAlternate(supabase, {
    alternateId,
    tenantId,
    actorUserId: user.id,
  });

  if (!res.success) {
    return mapAlternateEngineFailure(res);
  }

  if (inquiryId) revalidatePath(`/admin/work/${inquiryId}`);
  return { ok: true, message: "Removed from the waitlist." };
}

export async function reorderAlternatesAction(formData: FormData): Promise<ActionResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  // Ordered ids arrive as a JSON array string or comma-separated list.
  const orderedRaw = String(formData.get("ordered_alternate_ids") ?? "").trim();

  if (!inquiryId || !orderedRaw) {
    return { ok: false, code: "validation_error", message: "Missing ordering." };
  }

  let orderedAlternateIds: string[] = [];
  try {
    const parsed = JSON.parse(orderedRaw);
    if (Array.isArray(parsed)) {
      orderedAlternateIds = parsed.map((x) => String(x)).filter(Boolean);
    }
  } catch {
    orderedAlternateIds = orderedRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  if (orderedAlternateIds.length === 0) {
    return { ok: false, code: "validation_error", message: "Missing ordering." };
  }

  const res = await reorderAlternates(supabase, {
    inquiryId,
    tenantId,
    orderedAlternateIds,
    actorUserId: user.id,
  });

  if (!res.success) {
    return mapAlternateEngineFailure(res);
  }

  revalidatePath(`/admin/work/${inquiryId}`);
  return { ok: true, message: "Waitlist order updated." };
}

export async function promoteAlternateAction(formData: FormData): Promise<ActionResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    return { ok: false, code: "permission_denied", message: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  const inquiryId = String(formData.get("inquiry_id") ?? "").trim();
  const alternateId = String(formData.get("alternate_id") ?? "").trim();
  // The optimistic-lock version may be supplied by the client; otherwise resolve
  // the current inquiry version server-side.
  const expectedVersionRaw = String(formData.get("expected_version") ?? "").trim();

  if (!inquiryId || !alternateId) {
    return { ok: false, code: "validation_error", message: "Missing fields." };
  }

  let expectedVersion = Number(expectedVersionRaw);
  if (!Number.isFinite(expectedVersion) || expectedVersion <= 0) {
    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    expectedVersion = (inq?.version as number | undefined) ?? 1;
  }

  const res = await promoteAlternate(supabase, {
    inquiryId,
    tenantId,
    alternateId,
    actorUserId: user.id,
    expectedVersion,
  });

  if (!res.success) {
    return mapAlternateEngineFailure(res);
  }

  revalidatePath(`/admin/work/${inquiryId}`);
  return { ok: true, message: "Alternate promoted to the lineup." };
}
