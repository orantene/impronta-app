import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isMaisonDesignRevisionSnapshot,
  MAISON_DESIGN_REVISION_SURFACE,
} from "./maison-design-revision";

describe("maison design revision snapshot", () => {
  test("recognises W41 surface marker", () => {
    assert.equal(
      isMaisonDesignRevisionSnapshot({
        surface: MAISON_DESIGN_REVISION_SURFACE,
        published_at: "2026-09-26T00:00:00Z",
        design_slug: "maison",
        look_slug: "maison-lilac",
        demo_slug: "maison-nails",
        menu_style: "tabs",
        custom_palette: null,
        design_tokens: {},
        shell_published: [],
        home_blocks: [],
      }),
      true,
    );
    assert.equal(isMaisonDesignRevisionSnapshot({ surface: "talent_site_shell" }), false);
  });
});
