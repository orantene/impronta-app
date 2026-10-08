/**
 * #116 / QA F-09: the dock's instant price/duration answer must see ALL of a talent's public
 * services. The mount used to pass only the first 8 (the chip list), so a question about the
 * 9th service or later (jorg-beauty-qa: "Lifting de pestañas" is #16 of 25) found no match and
 * fell through to the Nombre/Apellido/Correo gate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { GuestChatOffering } from "@/lib/inquiry/guest-chat-contract";
import { buildInstantServiceAnswer } from "./guest-instant-answer";

const T: Record<string, string> = {
  "public.guestChat.instantAnsPrice": "{title} cuesta {price}.",
  "public.guestChat.instantAnsDuration": "{title} dura aproximadamente {duration}.",
  "public.guestChat.instantAnsBoth": "{title}: {price}, aproximadamente {duration}.",
  "public.guestChat.instantAnsMore": "MORE",
};
const t = (k: string) => T[k] ?? k;

function off(i: number, title: string): GuestChatOffering {
  return {
    offeringId: `o${i}`,
    talentProfileId: "t1",
    title,
    kind: "service",
    priceType: "fixed",
    amountCents: 40000,
    currency: "MXN",
    durationMinutes: 60,
    allowPayInPerson: true,
    reserveMode: "free",
    depositPct: null,
    imageUrl: null,
  };
}

const TITLES = [
  "Semi-permanent gel", "Soft Gel", "Acrygel", "Rubber Gel", "Gel en pies", "Reposición de una uña",
  "Remoción de semipermanente", "Remoción de acrílico", "Extensiones clásicas", "Efecto rímel",
  "Tecnológicas 2D", "Tecnológicas 3D", "Tecnológicas 4D o 5D", "Volumen americano",
  "Lifting de pestañas", "Henna Brows", "Perfilado de cejas",
];
const ALL = TITLES.map((title, i) => off(i, title));
const QUESTION = "¿Cuánto cuesta y cuánto dura el lifting de pestañas?";

test("a service beyond the first 8 gets no instant answer from the chip list (the bug)", () => {
  assert.equal(buildInstantServiceAnswer({ text: QUESTION, offerings: ALL.slice(0, 8), locale: "es", t }), null);
});

test("the full list answers it with price and duration", () => {
  const ans = buildInstantServiceAnswer({ text: QUESTION, offerings: ALL, locale: "es", t });
  assert.ok(ans && /Lifting de pestañas/.test(ans) && /1 h/.test(ans), String(ans));
});

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("wiring: the mount builds the full list, the launcher forwards it, the panel feeds only the send hook", () => {
  const mount = read("./TalentProfileChatLauncherMount.tsx");
  assert.match(mount, /const answerOfferings: GuestChatOffering\[\] = publicOfferings\.map\(toChatOffering\)/);
  assert.match(mount, /publicOfferings\.slice\(0, 8\)\.map\(toChatOffering\)/, "chips keep the first 8");
  assert.match(mount, /answerOfferings=\{answerOfferings\}/);
  assert.match(read("./TalentProfileChatLauncher.tsx"), /answerOfferings=\{answerOfferings\}/);
  const panel = read("./MiniChatPanel.tsx");
  assert.match(panel, /offerings: answerOfferings \?\? offerings,/);
  assert.match(panel, /offerings: offerings as ChatOffering\[\],/, "the column still gets the chip list");
});
