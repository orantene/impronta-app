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

test("enabledPosModesFromSettings defaults to counter only when the path is absent", () => {
  assert.deepEqual(enabledPosModesFromSettings(undefined), ["counter"]);
  assert.deepEqual(enabledPosModesFromSettings({}), ["counter"]);
  assert.deepEqual(enabledPosModesFromSettings({ pos: {} }), ["counter"]);
  assert.deepEqual(
    enabledPosModesFromSettings({ pos: { locations: { default: { modes: [] } } } }),
    ["counter"],
  );
  assert.deepEqual(
    enabledPosModesFromSettings({ pos: { locations: { default: { modes: ["nonsense"] } } } }),
    ["counter"],
  );
});

test("enabledPosModesFromSettings reads pos.locations.default.modes and drops unknown entries", () => {
  const modes = enabledPosModesFromSettings({
    pos: { locations: { default: { modes: ["floor", "door", "not-a-mode"] } } },
  });
  assert.deepEqual(modes, ["floor", "door"]);
});
