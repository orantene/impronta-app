import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  marketingReadStoryNamedLabel,
  marketingShowSlideLabel,
} from "./chrome-aria";

describe("marketing chrome aria (TUL-121 theme13)", () => {
  it("localises hero slide dots", () => {
    assert.equal(marketingShowSlideLabel("es", 3), "Mostrar diapositiva 3");
    assert.equal(marketingShowSlideLabel("en", 3), "Show slide 3");
  });

  it("localises case-study read-story aria with persona", () => {
    assert.equal(
      marketingReadStoryNamedLabel("es", "Daniela Sol"),
      "Lee la historia de Daniela Sol",
    );
    assert.equal(
      marketingReadStoryNamedLabel("en", "Daniela Sol"),
      "Read Daniela Sol's story",
    );
  });
});
