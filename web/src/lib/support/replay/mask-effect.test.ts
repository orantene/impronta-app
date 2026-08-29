/**
 * Does the mask config actually mask?
 *
 * mask-config.test.ts pins that the settings and the Stripe selector exist.
 * That is not the same as proving a recording contains no secrets. This runs
 * rrweb's real serializer over a DOM holding known secret values and asserts
 * none of them survive into the snapshot.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";
import { snapshot } from "rrweb-snapshot";

import { SUPPORT_REPLAY_MASK } from "./mask-config";

const TYPED_TEXT = "SECRET-TYPED-VALUE-9421";
const TYPED_EMAIL = "leaked.client@example.com";
const TYPED_PASSWORD = "SECRET-PASSWORD-7788";
const STRIPE_INNER = "SECRET-STRIPE-ACCOUNT-5150";
const MASKED_TEXT = "SECRET-MASKED-COPY-3030";
const VISIBLE_TEXT = "Ordinary page heading";

/**
 * rrweb's serializer resolves prototypes off the global scope rather than the
 * jsdom instance, so the fixture window has to BE the global for the duration.
 */
function withDomGlobals<T>(dom: JSDOM, fn: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const w = dom.window as unknown as Record<string, unknown>;
  // Every DOM constructor jsdom exposes (capitalised keys), plus the two
  // lowercase entry points. Enumerating by hand just trades one missing
  // global for the next.
  // getOwnPropertyNames, not Object.keys: jsdom exposes DOM constructors as
  // non-enumerable own properties.
  const keys = [
    "window",
    "document",
    // Constructors only: bare uppercase catches read-only globals like Infinity.
    ...Object.getOwnPropertyNames(w).filter(
      (k) => /^[A-Z]/.test(k) && typeof w[k] === "function",
    ),
  ];
  const saved = new Map<string, unknown>();
  for (const k of keys) {
    saved.set(k, g[k]);
    try {
      if (w[k] !== undefined) g[k] = w[k];
    } catch {
      saved.delete(k); // non-writable global, leave it alone
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of saved) {
      try {
        if (v === undefined) delete g[k];
        else g[k] = v;
      } catch {
        /* non-writable */
      }
    }
  }
}

function serializeFixture(): string {
  const dom = new JSDOM(`<!doctype html><html><body>
    <h1>${VISIBLE_TEXT}</h1>
    <input id="t" type="text" />
    <input id="e" type="email" />
    <input id="p" type="password" />
    <div data-tulala-privacy="block"><span>${STRIPE_INNER}</span></div>
    <p data-tulala-privacy="mask">${MASKED_TEXT}</p>
  </body></html>`);
  const { document } = dom.window;
  // Values are set as properties, the way a real user typing produces them.
  (document.getElementById("t") as HTMLInputElement).value = TYPED_TEXT;
  (document.getElementById("e") as HTMLInputElement).value = TYPED_EMAIL;
  (document.getElementById("p") as HTMLInputElement).value = TYPED_PASSWORD;

  const serialized = withDomGlobals(dom, () =>
    snapshot(document, {
      maskAllInputs: SUPPORT_REPLAY_MASK.maskAllInputs,
      // No maskInputOptions here: it is a record() option, not a snapshot() one.
      // The per-type map only takes effect when maskAllInputs is false, and our
      // config sets it true, so maskAllInputs is the lever that actually decides
      // whether a typed value reaches the serializer. mask-config.test.ts pins
      // the per-type map itself.
      maskTextSelector: SUPPORT_REPLAY_MASK.maskTextSelector,
      blockSelector: SUPPORT_REPLAY_MASK.blockSelector,
      recordCanvas: SUPPORT_REPLAY_MASK.recordCanvas,
      inlineStylesheet: false,
    }),
  );
  return JSON.stringify(serialized);
}

test("typed input values never reach the recording", () => {
  const out = serializeFixture();
  assert.equal(out.includes(TYPED_TEXT), false, "text input value leaked");
  assert.equal(out.includes(TYPED_EMAIL), false, "email input value leaked");
  assert.equal(out.includes(TYPED_PASSWORD), false, "password value leaked");
});

test("a data-tulala-privacy=block subtree (Stripe) is not serialized", () => {
  assert.equal(serializeFixture().includes(STRIPE_INNER), false, "blocked subtree leaked");
});

test("data-tulala-privacy=mask text is masked", () => {
  assert.equal(serializeFixture().includes(MASKED_TEXT), false, "masked text leaked");
});

test("ordinary page content is still captured, so the replay is useful", () => {
  assert.equal(serializeFixture().includes(VISIBLE_TEXT), true, "normal copy was dropped");
});
