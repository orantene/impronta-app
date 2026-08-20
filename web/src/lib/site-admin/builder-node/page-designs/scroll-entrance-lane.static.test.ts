/**
 * scroll-entrance-lane.static.test.ts — a scroll entrance in a shipped page
 * design must say whether it plays ONCE or scrubs.
 *
 * `animationTrigger: "scroll"` with no `animationRepeat` is not neutral: it is
 * the `animation-timeline: view()` SCRUB lane, where the band's opacity and
 * offset track scroll POSITION. The band un-fades when the visitor scrolls back
 * up, and re-introduces itself on every pass. On a section band that reads as a
 * rendering bug rather than as polish.
 *
 * Every one of the nine shipped designs was written that way, and not by
 * mistake: until the Animation tab shipped `animationRepeat`, scrub was the
 * ONLY scroll trigger available. Now that "play once" exists, omitting the key
 * is a choice, so this makes it an explicit one.
 *
 * Scrub is still legitimate — a parallax-ish band that genuinely should track
 * the scrubber can set `animationRepeat: "every"` and say so. What this forbids
 * is landing in that lane by saying nothing.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-node/page-designs/scroll-entrance-lane.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function designFiles(): string[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
    .filter((f) => !["index.ts", "types.ts", "tokens.ts"].includes(f));
}

test("every scroll entrance in a page design declares its repeat lane", () => {
  const offenders: string[] = [];

  for (const file of designFiles()) {
    const source = readFileSync(join(HERE, file), "utf8");
    const lines = source.split("\n");
    lines.forEach((line, i) => {
      if (!/animationTrigger:\s*"scroll"/.test(line)) return;
      // The repeat may sit on the same line (inline style object) or within a
      // few lines of it (multi-line style object / shared const).
      const window = lines.slice(Math.max(0, i - 8), i + 9).join("\n");
      if (!/animationRepeat:\s*"(once|every)"/.test(window)) {
        offenders.push(`${file}:${i + 1}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `Scroll entrance(s) with no animationRepeat: ${offenders.join(", ")}. ` +
      `That silently selects the view() SCRUB lane, where the band un-fades as ` +
      `the visitor scrolls back up. Add animationRepeat:"once" for a normal ` +
      `entrance, or "every" if you genuinely want it tied to the scrubber.`,
  );
});

test("the guard is actually looking at the shipped designs", () => {
  // A path typo would make the walk empty and the assertion above vacuous.
  const files = designFiles();
  assert.ok(files.length >= 8, `Only found ${files.length} design files.`);
  const withScroll = files.filter((f) =>
    /animationTrigger:\s*"scroll"/.test(readFileSync(join(HERE, f), "utf8")),
  );
  assert.ok(
    withScroll.length >= 8,
    `Only ${withScroll.length} designs have a scroll entrance; expected the ` +
      `nine shipped ones. Did the walk root move?`,
  );
});
