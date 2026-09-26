import "server-only";

/**
 * Maison starter-content import commit / undo (W56–W59).
 * Idempotent on (talent, starter item key) via attributes / faq question match.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { blankOffering, offeringToRowPatch } from "@/lib/talent/offerings-types";
import {
  findServiceDuplicate,
  loadMaisonStarterCatalog,
  type DuplicateResolution,
  type ExistingServiceMatch,
  type ImportSelectionState,
  type MaisonStarterService,
} from "@/lib/talent-site/theme-catalog/maison/maison-starter-catalog";

export type MaisonImportCommitInput = {
  talentProfileId: string;
  userId: string;
  tenantId: string | null;
  selection: ImportSelectionState;
  resolutions: Record<string, DuplicateResolution>;
};

export type MaisonImportCommitResult = {
  batchId: string;
  status: "complete" | "partial";
  serviceDraftIds: string[];
  faqDraftIds: string[];
  sectionKeys: string[];
  keptExisting: Array<{ starterKey: string; name: string; offeringId: string }>;
  skipped: Array<{ starterKey: string; name: string }>;
  failed: Array<{ starterKey: string; name: string; error: string }>;
};

function offeringsTable(admin: SupabaseClient) {
  return admin.from("talent_offerings");
}

export async function listExistingServicesForImport(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<ExistingServiceMatch[]> {
  const { data, error } = await offeringsTable(admin)
    .select("id, title, category")
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "archived");
  if (error) {
    logServerError("maison.import.listExisting", error);
    return [];
  }
  return ((data ?? []) as Array<{ id: string; title: string; category: string | null }>).map(
    (r) => ({ id: r.id, title: r.title, category: r.category }),
  );
}

async function alreadyImportedOffering(
  admin: SupabaseClient,
  talentProfileId: string,
  starterKey: string,
): Promise<string | null> {
  const { data, error } = await offeringsTable(admin)
    .select("id, attributes")
    .eq("talent_profile_id", talentProfileId)
    .contains("attributes", { maison_starter_key: starterKey })
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("maison.import.idempotentOffering", error);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

async function alreadyImportedFaq(
  admin: SupabaseClient,
  talentProfileId: string,
  question: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("talent_faq_items")
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .eq("question", question)
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("maison.import.idempotentFaq", error);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

async function insertServiceDraft(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    tenantId: string | null;
    batchId: string;
    starter: MaisonStarterService;
    sortOrder: number;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const existingId = await alreadyImportedOffering(
    admin,
    input.talentProfileId,
    input.starter.key,
  );
  if (existingId) return { ok: true, id: existingId };

  const blank = blankOffering(input.talentProfileId, "MXN", input.sortOrder);
  const offering = {
    ...blank,
    title: input.starter.name,
    category: input.starter.category,
    amountCents: input.starter.priceMxn * 100,
    durationMinutes: input.starter.durationMin,
    status: "draft" as const,
    bookingMode: "request" as const,
    reserveMode: "full" as const,
    priceDisplay: "exact" as const,
    attributes: {
      maison_starter_key: input.starter.key,
      maison_import_batch_id: input.batchId,
      price_duration_to_check: true,
    },
  };
  const patch = {
    ...offeringToRowPatch({ ...offering, ownerKind: "talent", tenantId: input.tenantId }),
    talent_profile_id: input.talentProfileId,
    owner_kind: "talent",
    import_batch_id: input.batchId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await offeringsTable(admin).insert(patch).select("id").maybeSingle();
  if (error) {
    logServerError("maison.import.insertOffering", error);
    return { ok: false, error: error.message ?? "insert failed" };
  }
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: "insert returned no id" };
  return { ok: true, id };
}

async function insertFaqDraft(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    batchId: string;
    question: string;
    starterKey: string;
    sortOrder: number;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const existingId = await alreadyImportedFaq(admin, input.talentProfileId, input.question);
  if (existingId) return { ok: true, id: existingId };

  const { data, error } = await admin
    .from("talent_faq_items")
    .insert({
      talent_profile_id: input.talentProfileId,
      question: input.question,
      answer: "",
      status: "draft",
      sort_order: input.sortOrder,
      import_batch_id: input.batchId,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    logServerError("maison.import.insertFaq", error);
    return { ok: false, error: error.message ?? "faq insert failed" };
  }
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { ok: false, error: "faq insert returned no id" };
  return { ok: true, id };
}

export async function commitMaisonStarterImport(
  admin: SupabaseClient,
  input: MaisonImportCommitInput,
): Promise<{ ok: true; data: MaisonImportCommitResult } | { ok: false; error: string }> {
  const catalog = loadMaisonStarterCatalog();
  const existing = await listExistingServicesForImport(admin, input.talentProfileId);

  const { data: batchRow, error: batchErr } = await admin
    .from("talent_content_import_batches")
    .insert({
      talent_profile_id: input.talentProfileId,
      source_demo_slug: catalog.demoSlug,
      selections: input.selection,
      resolutions: input.resolutions,
      status: "complete",
      created_record_ids: {},
      failed_items: [],
    })
    .select("id")
    .maybeSingle();
  if (batchErr || !batchRow) {
    logServerError("maison.import.createBatch", batchErr ?? { message: "no batch" });
    return { ok: false, error: "Could not start the import." };
  }
  const batchId = (batchRow as { id: string }).id;

  const serviceDraftIds: string[] = [];
  const faqDraftIds: string[] = [];
  const sectionKeys: string[] = [];
  const keptExisting: MaisonImportCommitResult["keptExisting"] = [];
  const skipped: MaisonImportCommitResult["skipped"] = [];
  const failed: MaisonImportCommitResult["failed"] = [];

  const serviceByKey = new Map(catalog.services.map((s) => [s.key, s]));
  let sort = 1000;
  for (const key of input.selection.serviceKeys) {
    const starter = serviceByKey.get(key);
    if (!starter) continue;
    const dup = findServiceDuplicate(starter, existing);
    const res: DuplicateResolution = dup
      ? (input.resolutions[key] ?? "keep_existing")
      : "add_as_draft";
    if (dup && res === "keep_existing") {
      keptExisting.push({ starterKey: key, name: starter.name, offeringId: dup.id });
      continue;
    }
    if (dup && res === "skip") {
      skipped.push({ starterKey: key, name: starter.name });
      continue;
    }
    const inserted = await insertServiceDraft(admin, {
      talentProfileId: input.talentProfileId,
      tenantId: input.tenantId,
      batchId,
      starter,
      sortOrder: sort++,
    });
    if (!inserted.ok) {
      failed.push({ starterKey: key, name: starter.name, error: inserted.error });
    } else {
      serviceDraftIds.push(inserted.id);
    }
  }

  const faqByKey = new Map(catalog.faqs.map((f) => [f.key, f]));
  let faqSort = 0;
  for (const key of input.selection.faqKeys) {
    const faq = faqByKey.get(key);
    if (!faq) continue;
    const inserted = await insertFaqDraft(admin, {
      talentProfileId: input.talentProfileId,
      batchId,
      question: faq.question,
      starterKey: key,
      sortOrder: faqSort++,
    });
    if (!inserted.ok) {
      failed.push({ starterKey: key, name: faq.question, error: inserted.error });
    } else {
      faqDraftIds.push(inserted.id);
    }
  }

  for (const key of input.selection.sectionKeys) {
    if (catalog.sectionText.some((s) => s.key === key)) {
      sectionKeys.push(key);
    }
  }

  const status = failed.length > 0 ? "partial" : "complete";
  const created_record_ids = {
    offerings: serviceDraftIds,
    faq_items: faqDraftIds,
    section_text: sectionKeys,
  };
  const { error: updateErr } = await admin
    .from("talent_content_import_batches")
    .update({
      status,
      created_record_ids,
      failed_items: failed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);
  if (updateErr) {
    logServerError("maison.import.updateBatch", updateErr);
  }

  return {
    ok: true,
    data: {
      batchId,
      status,
      serviceDraftIds,
      faqDraftIds,
      sectionKeys,
      keptExisting,
      skipped,
      failed,
    },
  };
}

export type UndoImportDecision = {
  /** Offering/faq ids the talent edited — ask: remove or keep. */
  editedIds: string[];
  removeEdited: boolean;
};

export async function undoMaisonStarterImport(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    batchId: string;
    removeEdited: boolean;
  },
): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const { data: batch, error } = await admin
    .from("talent_content_import_batches")
    .select("id, status, created_record_ids")
    .eq("id", input.batchId)
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("maison.import.undoRead", error);
    return { ok: false, error: "Could not load the import." };
  }
  if (!batch) return { ok: false, error: "Import not found." };
  if ((batch as { status: string }).status === "undone") {
    return { ok: true, removed: 0 };
  }

  const created = (batch as { created_record_ids?: Record<string, unknown> }).created_record_ids ?? {};
  const offeringIds = Array.isArray(created.offerings)
    ? (created.offerings as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const faqIds = Array.isArray(created.faq_items)
    ? (created.faq_items as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  let removed = 0;
  for (const id of offeringIds) {
    const { data: row, error: readErr } = await offeringsTable(admin)
      .select("id, updated_at, created_at, attributes")
      .eq("id", id)
      .eq("talent_profile_id", input.talentProfileId)
      .maybeSingle();
    if (readErr) {
      logServerError("maison.import.undoOfferingRead", readErr);
      continue;
    }
    if (!row) continue;
    const r = row as { updated_at?: string; created_at?: string };
    const edited =
      typeof r.updated_at === "string" &&
      typeof r.created_at === "string" &&
      r.updated_at > r.created_at;
    if (edited && !input.removeEdited) continue;
    const { error: delErr } = await offeringsTable(admin)
      .delete()
      .eq("id", id)
      .eq("talent_profile_id", input.talentProfileId);
    if (delErr) {
      logServerError("maison.import.undoOfferingDel", delErr);
    } else {
      removed += 1;
    }
  }

  for (const id of faqIds) {
    const { data: row, error: readErr } = await admin
      .from("talent_faq_items")
      .select("id, updated_at, created_at, answer")
      .eq("id", id)
      .eq("talent_profile_id", input.talentProfileId)
      .maybeSingle();
    if (readErr) {
      logServerError("maison.import.undoFaqRead", readErr);
      continue;
    }
    if (!row) continue;
    const r = row as { updated_at?: string; created_at?: string; answer?: string };
    const edited =
      (typeof r.answer === "string" && r.answer.trim().length > 0) ||
      (typeof r.updated_at === "string" &&
        typeof r.created_at === "string" &&
        r.updated_at > r.created_at);
    if (edited && !input.removeEdited) continue;
    const { error: delErr } = await admin
      .from("talent_faq_items")
      .delete()
      .eq("id", id)
      .eq("talent_profile_id", input.talentProfileId);
    if (delErr) {
      logServerError("maison.import.undoFaqDel", delErr);
    } else {
      removed += 1;
    }
  }

  const { error: markErr } = await admin
    .from("talent_content_import_batches")
    .update({ status: "undone", updated_at: new Date().toISOString() })
    .eq("id", input.batchId);
  if (markErr) {
    logServerError("maison.import.undoMark", markErr);
  }

  return { ok: true, removed };
}

export async function retryFailedMaisonImportItem(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    tenantId: string | null;
    batchId: string;
    starterKey: string;
  },
): Promise<{ ok: true; offeringId: string } | { ok: false; error: string }> {
  const catalog = loadMaisonStarterCatalog();
  const starter = catalog.services.find((s) => s.key === input.starterKey);
  if (!starter) return { ok: false, error: "Unknown starter item." };

  const inserted = await insertServiceDraft(admin, {
    talentProfileId: input.talentProfileId,
    tenantId: input.tenantId,
    batchId: input.batchId,
    starter,
    sortOrder: 2000,
  });
  if (!inserted.ok) return { ok: false, error: inserted.error };

  const { data: batch, error } = await admin
    .from("talent_content_import_batches")
    .select("created_record_ids, failed_items")
    .eq("id", input.batchId)
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("maison.import.retryRead", error);
  } else if (batch) {
    const created = ((batch as { created_record_ids?: { offerings?: string[] } })
      .created_record_ids ?? {}) as { offerings?: string[] };
    const offerings = [...(created.offerings ?? []), inserted.id];
    const failed = (
      ((batch as { failed_items?: Array<{ starterKey: string }> }).failed_items ?? []) as Array<{
        starterKey: string;
      }>
    ).filter((f) => f.starterKey !== input.starterKey);
    await admin
      .from("talent_content_import_batches")
      .update({
        created_record_ids: { ...created, offerings },
        failed_items: failed,
        status: failed.length ? "partial" : "complete",
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.batchId);
  }

  return { ok: true, offeringId: inserted.id };
}
