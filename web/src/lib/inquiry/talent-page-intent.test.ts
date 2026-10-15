import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InquiryIntent } from "./inquiry-intent";
import { isHubSourcedChannel } from "./owning-party-resolver";
import { normalizeTalentPageIntent } from "./talent-page-intent";

const base = (over: Partial<InquiryIntent>): InquiryIntent =>
  ({
    source: "agency_site",
    requester: { name: "Ana", email: "ana@example.com" },
    brief: { summary: "Boda" },
    ...over,
  }) as InquiryIntent;

describe("TUL-964: a signed-in client's inquiry from a talent page goes to that talent", () => {
  it("signed-in drawer from /t/<code> with that one talent routes like the guest path", () => {
    const out = normalizeTalentPageIntent(
      base({
        talent: { selected_ids: ["tp-1"], selection_mode: "agency_recommends" },
        source_context: { referrer_page: "/t/TAL-93940" },
      }),
    );
    assert.equal(out.source, "public_talent_profile");
    assert.equal(isHubSourcedChannel(out.source), true);
    assert.deepEqual(out.talent?.selected_ids, ["tp-1"]);
    assert.equal(out.talent?.selection_mode, "i_know_who");
    assert.equal((out.source_context as Record<string, unknown>).public_profile_code, "TAL-93940");
  });

  it("guest path intent (already public_talent_profile) is untouched", () => {
    const guest = base({
      source: "public_talent_profile",
      talent: { selected_ids: ["tp-1"], selection_mode: "i_know_who" },
      source_context: { referrer_page: "/t/TAL-93940", public_profile_code: "TAL-93940" },
    });
    assert.deepEqual(normalizeTalentPageIntent(guest), guest);
  });

  it("directory, agency home, or a multi-talent lineup keeps agency routing", () => {
    const dir = base({ talent: { selected_ids: ["tp-1"] }, source_context: { referrer_page: "/directory" } });
    assert.equal(normalizeTalentPageIntent(dir).source, "agency_site");
    const many = base({ talent: { selected_ids: ["tp-1", "tp-2"] }, source_context: { referrer_page: "/t/TAL-1" } });
    assert.equal(normalizeTalentPageIntent(many).source, "agency_site");
    const none = base({ talent: { selected_ids: [], selection_mode: "agency_recommends" }, source_context: { referrer_page: "/t/TAL-1" } });
    assert.equal(normalizeTalentPageIntent(none).source, "agency_site");
  });
});
