import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// TUL-220: /talent/profile stayed blank on a direct load. Render code of the
// Profile page must not read the clock, storage or the host locale (a server vs
// browser mismatch is React #418, which discards the server HTML), and the
// page chunk must never fall back to `null` while it loads.

const ROOT = path.resolve(__dirname, "../../../../../..");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (rel: string) => strip(readFileSync(path.join(ROOT, rel), "utf8"));

const PROFILE_FILES = [
  "components/admin/shell/internal/talent/pages/MyProfilePage.tsx",
  "components/admin/shell/internal/talent/pages/ProfileEditorPanel.tsx",
  "components/admin/shell/internal/talent/pages/ProfilePageSkeleton.tsx",
  "components/admin/shell/internal/talent/shared/profile-sections-1.tsx",
  "components/admin/shell/internal/talent/shared/profile-sections-2.tsx",
  "components/talent/studio/useWebsiteEligibility.ts",
];

test("Profile page files read no clock, storage or host locale", () => {
  for (const f of PROFILE_FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /localStorage|sessionStorage/, `${f}: storage read`);
    assert.doesNotMatch(src, /Date\.now\(\)|new Date\(|Math\.random\(/, `${f}: nondeterministic render`);
    assert.doesNotMatch(src, /\.toLocale\w*\(/, `${f}: unpinned toLocale*`);
    assert.doesNotMatch(src, /navigator\./, `${f}: navigator read`);
  }
});

test("the Profile page chunk shows a skeleton, never null, while it loads", () => {
  const src = read("components/admin/shell/internal/talent.tsx");
  const line = src.split("\n").find((l) => l.includes("const MyProfilePage = dynamic"));
  assert.ok(line, "MyProfilePage dynamic import missing");
  assert.match(line!, /loading:\s*\(\)\s*=>\s*<ProfilePageSkeleton/);
});

test("the talent layout loads its independent reads in one batch", () => {
  const src = read("app/(workspace)/talent/_talent-layout-inner.tsx");
  assert.doesNotMatch(src, /=\s*await loadTalentVisibleInquiryIds/);
  assert.doesNotMatch(src, /=\s*await loadTalentPlanGrants/);
  assert.doesNotMatch(src, /=\s*await loadPlatformOperatingCurrency/);
  assert.doesNotMatch(src, /=\s*await getRequestLocale/);
});
