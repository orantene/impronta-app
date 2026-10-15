import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// TUL-697: a host where the account surface is off must answer a guest, not a 404.
test("TUL-697: account route answers a flag-off host as signed out (200), never 404", () => {
  const src = read("src/app/api/client/account/route.ts");
  assert.doesNotMatch(src, /not_found/);
  assert.match(src, /accountSurfaceEnabledForRequest\(\)\)\)\s*return reply\(\{ signedIn: false \}\)/);
});

test("TUL-697: every /api/client/account call site treats a non-2xx as a guest", () => {
  const sites = [
    ["src/app/t/[profileCode]/_chat/GuestClientCards.tsx", /r\.ok \? r\.json\(\) : null/, /setClientSignedIn\(false\)/],
    ["src/components/messages-v5/client/ClientThread.tsx", /r\.ok \? r\.json\(\) : null/, /setClientSignedIn\(false\)/],
    ["src/components/client-account/ClientAccountButton.tsx", /if \(!res\.ok\) return;/, /catch/],
  ] as const;
  for (const [file, okGuard, onError] of sites) {
    const src = read(file);
    assert.match(src, okGuard, `${file} must guard on ok`);
    assert.match(src, onError, `${file} must recover from a thrown fetch`);
  }
});
