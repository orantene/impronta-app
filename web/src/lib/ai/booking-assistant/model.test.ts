import { test } from "node:test";
import assert from "node:assert/strict";
import { isKnownRouteModel, providerForModel } from "@/lib/ai/call-routing";
import { BOOKING_ASSISTANT_MODEL } from "./model";

test("BOOKING_ASSISTANT_MODEL is on the AI route allow-list", () => {
  assert.ok(
    isKnownRouteModel(BOOKING_ASSISTANT_MODEL),
    `${BOOKING_ASSISTANT_MODEL} must be listed in AI_ROUTE_MODEL_OPTIONS`,
  );
  assert.equal(providerForModel(BOOKING_ASSISTANT_MODEL), "anthropic");
});
