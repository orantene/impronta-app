#!/usr/bin/env node
/**
 * Marta's demo: a real "operator builds a new directory page" walkthrough.
 *
 * Persona: Marta — Impronta's marketing lead, planning the fall campaign.
 * Story:   creates a fresh builder page titled "Faces of Fall '26" with
 *          the new portable Directory section, scoped via multi-key
 *          talent-type filter to her MODELING roster only (vs the broader
 *          /directory). Eyebrow, headline, copy all customised per-instance.
 *
 * What this proves end-to-end:
 *   • New tenant-authored builder page (not a system __directory__)
 *   • Same `directory` section type as /directory and /p/our-fashion-models
 *   • Per-instance: eyebrow, headline, copy, scope (multi-key!), AI band
 *   • Live render via the generic public CMS route + HomepageCmsSections
 *   • §10 badges (trust + agency + availability) thanks to Phase B Lane 5
 *   • Multi-instance independence — same engine, zero new app code
 *
 * Pattern: faithful mirror of `scripts/seed-multi-instance-proof.mjs`
 * (which the directory plan ratified — proven idempotent direct-CRUD).
 *
 * Usage: node --env-file=.env.local scripts/seed-marta-demo-page.mjs
 */
import { createClient } from "@supabase/supabase-js";

const TENANT = "00000000-0000-0000-0000-000000000001"; // Impronta
const LOCALE = "en";
const SLUG = "faces-of-fall-26";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing supabase env"); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Marta's per-instance configuration — every knob is hers to set.
const PROPS = {
  eyebrow: "Fall Campaign",
  headline: "Faces of Fall '26",
  copy: "Our modeling roster, ready to book for the autumn season.",
  headerAlign: "center", showHeading: true, entityLabel: "talent",
  // The portable per-instance scope — MULTI-KEY model categories only.
  scope: "by_talent_type",
  talentTypeKeys: ["fashion-model", "runway-model", "commercial-model", "trade-show-model"],
  tagKeys: [], manualProfileCodes: [], pinnedProfileCodes: [], excludedProfileCodes: [],
  requirePhoto: false, excludeUnavailable: false, minTrustTier: "any",
  defaultSort: "recommended", pagination: "infinite", pageSize: 24,
  template: "atelier", columnsDesktop: 4, columnsTablet: 3, columnsMobile: 2,
  density: "comfortable", containerWidth: "boxed", background: "cool_ground",
  cardStyle: "portrait", cardAspect: "4:5",
  showName: true, nameFallback: "first_name",
  showTalentType: true, showLocation: true, showAttributes: true,
  showRating: false, showPriceFrom: false, showAvailability: true, showBadges: true,
  showSave: true, showAddToInquiry: true,
  hoverBehavior: "reveal_traits", cardFieldKeys: [], maxFieldLines: 3,
  sidebarShow: false, sidebarPosition: "left", sidebarSticky: true, sidebarDefaultCollapsed: true,
  filterSearchBox: true, topBarMode: "talent_type",
  sortControlShow: true, showResultCount: true, showActiveChips: true, mobileFilterStyle: "sheet",
  aiMode: "hero_band", aiPlacement: "above_center",
  aiTitle: "Tell us what your fall shoot needs",
  aiBody: "",
  aiPlaceholder: "e.g. a runway model available in October",
  aiExamplePrompts: [], aiBehavior: "interpret",
  emptyStateText: "No models match yet — broaden the filter or check back.",
  structuredData: true,
  presentation: {
    background: "canvas", paddingTop: "editorial", paddingBottom: "editorial",
    containerWidth: "wide", align: "center", dividerTop: "thin-line",
  },
};

async function main() {
  // Idempotency
  const { data: existing } = await supabase.from("cms_pages")
    .select("id,status").eq("tenant_id", TENANT).eq("locale", LOCALE).eq("slug", SLUG).maybeSingle();
  if (existing) {
    console.log(JSON.stringify({ ok: true, action: "already_existed", pageId: existing.id, slug: SLUG }, null, 2));
    return;
  }

  const nowIso = new Date().toISOString();
  const sec = await supabase.from("cms_sections").insert({
    tenant_id: TENANT, section_type_key: "directory", schema_version: 1,
    name: "Faces of Fall '26 — directory section", status: "published",
    props_jsonb: PROPS, version: 1, created_at: nowIso, updated_at: nowIso,
  }).select("id").single();
  if (sec.error) { console.error("section insert:", sec.error.message); process.exit(1); }

  const pg = await supabase.from("cms_pages").insert({
    tenant_id: TENANT, locale: LOCALE, slug: SLUG, template_key: "page",
    template_schema_version: 1, is_system_owned: false,
    title: "Faces of Fall '26", status: "draft", version: 1,
  }).select("id").single();
  if (pg.error) { console.error("page insert:", pg.error.message); process.exit(1); }

  for (const isDraft of [true, false]) {
    const ps = await supabase.from("cms_page_sections").insert([{
      tenant_id: TENANT, page_id: pg.data.id, section_id: sec.data.id,
      slot_key: "main", sort_order: 0, is_draft: isDraft,
    }]);
    if (ps.error) { console.error(`page_sections is_draft=${isDraft}:`, ps.error.message); process.exit(1); }
  }

  const snapshot = {
    version: 1, publishedAt: nowIso, pageVersion: 2, locale: LOCALE,
    fields: { title: "Faces of Fall '26", metaDescription: null, introTagline: null },
    templateSchemaVersion: 1,
    slots: [{ slotKey: "main", sortOrder: 0, sectionId: sec.data.id,
              sectionTypeKey: "directory", schemaVersion: 1,
              name: "Faces of Fall '26 — directory section", props: PROPS }],
  };
  const pub = await supabase.from("cms_pages").update({
    status: "published", published_at: nowIso, published_page_snapshot: snapshot, version: 2,
  }).eq("id", pg.data.id).eq("tenant_id", TENANT).eq("version", 1);
  if (pub.error) { console.error("publish:", pub.error.message); process.exit(1); }

  console.log(JSON.stringify({
    ok: true, action: "created",
    pageId: pg.data.id, sectionId: sec.data.id, slug: SLUG,
    scopeKeys: PROPS.talentTypeKeys,
    publicUrl: `/p/${SLUG}`,
  }, null, 2));
}
main().catch(e => { console.error("failed:", e); process.exit(1); });
