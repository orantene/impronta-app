/**
 * auto-thumbnail.ts (A8) — flag-gated, best-effort auto-capture of a template
 * thumbnail on publish.
 *
 * WHY THIS IS SAFE TO ADD TO THE PUBLISH PATH
 * -------------------------------------------
 * The whole feature is gated behind the `BUILDER_AUTO_THUMBNAIL_ENABLED` env
 * flag (default OFF) AND every entry point swallows failures. With the flag
 * OFF, `maybeAutoCaptureThumbnail` returns the input row UNCHANGED before doing
 * any work, so `publishRowCore` is byte-identical to its pre-A8 behavior. Even
 * with the flag ON, a capture/upload failure NEVER throws to the publish path:
 * the contract is "return the original row" so the publish that already
 * committed proceeds without a thumbnail.
 *
 * HEADLESS PATH TAKEN
 * -------------------
 * The repo's only headless browser is `@playwright/test`, a *devDependency*
 * used by the e2e suite — it is NOT available in the production/serverless
 * runtime where `publishRowCore` executes, and launching Chromium inside a
 * Vercel function is not viable. So the actual pixel capture is implemented as a
 * clearly-isolated function (`renderTemplatePreviewToPng`) that attempts a
 * dynamic import of an OPTIONAL headless module and DEGRADES TO A NO-OP
 * (returns `null`) whenever that module is unavailable. A `null` capture means
 * "no thumbnail this publish" — publish still succeeds. This keeps the wiring,
 * the decision logic, and the upload/stamp plumbing fully exercised and tested
 * while never coupling the publish path to a runtime headless dependency.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { insertTenantImageAsset } from "@/lib/site-admin/media/assets";
import { MEDIA_PUBLIC_BUCKET } from "@/lib/site-admin/media/validation";
import { TEMPLATE_PREVIEW_BASE_PATH } from "./template-def";
import type { BuilderTemplateRow } from "./registry-rows";

/** Env flag — default OFF. Only `"1"` / `"true"` enables auto-capture. */
export function isAutoThumbnailEnabled(): boolean {
  const raw = process.env.BUILDER_AUTO_THUMBNAIL_ENABLED;
  return raw === "1" || raw === "true";
}

/**
 * The minimal row shape the decision logic needs. Keeping it structural (rather
 * than the full `BuilderTemplateRow`) lets the unit test build tiny fixtures.
 */
export interface AutoThumbnailDecisionRow {
  thumbnail_asset_id: string | null;
  builder_tree: unknown;
}

/**
 * PURE predicate (no I/O) — should we attempt an auto-capture for this row?
 *
 * True only when ALL hold:
 *   1. the env flag is ON,
 *   2. the row has NO thumbnail yet (`thumbnail_asset_id` is null), and
 *   3. the row has a renderable tree (a non-empty `builder_tree` array).
 *
 * Anything else (flag off, thumbnail already set, empty/non-array tree) returns
 * false so the caller short-circuits and leaves the row untouched.
 */
export function shouldAutoCaptureThumbnail(
  row: AutoThumbnailDecisionRow,
  flagEnabled: boolean = isAutoThumbnailEnabled(),
): boolean {
  if (!flagEnabled) return false;
  if (row.thumbnail_asset_id != null) return false;
  return Array.isArray(row.builder_tree) && row.builder_tree.length > 0;
}

/** Result of an attempted headless render: PNG bytes + dimensions, or null. */
export interface CapturedPng {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * Render a `/template-preview` URL to a PNG headlessly.
 *
 * DEGRADE-TO-NO-OP: the only headless engine in this repo is a devDependency
 * that is absent at runtime, so this attempts an OPTIONAL dynamic import of a
 * `@builder/headless-capture` module (intentionally not a hard dependency) and
 * returns `null` whenever it (or the capture itself) is unavailable/fails.
 * `null` is the expected production result today; the caller treats it as "no
 * thumbnail" and lets the publish proceed.
 *
 * Isolated + exported so it can be swapped for a real implementation later
 * WITHOUT touching the publish path or the decision logic.
 */
/**
 * External screenshot-service endpoint. When set, capture is delegated to an
 * HTTP service (Browserless / ScreenshotOne / urlbox / a self-hosted shooter)
 * — the only viable headless path in a Vercel serverless runtime, which can't
 * launch Chromium itself. Contract: GET `${SCREENSHOT_SERVICE_URL}?url=<enc>`
 * → `image/png` body. An optional `SCREENSHOT_SERVICE_TOKEN` is sent as a
 * Bearer header. Unset ⇒ this path is skipped (no-op degrade). This makes A8
 * "one env var from working" without baking a vendor/cost choice into code.
 */
async function captureViaScreenshotService(
  previewUrl: string,
): Promise<CapturedPng | null> {
  const base = process.env.SCREENSHOT_SERVICE_URL;
  if (!base) return null;
  const token = process.env.SCREENSHOT_SERVICE_TOKEN;
  const endpoint = `${base}${base.includes("?") ? "&" : "?"}url=${encodeURIComponent(previewUrl)}`;
  // Hard timeout — this is awaited inline in publishRowCore, so a hung/slow
  // screenshot vendor must NOT stall the publish (the try/catch around the call
  // catches the AbortError → null → publish proceeds thumbnail-less).
  const res = await fetch(endpoint, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) return null;
  // Dimensions are advisory metadata only; the service owns the real viewport.
  return { bytes: buf, width: 0, height: 0 };
}

export async function renderTemplatePreviewToPng(
  previewUrl: string,
): Promise<CapturedPng | null> {
  try {
    // 1) Preferred serverless-viable path: an external screenshot service.
    const viaService = await captureViaScreenshotService(previewUrl);
    if (viaService) return viaService;

    // 2) Fallback: an OPTIONAL, runtime-soft headless module (present only in a
    //    self-hosted worker). The variable indirection keeps the bundler/TS
    //    from treating this as a static import that must resolve.
    const moduleName = "@builder/headless-capture";
    const mod = (await import(/* webpackIgnore: true */ moduleName).catch(
      () => null,
    )) as
      | { captureUrlToPng?: (url: string) => Promise<CapturedPng | null> }
      | null;
    if (!mod || typeof mod.captureUrlToPng !== "function") return null;
    return await mod.captureUrlToPng(previewUrl);
  } catch (err) {
    logServerError("auto-thumbnail/render", err);
    return null;
  }
}

/** Build the `/template-preview` URL for a persisted (db-template) row. */
export function templatePreviewUrlForRow(
  row: Pick<BuilderTemplateRow, "id">,
  origin: string | null,
): string {
  const path = `${TEMPLATE_PREVIEW_BASE_PATH}/${encodeURIComponent(row.id)}?kind=db-template`;
  if (!origin) return path;
  return `${origin.replace(/\/+$/, "")}${path}`;
}

/**
 * Resolve the absolute origin the headless renderer should hit. Best-effort:
 * returns null when nothing is configured (the renderer then receives a
 * relative path and, being a no-op today, ignores it anyway).
 */
function resolveCaptureOrigin(): string | null {
  return (
    process.env.BUILDER_AUTO_THUMBNAIL_ORIGIN ??
    process.env.NEXT_PUBLIC_SITE_ORIGIN ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    null
  );
}

/**
 * BEST-EFFORT capture + upload + stamp. Returns the (possibly updated) row.
 *
 * CONTRACT (proven in auto-thumbnail.test.ts): on ANY failure — capture returns
 * null, storage upload errors, media-asset insert fails, or the stamp UPDATE
 * fails — this returns the ORIGINAL row unchanged and never throws. Only the
 * fully-successful path returns a row with `thumbnail_asset_id` populated.
 *
 * Mirrors the best-effort revision-snapshot insert in publishRowCore: log on
 * failure, never roll back, never block the publish.
 */
export async function captureAndStampThumbnail(
  sb: SupabaseClient,
  row: BuilderTemplateRow,
  opts: { createdBy: string },
): Promise<BuilderTemplateRow> {
  try {
    const origin = resolveCaptureOrigin();
    const previewUrl = templatePreviewUrlForRow(row, origin);
    const png = await renderTemplatePreviewToPng(previewUrl);
    if (!png) return row; // no-op degrade — publish proceeds thumbnail-less.

    const tenantId = row.source_tenant_id;
    if (!tenantId) return row; // no tenant scope to own the media asset.

    const storagePath = `builder-template-thumbnails/${row.id}/${row.version}.png`;
    const { error: uploadError } = await sb.storage
      .from(MEDIA_PUBLIC_BUCKET)
      .upload(storagePath, png.bytes, {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadError) {
      logServerError("auto-thumbnail/upload", uploadError);
      return row;
    }

    const inserted = await insertTenantImageAsset({
      supabase: sb,
      tenantId,
      createdByUserId: opts.createdBy,
      storagePath,
      mime: "image/png",
      byteSize: png.bytes.byteLength,
      width: png.width,
      height: png.height,
      alt: `${row.title} preview`,
      metadata: { source: "auto-thumbnail", template_id: row.id },
    });
    if (!inserted.item) {
      if (inserted.error) logServerError("auto-thumbnail/insert", inserted.error);
      return row;
    }

    const { data: stamped, error: stampError } = await sb
      .from("builder_templates")
      .update({ thumbnail_asset_id: inserted.item.id })
      .eq("id", row.id)
      .select()
      .single();
    if (stampError || !stamped) {
      if (stampError) logServerError("auto-thumbnail/stamp", stampError);
      return row;
    }
    return stamped as BuilderTemplateRow;
  } catch (err) {
    // Hard guarantee: nothing here ever escapes to the publish path.
    logServerError("auto-thumbnail/capture", err);
    return row;
  }
}

/**
 * The single entry point the publish path calls. Short-circuits to the input
 * row when `shouldAutoCaptureThumbnail` is false (flag off / already has a
 * thumbnail / empty tree) BEFORE any I/O, so with the flag OFF this is a pure
 * pass-through and publishRowCore stays byte-identical to its pre-A8 behavior.
 */
export async function maybeAutoCaptureThumbnail(
  sb: SupabaseClient,
  row: BuilderTemplateRow,
  opts: { createdBy: string },
): Promise<BuilderTemplateRow> {
  if (!shouldAutoCaptureThumbnail(row)) return row;
  return captureAndStampThumbnail(sb, row, opts);
}
