"use server";

/**
 * The talent's own FAQ (question / answer rows, per language), PR 7.
 * Owner-only: the signed-in user's own talent profile.
 */
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { revalidatePath } from "next/cache";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { loadTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";
import type { FaqEditorItem } from "./faq-editor-model";
import { readOwnFaqItems, writeOwnFaqItems } from "./faq-editor-store";
import { loadOwnTalentProfileId } from "./talent-languages-store";

export type FaqEditorLoad =
  | { ok: true; primary: string; items: FaqEditorItem[] }
  | { ok: false; error: string };

async function who(): Promise<{ id: string; primary: string } | null> {
  const session = await getCachedActorSession();
  if (!session?.user) return null;
  const id = await loadOwnTalentProfileId(session.user.id);
  if (!id) return null;
  const settings = await loadTalentLocaleSettings(id);
  return { id, primary: settings.defaultLocale };
}

export async function loadMyFaqItems(): Promise<FaqEditorLoad> {
  try {
    const me = await who();
    if (!me) return { ok: false, error: "Profile not found" };
    const items = await readOwnFaqItems(me.id, me.primary);
    if (!items) return { ok: false, error: "Could not load questions." };
    return { ok: true, primary: me.primary, items };
  } catch (err) {
    logServerError("faq-editor.load", err);
    return { ok: false, error: "Unexpected error" };
  }
}

export async function saveMyFaqItems(
  items: FaqEditorItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const me = await who();
    if (!me) return { ok: false, error: "Profile not found" };
    const saved = await writeOwnFaqItems(me.id, Array.isArray(items) ? items : [], me.primary);
    if (!saved) return { ok: false, error: "Could not save questions." };
    revalidatePath("/talent", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("faq-editor.save", err);
    return { ok: false, error: "Unexpected error" };
  }
}
