import assert from "node:assert/strict";
import { test } from "node:test";

import { formatClientTime } from "@/lib/messages-v5/client-thread-view";
import { formatTime } from "./thread-stream";

test("TUL-379: thread bubble and card times are 24h in es", () => {
  const tz = process.env.TZ;
  assert.match(formatTime("2026-10-13T21:30:00Z", "es-MX"), /^\d{2}:\d{2}$/);
  assert.match(formatClientTime("2026-10-13T21:30:00Z", "es-MX", "America/Cancun"), /^16:30$/);
  void tz;
});
