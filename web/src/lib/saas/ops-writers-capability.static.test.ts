/**
 * TUL-1708 (operations and settings writers): a `viewer` passed the bare `requireWorkspaceStaffAction()` on these
 * admin server actions, so a read-only staff member could change hours, rooms and booking hours. Every
 * (holds, calendar feed, venue/appointments settings, staff resources and Stripe Connect are covered elsewhere) writer now passes the capability from OPS_WRITER_CAPABILITY
 * (operate_venue, editor+). Reads keep the viewer default. Static wiring plus the
 * role matrix; an export that is neither a listed writer nor a listed read nor a listed client action fails by name.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";
import { OPS_WRITER_CAPABILITY } from "@/lib/saas/ops-writer-capabilities";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

const OPS = "operate_venue";

type Mod = {
  file: string;
  /** writer -> expected capability */
  writers: Record<string, string>;
  /** staff reads: keep the default guard, no capability argument */
  reads: string[];
  /** actions run by the client (not staff): never a staff guard, unchanged */
  clientActions?: string[];
};

const MODS: Mod[] = [
  {
    file: "src/lib/server-actions/spaces-editor.ts",
    writers: { addRoomAction: OPS, addTablesAction: OPS },
    reads: ["loadSpacesSnapshot"],
  },
  {
    file: "src/lib/server-actions/booking-hours.ts",
    writers: { saveBookingHours: OPS, acceptBookingHoursProposal: OPS, setTalentDirectBookingOptIn: OPS },
    reads: ["listBookingHoursTargets", "loadBookingHours"],
  },
];

const fns = (src: string) =>
  [...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => ({ name: m[1]!, at: m.index! }));
const bodyOf = (src: string, name: string) => {
  const ex = fns(src);
  const i = ex.findIndex((e) => e.name === name);
  assert.ok(i >= 0, `${name} not exported`);
  return src.slice(ex[i]!.at, i + 1 < ex.length ? ex[i + 1]!.at : src.length);
};

test("every export is classified, and the map holds exactly the writers", () => {
  const allWriters: string[] = [];
  for (const m of MODS) {
    const src = read(m.file);
    const known = new Set([...Object.keys(m.writers), ...m.reads, ...(m.clientActions ?? [])]);
    const unlisted = fns(src).map((e) => e.name).filter((n) => !known.has(n));
    assert.deepEqual(unlisted, [], `${m.file}: classify these exports (writer with a capability, read, or client action)`);
    allWriters.push(...Object.keys(m.writers));
  }
  assert.deepEqual(Object.keys(OPS_WRITER_CAPABILITY).sort(), allWriters.sort(), "map keys must equal the classified writers");
});

test("every writer takes its capability from the map and the tier is the intended one", () => {
  for (const m of MODS) {
    const src = read(m.file);
    assert.match(src, /from "@\/lib\/saas\/ops-writer-capabilities"/, `${m.file} imports the map`);
    for (const [fn, cap] of Object.entries(m.writers)) {
      assert.equal(OPS_WRITER_CAPABILITY[fn as keyof typeof OPS_WRITER_CAPABILITY], cap, `${fn} tier in the map`);
      const body = bodyOf(src, fn);
      assert.match(body, new RegExp(`OPS_WRITER_CAPABILITY\\.${fn}\\b`), `${m.file} ${fn} must pass its map capability`);
      assert.doesNotMatch(body, /requireWorkspaceStaffAction\(\s*\)/, `${fn} still has a capability-less guard`);
    }
  }
});

test("reads keep the viewer default and never demand a capability; client actions never use the staff guard", () => {
  for (const m of MODS) {
    const src = read(m.file);
    for (const fn of m.reads) {
      assert.doesNotMatch(bodyOf(src, fn), /capability|OPS_WRITER_CAPABILITY/, `${m.file} ${fn} is a read and stays at the default`);
    }
    for (const fn of m.clientActions ?? []) {
      assert.doesNotMatch(bodyOf(src, fn), /requireWorkspaceStaffAction/, `${m.file} ${fn} is a client action`);
    }
  }
});

test("shared helpers forward the capability to the guard", () => {
  const helpers: Array<[string, RegExp]> = [
    ["src/lib/server-actions/spaces-editor.ts", /requireWorkspaceStaffAction\(capability \? \{ capability \} : undefined\)/],
    ["src/lib/server-actions/booking-hours.ts", /requireWorkspaceStaffAction\(staffCapability \? \{ capability: staffCapability \} : undefined\)/],
  ];
  for (const [file, re] of helpers) assert.match(read(file), re, `${file} helper forwards the capability`);
  // A talent owner editing their own hours stays allowed: the owner check short-circuits before staff, and staff must also be on the roster (#4334).
  assert.match(read("src/lib/server-actions/booking-hours.ts"), /if \(!isOwner && !staffOnRoster\) return \{ ok: false, error: "Forbidden\." \}/);
});

test("behaviour on the role matrix", () => {
  assert.equal(roleGrantsCapability("viewer", OPS), false, "viewer must NOT run operations");
  assert.equal(roleGrantsCapability("editor", OPS), true, "editor runs operations");
});
