import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MOBILE_FONT_SIZE_MIN_PX,
  MOBILE_VIEWPORT_MAX_PX,
  TAP_TARGET_MIN_PX,
  collectMobileOverflowOffenders,
  parseLengthToPx,
  resolveMobileOverflow,
  runMobileHealthCheck,
} from "./mobile-health";
import type {
  BuilderButtonNode,
  BuilderContainerNode,
  BuilderHeadingNode,
  BuilderParagraphNode,
  BuilderSplitNode,
} from "./types";

// ── parseLengthToPx ────────────────────────────────────────────────────────

test("parseLengthToPx parses px values", () => {
  assert.equal(parseLengthToPx("14px"), 14);
  assert.equal(parseLengthToPx("44px"), 44);
  assert.equal(parseLengthToPx("0px"), 0);
  assert.equal(parseLengthToPx("400px"), 400);
});

test("parseLengthToPx parses pt values (approximated)", () => {
  const pt12 = parseLengthToPx("12pt");
  assert.ok(pt12 !== null && pt12 > 15 && pt12 < 17, `expected ~16 got ${pt12}`);
});

test("parseLengthToPx returns null for relative units", () => {
  assert.equal(parseLengthToPx("1rem"), null);
  assert.equal(parseLengthToPx("2em"), null);
  assert.equal(parseLengthToPx("50%"), null);
  assert.equal(parseLengthToPx("100vw"), null);
  assert.equal(parseLengthToPx("calc(100% - 16px)"), null);
});

test("parseLengthToPx returns null for undefined/null/empty", () => {
  assert.equal(parseLengthToPx(undefined), null);
  assert.equal(parseLengthToPx(null), null);
  assert.equal(parseLengthToPx(""), null);
});

// ── Check 1: tiny text ─────────────────────────────────────────────────────

test("flags heading with fontSize below mobile minimum", () => {
  const heading: BuilderHeadingNode = {
    id: "h1",
    kind: "heading",
    props: {
      text: "Hello",
      level: 3,
      style: { fontSize: "10px" },
    },
  };
  const issues = runMobileHealthCheck([heading]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.kind, "tiny_text");
  assert.equal(issues[0]!.nodeId, "h1");
  assert.ok(issues[0]!.message.includes("10px"));
});

test("does not flag heading whose fontSize is at/above minimum", () => {
  const heading: BuilderHeadingNode = {
    id: "h2",
    kind: "heading",
    props: {
      text: "Hello",
      level: 2,
      style: { fontSize: `${MOBILE_FONT_SIZE_MIN_PX}px` },
    },
  };
  const issues = runMobileHealthCheck([heading]);
  assert.equal(issues.length, 0);
});

test("uses mobile override font-size when present", () => {
  const para: BuilderParagraphNode = {
    id: "p1",
    kind: "paragraph",
    props: {
      text: "Body copy",
      style: {
        fontSize: "16px",
        responsive: {
          mobile: { fontSize: "8px" },
        },
      },
    },
  };
  const issues = runMobileHealthCheck([para]);
  const tinyIssues = issues.filter((i) => i.kind === "tiny_text");
  assert.equal(tinyIssues.length, 1);
  assert.ok(tinyIssues[0]!.message.includes("8px"));
});

test("does not flag relative font-size (cannot determine statically)", () => {
  const para: BuilderParagraphNode = {
    id: "p2",
    kind: "paragraph",
    props: {
      text: "Body",
      style: { fontSize: "0.6rem" },
    },
  };
  const issues = runMobileHealthCheck([para]);
  assert.equal(issues.filter((i) => i.kind === "tiny_text").length, 0);
});

test("flags button with sm size token (≈13px < 12px threshold is near boundary)", () => {
  // sm=13px is above the 12px threshold — should NOT flag
  const btn: BuilderButtonNode = {
    id: "btn1",
    kind: "button",
    props: {
      label: "Click",
      href: "#",
      style: { size: "sm" },
    },
  };
  const issues = runMobileHealthCheck([btn]);
  assert.equal(issues.filter((i) => i.kind === "tiny_text").length, 0);
});

// ── Check 2a: tap target size ──────────────────────────────────────────────

test("flags button with explicit width below 44px", () => {
  const btn: BuilderButtonNode = {
    id: "btn2",
    kind: "button",
    props: {
      label: "X",
      href: "#",
      style: { width: "24px" },
    },
  };
  const issues = runMobileHealthCheck([btn]);
  const tapIssues = issues.filter((i) => i.kind === "tap_target");
  assert.equal(tapIssues.length, 1);
  assert.ok(tapIssues[0]!.message.includes("width 24px"));
});

test("does not flag button with width above 44px", () => {
  const btn: BuilderButtonNode = {
    id: "btn3",
    kind: "button",
    props: {
      label: "Book now",
      href: "#",
      style: { width: `${TAP_TARGET_MIN_PX}px` },
    },
  };
  const issues = runMobileHealthCheck([btn]);
  assert.equal(issues.filter((i) => i.kind === "tap_target").length, 0);
});

test("uses mobile override width when present", () => {
  const btn: BuilderButtonNode = {
    id: "btn4",
    kind: "button",
    props: {
      label: "Tap",
      href: "#",
      style: {
        width: "200px",
        responsive: {
          mobile: { width: "20px" },
        },
      },
    },
  };
  const issues = runMobileHealthCheck([btn]);
  const tapIssues = issues.filter((i) => i.kind === "tap_target");
  assert.equal(tapIssues.length, 1);
  assert.ok(tapIssues[0]!.message.includes("width 20px"));
});

// ── Check 2b: container with buttons and no gap ────────────────────────────

test("flags row container with buttons and no gap", () => {
  const container: BuilderContainerNode = {
    id: "row1",
    kind: "container",
    props: { layout: "row" },
    children: [
      {
        id: "btn_a",
        kind: "button",
        props: { label: "A", href: "#" },
      },
      {
        id: "btn_b",
        kind: "button",
        props: { label: "B", href: "#" },
      },
    ],
  };
  const issues = runMobileHealthCheck([container]);
  const tapIssues = issues.filter((i) => i.kind === "tap_target");
  assert.ok(tapIssues.length >= 1);
  assert.ok(tapIssues.some((i) => i.nodeId === "row1"));
});

test("does not flag row container with gap token", () => {
  const container: BuilderContainerNode = {
    id: "row2",
    kind: "container",
    props: { layout: "row", gap: "m" },
    children: [
      { id: "btn_c", kind: "button", props: { label: "A", href: "#" } },
      { id: "btn_d", kind: "button", props: { label: "B", href: "#" } },
    ],
  };
  const issues = runMobileHealthCheck([container]);
  assert.ok(!issues.filter((i) => i.kind === "tap_target").some((i) => i.nodeId === "row2"));
});

test("does not flag stack container with buttons (layout is not row)", () => {
  const container: BuilderContainerNode = {
    id: "stack1",
    kind: "container",
    props: { layout: "stack" },
    children: [
      { id: "btn_e", kind: "button", props: { label: "A", href: "#" } },
    ],
  };
  const issues = runMobileHealthCheck([container]);
  assert.ok(!issues.filter((i) => i.kind === "tap_target").some((i) => i.nodeId === "stack1"));
});

// ── Check 3a: container overflow ───────────────────────────────────────────

test("flags 3-column grid container without mobile stack", () => {
  const container: BuilderContainerNode = {
    id: "grid1",
    kind: "container",
    props: { layout: "grid", columns: 3 },
    children: [],
  };
  const issues = runMobileHealthCheck([container]);
  const overflowIssues = issues.filter((i) => i.kind === "overflow");
  // layout-health.ts flags this as blocking; we also flag it as mobile-health advisory
  assert.ok(overflowIssues.some((i) => i.nodeId === "grid1"));
});

test("does not flag 3-column grid container that stacks on mobile", () => {
  const container: BuilderContainerNode = {
    id: "grid2",
    kind: "container",
    props: {
      layout: "grid",
      columns: 3,
      responsive: { mobile: { layout: "stack" } },
    },
    children: [],
  };
  const issues = runMobileHealthCheck([container]);
  assert.ok(!issues.filter((i) => i.kind === "overflow").some((i) => i.nodeId === "grid2"));
});

test("flags row container with 3+ children and no mobile stack", () => {
  const container: BuilderContainerNode = {
    id: "row3",
    kind: "container",
    props: { layout: "row" },
    children: [
      { id: "p1", kind: "paragraph", props: { text: "A" } },
      { id: "p2", kind: "paragraph", props: { text: "B" } },
      { id: "p3", kind: "paragraph", props: { text: "C" } },
    ],
  };
  const issues = runMobileHealthCheck([container]);
  const overflowIssues = issues.filter((i) => i.kind === "overflow" && i.nodeId === "row3");
  assert.ok(overflowIssues.length >= 1);
});

// ── Check 3a: split overflow ───────────────────────────────────────────────

test("flags split with collapseOnMobile:false", () => {
  const split: BuilderSplitNode = {
    id: "split1",
    kind: "split",
    props: { collapseOnMobile: false },
    children: [],
  };
  const issues = runMobileHealthCheck([split]);
  const overflowIssues = issues.filter((i) => i.kind === "overflow" && i.nodeId === "split1");
  assert.equal(overflowIssues.length, 1);
  assert.ok(overflowIssues[0]!.message.includes("collapseOnMobile"));
});

test("does not flag split that allows mobile collapse (default)", () => {
  const split: BuilderSplitNode = {
    id: "split2",
    kind: "split",
    props: {},
    children: [],
  };
  const issues = runMobileHealthCheck([split]);
  assert.equal(issues.filter((i) => i.kind === "overflow" && i.nodeId === "split2").length, 0);
});

// ── Check 3b: fixed width > viewport ──────────────────────────────────────

test("flags container with fixed width exceeding viewport", () => {
  const container: BuilderContainerNode = {
    id: "wide1",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: `${MOBILE_VIEWPORT_MAX_PX + 200}px` },
    },
    children: [],
  };
  const issues = runMobileHealthCheck([container]);
  const widthIssues = issues.filter((i) => i.kind === "overflow" && i.nodeId === "wide1");
  assert.ok(widthIssues.length >= 1);
  assert.ok(widthIssues[0]!.message.includes(`${MOBILE_VIEWPORT_MAX_PX + 200}px`));
});

test("does not flag container with fixed width within viewport", () => {
  const container: BuilderContainerNode = {
    id: "narrow1",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "320px" },
    },
    children: [],
  };
  const issues = runMobileHealthCheck([container]);
  assert.equal(issues.filter((i) => i.kind === "overflow" && i.nodeId === "narrow1").length, 0);
});

test("does not flag container with relative width", () => {
  const container: BuilderContainerNode = {
    id: "rel1",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%" },
    },
    children: [],
  };
  const issues = runMobileHealthCheck([container]);
  assert.equal(issues.filter((i) => i.kind === "overflow" && i.nodeId === "rel1").length, 0);
});

// ── Owner section propagation ──────────────────────────────────────────────

test("propagates ownerSectionId from ancestor section node", () => {
  const sectionId = "aaaa-bbbb-cccc";
  const issues = runMobileHealthCheck([
    {
      id: "sec1",
      kind: "section",
      props: { sectionId, sectionTypeKey: "hero" },
      children: [
        {
          id: "h-nested",
          kind: "heading",
          props: {
            text: "Tiny",
            level: 4,
            style: { fontSize: "8px" },
          },
        },
      ],
    },
  ]);
  const tinyIssues = issues.filter((i) => i.kind === "tiny_text" && i.nodeId === "h-nested");
  assert.equal(tinyIssues.length, 1);
  assert.equal(tinyIssues[0]!.ownerSectionId, sectionId);
});

// ── All-advisory guard ─────────────────────────────────────────────────────

test("all emitted issues are advisory (severity=warn)", () => {
  const issues = runMobileHealthCheck([
    {
      id: "h-tiny",
      kind: "heading",
      props: { text: "x", level: 3, style: { fontSize: "5px" } },
    },
    {
      id: "btn-small",
      kind: "button",
      props: { label: "x", href: "#", style: { width: "10px" } },
    },
    {
      id: "split-hard",
      kind: "split",
      props: { collapseOnMobile: false },
      children: [],
    },
  ]);
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.severity === "warn"));
});

// ── Empty tree ─────────────────────────────────────────────────────────────

test("returns empty array for empty tree", () => {
  assert.deepEqual(runMobileHealthCheck([]), []);
});

// ── W3-M1: definite overflow is blocking ───────────────────────────────────

test("fixed-width overflow issue is marked blocking", () => {
  const container: BuilderContainerNode = {
    id: "wide-blk",
    kind: "container",
    props: { layout: "stack", style: { width: "1120px" } },
    children: [],
  };
  const issues = runMobileHealthCheck([container]);
  const overflow = issues.find((i) => i.kind === "overflow" && i.nodeId === "wide-blk");
  assert.ok(overflow, "expected an overflow issue");
  assert.equal(overflow!.blocking, true);
  // severity stays "warn" — blocking is a separate promotion signal.
  assert.equal(overflow!.severity, "warn");
});

test("soft overflow heuristics are NOT marked blocking", () => {
  const grid: BuilderContainerNode = {
    id: "grid-soft",
    kind: "container",
    props: { layout: "grid", columns: 3 },
    children: [],
  };
  const split: BuilderSplitNode = {
    id: "split-soft",
    kind: "split",
    props: { collapseOnMobile: false },
    children: [],
  };
  const issues = runMobileHealthCheck([grid, split]);
  const soft = issues.filter(
    (i) => i.kind === "overflow" && (i.nodeId === "grid-soft" || i.nodeId === "split-soft"),
  );
  assert.ok(soft.length >= 2);
  assert.ok(soft.every((i) => !i.blocking));
});

// ── W3-M1: resolveMobileOverflow ───────────────────────────────────────────

test("resolveMobileOverflow returns px + dimension for a fixed 1120px width", () => {
  const container: BuilderContainerNode = {
    id: "w",
    kind: "container",
    props: { layout: "stack", style: { width: "1120px" } },
    children: [],
  };
  assert.deepEqual(resolveMobileOverflow(container), {
    widthPx: 1120,
    dimension: "width",
  });
});

test("resolveMobileOverflow treats minWidth over the viewport as overflow (precedence)", () => {
  const container: BuilderContainerNode = {
    id: "mw",
    kind: "container",
    props: { layout: "stack", style: { minWidth: "900px", width: "100%" } },
    children: [],
  };
  assert.deepEqual(resolveMobileOverflow(container), {
    widthPx: 900,
    dimension: "minWidth",
  });
});

test("resolveMobileOverflow prefers the mobile-override width", () => {
  const container: BuilderContainerNode = {
    id: "ov",
    kind: "container",
    props: {
      layout: "stack",
      style: { width: "100%", responsive: { mobile: { width: "800px" } } },
    },
    children: [],
  };
  assert.deepEqual(resolveMobileOverflow(container), {
    widthPx: 800,
    dimension: "width",
  });
});

test("resolveMobileOverflow returns null for relative + within-viewport widths", () => {
  const relative: BuilderContainerNode = {
    id: "rel",
    kind: "container",
    props: { layout: "stack", style: { width: "100%" } },
    children: [],
  };
  const withinViewport: BuilderContainerNode = {
    id: "narrow",
    kind: "container",
    props: { layout: "stack", style: { width: "320px" } },
    children: [],
  };
  assert.equal(resolveMobileOverflow(relative), null);
  assert.equal(resolveMobileOverflow(withinViewport), null);
});

// ── W3-M1: collectMobileOverflowOffenders (the M3-consumable list) ─────────

test("collectMobileOverflowOffenders returns the offending block for a fixed 1120px container", () => {
  const sectionId = "sec-overflow";
  const offenders = collectMobileOverflowOffenders([
    {
      id: "sec",
      kind: "section",
      props: { sectionId, sectionTypeKey: "hero" },
      children: [
        {
          id: "wide",
          kind: "container",
          props: { layout: "stack", style: { width: "1120px" } },
          children: [],
        },
      ],
    },
  ]);
  assert.equal(offenders.length, 1);
  const [offender] = offenders;
  assert.equal(offender!.nodeId, "wide");
  assert.equal(offender!.nodeKind, "container");
  assert.equal(offender!.ownerSectionId, sectionId);
  assert.equal(offender!.widthPx, 1120);
  assert.equal(offender!.dimension, "width");
  assert.equal(offender!.viewportPx, MOBILE_VIEWPORT_MAX_PX);
  assert.ok(offender!.issue.includes("1120px"));
});

test("collectMobileOverflowOffenders ignores responsive/within-viewport blocks", () => {
  const offenders = collectMobileOverflowOffenders([
    {
      id: "fluid",
      kind: "container",
      props: { layout: "stack", style: { width: "100%" } },
      children: [
        {
          id: "narrow",
          kind: "container",
          props: { layout: "stack", style: { width: "360px" } },
          children: [],
        },
      ],
    },
  ]);
  assert.deepEqual(offenders, []);
});

test("collectMobileOverflowOffenders finds multiple offenders across the tree", () => {
  const offenders = collectMobileOverflowOffenders([
    {
      id: "a",
      kind: "container",
      props: { layout: "stack", style: { width: "1200px" } },
      children: [
        {
          id: "b",
          kind: "container",
          props: { layout: "stack", style: { minWidth: "500px" } },
          children: [],
        },
      ],
    },
  ]);
  assert.equal(offenders.length, 2);
  assert.deepEqual(
    offenders.map((o) => o.nodeId).sort(),
    ["a", "b"],
  );
});

test("collectMobileOverflowOffenders returns empty for a clean responsive tree", () => {
  const offenders = collectMobileOverflowOffenders([
    {
      id: "root",
      kind: "container",
      props: {
        layout: "stack",
        style: { width: "100%", maxWidthFree: "1120px" },
      },
      children: [
        { id: "h", kind: "heading", props: { text: "Hi", level: 2 } },
        { id: "p", kind: "paragraph", props: { text: "Body" } },
      ],
    },
  ]);
  assert.deepEqual(offenders, []);
});
