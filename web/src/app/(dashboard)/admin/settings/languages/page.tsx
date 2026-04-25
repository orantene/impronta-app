import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Phase 17 — Settings consolidation.
 *
 * Languages config now lives inside `/admin/settings#languages` alongside
 * the rest of the workspace settings. Redirect preserves bookmarks.
 */
export default function AdminLanguageSettingsPage() {
  redirect("/admin/settings#languages");
}
