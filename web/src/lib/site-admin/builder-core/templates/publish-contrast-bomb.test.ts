import assert from "node:assert/strict";
import { test } from "node:test";

import { validateTemplateForPublish } from "./validate-publish";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/**
 * A template with a token ground and a literal ink must not PUBLISH.
 *
 * The static lint on page designs catches what is authored in code. This is the
 * other half: `builder_templates` rows are authored in the Lab, and two
 * published rows carried `token:color.primary` backgrounds with a `#1a1407`
 * ink — 1.03:1 on the registry-default primary, on four buttons each.
 *
 * Detecting it in code and letting the Lab keep saving it would have been a
 * guard on the wrong side of the door.
 */

/**
 * A button inside a container. The wrapper is not decoration: a `button` is not
 * allowed at the page root, so a bare one fails the STRUCTURE check and the
 * contrast assertion would pass for the wrong reason.
 */
function tree(style: Record<string, unknown>): BuilderNode[] {
  return [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "b1",
          kind: "button",
          props: { label: "Start an inquiry", href: "/contact", style },
        },
      ],
    },
  ] as unknown as BuilderNode[];
}

test("a token ground with a literal ink is REFUSED", () => {
  const result = validateTemplateForPublish(
    tree({ backgroundColor: "token:color.primary", textColor: "#1a1407" }),
  );

  assert.equal(result.ok, false, "the contrast bomb must not publish");
  if (result.ok) return;
  const joined = result.reasons.join(" ");
  assert.match(joined, /hardcoded text colour/i);
  assert.match(joined, /b1/, "the reason must name the offending node");
  assert.match(
    joined,
    /token:color\.primary-on/,
    "the reason must say what to do instead, not just what is wrong",
  );
});

test("token + token PUBLISHES — the correct form is not blocked", () => {
  const result = validateTemplateForPublish(
    tree({
      backgroundColor: "token:color.primary",
      // `color.ink`, not `color.primary-on`: the pairing token only becomes
      // bindable in #1869, and a test that depended on an unmerged PR would go
      // red here for a reason that has nothing to do with what it asserts.
      // Any bindable colour proves the point — token ground + token ink.
      textColor: "token:color.ink",
    }),
  );
  assert.equal(
    result.ok,
    true,
    `the paired form must publish; reasons: ${result.ok ? "" : result.reasons.join(" | ")}`,
  );
});

test("literal + literal PUBLISHES — a deliberate fixed-colour block is legal", () => {
  // The check that mattered most to get right. A guard that refused every
  // literal would be disabled the first time someone shipped a fixed-colour
  // block, and then it would protect nothing at all.
  const result = validateTemplateForPublish(
    tree({ backgroundColor: "#0f172a", textColor: "#ffffff" }),
  );
  assert.equal(
    result.ok,
    true,
    `a fixed-colour block must publish; reasons: ${result.ok ? "" : result.reasons.join(" | ")}`,
  );
});

test("a nested bomb is found, not just a root one", () => {
  const result = validateTemplateForPublish(
    tree({ backgroundColor: "token:color.primary", textColor: "rgb(26,20,7)" }),
  );
  assert.equal(result.ok, false, "a nested bomb must be refused too");
  if (result.ok) return;
  assert.match(result.reasons.join(" "), /b1/);
});

test("a token ground with NO ink publishes — absence is not a literal", () => {
  // The node inherits its colour, which is the whole point of a token ground.
  // Treating "no textColor" as a bomb would block the correct authoring.
  const result = validateTemplateForPublish(
    tree({ backgroundColor: "token:color.primary" }),
  );
  assert.equal(result.ok, true);
});
