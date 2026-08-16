/**
 * shell-chrome-mutex.static.test.ts — R1 guard: EXACTLY ONE header and EXACTLY
 * ONE footer on every public surface.
 *
 * WHAT SHIPPED, AND WHY IT IS STATIC RATHER THAN E2E
 * --------------------------------------------------
 * A true e2e ("load `/`, `/p/*`, `/directory` for a shell-enabled tenant and
 * count the landmarks") is not runnable in this repo's CI harness: the shell
 * render gate is satisfied only by a tenant that is BOTH in the launch
 * allow-list AND has a published `site_shell` row, and `e2e` is not part of the
 * CI lane list at all (see reference: CI runs a curated `test:*` list, not
 * playwright). A guard that cannot run is not a guard. So this ships as a
 * STATIC guard over the mount sites, which is what actually regresses.
 *
 * The PURE decision function (`resolveShellRenderDecision`) is already
 * exhaustively covered in `site-shell-flag.test.ts`, including the
 * never-both / never-neither property. That is not re-tested here. What was
 * genuinely unguarded is the OTHER half of the mutex — whether every surface
 * routes through that decision at all:
 *
 *   1. A new surface mounts `<PublishedShellHeader>` / `<PublishedShellFooter>`
 *      DIRECTLY without consulting `shouldRenderSnapshotShell`. The legacy
 *      chrome mounted by the layout then renders alongside it → TWO headers.
 *
 *   2. A public route mounts the self-gating `<PublicHeader>` but pairs it with
 *      a hard-coded legacy footer instead of `<PublicFooter>`. This is not
 *      hypothetical — it is the exact bug documented in the header comment of
 *      `public-footer.tsx`: shell-enabled tenants got the snapshot header up top
 *      and a LEGACY footer at the bottom on `/p/*`, `/directory` and `/posts/*`.
 *      Mismatched chrome, no error anywhere.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

/** The component that DEFINES the snapshot chrome — it is the gate's home. */
const SHELL_DEFINITION = path.join(
  "components",
  "site-shell",
  "PublishedShell.tsx",
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map((full) => ({
  rel: path.relative(SRC, full),
  text: readFileSync(full, "utf8"),
}));

test("[R1] no surface mounts the snapshot shell chrome without the mutex gate", () => {
  const offenders: string[] = [];
  for (const { rel, text } of FILES) {
    if (rel === SHELL_DEFINITION) continue;
    const mountsSnapshotChrome =
      text.includes("<PublishedShellHeader") ||
      text.includes("<PublishedShellFooter");
    if (!mountsSnapshotChrome) continue;
    if (!text.includes("shouldRenderSnapshotShell")) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    "These files render the snapshot shell chrome but never consult " +
      "`shouldRenderSnapshotShell`. The legacy PublicHeader/PublicFooter " +
      "mounted by the layout will render ALONGSIDE them — two headers on " +
      "every page of that surface. Gate the mount, or mount the self-gating " +
      "<PublicHeader> / <PublicFooter> instead.",
  );
});

test("[R1] a public route that mounts PublicHeader also mounts PublicFooter", () => {
  const offenders: string[] = [];
  for (const { rel, text } of FILES) {
    // Route entrypoints only — components legitimately mount one end alone.
    if (!rel.startsWith(path.join("app", "(public)"))) continue;
    if (!text.includes("<PublicHeader")) continue;
    if (!text.includes("<PublicFooter")) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    "These public routes mount the self-gating <PublicHeader> but NOT the " +
      "self-gating <PublicFooter>. On a shell-enabled tenant that yields a " +
      "snapshot header above a LEGACY footer — the mismatch documented in " +
      "public-footer.tsx. Both ends must gate together.",
  );
});

test("[R1] the self-gating chrome components exist and share ONE predicate", () => {
  // If someone re-implements the flag check locally instead of importing the
  // shared predicate, the two ends can drift apart and the mutex stops holding.
  for (const rel of [
    path.join("components", "public-header.tsx"),
    path.join("components", "public-footer.tsx"),
    path.join("components", "home", "agency-home-storefront.tsx"),
  ]) {
    const file = FILES.find((f) => f.rel === rel);
    assert.ok(file, `${rel} not found — update this guard if it moved`);
    assert.ok(
      file.text.includes("shouldRenderSnapshotShell"),
      `${rel} must decide via the shared \`shouldRenderSnapshotShell\` ` +
        "predicate, never a locally re-derived flag check",
    );
    assert.ok(
      !file.text.includes("isSiteShellEnabledForTenant"),
      `${rel} reads the RAW flag \`isSiteShellEnabledForTenant\` directly. ` +
        "That skips the published-shell belt, so a tenant with the flag on " +
        "but no published shell row renders EMPTY chrome. Use " +
        "`shouldRenderSnapshotShell`.",
    );
  }
});
