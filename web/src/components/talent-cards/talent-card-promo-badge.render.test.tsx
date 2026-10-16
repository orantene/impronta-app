/**
 * Directory-card promo badge (TUL-1051 part C): the card draws exactly what the
 * server decided. Whether a surface may show it (hub always, agency on opt-in)
 * and whose promo it is are tested with the loader; here, that the card shows
 * the badge when handed one and is byte-for-byte unchanged without one.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { DirectoryCardData } from "@/lib/site-admin/sections/directory/card-data";

import { TalentCard } from "./TalentCard";
import type { TalentCardStyle } from "./talent-card-shape";

const DATA: DirectoryCardData = {
  id: "t1", name: "Luz", profileCode: "LUZ1", profileHref: "/t/LUZ1", primaryType: "Stylist", location: "Cancun",
  photoUrl: "/luz.jpg", agencyName: null, isExclusive: false, availabilityLabel: "Available", availabilityKnown: true,
  availableDaysInNext30: 5,
};
const show = { showName: true, showTalentType: true, showLocation: true, showAvailability: true, showBadges: true };

function html(data: DirectoryCardData, style: TalentCardStyle): string {
  return renderToStaticMarkup(
    <TalentCard data={data} style={style} show={show} nameFallback="first_name" aspect="4:5" />,
  );
}

for (const style of ["portrait", "editorial", "profile", "showcase"] as const) {
  test(`${style}: shows the badge and its line when the server set one`, () => {
    const out = html({ ...DATA, promoBadge: { label: "-20%", line: "Launch week", promoId: "p1" } }, style);
    assert.match(out, /data-card-promo-badge/);
    assert.match(out, /-20%/);
    assert.match(out, /Launch week/);
  });

  test(`${style}: no badge, no trace in the markup`, () => {
    assert.doesNotMatch(html(DATA, style), /data-card-promo-badge/);
    assert.doesNotMatch(html({ ...DATA, promoBadge: null }, style), /data-card-promo-badge/);
  });
}
