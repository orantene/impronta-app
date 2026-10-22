/**
 * Reads for business service pages and their sitemap (TUL-1272 #5).
 *
 * Rows: the workspace's OWN offerings (house rows + the owner's provider rows,
 * `workspace-offering-scope.ts`), published + approved, services and packages.
 * The page also shows on_request rows (no price, D-10a); the sitemap lists only
 * guest-sellable (public) rows. Every read handles `{ data, error }` and degrades
 * to "no page" / "no entries", never a throw.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { resolveEffectiveWorkspacePlanKey } from "@/lib/billing/effective-workspace-plan";
import { loadNonMenuOfferingIds } from "@/lib/offerings/non-menu-offerings";
import { isSellable, scopeToSellableOfferings } from "@/lib/offerings/sellable";
import { fetchOwnerTalentIds, isWorkspaceOfferingRow, workspaceOfferingOrFilter } from "@/lib/offerings/workspace-offering-scope";
import { servicePresentationResolverEnabled } from "@/lib/services/presentation/flag";
import { rowToOffering, type TalentOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";

import { businessServicePagesAllowed } from "./page-model";
import { parseBusinessServiceSlug } from "./paths";

type Db = Pick<SupabaseClient, "from">;

const PAGE_KINDS = ["service", "package"] as const;
/** PostgREST row cap per request; reads page through it so nothing is silently dropped. */
const PAGE = 1000;
/** Hard stop against a runaway loop (10k services per workspace). */
const MAX_PAGES = 10;

export type BusinessServiceRow = TalentOfferingRow;

/**
 * Pure: the row a slug's id8 points at, among rows guests may see on THIS business's pages.
 * The workspace's own rows: house rows (owner_kind = 'workspace') plus the active OWNER's provider
 * rows (onboarding writes those for a solo business owner; the business menu already shows them, so
 * their page must exist or the service 404s, staging QA 2026-10-22). A roster talent's row never
 * gets a business page (TUL-1325). Non-menu rows (event-backing packages, the reservation item)
 * never get a page (TUL-1322).
 */
export function pickBusinessServiceRow(
  rows: readonly BusinessServiceRow[],
  slug: string,
  tenantId: string,
  nonMenuIds: ReadonlySet<string>,
  ownerTalentIds: ReadonlySet<string> = new Set(),
): BusinessServiceRow | null {
  const id8 = parseBusinessServiceSlug(slug);
  if (!id8) return null;
  const eligible = rows
    .filter((r) => isWorkspaceOfferingRow(r, tenantId, ownerTalentIds))
    .filter((r) => !nonMenuIds.has(String(r.id)))
    .filter((r) => isSellable(r, "guest_request"))
    .filter((r) => (PAGE_KINDS as readonly string[]).includes(r.kind as string))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return eligible.find((r) => String(r.id).replace(/-/g, "").toLowerCase().startsWith(id8)) ?? null;
}

/** Plan gate for one workspace: the flag, then the effective plan tier. */
export async function businessServicePagesOn(db: Db, tenantId: string, flagOn = servicePresentationResolverEnabled()): Promise<boolean> {
  if (!flagOn || !tenantId) return false;
  const { data, error } = await db.from("agencies").select("plan_tier").eq("id", tenantId).maybeSingle();
  if (error) {
    logServerError("business-service-pages/plan", error);
    return false;
  }
  const stored = (data as { plan_tier?: string | null } | null)?.plan_tier ?? null;
  const effective = stored ? await resolveEffectiveWorkspacePlanKey(db, tenantId, stored) : null;
  return businessServicePagesAllowed({ flagOn, planTier: effective });
}

/**
 * Published + approved HOUSE services and packages (owner_kind = 'workspace'; public and on_request),
 * sort_order then id, every page, minus non-menu rows (event-backing packages incl. draft events,
 * the reservation item). A failed non-menu read fails CLOSED (null: no page, no sitemap entry).
 */
export async function loadBusinessServiceRows(
  db: Db,
  tenantId: string,
  opts: { publicOnly?: boolean; nonMenuIds?: ReadonlySet<string> } = {},
): Promise<{ rows: BusinessServiceRow[]; nonMenuIds: ReadonlySet<string>; ownerTalentIds: ReadonlySet<string> } | null> {
  try {
    let nonMenuIds = opts.nonMenuIds;
    if (!nonMenuIds) {
      const nonMenu = await loadNonMenuOfferingIds(db, tenantId);
      if (nonMenu.error) {
        logServerError("business-service-pages/non-menu", nonMenu.error);
        return null;
      }
      nonMenuIds = nonMenu.ids;
    }
    const ownerTalentIds = await fetchOwnerTalentIds(db, tenantId);
    const rows: BusinessServiceRow[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE;
      const { data, error } = await scopeToSellableOfferings(
        db.from("talent_offerings").select("*").eq("tenant_id", tenantId).or(workspaceOfferingOrFilter(ownerTalentIds)),
        opts.publicOnly ? "guest" : "guest_request",
      )
        .in("kind", [...PAGE_KINDS])
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        logServerError("business-service-pages/rows", error);
        return null;
      }
      const batch = (data ?? []) as BusinessServiceRow[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    const excluded = nonMenuIds;
    return { rows: rows.filter((r) => !excluded.has(String(r.id))), nonMenuIds: excluded, ownerTalentIds };
  } catch (error) {
    logServerError("business-service-pages/rows", error);
    return null;
  }
}

export type BusinessServicePageLoad =
  | { status: "off" }
  | { status: "missing" }
  | {
      status: "ok";
      offering: TalentOffering;
      /** The PRIMARY-language title (the row's base `title`): the slug, its 308s, canonical, hreflang and the sitemap all use it (TUL-1323). */
      slugTitle: string;
    };

/** The page's one read path: gate, rows, the slug's row, its photos. */
export async function loadBusinessServicePage(input: {
  db: Db;
  tenantId: string;
  slug: string;
  locale: string;
  loadImages: (ids: string[]) => Promise<Map<string, string[]>>;
  flagOn?: boolean;
}): Promise<BusinessServicePageLoad> {
  if (!(await businessServicePagesOn(input.db, input.tenantId, input.flagOn))) return { status: "off" };
  const loaded = await loadBusinessServiceRows(input.db, input.tenantId);
  if (!loaded) return { status: "missing" };
  const row = pickBusinessServiceRow(loaded.rows, input.slug, input.tenantId, loaded.nonMenuIds, loaded.ownerTalentIds);
  if (!row) return { status: "missing" };
  const images = await input.loadImages([String(row.id)]).catch(() => new Map<string, string[]>());
  return {
    status: "ok",
    offering: rowToOffering(row, input.locale, images.get(String(row.id)) ?? []),
    slugTitle: String(row.title ?? ""),
  };
}
