import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SectionUnlockChipButton } from "./chip-buttons";
import { runRepairSectionStyling } from "./eject-lossless";
import { editorT } from "./editor-i18n";
import {
  SECTION_RESTORE_STYLING_HINT,
  SECTION_RESTORE_STYLING_LABEL,
  SECTION_RESTORE_STYLING_UNAVAILABLE_HINT,
  SECTION_RESTORE_STYLING_UNAVAILABLE_LABEL,
} from "./section-unlock-gate";
import { resolveSectionEjectBaseline } from "@/lib/site-admin/builder-node/section-eject-baseline";
import type {
  BuilderNode,
  BuilderNodeStyle,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node/types";

/**
 * Does "Restore original styling" actually REACH the operator, and does the
 * click do anything?
 *
 * A sibling lane shipped a spacing stepper that was completely dead while every
 * unit test stayed green: the pure parser was correct, the control was not
 * wired. `section-eject-repair.test.ts` proves the transform; this file proves
 * the two links either side of it, which no pure test can see:
 *
 *   1. the button is RENDERED, enabled, on an unlocked section, in both
 *      languages, and is absent where it would be a lie (a locked section), or
 *      disabled WITH the reason where the repair is impossible (a section type
 *      with no recorded original styling);
 *   2. the client entry point the button calls (`runRepairSectionStyling`)
 *      really drives the repair through the commit spine and comes back with a
 *      tree whose children gained the curated look.
 *
 * Lane: `test:builder-chrome` (globs `src/components/edit-chrome`).
 */

const CHIP_PROPS = {
  light: true,
  disabled: false,
  btnStyle: {},
  onUnlock: () => {},
  onRelock: () => {},
};

function withNavigatorLanguage<T>(language: string, run: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { language },
    configurable: true,
    writable: true,
  });
  try {
    return run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
}

function renderChip(input: {
  language: string;
  isUnlocked: boolean;
  sectionTypeKey?: string;
}): string {
  return withNavigatorLanguage(input.language, () =>
    renderToStaticMarkup(
      <SectionUnlockChipButton
        {...CHIP_PROPS}
        isUnlocked={input.isUnlocked}
        restoreStyling={
          input.isUnlocked && input.sectionTypeKey
            ? {
                sectionTypeKey: input.sectionTypeKey,
                run: async () => ({ ok: true as const }),
              }
            : null
        }
      />,
    ),
  );
}

// ── 1. The affordance reaches the operator ─────────────────────────────────

test("an unlocked hero chip renders an ENABLED Restore original styling button", () => {
  const html = renderChip({
    language: "en-US",
    isUnlocked: true,
    sectionTypeKey: "hero",
  });
  const at = html.indexOf('data-selection-section-action="restore-styling"');
  assert.ok(
    at >= 0,
    "the restore button must be in the chip, not only in the module",
  );
  assert.match(html, /Restore original styling/);
  // The whole point is the contrast with Relock, so the hint has to be on it.
  assert.match(html, /Your blocks and edits stay exactly as they are/);
  const button = html.slice(Math.max(0, at - 400), at + 200);
  assert.doesNotMatch(button, /disabled=""/, "the button must not ship dead");
  // Relock is still there, and still the destructive one.
  assert.match(html, /data-selection-section-action="relock"/);
});

test("the Spanish operator gets the Spanish copy, not the English", () => {
  const html = renderChip({
    language: "es-MX",
    isUnlocked: true,
    sectionTypeKey: "cta_banner",
  });
  assert.match(html, /Restaurar el estilo original/);
  assert.match(html, /Tus bloques y tus ediciones se quedan tal cual están/);
  assert.doesNotMatch(html, /Restore original styling/);
  // Catalog-level parity, so a future copy edit cannot silently drop the ES.
  for (const key of [
    SECTION_RESTORE_STYLING_LABEL,
    SECTION_RESTORE_STYLING_HINT,
    SECTION_RESTORE_STYLING_UNAVAILABLE_LABEL,
    SECTION_RESTORE_STYLING_UNAVAILABLE_HINT,
  ]) {
    assert.notEqual(editorT(key, "es"), key, `untranslated ES copy: ${key}`);
    assert.doesNotMatch(editorT(key, "es"), /[—–]/, "no em or en dashes");
  }
});

test("a section type with no recorded styling shows a DISABLED button with the reason", () => {
  const html = renderChip({
    language: "en-US",
    isUnlocked: true,
    sectionTypeKey: "faq_accordion",
  });
  assert.match(
    html,
    /data-selection-section-action="restore-styling-unavailable"/,
  );
  assert.match(
    html,
    /disabled=""/,
    "an impossible repair must not look clickable",
  );
  assert.match(html, /there is nothing to restore/);
  assert.doesNotMatch(
    html,
    /data-selection-section-action="restore-styling"[^-]/,
    "the live action must not also render",
  );
});

test("a LOCKED section offers Unlock and no restore button at all", () => {
  const html = renderChip({ language: "en-US", isUnlocked: false });
  assert.match(html, /data-selection-section-action="unlock"/);
  assert.doesNotMatch(html, /restore-styling/);
});

// ── 2. The click path actually repairs ─────────────────────────────────────

test("runRepairSectionStyling drives the real repair through the commit spine", async () => {
  const sectionNodeId = "legacy:main:0:hero1";
  // A hero unlocked the OLD way: roleless children, no stamp, no styling.
  const degraded: BuilderNodeTree = [
    {
      id: sectionNodeId,
      kind: "section",
      props: { sectionTypeKey: "hero", sectionId: "sec-1", ejected: true },
      children: [
        { id: "free-0", kind: "heading", props: { text: "Riviera Maya" } },
        { id: "free-1", kind: "paragraph", props: { text: "Coastal" } },
      ],
    } as BuilderNode,
  ];

  let committed: BuilderNodeTree | null = null;
  const result = await runRepairSectionStyling(
    degraded,
    sectionNodeId,
    async ({ run }) => {
      const out = run(degraded);
      committed = out.tree;
      return { ok: true };
    },
    // The saved curated config the operator's section still carries; it is what
    // the historical repair reads to work out which roleless child is which.
    async () => ({ headline: "Riviera Maya", subheadline: "Coastal" }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "repaired");
  assert.ok((result.repairedCount ?? 0) > 0);
  assert.ok(committed, "the repair must reach the commit spine");
  const children = (
    committed as unknown as Array<{ children: BuilderNode[] }>
  )[0]!.children;
  const headlineStyle = (children[0]!.props as { style?: BuilderNodeStyle })
    .style;
  const expected = resolveSectionEjectBaseline("hero", {});
  assert.equal(headlineStyle?.align, "center");
  assert.equal(headlineStyle?.fontFamily, expected?.headline?.fontFamily);
  // Content untouched: no block added, removed or reordered.
  assert.equal(children.length, 2);
  assert.equal((children[0]!.props as { text?: string }).text, "Riviera Maya");
});
