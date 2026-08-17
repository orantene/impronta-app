/**
 * media-curation.ts — resolves IMAGE_SLOT(...) placeholders left in the
 * Impronta rebuild's page-tree modules to real rows in the tenant's media
 * library.
 *
 * WHY THIS EXISTS
 * ────────────────
 * W4a/W4b write BuilderNode[] trees for the 14 rebuilt pages before any
 * curated imagery exists. Rather than hand-typing a media asset id into every
 * `image` node (fragile — ids differ per environment, and nobody can review a
 * bare UUID), a page module puts `IMAGE_SLOT("home-hero")` in the `src` field
 * instead. This module is the ONLY place that turns a slot name into a real
 * `{ src, mediaId }` pair, and it is deliberately loud about every choice it
 * makes — see the "NEVER SILENTLY PICK" rule below.
 *
 * THE CONTRACT — IMAGE_SLOT(...)
 * ───────────────────────────────
 * `IMAGE_SLOT(name)` returns a plain string (a sentinel-prefixed token), so it
 * type-checks anywhere `BuilderImageNode.props.src` (or `BackgroundMediaProps
 * .src`, or a page's `seo.ogImageUrl`) expects a `string` — page modules don't
 * need a separate "loose" tree type. Any node's `props` object whose `src` key
 * holds a slot token gets BOTH `src` (resolved public URL) and `mediaId`
 * (resolved media_assets.id) written back onto it by
 * {@link applyImageSlotResolution}. A bare string field (not nested under a
 * `src` key — e.g. `seo.ogImageUrl`) is resolved with
 * {@link resolveSingleImageSlotValue} instead.
 *
 * PINNING — image-slots.json
 * ────────────────────────────
 * `./image-slots.json` (checked in, sits next to this file) maps
 * `slot name -> media_assets.id`. The owner/integrator edits that file by hand
 * to swap a picture — no code change, no re-running curation logic, just a
 * different id. A slot with no pin (or a pin pointing at an asset that is no
 * longer an approved image in this tenant's library) falls back to a
 * DETERMINISTIC pick: a stable hash of the slot name modulo the tenant's
 * approved-image count, over a pool sorted by `(created_at, id)`. Deterministic
 * means: re-running curation with the same library and the same pins always
 * proposes the exact same fallback picks — nothing here calls `Math.random()`
 * or depends on iteration order.
 *
 * NEVER SILENTLY PICK
 * ─────────────────────
 * Every resolution — pinned or fallback — is returned in a report the caller
 * MUST print (see {@link formatImageSlotReport}) before any page tree is
 * written. seed-pages.ts treats a slot that resolves to nothing (empty tenant
 * media library, no fallback candidate) as a hard failure and aborts the
 * whole run rather than writing a page with a dangling placeholder string in
 * an `<img src>`.
 *
 * Pure module aside from the one exported async function that reads the
 * tenant media library — no writes, ever. No `server-only` import (this runs
 * under plain `tsx`, not inside a Next server component).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listTenantMediaLibrary } from "@/lib/site-admin/media/assets";
import type { MediaLibraryItem } from "@/lib/site-admin/media/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// IMAGE_SLOT token contract
// ---------------------------------------------------------------------------

const IMAGE_SLOT_PREFIX = "@@impronta-image-slot::";

/**
 * Placeholder for an image that will be resolved from the tenant's media
 * library at seed time. Page modules call this in any `src`-shaped prop (or
 * `seo.ogImageUrl`) instead of a real URL.
 */
export function IMAGE_SLOT(slot: string): string {
  const name = slot.trim();
  if (!name) {
    throw new Error("IMAGE_SLOT(slot) requires a non-empty slot name.");
  }
  if (name.includes("::") || name.includes("\n")) {
    throw new Error(`IMAGE_SLOT(${JSON.stringify(slot)}): slot names cannot contain "::" or newlines.`);
  }
  return `${IMAGE_SLOT_PREFIX}${name}`;
}

export function isImageSlotToken(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(IMAGE_SLOT_PREFIX);
}

/** Extract the slot name from a value produced by {@link IMAGE_SLOT}. Throws if `value` is not a slot token — callers should guard with {@link isImageSlotToken} first. */
export function imageSlotName(token: string): string {
  if (!isImageSlotToken(token)) {
    throw new Error(`Not an IMAGE_SLOT token: ${JSON.stringify(token)}`);
  }
  return token.slice(IMAGE_SLOT_PREFIX.length);
}

// ---------------------------------------------------------------------------
// Pin file — image-slots.json
// ---------------------------------------------------------------------------

export interface ImageSlotPinFile {
  /** Informational only — not enforced. Helps a human confirm they're editing the right tenant's pins. */
  tenantSlug?: string;
  /** slot name -> media_assets.id */
  pins: Record<string, string>;
}

export const DEFAULT_IMAGE_SLOT_PINS_PATH = path.join(__dirname, "image-slots.json");

export function emptyPinFile(): ImageSlotPinFile {
  return { pins: {} };
}

export function loadImageSlotPins(filePath: string = DEFAULT_IMAGE_SLOT_PINS_PATH): ImageSlotPinFile {
  if (!existsSync(filePath)) return emptyPinFile();
  const raw: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (!raw || typeof raw !== "object" || typeof (raw as { pins?: unknown }).pins !== "object" || (raw as { pins?: unknown }).pins === null) {
    throw new Error(`Invalid image slot pin file at ${filePath}: expected { "pins": { "<slot>": "<mediaAssetId>" } }`);
  }
  const parsed = raw as { tenantSlug?: unknown; pins: Record<string, unknown> };
  const pins: Record<string, string> = {};
  for (const [slot, id] of Object.entries(parsed.pins)) {
    if (typeof id === "string" && id.trim()) pins[slot] = id.trim();
  }
  return {
    tenantSlug: typeof parsed.tenantSlug === "string" ? parsed.tenantSlug : undefined,
    pins,
  };
}

// ---------------------------------------------------------------------------
// Tree walking — collect + apply
// ---------------------------------------------------------------------------

function walkCollect(value: unknown, found: Set<string>): void {
  if (isImageSlotToken(value)) {
    found.add(imageSlotName(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkCollect(item, found);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) walkCollect(item, found);
  }
}

/** Walk any nested structure (a BuilderNode[] tree, a props object, a lone string) and return every distinct IMAGE_SLOT name referenced, sorted. */
export function collectImageSlots(value: unknown): string[] {
  const found = new Set<string>();
  walkCollect(value, found);
  return [...found].sort();
}

function walkReplace(value: unknown, resolved: Map<string, ResolvedImageSlot>, unresolved: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => walkReplace(item, resolved, unresolved));
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) {
      out[key] = walkReplace(item, resolved, unresolved);
    }
    if (typeof out.src === "string" && isImageSlotToken(out.src)) {
      const slot = imageSlotName(out.src);
      const pick = resolved.get(slot);
      if (pick) {
        out.src = pick.src;
        out.mediaId = pick.mediaId;
      } else {
        unresolved.add(slot);
      }
    }
    return out;
  }
  return value;
}

/**
 * Deep-clone `tree` and replace every `{ ..., src: IMAGE_SLOT(name), ... }`
 * occurrence with the resolved `{ src, mediaId }`. Any slot referenced in the
 * tree but absent from `resolved` is left untouched (still a token string) and
 * reported back in `unresolvedTokens` — the caller must abort rather than
 * write a tree containing one of these.
 */
export function applyImageSlotResolution(
  tree: unknown,
  resolved: Map<string, ResolvedImageSlot>,
): { tree: unknown; unresolvedTokens: string[] } {
  const unresolved = new Set<string>();
  const cloned = structuredClone(tree);
  const next = walkReplace(cloned, resolved, unresolved);
  return { tree: next, unresolvedTokens: [...unresolved].sort() };
}

/** Resolve a single bare string field (e.g. `seo.ogImageUrl`) that may itself be an IMAGE_SLOT token — not nested under a `src` key, so {@link applyImageSlotResolution}'s object-walk doesn't touch it. Returns the original value unchanged when it is not a slot token. */
export function resolveSingleImageSlotValue(
  value: string | undefined,
  resolved: Map<string, ResolvedImageSlot>,
): { value: string | undefined; unresolvedToken: string | null } {
  if (value === undefined || !isImageSlotToken(value)) return { value, unresolvedToken: null };
  const slot = imageSlotName(value);
  const pick = resolved.get(slot);
  if (pick) return { value: pick.src, unresolvedToken: null };
  return { value, unresolvedToken: slot };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface ResolvedImageSlot {
  slot: string;
  mediaId: string;
  src: string;
  alt: string | null;
  filename: string;
  /** "pinned" when image-slots.json named this exact asset; "fallback" when the deterministic pick kicked in. */
  origin: "pinned" | "fallback";
}

export interface ImageSlotResolutionResult {
  resolved: Map<string, ResolvedImageSlot>;
  /** Slots with neither a usable pin nor any approved image to fall back to (e.g. an empty tenant library). Caller must abort. */
  unresolvedSlots: string[];
  /** Non-fatal — e.g. a pin pointed at a deleted/unapproved asset and curation fell back instead. */
  warnings: string[];
  /** Human-readable table, ready to print. */
  report: string;
}

function filenameFromStoragePath(storagePath: string): string {
  const parts = storagePath.split("/");
  return parts[parts.length - 1] || storagePath;
}

/** FNV-1a — deterministic, dependency-free, stable across Node versions. Used only to pick a fallback image index; not a security hash. */
function stableSlotHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Resolve every slot in `slots` against the tenant's approved image library.
 * Never writes anything. Always returns a full report — the caller decides
 * whether to print it, but MUST print it before using `resolved` to write a
 * page (see the module header).
 */
export async function resolveImageSlots(
  supabase: SupabaseClient,
  tenantId: string,
  slots: readonly string[],
  pins: ImageSlotPinFile,
): Promise<ImageSlotResolutionResult> {
  const library = await listTenantMediaLibrary(supabase, tenantId);
  const images = library
    .filter((item): item is MediaLibraryItem => item.assetKind === "image")
    .slice()
    .sort((a, b) => {
      const byDate = a.createdAt.localeCompare(b.createdAt);
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });
  const byId = new Map(images.map((item) => [item.id, item] as const));

  const resolved = new Map<string, ResolvedImageSlot>();
  const unresolvedSlots: string[] = [];
  const warnings: string[] = [];
  const orderedSlots = [...new Set(slots)].sort();

  for (const slot of orderedSlots) {
    const pinnedId = pins.pins[slot];
    let item: MediaLibraryItem | undefined;
    let origin: ResolvedImageSlot["origin"] = "fallback";

    if (pinnedId) {
      item = byId.get(pinnedId);
      if (item) {
        origin = "pinned";
      } else {
        warnings.push(
          `Slot "${slot}" is pinned to media id ${pinnedId} in image-slots.json, but that id is not an approved image in this tenant's library right now. Falling back to a deterministic pick — fix the pin or approve the asset.`,
        );
      }
    }

    if (!item) {
      if (images.length === 0) {
        unresolvedSlots.push(slot);
        continue;
      }
      item = images[stableSlotHash(slot) % images.length];
      origin = "fallback";
    }

    resolved.set(slot, {
      slot,
      mediaId: item.id,
      src: item.publicUrl,
      alt: item.alt,
      filename: filenameFromStoragePath(item.storagePath),
      origin,
    });
  }

  return {
    resolved,
    unresolvedSlots,
    warnings,
    report: formatImageSlotReport(orderedSlots, resolved, unresolvedSlots, warnings),
  };
}

export function formatImageSlotReport(
  slots: readonly string[],
  resolved: Map<string, ResolvedImageSlot>,
  unresolvedSlots: readonly string[],
  warnings: readonly string[],
): string {
  const lines: string[] = [];
  lines.push("Image slot resolution");
  lines.push("======================");
  if (slots.length === 0) {
    lines.push("(no IMAGE_SLOT references found)");
  } else {
    const slotWidth = Math.max(4, ...slots.map((s) => s.length));
    const originWidth = 8;
    lines.push(
      `${"SLOT".padEnd(slotWidth)}  ${"ORIGIN".padEnd(originWidth)}  MEDIA ID                              FILENAME                       URL`,
    );
    for (const slot of slots) {
      const pick = resolved.get(slot);
      if (!pick) continue; // unresolved slots are listed separately below
      lines.push(
        `${slot.padEnd(slotWidth)}  ${pick.origin.padEnd(originWidth)}  ${pick.mediaId.padEnd(36)}  ${pick.filename.padEnd(28)}  ${pick.src}`,
      );
    }
  }
  if (unresolvedSlots.length > 0) {
    lines.push("");
    lines.push("UNRESOLVED (no pin and no approved image to fall back to — the run will abort):");
    for (const slot of unresolvedSlots) lines.push(`  - ${slot}`);
  }
  if (warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of warnings) lines.push(`  - ${warning}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Standalone CLI — preview slot resolution without seeding anything.
//
//   npx tsx scripts/impronta-rebuild/media-curation.ts \
//     --tenant=<tenant-uuid-or-slug> --slots=home-hero,about-team-1
//
// Reads web/.env.local for Supabase credentials. Read-only — never writes.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { loadEnvLocal } = await import("../load-env-local.mjs");
  loadEnvLocal();
  const { createClient } = await import("@supabase/supabase-js");

  const argv = process.argv.slice(2);
  const value = (name: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

  const tenantArg = value("tenant");
  const slotsArg = value("slots");
  if (!tenantArg || !slotsArg) {
    console.error(
      "Usage: npx tsx scripts/impronta-rebuild/media-curation.ts --tenant=<uuid-or-slug> --slots=slot-a,slot-b",
    );
    process.exitCode = 1;
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (web/.env.local).");
    process.exitCode = 1;
    return;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantArg);
  let tenantId = tenantArg;
  if (!isUuid) {
    const { data, error } = await supabase
      .from("agencies")
      .select("id")
      .eq("slug", tenantArg)
      .maybeSingle<{ id: string }>();
    if (error || !data) {
      console.error(`Could not resolve tenant slug "${tenantArg}" to an agency id.`);
      process.exitCode = 1;
      return;
    }
    tenantId = data.id;
  }

  const slots = slotsArg.split(",").map((s) => s.trim()).filter(Boolean);
  const pins = loadImageSlotPins();
  const result = await resolveImageSlots(supabase, tenantId, slots, pins);
  console.log(result.report);
  if (result.unresolvedSlots.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
