/**
 * TUL-1221 guard. The editor context object and its hooks live in edit-context-core.ts so that
 * shared UI primitives can read the context WITHOUT importing the 6,300-line edit-context.tsx,
 * which drags the whole page builder (and the public booking page it embeds) into every admin
 * route that reaches a primitive. This pins the three things that make the split work.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const DIR = join(process.cwd(), "src/components/edit-chrome");
const read = (rel: string) => readFileSync(join(DIR, rel), "utf8");

function sources(): string[] {
  return (readdirSync(DIR, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));
}

test("there is exactly ONE editor context object, in edit-context-core.ts", () => {
  const owners = sources().filter((f) => /EditContext\s*=\s*createContext\b/.test(read(f)));
  assert.deepEqual(owners, ["edit-context-core.ts"], "a second createContext would silently split the editor's state");
});

test("edit-context-core.ts has no runtime dependency on the builder (react and type imports only)", () => {
  const imports = read("edit-context-core.ts").split("\n").filter((l) => /^import\s/.test(l));
  for (const line of imports) {
    assert.ok(/^import type\s/.test(line) || /from "react"/.test(line), `runtime import in the core: ${line}`);
  }
});

test("the shared primitives read the context from the core, never from edit-context.tsx", () => {
  for (const file of ["floating-panel.tsx", "dock-floating-panel.tsx", "inspectors/kit/inspector-ui.tsx"]) {
    const src = read(file);
    assert.match(src, /from "[^"]*edit-context-core"/, `${file} must import from edit-context-core`);
    assert.doesNotMatch(src, /from\s+["'][^"']*\/edit-context["']/, `${file} must not import edit-context.tsx (it pulls in the whole page builder)`);
  }
});

test("edit-context.tsx provides the core context and re-exports both hooks (its importers are unchanged)", () => {
  const src = read("edit-context.tsx");
  assert.match(src, /import \{ EditContext \} from "\.\/edit-context-core"/);
  assert.match(src, /export \{ useEditContext, useMaybeEditContext \} from "\.\/edit-context-core"/);
  assert.doesNotMatch(src, /export function useEditContext\b/);
  assert.doesNotMatch(src, /export function useMaybeEditContext\b/);
});
