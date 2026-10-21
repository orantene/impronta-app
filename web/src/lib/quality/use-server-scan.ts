/**
 * use-server-scan.ts — a small source scanner for the "use server" guards (TUL-1744, TUL-1758, TUL-1763).
 *
 * Plain functions over source text so the guards (and their own self-tests) need no TypeScript compiler:
 * which files are "use server" files, what each file EXPORTS (the shape rules), and every exported action's
 * parameter list and body (the argument rules). Deliberately approximate where exactness is not needed
 * (comments are stripped by pattern; a body is found by brace balance), and strict where it matters.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function walkSource(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walkSource(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** True when the file's directive prologue says "use server" (comments and blank lines may precede it). */
export function isUseServerFile(src: string): boolean {
  const head = src.replace(/^\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|\s)*/, "");
  return /^["']use server["']/.test(head);
}

/** Drop block comments and whole-line `//` comments, so prose never reads as code. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Index just past the closer matching an opener already consumed (depth 1 at `from`). */
export function matchClose(src: string, from: number, open: string, close: string): number {
  let depth = 1;
  let i = from;
  while (i < src.length && depth > 0) {
    const ch = src[i++];
    if (ch === open) depth++;
    else if (ch === close) depth--;
  }
  return i;
}

// ── 1. What a "use server" file may EXPORT ──────────────────────────────────────────────────────────────

export type ExportShape =
  | "async-function"
  | "default-async-function"
  | "const-async"
  | "type-declaration"
  | "type-reexport-from"
  | "type-reexport-bare"
  | "other";

export type ExportStatement = { shape: ExportShape; head: string; name: string | null };

/**
 * Every top-level `export` of a file, classified. Allowed in a "use server" file: an async function, a
 * `const x = async ...`, and TYPE-only exports that are erased (an inline `export type X = ...` /
 * `export interface X`, and `export type { A } from "..."`). Everything else breaks, or can break, the
 * Next/Turbopack build or exports a non-action value: a bare `export type { X };` (the form that broke
 * batch 10), `export { x }`, `export *`, a sync function, a non-async const, a class, an enum, `let`/`var`.
 */
export function exportStatements(source: string): ExportStatement[] {
  const src = stripComments(source);
  const out: ExportStatement[] = [];
  const re = /^export\b/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index);
    const head = rest.slice(0, rest.indexOf("\n") === -1 ? undefined : rest.indexOf("\n")).trim();
    let t: RegExpMatchArray | null;
    if ((t = /^export\s+async\s+function\s*\*?\s*(\w+)/.exec(rest))) out.push({ shape: "async-function", head, name: t[1] });
    else if (/^export\s+default\s+async\s+function\b/.test(rest)) out.push({ shape: "default-async-function", head, name: null });
    else if ((t = /^export\s+const\s+(\w+)\s*(?::[^=\n]+)?=\s*async\b/.exec(rest))) out.push({ shape: "const-async", head, name: t[1] });
    else if (/^export\s+type\s*\{/.test(rest)) {
      const open = rest.indexOf("{");
      const close = matchClose(rest, open + 1, "{", "}");
      out.push({ shape: /^\s*from\s*["']/.test(rest.slice(close)) ? "type-reexport-from" : "type-reexport-bare", head, name: null });
    } else if ((t = /^export\s+(?:type|interface)\s+(\w+)/.exec(rest))) out.push({ shape: "type-declaration", head, name: t[1] });
    else out.push({ shape: "other", head, name: null });
  }
  return out;
}

const FORBIDDEN_SHAPES: ReadonlySet<ExportShape> = new Set(["type-reexport-bare", "other"]);

/** Exports a "use server" file must not have, as readable lines. */
export function forbiddenExports(source: string): string[] {
  return exportStatements(source)
    .filter((e) => FORBIDDEN_SHAPES.has(e.shape))
    .map((e) => e.head.slice(0, 100));
}

// ── 2. Exported actions: parameter list and body ────────────────────────────────────────────────────────

export type ExportedAction = { name: string; params: string; body: string };

/** Index of the `{` that opens a function body after its parameter list, skipping the return type. */
function bodyStart(src: string, from: number): number {
  let angle = 0;
  let paren = 0;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (ch === "<") angle++;
    else if (ch === ">" && src[i - 1] !== "=") angle = Math.max(0, angle - 1);
    else if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "{" && angle === 0 && paren === 0) return i + 1;
    else if (ch === ";" && angle === 0 && paren === 0) return -1;
  }
  return -1;
}

/** Every exported async action (function form, default, and `export const x = async (...)`). */
export function exportedActions(source: string): ExportedAction[] {
  const src = stripComments(source);
  const out: ExportedAction[] = [];
  const starts = [
    /^export\s+async\s+function\s*\*?\s*(\w+)\s*(?:<[^>]*>)?\s*\(/gm,
    /^export\s+default\s+async\s+function\s*(\w*)\s*(?:<[^>]*>)?\s*\(/gm,
    /^export\s+const\s+(\w+)\s*(?::[^=\n]+)?=\s*async\s*(?:function\s*\w*\s*)?(?:<[^>]*>\s*)?\(/gm,
  ];
  for (const re of starts) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const pe = matchClose(src, re.lastIndex, "(", ")");
      const params = src.slice(re.lastIndex, pe - 1);
      const bs = bodyStart(src, pe);
      const body = bs === -1 ? src.slice(pe, pe + 2000) : src.slice(bs, Math.min(matchClose(src, bs, "{", "}"), bs + 40_000));
      out.push({ name: m[1] || "default", params, body });
    }
  }
  return out;
}

// ── 3. A client-chosen tenant ───────────────────────────────────────────────────────────────────────────

const TENANT_MEMBER = /\b(tenantId|tenantSlug)\b\s*\??\s*:/;

/** The parameter name/member that lets the CALLER choose the workspace, or null. */
export function clientChosenTenant(params: string, source: string): string | null {
  const direct = TENANT_MEMBER.exec(params) ?? /\{[^}]*\b(tenantId|tenantSlug)\b[^}]*\}\s*:/.exec(params);
  if (direct) return direct[1];
  // A named type or zod schema declared in the same file: `input: Foo`, `z.infer<typeof fooSchema>`.
  const src = stripComments(source);
  for (const id of new Set(params.match(/\b[A-Za-z_]\w*\b/g) ?? [])) {
    for (const decl of [
      new RegExp(`\\b(?:type|interface)\\s+${id}\\b[^{=]*[={]`),
      new RegExp(`\\b(?:const|let)\\s+${id}\\s*=\\s*z\\s*\\.\\s*object\\s*\\(`),
    ]) {
      const m = decl.exec(src);
      if (!m) continue;
      const open = m[0].endsWith("(") ? "(" : "{";
      const block = src.slice(m.index + m[0].length, matchClose(src, m.index + m[0].length, open, open === "(" ? ")" : "}"));
      const hit = TENANT_MEMBER.exec(block);
      if (hit) return `${hit[1]} (in ${id})`;
    }
  }
  return null;
}

/**
 * Evidence that the action re-resolves the workspace through the caller's own membership instead of
 * trusting the client's value: a call to one of the scope/membership/authorisation helpers this codebase
 * uses (incl. local `gate(...)` wrappers). `requireNotImpersonating` is NOT one: it decides nothing about scope.
 */
export const SCOPE_RESOLVER =
  /\b(require(?!NotImpersonating)[A-Z]\w*|ownTenantId|authorizeForWorkspace|authorize\w*|getTenantScope\w*|getTenantPortalScope\w*|getAdminWorkspaceScope|resolveContext|resolveScope\w*|resolveTenant\w*|gate\w*|guard\w*|isPlatformAdmin|userHasCapability|withInquiryBooking|assert(?!NotImpersonating)[A-Z]\w*(?:Access|Scope|Member\w*|Tenant\w*))\s*\(/;
