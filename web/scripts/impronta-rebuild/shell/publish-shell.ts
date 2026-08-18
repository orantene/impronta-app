/**
 * publish-shell.ts — bake the shell snapshot for BOTH locales.
 *
 * Calls the exact function the editor's Publish button calls
 * (`republishSiteShellSnapshot`), so there is no second publish path to drift.
 * Spanish is the reason this exists: its snapshot predates the freeform shell
 * entirely, and the editor publishes one locale at a time.
 *
 * Reports the `reason` verbatim. `shell_has_no_sections` means the anchors are
 * gone and publish SILENTLY no-ops -- it must never be mistaken for success.
 */
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";
import { createClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";

async function main() {
  const { loadEnvLocal } = await import("../../load-env-local.mjs");
  loadEnvLocal();
  const slug = process.env.IMPRONTA_SEED_TENANT_SLUG ?? "impronta";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: tenant } = await supabase
    .from("agencies").select("id").eq("slug", slug).maybeSingle();
  if (!tenant) throw new Error(`no tenant for slug "${slug}"`);

  for (const locale of ["en", "es"] as Locale[]) {
    const r = await republishSiteShellSnapshot(supabase, {
      tenantId: tenant.id as string,
      locale,
      actorProfileId: null,
    });
    const applied = "applied" in r ? r.applied : false;
    const reason = "reason" in r ? (r.reason ?? "") : "";
    console.log(
      `${locale}  ok=${r.ok}  applied=${applied}  ${reason ? `reason=${reason}` : ""}`,
    );
    if (!applied) console.log(`  ^ NOT PUBLISHED for ${locale}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
