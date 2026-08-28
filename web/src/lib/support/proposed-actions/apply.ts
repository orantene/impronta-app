import "server-only";

import { auditEvent } from "@/lib/audit/emit";
import { logPlatformAdminAction } from "@/lib/platform/audit";
import { logServerError } from "@/lib/server/safe-error";
import { syncBrandSettingsToTheme } from "@/lib/site-admin/server/brand-library";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { supportFrom } from "../support-from";
import { isSettingsPatchKey, setDotted, type ProposedActionKind } from "./kinds";

const HEX = /^#[0-9a-fA-F]{6}$/u;

type ApplyResult = { ok: true; status: "applied" | "failed"; result: Record<string, unknown> };

async function mark(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  id: string,
  status: "applied" | "failed",
  result: Record<string, unknown>,
): Promise<void> {
  await supportFrom(admin, "support_proposed_actions")
    .update({
      status,
      applied_at: new Date().toISOString(),
      applied_result: result,
    })
    .eq("id", id)
    .eq("status", "approved");
}

export async function applyApprovedAction(input: {
  actionId: string;
  approvedBy: string;
  ticketId: string;
  tenantId: string | null;
}): Promise<ApplyResult> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: true, status: "failed", result: { error: "Not configured." } };

  const { data: row } = await supportFrom(admin, "support_proposed_actions")
    .select("id, kind, title, payload, status, ticket_id, tenant_id, proposed_by")
    .eq("id", input.actionId)
    .maybeSingle();
  if (!row || row.status !== "approved") {
    return { ok: true, status: "failed", result: { error: "Action is not approved." } };
  }

  const kind = row.kind as ProposedActionKind;
  let result: Record<string, unknown> = {};
  let status: "applied" | "failed" = "applied";

  try {
    if (kind === "instruction") {
      result = { acknowledged: true };
    } else if (kind === "builder_draft_revision") {
      status = "failed";
      result = { error: "Builder draft revisions are not yet supported." };
    } else if (kind === "settings_patch") {
      const tenantId = typeof row.tenant_id === "string" ? row.tenant_id : input.tenantId;
      if (!tenantId) {
        status = "failed";
        result = { error: "This ticket has no workspace to patch." };
      } else {
        const payload =
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {};
        const { data: agency, error: readErr } = await admin
          .from("agencies")
          .select("settings")
          .eq("id", tenantId)
          .maybeSingle();
        if (readErr) throw readErr;
        const settings: Record<string, unknown> =
          agency?.settings && typeof agency.settings === "object" && !Array.isArray(agency.settings)
            ? { ...(agency.settings as Record<string, unknown>) }
            : {};
        const brandingPatch: {
          logo_url?: string | null;
          favicon_url?: string | null;
          primary_color?: string;
          accent_color?: string;
        } = {};
        for (const [key, value] of Object.entries(payload)) {
          if (!isSettingsPatchKey(key)) continue;
          if (key.endsWith("_color") && typeof value === "string" && !HEX.test(value)) {
            throw new Error(`Invalid color for ${key}`);
          }
          setDotted(settings, key, value);
          if (key === "branding.logo_url" && (typeof value === "string" || value === null)) {
            brandingPatch.logo_url = value;
          }
          if (key === "branding.favicon_url" && (typeof value === "string" || value === null)) {
            brandingPatch.favicon_url = value;
          }
          if (key === "branding.primary_color" && typeof value === "string") {
            brandingPatch.primary_color = value;
          }
          if (key === "branding.accent_color" && typeof value === "string") {
            brandingPatch.accent_color = value;
          }
        }
        const { error: writeErr } = await admin
          .from("agencies")
          .update({ settings, updated_at: new Date().toISOString() })
          .eq("id", tenantId);
        if (writeErr) throw writeErr;
        await syncBrandSettingsToTheme(admin, tenantId, brandingPatch);
        result = { patched: Object.keys(payload), tenantId };
      }
    } else {
      status = "failed";
      result = { error: "Unknown action kind." };
    }
  } catch (err) {
    logServerError("support.proposed.apply", err);
    status = "failed";
    result = { error: err instanceof Error ? err.message : "Apply failed." };
  }

  await mark(admin, input.actionId, status, result);

  await logPlatformAdminAction({
    actorUserId: input.approvedBy,
    targetKind: "workspace",
    targetId: input.tenantId ?? input.ticketId,
    action: "support.proposed_action.applied",
    supportMode: "assisted_edit",
    after: result,
    context: {
      proposed_action_id: input.actionId,
      ticket_id: input.ticketId,
      approved_by: input.approvedBy,
      status,
      support_mode: "assisted_edit",
    },
  });

  if (input.tenantId) {
    auditEvent(
      input.tenantId,
      kind === "settings_patch" ? "settings" : kind === "builder_draft_revision" ? "pages" : "messages",
      "support.proposed_action.applied",
      `Support applied a change: ${typeof row.title === "string" ? row.title : "proposed fix"}`,
      {
        actorKind: "platform",
        actorUserId: input.approvedBy,
        targetType: "agency",
        targetId: input.tenantId,
        metadata: { proposed_action_id: input.actionId, ticket_id: input.ticketId, status },
      },
    );
  }

  return { ok: true, status, result };
}
