#!/usr/bin/env -S tsx

import { createClient } from "@supabase/supabase-js";

interface CliArgs {
  slug: string;
  apply: boolean;
  purgeClearedSections: boolean;
  draftOnly: boolean;
}

interface AgencyRow {
  id: string;
  slug: string;
}

interface HomepageRow {
  id: string;
  tenant_id: string;
  locale: string;
  title: string;
  status: "draft" | "published" | "archived";
  version: number;
  hero: Record<string, unknown> | null;
  meta_description: string | null;
  template_schema_version: number | null;
  published_at: string | null;
}

interface PageSectionRow {
  page_id: string;
  section_id: string;
  is_draft: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    slug: "impronta",
    apply: false,
    purgeClearedSections: false,
    draftOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--slug") {
      out.slug = argv[index + 1] ?? out.slug;
      index += 1;
      continue;
    }
    if (arg === "--apply") {
      out.apply = true;
      continue;
    }
    if (arg === "--purge-cleared-sections") {
      out.purgeClearedSections = true;
      continue;
    }
    if (arg === "--draft-only") {
      out.draftOnly = true;
      continue;
    }
  }
  return out;
}

function introTaglineFromHero(hero: Record<string, unknown> | null): string | null {
  if (!hero || typeof hero !== "object") return null;
  const value = hero.introTagline;
  return typeof value === "string" ? value : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("id, slug")
    .eq("slug", args.slug)
    .maybeSingle<AgencyRow>();
  if (agencyError) throw new Error(`Couldn't load tenant "${args.slug}": ${agencyError.message}`);
  if (!agency) throw new Error(`Tenant slug "${args.slug}" not found.`);

  const { data: homepages, error: homepageError } = await supabase
    .from("cms_pages")
    .select(
      "id, tenant_id, locale, title, status, version, hero, meta_description, template_schema_version, published_at",
    )
    .eq("tenant_id", agency.id)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .order("locale", { ascending: true });
  if (homepageError) {
    throw new Error(`Couldn't load homepage rows: ${homepageError.message}`);
  }

  const homepageRows = (homepages ?? []) as HomepageRow[];
  if (homepageRows.length === 0) {
    throw new Error(`No homepage rows found for tenant "${args.slug}".`);
  }

  const pageIds = homepageRows.map((row) => row.id);
  const { data: pageSections, error: pageSectionsError } = await supabase
    .from("cms_page_sections")
    .select("page_id, section_id, is_draft")
    .eq("tenant_id", agency.id)
    .in("page_id", pageIds);
  if (pageSectionsError) {
    throw new Error(`Couldn't load homepage section rows: ${pageSectionsError.message}`);
  }

  const sectionRows = (pageSections ?? []) as PageSectionRow[];
  const allReferencedSectionIds = Array.from(
    new Set(sectionRows.map((row) => row.section_id)),
  );
  const nowIso = new Date().toISOString();

  const summary = homepageRows.map((row) => {
    const draftCount = sectionRows.filter(
      (sectionRow) => sectionRow.page_id === row.id && sectionRow.is_draft,
    ).length;
    const liveCount = sectionRows.filter(
      (sectionRow) => sectionRow.page_id === row.id && !sectionRow.is_draft,
    ).length;
    return {
      pageId: row.id,
      locale: row.locale,
      status: row.status,
      version: row.version,
      draftCount,
      liveCount,
      nextSnapshot: {
        version: 1,
        publishedAt: row.published_at ?? nowIso,
        pageVersion: row.version + 1,
        locale: row.locale,
        fields: {
          title: row.title,
          metaDescription: row.meta_description ?? null,
          introTagline: introTaglineFromHero(row.hero),
        },
        templateSchemaVersion: row.template_schema_version ?? 1,
        slots: [],
        builderTree: [],
      },
    };
  });

  if (!args.apply) {
    const dryRunHomepages = args.draftOnly
      ? summary.map((row) => ({
          pageId: row.pageId,
          locale: row.locale,
          status: row.status,
          version: row.version,
          draftCount: row.draftCount,
          liveCount: row.liveCount,
          applyEffect: "delete draft cms_page_sections only; cms_pages and published snapshots unchanged",
        }))
      : summary;
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          resetMode: args.draftOnly ? "draft-only" : "empty-homepage",
          tenant: agency,
          purgeClearedSections: args.purgeClearedSections,
          purgeWillRun: args.purgeClearedSections && !args.draftOnly,
          referencedSectionCount: allReferencedSectionIds.length,
          homepages: dryRunHomepages,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (args.draftOnly) {
    for (const row of homepageRows) {
      const { error: deleteDraftRowsError } = await supabase
        .from("cms_page_sections")
        .delete()
        .eq("tenant_id", agency.id)
        .eq("page_id", row.id)
        .eq("is_draft", true);
      if (deleteDraftRowsError) {
        throw new Error(
          `Couldn't clear homepage draft rows for ${row.locale}: ${deleteDraftRowsError.message}`,
        );
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: "apply",
          resetMode: "draft-only",
          tenant: agency,
          purgeSkipped: args.purgeClearedSections
            ? "Draft-only reset never purges cms_sections."
            : null,
          homepages: summary.map((row) => ({
            pageId: row.pageId,
            locale: row.locale,
            clearedDraftRows: row.draftCount,
            liveRowsPreserved: row.liveCount,
            pageVersionUnchanged: row.version,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  for (const row of homepageRows) {
    const emptySnapshot = {
      version: 1,
      publishedAt: row.published_at ?? nowIso,
      pageVersion: row.version + 1,
      locale: row.locale,
      fields: {
        title: row.title,
        metaDescription: row.meta_description ?? null,
        introTagline: introTaglineFromHero(row.hero),
      },
      templateSchemaVersion: row.template_schema_version ?? 1,
      slots: [],
      builderTree: [],
    };

    const { error: deleteRowsError } = await supabase
      .from("cms_page_sections")
      .delete()
      .eq("tenant_id", agency.id)
      .eq("page_id", row.id);
    if (deleteRowsError) {
      throw new Error(
        `Couldn't clear homepage composition rows for ${row.locale}: ${deleteRowsError.message}`,
      );
    }

    const { error: updatePageError } = await supabase
      .from("cms_pages")
      .update({
        status: "published",
        version: row.version + 1,
        published_at: row.published_at ?? nowIso,
        published_homepage_snapshot: emptySnapshot,
      })
      .eq("id", row.id)
      .eq("tenant_id", agency.id);
    if (updatePageError) {
      throw new Error(
        `Couldn't update homepage snapshot for ${row.locale}: ${updatePageError.message}`,
      );
    }
  }

  let purgedSectionIds: string[] = [];
  let skippedPurgeReason: string | null = null;

  if (args.purgeClearedSections && allReferencedSectionIds.length > 0) {
    const { data: remainingRefs, error: remainingRefsError } = await supabase
      .from("cms_page_sections")
      .select("section_id")
      .eq("tenant_id", agency.id)
      .in("section_id", allReferencedSectionIds);
    if (remainingRefsError) {
      throw new Error(`Couldn't check remaining section refs: ${remainingRefsError.message}`);
    }
    const stillReferenced = new Set(
      (remainingRefs ?? []).map((row) => row.section_id as string),
    );
    const purgeCandidateIds = allReferencedSectionIds.filter((id) => !stillReferenced.has(id));

    if (purgeCandidateIds.length > 0) {
      const { error: purgeError } = await supabase
        .from("cms_sections")
        .delete()
        .eq("tenant_id", agency.id)
        .in("id", purgeCandidateIds);
      if (purgeError) {
        skippedPurgeReason = purgeError.message;
      } else {
        purgedSectionIds = purgeCandidateIds;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        resetMode: "empty-homepage",
        tenant: agency,
        referencedSectionCount: allReferencedSectionIds.length,
        purgedSectionCount: purgedSectionIds.length,
        purgedSectionIds,
        skippedPurgeReason,
        homepages: homepageRows.map((row) => ({
          pageId: row.id,
          locale: row.locale,
          resetToEmpty: true,
          nextVersion: row.version + 1,
        })),
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
