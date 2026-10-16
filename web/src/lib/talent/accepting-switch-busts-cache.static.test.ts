/**
 * TUL-548 GRK-068: the public offerings cache bakes in the talent's switches (120s TTL, tagged
 * `talent:<id>:site`). Both writers of talent_sites.accepting_bookings must bust it after the
 * write, or "Reservar" stays on the public page after bookings are turned off.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const file of ["src/lib/talent/accepting-bookings.ts", "src/components/talent/website-settings/website-settings-switches-action.ts"]) {
  test(`${file} busts the public site cache after writing the switch`, () => {
    const src = readFileSync(file, "utf8");
    const write = Math.max(src.lastIndexOf('.update('), src.lastIndexOf('.insert('));
    const bust = src.indexOf("bustTalentSiteCache(id, null)");
    assert.ok(bust > write && write > 0, "bust comes after the write");
    assert.match(src, /import \{ bustTalentSiteCache \} from "@\/lib\/talent-site\/cache-tags"/);
  });
}
