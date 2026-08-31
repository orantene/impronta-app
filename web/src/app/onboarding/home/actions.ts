"use server";

/**
 * Home chooser — persist which dashboard a multi-home account lands on.
 *
 * Separate from `../actions.ts` on purpose: everything there sets `app_role` and
 * provisions objects. This sets a routing preference and nothing else, which is
 * the whole reason the column exists (see migration 20261226000007).
 */

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/server/action-guards";
import { HOME_PATH, isHome, validHomes } from "@/lib/tulala/structure-model";
import {
  loadOwnedObjects,
  saveHomePreference,
} from "@/lib/tulala/structure-model.server";

export async function chooseHomeSurface(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session.ok) redirect("/login?next=%2Fonboarding%2Fhome");

  const raw = String(formData.get("home") ?? "");
  if (!isHome(raw)) redirect("/onboarding/home?error=unknown");

  // Never store a home the account cannot actually open. A forged form value
  // would otherwise park someone on a preference that routes them to a surface
  // that immediately bounces them back here.
  const owned = await loadOwnedObjects(session.user.id);
  const allowed = validHomes(owned, session.profile?.app_role ?? null);
  if (!allowed.includes(raw)) redirect("/onboarding/home?error=unavailable");

  const saved = await saveHomePreference(session.user.id, raw);
  if (!saved.ok) redirect("/onboarding/home?error=failed");

  redirect(HOME_PATH[raw]);
}
