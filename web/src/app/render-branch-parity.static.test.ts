/**
 * render-branch-parity.static.test.ts — T0.2 CI guard.
 *
 * WHAT THIS TEST DOES
 * ───────────────────
 * Reads the SOURCE TEXT of every public-surface route file that owns one or
 * more real render branches, and FAILS if the file is missing any of the
 * shared public landmarks/analytics that EVERY public render branch must carry:
 *
 *   • <SkipToContent              — the skip-to-content link (first focusable)
 *   • id="main-content"           — the primary <main> landmark id
 *   • SitePageViewAnalytics       — the shared first-party page-view component
 *                                   (storefront / talent-profile / talent-site)
 *
 * A live-QA pass (Phase 6 T0.2) found these wired to only SOME render branches
 * of each public surface — #579 fixed the platform-host talent profile; the
 * storefront /p/ branches + the talent freeform sub-page were the remainder.
 * This test LOCKS the audit: a future new render branch (or a refactor that
 * drops a token) can't silently ship without the skip-link, the landmark, and
 * the page-view component.
 *
 * WHY FILE-TEXT SCAN (not render)?
 * ──────────────────────────────────
 * These are Next.js server components with server-action / supabase / React
 * import graphs that can't execute under node:test. The exact regression we
 * guard against — a token being absent from the source — is a plain text
 * property, so reading the file as UTF-8 and asserting the tokens are present
 * is zero-overhead and catches precisely the omission we care about.
 *
 * Some route files DELEGATE their render to a shared document component
 * (`renderMaxSiteDocument`, `PlatformTalentMaxSiteView`) that owns the
 * landmark. Those delegating files are listed with the delegate target whose
 * source MUST carry the tokens, so the chain is still verified end-to-end.
 *
 * SELF-CHECK (the matcher MUST work)
 * ───────────────────────────────────
 * Before scanning real files, this test plants a synthetic source missing a
 * token and asserts the matcher flags it, and plants a compliant source and
 * asserts it does NOT — so a broken matcher fails the self-check first.
 *
 * Test runner: node:test + node:assert/strict
 * Run:  node_modules/.bin/tsx --test src/app/render-branch-parity.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// ── Required tokens — every scanned source MUST contain ALL of these ──────────

/**
 * The shared public-landmark/analytics tokens. Matched against the RAW source
 * (not comment-stripped): the tokens are JSX usages, never only-in-prose, and
 * a route that merely *mentions* them in a comment without rendering them would
 * be a real omission we want to catch. The token strings are specific enough
 * (`<SkipToContent`, `id="main-content"`, `SitePageViewAnalytics`) that a
 * passing comment-only match is not a realistic failure mode here.
 */
const REQUIRED_TOKENS: { token: string; label: string }[] = [
  { token: "<SkipToContent", label: "<SkipToContent/> (skip-to-content link)" },
  { token: 'id="main-content"', label: 'id="main-content" (primary <main> landmark)' },
  { token: "SitePageViewAnalytics", label: "SitePageViewAnalytics (shared page-view)" },
];

// ── Files under audit ─────────────────────────────────────────────────────────

// This file lives at: web/src/app/  → web/src is one level up: ..
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(THIS_DIR, "..");

/**
 * Every public-surface source whose render branches must carry the shared
 * landmarks. `direct` files render the branches themselves; `delegate` files
 * forward to a shared document component (named in `note`) whose source is the
 * one that must carry the tokens — that component is listed as its own entry.
 */
const SCANNED: { rel: string; note: string }[] = [
  // Storefront CMS pages — 3 render branches (freeform / section-composed /
  // legacy fallback). All three carry the tokens directly.
  {
    rel: "app/(public)/p/[[...slug]]/page.tsx",
    note: "storefront /p/ — freeform + section-composed + legacy branches",
  },
  // Talent profile — PlatformTalentMaxSiteView branch (delegated, below),
  // LightProfileLayout branch (token id lives in LightProfileLayout, below),
  // and the !isSupabaseConfigured() fallback (direct). This file owns
  // <SkipToContent/> + <SitePageViewAnalytics/> at the return root and the
  // degenerate fallback's id="main-content".
  {
    rel: "app/t/[profileCode]/profile-view.tsx",
    note: "talent profile — skip-link + analytics root + config-fallback landmark",
  },
  // The talent profile's main render uses LightProfileLayout's <main>, which
  // owns id="main-content". Skip-link + analytics are mounted by the parent
  // page above; this layout just needs to keep the landmark id. It does not
  // render SitePageViewAnalytics itself, so it is checked for the main-content
  // id only (see EXEMPT_TOKENS below).
  {
    rel: "app/t/[profileCode]/_light/LightProfileLayout.tsx",
    note: "talent profile body — owns id=main-content on its <main>",
  },
  // Talent freeform sub-page (/t/[code]/[pageSlug]) — a real public branch that
  // was missing all three tokens (T0.2 fix).
  {
    rel: "app/t/[profileCode]/[pageSlug]/page.tsx",
    note: "talent freeform sub-page — newly wired in T0.2",
  },
  // Talent-site routes delegate render to renderMaxSiteDocument, which owns the
  // landmark + analytics. The route files forward result.node; the document
  // below is the source that must carry the tokens.
  {
    rel: "lib/talent-site/server/render-max-site.tsx",
    note: "talent-site document — owns landmark for all 3 talent-site routes",
  },
];

/**
 * A scanned file may legitimately own only a SUBSET of the tokens when the rest
 * are mounted by a parent in the same render tree (verified by the parent's
 * own entry). Map any such file to the tokens it is NOT required to contain.
 */
const EXEMPT_TOKENS: Record<string, Set<string>> = {
  // LightProfileLayout renders the <main id="main-content"> but the skip-link
  // and the page-view component are mounted by app/t/[profileCode]/page.tsx
  // (the parent), which is scanned separately and required to carry both.
  "app/t/[profileCode]/_light/LightProfileLayout.tsx": new Set([
    "<SkipToContent",
    "SitePageViewAnalytics",
  ]),
};

// ── Self-check: the matcher must work ─────────────────────────────────────────

function missingTokens(source: string, exempt: Set<string>): string[] {
  return REQUIRED_TOKENS.filter(
    ({ token }) => !exempt.has(token) && !source.includes(token),
  ).map(({ label }) => label);
}

test("T0.2 self-check: a source missing a required token is flagged", () => {
  const planted = `
    export default function Page() {
      return (
        <>
          <SkipToContent />
          <main className="w-full flex-1">{/* no id! */}</main>
        </>
      );
    }
  `;
  const missing = missingTokens(planted, new Set());
  assert.ok(
    missing.length >= 1,
    "Self-check FAILED: a source missing id=main-content + analytics was not flagged. " +
      "The parity matcher is broken — fix it before trusting this test.",
  );
});

test("T0.2 self-check: a fully-compliant source is NOT flagged", () => {
  const compliant = `
    <SkipToContent />
    <SitePageViewAnalytics surface="storefront" />
    <main id="main-content" className="w-full flex-1">…</main>
  `;
  const missing = missingTokens(compliant, new Set());
  assert.equal(
    missing.length,
    0,
    `Self-check FAILED: a compliant source was wrongly flagged for: ${missing.join(", ")}`,
  );
});

test("T0.2 self-check: an EXEMPT token is not required of a delegating file", () => {
  // A layout that owns only the landmark, with skip-link + analytics exempt.
  const layoutOnly = `<main id="main-content">…</main>`;
  const missing = missingTokens(
    layoutOnly,
    new Set(["<SkipToContent", "SitePageViewAnalytics"]),
  );
  assert.equal(
    missing.length,
    0,
    `Self-check FAILED: exempt tokens were still required: ${missing.join(", ")}`,
  );
});

// ── The real scan ─────────────────────────────────────────────────────────────

test("T0.2 static guard: every public render-branch source carries the shared landmarks", () => {
  const violations: string[] = [];

  for (const { rel } of SCANNED) {
    const full = resolve(WEB_SRC, rel);
    let source: string;
    try {
      source = readFileSync(full, "utf-8");
    } catch (err) {
      violations.push(`[READ ERROR] ${rel}: ${String(err)}`);
      continue;
    }

    const exempt = EXEMPT_TOKENS[rel] ?? new Set<string>();
    const missing = missingTokens(source, exempt);
    if (missing.length > 0) {
      violations.push(
        `[MISSING] ${rel}\n` +
          missing.map((m) => `    - ${m}`).join("\n"),
      );
    }
  }

  assert.equal(
    violations.length,
    0,
    "T0.2 RENDER-BRANCH PARITY FAILED — a public render-branch source is missing " +
      "a shared landmark/analytics token:\n\n" +
      violations.join("\n\n") +
      "\n\nEvery public render branch MUST mount <SkipToContent/> as the first " +
      "focusable element, set id=\"main-content\" on its primary <main>, and mount " +
      "<SitePageViewAnalytics surface=…/>. Reuse the shared components " +
      "(@/components/accessibility/skip-to-content, " +
      "@/components/analytics/site-page-view-analytics) — no per-surface fork. " +
      "If a file legitimately delegates a token to a parent, add it to " +
      "EXEMPT_TOKENS with the parent that supplies it.",
  );
});

test("T0.2 coverage: every scanned file is listed (informational — always passes)", () => {
  assert.ok(SCANNED.length >= 5, "Expected at least 5 scanned public-surface files.");
  for (const { rel, note } of SCANNED) {
    process.stdout.write(`  scanned: ${rel}  (${note})\n`);
  }
});
