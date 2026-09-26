"use server";

/**
 * Maison Import starter content actions (W44–W59). Behind TALENT_MAISON_THEME_ENABLED.
 */

import { isTalentMaisonThemeEnabled } from "@/lib/access/talent-maison-theme";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { gate } from "./site-action-gate";
import type { ThemeActionResult } from "./theme-action-types";
import {
  findServiceDuplicate,
  loadMaisonStarterCatalog,
  type DuplicateResolution,
  type ExistingServiceMatch,
  type ImportSelectionState,
  type MaisonStarterCatalog,
} from "@/lib/talent-site/theme-catalog/maison/maison-starter-catalog";
import {
  commitMaisonStarterImport,
  listExistingServicesForImport,
  retryFailedMaisonImportItem,
  undoMaisonStarterImport,
  type MaisonImportCommitResult,
} from "./maison-import-core";

export type MaisonImportPreview = {
  catalog: MaisonStarterCatalog;
  existing: ExistingServiceMatch[];
  duplicates: Record<string, ExistingServiceMatch | null>;
};

export async function loadMaisonImportPreviewAction(): Promise<
  ThemeActionResult<MaisonImportPreview>
> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const catalog = loadMaisonStarterCatalog();
  const existing = await listExistingServicesForImport(admin, g.talentProfileId);
  const duplicates: Record<string, ExistingServiceMatch | null> = {};
  for (const svc of catalog.services) {
    duplicates[svc.key] = findServiceDuplicate(svc, existing);
  }
  return { ok: true, data: { catalog, existing, duplicates } };
}

export async function commitMaisonImportAction(input: {
  selection: ImportSelectionState;
  resolutions: Record<string, DuplicateResolution>;
}): Promise<ThemeActionResult<MaisonImportCommitResult>> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };

  const sel = input?.selection;
  if (
    !sel ||
    !Array.isArray(sel.serviceKeys) ||
    !Array.isArray(sel.faqKeys) ||
    !Array.isArray(sel.sectionKeys)
  ) {
    return { ok: false, code: "invalid_input", error: "Invalid selection." };
  }
  if (sel.serviceKeys.length + sel.faqKeys.length + sel.sectionKeys.length === 0) {
    return { ok: false, code: "invalid_input", error: "Select something to import." };
  }

  const res = await commitMaisonStarterImport(admin, {
    talentProfileId: g.talentProfileId,
    userId: g.userId,
    tenantId: null,
    selection: {
      serviceKeys: sel.serviceKeys.filter((k) => typeof k === "string"),
      faqKeys: sel.faqKeys.filter((k) => typeof k === "string"),
      sectionKeys: sel.sectionKeys.filter((k) => typeof k === "string"),
    },
    resolutions: input.resolutions ?? {},
  });
  if (!res.ok) return { ok: false, code: "server_error", error: res.error };
  return { ok: true, data: res.data };
}

export async function undoMaisonImportAction(input: {
  batchId: string;
  removeEdited?: boolean;
}): Promise<ThemeActionResult<{ removed: number }>> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };
  if (typeof input?.batchId !== "string" || !input.batchId) {
    return { ok: false, code: "invalid_input", error: "Missing import." };
  }
  const res = await undoMaisonStarterImport(admin, {
    talentProfileId: g.talentProfileId,
    batchId: input.batchId,
    removeEdited: input.removeEdited === true,
  });
  if (!res.ok) return { ok: false, code: "server_error", error: res.error };
  return { ok: true, data: { removed: res.removed } };
}

export async function retryMaisonImportItemAction(input: {
  batchId: string;
  starterKey: string;
}): Promise<ThemeActionResult<{ offeringId: string }>> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, code: "server_error", error: "Not configured." };
  const res = await retryFailedMaisonImportItem(admin, {
    talentProfileId: g.talentProfileId,
    tenantId: null,
    batchId: input.batchId,
    starterKey: input.starterKey,
  });
  if (!res.ok) return { ok: false, code: "server_error", error: res.error };
  return { ok: true, data: { offeringId: res.offeringId } };
}

/** Latest import batch for undo/details on the result screen. */
export async function loadLatestMaisonImportBatchAction(): Promise<
  ThemeActionResult<{ batchId: string; status: string } | null>
> {
  if (!isTalentMaisonThemeEnabled()) {
    return { ok: false, code: "feature_disabled", error: "Maison is not available yet." };
  }
  const g = await gate("personalSiteEdit");
  if (!g.ok) return g;
  const sb = await getCachedServerSupabase();
  if (!sb) return { ok: false, code: "server_error", error: "Not configured." };
  const { data, error } = await sb
    .from("talent_content_import_batches")
    .select("id, status")
    .eq("talent_profile_id", g.talentProfileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("maison.import.latestBatch", error);
    return { ok: false, code: "server_error", error: "Could not load imports." };
  }
  if (!data) return { ok: true, data: null };
  const row = data as { id: string; status: string };
  return { ok: true, data: { batchId: row.id, status: row.status } };
}
