import test from "node:test";
import assert from "node:assert/strict";

import {
  characterizeProfileCtas,
  resolveProfileCtaPrecedence,
  type ProfileCtaInput,
} from "./profile-cta-precedence";

function shape(
  partial: Partial<ProfileCtaInput> & Pick<ProfileCtaInput, "bookingMode">,
): ProfileCtaInput {
  return {
    hasBookableOffering: false,
    hasOfferingsCta: false,
    legacyEligible: false,
    ...partial,
  };
}

test("characterization: neither → Inquire only", () => {
  const today = characterizeProfileCtas(shape({ bookingMode: "inquire" }));
  assert.deepEqual(today, {
    showSlotPicker: false,
    showLegacyInstantBook: false,
    showInquire: true,
  });
});

test("characterization: legacy-only → Book now + Inquire", () => {
  const today = characterizeProfileCtas(
    shape({ bookingMode: "inquire", legacyEligible: true }),
  );
  assert.deepEqual(today, {
    showSlotPicker: false,
    showLegacyInstantBook: true,
    showInquire: true,
  });
});

test("characterization: offerings-only → SlotPicker, no Inquire, no legacy", () => {
  const today = characterizeProfileCtas(
    shape({
      bookingMode: "request",
      hasBookableOffering: true,
    }),
  );
  assert.deepEqual(today, {
    showSlotPicker: true,
    showLegacyInstantBook: false,
    showInquire: false,
  });
});

test("characterization: both (policy on + legacy) → SlotPicker already hid legacy", () => {
  const today = characterizeProfileCtas(
    shape({
      bookingMode: "request",
      hasBookableOffering: true,
      legacyEligible: true,
    }),
  );
  assert.deepEqual(today, {
    showSlotPicker: true,
    showLegacyInstantBook: false,
    showInquire: false,
  });
});

test("characterization: inquire + legacy + storefront offering CTA stacked three buttons", () => {
  const today = characterizeProfileCtas(
    shape({
      bookingMode: "inquire",
      legacyEligible: true,
      hasOfferingsCta: true,
    }),
  );
  assert.equal(today.showLegacyInstantBook, true);
  assert.equal(today.showInquire, true);
  assert.equal(today.showSlotPicker, false);
});

test("characterization: policy on with no bookable offering hid Inquire and left a hole", () => {
  const today = characterizeProfileCtas(
    shape({ bookingMode: "request", hasBookableOffering: false }),
  );
  assert.deepEqual(today, {
    showSlotPicker: true,
    showLegacyInstantBook: false,
    showInquire: false,
  });
});

test("precedence: neither → Inquire only", () => {
  assert.deepEqual(resolveProfileCtaPrecedence(shape({ bookingMode: "inquire" })), {
    showSlotPicker: false,
    showLegacyInstantBook: false,
    showInquire: true,
  });
});

test("precedence: legacy-only → Book now + Inquire (no offerings CTA)", () => {
  assert.deepEqual(
    resolveProfileCtaPrecedence(shape({ bookingMode: "inquire", legacyEligible: true })),
    {
      showSlotPicker: false,
      showLegacyInstantBook: true,
      showInquire: true,
    },
  );
});

test("precedence: offerings-only → SlotPicker wins", () => {
  assert.deepEqual(
    resolveProfileCtaPrecedence(
      shape({ bookingMode: "request", hasBookableOffering: true }),
    ),
    {
      showSlotPicker: true,
      showLegacyInstantBook: false,
      showInquire: false,
    },
  );
});

test("precedence: both → offerings wins, legacy hidden", () => {
  assert.deepEqual(
    resolveProfileCtaPrecedence(
      shape({
        bookingMode: "request",
        hasBookableOffering: true,
        legacyEligible: true,
      }),
    ),
    {
      showSlotPicker: true,
      showLegacyInstantBook: false,
      showInquire: false,
    },
  );
});

test("precedence: storefront offering CTA hides profile-level legacy Book now", () => {
  const next = resolveProfileCtaPrecedence(
    shape({
      bookingMode: "inquire",
      legacyEligible: true,
      hasOfferingsCta: true,
    }),
  );
  assert.equal(next.showLegacyInstantBook, false);
  assert.equal(next.showInquire, true);
  assert.equal(next.showSlotPicker, false);
});

test("precedence: policy on without a bookable offering keeps Inquire (closes the hole)", () => {
  assert.deepEqual(
    resolveProfileCtaPrecedence(shape({ bookingMode: "request", hasBookableOffering: false })),
    {
      showSlotPicker: false,
      showLegacyInstantBook: false,
      showInquire: true,
    },
  );
});
