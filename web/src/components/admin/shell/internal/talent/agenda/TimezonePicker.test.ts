import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ianaTimeZoneLabel } from "./TimezonePicker";

describe("TUL-358 follow-up: timezone picker labels follow UI locale", () => {
  it("Spanish labels use localized region + city, not English IANA path", () => {
    const mx = ianaTimeZoneLabel("America/Mexico_City", "es");
    assert.match(mx, /^América\/Ciudad de México/);
    assert.doesNotMatch(mx, /Mexico City/i);
    assert.doesNotMatch(mx, /America\//);

    const cancun = ianaTimeZoneLabel("America/Cancun", "es");
    assert.match(cancun, /^América\/Cancún/);
    assert.doesNotMatch(cancun, /America\//);

    const madrid = ianaTimeZoneLabel("Europe/Madrid", "es");
    assert.match(madrid, /^Europa\/Madrid/);
  });

  it("English labels keep readable IANA city names", () => {
    assert.match(ianaTimeZoneLabel("America/Mexico_City", "en"), /^America\/Mexico City/);
    assert.match(ianaTimeZoneLabel("America/Cancun", "en"), /^America\/Cancún/);
    assert.match(ianaTimeZoneLabel("UTC", "en"), /^UTC/);
  });
});
