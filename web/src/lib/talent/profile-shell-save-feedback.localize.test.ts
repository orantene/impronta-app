import assert from "node:assert/strict";
import { test } from "node:test";
import { localizeProfileShellSaveError } from "./profile-shell-save-feedback";

const dict: Record<string, string> = {
  Services: "Servicios",
  "Talent is not on any active roster.": "Este talento no está en ninguna lista activa.",
};
const t = (v: string) => dict[v] ?? v;

test("translates section and error, and shows a repeated failure once", () => {
  const raw = "Services: Talent is not on any active roster. · Services: Talent is not on any active roster.";
  assert.equal(
    localizeProfileShellSaveError(raw, t),
    "Servicios: Este talento no está en ninguna lista activa.",
  );
});
test("unknown parts pass through unchanged", () => {
  assert.equal(localizeProfileShellSaveError("Boom", t), "Boom");
});
