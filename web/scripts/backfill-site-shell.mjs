#!/usr/bin/env node
/**
 * Phase B.2.A — site shell backfill for a single tenant.
 *
 * Service-role one-off script. Mirrors `lib/site-admin/edit-mode/
 * site-shell-backfill-action.ts` but bypasses the staff-auth gate so the
 * operator (you) can run it directly against prod without an authenticated
 * session.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-site-shell.mjs \
 *     --tenant 00000000-0000-0000-0000-000000000001 \
 *     --locale en
 *
 * Idempotent: re-running on a tenant that already has a shell row is a
 * no-op (logs "already exists" and exits 0).
 */
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null))
    .filter(Boolean),
);

const tenantId = args.tenant;
const locale = args.locale || "en";

if (!tenantId) {
  console.error("Usage: --tenant <tenant-uuid> [--locale en]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RESERVED_SHELL_SLUG = "__site_shell__";

async function main() {
  // 1. Idempotency check
  const { data: existing } = await supabase
    .from("cms_pages")
    .select("id, status, published_at")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("system_template_key", "site_shell")
    .maybeSingle();
  if (existing) {
    console.log(JSON.stringify({
      ok: true,
      action: "already_existed",
      shellPageId: existing.id,
      status: existing.status,
      publishedAt: existing.published_at,
    }, null, 2));
    return;
  }

  // 2. Read identity + nav for premium defaults
  const { data: identity } = await supabase
    .from("agency_business_identity")
    .select("public_name, tagline, footer_tagline, social_instagram, social_tiktok, social_facebook, social_linkedin, social_youtube, social_x, primary_cta_label, primary_cta_href")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const id = identity || {};
  const brandLabel = (id.public_name || "Studio").trim();
  const tagline = (id.footer_tagline || id.tagline || null);
  const year = new Date().getFullYear();

  const { data: headerNavRows } = await supabase
    .from("cms_navigation_links")
    .select("label, href, sort_order")
    .eq("tenant_id", tenantId)
    .eq("zone", "header")
    .order("sort_order", { ascending: true })
    .limit(8);
  const { data: footerNavRows } = await supabase
    .from("cms_navigation_links")
    .select("label, href, sort_order")
    .eq("tenant_id", tenantId)
    .eq("zone", "footer")
    .order("sort_order", { ascending: true })
    .limit(8);

  const social = [];
  if (id.social_instagram) social.push({ platform: "instagram", href: id.social_instagram });
  if (id.social_tiktok) social.push({ platform: "tiktok", href: id.social_tiktok });
  if (id.social_facebook) social.push({ platform: "facebook", href: id.social_facebook });
  if (id.social_linkedin) social.push({ platform: "linkedin", href: id.social_linkedin });
  if (id.social_youtube) social.push({ platform: "youtube", href: id.social_youtube });
  if (id.social_x) social.push({ platform: "twitter", href: id.social_x });

  const headerProps = {
    brand: { label: brandLabel, href: "/" },
    navItems: (headerNavRows || []).slice(0, 8).map((n) => ({ label: n.label, href: n.href })),
    primaryCta:
      id.primary_cta_label && id.primary_cta_href
        ? { label: id.primary_cta_label, href: id.primary_cta_href }
        : undefined,
    sticky: true,
    tone: "surface",
    variant: "standard",
    authArea: { showAccountMenu: true, showLanguageToggle: true, showDiscoveryTools: true },
  };

  const footerProps = {
    brand: { label: brandLabel, tagline: tagline || undefined },
    columns: (footerNavRows || []).length > 0
      ? [{
          heading: "Site",
          links: (footerNavRows || []).slice(0, 8).map((n) => ({ label: n.label, href: n.href })),
        }]
      : [],
    social,
    legal: {
      copyright: `© ${year} ${brandLabel}. All rights reserved.`,
      links: [],
    },
    variant: "standard",
    tone: "follow",
  };

  // 3. Create section rows (we use direct DB inserts; section auditing trail
  //    is shorter than the production upsertSection path, but the rows are
  //    schema-equivalent. The first edit through the EditShell will create
  //    a proper draft pair via the standard path.)
  const nowIso = new Date().toISOString();

  const headerInsert = await supabase
    .from("cms_sections")
    .insert({
      tenant_id: tenantId,
      section_type_key: "site_header",
      schema_version: 1,
      name: `${brandLabel} — site header`,
      status: "published",
      props_jsonb: headerProps,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (headerInsert.error || !headerInsert.data) {
    console.error("header insert failed:", headerInsert.error?.message);
    process.exit(1);
  }
  const footerInsert = await supabase
    .from("cms_sections")
    .insert({
      tenant_id: tenantId,
      section_type_key: "site_footer",
      schema_version: 1,
      name: `${brandLabel} — site footer`,
      status: "published",
      props_jsonb: footerProps,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (footerInsert.error || !footerInsert.data) {
    console.error("footer insert failed:", footerInsert.error?.message);
    process.exit(1);
  }

  // 4. Create the shell row
  const shellInsert = await supabase
    .from("cms_pages")
    .insert({
      tenant_id: tenantId,
      locale,
      slug: RESERVED_SHELL_SLUG,
      template_key: "page",
      template_schema_version: 1,
      system_template_key: "site_shell",
      is_system_owned: true,
      title: `${brandLabel} site shell`,
      status: "draft",
      version: 1,
    })
    .select("id, version")
    .single();
  if (shellInsert.error || !shellInsert.data) {
    console.error("shell row insert failed:", shellInsert.error?.message);
    process.exit(1);
  }
  const shellPageId = shellInsert.data.id;

  // 5. Insert page-section pointers (live + draft both)
  for (const isDraft of [true, false]) {
    const rowsErr = await supabase.from("cms_page_sections").insert([
      {
        tenant_id: tenantId,
        page_id: shellPageId,
        section_id: headerInsert.data.id,
        slot_key: "header",
        sort_order: 0,
        is_draft: isDraft,
      },
      {
        tenant_id: tenantId,
        page_id: shellPageId,
        section_id: footerInsert.data.id,
        slot_key: "footer",
        sort_order: 0,
        is_draft: isDraft,
      },
    ]);
    if (rowsErr.error) {
      console.error(`page_sections insert (is_draft=${isDraft}) failed:`, rowsErr.error.message);
      process.exit(1);
    }
  }

  // 6. Bake snapshot + flip page to published
  const snapshot = {
    version: 1,
    publishedAt: nowIso,
    pageVersion: 2,
    locale,
    fields: {
      title: `${brandLabel} site shell`,
      metaDescription: null,
      introTagline: null,
    },
    templateSchemaVersion: 1,
    slots: [
      {
        slotKey: "header",
        sortOrder: 0,
        sectionId: headerInsert.data.id,
        sectionTypeKey: "site_header",
        schemaVersion: 1,
        name: `${brandLabel} — site header`,
        props: headerProps,
      },
      {
        slotKey: "footer",
        sortOrder: 0,
        sectionId: footerInsert.data.id,
        sectionTypeKey: "site_footer",
        schemaVersion: 1,
        name: `${brandLabel} — site footer`,
        props: footerProps,
      },
    ],
  };

  const pubResult = await supabase
    .from("cms_pages")
    .update({
      status: "published",
      published_at: nowIso,
      published_page_snapshot: snapshot,
      version: 2,
    })
    .eq("id", shellPageId)
    .eq("tenant_id", tenantId)
    .eq("version", 1);
  if (pubResult.error) {
    console.error("shell publish failed:", pubResult.error.message);
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    action: "created",
    tenantId,
    locale,
    shellPageId,
    headerSectionId: headerInsert.data.id,
    footerSectionId: footerInsert.data.id,
    brandLabel,
    headerNavItems: headerProps.navItems.length,
    footerColumns: footerProps.columns.length,
    socialLinks: social.length,
    published: true,
  }, null, 2));
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
