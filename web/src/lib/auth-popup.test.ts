import test from "node:test";
import assert from "node:assert/strict";
import { navigateToAuthPopupDestination } from "@/lib/auth-popup";

/**
 * The Google popup hands a destination back to the opener. Since the callback
 * now returns an app-host URL whenever the current surface would 404 the
 * path, the opener has to handle an absolute URL: router.push only moves
 * within the app.
 */
function withStubbedWindow<T>(run: (assigned: string[]) => T): T {
  const assigned: string[] = [];
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    location: { assign: (href: string) => assigned.push(href) },
  };
  try {
    return run(assigned);
  } finally {
    if (previous === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previous;
    }
  }
}

test("an absolute destination leaves the current origin", () => {
  withStubbedWindow((assigned) => {
    const pushed: string[] = [];
    navigateToAuthPopupDestination("https://app.tulala.digital/client", {
      push: (href) => pushed.push(href),
    });
    assert.deepEqual(assigned, ["https://app.tulala.digital/client"]);
    assert.deepEqual(pushed, [], "router.push cannot reach another host");
  });
});

test("a same-surface destination still routes in-app", () => {
  withStubbedWindow((assigned) => {
    const pushed: string[] = [];
    navigateToAuthPopupDestination("/client", { push: (href) => pushed.push(href) });
    assert.deepEqual(pushed, ["/client"]);
    assert.deepEqual(assigned, []);
  });
});

test("protocol matching is case-insensitive and anchored", () => {
  withStubbedWindow((assigned) => {
    const pushed: string[] = [];
    navigateToAuthPopupDestination("HTTPS://app.tulala.digital/admin", {
      push: (href) => pushed.push(href),
    });
    // A path that merely contains "http" is not absolute.
    navigateToAuthPopupDestination("/client/inquiries?ref=http", {
      push: (href) => pushed.push(href),
    });
    assert.deepEqual(assigned, ["HTTPS://app.tulala.digital/admin"]);
    assert.deepEqual(pushed, ["/client/inquiries?ref=http"]);
  });
});
