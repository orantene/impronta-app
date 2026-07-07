"use server";

/**
 * Platform-admin server actions for the GLOBAL AI provider registry (the row set
 * under DEFAULT_AI_TENANT_ID that every tenant inherits). super_admin-gated;
 * secrets go IN encrypted, never OUT.
 */

import { revalidatePath } from "next/cache";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import {
  saveAndActivateProvider,
  setProviderActive,
  type ProviderConfigKind,
} from "@/lib/ai/ai-provider-admin";
import { setGenerationModel } from "@/lib/ai/ai-generation-model";

const REVALIDATE_PATH = "/platform/admin/ai-providers";

export type AiProviderActionResult = { ok: true } | { ok: false; error: string };

async function requirePlatformAdmin(): Promise<AiProviderActionResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Please sign in again." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden." };
  }
  return { ok: true };
}

export async function saveAiProviderKeyAction(input: {
  kind: ProviderConfigKind;
  apiKey: string;
}): Promise<AiProviderActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const result = await saveAndActivateProvider(input.kind, input.apiKey);
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

export async function setAiProviderActiveAction(input: {
  kind: ProviderConfigKind;
  active: boolean;
}): Promise<AiProviderActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const result = await setProviderActive(input.kind, input.active);
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}

export async function setAiGenerationModelAction(input: {
  model: string;
}): Promise<AiProviderActionResult> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return guard;
  const result = await setGenerationModel(input.model);
  if (result.ok) revalidatePath(REVALIDATE_PATH);
  return result;
}
