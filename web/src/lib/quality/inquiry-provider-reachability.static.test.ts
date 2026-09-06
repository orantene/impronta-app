import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * A component imported across a ROUTE-GROUP boundary inherits nothing.
 *
 * Production, 2026-09-03 to 2026-09-05: 61 occurrences of
 * "useDirectoryInquiryModal must be used within DirectoryInquiryModalProvider",
 * thrown during SERVER RENDER on `/`, `/global-directory` and `/_not-found`.
 *
 * `DirectoryInquiryModalProvider` is mounted by `(marketing)/layout.tsx` and
 * `(public)/layout.tsx`. Anything rendering under the ROOT layout has neither.
 * `app/not-found.tsx` is at the root and imports `CmsPublicPage` — a `(public)`
 * PAGE — which pulls the component but NOT the layout chain that wraps it. So
 * the CMS tree rendered there reached the throwing hook with no provider above
 * it, and there is no route group to move a root not-found into.
 *
 * Two independent defences, both asserted here, because either alone leaves the
 * class open:
 *
 *   1. THE RIDE-ALONG CONSUMERS DEGRADE. Components that get mounted on
 *      arbitrary pages read the context optionally and no-op without it. This
 *      is what makes a future root-level render safe, including one nobody has
 *      written yet.
 *   2. THE KNOWN CROSS-GROUP RENDER PROVIDES. `not-found.tsx` mounts the
 *      provider so the inquiry modal actually WORKS on a tenant's custom 404,
 *      rather than merely not crashing.
 *
 * These are source-text assertions because the failure is a render-time throw
 * in a server component tree, which no type can see and which every server-side
 * check passed: the recorded hydration incident had HTTP 200 and correct HTML
 * while the page was dead.
 */

const web = process.cwd();
const read = (p: string) => readFileSync(join(web, p), "utf8");

const RIDE_ALONG_CONSUMERS = [
  "src/components/directory/directory-inquiry-url-sync.tsx",
  "src/components/directory/directory-inquiry-sheet.tsx",
];

for (const file of RIDE_ALONG_CONSUMERS) {
  test(`${file} reads the inquiry context OPTIONALLY`, () => {
    const src = read(file);
    assert.match(
      src,
      /useOptionalDirectoryInquiryModal/,
      "this component is mounted on pages whose layout may provide nothing",
    );
    assert.doesNotMatch(
      src,
      /\buseDirectoryInquiryModal\s*\(/,
      "the throwing hook here takes down any page rendered outside a providing " +
        "route group — that is the 61-occurrence production cluster",
    );
  });
}

test("the root not-found mounts the provider around the (public) page it imports", () => {
  const src = read("src/app/not-found.tsx");
  if (!/CmsPublicPage/.test(src)) return; // no cross-group render, nothing to guard

  assert.match(
    src,
    /DirectoryInquiryModalProvider/,
    "not-found.tsx renders a (public) page from the ROOT, so it inherits none " +
      "of that group's providers and must mount them itself",
  );
  // Order matters: the provider must WRAP the page, not sit beside it. This is
  // the same defect as the launcher that sat four lines below the provider's
  // closing tag and killed every tenant storefront (#1606).
  const provider = src.indexOf("<DirectoryInquiryModalProvider>");
  const page = src.indexOf("<CmsPublicPage");
  const close = src.indexOf("</DirectoryInquiryModalProvider>");
  assert.ok(provider >= 0 && page > provider && close > page,
    "CmsPublicPage must be INSIDE the provider's subtree, not merely near it");
});

test("the provider is still mounted by both route-group layouts", () => {
  // Guards the other direction: removing one of these silently blanks a whole
  // group's inquiry flow, which is how /global-directory died on 2026-09-03.
  for (const layout of ["src/app/(marketing)/layout.tsx", "src/app/(public)/layout.tsx"]) {
    assert.match(read(layout), /DirectoryInquiryModalProvider/, `${layout} must mount the provider`);
  }
});
