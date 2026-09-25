import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isAgendaV2,
  readAgendaV2Mode,
  readAgendaV2TalentAllowlist,
} from "./flag";

describe("readAgendaV2Mode", () => {
  it("defaults to off", () => {
    assert.equal(readAgendaV2Mode(undefined), "off");
    assert.equal(readAgendaV2Mode(""), "off");
    assert.equal(readAgendaV2Mode("false"), "off");
    assert.equal(readAgendaV2Mode("0"), "off");
  });

  it("reads all / true / 1", () => {
    assert.equal(readAgendaV2Mode("all"), "all");
    assert.equal(readAgendaV2Mode("true"), "all");
    assert.equal(readAgendaV2Mode("1"), "all");
  });

  it("reads talents", () => {
    assert.equal(readAgendaV2Mode("talents"), "talents");
  });
});

describe("isAgendaV2", () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("flag off returns false even when id is allow-listed", () => {
    assert.equal(
      isAgendaV2(id, { mode: "off", allowlist: new Set([id]) }),
      false,
    );
  });

  it("mode all returns true for any id", () => {
    assert.equal(isAgendaV2(id, { mode: "all" }), true);
    assert.equal(isAgendaV2(null, { mode: "all" }), true);
  });

  it("mode talents requires allow-list membership", () => {
    assert.equal(isAgendaV2(id, { mode: "talents", allowlist: new Set() }), false);
    assert.equal(
      isAgendaV2(id, { mode: "talents", allowlist: new Set([id]) }),
      true,
    );
    assert.equal(
      isAgendaV2(null, { mode: "talents", allowlist: new Set([id]) }),
      false,
    );
  });

  it("parses allow-list from CSV", () => {
    const set = readAgendaV2TalentAllowlist(` ${id}, other-id `);
    assert.equal(set.has(id), true);
    assert.equal(set.has("other-id"), true);
    assert.equal(set.size, 2);
  });
});
