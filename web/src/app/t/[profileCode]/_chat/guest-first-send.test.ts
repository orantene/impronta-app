// TUL-401: the guest dock's first message on a fresh talent host, and the guest
// thread cookie that sign-out must clear.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { GUEST_COOKIE_NAME, guestCookieExpiryHeader } from "@/lib/guest-cookie";
import { POST as signOutRoute } from "@/app/auth/sign-out/route";

import { composerKeyAction, firstSendRoute, stageAfterThreadLoad } from "./guest-first-send";

const key = (over: Partial<Parameters<typeof composerKeyAction>[0]>) =>
  composerKeyAction({ key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, isComposing: false, ...over });

describe("composer Enter", () => {
  it("plain Enter sends (old behaviour: only Cmd/Ctrl+Enter did)", () => {
    assert.equal(key({}), "submit");
  });
  it("Cmd/Ctrl+Enter still sends, Shift+Enter is a newline, IME and other keys do nothing", () => {
    assert.equal(key({ metaKey: true }), "submit");
    assert.equal(key({ ctrlKey: true }), "submit");
    assert.equal(key({ shiftKey: true }), "none");
    assert.equal(key({ isComposing: true }), "none");
    assert.equal(key({ key: "a" }), "none");
  });
});

describe("first send on a fresh host", () => {
  const base = { draft: "Hola, quiero una cita", hasContact: false, inquiryId: null, contactPromoted: false, hasInstantAnswer: false };
  it("no thread, no identity: shows the contact gate (never a silent return)", () => {
    assert.equal(firstSendRoute(base), "gate");
  });
  it("no identity but an early inquiry row exists: still the gate", () => {
    assert.equal(firstSendRoute({ ...base, inquiryId: "inq-1" }), "gate");
  });
  it("identity known, no thread: creates the inquiry", () => {
    assert.equal(firstSendRoute({ ...base, hasContact: true }), "start");
  });
  it("identity known with an unpromoted early row: continues that row", () => {
    assert.equal(firstSendRoute({ ...base, hasContact: true, inquiryId: "inq-1" }), "continue");
  });
  it("a price question with no identity is answered instantly; an empty draft is a no-op", () => {
    assert.equal(firstSendRoute({ ...base, hasInstantAnswer: true }), "answer");
    assert.equal(firstSendRoute({ ...base, draft: "   " }), "noop");
  });
});

describe("thread load does not swallow the gate", () => {
  it("keeps an open gate, otherwise moves to the thread", () => {
    assert.equal(stageAfterThreadLoad("gate"), "gate");
    assert.equal(stageAfterThreadLoad("intro"), "thread");
    assert.equal(stageAfterThreadLoad("thread"), "thread");
  });
});

describe("sign-out clears the guest thread cookie", () => {
  it("expiry header targets impronta_guest with host-only attributes", () => {
    const h = guestCookieExpiryHeader();
    assert.ok(h.startsWith(`${GUEST_COOKIE_NAME}=;`));
    assert.match(h, /Max-Age=0/);
    assert.match(h, /Path=\//);
    assert.match(h, /HttpOnly/);
    assert.doesNotMatch(h, /Domain=/i);
  });
  it("POST /auth/sign-out expires it", async () => {
    const res = await signOutRoute(new Request("https://rosa.example.test/auth/sign-out", { method: "POST" }));
    const cookies = res.headers.getSetCookie();
    assert.ok(cookies.some((c) => c.startsWith(`${GUEST_COOKIE_NAME}=;`) && /Max-Age=0/.test(c)));
  });
  it("the sign-out server actions clear it too", () => {
    const root = path.resolve(process.cwd(), "src");
    for (const f of ["app/auth/actions.ts", "lib/client-account/actions.ts"]) {
      assert.match(readFileSync(path.join(root, f), "utf8"), /await clearGuestCookie\(\)/, f);
    }
  });
});
