"use server";

/**
 * Phase B.2.A — site shell backfill.
 *
 * Idempotently seeds + publishes a tenant's `site_shell` row (one per
 * locale) with PREMIUM defaults derived from real tenant data, NOT
 * placeholder content. Guardrail 4 of B.2: the seeded shell must feel
 * like a real implementation, not "fresh tenant" placeholder.
 *
 * Pulls:
 *   • `agency_business_identity.public_name`     → header brand label
 *   • `agency_business_identity.tagline`         → footer tagline
 *   • `agency_business_identity.footer_tagline`  → footer tagline override
 *   • `agency_business_identity.social_*`        → footer social links
 *   • `cms_navigation_links` (zone=header)       → header nav items
 *   • `cms_navigation_links` (zone=footer)       → footer column links
 *
 * Defaults `authArea` flags ALL true so the snapshot shell preserves
 * account menu / language toggle / discovery search out of the box —
 * no degraded UX (guardrail 5).
 *
 * Idempotency: re-running on a tenant that already has a shell row is
 * a no-op (returns the existing row info). To force a re-seed, archive
 * the existing shell row first.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import {
  getSectionType,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import { upsertSection } from "@/lib/site-admin/server/sections";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { revalidateTag } from "next/cache";
import { tagFor } from "@/lib/site-admin/cache-tags";

export type ShellBackfillResult =
  | {
      ok: true;
      shellPageId: string;
      headerSectionId: string;
      footerSectionId: string;
      published: boolean;
      action: "created" | "already_existed";
    }
  | { ok: false; error: string };

const RESERVED_SHELL_SLUG = "__site_shell__";

interface IdentityFacts {
  publicName: string | null;
  tagline: string | null;
  footerTagline: string | null;
  social: {
    instagram: string | null;
    tiktok: string | null;
    facebook: string | null;
    linkedin: string | null;
    youtube: string | null;
    x: string | null;
  };
  primaryCta: {
    label: string | null;
    href: string | null;
  };
}

interface NavRow {
  label: string;
  href: string;
  sort_order: number;
  zone: string;
}

export async function backfillSiteShellForCurrentTenant(): Promise<ShellBackfillResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  // ── 1. Idempotency check ─────────────────────────────────────────────
  const { data: existing } = await admin
    .from("cms_pages")
    .select("id, status, published_at")
    .eq("tenant_id", scope.tenantId)
    .eq("locale", DEFAULT_PLATFORM_LOCALE)
    .eq("system_template_key", "site_shell")
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      shellPageId: existing.id as string,
      headerSectionId: "",
      footerSectionId: "",
      published: existing.status === "published",
      action: "already_existed",
    };
  }

  // ── 2. Pull real tenant data for premium defaults ────────────────────
  const identity = await readIdentityFacts(admin, scope.tenantId);
  const headerNav = await readNavLinks(admin, scope.tenantId, "header");
  const footerNav = await readNavLinks(admin, scope.tenantId, "footer");

  // ── 3. Compose header + footer payloads ──────────────────────────────
  const brandLabel = identity.publicName?.trim() || "Studio";
  const headerProps = {
    brand: {
      label: brandLabel,
      href: "/",
    },
    navItems: headerNav.slice(0, 8).map((n) => ({
      label: n.label,
      href: n.href,
    })),
    primaryCta:
      identity.primaryCta.label && identity.primaryCta.href
        ? {
            label: identity.primaryCta.label,
            href: identity.primaryCta.href,
          }
        : undefined,
    sticky: true,
    tone: "surface" as const,
    variant: "standard" as const,
    authArea: {
      showAccountMenu: true,
      showLanguageToggle: true,
      showDiscoveryTools: true,
    },
  };

  const social = collectSocial(identity.social);
  const tagline = identity.footerTagline?.trim() || identity.tagline?.trim() || null;
  const year = new Date().getFullYear();
  const footerProps = {
    brand: {
      label: brandLabel,
      tagline: tagline ?? undefined,
    },
    columns: footerNav.length > 0
      ? [
          {
            heading: "Site",
            links: footerNav.slice(0, 8).map((n) => ({
              label: n.label,
              href: n.href,
            })),
          },
        ]
      : [],
    social,
    legal: {
      copyright: `© ${year} ${brandLabel}. All rights reserved.`,
      links: [],
    },
    variant: "standard" as const,
    tone: "follow" as const,
  };

  // ── 4. Create the section rows ───────────────────────────────────────
  const headerReg = getSectionType("site_header");
  const footerReg = getSectionType("site_footer");
  if (!headerReg || !footerReg) {
    return { ok: false, error: "Shell section types missing from registry — should never happen." };
  }

  const headerCreate = sectionUpsertSchema.safeParse({
    tenantId: scope.tenantId,
    sectionTypeKey: "site_header" as SectionTypeKey,
    schemaVersion: headerReg.currentVersion,
    props: headerProps,
    expectedVersion: 0 as const,
    name: `${brandLabel} — site header`,
  });
  if (!headerCreate.success) {
    return {
      ok: false,
      error: `header schema rejected the seed payload: ${headerCreate.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }
  const headerRes = await upsertSection(admin, {
    tenantId: scope.tenantId,
    values: headerCreate.data,
    actorProfileId: auth.user.id,
  });
  if (!headerRes.ok) {
    return { ok: false, error: `couldn't create header section: ${headerRes.message}` };
  }

  const footerCreate = sectionUpsertSchema.safeParse({
    tenantId: scope.tenantId,
    sectionTypeKey: "site_footer" as SectionTypeKey,
    schemaVersion: footerReg.currentVersion,
    props: footerProps,
    expectedVersion: 0 as const,
    name: `${brandLabel} — site footer`,
  });
  if (!footerCreate.success) {
    return {
      ok: false,
      error: `footer schema rejected the seed payload: ${footerCreate.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }
  const footerRes = await upsertSection(admin, {
    tenantId: scope.tenantId,
    values: footerCreate.data,
    actorProfileId: auth.user.id,
  });
  if (!footerRes.ok) {
    return { ok: false, error: `couldn't create footer section: ${footerRes.message}` };
  }

  // ── 5. Create the shell row + insert section pointers ────────────────
  const nowIso = new Date().toISOString();
  const { data: shellPage, error: shellErr } = await admin
    .from("cms_pages")
    .insert({
      tenant_id: scope.tenantId,
      locale: DEFAULT_PLATFORM_LOCALE,
      slug: RESERVED_SHELL_SLUG,
      template_key: "page",
      template_schema_version: 1,
      system_template_key: "site_shell",
      is_system_owned: true,
      title: `${brandLabel} site shell`,
      status: "draft",
      version: 1,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select("id, version")
    .single();
  if (shellErr || !shellPage) {
    return {
      ok: false,
      error: `couldn't create shell row: ${shellErr?.message ?? "unknown"}`,
    };
  }

  // Insert draft section rows.
  const { error: rowsErr } = await admin.from("cms_page_sections").insert([
    {
      tenant_id: scope.tenantId,
      page_id: shellPage.id,
      section_id: headerRes.data.id,
      slot_key: "header",
      sort_order: 0,
      is_draft: true,
    },
    {
      tenant_id: scope.tenantId,
      page_id: shellPage.id,
      section_id: footerRes.data.id,
      slot_key: "footer",
      sort_order: 0,
      is_draft: true,
    },
  ]);
  if (rowsErr) {
    return { ok: false, error: `couldn't insert shell section rows: ${rowsErr.message}` };
  }

  // ── 6. Publish the shell row immediately so the snapshot exists ──────
  // We hand-roll the publish (rather than reusing publishPageSnapshot from
  // page-composer-action.ts) because that helper rejects pages with
  // system_template_key='homepage' AND we need to support the new
  // 'site_shell' system key. Same shape as homepage publish: bake snapshot
  // + flip is_draft → live + bump version + bust cache.
  const snapshotSlots = [
    {
      slotKey: "header",
      sortOrder: 0,
      sectionId: headerRes.data.id,
      sectionTypeKey: "site_header",
      schemaVersion: headerReg.currentVersion,
      name: headerCreate.data.name,
      props: headerCreate.data.props,
    },
    {
      slotKey: "footer",
      sortOrder: 0,
      sectionId: footerRes.data.id,
      sectionTypeKey: "site_footer",
      schemaVersion: footerReg.currentVersion,
      name: footerCreate.data.name,
      props: footerCreate.data.props,
    },
  ];
  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: nowIso,
    pageVersion: 2,
    locale: DEFAULT_PLATFORM_LOCALE,
    fields: {
      title: `${brandLabel} site shell`,
      metaDescription: null,
      introTagline: null,
    },
    templateSchemaVersion: 1,
    slots: snapshotSlots,
  };

  const { error: pubErr } = await admin
    .from("cms_pages")
    .update({
      status: "published",
      published_at: nowIso,
      published_page_snapshot: snapshot,
      version: 2,
      updated_by: auth.user.id,
    })
    .eq("id", shellPage.id)
    .eq("tenant_id", scope.tenantId)
    .eq("version", 1);
  if (pubErr) {
    return { ok: false, error: `couldn't publish shell snapshot: ${pubErr.message}` };
  }

  // Flip draft rows to live.
  await admin
    .from("cms_page_sections")
    .update({ is_draft: false })
    .eq("tenant_id", scope.tenantId)
    .eq("page_id", shellPage.id);

  // Cache-bust public reads.
  try {
    revalidateTag(tagFor(scope.tenantId, "pages-all"), "default");
  } catch {
    // tag system may not be initialised in test contexts.
  }

  return {
    ok: true,
    shellPageId: shellPage.id,
    headerSectionId: headerRes.data.id,
    footerSectionId: footerRes.data.id,
    published: true,
    action: "created",
  };
}

// ── helpers ─────────────────────────────────────────────────────────────

async function readIdentityFacts(
  admin: ReturnType<typeof createServiceRoleClient> & {},
  tenantId: string,
): Promise<IdentityFacts> {
  const { data } = await admin
    .from("agency_business_identity")
    .select(
      "public_name, tagline, footer_tagline, social_instagram, social_tiktok, social_facebook, social_linkedin, social_youtube, social_x, primary_cta_label, primary_cta_href",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return {
    publicName: (data?.public_name as string | null) ?? null,
    tagline: (data?.tagline as string | null) ?? null,
    footerTagline: (data?.footer_tagline as string | null) ?? null,
    social: {
      instagram: (data?.social_instagram as string | null) ?? null,
      tiktok: (data?.social_tiktok as string | null) ?? null,
      facebook: (data?.social_facebook as string | null) ?? null,
      linkedin: (data?.social_linkedin as string | null) ?? null,
      youtube: (data?.social_youtube as string | null) ?? null,
      x: (data?.social_x as string | null) ?? null,
    },
    primaryCta: {
      label: (data?.primary_cta_label as string | null) ?? null,
      href: (data?.primary_cta_href as string | null) ?? null,
    },
  };
}

async function readNavLinks(
  admin: ReturnType<typeof createServiceRoleClient> & {},
  tenantId: string,
  zone: "header" | "footer",
): Promise<NavRow[]> {
  const { data } = await admin
    .from("cms_navigation_links")
    .select("label, href, sort_order, zone")
    .eq("tenant_id", tenantId)
    .eq("zone", zone)
    .order("sort_order", { ascending: true })
    .limit(8);
  return (data ?? []) as NavRow[];
}

function collectSocial(s: IdentityFacts["social"]): Array<{
  platform:
    | "instagram"
    | "twitter"
    | "tiktok"
    | "facebook"
    | "linkedin"
    | "youtube";
  href: string;
}> {
  const out: Array<{
    platform: "instagram" | "twitter" | "tiktok" | "facebook" | "linkedin" | "youtube";
    href: string;
  }> = [];
  if (s.instagram) out.push({ platform: "instagram", href: s.instagram });
  if (s.tiktok) out.push({ platform: "tiktok", href: s.tiktok });
  if (s.facebook) out.push({ platform: "facebook", href: s.facebook });
  if (s.linkedin) out.push({ platform: "linkedin", href: s.linkedin });
  if (s.youtube) out.push({ platform: "youtube", href: s.youtube });
  if (s.x) out.push({ platform: "twitter", href: s.x });
  return out;
}
