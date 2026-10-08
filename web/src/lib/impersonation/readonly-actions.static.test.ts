import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "../quality/supabase-unchecked-read";

/**
 * TUL-256. Staff impersonation is READ-ONLY for the target. Every exported async
 * function in every `"use server"` file of the client portal and talent portal
 * must either call the shared guard (`lib/impersonation/readonly-guard`) as its
 * FIRST awaited statement, or sit on the allow-list below with a reason.
 */

const GUARD_CALL = /\b(?:assertNotImpersonating|requireNotImpersonating)\s*\(/;
/** The guard must appear within this many lines of the function's opening brace. */
const WINDOW_LINES = 8;

const ROUTE_TREES = [
  "src/app/(workspace)/[tenantSlug]/client",
  "src/app/(workspace)/[tenantSlug]/talent",
  "src/app/(workspace)/talent",
];

/** Portal-only `"use server"` files that live under lib/ or components/. */
const PORTAL_LIB_FILES = [
  "src/lib/server-actions/client-guest-merge.ts",
  "src/lib/server-actions/notifications-self.ts",
  "src/lib/server-actions/client-inquiry-attachments.ts",
  "src/lib/reviews/review-media-actions.ts",
  "src/lib/talent/faq-editor-actions.ts",
  "src/lib/talent/fulfillment-actions.ts",
  "src/lib/talent/location-settings-actions.ts",
  "src/lib/talent/offering-booking-rules-action.ts",
  "src/lib/talent/services-settings-actions.ts",
  "src/lib/talent/translation-coverage-actions.ts",
  "src/lib/talent-agenda/cancel-actions.ts",
  "src/lib/talent-agenda/reschedule-actions.ts",
  "src/lib/talent-site/server/maison-choices-actions.ts",
  "src/lib/talent-site/server/maison-import-actions.ts",
  "src/lib/talent-site/server/maison-options-actions.ts",
  "src/lib/talent-site/server/maison-review-actions.ts",
  "src/lib/talent-site/server/page-text-i18n-actions.ts",
  "src/lib/talent-site/server/site-activation-state.ts",
  "src/lib/talent-site/server/site-logo-actions.ts",
  "src/lib/talent-site/server/theme-actions.ts",
  "src/lib/talent-site/server/talent-domain-purchase-actions.ts",
  "src/lib/talent-site/server/talent-site-domain-actions.ts",
  "src/lib/talent-site/server/maison-apply-actions.ts",
  "src/lib/talent-site/theme-releases/talent-update/talent-update-actions.ts",
  "src/components/talent/website-settings/website-settings-switches-action.ts",
  "src/components/talent/website-settings/call-number-action.ts",
  "src/components/talent/website-settings/live-status-action.ts",
  "src/components/talent/site/theme-gallery/gallery-bootstrap-action.ts",
  "src/components/talent/site/maison-setup/maison-setup-bootstrap.ts",
  "src/lib/billing/fee-payer-actions.ts",
  "src/lib/messaging/mint-talent-offering-intent.ts",
  "src/lib/server-actions/talent-plan-summary.ts",
  "src/lib/server-actions/talent-self-provision.ts",
  "src/lib/server-actions/talent-workspace-provision.ts",
  "src/lib/server-actions/talent-media-release.ts",
  "src/lib/server-actions/ai-writing-helper.ts",
];

const READ = "pure loader: reads only, no write path, nothing for read-only mode to protect";

/** Allow-list: [file suffix, function names, reason]. */
const ALLOW: Array<[string, string[], string]> = [
  ["lib/server-actions/notifications-self.ts", ["loadMyNotifications"], READ],
  ["lib/server-actions/client-inquiry-attachments.ts", ["listInquiryAttachmentsAsClient"], READ],
  ["talent/settings/actions.ts", ["loadTalentDefaultCurrency"], READ],
  [
    "talent/settings/payouts/actions.ts",
    ["loadTalentPayoutSnapshot", "loadTalentStablecoinEligibility", "loadTalentGpStatus", "loadTalentGpPrefillAction", "loadTalentGpMethods"],
    READ,
  ],
  ["talent/inbox/[id]/actions.ts", ["loadTalentInquiryThread", "loadTalentInquiryLineupCount", "loadTalentInquiryGuestTrust"], READ],
  [
    "talent/inbox/[id]/coordinator-offer-loader.ts",
    ["loadCoordinatorInquiryOffer"],
    `${READ}; shared with staff admin, which must keep working`,
  ],
  [
    "talent/site/actions.ts",
    ["assertTalentPersonalSiteBuilderAccess"],
    "access check that returns a verdict and writes nothing",
  ],
  ["lib/talent/faq-editor-actions.ts", ["loadMyFaqItems"], READ],
  ["lib/talent/fulfillment-actions.ts", ["loadTalentOrders"], READ],
  ["lib/talent/location-settings-actions.ts", ["loadLocationSettings"], READ],
  ["lib/talent/services-settings-actions.ts", ["loadSellingDefaults", "loadCategoryOrder", "loadOfferingDestinations", "loadAddonGroups"], READ],
  ["lib/talent/translation-coverage-actions.ts", ["loadTranslationCoverage", "suggestTalentPrimaryLocaleAction"], `${READ} (the locale suggestion is computed, never stored)`],
  ["lib/talent-agenda/cancel-actions.ts", ["cancelPaymentPreview"], "preview of a refund amount; the money move is cancelBookingWithRefund, which is guarded"],
  ["lib/talent-site/server/maison-choices-actions.ts", ["loadMaisonResumeCardAction"], READ],
  ["lib/talent-site/server/maison-import-actions.ts", ["loadMaisonImportPreviewAction", "loadGalleryImportPreviewAction", "loadLatestMaisonImportBatchAction"], READ],
  ["lib/talent-site/server/maison-options-actions.ts", ["loadMaisonDesignOptionsStateAction"], READ],
  ["lib/talent-site/server/maison-review-actions.ts", ["loadMaisonReviewStateAction"], READ],
  ["lib/talent-site/server/page-text-i18n-actions.ts", ["loadMaxSitePageTextAction"], READ],
  ["lib/talent-site/server/site-activation-state.ts", ["loadTalentSiteActivationStateAction"], READ],
  ["lib/talent-site/server/talent-domain-purchase-actions.ts", ["isTalentDomainSearchConfiguredAction", "searchTalentDomainAction"], "registrar availability lookup; no charge and no row written until checkout, which is guarded"],
  ["lib/talent-site/server/talent-site-domain-actions.ts", ["loadTalentSiteDomainsForPanel"], READ],
  ["lib/talent-site/server/maison-apply-actions.ts", ["loadMaisonApplyUndoStateAction"], READ],
  ["lib/talent-site/theme-releases/talent-update/talent-update-actions.ts", ["loadThemeUpdateNoticesAction", "previewThemeUpdateAction", "loadAvailableBlocksAction"], READ],
  ["components/talent/website-settings/website-settings-switches-action.ts", ["loadSiteSwitchesAction"], READ],
  ["components/talent/website-settings/call-number-action.ts", ["loadCallNumberAction"], READ],
  ["components/talent/website-settings/live-status-action.ts", ["loadLiveStatusAction"], READ],
  ["components/talent/site/theme-gallery/gallery-bootstrap-action.ts", ["loadThemeGalleryBootstrapAction"], READ],
  ["components/talent/site/maison-setup/maison-setup-bootstrap.ts", ["loadMaisonSetupBootstrapAction"], READ],
  ["lib/billing/fee-payer-actions.ts", ["getFeePayer"], READ],
  ["lib/server-actions/talent-plan-summary.ts", ["loadTalentPlanSummary"], READ],
  ["lib/server-actions/talent-media-release.ts", ["actionLoadTalentMediaLocks"], READ],
  ["lib/server-actions/ai-writing-helper.ts", ["loadMyBio"], READ],
];

export type Finding = { name: string; guarded: boolean };

function hasUseServerDirective(src: string): boolean {
  let rest = src;
  for (;;) {
    rest = rest.replace(/^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/, "");
    const m = /^(["'])([^"'\n]*)\1\s*;?/.exec(rest);
    if (!m) return false;
    if (m[2] === "use server") return true;
    rest = rest.slice(m[0].length);
  }
}

function closeParen(s: string, from: number): number {
  let d = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")" && --d === 0) return i;
  }
  return -1;
}

/** Index of the `{` opening the function body, skipping a return annotation. */
function bodyOpen(s: string, from: number): number {
  let d = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === "=" && s[i + 1] === ">") {
      i++;
    } else if (c === "{" && d === 0) {
      return i;
    } else if ("<{([".includes(c)) {
      d++;
    } else if (">})]".includes(c)) {
      d--;
    }
  }
  return -1;
}

/** Every exported async function / arrow const in a `"use server"` source. */
export function scanActions(src: string): Finding[] {
  if (!hasUseServerDirective(src)) return [];
  const out: Finding[] = [];
  const fn = /^export\s+async\s+function\s+(\w+)\s*(?:<[^>(]*>)?\s*\(/gm;
  let m: RegExpExecArray | null;
  const starts: Array<{ name: string; at: number; paren: number }> = [];
  while ((m = fn.exec(src))) starts.push({ name: m[1], at: m.index, paren: m.index + m[0].length - 1 });
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const open = bodyOpen(src, closeParen(src, s.paren) + 1);
    // Bounded by the next export so a neighbour's guard can never count.
    const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
    const head = src.slice(open + 1, end).split("\n").slice(0, WINDOW_LINES + 1).join("\n");
    const hit = GUARD_CALL.exec(head);
    // First AWAITED statement: nothing awaited may precede the guard.
    const guarded = hit !== null && !/\bawait\b/.test(head.slice(0, hit.index).replace(/(?:\(\s*)?\bawait\s*$/, ""));
    out.push({ name: s.name, guarded });
  }
  const arrow = /^export\s+(?:const|let)\s+(\w+)\s*=\s*(?:async\b|\()/gm;
  while ((m = arrow.exec(src))) out.push({ name: m[1], guarded: false });
  return out;
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
}

function allowedFor(file: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const [suffix, names, reason] of ALLOW) {
    if (file.endsWith(suffix)) for (const n of names) m.set(n, reason);
  }
  return m;
}

function portalFiles(): string[] {
  const files: string[] = [];
  for (const tree of ROUTE_TREES) {
    const abs = join(WEB_ROOT, tree);
    if (existsSync(abs)) walk(abs, files);
  }
  for (const f of PORTAL_LIB_FILES) files.push(join(WEB_ROOT, f));
  return files.map((f) => relative(WEB_ROOT, f));
}

test("every portal server action is guarded or explicitly allow-listed", () => {
  const bad: string[] = [];
  let guarded = 0;
  let allowed = 0;
  let serverFiles = 0;
  const usedAllow = new Set<string>();
  for (const rel of portalFiles()) {
    const src = readFileSync(join(WEB_ROOT, rel), "utf8");
    if (!hasUseServerDirective(src)) continue;
    serverFiles += 1;
    const allow = allowedFor(rel);
    for (const f of scanActions(src)) {
      if (f.guarded) {
        guarded += 1;
        assert.ok(!allow.has(f.name), `${rel}: ${f.name} is guarded AND allow-listed; drop the allow entry`);
      } else if (allow.has(f.name)) {
        allowed += 1;
        usedAllow.add(`${rel}::${f.name}`);
      } else {
        bad.push(`${rel}: ${f.name}`);
      }
    }
  }
  assert.ok(serverFiles >= 40, `only ${serverFiles} portal "use server" files found; the file lists are broken`);
  assert.ok(guarded >= 90, `only ${guarded} guarded actions found; detection is broken`);
  assert.ok(allowed >= 40, `only ${allowed} allow-listed actions found; detection is broken`);
  assert.deepEqual(bad, [], `unguarded portal server actions (call assertNotImpersonating()/requireNotImpersonating() first):\n${bad.join("\n")}`);
  // Every allow entry must still name a real exported function.
  const stale: string[] = [];
  for (const [suffix, names] of ALLOW) {
    const rel = portalFiles().find((r) => r.endsWith(suffix));
    assert.ok(rel, `allow-list file not found: ${suffix}`);
    for (const n of names) if (!usedAllow.has(`${rel}::${n}`)) stale.push(`${suffix}::${n}`);
  }
  assert.deepEqual(stale, [], `stale allow-list entries:\n${stale.join("\n")}`);
});

test("every allow-list entry carries a reason", () => {
  for (const [suffix, names, reason] of ALLOW) {
    assert.ok(names.length > 0 && reason.trim().length > 10, `${suffix} needs names and a reason`);
  }
});

const HEAD = `"use server";\nimport { x } from "y";\n`;

test("GUARD BITES: an unguarded action is caught", () => {
  const src = `${HEAD}export async function save(a: string): Promise<void> {\n  await write(a);\n}\n`;
  assert.deepEqual(scanActions(src), [{ name: "save", guarded: false }]);
});

test("GUARD BITES: a guard that comes after another await does not count", () => {
  const src = `${HEAD}export async function save(): Promise<{ ok: boolean }> {\n  const s = await session();\n  await requireNotImpersonating();\n  return { ok: true };\n}\n`;
  assert.deepEqual(scanActions(src), [{ name: "save", guarded: false }]);
});

test("GUARD BITES: a guard buried past the window does not count", () => {
  const filler = Array.from({ length: 12 }, (_, i) => `  const a${i} = ${i};`).join("\n");
  const src = `${HEAD}export async function save(): Promise<void> {\n${filler}\n  await requireNotImpersonating();\n}\n`;
  assert.equal(scanActions(src)[0].guarded, false);
});

test("GUARD BITES: an exported async arrow const is reported as unguarded", () => {
  const src = `${HEAD}export const save = async () => {\n  await requireNotImpersonating();\n};\n`;
  assert.deepEqual(scanActions(src), [{ name: "save", guarded: false }]);
});

test("GUARD PASSES: guarded forms are recognised", () => {
  const src =
    `${HEAD}export async function a(input: { x: string }): Promise<{ ok: true } | { ok: false; error: string }> {\n` +
    `  const readOnly = await assertNotImpersonating();\n  if (!readOnly.ok) return readOnly;\n  return { ok: true };\n}\n` +
    `export async function b(): Promise<{ ok: boolean }> {\n  if (!(await assertNotImpersonating()).ok) return { ok: false };\n  return { ok: true };\n}\n` +
    `export async function c(f: FormData): Promise<never> {\n  await requireNotImpersonating();\n  throw new Error("x");\n}\n`;
  assert.deepEqual(scanActions(src), [
    { name: "a", guarded: true },
    { name: "b", guarded: true },
    { name: "c", guarded: true },
  ]);
});

test("GUARD PASSES: a non-server file is not scanned, and allow-list lookup works", () => {
  assert.deepEqual(scanActions(`export async function save(): Promise<void> {}\n`), []);
  assert.equal(allowedFor("src/lib/talent/faq-editor-actions.ts").get("loadMyFaqItems"), READ);
  assert.equal(allowedFor("src/lib/talent/faq-editor-actions.ts").has("saveMyFaqItems"), false);
});
