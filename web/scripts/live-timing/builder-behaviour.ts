/**
 * Builder BEHAVIOUR checks (TUL-78 / TUL-79 / TUL-87): the pure parts, unit-tested without a browser or a database.
 *
 * The spec (`e2e-live/builder-behaviour.spec.ts`) drives the talent page builder on production as the TEST talent
 * TAL-93900 and ONLY ever touches its sandbox site (`jorg-beauty-qa`). Everything that decides pass or fail, or that
 * guards a write, lives here so it can fail in a unit test:
 *   - the sandbox guard (profile code AND site slug) and the publish-action guard;
 *   - the draft snapshot and the KEYED restore plan (never an unkeyed update);
 *   - geometry verdicts (viewport fit, shift, rect intersection, block order, ghost text, device-switch budget);
 *   - a tiny generated PNG and the qa-harness file-name rules for the media cleanup;
 *   - the result table printed at the end.
 */
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import { assertTestTalent, TEST_TALENT_CODE } from "./timing-harness";

export const SANDBOX_SLUG = "jorg-beauty-qa";
export const QA_FILE_PREFIX = "qa-harness-";
/** Stated budget: a device switch (desktop, tablet, mobile) must re-lay-out the canvas within this. */
export const DEVICE_SWITCH_BUDGET_MS = 1500;
export const VIEWPORTS = { desktop: 1280, tablet: 768, phone: 390 } as const;

/** Names of actions the spec may perform. Anything publish-like is refused before it runs. */
const PUBLISH_LIKE = /\b(publish|unpublish|publicar|go\s*live|promote|release|ship)\b/i;

export function assertSandbox(input: { code: string; slug: string | null | undefined }): void {
  assertTestTalent(input.code);
  if ((input.slug ?? "") !== SANDBOX_SLUG) {
    throw new Error(`REFUSED: the builder-behaviour spec only runs on site "${SANDBOX_SLUG}", not "${input.slug ?? ""}".`);
  }
}

/** Throws for any publish-like action name. Every UI step in the spec goes through this. */
export function assertSafeAction(name: string): string {
  if (PUBLISH_LIKE.test(name)) throw new Error(`REFUSED: "${name}" looks like a publish action; this spec is draft-only.`);
  return name;
}

// ---------------------------------------------------------------- draft snapshot and keyed restore

export type JsonRow = Record<string, unknown>;

export interface DraftSnapshot {
  takenAt: string;
  code: string;
  slug: string;
  profileId: string;
  site: JsonRow;
  pages: JsonRow[];
}

/** Columns that hold DRAFT state and are written back. Nothing published is ever restored or touched. */
export const SITE_DRAFT_COLUMNS = ["shell_tree", "draft_rev", "style_classes", "style_presets"] as const;
export const PAGE_DRAFT_COLUMNS = ["blocks", "theme", "status"] as const;

export function buildSnapshot(input: { code: string; slug: string; profileId: string; site: JsonRow; pages: JsonRow[]; now?: Date }): DraftSnapshot {
  assertSandbox({ code: input.code, slug: input.slug });
  if (!input.profileId) throw new Error("REFUSED: no profile id for the snapshot.");
  if (input.site.talent_profile_id !== input.profileId) throw new Error("REFUSED: the site row does not belong to this profile id.");
  if (input.site.site_slug !== SANDBOX_SLUG) throw new Error(`REFUSED: the site row slug is not "${SANDBOX_SLUG}".`);
  for (const p of input.pages) {
    if (p.talent_profile_id !== input.profileId) throw new Error("REFUSED: a page row does not belong to this profile id.");
  }
  return { takenAt: (input.now ?? new Date()).toISOString(), code: input.code.trim().toUpperCase(), slug: input.slug, profileId: input.profileId, site: input.site, pages: input.pages };
}

export interface RestoreOp {
  table: "talent_sites" | "talent_pages";
  values: JsonRow;
  /** Every key must be present and non-empty: the update is `.eq()` on all of them. */
  match: Record<string, string>;
}

const pick = (row: JsonRow, cols: readonly string[]): JsonRow => {
  const out: JsonRow = {};
  for (const c of cols) if (c in row) out[c] = row[c];
  return out;
};

/** The restore, as data: one keyed update per page and one for the site. */
export function planRestore(snap: DraftSnapshot): RestoreOp[] {
  assertSandbox({ code: snap.code, slug: snap.slug });
  const ops: RestoreOp[] = [
    { table: "talent_sites", values: pick(snap.site, SITE_DRAFT_COLUMNS), match: { id: String(snap.site.id ?? ""), talent_profile_id: snap.profileId, site_slug: snap.slug } },
    ...snap.pages.map((p): RestoreOp => ({ table: "talent_pages", values: pick(p, PAGE_DRAFT_COLUMNS), match: { id: String(p.id ?? ""), talent_profile_id: snap.profileId } })),
  ];
  for (const op of ops) assertKeyedOp(op);
  return ops;
}

/** Refuses an op without a full key (an unkeyed update would rewrite every row of a table). */
export function assertKeyedOp(op: RestoreOp): void {
  const needed = op.table === "talent_sites" ? ["id", "talent_profile_id", "site_slug"] : ["id", "talent_profile_id"];
  for (const k of needed) {
    if (!op.match[k]) throw new Error(`REFUSED: restore of ${op.table} is missing key "${k}".`);
  }
  if (Object.keys(op.values).length === 0) throw new Error(`REFUSED: restore of ${op.table} has nothing to write.`);
  const forbidden = Object.keys(op.values).filter((c) => /published|publish/i.test(c));
  if (forbidden.length) throw new Error(`REFUSED: restore must never write published columns (${forbidden.join(", ")}).`);
}

/** Snapshot file: a fresh 0700 dir and a 0600 file. The dir name matches deleteTempState's guard. */
export function writeSnapshotFile(snap: DraftSnapshot, dirOverride?: string): string {
  const dir = mkdtempSync(join(dirOverride ?? tmpdir(), "tulala-timing-snap-"));
  chmodSync(dir, 0o700);
  const file = join(dir, "snapshot.json");
  writeFileSync(file, JSON.stringify(snap), { mode: 0o600 });
  return file;
}

// ---------------------------------------------------------------- media rules

export const qaHarnessFileName = (ts: number): string => `${QA_FILE_PREFIX}${ts}.png`;
export const isQaHarnessFile = (name: string | null | undefined): boolean => typeof name === "string" && name.startsWith(QA_FILE_PREFIX) && name.endsWith(".png");

const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** A valid solid-colour RGB PNG (default 16x16), a few hundred bytes. */
export function tinyPng(size = 16, rgb: readonly [number, number, number] = [124, 58, 237]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- geometry and order verdicts

export interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }

export function withinViewport(r: Rect, viewportWidth: number, tolerancePx = 1): boolean {
  return r.width > 0 && r.left >= -tolerancePx && r.right <= viewportWidth + tolerancePx;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export interface Placement { scrollX: number; canvasLeft: number; blockLeft: number }
/** Horizontal shift of the canvas between two samples; 0 when stable. */
export function horizontalShift(before: Placement, after: Placement): number {
  return Math.max(Math.abs(after.scrollX - before.scrollX), Math.abs(after.canvasLeft - before.canvasLeft), Math.abs(after.blockLeft - before.blockLeft));
}

/** New block must be the ONE added id, directly after the selected block. */
export function landsAfterSelected(before: readonly string[], after: readonly string[], selectedId: string): { ok: boolean; newId: string | null; expectedIndex: number; actualIndex: number } {
  const expectedIndex = before.indexOf(selectedId) + 1;
  const added = after.filter((id) => !before.includes(id));
  const newId = added.length === 1 ? added[0]! : null;
  const actualIndex = newId ? after.indexOf(newId) : -1;
  return { ok: before.includes(selectedId) && newId !== null && actualIndex === expectedIndex && after.length === before.length + 1, newId, expectedIndex, actualIndex };
}

/** After an inline edit the old text count must drop by exactly the one occurrence that was edited. */
export function noGhostText(oldTextCountBefore: number, oldTextCountAfter: number): boolean {
  return oldTextCountAfter === Math.max(0, oldTextCountBefore - 1);
}

export const countOccurrences = (haystack: string, needle: string): number => (needle ? haystack.split(needle).length - 1 : 0);

export const deviceSwitchWithinBudget = (ms: number, budget = DEVICE_SWITCH_BUDGET_MS): boolean => Number.isFinite(ms) && ms >= 0 && ms <= budget;

/**
 * The Mobile health panel must agree with the page: horizontal overflow on the phone means it must NOT say "All clear".
 * Catches a panel that reports clean while the phone page scrolls sideways.
 */
export function mobileHealthConsistent(input: { docOverflowPx: number; panelText: string }): { ok: boolean; reason: string } {
  const says = input.panelText;
  const clear = /all clear|todo en orden|sin problemas/i.test(says);
  const flags = /block publish|blocks publish|advisor/i.test(says);
  if (input.docOverflowPx > 1 && clear) return { ok: false, reason: `page overflows by ${input.docOverflowPx}px but the panel says all clear` };
  if (!clear && !flags) return { ok: false, reason: "the panel shows neither All clear nor an issue count" };
  return { ok: true, reason: clear ? "no overflow, all clear" : "issues flagged" };
}

// ---------------------------------------------------------------- results

export interface CheckResult { ticket: "TUL-78" | "TUL-79" | "TUL-87"; name: string; pass: boolean; ms: number; note?: string }

export function formatResultTable(rows: readonly CheckResult[]): string {
  const w = Math.max(10, ...rows.map((r) => `${r.ticket} ${r.name}`.length));
  const head = `${"check".padEnd(w)}  result  ms`;
  const lines = rows.map((r) => `${`${r.ticket} ${r.name}`.padEnd(w)}  ${(r.pass ? "pass" : "FAIL").padEnd(6)}  ${String(r.ms).padStart(5)}${r.pass || !r.note ? "" : `  ${r.note.slice(0, 140)}`}`);
  const failed = rows.filter((r) => !r.pass).length;
  return [head, ...lines, `${rows.length - failed} passed, ${failed} failed (as ${TEST_TALENT_CODE}, site ${SANDBOX_SLUG}, draft only)`].join("\n");
}
