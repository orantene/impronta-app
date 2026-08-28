import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * commerce-drawer-deeplink.static.test.ts — every Commerce tab that owns a
 * drawer must be told what `?d=` said on the server.
 *
 * THE BUG CLASS: `useUrlDrawer` reads `?d=` through `useSearchParams`, which is
 * empty until the client hydrates. Clicking a button works, so the gap is
 * invisible in development; only a COLD load of a shared link exposes it, and
 * then the drawer simply never opens. PR #1390 fixed exactly this for the
 * Catalog tab by threading `initialDrawerId` from the server page. The Discounts
 * tab was written later, reached for the same hook, and inherited the bug —
 * nothing structural connected the two, and its own docblock claimed deep links
 * worked while they did not.
 *
 * So the link is asserted instead of remembered: if a Commerce view calls
 * `useUrlDrawer`, it must accept `initialDrawerId` AND `tab-body.tsx` must pass
 * it. The next tab with a drawer fails here rather than in production.
 */

const COMMERCE = resolve(
  process.cwd(),
  "src/app/(workspace)/platform/admin/commerce",
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

test("every Commerce view with a URL drawer is seeded from the server", () => {
  const tabBody = readFileSync(join(COMMERCE, "tab-body.tsx"), "utf8");
  // The call sites are generic (`useUrlDrawer<string>()`), so match the type
  // argument too — matching only `useUrlDrawer(` finds nothing and the guard
  // then passes by looking at zero files.
  const files = walk(COMMERCE).filter((f) =>
    /useUrlDrawer\s*[<(]/.test(readFileSync(f, "utf8")),
  );

  assert.ok(
    files.length > 0,
    "expected at least one Commerce view to use useUrlDrawer — if drawers moved, retarget this guard rather than deleting it",
  );

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const name = file.slice(file.lastIndexOf("/") + 1).replace(/\.tsx$/, "");

    assert.match(
      source,
      /initialDrawerId/,
      `${name} calls useUrlDrawer but never accepts initialDrawerId, so a cold-loaded ?d= link cannot open its drawer`,
    );

    // The component is only reachable through tab-body, so that is where the
    // prop has to actually be handed over — declaring it is not enough.
    if (!tabBody.includes(`<${name}`)) continue;
    const usage = tabBody.slice(tabBody.indexOf(`<${name}`));
    const end = usage.indexOf("/>");
    assert.match(
      usage.slice(0, end === -1 ? undefined : end),
      /initialDrawerId=\{initialDrawerId\}/,
      `tab-body.tsx renders <${name}> without passing initialDrawerId, so its drawer stays shut on a cold deep link`,
    );
  }
});
