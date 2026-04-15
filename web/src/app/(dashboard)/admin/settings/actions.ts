"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseWithSchema, trimmedString } from "@/lib/admin/validation";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type SettingsActionState = { error?: string; success?: boolean } | undefined;

const upsertSettingSchema = z.object({
  key: z.string().min(1, "Missing key."),
  value: z.string(),
});

export async function upsertSetting(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(upsertSettingSchema, {
    key: trimmedString(formData, "key"),
    value: trimmedString(formData, "value"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { key, value } = parsed.data;

  const jsonValue: string | boolean =
    value === "true" ? true : value === "false" ? false : value;

  const { error } = await supabase
    .from("settings")
    .upsert({ key, value: jsonValue, updated_at: new Date().toISOString() });

  if (error) {
    logServerError("admin/upsertSetting", error);
    return { error: CLIENT_ERROR.update };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/ai-workspace/settings");
  revalidatePath("/admin/ai-workspace");
  // Theme & public toggles live in the root layout — revalidate all public pages.
  if (
    key === "site_theme" ||
    key === "dashboard_theme" ||
    key === "directory_public" ||
    key === "public_font_preset"
  ) {
    revalidatePath("/", "layout");
  }
  return { success: true };
}
