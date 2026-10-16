import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { agendaI18n } from "@/lib/talent-agenda/agenda-i18n";
import { GUEST_CHAT_LAUNCHER_CLEARANCE_CSS, GUEST_CHAT_LAUNCHER_CLEARANCE_PX } from "@/app/t/[profileCode]/_chat/launcher-clearance";
import { weekChipKind } from "./present";

const DIR = join(process.cwd(), "src/components/admin/shell/internal/talent/agenda");
const views = readFileSync(join(DIR, "AgendaCalendarViews.tsx"), "utf8");

const base = {
  kind: "booking" as const,
  booking: "confirmed" as const,
  blocksTime: true,
  allDay: false,
};

describe("AUD-036 all-day items live in their own row", () => {
  it("all-day, deadline and project items classify as allDay", () => {
    assert.equal(weekChipKind({ ...base, allDay: true }), "allDay");
    assert.equal(weekChipKind({ ...base, allDay: true, blocksTime: false }), "allDay");
    assert.equal(weekChipKind({ ...base, kind: "deadline" }), "allDay");
    assert.equal(weekChipKind({ ...base, kind: "project" }), "allDay");
  });

  it("the week grid renders a dedicated all-day row and skips allDay in the timed grid", () => {
    assert.match(views, /data-agenda-allday-row/);
    assert.match(views, /if \(kind === "allDay"\) return null;/);
    // Timed chips can never be positioned above the column (onto the header).
    assert.match(views, /Math\.max\(0, \(minutesOf\(occ\.startsAt\)/);
  });
});

describe("AUD-037 FAB clearance", () => {
  it("week grid reserves the shell FAB width plus a gap on its right edge", () => {
    assert.match(views, /SHELL_FAB_CLEARANCE_PX = SHELL_FAB_RIGHT_PX \+ SHELL_FAB_SIZE_PX \+ SHELL_FAB_GAP_PX/);
    assert.match(views, /pr-\[var\(--agenda-fab-clear\)\]/);
  });

  it("public talent site reserves launcher height + gap at the page bottom on phones", () => {
    assert.ok(GUEST_CHAT_LAUNCHER_CLEARANCE_PX >= 52 + 12);
    assert.match(GUEST_CHAT_LAUNCHER_CLEARANCE_CSS, /max-width: 480px/);
    assert.match(GUEST_CHAT_LAUNCHER_CLEARANCE_CSS, /data-guest-chat-launcher/);
    // TUL-516: sets the clearance variable; body padding max() lives in floating-chrome-stack.
    assert.match(GUEST_CHAT_LAUNCHER_CLEARANCE_CSS, /--floating-launcher-clearance:calc\(/);
    assert.doesNotMatch(GUEST_CHAT_LAUNCHER_CLEARANCE_CSS, /padding-bottom:calc\(/);
    const dock = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/TalentSiteMessagesDock.tsx"), "utf8");
    assert.match(dock, /GUEST_CHAT_LAUNCHER_CLEARANCE_CSS/);
  });
});

describe("AUD-038 done vs request", () => {
  it("completed bookings are done, not requests, even when they do not block time", () => {
    assert.equal(weekChipKind({ ...base, booking: "completed", blocksTime: false }), "done");
    assert.equal(weekChipKind({ ...base, booking: "completed" }), "done");
  });

  it("open requests stay requests; holds and bookings keep their kinds", () => {
    assert.equal(weekChipKind({ ...base, kind: "request", booking: "requested", blocksTime: false }), "request");
    assert.equal(weekChipKind({ ...base, kind: "hold", booking: "hold" }), "hold");
    assert.equal(weekChipKind(base), "booking");
  });

  it("chips are labeled Done / Request · not blocking, done is solid (never hatched)", () => {
    assert.match(views, /copy\.t\("Done"\)/);
    assert.match(views, /copy\.t\("Request · not blocking"\)/);
    assert.match(views, /kind !== "done" &&/);
  });

  it("EN and ES stay in sync (tú register, no em dashes)", () => {
    const es = agendaI18n("es");
    assert.equal(es("Done"), "Hecho");
    assert.equal(es("Request · not blocking"), "Solicitud · no bloquea");
    assert.equal(es("All day"), "Todo el día");
    for (const key of ["Done", "Request · not blocking", "All day"]) {
      assert.equal(agendaI18n("en")(key), key);
      assert.ok(!es(key).includes("—"));
    }
  });
});
