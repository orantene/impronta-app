import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PaymentLadder, paymentLadderSteps } from "./PaymentLadder";

const L = { requested: "Request sent", opened: "Opened", paid: "Paid", failed: "Failed" };

test("steps bold up to the state, separators between, failed marks the last stop red", () => {
  const html = renderToStaticMarkup(<PaymentLadder steps={paymentLadderSteps("opened", L)} />);
  assert.match(html, /class="ladder" data-ladder/);
  assert.match(html, /<b>Request sent<\/b>.*<i aria-hidden="true"><\/i><b>Opened<\/b>.*<i aria-hidden="true"><\/i><span class="stop">Paid<\/span>/);
  assert.equal(paymentLadderSteps("requested", L).filter((s) => s.done).length, 1);
  assert.equal(paymentLadderSteps("paid", L).filter((s) => s.done).length, 3);
  assert.equal(paymentLadderSteps("none", L).filter((s) => s.done).length, 0);
  const failed = paymentLadderSteps("failed", L);
  assert.equal(failed[2]?.failed, true);
  assert.match(renderToStaticMarkup(<PaymentLadder steps={failed} />), /class="stop fail">Failed/);
});
