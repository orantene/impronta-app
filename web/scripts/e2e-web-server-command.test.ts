import assert from "node:assert/strict";
import test from "node:test";

import { CI_DEV_HEAP_MB, e2eWebServerCommand } from "./e2e-web-server-command";

// TUL-1036: `next dev` exits itself (RESTART_EXIT_CODE) once used heap passes
// 80% of the heap limit, and the port refuses connections while it restarts.
// On CI that killed the S1 sign-out spec mid-run (ERR_CONNECTION_REFUSED).

test("local runs keep the plain npm run dev command", () => {
  assert.equal(e2eWebServerCommand({}), "npm run dev");
});

test("CI runs next dev with a larger heap so it never self-restarts mid-suite", () => {
  const cmd = e2eWebServerCommand({ CI: "true" });
  assert.match(cmd, new RegExp(`--max-old-space-size=${CI_DEV_HEAP_MB}\\b`));
  assert.match(cmd, /next dev -p \$\{PORT:-3000\}$/);
  assert.ok(CI_DEV_HEAP_MB > 6144, "CI heap must exceed the npm run dev default (6144)");
});
