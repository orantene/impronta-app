import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingPlace } from "./place-kind";

describe("TUL-1072 bookingPlace", () => {
  it("a real address or venue is away and keeps its text", () => {
    assert.deepEqual(bookingPlace({ locationText: "Av. Reforma 10" }), { mode: "away", label: "Av. Reforma 10" });
    assert.deepEqual(bookingPlace({ venueName: "Casa Luz", locationText: "At studio" }), { mode: "away", label: "Casa Luz" });
  });
  it("canned studio labels stay studio, in EN and ES", () => {
    assert.equal(bookingPlace({ locationText: "At studio" }).mode, "studio");
    assert.equal(bookingPlace({ locationText: " En el estudio " }).mode, "studio");
  });
  it("canned client-site labels are client_home, never 'At studio'", () => {
    assert.deepEqual(bookingPlace({ locationText: "A domicilio" }), { mode: "client_home", label: "At client" });
    assert.deepEqual(bookingPlace({ locationText: "At client" }), { mode: "client_home", label: "At client" });
  });
  it("remote and by-agreement labels map to online and away", () => {
    assert.equal(bookingPlace({ locationText: "Remoto" }).mode, "online");
    assert.deepEqual(bookingPlace({ locationText: "A convenir" }), { mode: "away", label: "By agreement" });
  });
  it("no location at all is the studio default", () => {
    assert.deepEqual(bookingPlace({}), { mode: "studio", label: "Booking" });
  });
});
