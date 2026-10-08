/**
 * TUL-278: the dashboard renders exactly ONE skip link, in the page language,
 * and its target id exists exactly once.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const SRC = path.resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("dashboard skip link (TUL-278)", () => {
  it("no hard-coded English skip-link literal remains in src", () => {
    const offenders = walk(SRC).filter((f) =>
      />\s*Skip to main content\s*</.test(readFileSync(f, "utf8")),
    );
    assert.deepEqual(offenders, []);
  });

  it("the shell renders one localized skip link and the rail components render none", () => {
    const shell = read("components/admin/shell/admin-shell-client.tsx");
    assert.equal((shell.match(/className="skip-to-main"/g) ?? []).length, 1);
    assert.match(shell, /copy\.t\("Skip to main content"\)/);
    assert.doesNotMatch(read("components/admin/shell/internal/talent.tsx"), /skip-to-main/);
    assert.doesNotMatch(
      read("components/admin/shell/internal/page-modules/WorkspaceShell.tsx"),
      /skip-to-main/,
    );
  });

  it("has a Spanish translation for the key", () => {
    assert.match(
      read("components/admin/shell/internal/dashboard-i18n.ts"),
      /"Skip to main content": "Saltar al contenido principal"/,
    );
  });

  it("each skip target id exists on the surface main", () => {
    const talent = read("components/admin/shell/internal/talent.tsx");
    assert.equal((talent.match(/id="tulala-talent-content"/g) ?? []).length, 1);
    const ws = read("components/admin/shell/internal/page-modules/WorkspaceShell.tsx");
    // One per mutually exclusive render branch (POS chrome vs standard).
    assert.equal((ws.match(/id="tulala-workspace-content"/g) ?? []).length, 2);
    const shell = read("components/admin/shell/admin-shell-client.tsx");
    assert.match(shell, /#tulala-talent-content/);
    assert.match(shell, /#tulala-workspace-content/);
  });
});
