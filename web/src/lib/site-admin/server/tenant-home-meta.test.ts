import assert from "node:assert/strict";
import { test } from "node:test";

import { INDUSTRY_PRESETS } from "@/lib/words/presets";
import { businessHomeDescriptorKey, businessHomeMeta } from "./tenant-home-meta";

const t = (key: string) =>
  (
    {
      "public.meta.businessHomeMenuReservations": "Menu and reservations",
      "public.meta.businessHomeMenu": "Menu",
      "public.meta.businessHomeReservations": "Reservations",
      "public.meta.businessHomeAppointments": "Book an appointment",
      "public.meta.businessHomeEvents": "Events and tickets",
      "public.meta.homeTitle": "Represented talent",
    } as Record<string, string>
  )[key] ?? key;

const restaurant = INDUSTRY_PRESETS.find((p) => p.id === "restaurant");
const agency = INDUSTRY_PRESETS.find((p) => p.id === "agency");

test("a restaurant's homepage title names menu and reservations, never represented talent", () => {
  assert.ok(restaurant, "restaurant preset missing");
  const meta = businessHomeMeta(restaurant, { public_name: "El Paisa", tagline: null }, t);
  assert.deepEqual(meta, {
    title: "El Paisa · Menu and reservations",
    description: "El Paisa · Menu and reservations",
  });
  assert.doesNotMatch(meta!.title, /talent/i);
});

test("the tenant's own tagline wins the description when present", () => {
  assert.ok(restaurant);
  const meta = businessHomeMeta(
    restaurant,
    { public_name: "El Paisa", tagline: "Parrilla de familia en Glew, desde 2012." },
    t,
  );
  assert.equal(meta?.description, "Parrilla de familia en Glew, desde 2012.");
});

test("a preset that represents people keeps the agency strings (returns null)", () => {
  assert.ok(agency, "agency preset missing");
  assert.equal(businessHomeMeta(agency, { public_name: "Impronta", tagline: null }, t), null);
  assert.equal(businessHomeDescriptorKey(agency), null);
});

test("a business preset that turns nothing on gets the name alone, nothing invented", () => {
  const bare = {
    representsPeople: false,
    features: { menu: false, reservations: false, events: false, appointments: false },
  };
  assert.equal(businessHomeDescriptorKey(bare), null);
  assert.deepEqual(businessHomeMeta(bare, { public_name: "Lavandería Aqua", tagline: null }, t), {
    title: "Lavandería Aqua",
    description: null,
  });
});

test("descriptor precedence: menu+reservations, menu, reservations, appointments, events", () => {
  const f = (o: Partial<Record<"menu" | "reservations" | "events" | "appointments", boolean>>) => ({
    representsPeople: false,
    features: { menu: false, reservations: false, events: false, appointments: false, ...o },
  });
  assert.equal(businessHomeDescriptorKey(f({ menu: true, reservations: true })), "public.meta.businessHomeMenuReservations");
  assert.equal(businessHomeDescriptorKey(f({ menu: true })), "public.meta.businessHomeMenu");
  assert.equal(businessHomeDescriptorKey(f({ reservations: true })), "public.meta.businessHomeReservations");
  assert.equal(businessHomeDescriptorKey(f({ appointments: true })), "public.meta.businessHomeAppointments");
  assert.equal(businessHomeDescriptorKey(f({ events: true })), "public.meta.businessHomeEvents");
});

test("every non-people preset resolves a title with no agency vocabulary", () => {
  for (const preset of INDUSTRY_PRESETS) {
    if (preset.representsPeople) continue;
    const meta = businessHomeMeta(preset, { public_name: "Test Business", tagline: null }, t);
    assert.ok(meta, `${preset.id}: no meta`);
    assert.doesNotMatch(meta.title, /talent|agency|roster|casting/i, `${preset.id}: ${meta.title}`);
  }
});
