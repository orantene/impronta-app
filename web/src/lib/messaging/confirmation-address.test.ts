/**
 * The confirmation message names the exact address ONLY for "exact after
 * booking", and only for a single-talent appointment. Every other mode, and
 * every miss, leaves the short confirmation.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { appointmentConfirmedBody } from "./appointment-confirmed";
import { addressForConfirmation, loadConfirmationAddress } from "./confirmation-address";
import { ADDRESS_MODES, DEFAULT_LOCATION_SETTINGS, type AddressMode } from "@/lib/talent/location-settings";

const SECRET = "Calle Privada 42, Piso 3";

function fakeAdmin(rows: Record<string, Record<string, unknown>>, calls: string[] = []): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => {
            calls.push(id);
            return { data: rows[id] ?? null, error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const row = (mode: AddressMode) => ({ address_mode: mode, studio_kind: "studio", exact_address: SECRET });

test("only exact-after-booking releases the address; the other modes never do", () => {
  for (const mode of ADDRESS_MODES) {
    const out = addressForConfirmation({ ...DEFAULT_LOCATION_SETTINGS, addressMode: mode, exactAddress: SECRET });
    if (mode === "after_booking") assert.equal(out, SECRET);
    else assert.equal(out, null, mode);
  }
  assert.equal(addressForConfirmation(null), null);
  assert.equal(addressForConfirmation({ ...DEFAULT_LOCATION_SETTINGS, addressMode: "after_booking" }), null, "no address typed");
});

test("NO LEAK: the confirmation body carries the address only in after_booking mode", async () => {
  for (const mode of ADDRESS_MODES) {
    const address = await loadConfirmationAddress(fakeAdmin({ t1: row(mode) }), ["t1"]);
    const body = appointmentConfirmedBody(address);
    if (mode === "after_booking") assert.equal(body, `Appointment confirmed. Exact address: ${SECRET}`);
    else {
      assert.equal(body, "Appointment confirmed", mode);
      assert.ok(!body.includes("Privada"));
    }
  }
});

test("no row yet: the short confirmation", async () => {
  assert.equal(await loadConfirmationAddress(fakeAdmin({}), ["t1"]), null);
});

test("two talents (or none): there is no single place to name, and no query is made", async () => {
  const calls: string[] = [];
  const admin = fakeAdmin({ t1: row("after_booking"), t2: row("after_booking") }, calls);
  assert.equal(await loadConfirmationAddress(admin, ["t1", "t2"]), null);
  assert.equal(await loadConfirmationAddress(admin, [null, undefined]), null);
  assert.equal(calls.length, 0);
  // The same talent on several lines is still one place.
  assert.equal(await loadConfirmationAddress(admin, ["t1", "t1", null]), SECRET);
});

test("a failing read fails closed", async () => {
  const boom = { from: () => { throw new Error("db down"); } } as unknown as SupabaseClient;
  assert.equal(await loadConfirmationAddress(boom, ["t1"]), null);
});
