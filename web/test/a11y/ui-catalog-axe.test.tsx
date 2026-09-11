/**
 * THE AXE LANE — every catalog variant, mounted alone, checked against WCAG.
 *
 * The plan's line is "no axe in CI", and the fix is not "run axe on some
 * pages". Pages are compositions: one page passing says nothing about the
 * primitive it happens not to use, and one page failing rarely says which
 * primitive did it. The catalog registry is the opposite — a flat list of
 * primitives in their interesting STATES — so this lane crawls that and
 * reports per variant.
 *
 * ONE VARIANT PER MOUNT, DELIBERATELY. Rendering the whole catalog into one
 * container is faster and wrong: an open Dialog sets `aria-hidden` on its
 * siblings, so every other primitive would leave the accessibility tree and
 * pass by being invisible. Each variant gets its own container and its own
 * axe run.
 *
 * WHICH RULES. The two colour rules are OFF, and this is the one exemption
 * worth arguing about. `color-contrast` and `color-contrast-enhanced` need
 * real computed colours; jsdom applies no stylesheet, so every element is
 * black-on-transparent and axe returns `incomplete` for all of them —
 * information-free noise that trains people to ignore the lane. Contrast is
 * genuinely covered elsewhere, against real token values, by
 * `src/lib/site-admin/a11y/contrast.ts` and its corpus test. Everything else
 * axe ships — labels, roles, name-role-value, ARIA validity, heading order,
 * region, duplicate ids — is structural, is exactly what jsdom CAN see, and
 * is exactly what a hand-rolled tab strip gets wrong.
 *
 * SERIOUS VIOLATIONS ONLY, AND THE THRESHOLD IS NOT LAZINESS. `minor` findings
 * in axe are largely advisory (`region`, landmark preferences) and depend on
 * page context a mounted primitive does not have — a Button correctly has no
 * landmark. Filtering to moderate-and-above keeps the lane about defects
 * rather than about the harness.
 */

import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import axe, { type Result } from "axe-core";

import { UI_CATALOG } from "@/components/ui/catalog/registry";

const DISABLED_RULES = {
  // See the header: jsdom has no stylesheet, so these can only return
  // `incomplete` and never a verdict.
  "color-contrast": { enabled: false },
  "color-contrast-enhanced": { enabled: false },
  // `region` asks whether all page content sits inside a landmark. That is a
  // question about a PAGE, and a mounted primitive is not one — a Button with
  // no surrounding <main> is the harness, not a defect, and it fires on every
  // single variant. Left on, it would be the only thing this lane ever said.
  // Landmark structure is a real requirement and belongs to a page-level lane
  // that has a page to check.
  region: { enabled: false },
} as const;

const REPORTABLE_IMPACTS = new Set(["moderate", "serious", "critical"]);

function describeViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 3)
        .map((node) => `      ${node.html}`)
        .join("\n");
      return `  [${violation.impact}] ${violation.id} — ${violation.help}\n${nodes}`;
    })
    .join("\n");
}

describe("ui catalog — axe", () => {
  for (const entry of UI_CATALOG) {
    for (const variant of entry.variants) {
      it(`${entry.id} / ${variant.id} has no accessibility violations`, async () => {
        // A real element in the document: axe walks the live tree, and a
        // detached fragment reports nothing at all rather than reporting
        // clean, which would make this lane a permanent false green.
        const container = document.createElement("div");
        document.body.appendChild(container);
        try {
          render(<>{variant.render()}</>, { container });
          const results = await axe.run(document.body, {
            rules: DISABLED_RULES,
            // Radix portals its Dialog content to document.body, so the
            // subject of the check is the BODY and not the container.
            resultTypes: ["violations"],
          });
          const reportable = results.violations.filter(
            (violation) => violation.impact && REPORTABLE_IMPACTS.has(violation.impact),
          );
          expect(
            reportable,
            reportable.length === 0
              ? ""
              : `${entry.title} / ${variant.label}:\n${describeViolations(reportable)}`,
          ).toEqual([]);
        } finally {
          cleanup();
          container.remove();
        }
      });
    }
  }

  it("crawls every registered variant", () => {
    // A lane whose subject list silently became empty is a lane that passes
    // forever. This is the arithmetic that makes the count visible.
    const variantCount = UI_CATALOG.reduce((sum, entry) => sum + entry.variants.length, 0);
    expect(UI_CATALOG.length).toBeGreaterThan(0);
    expect(variantCount).toBeGreaterThanOrEqual(UI_CATALOG.length);
  });

  it("GUARD BITES: a deliberately broken control is reported", async () => {
    // Proves the lane can still FAIL. Without this, a bad axe configuration,
    // a wrong container, or an over-eager impact filter would turn every green
    // run above into a green run that measured nothing.
    const container = document.createElement("div");
    document.body.appendChild(container);
    try {
      render(
        <>
          {/* An input with no accessible name at all — `label` violation. */}
          <input type="text" />
        </>,
        { container },
      );
      const results = await axe.run(container, {
        rules: DISABLED_RULES,
        resultTypes: ["violations"],
      });
      expect(results.violations.map((violation) => violation.id)).toContain("label");
    } finally {
      cleanup();
      container.remove();
    }
  });
});
