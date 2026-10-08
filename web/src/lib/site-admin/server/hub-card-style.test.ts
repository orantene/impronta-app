import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_CARD_DESIGN,
  projectCardDesign,
  resolveHubCardStyle,
} from "./card-design-shape";

test("hub card style: unset and legacy published styles keep Showcase (Phase 1 default)", () => {
  assert.equal(resolveHubCardStyle(DEFAULT_CARD_DESIGN), "showcase");
  assert.equal(resolveHubCardStyle({ ...DEFAULT_CARD_DESIGN, cardStyle: "portrait" }), "showcase");
  assert.equal(resolveHubCardStyle({ ...DEFAULT_CARD_DESIGN, cardStyle: "editorial" }), "showcase");
});

test("hub card style: explicit Cinematic and Showcase choices are honored", () => {
  assert.equal(resolveHubCardStyle({ ...DEFAULT_CARD_DESIGN, cardStyle: "profile" }), "profile");
  assert.equal(resolveHubCardStyle({ ...DEFAULT_CARD_DESIGN, cardStyle: "showcase" }), "showcase");
});

test("projectCardDesign accepts showcase and still drops unknown styles", () => {
  assert.equal(projectCardDesign({ "directory.card.style": "showcase" }).cardStyle, "showcase");
  assert.equal(projectCardDesign({ "directory.card.style": "bogus" }).cardStyle, undefined);
});
