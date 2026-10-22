import test from "node:test";
import assert from "node:assert/strict";
import { dropOtherTradeStock, pickStockHero } from "./stock-hero";
import { classifySubject } from "./trade-label";

type Photo = Parameters<typeof pickStockHero>[0][number];
const photo = (id: string, en: string, over: Partial<Photo> = {}): Photo => ({
  id, url: `https://cdn.test/${id}.jpg`, width: 1600, height: 1000, alt: { es: en, en }, role: "hero",
  businessType: null, family: "custom", originTenantId: null, timesPlaced: 0, tags: {}, direction: null, ...over,
});

test("TUL-846: subjects outside the nine trades are named (fire dancer, salon mirrors)", () => {
  assert.equal(classifySubject("A fire dancer at night"), "performance");
  assert.equal(classifySubject("Warm salon mirrors"), "hair");
  assert.equal(classifySubject("A tidy living room"), null);
  assert.equal(classifySubject("house cleaner"), "cleaning");
});

test("TUL-846: a cleaning site never gets a fire dancer or salon mirrors, a neutral room stays", () => {
  const pool = [photo("fire", "A fire dancer"), photo("mirrors", "Salon mirrors"), photo("room", "A bright living room")];
  assert.deepEqual(dropOtherTradeStock(pool, "cleaning", "t1").map((p) => p.id), ["room"]);
  assert.equal(pickStockHero(pool, { businessType: null, family: "custom", trade: "cleaning" })?.stockId, "room");
});

test("TUL-846: a hair site keeps salon photos", () => {
  const pool = [photo("mirrors", "Salon mirrors")];
  assert.equal(dropOtherTradeStock(pool, "hair", "t1").length, 1);
});
