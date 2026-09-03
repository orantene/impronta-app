"use server";

/* eslint-disable ratchet/no-untenanted-from -- agencies is the tenant-root table (keyed by id, not tenant_id); same pattern as appointments-settings-tenant. */

/**
 * industry-settings.ts — the door the words engine did not have.
 *
 * F2a shipped the registry, sixteen presets and the read path. F2b wired the
 * chat voice and the header verb to it. But NOTHING in the product ever wrote
 * `agencies.settings.industry_preset`: a repo-wide grep found zero references
 * outside `lib/words/`. So every preset was unreachable, every workspace
 * resolved to "custom", and the whole engine was inert in production.
 *
 * An engine with no door is indistinguishable from no engine. This is the door.
 *
 * READ-MODIFY-MERGE, NEVER CLOBBER. `agencies.settings` is one JSONB blob
 * shared with `appointments` (and whatever lands next), so a write that sets
 * the whole column would silently drop another feature's config. Same pattern
 * and same reason as `appointments-settings-tenant.ts`.
 *
 * TERMINOLOGY IS NOT TOUCHED HERE. It lives at `settings.appointments
 * .terminology` and belongs to the Appointments Manager; the words layer reads
 * it and lets an override sit on top. A preset change must never rewrite a
 * terminology the operator explicitly chose.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  INDUSTRY_PRESET_IDS,
  MAX_WORD_LENGTH,
  WORD_LOCALES,
  applyWordEdit,
  parseWordsSettings,
  type WordsSettings,
} from "@/lib/words";

const presetSchema = z.object({
  presetId: z.enum(INDUSTRY_PRESET_IDS),
});

const wordEditSchema = z.object({
  key: z.string().min(1).max(120),
  locale: z.enum(WORD_LOCALES),
  // An empty string is meaningful: it CLEARS the override and returns the row
  // to its default. `applyWordEdit` deletes the key rather than storing "".
  value: z.string().max(MAX_WORD_LENGTH),
});

export type IndustrySettingsResult =
  | { ok: true; data: WordsSettings }
  | { ok: false; error: string };

/** Read the current settings blob for this tenant, or fail loudly. */
async function readSettings(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true; settings: Record<string, unknown> } | { ok: false }> {
  const { data, error } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  if (error) {
    logServerError("industry-settings.read", error);
    return { ok: false };
  }
  const settings =
    typeof data?.settings === "object" && data.settings !== null
      ? (data.settings as Record<string, unknown>)
      : {};
  return { ok: true, settings };
}

/**
 * Choose the workspace's industry.
 *
 * This is what makes a restaurant a restaurant: the preset supplies the words,
 * the chat voice and the header verb. It writes ONE key and merges, so the
 * appointments block and anything else in `settings` survives untouched.
 *
 * It deliberately does NOT clear the tenant's word overrides. An operator who
 * renamed a noun and then switched industry meant both things; dropping their
 * edits because a preset changed would be the seeder rewriting an operator's
 * work, which is the mistake the nav seeder explicitly refuses to make.
 */
export async function setIndustryPreset(
  input: z.infer<typeof presetSchema>,
): Promise<IndustrySettingsResult> {
  const parsed = presetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: CLIENT_ERROR.update };

  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const current = await readSettings(supabase, tenantId);
  if (!current.ok) return { ok: false, error: CLIENT_ERROR.update };

  const nextSettings = {
    ...current.settings,
    industry_preset: parsed.data.presetId,
  };

  const { error } = await supabase
    .from("agencies")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) {
    logServerError("industry-settings.setPreset", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // The public header, the chat opener and every seeded noun read this, and
  // they are cached per tenant. A layout revalidate is the blunt but correct
  // instrument: an operator who picks an industry expects their own site to
  // change, and a stale header for five minutes reads as "it did not work".
  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: parseWordsSettings(nextSettings) };
}

/**
 * Rename one noun, in one language.
 *
 * Clearing a value removes the key entirely rather than storing an empty
 * string, so "cleared" and "never set" are the same state in the database and
 * the settings table cannot drift from what the public page renders.
 */
export async function setWordOverride(
  input: z.infer<typeof wordEditSchema>,
): Promise<IndustrySettingsResult> {
  const parsed = wordEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: CLIENT_ERROR.update };

  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const current = await readSettings(supabase, tenantId);
  if (!current.ok) return { ok: false, error: CLIENT_ERROR.update };

  const parsedWords = parseWordsSettings(current.settings);
  const nextOverrides = applyWordEdit(
    parsedWords.overrides,
    parsed.data.key,
    parsed.data.locale,
    parsed.data.value,
  );

  const nextSettings = { ...current.settings, words: nextOverrides };

  const { error } = await supabase
    .from("agencies")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) {
    logServerError("industry-settings.setWord", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: parseWordsSettings(nextSettings) };
}
