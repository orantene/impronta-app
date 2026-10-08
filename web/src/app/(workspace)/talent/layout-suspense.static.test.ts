/**
 * The talent layout must paint a skeleton immediately instead of streaming the
 * whole shell inside a Suspense boundary with no fallback (P0: blank first paint
 * on production). The session redirect must stay OUTSIDE the boundary so it is
 * an HTTP-level redirect, not one emitted mid-stream.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const DIR = join(fileURLToPath(new URL(".", import.meta.url)));

/** True when the source renders <Suspense fallback={<Something ... />}>. */
export function hasSuspenseWithFallback(src: string): boolean {
  return /<Suspense\s+fallback=\{\s*<[A-Za-z]/.test(src);
}

/** True when the session redirect appears before the first <Suspense. */
export function sessionRedirectBeforeSuspense(src: string): boolean {
  const redirectAt = src.indexOf('redirect("/login');
  const suspenseAt = src.indexOf("<Suspense");
  return redirectAt !== -1 && suspenseAt !== -1 && redirectAt < suspenseAt;
}

export function hasHexLiteral(src: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(src);
}

const layout = readFileSync(join(DIR, "layout.tsx"), "utf8");
const skeletonPath = join(DIR, "_talent-shell-skeleton.tsx");

test("default export wraps the heavy inner layout in Suspense with a fallback", () => {
  assert.ok(hasSuspenseWithFallback(layout), "no <Suspense fallback={<.../>}> in layout.tsx");
  assert.match(layout, /<TalentLayoutInner>/);
  assert.match(layout, /fallback=\{<TalentShellSkeleton \/>\}/);
  assert.doesNotMatch(layout, /fallback=\{null\}/);
});

test("session redirect stays outside (before) the Suspense", () => {
  assert.ok(sessionRedirectBeforeSuspense(layout), "login redirect must precede <Suspense");
  assert.match(layout, /redirect\("\/login\?next=\/talent\/today"\)/);
});

test("skeleton module exists, is aria-busy and has no hex literal", () => {
  assert.ok(existsSync(skeletonPath), "_talent-shell-skeleton.tsx is missing");
  const sk = readFileSync(skeletonPath, "utf8");
  assert.match(sk, /aria-busy="true"/);
  assert.ok(!hasHexLiteral(sk), "skeleton must use design tokens, not hex literals");
});

test("SELF-TEST: the checks bite on synthetic input", () => {
  assert.equal(hasSuspenseWithFallback("<Suspense><X/></Suspense>"), false);
  assert.equal(hasSuspenseWithFallback("<Suspense fallback={null}><X/></Suspense>"), false);
  assert.equal(hasSuspenseWithFallback("<Suspense fallback={<Skel />}><X/></Suspense>"), true);
  assert.equal(
    sessionRedirectBeforeSuspense('<Suspense fallback={<S/>}>x</Suspense> redirect("/login")'),
    false,
  );
  assert.equal(sessionRedirectBeforeSuspense('redirect("/login"); <Suspense fallback={<S/>}>'), true);
  assert.equal(sessionRedirectBeforeSuspense("<Suspense fallback={<S/>}>"), false);
  assert.equal(hasHexLiteral('className="bg-[#fff]"'), true);
  assert.equal(hasHexLiteral('className="bg-[var(--tc-canvas)]"'), false);
});
