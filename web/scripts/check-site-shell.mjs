// Check whether a site_shell row is published for the impronta tenant.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync("/Users/oranpersonal/Desktop/impronta-app/web/.env.local", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tenantId = "00000000-0000-0000-0000-000000000001";

console.log("\n══ site_shell rows (cms_pages with system_template_key='site_shell') ══");
const { data: shells, error } = await supa
  .from("cms_pages")
  .select("id, tenant_id, locale, slug, system_template_key, status, published_at, published_page_snapshot")
  .eq("tenant_id", tenantId)
  .eq("system_template_key", "site_shell");
if (error) console.error(error);
else if (!shells || shells.length === 0) {
  console.log("(no site_shell rows for this tenant)");
} else {
  console.table(
    shells.map((s) => ({
      id: s.id,
      tenant_id: s.tenant_id,
      locale: s.locale,
      slug: s.slug,
      status: s.status,
      published_at: s.published_at,
      snapshot_keys: s.published_page_snapshot
        ? Object.keys(s.published_page_snapshot).join(",")
        : "—",
      slot_count: s.published_page_snapshot?.slots?.length ?? 0,
    })),
  );
  for (const s of shells) {
    if (s.published_page_snapshot?.slots?.length) {
      console.log(`\n— Published slots for ${s.locale}:`);
      for (const slot of s.published_page_snapshot.slots) {
        console.log(`  ${slot.slotKey} (${slot.sectionTypeKey}) sortOrder=${slot.sortOrder}`);
        console.log(`    props keys: ${Object.keys(slot.props || {}).join(", ") || "(none)"}`);
        if (slot.slotKey === "header") {
          console.log(`    full props: ${JSON.stringify(slot.props, null, 6)}`);
        }
      }
    }
  }
}
