/**
 * Per-test seeded baseline for the builder e2e suite (plan row 5.3).
 *
 * WHY THIS EXISTS
 * ---------------
 * `builder-smoke.spec.ts` used to boot ONE editor page in `beforeAll`, run its
 * steps in Playwright `serial` mode, and rely on a UI-driven "self-heal" pass
 * (strip stray layers, undo leftover markers) to guess its way back to a clean
 * draft. Three things followed from that:
 *
 *   1. Tests were ordered: step 4 could only delete a Hero because step 2 had
 *      inserted one, so nothing could run in isolation or in a different order.
 *   2. The "seeded baseline" was whatever the shared QA tenant happened to hold.
 *      Audited 2026-08-08 on `qa-agency-244988`, the homepage draft carried a
 *      leftover marker inside the heading text, a stray extra heading, and a
 *      SECOND top-level container that the self-heal label heuristic could not
 *      recognise as residue. Every "the seed is exactly one layer" assertion was
 *      running against a drifted tree.
 *   3. Any failure mid-flow left that residue behind for the next run, so a
 *      broken run made the following run flakier.
 *
 * The fix is to stop guessing: this module WRITES a checked-in canonical draft
 * (`BASELINE_TREE`) straight into Supabase with the service role before each
 * test. Every test then starts from a byte-identical draft with STABLE node ids,
 * so tests are independent, order-agnostic, and can anchor on an id instead of a
 * page-wide `.first()` query.
 *
 * HOW THE DRAFT IS STORED (verified against `homepage-reads.ts`)
 * -------------------------------------------------------------
 * The freeform draft tree is not a column: the editor reads
 * `cms_page_revisions.snapshot.builderTree` for the revision whose `version`
 * matches `cms_pages.version`. Restoring therefore means rewriting that one
 * revision's snapshot in place (or inserting it when it is missing), which is
 * why no version arithmetic and no reimplementation of the save path is needed.
 *
 * SAFETY
 * ------
 * Service-role writes are scoped to the QA fixture tenant `qa-agency-244988`
 * and its system homepage. The tenant slug is asserted against an allow-list, so
 * a mistyped env var can never point this at a real tenant.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** SAFE QA fixture tenants. Never add a real tenant (and never "impronta"). */
const ALLOWED_TENANT_SLUGS = ["qa-agency-244988"] as const;

export const QA_TENANT_SLUG = ALLOWED_TENANT_SLUGS[0];

/** Stable ids: the spec anchors on these instead of DOM order. */
export const BASELINE_ROOT_ID = "builder-container-e2e-baseline-root";
export const BASELINE_BAND_ID = "builder-container-e2e-baseline-band";
export const BASELINE_EYEBROW_ID = "builder-paragraph-e2e-baseline-eyebrow";
export const BASELINE_HEADING_ID = "builder-heading-e2e-baseline-heading";

/** The seeded heading copy. Deliberately marker-free. */
export const BASELINE_HEADING_TEXT =
  "A photograph should remember the room it was taken in.";

/** Exactly ONE top-level layer, as every "seeded baseline" assertion expects. */
export const BASELINE_TOP_LAYER_COUNT = 1;

/**
 * The canonical seeded draft. One top-level container holding one band
 * container with an eyebrow paragraph and the heading the inline-edit steps
 * type into. Kept visually presentable because scenario A publishes it.
 */
export const BASELINE_TREE: ReadonlyArray<Record<string, unknown>> = [
  {
    id: BASELINE_ROOT_ID,
    kind: "container",
    props: {
      layout: "stack",
      style: {
        gap: "0px",
        width: "100%",
        maxWidthFree: "100%",
        backgroundColor: "#f3efe7",
      },
    },
    children: [
      {
        id: BASELINE_BAND_ID,
        kind: "container",
        props: {
          align: "center",
          layout: "stack",
          style: {
            width: "100%",
            paddingTop: "120px",
            paddingLeft: "32px",
            paddingRight: "32px",
            paddingBottom: "120px",
            maxWidthFree: "100%",
            backgroundColor: "#191512",
          },
        },
        children: [
          {
            id: BASELINE_EYEBROW_ID,
            kind: "paragraph",
            props: {
              text: "On the work",
              style: {
                align: "center",
                fontSize: "12px",
                textColor: "#c6a98c",
                fontWeight: 700,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
              },
            },
          },
          {
            id: BASELINE_HEADING_ID,
            kind: "heading",
            props: {
              text: BASELINE_HEADING_TEXT,
              level: 2,
              style: {
                align: "center",
                fontSize: "58px",
                textWrap: "balance",
                textColor: "#f5efe6",
                lineHeight: "1.04",
                maxWidthFree: "900px",
                letterSpacing: "-0.01em",
                responsive: { mobile: { fontSize: "34px" } },
              },
            },
          },
        ],
      },
    ],
  },
];

export interface BuilderDraftBaseline {
  tenantId: string;
  pageId: string;
  /** `cms_pages.version` the restored revision is attached to. */
  version: number;
}

let cachedClient: SupabaseClient | null = null;

/**
 * Service-role client. Playwright's config loads `web/.env.local` into
 * `process.env` before workers import specs, so no shell exports are needed.
 */
function serviceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "builder e2e baseline needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (web/.env.local).",
    );
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

/** True when the baseline helper can talk to Supabase at all. */
export function canSeedBuilderBaseline(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

interface PageRow {
  id: string;
  tenant_id: string;
  locale: string;
  version: number;
  template_schema_version: number | null;
}

async function loadHomepage(
  supabase: SupabaseClient,
  tenantSlug: string,
): Promise<PageRow> {
  if (!(ALLOWED_TENANT_SLUGS as readonly string[]).includes(tenantSlug)) {
    throw new Error(
      `Refusing to seed a builder baseline on "${tenantSlug}": only the QA fixture tenants ${ALLOWED_TENANT_SLUGS.join(", ")} are allowed.`,
    );
  }
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("id, slug")
    .eq("slug", tenantSlug)
    .maybeSingle<{ id: string; slug: string }>();
  if (agencyError) throw new Error(`Could not load ${tenantSlug}: ${agencyError.message}`);
  if (!agency) throw new Error(`QA tenant ${tenantSlug} not found.`);

  const { data: pages, error: pageError } = await supabase
    .from("cms_pages")
    .select("id, tenant_id, locale, version, template_schema_version")
    .eq("tenant_id", agency.id)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage");
  if (pageError) throw new Error(`Could not load the QA homepage: ${pageError.message}`);
  const rows = (pages ?? []) as PageRow[];
  const page = rows.find((row) => row.locale === "en") ?? rows[0];
  if (!page) throw new Error(`QA tenant ${tenantSlug} has no system homepage row.`);
  return page;
}

/** Snapshot JSONB shape the editor reads back. Only the parts we rewrite. */
interface RevisionSnapshot extends Record<string, unknown> {
  kind?: string;
  builderTree?: unknown;
  composition?: unknown;
}

/**
 * Put the QA homepage draft back to {@link BASELINE_TREE}.
 *
 * Idempotent, and safe to call before every test: it rewrites the snapshot the
 * editor reads (the revision at the page's current version) rather than bumping
 * the version, so no save-path logic is duplicated here and no CAS is disturbed.
 * Draft slot rows are cleared too, because the baseline is a freeform tree and
 * a leftover draft slot would render alongside it.
 */
export async function resetBuilderDraftToBaseline(
  tenantSlug: string = QA_TENANT_SLUG,
): Promise<BuilderDraftBaseline> {
  const supabase = serviceClient();
  const page = await loadHomepage(supabase, tenantSlug);

  const { data: current, error: revError } = await supabase
    .from("cms_page_revisions")
    .select("id, snapshot")
    .eq("tenant_id", page.tenant_id)
    .eq("page_id", page.id)
    .eq("version", page.version)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; snapshot: RevisionSnapshot | null }>();
  if (revError) {
    throw new Error(`Could not read the QA draft revision: ${revError.message}`);
  }

  // Keep the page-field half of the snapshot (title, hero, meta) exactly as it
  // is; only the composition half is reset.
  const snapshot: RevisionSnapshot = {
    ...(current?.snapshot ?? { kind: "draft" }),
    kind: "draft",
    builderTree: BASELINE_TREE,
    composition: [],
  };

  if (current) {
    const { error } = await supabase
      .from("cms_page_revisions")
      .update({ snapshot })
      .eq("id", current.id)
      .eq("tenant_id", page.tenant_id);
    if (error) throw new Error(`Could not reset the QA draft: ${error.message}`);
  } else {
    const { error } = await supabase.from("cms_page_revisions").insert({
      tenant_id: page.tenant_id,
      page_id: page.id,
      kind: "draft",
      version: page.version,
      template_schema_version: page.template_schema_version ?? 1,
      snapshot,
    });
    if (error) {
      throw new Error(`Could not seed the QA draft revision: ${error.message}`);
    }
  }

  const { error: slotError } = await supabase
    .from("cms_page_sections")
    .delete()
    .eq("tenant_id", page.tenant_id)
    .eq("page_id", page.id)
    .eq("is_draft", true);
  if (slotError) {
    throw new Error(`Could not clear draft slots: ${slotError.message}`);
  }

  return { tenantId: page.tenant_id, pageId: page.id, version: page.version };
}

/** Read the draft tree back (used to assert a reset really landed). */
export async function readBuilderDraftTree(
  tenantSlug: string = QA_TENANT_SLUG,
): Promise<unknown> {
  const supabase = serviceClient();
  const page = await loadHomepage(supabase, tenantSlug);
  const { data } = await supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", page.tenant_id)
    .eq("page_id", page.id)
    .eq("version", page.version)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ snapshot: RevisionSnapshot | null }>();
  return data?.snapshot?.builderTree ?? null;
}
