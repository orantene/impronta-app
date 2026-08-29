import { strict as assert } from "node:assert";
import { test } from "node:test";

import { featuredDtoToCanonicalCard } from "./fetch";
import type { FeaturedTalentCardDTO } from "./fetch";
import { AVAILABILITY_UNKNOWN } from "@/lib/site-admin/sections/directory/card-data";

function dto(over: Partial<FeaturedTalentCardDTO> = {}): FeaturedTalentCardDTO {
  return {
    id: "t1",
    profileCode: "TAL-1001",
    slugPart: "ana-ruiz",
    displayName: "Ana Ruiz",
    primaryTalentTypeLabel: "Chef",
    secondaryTalentTypeLabel: "Stylist",
    locationLabel: "Mexico City",
    languages: ["Spanish", "English"],
    availabilityLabel: null,
    parentCategoryLabel: null,
    isFeatured: true,
    thumbnailUrl: "https://img.example/ana.jpg",
    ...over,
  };
}

test("maps the core fields onto the canonical card shape", () => {
  const card = featuredDtoToCanonicalCard(dto());
  assert.equal(card.id, "t1");
  assert.equal(card.name, "Ana Ruiz");
  assert.equal(card.profileCode, "TAL-1001");
  assert.equal(card.primaryType, "Chef");
  assert.equal(card.location, "Mexico City");
  assert.equal(card.photoUrl, "https://img.example/ana.jpg");
});

test("builds profileHref by exact code, never appending the slug suffix", () => {
  const card = featuredDtoToCanonicalCard(dto());
  assert.equal(card.profileHref, "/t/TAL-1001");
});

test("encodes the profile code and applies the optional href prefixer", () => {
  const card = featuredDtoToCanonicalCard(
    dto({ profileCode: "TAL 10/01" }),
    (h) => `/es${h}`,
  );
  assert.equal(card.profileHref, "/es/t/TAL%2010%2F01");
});

test("no profile code → empty href and null code (never a dangling /t/)", () => {
  const card = featuredDtoToCanonicalCard(dto({ profileCode: "  " }));
  assert.equal(card.profileCode, null);
  assert.equal(card.profileHref, "");
});

test("availability degrades to the ratified unknown fallback when unset", () => {
  const card = featuredDtoToCanonicalCard(dto({ availabilityLabel: null }));
  assert.equal(card.availabilityKnown, false);
  assert.equal(card.availabilityLabel, AVAILABILITY_UNKNOWN);
});

test("availability is preserved + marked known when present", () => {
  const card = featuredDtoToCanonicalCard(
    dto({ availabilityLabel: "Available from Jul 3" }),
  );
  assert.equal(card.availabilityKnown, true);
  assert.equal(card.availabilityLabel, "Available from Jul 3");
});

test("bookable copies through so a mixed rail can swap the CTA", () => {
  assert.equal(featuredDtoToCanonicalCard(dto()).bookable, false);
  assert.equal(featuredDtoToCanonicalCard(dto({ bookable: true })).bookable, true);
});

test("featured DTO has no ownership data → independent fallback inputs", () => {
  const card = featuredDtoToCanonicalCard(dto());
  assert.equal(card.agencyName, null);
  assert.equal(card.isExclusive, false);
});

test("missing primary type / location degrade to null, never empty string", () => {
  const card = featuredDtoToCanonicalCard(
    dto({ primaryTalentTypeLabel: "", locationLabel: "" }),
  );
  assert.equal(card.primaryType, null);
  assert.equal(card.location, null);
});
