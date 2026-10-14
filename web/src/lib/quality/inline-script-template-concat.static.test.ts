/**
 * TUL-608 guard (follow-up to TUL-597 / PR #3531).
 *
 * Next's SWC minifier truncated `ANALYTICS_ALLOWED_JS`, a constant built as
 * `` `a${x}` + `b${y}` `` and then inlined into another template: the text after the
 * first `${...}` was dropped and every inline consent script broke. The fix made it one
 * template literal. This test forbids the shape from coming back: a `+` chain that mixes
 * a template literal WITH substitutions and another string or template literal, in the
 * files that build inline script content (SCRIPT_BUILDERS: src/lib/analytics/**, site-admin
 * tracking and runtime scripts, render.tsx).
 *
 * Fix a hit by writing ONE template literal (embed the pieces with `${...}`).
 * Allow-list: ALLOWED below, by file path with a reason. Prefer fixing over listing.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import ts from "typescript";

import { WEB_ROOT } from "./supabase-unchecked-read";

/**
 * "relative/path.ts" -> reason. These build script text from plain string pieces and are
 * bundled, minified and parsed by consent-snippet-minify.test.ts, which proves they survive.
 */
const ALLOWED: Record<string, string> = {
  "src/lib/site-admin/tracking.ts": "tag snippets; every tag body is minified and parsed by consent-snippet-minify.test.ts",
  "src/lib/site-admin/builder-node/reveal-runtime.ts": "reveal/scroll scripts; minified and parsed by consent-snippet-minify.test.ts",
};

const SRC = join(WEB_ROOT, "src");
/** Files that build inline script text (not every file that mentions a script tag). */
const SCRIPT_BUILDERS = /^src\/lib\/analytics\/|^src\/lib\/site-admin\/(tracking|builder-node\/[\w-]*runtime)[\w-]*\.tsx?$|(^|\/)render\.tsx$/;

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isStringish(node: ts.Node): boolean {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
}

/** Flatten a left-leaning `a + b + c` chain into its operands. */
function operands(node: ts.Expression, out: ts.Expression[] = []): ts.Expression[] {
  const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
  if (ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    operands(inner.left, out);
    operands(inner.right, out);
  } else {
    out.push(inner);
  }
  return out;
}

/** Line numbers (1-based) of outermost `+` chains with a substituting template plus another literal. */
export function findTemplateConcat(fileName: string, text: string): number[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: number[] = [];
  const visit = (node: ts.Node, insideChain: boolean) => {
    const isPlus = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
    if (isPlus && !insideChain) {
      const ops = operands(node as ts.Expression);
      const literals = ops.filter(isStringish);
      if (literals.length >= 2 && literals.some(ts.isTemplateExpression)) {
        hits.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      }
    }
    ts.forEachChild(node, (child) => visit(child, isPlus || (insideChain && ts.isParenthesizedExpression(node))));
  };
  visit(sf, false);
  return hits;
}

test("detector flags template+template and string+template (planted shapes)", () => {
  assert.deepEqual(findTemplateConcat("x.ts", "const a = `a${x}` + `b${y}`;"), [1]);
  assert.deepEqual(findTemplateConcat("x.ts", "const a = 'a' + `b${y}`;"), [1]);
  assert.deepEqual(findTemplateConcat("x.ts", "const a = `a${x}` + 'b' + z;"), [1]);
  assert.deepEqual(findTemplateConcat("x.ts", "const a = `a${x}`;\nconst b = 'a' + 'b';\nconst c = 'a' + z;"), []);
});

test("no template+template / string+template constants in inline-script files", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC, [])) {
    const rel = relative(WEB_ROOT, file).split("\\").join("/");
    const text = readFileSync(file, "utf8");
    const inScope = SCRIPT_BUILDERS.test(rel);
    if (!inScope) continue;
    for (const line of findTemplateConcat(file, text)) {
      const key = `${rel}:${line}`;
      if (!(rel in ALLOWED)) offenders.push(key);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "Concatenated template literals can be truncated by the production minifier when inlined into inline scripts (TUL-597). Use one template literal, or add the file to ALLOWED with a reason:\n" + offenders.join("\n"),
  );
});
