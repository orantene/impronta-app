import "server-only";

/**
 * tenant-image-jobs.server.ts — the per-site generation queue (03 §4b).
 *
 * `enqueueTenantImageJob` is called by the composer after it stored the seed
 * picks. It enqueues ONLY when the actor's auth user has `email_confirmed_at`
 * (D-TPL-31: OTP and Google both set it; a session alone is not enough) and
 * marks the job's slots pending so the builder can show "your photos are
 * being made". `runTenantImageJobs` is the cron drain: oldest job first,
 * concurrency 2, a pause between calls, each image through the engine (QA
 * included); a slot swaps to `tenant_generated` only when its image passed
 * automated QA; a failed or blocked slot keeps its pool image.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveImageEngineSettings } from "@/lib/ai/ai-image-model";
import { logServerError } from "@/lib/server/safe-error";
import { directionForIndex, type DirectionId, type StockPromptFacts } from "@/lib/site-admin/builder-core/site-templates/stock-prompts";
import type { ImageSlotKey } from "@/lib/site-admin/builder-core/site-templates/types";
import type { BusinessFamilyId } from "@/lib/words/business-types";

import { clearPending, markAssignmentsPending, swapAssignment } from "./asset-assignments.server";
import { swapImageSrcInTenantPages } from "./page-image-swap.server";
import { generateStockAsset } from "./stock-engine.server";

export type JobSlotStatus = "queued" | "done" | "failed" | "blocked" | "skipped" | "user_won";

export interface JobSlot {
  pageRole: string;
  slot: ImageSlotKey;
  direction: DirectionId;
  status: JobSlotStatus;
  assetId?: string;
  reason?: string;
}

/** The slots a site gets for itself (6–8; team only when the Look placed one). */
const TENANT_SLOTS: ReadonlyArray<ImageSlotKey> = ["hero", "wide", "portrait", "gallery-1", "gallery-2", "gallery-3", "gallery-4", "team"];

const TENANT_PAGES: ReadonlySet<string> = new Set(["home", "about"]);

export const JOB_CONCURRENCY = 2;
/**
 * The organisation's measured limit is 5 images per minute (2026-09-16,
 * "input-images per min: Limit 5"): two in flight, then a 26 s pause, keeps a
 * run under it. A rate-limit reply still leaves the slot queued for the next
 * cron minute instead of failing it.
 */
export const JOB_PAUSE_MS = 26_000;

export async function enqueueTenantImageJob(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    actorProfileId: string | null;
    siteComposeId: string;
    typeId: string;
    family: BusinessFamilyId;
    facts: StockPromptFacts;
    /** The pool-backed placements of this compose (owner / tenant slots excluded by the caller). */
    slots: ReadonlyArray<{ pageRole: string; slot: string }>;
  },
): Promise<{ ok: true; jobId: string } | { ok: false; reason: string }> {
  try {
    if (!input.actorProfileId) return { ok: false, reason: "no actor; guest composes get seed images only" };
    const verified = await isEmailConfirmed(admin, input.actorProfileId);
    if (!verified) return { ok: false, reason: "account not verified; seed images stay" };

    const settings = await resolveImageEngineSettings();
    if (settings.dailyCap <= 0) return { ok: false, reason: "per-site generation is switched off (daily cap 0)" };

    // One job per site: a re-compose replaces a still-queued job instead of stacking.
    const { error: cancelError } = await admin.from("tenant_image_jobs").update({ status: "failed", error: "superseded by a newer compose", finished_at: new Date().toISOString() }).eq("tenant_id", input.tenantId).eq("status", "queued");
    if (cancelError) logServerError("tenant-image-jobs.supersede", cancelError);

    const wanted = new Set<string>(TENANT_SLOTS);
    const seen = new Set<string>();
    const slots: JobSlot[] = [];
    for (const s of input.slots) {
      const key = `${s.pageRole}|${s.slot}`;
      // Only the home and about pages get their own frames (6–8 per site, owner §9.2);
      // every other page is served the tenant's images by the resolver.
      if (!TENANT_PAGES.has(s.pageRole) || !wanted.has(s.slot) || seen.has(key)) continue;
      seen.add(key);
      slots.push({ pageRole: s.pageRole, slot: s.slot as ImageSlotKey, direction: directionForIndex(slots.length), status: "queued" });
      if (slots.length >= 8) break;
    }
    if (slots.length === 0) return { ok: false, reason: "no pool-backed slots to personalise" };

    const { data, error } = await admin
      .from("tenant_image_jobs")
      .insert({ tenant_id: input.tenantId, site_compose_id: input.siteComposeId, business_type: input.typeId, family: input.family, slots, facts: input.facts, status: "queued", requested_by: input.actorProfileId } as never)
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { ok: false, reason: error?.message ?? "insert failed" };
    await markAssignmentsPending(admin, { tenantId: input.tenantId, jobId: data.id, slots });
    return { ok: true, jobId: data.id };
  } catch (error) {
    logServerError("tenant-image-jobs.enqueue", error);
    return { ok: false, reason: error instanceof Error ? error.message : "enqueue failed" };
  }
}

/** D-TPL-31: the one verification check, read server-side from the auth user (profiles.id = auth.users.id). */
export async function isEmailConfirmed(admin: SupabaseClient, profileId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (error || !data?.user) return false;
  return !!data.user.email_confirmed_at;
}

type JobRow = {
  id: string;
  tenant_id: string;
  site_compose_id: string | null;
  business_type: string | null;
  family: BusinessFamilyId;
  slots: JobSlot[];
  facts: StockPromptFacts;
  attempts: number;
  cost_usd: number;
  requested_by: string | null;
};

export interface RunReport {
  jobsSeen: number;
  imagesDone: number;
  imagesFailed: number;
  imagesBlocked: number;
  costUsd: number;
  stoppedBy: "budget_ms" | "daily_cap" | "empty" | "not_configured" | "rate_limited";
}

/**
 * Drain the queue for up to `budgetMs`. Claims one job at a time (status →
 * running), runs its slots two at a time with a pause, writes each slot's
 * outcome back, swaps assignments for passed images, and settles the job as
 * done / partial / failed.
 */
export async function runTenantImageJobs(admin: SupabaseClient, options: { budgetMs?: number; now?: () => number } = {}): Promise<RunReport> {
  const now = options.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? 50_000);
  const report: RunReport = { jobsSeen: 0, imagesDone: 0, imagesFailed: 0, imagesBlocked: 0, costUsd: 0, stoppedBy: "empty" };
  const settings = await resolveImageEngineSettings();

  while (now() < deadline) {
    const job = await claimNextJob(admin);
    if (!job) break;
    report.jobsSeen += 1;
    const pageIds = await composedPageIds(admin, job.tenant_id);
    const slots = job.slots.map((s) => ({ ...s }));
    let cost = 0;
    let stop: RunReport["stoppedBy"] | null = null;
    const pending = slots.filter((s) => s.status === "queued");

    for (let i = 0; i < pending.length && !stop; i += JOB_CONCURRENCY) {
      if (now() + JOB_PAUSE_MS + 20_000 > deadline) {
        stop = "budget_ms";
        break;
      }
      const batch = pending.slice(i, i + JOB_CONCURRENCY);
      const results = await Promise.all(
        batch.map((s) =>
          generateStockAsset(admin, {
            family: job.family,
            typeId: job.business_type,
            slot: s.slot,
            direction: s.direction,
            facts: job.facts,
            quality: "medium",
            originTenantId: job.tenant_id,
            siteComposeId: job.site_compose_id,
            createdBy: job.requested_by,
            settings,
          }),
        ),
      );
      for (let k = 0; k < batch.length; k++) {
        const s = batch[k], r = results[k];
        cost += r.costUsd;
        if (r.ok) {
          if (r.approval === "qa_passed") {
            const src = await stockSrc(admin, r.assetId);
            const previous = await currentSrc(admin, job.tenant_id, s.pageRole, s.slot);
            const swapped = src ? await swapAssignment(admin, { tenantId: job.tenant_id, pageRole: s.pageRole, slot: s.slot, assetId: r.id, src, direction: s.direction, jobId: job.id }) : "failed";
            s.status = swapped === "swapped" ? "done" : swapped === "user_won" ? "user_won" : "failed";
            s.assetId = r.id;
            if (swapped === "swapped" && src) {
              // The page carries the src; rewrite it so the renderer shows the tenant's own image.
              if (previous && previous !== src) await swapImageSrcInTenantPages(admin, { tenantId: job.tenant_id, fromSrc: previous, toSrc: src, pageId: pageIds[s.pageRole] ?? null, maxNodes: 1 });
              report.imagesDone += 1;
            } else report.imagesFailed += 1;
          } else {
            s.status = "failed";
            s.assetId = r.id;
            s.reason = "automated QA rejected";
            report.imagesFailed += 1;
          }
        } else if (r.code === "moderation_blocked") {
          s.status = "blocked";
          s.reason = r.error.slice(0, 200);
          report.imagesBlocked += 1;
        } else if (r.code === "rate_limit_exceeded") {
          // Leave the slot queued; the next cron minute retries under the limit.
          stop = "rate_limited";
        } else if (r.code === "daily_cap" || r.code === "not_configured" || r.code === "insufficient_quota") {
          // Leave the slot queued; the job goes back to the queue for tomorrow / after the fix.
          stop = r.code === "daily_cap" ? "daily_cap" : "not_configured";
        } else {
          s.status = "failed";
          s.reason = `${r.code}: ${r.error.slice(0, 160)}`;
          report.imagesFailed += 1;
        }
      }
      if (!stop && i + JOB_CONCURRENCY < pending.length) await new Promise((res) => setTimeout(res, JOB_PAUSE_MS));
    }

    report.costUsd += cost;
    const remaining = slots.filter((s) => s.status === "queued").length;
    const done = slots.filter((s) => s.status === "done").length;
    const status = remaining > 0 ? "queued" : done === slots.length ? "done" : done > 0 ? "partial" : "failed";
    const { error } = await admin
      .from("tenant_image_jobs")
      .update({ slots, status, cost_usd: Number((job.cost_usd + cost).toFixed(5)), attempts: job.attempts + 1, ...(remaining > 0 ? {} : { finished_at: new Date().toISOString() }), error: stop ? `paused: ${stop}` : null })
      .eq("id", job.id);
    if (error) logServerError("tenant-image-jobs.settle", error);
    if (remaining === 0) await clearPending(admin, { tenantId: job.tenant_id, jobId: job.id });
    if (stop) {
      report.stoppedBy = stop;
      return report;
    }
  }
  if (report.stoppedBy === "empty" && now() >= deadline) report.stoppedBy = "budget_ms";
  return report;
}

async function claimNextJob(admin: SupabaseClient): Promise<JobRow | null> {
  const { data: next, error } = await admin.from("tenant_image_jobs").select("id").eq("status", "queued").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error || !next) return null;
  // Claim by conditional update so two overlapping runs cannot take one job.
  const { data: claimed, error: claimError } = await admin
    .from("tenant_image_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", (next as { id: string }).id)
    .eq("status", "queued")
    .select("id, tenant_id, site_compose_id, business_type, family, slots, facts, attempts, cost_usd, requested_by")
    .maybeSingle();
  if (claimError || !claimed) return null;
  return claimed as JobRow;
}

/** page_role → cms_pages.id from the compose stamp, so a swap touches the slot's own page only. */
async function composedPageIds(admin: SupabaseClient, tenantId: string): Promise<Record<string, string>> {
  const { data, error } = await admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle();
  if (error || !data) return {};
  const stamp = ((data as { settings: { site_compose?: { pageIds?: Record<string, string> } } | null }).settings ?? {}).site_compose;
  return stamp?.pageIds ?? {};
}

async function currentSrc(admin: SupabaseClient, tenantId: string, pageRole: string, slot: string): Promise<string | null> {
  const { data, error } = await admin.from("tenant_asset_assignments").select("src").eq("tenant_id", tenantId).eq("page_role", pageRole).eq("slot", slot).maybeSingle();
  if (error || !data) return null;
  return (data as { src: string }).src;
}

async function stockSrc(admin: SupabaseClient, assetId: string): Promise<string | null> {
  const { data, error } = await admin.from("media_assets").select("storage_path, bucket_id").eq("id", assetId).maybeSingle();
  if (error || !data) return null;
  const row = data as { storage_path: string | null; bucket_id: string | null };
  if (!row.storage_path) return null;
  return admin.storage.from(row.bucket_id ?? "media-public").getPublicUrl(row.storage_path).data.publicUrl;
}
