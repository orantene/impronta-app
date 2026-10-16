import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { TALENT_HELP } from "@/components/admin/shell/internal/help-registry-talent";
import {
  flattenHelpCorpus,
  insightRowsToCorpus,
  retrieveHelpEntries,
  SUPPORT_CATEGORIES,
  tokenize,
} from "./help-corpus";

describe("help-corpus", () => {
  test("SUPPORT_CATEGORIES includes ticket categories from the registry", () => {
    assert.ok(SUPPORT_CATEGORIES.includes("Billing"));
    assert.ok(SUPPORT_CATEGORIES.includes("General"));
    assert.ok(SUPPORT_CATEGORIES.includes("Bookings & inquiries"));
  });

  test("flattenHelpCorpus keeps slug, purpose, and ticketCategory", () => {
    const rows = flattenHelpCorpus();
    const domain = rows.find((r) => r.slug === "domain");
    assert.ok(domain);
    assert.ok(domain.purpose.length > 10);
    assert.equal(typeof domain.ticketCategory, "string");
  });

  test("tokenize drops stopwords and short tokens", () => {
    assert.deepEqual(tokenize("How do I change my domain"), ["change", "domain"]);
  });

  test("origin slug and category get a hard boost", () => {
    const mini = flattenHelpCorpus().filter((e) =>
      ["domain", "branding", "plan-billing"].includes(e.slug),
    );
    const hits = retrieveHelpEntries("something unrelated", {
      originSlug: "domain",
      category: "Public site & domains",
      corpus: mini,
    });
    assert.equal(hits[0]?.slug, "domain");
  });

  test("lexical overlap ranks a domain question onto the domain entry", () => {
    const hits = retrieveHelpEntries("how do I connect a custom domain", {
      extraTexts: ["the public site is not resolving"],
    });
    assert.ok(hits.length <= 4);
    assert.ok(
      hits.some((h) => h.slug === "domain" || /domain/i.test(h.purpose)),
      "expected a domain-related grounding entry",
    );
  });

  test("confirmed insights join the corpus as past confirmed resolution", () => {
    const extra = insightRowsToCorpus([
      {
        id: "11111111-1111-1111-1111-111111111111",
        summary: "Custom domain DNS check stalled after switching the primary host",
        root_cause: "The DNS probe ran before nameservers propagated",
        product_area: "Public site & domains",
      },
    ]);
    assert.equal(extra[0]?.category, "past confirmed resolution");
    const hits = retrieveHelpEntries("dns check after changing the primary domain", {
      extraCorpus: extra,
      corpus: [],
    });
    assert.equal(hits[0]?.slug.startsWith("insight:"), true);
  });

  test("Spanish words keep their accents' letters and also search the English word", () => {
    const toks = tokenize("¿Cómo cambio el precio de uno de mis servicios?");
    for (const t of ["cambio", "change", "precio", "price", "servicios", "service"]) {
      assert.ok(toks.includes(t), t);
    }
    for (const t of ["c", "mo", "como", "de", "uno", "mis", "el"]) {
      assert.ok(!toks.includes(t), t);
    }
  });

  test("a talent asking how to change a service price is grounded on the services entry, in ES and EN", () => {
    for (const q of [
      "Hola, soy QA Grok. ¿Cómo cambio el precio de uno de mis servicios? Gracias.",
      "How do I change the price of a service?",
    ]) {
      assert.equal(retrieveHelpEntries(q, { extraTexts: [q] })[0]?.slug, "talent-services", q);
    }
  });

  test("a talent asking how to add a photo to a service is grounded on the services entry", () => {
    for (const q of ["¿Cómo agrego una foto a un servicio?", "How do I add a photo to a service?"]) {
      assert.equal(retrieveHelpEntries(q)[0]?.slug, "talent-services", q);
    }
  });
});

describe("help-corpus talent dashboard coverage (TUL-575)", () => {
  // Real questions from the QA tickets (#35 to #42) plus the common ones the
  // card asks for. Each pair must land on the entry that answers it, in both
  // languages, so the assistant has grounding instead of handing off.
  const CASES: Array<[slug: string, es: string, en: string]> = [
    ["talent-hours", "¿Cómo cambio mi horario?", "How do I change my hours?"],
    ["talent-days-off", "¿Cómo bloqueo un día libre por vacaciones?", "How do I block a day off for a holiday?"],
    ["talent-booking-changes", "¿Cómo cancelo una reserva?", "How do I cancel a booking?"],
    ["talent-booking-changes", "¿Cómo reprogramo una cita?", "How do I reschedule a booking?"],
    ["talent-hours", "¿Cómo dejo un margen entre citas?", "How do I leave a gap between bookings?"],
    ["talent-services", "¿Cómo agrego un servicio?", "How do I add a service?"],
    ["talent-services", "¿Cómo cambio el precio de un servicio?", "How do I change the price of a service?"],
    ["talent-services", "¿Cómo agrego una foto a un servicio?", "How do I add a photo to a service?"],
    ["talent-deposits", "¿Cómo cobro un anticipo?", "How do I charge a deposit?"],
    ["talent-deposits", "¿Qué pasa con el anticipo si el cliente cancela?", "What happens to the deposit if the client cancels?"],
    ["talent-payouts", "¿Cómo configuro mis pagos para recibir dinero en mi banco?", "How do I set up payouts to my bank?"],
    ["talent-payouts", "¿Por qué mi pago está retenido?", "Why is my payout held?"],
    ["talent-design", "¿Cómo cambio el diseño de mi página?", "How do I change my theme?"],
    ["talent-design", "Quiero cambiar el tema de mi sitio web", "How do I change the design of my website?"],
    ["talent-presence", "¿Cómo publico mi sitio?", "How do I publish my site?"],
    ["talent-reviews", "¿Cómo muestro una reseña en mi perfil?", "How do I show a review on my profile?"],
    ["talent-messages", "¿Por qué no tengo mensajes?", "Why do I have no messages?"],
  ];

  for (const [slug, es, en] of CASES) {
    test(`${slug}: grounded for "${en}" in EN and ES`, () => {
      assert.equal(retrieveHelpEntries(en)[0]?.slug, slug, en);
      assert.equal(retrieveHelpEntries(es)[0]?.slug, slug, es);
    });
  }

  test("accents in a corpus label do not stop an accent-free question matching", () => {
    assert.equal(retrieveHelpEntries("reseñas")[0]?.slug, "talent-reviews");
    assert.equal(retrieveHelpEntries("resenas")[0]?.slug, "talent-reviews");
  });

  test("every talent entry names its sidebar label in Spanish so the answer can say where to click", () => {
    const talent = flattenHelpCorpus().filter((e) => e.slug in TALENT_HELP);
    assert.ok(talent.length >= 8);
    for (const e of talent) {
      const text = [e.purpose, ...e.youCanHere, ...e.faqs.map((f) => f.a)].join(" ");
      assert.match(text, /\(([A-Z][a-z]+( [a-z]+)*)\)/, e.slug);
    }
  });

  test("talent entries make no claims the dashboard cannot back (no em dashes)", () => {
    for (const e of flattenHelpCorpus().filter((x) => x.slug in TALENT_HELP)) {
      const text = [e.purpose, ...e.youCanHere, ...e.faqs.flatMap((f) => [f.q, f.a])].join(" ");
      assert.ok(!text.includes("—"), e.slug);
    }
  });
});

describe("hours answer points to the real place (TUL-111)", () => {
  test("hours question grounds on an entry naming Ajustes and Horario y días libres, in ES and EN", () => {
    for (const q of ["¿Cómo cambio mi horario?", "how do I change my hours"]) {
      const top = retrieveHelpEntries(q)[0];
      assert.equal(top?.slug, "talent-hours", q);
      const text = JSON.stringify(top);
      assert.match(text, /Ajustes/);
      assert.match(text, /Horario y días libres/);
    }
  });
});
