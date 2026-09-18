import assert from "node:assert/strict";
import { test } from "node:test";
import { TP_CSS } from "./ticket-picker-css";

// A long tier name next to a badge must wrap the badge under the title instead of
// squeezing the title into a column narrower than its longest word (seen live on
// "Entrada después de las 23" + "Desde las 23 h" at 1440).
test("tier card head wraps the badge under a long title", () => {
  const head = TP_CSS.match(/\.tp-card-head\{([^}]*)\}/)?.[1] ?? "";
  assert.match(head, /flex-wrap:wrap/);
  const title = TP_CSS.match(/\.tp-card-title\{([^}]*)\}/)?.[1] ?? "";
  assert.match(title, /flex:1 1 \d+ch/);
});
