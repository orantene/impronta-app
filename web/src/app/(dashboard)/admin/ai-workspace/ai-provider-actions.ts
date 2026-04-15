"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  effectiveCredentialMode,
  fetchTenantControls,
  getDecryptedSecretForInstance,
  resolveKeyForMode,
  type AiCredentialMode,
  type AiProviderRegistryKind,
} from "@/lib/ai/ai-provider-repository";
import { DEFAULT_AI_TENANT_ID } from "@/lib/ai/ai-tenant-constants";
import {
  encryptSecret,
  isCredentialEncryptionConfigured,
  maskApiKey,
} from "@/lib/ai/credential-vault";
import { parseWithSchema, trimmedString } from "@/lib/admin/validation";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type AiProviderActionState =
  | { error?: string; success?: boolean; message?: string }
  | undefined;

const tenantId = DEFAULT_AI_TENANT_ID;

async function audit(
  actorId: string | undefined,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>,
) {
  const supabase = createServiceRoleClient();
  if (!supabase) return;
  const { error } = await supabase.from("ai_provider_audit").insert({
    tenant_id: tenantId,
    actor_id: actorId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
  if (error) logServerError("ai-provider-audit", error);
}

export async function updateAiTenantControls(
  _prev: AiProviderActionState,
  formData: FormData,
): Promise<AiProviderActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const schema = z.object({
    credential_mode: z.enum(["platform", "agency", "inherit"]),
    monthly_spend_cap_cents: z.string().optional(),
    warn_threshold_percent: z.string().optional(),
    hard_stop_on_cap: z.enum(["true", "false"]).optional(),
    max_requests_per_minute: z.string().optional(),
    max_requests_per_month: z.string().optional(),
    provider_unavailable_behavior: z.enum(["graceful", "strict"]),
  });

  const parsed = parseWithSchema(schema, {
    credential_mode: trimmedString(formData, "credential_mode") as "platform" | "agency" | "inherit",
    monthly_spend_cap_cents: trimmedString(formData, "monthly_spend_cap_cents"),
    warn_threshold_percent: trimmedString(formData, "warn_threshold_percent"),
    hard_stop_on_cap: trimmedString(formData, "hard_stop_on_cap") as "true" | "false" | "",
    max_requests_per_minute: trimmedString(formData, "max_requests_per_minute"),
    max_requests_per_month: trimmedString(formData, "max_requests_per_month"),
    provider_unavailable_behavior: trimmedString(formData, "provider_unavailable_behavior") as
      | "graceful"
      | "strict",
  });
  if ("error" in parsed) return { error: parsed.error };
  const d = parsed.data;

  const capStr = (d.monthly_spend_cap_cents ?? "").trim();
  const warnStr = (d.warn_threshold_percent ?? "").trim();
  const rpmStr = (d.max_requests_per_minute ?? "").trim();
  const rpyStr = (d.max_requests_per_month ?? "").trim();

  const cap = capStr === "" ? null : Number.parseInt(capStr, 10);
  const warn = warnStr === "" ? null : Number.parseInt(warnStr, 10);
  const rpm = rpmStr === "" ? null : Number.parseInt(rpmStr, 10);
  const rpy = rpyStr === "" ? null : Number.parseInt(rpyStr, 10);

  if (cap != null && (Number.isNaN(cap) || cap < 0)) {
    return { error: "Invalid monthly spend cap." };
  }
  if (warn != null && (Number.isNaN(warn) || warn < 0 || warn > 100)) {
    return { error: "Warning threshold must be 0–100." };
  }
  if (rpm != null && (Number.isNaN(rpm) || rpm < 1)) {
    return { error: "Requests per minute must be at least 1." };
  }
  if (rpy != null && (Number.isNaN(rpy) || rpy < 1)) {
    return { error: "Requests per month must be at least 1." };
  }

  const { error } = await auth.supabase
    .from("ai_tenant_controls")
    .upsert(
      {
        tenant_id: tenantId,
        credential_mode: d.credential_mode,
        monthly_spend_cap_cents: cap,
        warn_threshold_percent: warn,
        hard_stop_on_cap: d.hard_stop_on_cap === "false" ? false : true,
        max_requests_per_minute: rpm,
        max_requests_per_month: rpy,
        provider_unavailable_behavior: d.provider_unavailable_behavior,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );

  if (error) {
    logServerError("updateAiTenantControls", error);
    return { error: CLIENT_ERROR.update };
  }

  await audit(auth.user.id, "update_tenant_controls", "ai_tenant_controls", tenantId, {
    credential_mode: d.credential_mode,
  });
  revalidatePath("/admin/ai-workspace/settings");
  return { success: true };
}

const uuidSchema = z.string().uuid();

export async function setDefaultAiProviderInstance(
  _prev: AiProviderActionState,
  formData: FormData,
): Promise<AiProviderActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const id = trimmedString(formData, "instance_id");
  const parsed = parseWithSchema(z.object({ instance_id: uuidSchema }), { instance_id: id });
  if ("error" in parsed) return { error: parsed.error };

  const { error: e1 } = await auth.supabase
    .from("ai_provider_instances")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  if (e1) {
    logServerError("setDefaultAiProvider/clear", e1);
    return { error: CLIENT_ERROR.update };
  }

  const { error: e2 } = await auth.supabase
    .from("ai_provider_instances")
    .update({ is_default: true, disabled: false, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.instance_id)
    .eq("tenant_id", tenantId);
  if (e2) {
    logServerError("setDefaultAiProvider/set", e2);
    return { error: CLIENT_ERROR.update };
  }

  await audit(auth.user.id, "set_default_provider", "ai_provider_instances", parsed.data.instance_id, {});
  revalidatePath("/admin/ai-workspace/settings");
  return { success: true };
}

export async function updateAiProviderInstanceMeta(
  _prev: AiProviderActionState,
  formData: FormData,
): Promise<AiProviderActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const schema = z.object({
    instance_id: uuidSchema,
    label: z.string().max(200),
    credential_source: z.enum(["platform", "agency", "inherit"]),
  });

  const parsed = parseWithSchema(schema, {
    instance_id: trimmedString(formData, "instance_id"),
    label: trimmedString(formData, "label"),
    credential_source: trimmedString(formData, "credential_source") as AiCredentialMode,
  });
  if ("error" in parsed) return { error: parsed.error };

  const disabled = formData.get("disabled") === "true";

  const { error } = await auth.supabase
    .from("ai_provider_instances")
    .update({
      label: parsed.data.label,
      disabled,
      credential_source: parsed.data.credential_source,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.instance_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("updateAiProviderInstanceMeta", error);
    return { error: CLIENT_ERROR.update };
  }

  await audit(auth.user.id, "update_provider_instance", "ai_provider_instances", parsed.data.instance_id, {
    disabled,
  });
  revalidatePath("/admin/ai-workspace/settings");
  return { success: true };
}

export async function addAiProviderInstance(
  _prev: AiProviderActionState,
  formData: FormData,
): Promise<AiProviderActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const schema = z.object({
    kind: z.enum(["none", "openai", "anthropic", "custom"]),
    label: z.string().max(200).optional(),
  });
  const kind = trimmedString(formData, "kind") as AiProviderRegistryKind;
  const parsed = parseWithSchema(schema, {
    kind,
    label: trimmedString(formData, "label"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { data: maxRow } = await auth.supabase
    .from("ai_provider_instances")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const label =
    parsed.data.label?.trim() ||
    (parsed.data.kind === "openai"
      ? "OpenAI"
      : parsed.data.kind === "anthropic"
        ? "Anthropic"
        : parsed.data.kind === "custom"
          ? "Custom"
          : "None");

  const { data: inserted, error } = await auth.supabase
    .from("ai_provider_instances")
    .insert({
      tenant_id: tenantId,
      kind: parsed.data.kind,
      label,
      is_default: false,
      disabled: parsed.data.kind === "custom",
      sort_order: nextOrder,
      credential_source: "inherit",
      credential_ui_state: "unset",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    logServerError("addAiProviderInstance", error);
    return { error: CLIENT_ERROR.update };
  }

  await audit(auth.user.id, "add_provider_instance", "ai_provider_instances", inserted.id as string, {
    kind: parsed.data.kind,
  });
  revalidatePath("/admin/ai-workspace/settings");
  return { success: true };
}

export async function deleteAiProviderInstance(
  _prev: AiProviderActionState,
  formData: FormData,
): Promise<AiProviderActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const id = trimmedString(formData, "instance_id");
  const parsed = parseWithSchema(z.object({ instance_id: uuidSchema }), { instance_id: id });
  if ("error" in parsed) return { error: parsed.error };

  const svc = createServiceRoleClient();
  if (!svc) return { error: "Service not configured." };

  const { data: row } = await auth.supabase
    .from("ai_provider_instances")
    .select("is_default")
    .eq("id", parsed.data.instance_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if ((row as { is_default?: boolean } | null)?.is_default) {
    return { error: "Clear default before deleting the active provider row." };
  }

  await svc.from("ai_provider_secrets").delete().eq("provider_instance_id", parsed.data.instance_id);

  const { error } = await auth.supabase
    .from("ai_provider_instances")
    .delete()
    .eq("id", parsed.data.instance_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("deleteAiProviderInstance", error);
    return { error: CLIENT_ERROR.update };
  }

  await audit(auth.user.id, "delete_provider_instance", "ai_provider_instances", parsed.data.instance_id, {});
  revalidatePath("/admin/ai-workspace/settings");
  return { success: true };
}

export async function saveAiProviderSecret(
  _prev: AiProviderActionState,
  formData: FormData,
): Promise<AiProviderActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  if (!isCredentialEncryptionConfigured()) {
    return {
      error:
        "Server encryption is not configured (set AI_CREDENTIALS_ENCRYPTION_KEY to a base64-encoded 32-byte key).",
    };
  }

  const schema = z.object({
    instance_id: uuidSchema,
    api_key: z.string().min(8).max(4096),
  });
  const parsed = parseWithSchema(schema, {
    instance_id: trimmedString(formData, "instance_id"),
    api_key: formData.get("api_key")?.toString() ?? "",
  });
  if ("error" in parsed) return { error: parsed.error };

  const svc = createServiceRoleClient();
  if (!svc) return { error: "Service not configured." };

  const { data: inst, error: ie } = await svc
    .from("ai_provider_instances")
    .select("id, kind")
    .eq("id", parsed.data.instance_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (ie || !inst) return { error: "Provider not found." };
  const kind = (inst as { kind: AiProviderRegistryKind }).kind;
  if (kind === "none" || kind === "custom") {
    return { error: "Secrets are not stored for this provider type." };
  }

  let cipher: string;
  try {
    cipher = encryptSecret(parsed.data.api_key.trim());
  } catch (e) {
    logServerError("saveAiProviderSecret/encrypt", e);
    return { error: "Encryption failed." };
  }

  const masked = maskApiKey(parsed.data.api_key.trim());

  await svc.from("ai_provider_secrets").delete().eq("provider_instance_id", parsed.data.instance_id);
  const { error: se } = await svc.from("ai_provider_secrets").insert({
    provider_instance_id: parsed.data.instance_id,
    ciphertext: cipher,
    key_version: 1,
    updated_at: new Date().toISOString(),
  });
  if (se) {
    logServerError("saveAiProviderSecret/secret", se);
    return { error: CLIENT_ERROR.update };
  }

  const { error: ue } = await svc
    .from("ai_provider_instances")
    .update({
      credential_masked_hint: masked,
      credential_ui_state: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.instance_id);

  if (ue) {
    logServerError("saveAiProviderSecret/instance", ue);
    return { error: CLIENT_ERROR.update };
  }

  await audit(auth.user.id, "save_provider_secret", "ai_provider_instances", parsed.data.instance_id, {
    kind,
  });
  revalidatePath("/admin/ai-workspace/settings");
  return { success: true, message: "Key saved. Only a masked value is shown from now on." };
}

export async function disableAiProviderSecret(
  _prev: AiProviderActionState,
  formData: FormData,
): Promise<AiProviderActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const parsed = parseWithSchema(z.object({ instance_id: uuidSchema }), {
    instance_id: trimmedString(formData, "instance_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const svc = createServiceRoleClient();
  if (!svc) return { error: "Service not configured." };

  await svc.from("ai_provider_secrets").delete().eq("provider_instance_id", parsed.data.instance_id);

  const { error } = await svc
    .from("ai_provider_instances")
    .update({
      credential_ui_state: "disabled",
      credential_masked_hint: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.instance_id);

  if (error) {
    logServerError("disableAiProviderSecret", error);
    return { error: CLIENT_ERROR.update };
  }

  await audit(auth.user.id, "disable_provider_secret", "ai_provider_instances", parsed.data.instance_id, {});
  revalidatePath("/admin/ai-workspace/settings");
  return { success: true };
}

export async function deleteAiProviderSecret(
  _prev: AiProviderActionState,
  formData: FormData,
): Promise<AiProviderActionState> {
  return disableAiProviderSecret(_prev, formData);
}

export async function testAiProviderConnection(
  _prev: AiProviderActionState,
  formData: FormData,
): Promise<AiProviderActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const parsed = parseWithSchema(z.object({ instance_id: uuidSchema }), {
    instance_id: trimmedString(formData, "instance_id"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const svc = createServiceRoleClient();
  if (!svc) return { error: "Service not configured." };

  const { data: inst } = await svc
    .from("ai_provider_instances")
    .select("id, kind, credential_source, tenant_id")
    .eq("id", parsed.data.instance_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!inst) return { error: "Provider not found." };

  const row = inst as {
    id: string;
    kind: AiProviderRegistryKind;
    credential_source: AiCredentialMode;
  };
  if (row.kind === "none" || row.kind === "custom") {
    return { error: "Nothing to test for this provider type." };
  }

  const tenant = await fetchTenantControls(tenantId);
  const mode = effectiveCredentialMode(
    { credential_source: row.credential_source },
    tenant,
  );

  const dbKey = await getDecryptedSecretForInstance(row.id);
  const envOpen = process.env.OPENAI_API_KEY?.trim() || null;
  const envAnth = process.env.ANTHROPIC_API_KEY?.trim() || null;
  const key =
    row.kind === "openai"
      ? resolveKeyForMode(mode, dbKey, envOpen)
      : resolveKeyForMode(mode, dbKey, envAnth);

  if (!key?.trim()) {
    const { error: ue } = await svc
      .from("ai_provider_instances")
      .update({
        credential_ui_state: "invalid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (ue) logServerError("testAiProviderConnection/state", ue);
    return { error: "No API key available for this provider (check credential source and saved key)." };
  }

  try {
    if (row.kind === "openai") {
      const res = await fetch("https://api.openai.com/v1/models?limit=1", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.status === 401) {
        await svc
          .from("ai_provider_instances")
          .update({ credential_ui_state: "invalid", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        return { error: "OpenAI rejected the key (401)." };
      }
      if (res.status === 429) {
        await svc
          .from("ai_provider_instances")
          .update({ credential_ui_state: "needs_billing", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        return { error: "OpenAI rate-limited the key (429). Check billing or try later." };
      }
      if (!res.ok) {
        return { error: `OpenAI check failed (${res.status}).` };
      }
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_CHAT_MODEL?.trim() || "claude-sonnet-4-20250514",
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (res.status === 401) {
        await svc
          .from("ai_provider_instances")
          .update({ credential_ui_state: "invalid", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        return { error: "Anthropic rejected the key (401)." };
      }
      if (res.status === 402 || res.status === 429) {
        await svc
          .from("ai_provider_instances")
          .update({ credential_ui_state: "needs_billing", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        return { error: "Anthropic returned quota or billing limits. Check your plan." };
      }
      if (!res.ok) {
        const t = await res.text();
        return { error: `Anthropic check failed (${res.status}): ${t.slice(0, 200)}` };
      }
    }

    await svc
      .from("ai_provider_instances")
      .update({ credential_ui_state: "active", updated_at: new Date().toISOString() })
      .eq("id", row.id);

    await audit(auth.user.id, "test_provider_connection", "ai_provider_instances", row.id, {
      ok: true,
    });
    revalidatePath("/admin/ai-workspace/settings");
    return { success: true, message: "Connection succeeded." };
  } catch (e) {
    logServerError("testAiProviderConnection", e);
    return { error: "Connection test failed." };
  }
}
