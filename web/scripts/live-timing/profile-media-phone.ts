/**
 * TUL-224 (profile media action timing) and TUL-106 (phone sticky booking bar): the pure parts, unit-tested without a
 * browser or a database. The spec is `e2e-live/profile-media-and-phone.spec.ts`.
 *
 * Safety rules, all enforced here and tested:
 *   - the caption restore plan is only ever built for the TEST talent TAL-93900 and is KEYED on asset id AND owner
 *     profile id (never an unkeyed update);
 *   - the phone check never fills or submits the booking form: every action name goes through
 *     `assertSafeBookingAction`, which refuses submit / book now / confirm / reserve / pay (and the Spanish forms).
 */
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertTestTalent, TEST_TALENT_CODE } from "./timing-harness";

export const CAPTION_TEST_TEXT = "qa-harness-caption";
export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
export const PHONE_SITE = "https://jorg-beauty-qa.tulala.digital";
/** Stated budget for a caption save (click to confirmed). Reported, not asserted as a hard fail on slow networks. */
export const CAPTION_SAVE_BUDGET_MS = 3000;

// ---------------------------------------------------------------- timing summary

export interface DurationSummary {
  n: number;
  minMs: number;
  maxMs: number;
  medianMs: number;
  meanMs: number;
}

/** Summary of a list of durations in ms; non-finite and negative values are dropped. Empty input gives zeros. */
export function summarizeDurations(samples: readonly number[]): DurationSummary {
  const v = samples.filter((s) => Number.isFinite(s) && s >= 0).sort((a, b) => a - b);
  if (v.length === 0) return { n: 0, minMs: 0, maxMs: 0, medianMs: 0, meanMs: 0 };
  const mid = Math.floor(v.length / 2);
  const median = v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return { n: v.length, minMs: Math.round(v[0]!), maxMs: Math.round(v[v.length - 1]!), medianMs: Math.round(median), meanMs: Math.round(mean) };
}

export interface CaptionTimingSample {
  /** Click (blur) to the server action response finished. */
  actionResponseMs: number | null;
  /** Click (blur) to the saved caption being confirmed in the page (input stable, no error) and in the database. */
  clickToSavedMs: number | null;
  /** The server action request/response pair that was matched, e.g. "POST 200". */
  actionLabel: string;
}

export function formatCaptionTiming(s: CaptionTimingSample, budgetMs = CAPTION_SAVE_BUDGET_MS): string {
  const fmt = (ms: number | null) => (ms === null ? "n/a" : `${ms} ms`);
  const verdict = s.clickToSavedMs === null ? "NOT CONFIRMED" : s.clickToSavedMs <= budgetMs ? "within budget" : "OVER budget";
  return `caption save: click-to-saved ${fmt(s.clickToSavedMs)} (${verdict}, budget ${budgetMs} ms), server action response ${fmt(s.actionResponseMs)} [${s.actionLabel}]`;
}

// ---------------------------------------------------------------- caption restore plan

export interface CaptionOriginal {
  /** `metadata.caption` before the run; null when the key was absent. */
  caption: string | null;
  /** `metadata.caption_i18n` before the run; null when the key was absent. */
  captionI18n: Record<string, string> | null;
}

export type MediaMetadata = Record<string, unknown>;

/** Reads the two caption fields exactly as the UI writes them (see photo-caption-edit.ts). Never mutates. */
export function readCaptionOriginal(metadata: MediaMetadata | null | undefined): CaptionOriginal {
  const m = metadata ?? {};
  const caption = typeof m.caption === "string" ? m.caption : null;
  const raw = m.caption_i18n;
  let captionI18n: Record<string, string> | null = null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    captionI18n = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") captionI18n[k] = v;
  }
  return { caption, captionI18n };
}

export interface CaptionRestorePlan {
  table: "media_assets";
  /** Every key is `.eq()`-ed on the update: the asset id AND the owning profile id. */
  match: { id: string; owner_talent_profile_id: string };
  /** The full metadata to write: the CURRENT metadata with only the two caption keys put back as they were. */
  metadata: MediaMetadata;
}

/**
 * Builds the keyed restore. Refuses anything but TAL-93900, an empty asset or profile id, and a profile that does
 * not own the asset. Every other metadata key (alt_i18n, albumId, ...) is carried through from `current`.
 */
export function planCaptionRestore(input: {
  code: string;
  profileId: string;
  assetId: string;
  assetOwnerProfileId: string | null | undefined;
  original: CaptionOriginal;
  current: MediaMetadata | null | undefined;
}): CaptionRestorePlan {
  assertTestTalent(input.code);
  if (!input.profileId) throw new Error("REFUSED: no profile id for the caption restore.");
  if (!input.assetId) throw new Error("REFUSED: no asset id for the caption restore.");
  if (input.assetOwnerProfileId !== input.profileId) throw new Error("REFUSED: the media asset does not belong to this profile id.");
  const metadata: MediaMetadata = { ...(input.current ?? {}) };
  if (input.original.caption === null) delete metadata.caption;
  else metadata.caption = input.original.caption;
  if (input.original.captionI18n === null) delete metadata.caption_i18n;
  else metadata.caption_i18n = { ...input.original.captionI18n };
  return { table: "media_assets", match: { id: input.assetId, owner_talent_profile_id: input.profileId }, metadata };
}

/** True when the two caption fields equal the original (the restore is proven, not assumed). */
export function captionMatchesOriginal(metadata: MediaMetadata | null | undefined, original: CaptionOriginal): boolean {
  const now = readCaptionOriginal(metadata);
  return now.caption === original.caption && JSON.stringify(sortKeys(now.captionI18n)) === JSON.stringify(sortKeys(original.captionI18n));
}

function sortKeys(o: Record<string, string> | null): Array<[string, string]> | null {
  return o === null ? null : Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Which stored field the UI writes for the input's locale: the primary language goes to `caption`, any other to
 * `caption_i18n.<locale>` (mirrors applyCaptionEdit). Used to read the saved value back from the database.
 */
export function storedCaptionFor(metadata: MediaMetadata | null | undefined, locale: string, primaryLocale: string): string {
  const key = (s: string) => s.trim().toLowerCase().slice(0, 2);
  const o = readCaptionOriginal(metadata);
  if (!key(locale) || key(locale) === key(primaryLocale)) return o.caption ?? "";
  return o.captionI18n?.[key(locale)] ?? "";
}

/** The caption backup file: a 0700 dir and a 0600 file. The dir name matches deleteTempState's guard. */
export function writeCaptionBackup(input: { code: string; profileId: string; assetId: string; original: CaptionOriginal }, dirOverride?: string): string {
  assertTestTalent(input.code);
  const dir = mkdtempSync(join(dirOverride ?? tmpdir(), "tulala-timing-caption-"));
  chmodSync(dir, 0o700);
  const file = join(dir, "caption-backup.json");
  writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), ...input }), { mode: 0o600 });
  return file;
}

/** Picks the image to test on: the first non-harness image row owned by the profile (storage path with an image extension). */
export function pickCaptionAsset<T extends { id: string; storage_path: string | null }>(rows: readonly T[]): T | null {
  return rows.find((r) => typeof r.storage_path === "string" && /\.(jpe?g|png|webp|avif|gif)$/i.test(r.storage_path) && !/qa-harness-/.test(r.storage_path)) ?? null;
}

// ---------------------------------------------------------------- phone check guards

/** Action names the phone check must never use: anything that submits, confirms, reserves or pays. */
const BOOKING_SUBMIT_LIKE = /\b(submit|book\s*now|confirm\w*|reserve\w*|reservar|pay\w*|pagar|enviar|checkout)\b/i;

/** Throws for any submit-like action name. Every tap and click in the phone check goes through this. */
export function assertSafeBookingAction(name: string): string {
  if (BOOKING_SUBMIT_LIKE.test(name)) throw new Error(`REFUSED: "${name}" looks like a booking submit action; the phone check stops at the open sheet.`);
  return name;
}

/** The scroll offsets for `window.scrollTo` stepping, from 0 to `max` inclusive (never mouse.wheel). */
export function scrollSteps(max: number, step = 400): number[] {
  if (!Number.isFinite(max) || max <= 0 || step <= 0) return [0];
  const out: number[] = [];
  for (let y = 0; y < max; y += step) out.push(y);
  out.push(Math.floor(max));
  return out;
}

export interface PhoneTapObservation {
  /** A booking dialog (role=dialog, data-catalog-booking) is visible after the tap(s). */
  sheetOpen: boolean;
  /** The services menu is on screen after the tap (the idle bar only scrolls to it). */
  menuInView: boolean;
  /** The bar is fixed to the bottom edge and inside the 390 px viewport. */
  barFitsViewport: boolean;
}

/** Verdict: the sticky bar must lead somewhere (sheet open) or at least scroll the menu into view, and fit the phone. */
export function phoneTapVerdict(o: PhoneTapObservation): { ok: boolean; reason: string } {
  if (!o.barFitsViewport) return { ok: false, reason: "the sticky bar does not fit inside the 390 px viewport" };
  if (o.sheetOpen) return { ok: true, reason: "booking sheet opened" };
  if (o.menuInView) return { ok: true, reason: "idle bar scrolled the services menu into view (sheet opens after a service is chosen)" };
  return { ok: false, reason: "the tap neither opened the booking sheet nor brought the services menu into view" };
}

// ---------------------------------------------------------------- results

export interface MediaPhoneResult { ticket: "TUL-224" | "TUL-106"; name: string; pass: boolean; ms: number; note?: string }

export function formatMediaPhoneTable(rows: readonly MediaPhoneResult[]): string {
  const w = Math.max(10, ...rows.map((r) => `${r.ticket} ${r.name}`.length));
  const head = `${"check".padEnd(w)}  result  ms`;
  const lines = rows.map((r) => `${`${r.ticket} ${r.name}`.padEnd(w)}  ${(r.pass ? "pass" : "FAIL").padEnd(6)}  ${String(r.ms).padStart(5)}${r.note ? `  ${r.note.slice(0, 160)}` : ""}`);
  const failed = rows.filter((r) => !r.pass).length;
  return [head, ...lines, `${rows.length - failed} passed, ${failed} failed (caption as ${TEST_TALENT_CODE}; phone check looks only, never submits)`].join("\n");
}
