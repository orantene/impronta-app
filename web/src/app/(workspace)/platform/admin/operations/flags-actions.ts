"use server";

// Platform HQ · Operations — real feature-flags surface.
//
// Reads/writes the GLOBAL platform-default rows in `public.settings`
// (key TEXT primary key, value JSONB, tenant_id NULL = Layer-4 platform
// default — the scope every getter reads in the platform/hub context).
//
// SECURITY: every write re-checks isPlatformAdmin server-side (never trust the
// client) and uses the service-role client. The page is already gated by the
// platform layout, but actions must guard independently.
//
// ── Orphan / safe-to-ignore settings keys (not exposed here, on purpose) ──
//   • ff_admin_workspace_v3 + ff_admin_workspace_v3_allowlist — seeded by
//     migration 20260430000000_ff_admin_workspace_v3_flag.sql but NEVER read
//     by any code (the getter that consumed them was deleted as dead). Orphaned
//     rows; safe to ignore. Do not re-wire without a real consumer.
//   • watermark_enabled — read into PublicSettings but not consumed anywhere.
//   • PUBLIC_SETTINGS_STRICT_MISSING, DIRECTORY_API_AUDIT — env-only, stay env.

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformRole } from "@/lib/access/platform-role";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  FLAG_REGISTRY,
  type FlagControl,
  type FlagKey,
} from "./flags-registry";

export type FlagWriteResult = { ok: true } | { ok: false; error: string };

type Ctx =
  | { ok: true; sb: SupabaseClient }
  | { ok: false; error: string };

async function requirePlatformAdmin(): Promise<Ctx> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden — platform admin only." };
  }
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Platform service client unavailable." };
  return { ok: true, sb };
}

/**
 * Coerce a raw form string into the JSONB value to persist, validated against
 * the flag's declared control type. Returns `{ error }` for anything invalid so
 * we never write a malformed value.
 */
function coerceValue(
  control: FlagControl,
  raw: string,
): { value: unknown } | { error: string } {
  switch (control.kind) {
    case "toggle":
      return { value: raw === "true" };
    case "select": {
      if (!control.options.some((o) => o.value === raw)) {
        return { error: `Invalid option "${raw}".` };
      }
      return { value: raw };
    }
    case "number": {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n)) return { error: "Must be a whole number." };
      if (control.min != null && n < control.min) {
        return { error: `Must be ≥ ${control.min}.` };
      }
      if (control.max != null && n > control.max) {
        return { error: `Must be ≤ ${control.max}.` };
      }
      return { value: n };
    }
    case "text": {
      const trimmed = raw.trim();
      return { value: trimmed.length > 0 ? trimmed : null };
    }
  }
}

/**
 * Upsert one platform-default settings row (tenant_id NULL). Re-checks the
 * platform-admin gate before writing.
 */
export async function saveFlag(
  key: FlagKey,
  raw: string,
): Promise<FlagWriteResult> {
  const def = FLAG_REGISTRY[key];
  if (!def) return { ok: false, error: "Unknown setting." };

  const ctx = await requirePlatformAdmin();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const coerced = coerceValue(def.control, raw);
  if ("error" in coerced) return { ok: false, error: coerced.error };

  // Platform-default layer: tenant_id IS NULL is the scope every getter reads
  // in the platform/hub context. `key` is the table's primary key, so a single
  // global row per key — upsert on key.
  const { error } = await ctx.sb
    .from("settings")
    .upsert(
      { key, value: coerced.value as never, tenant_id: null, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  if (error) {
    logServerError(`operations/saveFlag:${key}`, error);
    return { ok: false, error: "Could not save. Please try again." };
  }

  revalidatePath("/platform/admin/operations");
  return { ok: true };
}
