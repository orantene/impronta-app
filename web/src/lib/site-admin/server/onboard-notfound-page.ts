/**
 * DEFAULT PAGES CONTRACT — the `notFound` (404) system page.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A storefront is a public surface, and every public surface eventually gets a
 * bad URL: a typo, a stale link from an old campaign, a page the operator
 * renamed. Until now a brand-new workspace had NO `notFound` role assigned, so
 * that request fell all the way through to the platform's generic boundary. The
 * boundary is decent (see `src/app/not-found.tsx` — it already renders a
 * branded card when the host resolves to an agency), but it is not the
 * operator's page: it cannot be edited, restyled, or given the workspace's own
 * words. Seeding a real, editable `404` page at signup means the operator OWNS
 * the dead-end from minute one and can improve it in the builder like any other
 * page.
 *
 * WHY IT IS SAFE TO SEED (unlike a contact page)
 * ──────────────────────────────────────────────
 * A 404 page is never linked, never in the nav, never in the sitemap, and never
 * indexed. It is invisible until something breaks. That is the opposite of a
 * placeholder contact page, which would be published, linked, and empty from
 * minute one — which is why the contact page is deliberately NOT seeded (see
 * the module note in `onboard-starter-content.ts`).
 *
 * SLUG
 * ────
 * `404`. `not-found` is a PLATFORM-RESERVED slug (`reserved-routes.ts`), and
 * the fenced `__…__` grammar used by the shell/directory system pages is
 * explicitly rejected as a role target by `page-roles-shape.cleanSlug` — a role
 * must point at a real, addressable slug. `404` is neither reserved nor fenced.
 *
 * ROLE, NOT HARD-CODING
 * ─────────────────────
 * The page is wired up by assigning it the `notFound` ROLE
 * (`agencies.settings.pageRoles.notFound`). Operators can therefore point the
 * role at a different page later and delete this one — the deletion guard
 * (`page-deletion-guard.ts`) only blocks removing the LAST holder of the role.
 *
 * Idempotent, non-fatal, and safe to re-run as a backfill.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { logServerError } from "@/lib/server/safe-error";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { revalidateTag } from "next/cache";

import { readTenantPageRoles, writeTenantPageRole } from "./page-roles";

/** The slug the seeded 404 page lives at. Not reserved, not fenced. */
export const NOT_FOUND_PAGE_SLUG = "404";

const BODY_FONT = '"Inter", var(--font-inter-body), system-ui, sans-serif';

/**
 * The seeded 404 body.
 *
 * Deliberately colourless apart from a muted eyebrow: the storefront shell
 * supplies the tenant's theme, so leaving `textColor` unset lets the page
 * inherit the workspace's own palette instead of hard-coding a look that fights
 * a dark or light brand. Spanish copy rides along as a per-node `i18n` overlay
 * (the ONE-DESIGN-PER-PAGE locale model), so an ES visitor gets Spanish without
 * a second page row.
 */
export function buildNotFoundPageTree(): BuilderNodeTree {
  return [
    {
      id: "notfound-page",
      kind: "container",
      props: {
        layerLabel: "Page not found",
        layout: "stack",
        align: "center",
        style: {
          width: "100%",
          maxWidthFree: "100%",
          minHeight: "480px",
          paddingTop: "120px",
          paddingRight: "24px",
          paddingBottom: "140px",
          paddingLeft: "24px",
          gap: "14px",
          justifyContent: "center",
          fontFamily: BODY_FONT,
          responsive: {
            mobile: { paddingTop: "80px", paddingBottom: "96px", minHeight: "360px" },
          },
        },
      },
      children: [
        {
          id: "notfound-eyebrow",
          kind: "paragraph",
          props: {
            text: "404",
            layerLabel: "Eyebrow",
            style: {
              align: "center",
              fontFamily: BODY_FONT,
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              opacity: 0.45,
              marginBottomFree: "0px",
            },
          },
        },
        {
          id: "notfound-heading",
          kind: "heading",
          props: {
            text: "This page isn't here",
            level: 1,
            layerLabel: "Heading",
            style: {
              align: "center",
              fontSize: "40px",
              lineHeight: "1.1",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              maxWidthFree: "680px",
              textWrap: "balance",
              marginBottomFree: "0px",
              responsive: { mobile: { fontSize: "28px" } },
            },
          },
          i18n: { es: { text: "Esta página no está aquí" } },
        },
        {
          id: "notfound-body",
          kind: "paragraph",
          props: {
            text: "The link may be out of date, or the page may have moved. Head back to the homepage to pick up where you left off.",
            layerLabel: "Body",
            style: {
              align: "center",
              fontFamily: BODY_FONT,
              fontSize: "16px",
              lineHeight: "1.6",
              opacity: 0.72,
              maxWidthFree: "520px",
            },
          },
          i18n: {
            es: {
              text: "Puede que el enlace ya no sea válido o que la página se haya movido. Vuelve al inicio para continuar desde allí.",
            },
          },
        },
        {
          id: "notfound-actions",
          kind: "cta_group",
          props: {
            layerLabel: "Actions",
            layout: "row",
            gap: "m",
            align: "center",
            style: {
              marginTopFree: "10px",
              flexWrap: "wrap",
              justifyContent: "center",
            },
          },
          children: [
            {
              id: "notfound-cta-home",
              kind: "button",
              props: {
                label: "Back to homepage",
                // "/" is the ONLY link this page can safely carry. Every other
                // storefront path (directory, posts, contact) is conditional on
                // content the workspace may not have yet, and a 404 page that
                // links to another 404 is worse than no link at all.
                href: "/",
                tone: "primary",
                layerLabel: "Back to homepage",
                style: {
                  fontFamily: BODY_FONT,
                  fontSize: "14px",
                  fontWeight: 600,
                },
              },
              i18n: { es: { label: "Volver al inicio" } },
            },
          ],
        },
      ],
    },
  ];
}

export type EnsureNotFoundPageResult =
  | { ok: true; pageId: string; slug: string; action: "created" | "already_existed" }
  | { ok: false; error: string };

/**
 * Idempotently seed + publish the tenant's 404 page and assign it the
 * `notFound` role.
 *
 * Short-circuits when the tenant already holds a `notFound` role pointer, and
 * again when a page already occupies {@link NOT_FOUND_PAGE_SLUG} (in which case
 * it only repairs the role pointer). Never throws: the caller treats a failure
 * as non-fatal, because a workspace with a live homepage and no custom 404 still
 * falls back to the platform-branded boundary.
 */
export async function ensureNotFoundPage(args: {
  admin: SupabaseClient;
  tenantId: string;
  actorProfileId: string;
  locale?: string;
}): Promise<EnsureNotFoundPageResult> {
  const { admin, tenantId, actorProfileId } = args;
  const locale = args.locale ?? DEFAULT_PLATFORM_LOCALE;

  try {
    const roles = await readTenantPageRoles(admin, tenantId);
    if (roles.notFound) {
      return {
        ok: true,
        pageId: "",
        slug: roles.notFound,
        action: "already_existed",
      };
    }

    const { data: existing } = await admin
      .from("cms_pages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("locale", locale)
      .eq("slug", NOT_FOUND_PAGE_SLUG)
      .maybeSingle<{ id: string }>();

    let pageId = existing?.id ?? null;
    let action: "created" | "already_existed" = "already_existed";

    if (!pageId) {
      const nowIso = new Date().toISOString();
      const { data: page, error: pageErr } = await admin
        .from("cms_pages")
        .insert({
          tenant_id: tenantId,
          locale,
          slug: NOT_FOUND_PAGE_SLUG,
          template_key: "standard_page",
          template_schema_version: 1,
          title: "Page not found",
          // FREEFORM: `blocks` IS the live body for a freeform page (there is
          // no draft layer), so writing the tree and flipping status to
          // published in one INSERT publishes it.
          is_freeform: true,
          blocks: buildNotFoundPageTree(),
          status: "published",
          published_at: nowIso,
          // A 404 must never be indexed and must never appear in the sitemap:
          // it is a boundary, not a destination.
          noindex: true,
          include_in_sitemap: false,
          // NOT system-owned on purpose. `is_system_owned` makes the row
          // immutable to the operator; this page is meant to be edited. The
          // protection it needs — "you cannot delete the last 404" — is the
          // role deletion guard, not immutability.
          is_system_owned: false,
          version: 1,
          created_by: actorProfileId,
          updated_by: actorProfileId,
        })
        .select("id")
        .single<{ id: string }>();

      if (pageErr || !page) {
        return {
          ok: false,
          error: `couldn't create the 404 page row: ${pageErr?.message ?? "unknown"}`,
        };
      }
      pageId = page.id;
      action = "created";
    }

    const roleWrite = await writeTenantPageRole(
      admin,
      tenantId,
      "notFound",
      NOT_FOUND_PAGE_SLUG,
    );
    if (!roleWrite.ok) {
      return { ok: false, error: roleWrite.error };
    }

    try {
      revalidateTag(tagFor(tenantId, "pages-all"), "default");
    } catch {
      // Tag system is not initialised in test/seed contexts.
    }

    return { ok: true, pageId, slug: NOT_FOUND_PAGE_SLUG, action };
  } catch (error) {
    logServerError("onboardStarterContent.ensureNotFoundPage", error);
    return { ok: false, error: "NOT_FOUND_PAGE_SEED_FAILED" };
  }
}
