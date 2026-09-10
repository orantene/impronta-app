import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enabledPosModesFromSettings,
  modesForPerson,
  parsePosMode,
} from "./modes";

test("parsePosMode rejects junk", () => {
  assert.equal(parsePosMode("counter"), "counter");
  assert.equal(parsePosMode("griddle"), undefined);
  assert.equal(parsePosMode(""), undefined);
  assert.equal(parsePosMode(undefined), undefined);
  assert.equal(parsePosMode(null), undefined);
  assert.equal(parsePosMode(["counter"]), undefined);
  assert.equal(parsePosMode(42), undefined);
});

test("an assistant (viewer rank) gets no modes even with everything enabled", () => {
  const modes = modesForPerson({
    role: "viewer",
    workspaceEnabledModes: ["counter", "floor", "door", "classes", "projects"],
  });
  assert.deepEqual(modes, []);
});

test("an owner on a workspace with only counter enabled gets exactly counter", () => {
  const modes = modesForPerson({
    role: "owner",
    workspaceEnabledModes: ["counter"],
  });
  assert.deepEqual(modes, ["counter"]);
});

test("a host (editor rank, the derived frontline role) gets floor and door when enabled", () => {
  const modes = modesForPerson({
    role: "editor",
    workspaceEnabledModes: ["floor", "door"],
  });
  assert.deepEqual(modes, ["floor", "door"]);
});

test("a manager gets projects but an editor does not, even when both are enabled", () => {
  const managerModes = modesForPerson({
    role: "manager",
    workspaceEnabledModes: ["counter", "projects"],
  });
  assert.deepEqual(managerModes, ["counter", "projects"]);

  const editorModes = modesForPerson({
    role: "editor",
    workspaceEnabledModes: ["counter", "projects"],
  });
  assert.deepEqual(editorModes, ["counter"]);
});

test("enabledPosModesFromSettings defaults to counter when the path is absent or malformed", () => {
  assert.deepEqual(enabledPosModesFromSettings(undefined), ["counter"]);
  assert.deepEqual(enabledPosModesFromSettings({}), ["counter"]);
  assert.deepEqual(enabledPosModesFromSettings({ pos: {} }), ["counter"]);
  // A list with entries in it, none of which parse, is junk somebody else
  // wrote — not a decision. It keeps the default rather than blanking the POS.
  assert.deepEqual(
    enabledPosModesFromSettings({ pos: { locations: { default: { modes: ["nonsense"] } } } }),
    ["counter"],
  );
});

test("a literal empty list is a decision, not an absence, and is kept", () => {
  // THIS ASSERTION USED TO READ ["counter"], AND THAT WAS THE BUG. `counter`
  // is the only built mode, so the only write the settings panel could reach
  // was the empty list; coercing it back to the default meant every reachable
  // persisted state equalled the default and the panel could not save
  // anything, while still reporting "Saved". `pos-bridge.ts` had already
  // documented `[]` as "every mode deliberately off" — this is the reader
  // catching up with the rest of the code, and it is what makes the panel's
  // one switch mean something.
  assert.deepEqual(
    enabledPosModesFromSettings({ pos: { locations: { default: { modes: [] } } } }),
    [],
  );
});

test("enabledPosModesFromSettings reads pos.locations.default.modes and drops unknown entries", () => {
  const modes = enabledPosModesFromSettings({
    pos: { locations: { default: { modes: ["floor", "door", "not-a-mode"] } } },
  });
  assert.deepEqual(modes, ["floor", "door"]);
});

test("a stored `client` or `work` still means the projects mode (D-POS-10), once, and never from a URL", () => {
  // Two design files named this mode `client` and `work` before the id was
  // settled; a settings blob written under either name is a decision about
  // THIS mode, not junk. Both spellings collapse onto one entry.
  assert.deepEqual(
    enabledPosModesFromSettings({ pos: { locations: { default: { modes: ["client", "work", "projects"] } } } }),
    ["projects"],
  );
  // Each alias on its own, so a map that lost ONE of them goes red.
  assert.deepEqual(
    enabledPosModesFromSettings({ pos: { locations: { default: { modes: ["client"] } } } }),
    ["projects"],
  );
  assert.deepEqual(
    enabledPosModesFromSettings({ pos: { locations: { default: { modes: ["counter", "work"] } } } }),
    ["counter", "projects"],
  );
  // The alias is for what was stored. A hand-typed `?mode=client` is not a
  // stored value and is refused, so the id has one spelling in every address.
  assert.equal(parsePosMode("client"), undefined);
  assert.equal(parsePosMode("work"), undefined);
});
