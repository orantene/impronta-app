/**
 * Behavior pin for resolveNodeCapabilities.
 *
 * Encodes CURRENT selection-layer chrome (kind × role × locked × plan × ejected)
 * BEFORE that file is rewritten to consume the resolver. Tiny fixture nodes —
 * not the 7k-line component. If a later "improvement" widens a gate, this
 * matrix fails.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *   npx tsx --test src/lib/site-admin/builder-node/node-capabilities.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CANVAS_GAP_LAYOUT_KINDS,
  NODE_CAPABILITY_REASONS,
  resolveNodeCapabilities,
  type NodeCapabilities,
  type NodeCapabilityContext,
} from "./node-capabilities";
import { gateNestedInsertKinds } from "./element-library-policy";
import { BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNode } from "./types";

const DESKTOP: NodeCapabilityContext = { device: "desktop" };
const TABLET: NodeCapabilityContext = { device: "tablet" };
const MOBILE: NodeCapabilityContext = { device: "mobile" };

function heading(id = "n-heading", locked?: boolean): BuilderNode {
  return {
    id,
    kind: "heading",
    locked,
    props: { text: "Hello", level: 2 },
  };
}

function paragraph(id = "n-paragraph"): BuilderNode {
  return {
    id,
    kind: "paragraph",
    props: { text: "Copy" },
  };
}

function button(id = "n-button"): BuilderNode {
  return {
    id,
    kind: "button",
    props: { label: "Go", href: "/" },
  };
}

function icon(id = "n-icon", label?: string): BuilderNode {
  return {
    id,
    kind: "icon",
    props: { icon: "star", label },
  };
}

function container(id = "n-container", locked?: boolean): BuilderNode {
  return {
    id,
    kind: "container",
    locked,
    props: { layout: "stack" },
    children: [],
  };
}

function section(
  sectionTypeKey: string,
  extras?: { id?: string; ejected?: boolean; locked?: boolean },
): BuilderNode {
  return {
    id: extras?.id ?? "sec-1",
    kind: "section",
    locked: extras?.locked,
    props: {
      sectionTypeKey,
      ejected: extras?.ejected,
    },
    children: [],
  };
}

function roleHeading(
  role:
    | "headline"
    | "subheadline"
    | "copy"
    | "primaryCta"
    | "secondaryCta"
    | "footerCta" = "headline",
): BuilderNode {
  const suffix =
    role === "headline"
      ? ":heading:headline"
      : role === "subheadline"
        ? ":paragraph:subheadline"
        : role === "copy"
          ? ":paragraph:copy"
          : role === "primaryCta"
            ? ":button:primaryCta"
            : role === "secondaryCta"
              ? ":button:secondaryCta"
              : ":button:footerCta";
  if (role === "headline") return heading(`sec${suffix}`);
  if (role === "subheadline" || role === "copy") {
    return { ...paragraph(`sec${suffix}`), id: `sec${suffix}` };
  }
  return { ...button(`sec${suffix}`), id: `sec${suffix}` };
}

function manip(caps: NodeCapabilities) {
  return {
    move: caps.move,
    resize: caps.resize,
    spacing: caps.spacing,
    rotate: caps.rotate,
    gap: caps.gap,
  };
}

function expectedContainerKinds(advanced: boolean, owner = false) {
  const policy = BUILDER_NODE_REGISTRY.container.children;
  const raw = policy.type === "allow_list" ? [...policy.kinds] : [];
  return gateNestedInsertKinds(raw, advanced, owner);
}

// ── Freeform editable block (the full kit) ─────────────────────────────────

test("freeform heading on desktop: full kit, no insert, full props", () => {
  const caps = resolveNodeCapabilities(heading(), DESKTOP);
  assert.equal(caps.select, true);
  assert.deepEqual(manip(caps), {
    move: true,
    resize: true,
    spacing: true,
    rotate: true,
    gap: false,
  });
  assert.equal(caps.inlineText, true);
  assert.equal(caps.stylePanel, true);
  assert.equal(caps.propsPanel, "full");
  assert.equal(caps.insertChildren, false);
  assert.deepEqual(caps.insertChildKinds, []);
  assert.equal(caps.del, true);
  assert.equal(caps.duplicate, true);
  assert.equal(caps.convertToComponent, true);
  assert.equal(caps.lockState, "unlocked");
  assert.equal(caps.canUnlock, false);
});

test("freeform container: gap handle + nested insert kinds from the registry gate", () => {
  const caps = resolveNodeCapabilities(container(), DESKTOP);
  assert.equal(caps.move, true);
  assert.equal(caps.gap, true);
  assert.equal(caps.inlineText, false);
  assert.equal(caps.insertChildren, true);
  assert.deepEqual(caps.insertChildKinds, expectedContainerKinds(true));
  assert.ok(caps.insertChildKinds.includes("heading"));
  assert.ok(!caps.insertChildKinds.includes("code"));
});

test("owner-only raw HTML: code appears only when canInsertRawHtmlElements is true", () => {
  const denied = resolveNodeCapabilities(container(), DESKTOP);
  const allowed = resolveNodeCapabilities(container(), {
    ...DESKTOP,
    canInsertRawHtmlElements: true,
  });
  assert.ok(!denied.insertChildKinds.includes("code"));
  assert.ok(allowed.insertChildKinds.includes("code"));
});

test("icon inlineText follows the label, matching the chip pencil gate", () => {
  assert.equal(resolveNodeCapabilities(icon("i1"), DESKTOP).inlineText, false);
  assert.equal(
    resolveNodeCapabilities(icon("i2", "Star"), DESKTOP).inlineText,
    true,
  );
});

// ── Per-device handles (current, after the mobile-canvas lift) ─────────────

test("resize/spacing/move stay on at tablet and mobile; rotate does not", () => {
  for (const deviceCtx of [TABLET, MOBILE]) {
    const caps = resolveNodeCapabilities(heading(), deviceCtx);
    assert.equal(caps.move, true, deviceCtx.device);
    assert.equal(caps.resize, true, deviceCtx.device);
    assert.equal(caps.spacing, true, deviceCtx.device);
    assert.equal(caps.rotate, false, deviceCtx.device);
    assert.ok(
      caps.reasons.includes(NODE_CAPABILITY_REASONS.rotateDesktopOnly),
      deviceCtx.device,
    );
  }
});

test("gap kinds match the canvas handle set", () => {
  assert.deepEqual(
    [...CANVAS_GAP_LAYOUT_KINDS].sort(),
    ["card", "carousel", "container", "cta_group", "masonry", "split"].sort(),
  );
  assert.equal(resolveNodeCapabilities(container(), DESKTOP).gap, true);
  assert.equal(resolveNodeCapabilities(heading(), DESKTOP).gap, false);
});

test("multi-select suppresses direct-manipulation and convert, not select", () => {
  const caps = resolveNodeCapabilities(container(), {
    ...DESKTOP,
    multiNodeSelectionActive: true,
  });
  assert.equal(caps.select, true);
  assert.equal(caps.move, false);
  assert.equal(caps.resize, false);
  assert.equal(caps.rotate, false);
  assert.equal(caps.spacing, false);
  assert.equal(caps.gap, false);
  assert.equal(caps.convertToComponent, false);
  assert.equal(caps.insertChildren, true);
  assert.equal(caps.del, true);
});

// ── kind === "section" ─────────────────────────────────────────────────────

test("curated cta_banner (locked design): section chrome, unlockable, insert offered", () => {
  const caps = resolveNodeCapabilities(section("cta_banner"), DESKTOP);
  assert.equal(caps.select, true);
  assert.deepEqual(manip(caps), {
    move: false,
    resize: false,
    spacing: false,
    rotate: false,
    gap: false,
  });
  assert.equal(caps.inlineText, false);
  assert.equal(caps.propsPanel, "guided");
  assert.equal(caps.convertToComponent, false);
  assert.equal(caps.lockState, "unlocked");
  assert.equal(caps.canUnlock, true);
  assert.equal(caps.insertChildren, true);
  assert.equal(caps.del, true);
  assert.equal(caps.duplicate, true);
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.sectionNotBlock));
});

test("ejected cta_banner: still not a freeform block; canUnlock is false", () => {
  const caps = resolveNodeCapabilities(
    section("cta_banner", { ejected: true }),
    DESKTOP,
  );
  assert.equal(caps.move, false);
  assert.equal(caps.propsPanel, "guided");
  assert.equal(caps.canUnlock, false);
  assert.equal(caps.insertChildren, true);
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.alreadyUnlocked));
});

test("marquee (no derivable layers): insert rejected, unlock disabled", () => {
  const caps = resolveNodeCapabilities(section("marquee"), DESKTOP);
  assert.equal(caps.insertChildren, false);
  assert.deepEqual(caps.insertChildKinds, []);
  assert.equal(caps.canUnlock, false);
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.insertRejected));
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.unlockNoLayers));
});

test("site_header: unlock not offered even though a deriver exists", () => {
  const caps = resolveNodeCapabilities(section("site_header"), DESKTOP);
  assert.equal(caps.canUnlock, false);
  assert.equal(caps.insertChildren, false);
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.unlockNotOffered));
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.insertRejected));
});

test("blank_section is composition-owned: insert stays, unlock is not offered", () => {
  const caps = resolveNodeCapabilities(section("blank_section"), DESKTOP);
  assert.equal(caps.canUnlock, false);
  assert.equal(caps.insertChildren, true);
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.unlockNotOffered));
  assert.ok(!caps.reasons.includes(NODE_CAPABILITY_REASONS.insertRejected));
});

test("anchor_nav: no-layers, insert rejected", () => {
  const caps = resolveNodeCapabilities(section("anchor_nav"), DESKTOP);
  assert.equal(caps.canUnlock, false);
  assert.equal(caps.insertChildren, false);
});

test("hero (derivable): same unlock/insert pattern as cta_banner", () => {
  const caps = resolveNodeCapabilities(section("hero"), DESKTOP);
  assert.equal(caps.canUnlock, true);
  assert.equal(caps.insertChildren, true);
  assert.equal(caps.move, false);
});

// ── resolveBuilderNodeRole (id-suffix demotion) ────────────────────────────

test("role-bound headline is demoted: no handles, guided panel, inherited lock", () => {
  const caps = resolveNodeCapabilities(roleHeading("headline"), DESKTOP);
  assert.deepEqual(manip(caps), {
    move: false,
    resize: false,
    spacing: false,
    rotate: false,
    gap: false,
  });
  assert.equal(caps.inlineText, false);
  assert.equal(caps.propsPanel, "guided");
  assert.equal(caps.convertToComponent, false);
  assert.equal(caps.insertChildren, false);
  assert.equal(caps.lockState, "inherited");
  assert.equal(caps.canUnlock, false);
  // Ugly current: Duplicate / Remove still offered on an unlocked role child.
  assert.equal(caps.del, true);
  assert.equal(caps.duplicate, true);
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.roleBound));
});

test("every curated role suffix demotes the same way", () => {
  const roles = [
    "headline",
    "subheadline",
    "copy",
    "primaryCta",
    "secondaryCta",
    "footerCta",
  ] as const;
  for (const role of roles) {
    const caps = resolveNodeCapabilities(roleHeading(role), DESKTOP);
    assert.equal(caps.move, false, role);
    assert.equal(caps.propsPanel, "guided", role);
    assert.equal(caps.lockState, "inherited", role);
    assert.equal(caps.convertToComponent, false, role);
  }
});

test("a heading whose id does not match a role suffix stays freeform", () => {
  const caps = resolveNodeCapabilities(heading("sec:heading:custom"), DESKTOP);
  assert.equal(caps.move, true);
  assert.equal(caps.propsPanel, "full");
  assert.equal(caps.lockState, "unlocked");
});

// ── node.locked ────────────────────────────────────────────────────────────

test("locked freeform heading: handles off, unlock-self on, structure edits off", () => {
  const caps = resolveNodeCapabilities(heading("h-lock", true), DESKTOP);
  assert.deepEqual(manip(caps), {
    move: false,
    resize: false,
    spacing: false,
    rotate: false,
    gap: false,
  });
  assert.equal(caps.inlineText, true);
  assert.equal(caps.propsPanel, "full");
  assert.equal(caps.insertChildren, false);
  assert.equal(caps.del, false);
  assert.equal(caps.duplicate, false);
  assert.equal(caps.convertToComponent, false);
  assert.equal(caps.lockState, "self");
  assert.equal(caps.canUnlock, true);
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.selfLocked));
});

test("locked container does not offer nested insert (context-menu #30)", () => {
  const caps = resolveNodeCapabilities(container("c-lock", true), DESKTOP);
  assert.equal(caps.insertChildren, false);
  assert.deepEqual(caps.insertChildKinds, []);
  assert.equal(caps.lockState, "self");
  assert.equal(caps.canUnlock, true);
});

test("explicit lock wins over role suffix: lockState is self, still no handles", () => {
  const node: BuilderNode = { ...roleHeading("headline"), locked: true };
  const caps = resolveNodeCapabilities(node, DESKTOP);
  assert.equal(caps.lockState, "self");
  assert.equal(caps.canUnlock, true);
  assert.equal(caps.move, false);
  assert.equal(caps.del, false);
  assert.equal(caps.duplicate, false);
  assert.equal(caps.propsPanel, "guided");
});

// ── plan × advanced flag ───────────────────────────────────────────────────

test("pre-launch: plan does not paywall nested insert (free == agency)", () => {
  const free = resolveNodeCapabilities(container(), {
    ...DESKTOP,
    plan: "free",
  });
  const agency = resolveNodeCapabilities(container(), {
    ...DESKTOP,
    plan: "agency",
  });
  assert.equal(free.insertChildren, true);
  assert.equal(agency.insertChildren, true);
  assert.deepEqual(free.insertChildKinds, agency.insertChildKinds);
});

test("advancedElementLibraryEnabled false clears nested insert (kill switch)", () => {
  const caps = resolveNodeCapabilities(container(), {
    ...DESKTOP,
    plan: "agency",
    advancedElementLibraryEnabled: false,
  });
  assert.equal(caps.insertChildren, false);
  assert.deepEqual(caps.insertChildKinds, []);
  assert.ok(caps.reasons.includes(NODE_CAPABILITY_REASONS.advancedOff));
  // Chrome still shows Duplicate; the server save guard is a separate check.
  assert.equal(caps.duplicate, true);
  assert.equal(caps.move, true);
});

test("advanced flag wins over plan when both are set", () => {
  const caps = resolveNodeCapabilities(container(), {
    ...DESKTOP,
    plan: "free",
    advancedElementLibraryEnabled: true,
  });
  assert.equal(caps.insertChildren, true);
});

// ── Cross-axis combinations that exist in selection-layer today ────────────

test("ejected section + locked flag: structure insert hidden, canUnlock from self-lock", () => {
  const caps = resolveNodeCapabilities(
    section("cta_banner", { ejected: true, locked: true }),
    DESKTOP,
  );
  assert.equal(caps.lockState, "self");
  assert.equal(caps.canUnlock, true);
  assert.equal(caps.insertChildren, false);
  assert.equal(caps.move, false);
});

test("role-bound child on mobile: still no rotate/resize (role wins, not device)", () => {
  const caps = resolveNodeCapabilities(roleHeading("primaryCta"), MOBILE);
  assert.equal(caps.resize, false);
  assert.equal(caps.rotate, false);
  assert.equal(caps.propsPanel, "guided");
});

test("locked freeform on tablet: resize stays off (lock, not device)", () => {
  const caps = resolveNodeCapabilities(heading("h", true), TABLET);
  assert.equal(caps.resize, false);
  assert.equal(caps.rotate, false);
  assert.equal(caps.canUnlock, true);
});

test("section_embed is a freeform leaf with inline text, not a curated section", () => {
  const node: BuilderNode = {
    id: "embed-1",
    kind: "section_embed",
    props: { sectionTypeKey: "featured_talent" },
  };
  const caps = resolveNodeCapabilities(node, DESKTOP);
  assert.equal(caps.move, true);
  assert.equal(caps.inlineText, true);
  assert.equal(caps.propsPanel, "full");
  assert.equal(caps.insertChildren, false);
});
