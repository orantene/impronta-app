/**
 * Duplicate import bindings: the same local name imported twice in one file.
 * A hand-merge produced this once and broke a staging build; eslint does not
 * catch it (only tsc does). This is a parse-only scan, no type information.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

export type DupBinding = { readonly line: number; readonly name: string; readonly firstLine: number };

export function findDuplicateImportBindings(source: string, fileName = "x.tsx"): DupBinding[] {
  if ((source.match(/^\s*import\b/gm) ?? []).length < 2) return [];
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const seen = new Map<string, number>();
  const dups: DupBinding[] = [];
  const add = (id: ts.Identifier) => {
    const name = id.text;
    const line = sf.getLineAndCharacterOfPosition(id.getStart(sf)).line + 1;
    const first = seen.get(name);
    if (first === undefined) seen.set(name, line);
    else dups.push({ line, name, firstLine: first });
  };
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const c = st.importClause;
    if (c.name) add(c.name);
    const nb = c.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) add(nb.name);
    else if (nb) for (const el of nb.elements) add(el.name);
  }
  return dups;
}

export const WEB_ROOT = join(__dirname, "../../..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

export function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isSymbolicLink() || SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listSourceFiles(p));
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** "relative/file.ts:LINE name" for every duplicate under src and emails. */
export function scanTree(): string[] {
  const out: string[] = [];
  for (const root of ["src", "emails"]) {
    for (const f of listSourceFiles(join(WEB_ROOT, root))) {
      for (const d of findDuplicateImportBindings(readFileSync(f, "utf8"), f)) {
        out.push(`${relative(WEB_ROOT, f)}:${d.line} ${d.name} (first imported line ${d.firstLine})`);
      }
    }
  }
  return out.sort();
}
