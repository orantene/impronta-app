#!/usr/bin/env node
/**
 * Phase 3 multi-instance proof — a 2nd, independent directory page.
 *
 * Creates a NON-system standard page (slug `our-fashion-models`) whose
 * single `main` section is another `directory` instance, scoped
 * `by_talent_type` → ["fashion-model"]. Proves §0.1 portability: two
 * instances of the same section type, differing only in saved config,
 * rendering independently at different URLs — ZERO new app code (pure
 * builder CRUD via the same proven direct-insert pattern as
 * backfill-directory-page.mjs). `/directory` shows all 8 talent; this
 * page shows only the 2 fashion-models.
 *
 * Usage: node --env-file=.env.local scripts/seed-multi-instance-proof.mjs --tenant <uuid>
 */
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
);
const tenantId = args.tenant || "00000000-0000-0000-0000-000000000001";
const locale = args.locale || "en";
const SLUG = "our-fashion-models";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing supabase env"); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Same Fashion preset, with the per-instance scope override — this IS the
// "Our Chefs" pattern (chefs = 0 rows in seed data; fashion-model = 2).
const PROPS = {
  eyebrow: "Roster", headline: "Our Fashion Models",
  copy: "Everyone on the roster repped for fashion work.",
  headerAlign: "center", showHeading: true, entityLabel: "talent",
  scope: "by_talent_type", talentTypeKeys: ["fashion-model"],
  tagKeys: [], manualProfileCodes: [], pinnedProfileCodes: [], excludedProfileCodes: [],
  requirePhoto: false, excludeUnavailable: false, minTrustTier: "any",
  defaultSort: "recommended", pagination: "infinite", pageSize: 24,
  template: "atelier", columnsDesktop: 4, columnsTablet: 3, columnsMobile: 2,
  density: "comfortable", containerWidth: "boxed", background: "cool_ground",
  cardStyle: "portrait", cardAspect: "4:5", showName: true, nameFallback: "first_name",
  showTalentType: true, showLocation: true, showAttributes: true, showRating: false,
  showPriceFrom: false, showAvailability: true, showBadges: true, showSave: true,
  showAddToInquiry: true, hoverBehavior: "reveal_traits", cardFieldKeys: [], maxFieldLines: 3,
  sidebarShow: false, sidebarPosition: "left", sidebarSticky: true, sidebarDefaultCollapsed: true,
  filterSearchBox: true, topBarMode: "talent_type", sortControlShow: true,
  showResultCount: true, showActiveChips: true, mobileFilterStyle: "sheet",
  aiMode: "hero_band", aiPlacement: "above_center",
  aiTitle: "Describe who you're looking for", aiBody: "",
  aiPlaceholder: "e.g. a runway model in Milan", aiExamplePrompts: [], aiBehavior: "interpret",
  emptyStateText: "No fashion models match yet.", structuredData: true,
  presentation: { background: "canvas", paddingTop: "editorial", paddingBottom: "editorial", containerWidth: "wide", align: "center", dividerTop: "thin-line" },
};

async function main() {
  const { data: existing } = await supabase.from("cms_pages")
    .select("id,status").eq("tenant_id", tenantId).eq("locale", locale).eq("slug", SLUG).maybeSingle();
  if (existing) { console.log(JSON.stringify({ ok: true, action: "already_existed", pageId: existing.id })); return; }

  const nowIso = new Date().toISOString();
  const sec = await supabase.from("cms_sections").insert({
    tenant_id: tenantId, section_type_key: "directory", schema_version: 1,
    name: "Our Fashion Models — directory", status: "published",
    props_jsonb: PROPS, version: 1, created_at: nowIso, updated_at: nowIso,
  }).select("id").single();
  if (sec.error) { console.error("section insert:", sec.error.message); process.exit(1); }

  const pg = await supabase.from("cms_pages").insert({
    tenant_id: tenantId, locale, slug: SLUG, template_key: "page",
    template_schema_version: 1, is_system_owned: false,
    title: "Our Fashion Models", status: "draft", version: 1,
  }).select("id").single();
  if (pg.error) { console.error("page insert:", pg.error.message); process.exit(1); }

  for (const isDraft of [true, false]) {
    const ps = await supabase.from("cms_page_sections").insert([{
      tenant_id: tenantId, page_id: pg.data.id, section_id: sec.data.id,
      slot_key: "main", sort_order: 0, is_draft: isDraft,
    }]);
    if (ps.error) { console.error(`page_sections is_draft=${isDraft}:`, ps.error.message); process.exit(1); }
  }

  const snapshot = {
    version: 1, publishedAt: nowIso, pageVersion: 2, locale,
    fields: { title: "Our Fashion Models", metaDescription: null, introTagline: null },
    templateSchemaVersion: 1,
    slots: [{ slotKey: "main", sortOrder: 0, sectionId: sec.data.id, sectionTypeKey: "directory", schemaVersion: 1, name: "Our Fashion Models — directory", props: PROPS }],
  };
  const pub = await supabase.from("cms_pages").update({
    status: "published", published_at: nowIso, published_page_snapshot: snapshot, version: 2,
  }).eq("id", pg.data.id).eq("tenant_id", tenantId).eq("version", 1);
  if (pub.error) { console.error("publish:", pub.error.message); process.exit(1); }

  console.log(JSON.stringify({ ok: true, action: "created", pageId: pg.data.id, sectionId: sec.data.id, slug: SLUG, scopedTo: "fashion-model" }, null, 2));
}
main().catch((e) => { console.error("failed:", e); process.exit(1); });
