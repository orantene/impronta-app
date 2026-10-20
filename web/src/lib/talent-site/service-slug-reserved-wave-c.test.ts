/**
 * TUL-1272 C1 (Wave C brief): the reserved-slug denylist covers the words the brief names and the
 * business service page words added by C5 (`/services/<slug>`, `/servicios/<slug>`).
 */
import { it } from "node:test";
import assert from "node:assert/strict";

import { normalizeStoredServiceSlug } from "./service-content-fields";
import { isReservedServiceSlug } from "./service-slug-reserved";
import { serviceSlugProblem } from "./service-slug-write";

const WORDS = ["book", "directory", "about", "admin", "api", "p", "t", "w", "en", "es", "blog", "services", "servicios"];

it("every brief word is reserved, refused on write and dropped when stored", () => {
  for (const w of WORDS) {
    assert.equal(isReservedServiceSlug(w), true, w);
    assert.equal(serviceSlugProblem(w), "reserved", w);
    assert.equal(normalizeStoredServiceSlug(w), null, w);
  }
});
