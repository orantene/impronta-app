"use server";

/**
 * Seeds the default 2026 freeform starter when a new standard page is created.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import { upsertSection } from "@/lib/site-admin/server/sections";
import type { Locale } from "@/lib/site-admin/locales";

import {
  saveHomepageCompositionAction,
  type CompositionSaveInput,
} from "./composition-actions";
import {
  NEW_PAGE_STARTER_SECTION_NAME,
  NEW_PAGE_STARTER_SLOT_KEY,
  buildNewPageStarterBuilderTree,
} from "./new-page-starter-tree";

export async function seedNewPageStarterComposition(input: {
  supabase: SupabaseClient;
  tenantId: string;
  actorProfileId: string;
  locale: Locale;
  pageId: string;
  pageVersion: number;
  title: string;
}): Promise<{ ok: true; pageVersion: number } | { ok: false; error: string }> {
  const defaults = getLibraryDefault("blank_section");
  const parsed = sectionUpsertSchema.safeParse({
    tenantId: input.tenantId,
    sectionTypeKey: "blank_section",
    schemaVersion: 1,
    name: NEW_PAGE_STARTER_SECTION_NAME,
    props: defaults.props,
    expectedVersion: 0,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Starter section validation failed.",
    };
  }

  const created = await upsertSection(input.supabase, {
    tenantId: input.tenantId,
    values: parsed.data,
    actorProfileId: input.actorProfileId,
  });
  if (!created.ok) {
    return { ok: false, error: created.message ?? "Could not create starter section." };
  }

  const saveInput: CompositionSaveInput = {
    locale: input.locale,
    pageId: input.pageId,
    expectedVersion: input.pageVersion,
    metadata: {
      title: input.title,
    },
    slots: {
      [NEW_PAGE_STARTER_SLOT_KEY]: [
        { sectionId: created.data.id, sortOrder: 0 },
      ],
    },
    builderTree: buildNewPageStarterBuilderTree(created.data.id),
    seedNewPageStarter: true,
  };

  const saved = await saveHomepageCompositionAction(saveInput);
  if (!saved.ok) {
    return { ok: false, error: saved.error };
  }

  return { ok: true, pageVersion: saved.pageVersion };
}
