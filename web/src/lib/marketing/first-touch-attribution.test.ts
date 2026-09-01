import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

/**
 * Attribution decides which channels look like they work, so the rules that
 * govern it are worth pinning: first touch wins, our own domain is not a
 * referrer, and storage failures never throw into a page taking a signup.
 */

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  clear() { this.m.clear(); }
}

function setupDom(url: string, referrer: string, storage: unknown = new MemoryStorage()) {
  const u = new URL(url);
  (globalThis as Record<string, unknown>).window = {
    location: { search: u.search, pathname: u.pathname, hostname: u.hostname },
  };
  (globalThis as Record<string, unknown>).document = { referrer };
  (globalThis as Record<string, unknown>).sessionStorage = storage;
}

async function fresh() {
  // Re-import so the module has no state carried between cases.
  const mod = await import(`./first-touch-attribution?${Math.random()}`);
  return mod as typeof import("./first-touch-attribution");
}

describe("first-touch attribution", () => {
  beforeEach(() => {
    for (const k of ["window", "document", "sessionStorage"]) {
      delete (globalThis as Record<string, unknown>)[k];
    }
  });

  test("captures utm params and the landing path", async () => {
    setupDom("https://tulala.digital/?utm_source=google&utm_campaign=barbers", "");
    const { captureFirstTouch, getAttribution } = await fresh();
    captureFirstTouch();
    const a = getAttribution();
    assert.equal(a.utm_source, "google");
    assert.equal(a.utm_campaign, "barbers");
    assert.equal(a.landing_path, "/");
  });

  test("FIRST touch wins: a later page never overwrites the campaign", async () => {
    const storage = new MemoryStorage();
    setupDom("https://tulala.digital/?utm_source=google", "", storage);
    const { captureFirstTouch, getAttribution } = await fresh();
    captureFirstTouch();

    // Same visit, deeper page, different campaign tag on the url.
    setupDom("https://tulala.digital/pricing?utm_source=facebook", "", storage);
    captureFirstTouch();

    assert.equal(
      getAttribution().utm_source,
      "google",
      "The campaign that earned the visit must survive later navigation.",
    );
  });

  test("our own domain is not recorded as a referrer", async () => {
    setupDom("https://tulala.digital/pricing", "https://tulala.digital/");
    const { captureFirstTouch, getAttribution } = await fresh();
    captureFirstTouch();
    assert.equal(
      getAttribution().referrer,
      undefined,
      "An internal referrer would overwrite the real source with ourselves.",
    );
  });

  test("an external referrer is recorded as a hostname", async () => {
    setupDom("https://tulala.digital/", "https://www.google.com/search?q=x");
    const { captureFirstTouch, getAttribution } = await fresh();
    captureFirstTouch();
    assert.equal(getAttribution().referrer, "www.google.com");
  });

  test("the url beats first touch when a campaign links straight to the form", async () => {
    const storage = new MemoryStorage();
    setupDom("https://tulala.digital/?utm_source=google", "", storage);
    const { captureFirstTouch, resolveSignupAttribution } = await fresh();
    captureFirstTouch();

    // A campaign pointing directly at the form is the more specific signal.
    setupDom("https://tulala.digital/get-started?utm_source=newsletter", "", storage);
    const a = resolveSignupAttribution("?utm_source=newsletter", "https://tulala.digital/");
    assert.equal(a.utm_source, "newsletter");
  });

  test("a signup after browsing still records the original campaign", async () => {
    const storage = new MemoryStorage();
    setupDom("https://tulala.digital/?utm_source=google&utm_campaign=barbers", "", storage);
    const { captureFirstTouch, resolveSignupAttribution } = await fresh();
    captureFirstTouch();

    // The journey this whole change exists for: campaign link to the homepage,
    // a look around, then the form with a bare url.
    setupDom("https://tulala.digital/get-started", "https://tulala.digital/pricing", storage);
    const a = resolveSignupAttribution("", "https://tulala.digital/pricing");
    assert.equal(a.utm_source, "google", "This visit used to record no source at all.");
    assert.equal(a.utm_campaign, "barbers");
    assert.equal(a.referrer, undefined, "Our own pricing page is not the referrer.");
  });

  test("blocked storage never throws into the page", async () => {
    const hostile = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    };
    setupDom("https://tulala.digital/?utm_source=google", "", hostile);
    const { captureFirstTouch, getAttribution } = await fresh();
    assert.doesNotThrow(() => captureFirstTouch());
    assert.deepEqual(getAttribution(), {}, "Unknown is a real answer; a guess would pollute every report.");
  });
});
