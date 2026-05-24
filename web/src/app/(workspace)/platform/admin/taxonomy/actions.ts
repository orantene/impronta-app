"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformRole } from "@/lib/access/platform-role";
import { CACHE_TAG_FIELD_CATALOG } from "@/lib/field-engine/cache-tags";
import { logServerError } from "@/lib/server/safe-error";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";

type PlatformActionContext =
  | { ok: true; sb: SupabaseClient; actorId: string }
  | { ok: false; error: string };

async function requirePlatformAdmin(): Promise<PlatformActionContext> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden - platform admin only." };
  }
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Platform service client unavailable." };
  return { ok: true, sb, actorId: session.user.id };
}

function text(fd: FormData, key: string): string | null {
  const raw = fd.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function intOrNull(fd: FormData, key: string): number | null {
  const raw = text(fd, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function checked(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

function list(fd: FormData, key: string): string[] {
  return (text(fd, key) ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function recordTaxonomyAudit(
  sb: SupabaseClient,
  args: {
    actorId: string;
    action: string;
    targetId: string | null;
    beforeValue?: unknown;
    afterValue?: unknown;
    severity?: "info" | "warn" | "emergency";
  },
): Promise<void> {
  try {
    await sb.from("platform_audit_log").insert({
      actor_profile_id: args.actorId,
      actor_role: "super_admin",
      action: args.action,
      target_type: "taxonomy_term",
      target_id: args.targetId,
      tenant_id: null,
      severity: args.severity ?? "info",
      metadata: {
        before: args.beforeValue ?? null,
        after: args.afterValue ?? null,
      },
    });
  } catch (err) {
    logServerError("platform.taxonomy.audit", err);
  }
}

function revalidateTaxonomySurfaces(termId?: string | null): void {
  revalidateTag(CACHE_TAG_FIELD_CATALOG, "default");
  revalidatePath("/platform/admin/taxonomy");
  revalidatePath("/platform/admin/catalog");
  revalidatePath("/impronta/admin/settings");
  revalidatePath("/impronta/admin/roster");
  if (termId) revalidatePath(`/platform/admin/taxonomy?term=${encodeURIComponent(termId)}`);
}

export async function updatePlatformTaxonomyTermAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/taxonomy?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  if (!id) redirect("/platform/admin/taxonomy?error=Missing%20term");

  const { data: beforeRow } = await auth.sb
    .from("taxonomy_terms")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!beforeRow) redirect("/platform/admin/taxonomy?error=Term%20not%20found");

  const patch = {
    slug: text(formData, "slug") ?? beforeRow.slug,
    name_en: text(formData, "name_en") ?? beforeRow.name_en,
    name_es: text(formData, "name_es"),
    plural_name: text(formData, "plural_name"),
    description: text(formData, "description"),
    icon: text(formData, "icon"),
    term_type: text(formData, "term_type") ?? beforeRow.term_type,
    parent_id: text(formData, "parent_id"),
    level: intOrNull(formData, "level") ?? beforeRow.level,
    sort_order: intOrNull(formData, "sort_order") ?? beforeRow.sort_order,
    aliases: list(formData, "aliases"),
    search_synonyms: list(formData, "search_synonyms"),
    ai_keywords: list(formData, "ai_keywords"),
    is_active: checked(formData, "is_active"),
    is_public_filter: checked(formData, "is_public_filter"),
    is_visible_by_default: checked(formData, "is_visible_by_default"),
    is_profile_badge: checked(formData, "is_profile_badge"),
    is_restricted: checked(formData, "is_restricted"),
    is_generic_fallback: checked(formData, "is_generic_fallback"),
    restriction_level: text(formData, "restriction_level"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.sb
    .from("taxonomy_terms")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.taxonomy.updateTerm", error);
    redirect("/platform/admin/taxonomy?error=Could%20not%20save%20taxonomy%20term");
  }

  await recordTaxonomyAudit(auth.sb, {
    actorId: auth.actorId,
    action: "platform.engine.taxonomy.update",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: patch.is_restricted ? "warn" : "info",
  });

  revalidateTaxonomySurfaces(id);
  redirect("/platform/admin/taxonomy?saved=term");
}

export async function setPlatformTaxonomyLifecycleAction(formData: FormData): Promise<void> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) redirect(`/platform/admin/taxonomy?error=${encodeURIComponent(auth.error)}`);

  const id = text(formData, "id");
  const mode = text(formData, "mode");
  if (!id || (mode !== "archive" && mode !== "restore")) {
    redirect("/platform/admin/taxonomy?error=Invalid%20lifecycle%20request");
  }

  const { data: beforeRow } = await auth.sb
    .from("taxonomy_terms")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const patch =
    mode === "archive"
      ? { archived_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() }
      : { archived_at: null, is_active: true, updated_at: new Date().toISOString() };

  const { error } = await auth.sb
    .from("taxonomy_terms")
    .update(patch)
    .eq("id", id);

  if (error) {
    logServerError("platform.taxonomy.lifecycle", error);
    redirect("/platform/admin/taxonomy?error=Could%20not%20change%20taxonomy%20lifecycle");
  }

  await recordTaxonomyAudit(auth.sb, {
    actorId: auth.actorId,
    action: mode === "archive" ? "platform.engine.taxonomy.archive" : "platform.engine.taxonomy.restore",
    targetId: id,
    beforeValue: beforeRow,
    afterValue: patch,
    severity: "warn",
  });

  revalidateTaxonomySurfaces(id);
  redirect("/platform/admin/taxonomy?saved=lifecycle");
}
