"use server";

/**
 * Phase 14 — whole-site translate batch.
 *
 * Loops every section in the tenant, calls the existing
 * `translateSectionWithAi` against each, and writes the translated
 * fields back to the i18nString locale slot — leaving the original
 * English in place under `default`/`en`.
 *
 * Uses the same per-tenant rate limit bucket as the per-section
 * translate / rewrite actions. Stops early if the limit is hit and
 * reports how many sections were translated vs skipped.
 *
 * Returns a per-section status array so the UI can show which sections
 * succeeded / failed / hit rate-limit.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { listSectionsForStaff } from "@/lib/site-admin/server/sections-reads";
import { upsertSection } from "@/lib/site-admin/server/sections";
import { sectionUpsertSchema } from "@/lib/site-admin";
import {
  SECTION_REGISTRY,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import { translateSectionWithAi } from "./ai-rewrite-action";
import { setI18n } from "@/lib/site-admin/sections/shared/i18n-text";

export interface TranslateSiteSectionStatus {
  sectionId: string;
  sectionName: string;
  outcome: "translated" | "skipped" | "failed" | "rate_limited";
  reason?: string;
  fieldCount?: number;
}

export type TranslateSiteResult =
  | {
      ok: true;
      summary: {
        attempted: number;
        translated: number;
        failed: number;
        skipped: number;
      };
      sections: ReadonlyArray<TranslateSiteSectionStatus>;
    }
  | { ok: false; error: string; code?: string };

export async function translateSiteWithAi(input: {
  targetLocale: string;
  targetLocaleLabel?: string;
}): Promise<TranslateSiteResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const rows = await listSectionsForStaff(auth.supabase, scope.tenantId);
  const statuses: TranslateSiteSectionStatus[] = [];
  let translated = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!(row.section_type_key in SECTION_REGISTRY)) {
      statuses.push({
        sectionId: row.id,
        sectionName: row.name,
        outcome: "skipped",
        reason: "unknown section type",
      });
      skipped += 1;
      continue;
    }
    const props = (row.props_jsonb as Record<string, unknown> | null) ?? {};
    const result = await translateSectionWithAi({
      sectionTypeKey: row.section_type_key,
      currentProps: props,
      targetLocale: input.targetLocale,
      targetLocaleLabel: input.targetLocaleLabel,
    });
    if (!result.ok) {
      // Stop early on rate-limit so the operator sees which sections
      // didn't get processed; everything after is "rate_limited".
      if (result.code === "RATE_LIMITED") {
        statuses.push({
          sectionId: row.id,
          sectionName: row.name,
          outcome: "rate_limited",
          reason: result.error,
        });
        failed += 1;
        for (let j = rows.indexOf(row) + 1; j < rows.length; j += 1) {
          statuses.push({
            sectionId: rows[j].id,
            sectionName: rows[j].name,
            outcome: "rate_limited",
            reason: "Stopped after rate limit hit on earlier section.",
          });
          failed += 1;
        }
        break;
      }
      statuses.push({
        sectionId: row.id,
        sectionName: row.name,
        outcome: "failed",
        reason: result.error,
      });
      failed += 1;
      continue;
    }

    // Merge translations into i18nString fields. Each translated key
    // becomes `{ default: <existing-string>, [targetLocale]: <translation> }`.
    const nextProps: Record<string, unknown> = { ...props };
    let fieldCount = 0;
    for (const [key, translation] of Object.entries(result.translations)) {
      const current = nextProps[key];
      nextProps[key] = setI18n(current as string | undefined, input.targetLocale, translation);
      fieldCount += 1;
    }
    if (fieldCount === 0) {
      statuses.push({ sectionId: row.id, sectionName: row.name, outcome: "skipped", reason: "no fields" });
      skipped += 1;
      continue;
    }

    // Persist via the standard upsert path (CAS + audit + cache bust).
    const entry = SECTION_REGISTRY[row.section_type_key as SectionTypeKey];
    const parsed = sectionUpsertSchema.safeParse({
      tenantId: scope.tenantId,
      sectionTypeKey: row.section_type_key,
      schemaVersion: entry.currentVersion,
      props: nextProps,
      expectedVersion: row.version,
      name: row.name,
      id: row.id,
    });
    if (!parsed.success) {
      statuses.push({ sectionId: row.id, sectionName: row.name, outcome: "failed", reason: "validation" });
      failed += 1;
      continue;
    }
    const upsert = await upsertSection(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!upsert.ok) {
      statuses.push({ sectionId: row.id, sectionName: row.name, outcome: "failed", reason: upsert.message ?? "upsert failed" });
      failed += 1;
      continue;
    }
    statuses.push({ sectionId: row.id, sectionName: row.name, outcome: "translated", fieldCount });
    translated += 1;
  }

  return {
    ok: true,
    summary: { attempted: rows.length, translated, failed, skipped },
    sections: statuses,
  };
}
