import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hostnameFromHostHeader,
  isLocalViewer,
  normalizeLoopbackAddress,
} from "./view.js";

test("hostnameFromHostHeader keeps IPv6 loopback intact", () => {
  assert.equal(hostnameFromHostHeader("127.0.0.1:8788"), "127.0.0.1");
  assert.equal(hostnameFromHostHeader("localhost:8791"), "localhost");
  assert.equal(hostnameFromHostHeader("[::1]:8788"), "::1");
  assert.equal(hostnameFromHostHeader("[::1]"), "::1");
});

test("normalizeLoopbackAddress unwraps IPv4-mapped IPv6", () => {
  assert.equal(normalizeLoopbackAddress("127.0.0.1"), "127.0.0.1");
  assert.equal(normalizeLoopbackAddress("::1"), "::1");
  assert.equal(normalizeLoopbackAddress("::ffff:127.0.0.1"), "127.0.0.1");
  assert.equal(normalizeLoopbackAddress("::ffff:127.0.0.1%lo0"), "127.0.0.1");
});

test("isLocalViewer allows Chrome on the same Mac (mapped IPv4 localhost)", () => {
  const req = {
    headers: { host: "127.0.0.1:8788" },
    socket: { remoteAddress: "::ffff:127.0.0.1" },
  };
  assert.equal(isLocalViewer(req as never), true);
});

test("isLocalViewer allows IPv6 localhost and rejects a LAN client", () => {
  assert.equal(
    isLocalViewer({
      headers: { host: "[::1]:8788" },
      socket: { remoteAddress: "::1" },
    } as never),
    true,
  );
  assert.equal(
    isLocalViewer({
      headers: { host: "127.0.0.1:8788" },
      socket: { remoteAddress: "192.168.1.20" },
    } as never),
    false,
  );
});
