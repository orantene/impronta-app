/**
 * INVARIANT — admin shell client navigation must not hardcode the tenant slug.
 *
 * On a host that already identifies the tenant (custom domain like
 * improntamodels.com, or a tenant subdomain) the canonical admin URL is the
 * slug-less `/admin` — middleware 308s `/{slug}/admin` back to it (#912).
 * A hardcoded `` `/${tenantSlug}/admin` `` in client navigation therefore:
 *
 *   1. costs a redirect round-trip on every click, and
 *   2. breaks the "am I already here?" guards in setPage/flipMode, which
 *      compare the target against `window.location.pathname` — that is the
 *      BRANDED path, so the slugged target never matches and the guard
 *      stops suppressing redundant navigations.
 *
 * This is not hypothetical. #909 shipped `/${slug}/admin` in the Workspace
 * quick-links menu hours after #912 removed that exact pattern, and had to be
 * fixed by #914. The two PRs were in flight together and nothing caught the
 * collision. This test is that missing check.
 *
 * The rule: inside the admin shell, build client-nav targets from
 * `adminBasePath` (from `useAdminShell()`), which resolves to `/admin` on a
 * branded host and `/{slug}/admin` on the shared app host.
 *
 * DELIBERATELY NOT COVERED:
 *   - `revalidatePath()` — a server-side cache key that must name the REAL
 *     Next.js route (`/{slug}/admin/...`), not the browser-facing URL.
 *   - Absolute cross-host URLs (`https://app.tulala.digital/${slug}/admin`)
 *     and notification/email links — those target the shared app host, where
 *     the slug is required.
 *   - Server-side `redirect()` — middleware canonicalizes the Location, so the
 *     cost is one extra hop, not a broken guard.
 *
 * ESCAPE HATCH: genuinely cross-tenant navigation (a workspace switcher moving
 * to a DIFFERENT tenant) must keep the slug — rewriting it to `/admin` would
 * land on the wrong workspace. Annotate those with `admin-href-allow: <reason>`
 * on the offending line or within the 3 lines above it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SHELL_ROOT = "src/components/admin/shell";
const ALLOW_PRAGMA = "admin-href-allow";
/** Safety cap when scanning the comment block above a match. */
const MAX_COMMENT_BLOCK = 12;

/** Client-side navigation — the calls that actually move the browser. */
const CLIENT_NAV = /window\.location\.(assign|href|replace)|router\.(push|replace)/;
/** A template literal interpolating something straight into an /admin path. */
const SLUGGED_ADMIN = /\/\$\{[^}]*\}\/admin/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

test(`INVARIANT ${SHELL_ROOT}: client nav builds admin hrefs from adminBasePath, not a hardcoded slug`, () => {
  const violations: string[] = [];

  for (const file of walk(SHELL_ROOT)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!CLIENT_NAV.test(line) || !SLUGGED_ADMIN.test(line)) return;

      // The pragma may sit on the line itself, or anywhere in the contiguous
      // comment block directly above it — so a multi-line justification (which
      // is what a real exception deserves) keeps working regardless of length.
      if (line.includes(ALLOW_PRAGMA)) return;
      let allowed = false;
      for (let j = i - 1; j >= 0 && i - j <= MAX_COMMENT_BLOCK; j--) {
        const above = lines[j].trim();
        const isComment =
          above.startsWith("//") || above.startsWith("*") || above.startsWith("/*");
        if (!isComment) break;
        if (above.includes(ALLOW_PRAGMA)) {
          allowed = true;
          break;
        }
      }
      if (allowed) return;

      violations.push(`${file}:${i + 1}\n      ${line.trim()}`);
    });
  }

  assert.deepEqual(
    violations,
    [],
    `Admin client navigation must not hardcode the tenant slug.\n\n` +
      `Use \`adminBasePath\` from useAdminShell():\n` +
      `    window.location.assign(\`\${adminBasePath}/financials\`)\n` +
      `NOT:\n` +
      `    window.location.assign(\`/\${tenantSlug}/admin/financials\`)\n\n` +
      `On improntamodels.com the second form yields the doubled, non-canonical\n` +
      `/impronta/admin/financials, which middleware then 308s away — and it\n` +
      `breaks the pathname-comparison guards in setPage/flipMode.\n\n` +
      `If this navigation is genuinely CROSS-TENANT (switching to a different\n` +
      `workspace, where the slug is required), annotate it:\n` +
      `    // ${ALLOW_PRAGMA}: cross-tenant switch — target is another workspace\n\n` +
      `Offending sites:\n  - ${violations.join("\n  - ")}`,
  );
});

test(`INVARIANT ${SHELL_ROOT}: the guard actually scans a non-trivial number of files`, () => {
  // Guards that silently scan nothing are worse than no guard — if the shell
  // is ever moved or renamed, this fails loudly instead of passing vacuously.
  const files = walk(SHELL_ROOT);
  assert.ok(
    files.length > 50,
    `Expected to scan the admin shell (>50 files), found ${files.length}. ` +
      `Did ${SHELL_ROOT} move? Update SHELL_ROOT.`,
  );
});
