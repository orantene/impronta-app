/**
 * TUL-1278: Today at an 800px desktop viewport clipped its right edge
 * ("Continuar configuración", "Disponibilidad"). The talent surface grid was
 * `240px 1fr`; a `1fr` track never shrinks below its content's min-content
 * width, so one wide unshrinkable row made the whole content column wider than
 * the viewport and every right-aligned control slid off screen (the shell's
 * min-width:0 / overflow clip defence only applies at <= 720px). The content
 * track is now `minmax(0,1fr)` and the main column is `min-w-0`, so rows wrap
 * or shrink inside the viewport.
 *
 *   cd web && npm run test:wt -- src/components/admin/shell/internal/talent-surface-no-clip.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/talent.tsx"), "utf8");

test("talent surface content track can shrink below its content width", () => {
  const start = src.indexOf("export function TalentSurface()");
  assert.ok(start > 0, "TalentSurface not found");
  const body = src.slice(start, src.indexOf("<TalentRouter />", start));
  assert.match(body, /grid-cols-\[240px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(body, /grid-cols-\[240px_1fr\]/);
  const main = body.slice(body.indexOf('id="tulala-talent-content"'));
  assert.match(main, /className="[^"]*\bmin-w-0\b[^"]*"/);
});
