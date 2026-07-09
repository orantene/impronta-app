/**
 * Deterministic tree-linter scorecard for the AI page-builder eval (AIQ-18).
 *
 * Pure (no model, no server-only): reuses the in-repo linters (layout-health,
 * freeform-heading-outline, a11y/contrast) plus regexes that mirror the prompt's
 * own KEEP rules (dash ban, brand vocab, generic CTAs). Runs on any BuilderNode
 * tree with no key, so it can gate every generated tree in CI and back the
 * KEEP-invariant tests (AIQ-32). Also folds in the AIQ-27 monotony advisory
 * (consecutive card-grid sections, missing closing CTA) as scored findings.
 */
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { collectBuilderTreeLayoutFindings } from "@/lib/site-admin/builder-node/layout-health";
import { lintBuilderTreeA11y } from "@/lib/site-admin/builder-node/freeform-heading-outline";
import { contrastRatio, classifyContrast } from "@/lib/site-admin/a11y/contrast";
import { GENERATION_ALLOWED_KINDS } from "./generation-allowed-kinds";

export interface ScorecardFinding {
  code:
    | "em_dash" | "en_dash" | "banned_vocab" | "generic_cta"
    | "multiple_h1" | "missing_h1" | "skipped_level" | "h2_before_h1"
    | "lone_color" | "band_low_contrast"
    | "layout_warning" | "disallowed_kind"
    | "monotony_grids" | "no_closing_cta";
  severity: "error" | "warn" | "info";
  nodeId?: string;
  detail: string;
}

export interface Scorecard {
  score: number; // 100 - weighted penalties, clamped 0..100
  findings: ScorecardFinding[];
  counts: { errors: number; warns: number; infos: number };
}

// ── deterministic regexes (mirror the prompt's KEEP rules) ────────────────────
const EM_DASH = /—/; // —
const EN_DASH = /–/; // –
const BANNED_VOCAB = /\b(buyer|cart|checkout|add to cart|shop|purchase|pay to dm)\b/i;
const GENERIC_CTA = /^(learn more|click here|read more|submit)$/i;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** All user-visible copy strings a node contributes (for dash/vocab checks). */
function nodeCopyStrings(node: BuilderNode): string[] {
  const props = asRecord((node as { props?: unknown }).props);
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.length) out.push(v);
  };
  switch (node.kind) {
    case "heading":
    case "paragraph":
      push(props.text);
      break;
    case "button":
      push(props.label);
      break;
    case "accordion_item":
      push(props.title);
      break;
    case "form": {
      const fields = Array.isArray(props.fields) ? props.fields : [];
      for (const f of fields) {
        const fr = asRecord(f);
        push(fr.label);
        push(fr.placeholder);
      }
      break;
    }
    case "pricing_table": {
      const tiers = Array.isArray(props.tiers) ? props.tiers : [];
      for (const t of tiers) {
        const tr = asRecord(t);
        push(tr.name);
        push(tr.price);
        push(tr.period);
        push(tr.description);
        push(tr.ctaLabel);
        const feats = Array.isArray(tr.features) ? tr.features : [];
        for (const feat of feats) push(asRecord(feat).label);
      }
      break;
    }
  }
  return out;
}

function walkTree(tree: BuilderNodeTree, visit: (n: BuilderNode) => void): void {
  const walk = (n: BuilderNode) => {
    visit(n);
    const kids = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  tree.forEach(walk);
}

/** A section is a "card grid" if it contains a grid container of >=2 cards. */
function isCardGridSection(section: BuilderNode): boolean {
  let hit = false;
  walkTree([section], (n) => {
    if (n.kind === "container") {
      const props = asRecord((n as { props?: unknown }).props);
      const kids = (n as { children?: BuilderNode[] }).children ?? [];
      const cards = kids.filter((k) => k.kind === "card").length;
      if (props.layout === "grid" && cards >= 2) hit = true;
    }
  });
  return hit;
}

export function scoreGeneratedTree(
  tree: BuilderNodeTree,
  opts: { scope?: "page" | "section" } = {},
): Scorecard {
  const findings: ScorecardFinding[] = [];
  const add = (f: ScorecardFinding) => findings.push(f);

  // 1. Dash / vocab / generic-CTA (KEEP dash-ban + brand vocab + CTA rules).
  walkTree(tree, (n) => {
    const nodeId = (n as { id?: string }).id;
    for (const s of nodeCopyStrings(n)) {
      if (EM_DASH.test(s)) add({ code: "em_dash", severity: "error", nodeId, detail: `em dash in copy: "${s.slice(0, 40)}"` });
      if (EN_DASH.test(s)) add({ code: "en_dash", severity: "error", nodeId, detail: `en dash in copy: "${s.slice(0, 40)}"` });
      if (BANNED_VOCAB.test(s)) add({ code: "banned_vocab", severity: "error", nodeId, detail: `commerce vocab in copy: "${s.slice(0, 40)}"` });
    }
    if (n.kind === "button") {
      const label = asRecord((n as { props?: unknown }).props).label;
      if (typeof label === "string" && GENERIC_CTA.test(label.trim())) {
        add({ code: "generic_cta", severity: "warn", nodeId, detail: `generic CTA label: "${label}"` });
      }
    }
  });

  // 2. Heading hierarchy (single level:1, no skips). A standalone SECTION
  // correctly has NO level:1 (the prompt reserves H1 for the hero), so
  // missing_h1 is skipped for scope:"section" — grading it there penalized
  // correct output on the first live eval run (all 10 section-scope cases).
  for (const issue of lintBuilderTreeA11y(tree).headingIssues) {
    if (opts.scope === "section" && issue.kind === "missing_h1") continue;
    const severity = issue.kind === "missing_h1" ? "error" : "warn";
    add({ code: issue.kind, severity, nodeId: issue.heading?.sectionId, detail: issue.message });
  }

  // 3. Color pairing (lone color) + 4. band contrast.
  walkTree(tree, (n) => {
    const style = asRecord(asRecord((n as { props?: unknown }).props).style);
    const nodeId = (n as { id?: string }).id;
    const hasText = typeof style.textColor === "string";
    const hasBg = typeof style.backgroundColor === "string";
    if (hasText !== hasBg) {
      add({ code: "lone_color", severity: "warn", nodeId, detail: `lone ${hasText ? "textColor" : "backgroundColor"} with no pair` });
    } else if (hasText && hasBg) {
      const ratio = contrastRatio(style.textColor as string, style.backgroundColor as string);
      // Only literal hex/rgb pairs return a ratio; theme var() colors return null and are skipped.
      if (ratio != null && classifyContrast(ratio) === "fail") {
        add({ code: "band_low_contrast", severity: "warn", nodeId, detail: `band contrast ${ratio.toFixed(2)} < 3` });
      }
    }
  });

  // 5. Layout findings.
  for (const f of collectBuilderTreeLayoutFindings(tree)) {
    if (f.level === "warning") add({ code: "layout_warning", severity: "warn", nodeId: f.nodeId, detail: `${f.id}: ${f.title}` });
    else add({ code: "layout_warning", severity: "info", nodeId: f.nodeId, detail: `${f.id}: ${f.title}` });
  }

  // 6. Disallowed kind (belt-and-suspenders on a validated tree).
  const allowed = new Set<string>(GENERATION_ALLOWED_KINDS as ReadonlyArray<string>);
  walkTree(tree, (n) => {
    if (!allowed.has(n.kind)) add({ code: "disallowed_kind", severity: "error", nodeId: (n as { id?: string }).id, detail: `kind not in the generation set: ${n.kind}` });
  });

  // 7. Monotony (AIQ-27, advisory): 3+ consecutive card-grid sections, and a
  // page (>=3 sections) with no closing CTA in its last section.
  const roots = tree.filter((n) => n.kind === "section");
  let run = 0;
  for (const s of roots) {
    run = isCardGridSection(s) ? run + 1 : 0;
    if (run === 3) add({ code: "monotony_grids", severity: "warn", nodeId: (s as { id?: string }).id, detail: "3+ consecutive card-grid sections" });
  }
  if (roots.length >= 3) {
    const last = roots[roots.length - 1]!;
    let hasCta = false;
    walkTree([last], (n) => {
      if (n.kind === "cta_group" || n.kind === "button") hasCta = true;
    });
    if (!hasCta) add({ code: "no_closing_cta", severity: "info", nodeId: (last as { id?: string }).id, detail: "final section has no CTA" });
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  const infos = findings.filter((f) => f.severity === "info").length;
  const score = Math.max(0, Math.min(100, 100 - 15 * errors - 5 * warns - 1 * infos));
  return { score, findings, counts: { errors, warns, infos } };
}

// ── AIQ-17 expectation grader (deterministic pass/fail against a brief's expect) ─
export interface Expectation {
  minSections: number;
  kindsPresent: string[];
  kindsAbsent?: string[];
  maxNodes: number;
  singleH1: boolean;
  noEmDash: boolean;
}

export function evaluateExpectations(
  tree: BuilderNodeTree,
  expect: Expectation,
  opts: { scope?: "page" | "section" } = {},
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const kinds = new Set<string>();
  let nodeCount = 0;
  let sectionCount = 0;
  walkTree(tree, (n) => {
    nodeCount++;
    kinds.add(n.kind);
    if (n.kind === "section") sectionCount++;
  });
  if (sectionCount < expect.minSections) failures.push(`sections ${sectionCount} < ${expect.minSections}`);
  if (nodeCount > expect.maxNodes) failures.push(`nodes ${nodeCount} > ${expect.maxNodes}`);
  for (const k of expect.kindsPresent) if (!kinds.has(k)) failures.push(`missing kind ${k}`);
  for (const k of expect.kindsAbsent ?? []) if (kinds.has(k)) failures.push(`present-but-banned kind ${k}`);
  if (expect.singleH1 || expect.noEmDash) {
    const card = scoreGeneratedTree(tree, opts);
    // Scope-aware H1 semantics: a PAGE must have exactly one level:1 (missing or
    // multiple both violate). A standalone SECTION correctly opens with level:2
    // and has NO H1 (the prompt reserves H1 for the hero) — only MULTIPLE H1s
    // violate. Grading missing_h1 against sections penalized correct output
    // (verified on the first live eval run: all 10 section-scope cases).
    const h1Codes = opts.scope === "section" ? ["multiple_h1"] : ["missing_h1", "multiple_h1"];
    if (expect.singleH1 && card.findings.some((f) => (h1Codes as string[]).includes(f.code))) failures.push("singleH1 violated");
    if (expect.noEmDash && card.findings.some((f) => f.code === "em_dash" || f.code === "en_dash")) failures.push("noEmDash violated");
  }
  return { pass: failures.length === 0, failures };
}
