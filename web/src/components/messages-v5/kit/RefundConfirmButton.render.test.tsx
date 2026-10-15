import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { RefundConfirmButton } from "./RefundConfirmButton";

const labels = { refund: "Refund", confirm: "Confirm refund", cancel: "Cancel" };

test("first step shows only Refund and never the confirm button", () => {
  const html = renderToStaticMarkup(
    <RefundConfirmButton amountLabel="$120.00" labels={labels} onConfirm={() => {}} />,
  );
  assert.match(html, />Refund</);
  assert.ok(!html.includes("Confirm refund"));
  assert.ok(!html.includes("data-refund-armed"));
});
