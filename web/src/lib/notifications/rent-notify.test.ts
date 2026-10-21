/**
 * TUL-1448: the owner hears (email + bell, ES + EN) when a member declines or ends a station rent plan.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { findCatalogEntries } from "./catalog";
import { getEmailCopy } from "./email-copy";

const recipient = (locale: string) => ({ locale, displayName: "Owen" }) as never;
const event = (type: string) => ({ type, tenantId: "t1", eventId: "e1", payload: { memberName: "Tina" } }) as never;

test("both events have a catalog entry for the workspace owner, email + in_app, ES and EN", () => {
  for (const [type, en, es] of [
    ["rent.plan_declined", "Tina declined the station rent", "Tina rechazó la renta del puesto"],
    ["rent.plan_ended_by_member", "Tina ended their station rent", "Tina terminó su renta del puesto"],
  ] as const) {
    const [entry] = findCatalogEntries(type);
    assert.ok(entry, type);
    assert.deepEqual([...entry!.defaultChannels].sort(), ["email", "in_app"]);
    assert.equal(entry!.in_app!.title(event(type), recipient("en")), en);
    assert.equal(entry!.in_app!.title(event(type), recipient("es")), es);
    assert.equal(entry!.email!.subject(event(type), recipient("es")), es);
  }
});

test("email copy exists in EN and ES with no em dashes", () => {
  for (const locale of ["en", "es"]) {
    const c = getEmailCopy(locale);
    for (const key of ["rent.plan_declined", "rent.plan_ended"] as const) {
      for (const v of Object.values(c[key])) assert.ok(typeof v === "string" && v.length > 0 && !v.includes("—"), `${locale} ${key}`);
    }
  }
});

test("the producer dedupes on plan id + outcome and goes through the dispatcher", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/notifications/producers/rent-notify.ts"), "utf8");
  assert.match(src, /eventId: `rent-plan:\$\{planId\}:\$\{outcome\}`/);
  assert.match(src, /dispatchEventNotifications\(/);
});
