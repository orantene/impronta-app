import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CARD_KINDS } from "@/lib/messaging/types";

import { Card, CardLine, CardTotal, cardCategoryForKind, cardCategoryLabel } from "./Card";
import { Btn, Pill } from "./primitives";
import { EN_COPY } from "./test-copy";

test("category grammar: bar class, uppercase category, title, pill right, who, body, footer sentence + one action", () => {
  const html = renderToStaticMarkup(
    <Card category="offer" label="Offer" title="Beach wedding Aug 14" pills={<Pill tone="opp">Sent · v2</Pill>} who="For Valentina Ruiz" mine foot="Valid until Aug 1" actions={<Btn size="sm">Revise</Btn>}>
      <CardLine label="Sofía Herrera · hostess, 2 days" amount="$1,400" />
      <CardTotal label="Total" amount="$3,800" />
    </Card>,
  );
  assert.match(html, /class="card k-offer me" data-card="offer"/);
  assert.match(html, /class="cat">Offer</);
  assert.match(html, /class="ttl">Beach wedding Aug 14</);
  assert.match(html, /pill opp">Sent · v2/);
  assert.match(html, /class="who">For Valentina Ruiz</);
  assert.match(html, /class="li"><span>Sofía Herrera[^<]*<\/span><span>\$1,400<\/span>/);
  assert.match(html, /class="tot"><span>Total<\/span><span>\$3,800<\/span>/);
  assert.match(html, /class="cf"><span class="cf-t">Valid until Aug 1<\/span><button[^>]*>Revise<\/button>/);
  assert.doesNotMatch(html, /style=/);
});

test("busy is aria-busy; mobile uses the dot bar; no footer when nothing to say", () => {
  const busy = renderToStaticMarkup(<Card category="pay" label="Payment" title="Deposit" busy />);
  assert.match(busy, /card k-pay busy" data-card="pay" aria-busy="true"/);
  assert.doesNotMatch(busy, /class="cf"/);
  const mobile = renderToStaticMarkup(<Card category="appt" label="Appointment" title="AP-2041" variant="mobile" />);
  assert.match(mobile, /class="mx-card k-appt"/);
  assert.match(mobile, /class="dot-k"/);
});

test("every engine CardKind maps to a category and a label", () => {
  for (const kind of CARD_KINDS) {
    const cat = cardCategoryForKind(kind);
    assert.ok(["offer", "pay", "order", "appt", "ticket", "table", "change", "id"].includes(cat), `${kind} → ${cat}`);
    const label = cardCategoryLabel(kind, EN_COPY);
    assert.ok(label.length > 0 && !label.startsWith("dashboard."), `${kind} label ${label}`);
  }
  assert.equal(cardCategoryForKind("payment_request"), "pay");
  assert.equal(cardCategoryLabel("basket", EN_COPY), "Shared draft");
});
