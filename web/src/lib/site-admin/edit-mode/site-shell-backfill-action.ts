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
 * Idempotency + the archived-row case (QA shell tenant work, 2026-08-16):
 *   - No existing row              → CREATE a fresh row + sections (unchanged).
 *   - Existing row, status=published → no-op, returns the existing row info.
 *   - Existing row, status!=published (e.g. `archived`, left behind by a prior
 *     attempt that couldn't hard-delete a system-owned row — see the
 *     `is_system_owned` guard in cms delete paths) → REPAIR. The `cms_pages`
 *     row itself survives archival, but its `cms_sections` / `cms_page_sections`
 *     children can be gone (archival in this codebase deletes the children,
 *     not the parent). Repair rebuilds header/footer section rows — sourced
 *     from the row's own `published_page_snapshot` when it still has slots
 *     (preserves whatever content was live, incl. manual edits), falling back
 *     to a fresh identity/nav read when the snapshot is empty/missing — and
 *     republishes the SAME page id. This is the supported "un-archive" path;
 *     it never inserts a second row for the tenant+locale.
 *
 * Dry run: pass `{ dryRun: true }` to preview what a call would do (no writes)
 * — the identity/nav reads still happen (read-only), everything from section
 * creation onward is skipped.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import {
  getSectionType,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import { upsertSection } from "@/lib/site-admin/server/sections";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { buildLegacySectionBuilderTree } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import { enrichShellBuilderTree } from "@/lib/site-admin/builder-node/shell-builder-tree";
import { revalidateTag } from "next/cache";
import { tagFor } from "@/lib/site-admin/cache-tags";

export type ShellBackfillAction = "created" | "already_existed" | "repaired";

export type ShellBackfillResult =
  | {
      ok: true;
      dryRun?: false;
      shellPageId: string;
      headerSectionId: string;
      footerSectionId: string;
      published: boolean;
      action: ShellBackfillAction;
    }
  | {
      ok: true;
      dryRun: true;
      /** What a real (non-dry-run) call would do. */
      wouldAction: ShellBackfillAction | "noop_already_published";
      tenantId: string;
      existingPageId: string | null;
      existingStatus: string | null;
      brandLabel: string;
      headerNavItemCount: number;
      footerNavColumnLinkCount: number;
      socialLinkCount: number;
      /** true when a repair would source props from the existing published
       *  snapshot rather than re-reading identity/nav tables. */
      sourcedFromExistingSnapshot: boolean;
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

interface ShellPropsBundle {
  brandLabel: string;
  headerProps: Record<string, unknown>;
  footerProps: Record<string, unknown>;
  headerNavItemCount: number;
  footerNavColumnLinkCount: number;
  socialLinkCount: number;
}

export async function backfillSiteShellForCurrentTenant(
  opts: { dryRun?: boolean } = {},
): Promise<ShellBackfillResult> {
  const dryRun = opts.dryRun === true;
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }

  // ── 1. Idempotency check ─────────────────────────────────────────────
  const { data: existing } = await admin
    .from("cms_pages")
    .select("id, status, published_at, version, published_page_snapshot")
    .eq("tenant_id", scope.tenantId)
    .eq("locale", DEFAULT_PLATFORM_LOCALE)
    .eq("system_template_key", "site_shell")
    .maybeSingle<{
      id: string;
      status: string;
      published_at: string | null;
      version: number;
      published_page_snapshot: HomepageSnapshot | null;
    }>();

  if (existing && existing.status === "published") {
    if (dryRun) {
      const bundlePreview = buildPropsFromSnapshot(existing.published_page_snapshot);
      return {
        ok: true,
        dryRun: true,
        wouldAction: "noop_already_published",
        tenantId: scope.tenantId,
        existingPageId: existing.id,
        existingStatus: existing.status,
        brandLabel: bundlePreview?.brandLabel ?? "(unchanged)",
        headerNavItemCount: bundlePreview?.headerNavItemCount ?? 0,
        footerNavColumnLinkCount: bundlePreview?.footerNavColumnLinkCount ?? 0,
        socialLinkCount: bundlePreview?.socialLinkCount ?? 0,
        sourcedFromExistingSnapshot: bundlePreview !== null,
      };
    }
    return {
      ok: true,
      shellPageId: existing.id,
      headerSectionId: "",
      footerSectionId: "",
      published: true,
      action: "already_existed",
    };
  }

  // ── 2. Compose header/footer props ───────────────────────────────────
  // Repair (existing non-published row): prefer the row's own snapshot so a
  // manually-edited shell isn't silently replaced by fresh identity data.
  // Fresh create OR a repair whose snapshot is empty: read real tenant data.
  const snapshotBundle = existing
    ? buildPropsFromSnapshot(existing.published_page_snapshot)
    : null;
  const bundle = snapshotBundle ?? (await computeShellPropsFromTenantData(admin, scope.tenantId));

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      wouldAction: existing ? "repaired" : "created",
      tenantId: scope.tenantId,
      existingPageId: existing?.id ?? null,
      existingStatus: existing?.status ?? null,
      brandLabel: bundle.brandLabel,
      headerNavItemCount: bundle.headerNavItemCount,
      footerNavColumnLinkCount: bundle.footerNavColumnLinkCount,
      socialLinkCount: bundle.socialLinkCount,
      sourcedFromExistingSnapshot: snapshotBundle !== null,
    };
  }

  // ── 3. Create the section rows ───────────────────────────────────────
  const headerReg = getSectionType("site_header");
  const footerReg = getSectionType("site_footer");
  if (!headerReg || !footerReg) {
    return { ok: false, error: "Shell section types missing from registry — should never happen." };
  }

  const { brandLabel, headerProps, footerProps } = bundle;

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

  const nowIso = new Date().toISOString();
  let shellPageId: string;
  let shellPageVersion: number;

  if (existing) {
    // ── 4a. REPAIR — reuse the existing page row (same id, same locale) ──
    // Never insert a second row for this tenant+locale; the archived row is
    // the one and only shell row and stays that way.
    shellPageId = existing.id;
    shellPageVersion = existing.version;

    // The archived row's section children may already be gone (archival in
    // this codebase deletes cms_sections/cms_page_sections rows because the
    // is_system_owned guard blocks deleting the cms_pages row itself) —
    // clear out any stragglers before inserting fresh pointers so a partial
    // prior repair can't leave duplicate slot rows.
    await admin
      .from("cms_page_sections")
      .delete()
      .eq("tenant_id", scope.tenantId)
      .eq("page_id", shellPageId);
  } else {
    // ── 4b. CREATE — brand-new shell row ─────────────────────────────────
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
    shellPageId = shellPage.id as string;
    shellPageVersion = shellPage.version as number;
  }

  // Insert draft section rows.
  const { error: rowsErr } = await admin.from("cms_page_sections").insert([
    {
      tenant_id: scope.tenantId,
      page_id: shellPageId,
      section_id: headerRes.data.id,
      slot_key: "header",
      sort_order: 0,
      is_draft: true,
    },
    {
      tenant_id: scope.tenantId,
      page_id: shellPageId,
      section_id: footerRes.data.id,
      slot_key: "footer",
      sort_order: 0,
      is_draft: true,
    },
  ]);
  if (rowsErr) {
    return { ok: false, error: `couldn't insert shell section rows: ${rowsErr.message}` };
  }

  // ── 5. Publish the shell row immediately so the snapshot exists ──────
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
    pageVersion: shellPageVersion + 1,
    locale: DEFAULT_PLATFORM_LOCALE,
    fields: {
      title: `${brandLabel} site shell`,
      metaDescription: null,
      introTagline: null,
    },
    templateSchemaVersion: 1,
    slots: snapshotSlots,
    // WS-A A8 — enrich the seeded builderTree so the new shell surface opens
    // against the tenant's REAL content: a `nav` node from the header nav items,
    // a `social_links` node from the footer social array, brand logo image, and
    // footer column nav — appended to the role-bound brand/CTA/tagline children
    // the base derivation already produces. Seed-path only (never read-time).
    builderTree: enrichShellBuilderTree(
      buildLegacySectionBuilderTree(snapshotSlots),
      { header: headerProps, footer: footerProps },
    ),
  };

  const { error: pubErr } = await admin
    .from("cms_pages")
    .update({
      status: "published",
      published_at: nowIso,
      published_page_snapshot: snapshot,
      version: shellPageVersion + 1,
      updated_by: auth.user.id,
    })
    .eq("id", shellPageId)
    .eq("tenant_id", scope.tenantId)
    .eq("version", shellPageVersion);
  if (pubErr) {
    return { ok: false, error: `couldn't publish shell snapshot: ${pubErr.message}` };
  }

  // Flip draft rows to live.
  await admin
    .from("cms_page_sections")
    .update({ is_draft: false })
    .eq("tenant_id", scope.tenantId)
    .eq("page_id", shellPageId);

  // Cache-bust public reads — match homepage publish + composition-actions
  // after `republishSiteShellSnapshot` (`pages-all` + `storefront`; see
  // phase-b-site-shell.md C2). Without `storefront`, tenant routes that
  // embed the shell can serve stale headers/footers after a seed publish.
  try {
    revalidateTag(tagFor(scope.tenantId, "pages-all"), "default");
    revalidateTag(tagFor(scope.tenantId, "storefront"), "default");
  } catch {
    // tag system may not be initialised in test contexts.
  }

  return {
    ok: true,
    shellPageId,
    headerSectionId: headerRes.data.id,
    footerSectionId: footerRes.data.id,
    published: true,
    action: existing ? "repaired" : "created",
  };
}

// ── helpers ─────────────────────────────────────────────────────────────

async function computeShellPropsFromTenantData(
  admin: ReturnType<typeof createServiceRoleClient> & {},
  tenantId: string,
): Promise<ShellPropsBundle> {
  const identity = await readIdentityFacts(admin, tenantId);
  const headerNav = await readNavLinks(admin, tenantId, "header");
  const footerNav = await readNavLinks(admin, tenantId, "footer");

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
    columns:
      footerNav.length > 0
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

  return {
    brandLabel,
    headerProps,
    footerProps,
    headerNavItemCount: headerProps.navItems.length,
    footerNavColumnLinkCount: footerProps.columns.reduce(
      (n, c) => n + c.links.length,
      0,
    ),
    socialLinkCount: social.length,
  };
}

/**
 * Repair path: rebuild header/footer props from an existing row's own
 * published snapshot so re-running the backfill against an archived row
 * doesn't clobber content that was manually edited after the original seed.
 * Returns null when the snapshot is missing/empty (caller falls back to a
 * fresh identity/nav read).
 */
function buildPropsFromSnapshot(
  snapshot: HomepageSnapshot | null,
): ShellPropsBundle | null {
  if (!snapshot || !Array.isArray(snapshot.slots) || snapshot.slots.length === 0) {
    return null;
  }
  const headerSlot = snapshot.slots.find((s) => s.slotKey === "header");
  const footerSlot = snapshot.slots.find((s) => s.slotKey === "footer");
  if (!headerSlot || !footerSlot) return null;

  const headerProps = headerSlot.props as Record<string, unknown>;
  const footerProps = footerSlot.props as Record<string, unknown>;
  const brand = headerProps.brand as { label?: string } | undefined;
  const brandLabel = brand?.label?.trim() || "Studio";
  const navItems = Array.isArray(headerProps.navItems) ? headerProps.navItems : [];
  const columns = Array.isArray(footerProps.columns) ? footerProps.columns : [];
  const social = Array.isArray(footerProps.social) ? footerProps.social : [];
  const columnLinkCount = columns.reduce(
    (n: number, c: { links?: unknown[] }) => n + (Array.isArray(c.links) ? c.links.length : 0),
    0,
  );

  return {
    brandLabel,
    headerProps,
    footerProps,
    headerNavItemCount: navItems.length,
    footerNavColumnLinkCount: columnLinkCount,
    socialLinkCount: social.length,
  };
}

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
