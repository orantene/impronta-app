import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * STYLE-2 display-tier guard (static file-text scan, modeled on
 * `builder-core/legacy-write-guard.static.test.ts`).
 *
 * STYLE-2 added a `'display'` size tier above `'xl'` to the shared
 * `NodePresentationValue["size"]` union + the freeform renderer. Several curated
 * section `Component.tsx` files carry LOCAL `if`-chain size helpers
 * (`headingSize`/`eyebrowSize`/`paragraphSize`/`ctaSize`/…) that branch on
 * `size === "sm" | "lg" | "xl"`. When STYLE-2 widened the signature union, those
 * if-chains kept returning `undefined`/`{}` for `'display'` — so a `display`-sized
 * curated element silently lost its font scale.
 *
 * Invariant: in any curated section helper, **every `if (size === "xl") return …`
 * branch must be paired with an `if (size === "display") return …` branch** (the
 * display tier is the size ABOVE xl; it must never fall through to the helper's
 * default `return undefined`/`return {}`). This locks the audit so a NEW curated
 * section (or a new size helper) can't reintroduce the gap.
 *
 * Object-lookup helpers (`return { sm, md, lg, xl, display }[size]`) are inherently
 * total over the union — TS would reject a missing `display` key — so they need no
 * scan; this guard only targets the `if`-chain idiom.
 */

const here = dirname(fileURLToPath(import.meta.url));

function listComponentFiles(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(here, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(here, entry.name, "Component.tsx");
    try {
      readFileSync(candidate);
      out.push(candidate);
    } catch {
      // section without a Component.tsx — skip
    }
  }
  return out;
}

// Count `if (size === "<tier>") return …;` if-chain branches in a file body.
function countIfChainBranches(text: string, tier: string): number {
  const re = new RegExp(`if \\(size === "${tier}"\\) return [^;]+;`, "g");
  return (text.match(re) ?? []).length;
}

test("STYLE-2: every curated section if-chain xl branch is paired with a display branch", () => {
  const files = listComponentFiles();
  assert.ok(files.length > 0, "expected to find section Component.tsx files");

  const offenders: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const xl = countIfChainBranches(text, "xl");
    if (xl === 0) continue; // no if-chain size helper here
    const display = countIfChainBranches(text, "display");
    if (display < xl) {
      const rel = file.slice(file.indexOf("sections/"));
      offenders.push(
        `${rel}: ${xl} xl branch(es) but only ${display} display branch(es)`,
      );
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `curated section size helpers must handle the STYLE-2 'display' tier:\n${offenders.join("\n")}`,
  );
});

test("STYLE-2: the display-tier guard matcher actually fires on a planted violation", () => {
  // Self-check: a synthetic helper with an xl branch and NO display branch must
  // be flagged. Proves the matcher isn't a no-op (legacy-write-guard pattern).
  const planted = [
    'function headingSize(size?: "sm" | "md" | "lg" | "xl" | "display") {',
    '  if (size === "sm") return "1rem";',
    '  if (size === "xl") return "3rem";',
    "  return undefined;",
    "}",
  ].join("\n");

  const xl = countIfChainBranches(planted, "xl");
  const display = countIfChainBranches(planted, "display");
  assert.equal(xl, 1, "matcher should see the planted xl branch");
  assert.equal(display, 0, "matcher should see no display branch in the violation");
  assert.ok(
    display < xl,
    "the guard's offending condition must hold for the planted violation",
  );

  // And the corrected version (display paired with xl) must pass.
  const fixed = planted.replace(
    "  return undefined;",
    '  if (size === "display") return "clamp(3.5rem, 6vw, 6rem)";\n  return undefined;',
  );
  assert.equal(
    countIfChainBranches(fixed, "display"),
    1,
    "fixed helper has a display branch",
  );
  assert.ok(
    countIfChainBranches(fixed, "display") >= countIfChainBranches(fixed, "xl"),
    "fixed helper satisfies the guard",
  );
});
