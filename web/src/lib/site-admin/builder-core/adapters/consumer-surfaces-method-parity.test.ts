/**
 * T0.1 · Adapter capability parity — every production-bound surface binds the
 * SAME public method set, so a "method on the interface that no surface binds"
 * fork (the REV-1 bug class) fails CI.
 *
 * (node:test + node:assert, NO vitest / React / Supabase — all deps injected.)
 *
 * BACKGROUND
 * ──────────
 * The shared `BuilderSurfaceAdapter` interface declares
 * `load / save / saveDraft / publish` (required) + `restoreRevision` (optional).
 * The program invariant is "one shared seam, no per-surface fork." The cautionary
 * precedent is REV-1: the PRODUCTION bindings for `cms_page` and the
 * talent-site-shell each implemented the interface slot but originally FAILED to
 * BIND `restoreRevision` — "a method no surface binds is a silent fork," and the
 * shared RevisionsDrawer was a no-op on those surfaces.
 *
 * This file locks the parity TWO ways:
 *
 *  (1) RUNTIME method-set parity — drive each PURE core factory (the same ones
 *      the production `createBound*` factories wrap) over a spy action set that
 *      supplies EVERY action incl. restore, then assert the resulting adapter
 *      exposes the IDENTICAL public method set across all five surfaces:
 *      { kind, load, save, saveDraft, publish, restoreRevision }. A surface whose
 *      core stops threading any of these fails here.
 *
 *  (2) PRODUCTION-BINDING text-scan — read the SOURCE TEXT of each bound-adapter
 *      module (`*-adapter.ts`, the files that wire the real "use server" actions)
 *      and assert each freeform binding wires `restoreRevision`. Importing those
 *      modules would pull the "use server" graph, so we scan text (the same model
 *      as `legacy-write-guard.static.test.ts`). This is the layer REV-1 broke: the
 *      core supported restore, but the production binding omitted it.
 *
 * Self-check: a planted "binding without restoreRevision" string is proven to be
 * caught by the text matcher before the real files are scanned.
 *
 * Lives in its own file (not appended to consumer-surfaces-adapter.test.ts) to
 * keep that file under the 800-line max-lines cap — extract, don't exceed.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  createHomepageAdapter,
  type HomepageAdapterActions,
} from "./homepage-adapter-core";
import {
  createTalentPageAdapter,
  type TalentPageAdapterActions,
} from "./talent-page-adapter-core";
import {
  createCmsPageAdapter,
  type CmsPageAdapterActions,
  type CmsFreeformPageRow,
} from "./cms-page-adapter-core";
import {
  createSiteShellAdapter,
  type SiteShellAdapterActions,
  type SiteShellRow,
} from "./site-shell-adapter-core";
import {
  createTalentSiteShellAdapter,
  type TalentSiteShellAdapterActions,
  type TalentSiteShellRow,
} from "./talent-site-shell-adapter-core";

import type { BuilderSurfaceAdapter } from "../surface-adapter";

const STAMP = (h: string) => new Date(`2026-06-17T${h}:00:00Z`).toISOString();

// ── The public method set every production-bound surface MUST expose ──────────
//
// `kind` + the four required mutators + the (now-universal across production
// surfaces) restoreRevision. The interface types restoreRevision as optional —
// but EVERY production surface binds it, so a surface that drops it is a fork.
const REQUIRED_PUBLIC_METHODS = [
  "load",
  "save",
  "saveDraft",
  "publish",
  "restoreRevision",
] as const;

// ── (1) Build each surface's adapter over a full spy action set ───────────────

function homepageAdapterFull(): BuilderSurfaceAdapter {
  const actions: HomepageAdapterActions = {
    async load() {
      return { ok: true, data: { sentinel: "load" } } as never;
    },
    async save() {
      return { ok: true, pageVersion: 1 } as never;
    },
    async saveDraft() {
      return { ok: true, pageVersion: 1, savedAt: STAMP("01") } as never;
    },
    async publish() {
      return { ok: true, pageVersion: 1, publishedAt: STAMP("02") } as never;
    },
    async restoreHomepageRevision() {
      return { ok: true, pageVersion: 1 } as never;
    },
    async restorePageRevision() {
      return { ok: true, pageVersion: 1 } as never;
    },
  };
  return createHomepageAdapter(actions);
}

function talentPageAdapterFull(): BuilderSurfaceAdapter {
  const row = {
    id: "tp-1",
    talent_profile_id: "p1",
    slug: "index",
    title: "Page",
    status: "draft" as const,
    blocks: [],
    theme: {},
    required_talent_tier: null,
    published_at: null,
    updated_at: STAMP("00"),
  };
  const actions: TalentPageAdapterActions = {
    async ensurePage() {
      return row;
    },
    async loadPage() {
      return row;
    },
    async savePage() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishPage() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
    async restoreRevision() {
      return { ok: true, updatedAt: STAMP("03") };
    },
  };
  return createTalentPageAdapter(actions, {
    talentProfileId: "p1",
    assertNoLegacyWrite() {},
  });
}

function cmsPageAdapterFull(): BuilderSurfaceAdapter {
  const row: CmsFreeformPageRow = {
    id: "cms-1",
    slug: "index",
    title: "Page",
    status: "draft",
    blocks: [],
    is_freeform: true,
    version: null,
    published_at: null,
    updated_at: STAMP("00"),
  };
  const actions: CmsPageAdapterActions = {
    async loadPage() {
      return row;
    },
    async savePage() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishPage() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
    async restoreRevision() {
      return { ok: true, updatedAt: STAMP("03") };
    },
  };
  return createCmsPageAdapter(actions, { assertNoLegacyWrite() {} });
}

function siteShellAdapterFull(): BuilderSurfaceAdapter {
  const row: SiteShellRow = {
    id: "shell-1",
    title: "Site shell",
    status: "draft",
    blocks: [],
    snapshotBuilderTree: null,
    version: null,
    published_at: null,
    updated_at: STAMP("00"),
  };
  const actions: SiteShellAdapterActions = {
    async loadShell() {
      return row;
    },
    async saveShell() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishShell() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
    async restoreRevision() {
      return { ok: true, updatedAt: STAMP("03") };
    },
  };
  return createSiteShellAdapter(actions, { assertNoLegacyWrite() {} });
}

function talentSiteShellAdapterFull(): BuilderSurfaceAdapter {
  const row: TalentSiteShellRow = {
    id: "ts-1",
    shellTree: [],
    shellPublished: [],
    sitePublishedAt: null,
    updatedAt: STAMP("00"),
  };
  const actions: TalentSiteShellAdapterActions = {
    async loadShell() {
      return row;
    },
    async saveShell() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishShell() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
    async restoreRevision() {
      return { ok: true, updatedAt: STAMP("03") };
    },
  };
  return createTalentSiteShellAdapter(actions, {
    talentProfileId: "p1",
    assertNoLegacyWrite() {},
  });
}

/** Every production-bound surface, built over a full (restore-capable) action set. */
const SURFACE_MATRIX: Array<{ surface: string; adapter: BuilderSurfaceAdapter }> = [
  { surface: "homepage", adapter: homepageAdapterFull() },
  { surface: "talent_page", adapter: talentPageAdapterFull() },
  { surface: "cms_page", adapter: cmsPageAdapterFull() },
  { surface: "site_shell", adapter: siteShellAdapterFull() },
  { surface: "talent_site_shell", adapter: talentSiteShellAdapterFull() },
];

test("[T0.1] every production-bound surface binds the IDENTICAL public method set", () => {
  // Build the reference signature from the first surface, then assert every
  // other surface matches it exactly — no surface adds or drops a method.
  const signatureOf = (a: BuilderSurfaceAdapter): string[] =>
    REQUIRED_PUBLIC_METHODS.filter(
      (m) => typeof (a as unknown as Record<string, unknown>)[m] === "function",
    ).sort();

  const reference = signatureOf(SURFACE_MATRIX[0]!.adapter);
  assert.deepEqual(
    reference,
    [...REQUIRED_PUBLIC_METHODS].sort(),
    `reference surface "${SURFACE_MATRIX[0]!.surface}" must bind every required method`,
  );

  for (const { surface, adapter } of SURFACE_MATRIX) {
    const sig = signatureOf(adapter);
    assert.deepEqual(
      sig,
      reference,
      `surface "${surface}" must bind the SAME public method set as every other ` +
        `surface (a method no surface binds — or one only some bind — is a fork). ` +
        `Expected ${JSON.stringify(reference)}, got ${JSON.stringify(sig)}.`,
    );
    // And every required method is actually a callable function.
    for (const m of REQUIRED_PUBLIC_METHODS) {
      assert.equal(
        typeof (adapter as unknown as Record<string, unknown>)[m],
        "function",
        `surface "${surface}" must bind a callable "${m}"`,
      );
    }
  }
});

test("[T0.1] every surface declares a stable kind discriminator", () => {
  for (const { surface, adapter } of SURFACE_MATRIX) {
    assert.equal(
      typeof adapter.kind,
      "string",
      `surface "${surface}" must declare a string kind`,
    );
    assert.ok(adapter.kind.length > 0, `surface "${surface}" kind must be non-empty`);
  }
});

// ── (2) Production-binding text-scan — the REV-1 layer ────────────────────────
//
// The freeform production bindings (the `*-adapter.ts` files that wire the real
// "use server" actions) must each bind `restoreRevision` — the exact thing REV-1
// dropped. Scanned as text because importing them pulls the server graph.

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
// This file lives in builder-core/adapters/ — the bound files are siblings.
const ADAPTERS_DIR = resolve(THIS_DIR);

/** Strip comments so a binding may *mention* restore in prose without counting. */
function stripComments(source: string): string {
  let s = source.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/\/\/.*/g, "");
  return s;
}

/** Matches an object-property binding `restoreRevision: <something>`. */
const BINDS_RESTORE_RE = /restoreRevision\s*:/;

/** The freeform production bindings that MUST wire restoreRevision (REV-1). */
const FREEFORM_BOUND_FILES = [
  "cms-page-adapter.ts",
  "talent-page-adapter.ts",
  "site-shell-adapter.ts",
  "talent-site-shell-adapter.ts",
];

test("[T0.1] self-check: text matcher catches a planted binding-without-restore", () => {
  const withRestore = stripComments(`
    const productionActions = {
      loadShell: x, saveShell: y, publishShell: z,
      restoreRevision: restoreFooAction,
    };
  `);
  const withoutRestore = stripComments(`
    const productionActions = {
      loadShell: x, saveShell: y, publishShell: z,
      // restoreRevision intentionally NOT bound — REV-1 regression
    };
  `);
  assert.equal(BINDS_RESTORE_RE.test(withRestore), true, "matcher must see a real binding");
  assert.equal(
    BINDS_RESTORE_RE.test(withoutRestore),
    false,
    "self-check FAILED: a binding that only MENTIONS restore in a comment must NOT pass " +
      "(REV-1 would slip through). Check stripComments() + BINDS_RESTORE_RE.",
  );
});

test("[T0.1] every freeform production binding wires restoreRevision (REV-1 guard)", () => {
  const violations: string[] = [];
  for (const file of FREEFORM_BOUND_FILES) {
    const full = join(ADAPTERS_DIR, file);
    let raw: string;
    try {
      raw = readFileSync(full, "utf-8");
    } catch (err) {
      violations.push(`[READ ERROR] ${file}: ${String(err)}`);
      continue;
    }
    const source = stripComments(raw);
    if (!BINDS_RESTORE_RE.test(source)) {
      violations.push(
        `[VIOLATION] ${file} does not bind \`restoreRevision\` in its production action set.\n` +
          `  REV-1: the core factory supports restore, but a binding that omits it makes the\n` +
          `  shared RevisionsDrawer a silent no-op on that surface. Wire the real restore\n` +
          `  action (e.g. restoreRevision: restore<Surface>RevisionAction).`,
      );
    }
  }
  assert.equal(
    violations.length,
    0,
    "[T0.1] PRODUCTION-BINDING PARITY FAILED — a freeform surface dropped restoreRevision:\n\n" +
      violations.join("\n\n"),
  );
});

test("[T0.1] coverage: the REV-1 scan covers all four freeform bindings", () => {
  // Guards against the scan vacuously passing on a renamed/missing file.
  for (const file of FREEFORM_BOUND_FILES) {
    const full = join(ADAPTERS_DIR, file);
    assert.doesNotThrow(
      () => readFileSync(full, "utf-8"),
      `expected freeform binding ${file} to exist for the REV-1 scan`,
    );
  }
});
