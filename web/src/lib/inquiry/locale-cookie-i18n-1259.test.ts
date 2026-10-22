import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { localizeSystemNote, localizeShortDate } from "./system-note-i18n";
import { threadSenderLabel } from "./thread-sender-label";
import { hubDisplayName, hubDisplayTagline } from "@/components/home/hub-landing-copy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-1888: stored English system notes render in Spanish with locale-aware dates", () => {
  assert.equal(localizeSystemNote("Lineup · 1 talent", "es"), "Selección · 1 talento");
  assert.equal(localizeSystemNote("Lineup · 3 talent", "es"), "Selección · 3 talentos");
  assert.equal(localizeSystemNote("Added: Oct 24", "es"), "Agregado: 24 oct");
  assert.equal(localizeSystemNote("Event date set to Oct 24.", "es"), "Fecha del evento: 24 oct.");
  assert.equal(localizeSystemNote("Contact details updated", "es"), "Datos de contacto actualizados.");
  assert.equal(localizeSystemNote("Let the agency recommend", "es"), "Que la agencia recomiende");
  assert.equal(localizeSystemNote("Lineup · 1 talent", "en"), "Lineup · 1 talent");
  assert.equal(localizeShortDate("Dec 5, 2026", "es"), "5 dic 2026");
  assert.equal(localizeShortDate("sometime soon", "es"), "sometime soon");
});

test("TUL-1888: every thread surface runs platform notes through the localizer", () => {
  assert.match(read("src/components/chat-cards/ChatCard.tsx"), /localizeSystemNote\(props\.text, locale\)/);
  assert.match(read("src/components/messages-v5/screens/Thread.tsx"), /localizeSystemNote\(localiseEngineLine/);
  assert.match(read("src/components/talent/talent-thread-stream.tsx"), /senderRole === "system" \? localizeSystemNote/);
  assert.match(read("src/app/t/[profileCode]/_chat/SystemNoteCluster.tsx"), /localizeSystemNote\(localizeLineupNoteBody/);
});

test("TUL-1884: seeded hub placeholders never reach the page", () => {
  assert.equal(hubDisplayName("Impronta Hub", "Tulala"), "Tulala");
  assert.equal(hubDisplayName("Mi Hub", "Tulala"), "Mi Hub");
  assert.equal(hubDisplayName(null, "Tulala"), "Tulala");
  assert.equal(hubDisplayTagline("The global talent directory.", "Cada agencia"), "Cada agencia");
  assert.equal(hubDisplayTagline("Our words", "x"), "Our words");
});

test("TUL-1887: a talent reply carries the talent's name, not a platform label", () => {
  assert.equal(threadSenderLabel({ accountName: "Tulala Hub", talentDisplayName: "Ana Ruiz", fallback: "x" }), "Ana Ruiz");
  assert.equal(threadSenderLabel({ accountName: "Sam Coordinator", talentDisplayName: "Ana Ruiz", fallback: "x" }), "Sam Coordinator");
  assert.equal(threadSenderLabel({ accountName: "", talentDisplayName: null, fallback: "System" }), "System");
});

test("TUL-1238: one Agregar per row and one shared count", () => {
  assert.match(read("src/app/t/[profileCode]/_chat/GuestDockCatalog.tsx"), /!\(row\.offeringId && \(row\.category === "service" \|\| row\.category === "class"\)\)/);
  assert.match(read("src/app/t/[profileCode]/_chat/GuestDockLineupView.tsx"), /const inquiryCount = useInquiryTrayCount\(\)/);
});

test("TUL-1886: the onboarding footer is localized", () => {
  const layout = read("src/app/onboarding/layout.tsx");
  assert.match(layout, /public\.onboardingShell\.terms/);
  const es = JSON.parse(read("messages/es.json")).public.onboardingShell;
  assert.equal(es.terms, "Términos");
});
