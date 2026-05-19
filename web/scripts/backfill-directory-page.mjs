#!/usr/bin/env node
/**
 * Phase 3 Step 1 — directory system-page backfill for a single tenant.
 *
 * Service-role one-off. Faithful standalone mirror of
 * `scripts/backfill-site-shell.mjs` (the proven pattern) + the in-app
 * `ensureDirectoryPage` action — bypasses the staff-auth gate so it runs
 * directly without an authenticated session. Seeds + publishes a
 * `system_template_key='directory'` page at the fenced slug
 * `__directory__` whose single `main`-slot section is a `directory`
 * instance from the Fashion preset. Idempotent.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-directory-page.mjs [--tenant <uuid>] [--locale en]
 * With no --tenant it auto-resolves Impronta via agency_domains.
 */
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null))
    .filter(Boolean),
);
const locale = args.locale || "en";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RESERVED_DIRECTORY_SLUG = "__directory__";

// Exact `fashionDirectoryPreset` (web/src/lib/site-admin/sections/
// directory/presets.ts) — inlined so this script has zero app-graph deps,
// exactly like backfill-site-shell.mjs inlines headerProps/footerProps.
const DIRECTORY_PROPS = {
  eyebrow: "Roster",
  headline: "Talent",
  copy: "Browse the roster. Filter by discipline, refine with natural language.",
  headerAlign: "center",
  showHeading: true,
  entityLabel: "talent",
  scope: "all",
  talentTypeKeys: [],
  tagKeys: [],
  manualProfileCodes: [],
  pinnedProfileCodes: [],
  excludedProfileCodes: [],
  requirePhoto: false,
  excludeUnavailable: false,
  minTrustTier: "any",
  defaultSort: "recommended",
  pagination: "infinite",
  pageSize: 24,
  template: "atelier",
  columnsDesktop: 4,
  columnsTablet: 3,
  columnsMobile: 2,
  density: "comfortable",
  containerWidth: "boxed",
  background: "cool_ground",
  cardStyle: "portrait",
  cardAspect: "4:5",
  showName: true,
  nameFallback: "first_name",
  showTalentType: true,
  showLocation: true,
  showAttributes: true,
  showRating: false,
  showPriceFrom: false,
  showAvailability: true,
  showBadges: true,
  showSave: true,
  showAddToInquiry: true,
  hoverBehavior: "reveal_traits",
  cardFieldKeys: [],
  maxFieldLines: 3,
  sidebarShow: false,
  sidebarPosition: "left",
  sidebarSticky: true,
  sidebarDefaultCollapsed: true,
  filterSearchBox: true,
  topBarMode: "talent_type",
  sortControlShow: true,
  showResultCount: true,
  showActiveChips: true,
  mobileFilterStyle: "sheet",
  aiMode: "hero_band",
  aiPlacement: "above_center",
  aiTitle: "Describe who you're looking for",
  aiBody: "",
  aiPlaceholder: "e.g. a bilingual host in Milan available next month",
  aiExamplePrompts: [],
  aiBehavior: "interpret",
  emptyStateText:
    "No one matches yet — broaden the filters or check back as the roster grows.",
  structuredData: true,
  presentation: {
    background: "canvas",
    paddingTop: "editorial",
    paddingBottom: "editorial",
    containerWidth: "wide",
    align: "center",
    dividerTop: "thin-line",
  },
};

async function resolveTenant() {
  if (args.tenant) return args.tenant;
  const { data, error } = await supabase
    .from("agency_domains")
    .select("tenant_id, domain")
    .ilike("domain", "%impronta%")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("agency_domains lookup failed:", error.message);
    process.exit(1);
  }
  if (!data?.tenant_id) {
    console.error("could not resolve Impronta tenant from agency_domains; pass --tenant <uuid>");
    process.exit(1);
  }
  console.log("resolved tenant via", data.domain, "→", data.tenant_id);
  return data.tenant_id;
}

async function main() {
  const tenantId = await resolveTenant();

  // 1. Idempotency
  const { data: existing } = await supabase
    .from("cms_pages")
    .select("id, status, published_at")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("system_template_key", "directory")
    .maybeSingle();
  if (existing) {
    console.log(JSON.stringify({ ok: true, action: "already_existed", pageId: existing.id, status: existing.status }, null, 2));
    return;
  }

  const nowIso = new Date().toISOString();

  // 2. Create the directory section row (direct insert, schema-equivalent
  //    to upsertSection — mirrors backfill-site-shell.mjs §3).
  const secInsert = await supabase
    .from("cms_sections")
    .insert({
      tenant_id: tenantId,
      section_type_key: "directory",
      schema_version: 1,
      name: "Directory — new",
      status: "published",
      props_jsonb: DIRECTORY_PROPS,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (secInsert.error || !secInsert.data) {
    console.error("directory section insert failed:", secInsert.error?.message);
    process.exit(1);
  }
  const sectionId = secInsert.data.id;

  // 3. Create the page row
  const pageInsert = await supabase
    .from("cms_pages")
    .insert({
      tenant_id: tenantId,
      locale,
      slug: RESERVED_DIRECTORY_SLUG,
      template_key: "page",
      template_schema_version: 1,
      system_template_key: "directory",
      is_system_owned: true,
      title: "Directory",
      status: "draft",
      version: 1,
    })
    .select("id, version")
    .single();
  if (pageInsert.error || !pageInsert.data) {
    console.error("directory page row insert failed:", pageInsert.error?.message);
    process.exit(1);
  }
  const pageId = pageInsert.data.id;

  // 4. Page-section pointers (live + draft, mirrors site-shell loop)
  for (const isDraft of [true, false]) {
    const ps = await supabase.from("cms_page_sections").insert([
      {
        tenant_id: tenantId,
        page_id: pageId,
        section_id: sectionId,
        slot_key: "main",
        sort_order: 0,
        is_draft: isDraft,
      },
    ]);
    if (ps.error) {
      console.error(`page_sections insert (is_draft=${isDraft}) failed:`, ps.error.message);
      process.exit(1);
    }
  }

  // 5. Bake snapshot + publish (no builderTree — standalone parity with
  //    backfill-site-shell.mjs §6)
  const snapshot = {
    version: 1,
    publishedAt: nowIso,
    pageVersion: 2,
    locale,
    fields: { title: "Directory", metaDescription: null, introTagline: null },
    templateSchemaVersion: 1,
    slots: [
      {
        slotKey: "main",
        sortOrder: 0,
        sectionId,
        sectionTypeKey: "directory",
        schemaVersion: 1,
        name: "Directory — new",
        props: DIRECTORY_PROPS,
      },
    ],
  };
  const pub = await supabase
    .from("cms_pages")
    .update({
      status: "published",
      published_at: nowIso,
      published_page_snapshot: snapshot,
      version: 2,
    })
    .eq("id", pageId)
    .eq("tenant_id", tenantId)
    .eq("version", 1);
  if (pub.error) {
    console.error("directory publish failed:", pub.error.message);
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, action: "created", tenantId, locale, pageId, sectionId, published: true }, null, 2));
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
