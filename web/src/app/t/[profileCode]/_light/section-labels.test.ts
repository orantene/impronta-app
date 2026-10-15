import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lightSectionLabels, proficiencyLabel, yearsLabel } from "./section-labels";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../../../../..");
const read = (p: string) => readFileSync(join(here, p), "utf8");

// TUL-736 / TUL-707: /es/t chrome that was hardcoded English.
test("hub profile section labels follow the locale", () => {
  const es = lightSectionLabels("es");
  assert.equal(es.reviews, "Reseñas");
  assert.equal(es.bestFor, "Ideal para");
  assert.equal(es.skills, "Habilidades");
  assert.equal(lightSectionLabels("en").reviews, "Reviews");
  assert.equal(proficiencyLabel("expert", "es"), "Experto");
  assert.equal(yearsLabel(3, "es"), "3 años");
  assert.equal(yearsLabel(1, "en"), "1 yr");
});

test("the layout and skills block no longer hardcode English", () => {
  const layout = read("LightProfileLayout.tsx");
  assert.doesNotMatch(layout, /<LightSectionLabel>Reviews<\/LightSectionLabel>/);
  assert.doesNotMatch(layout, /aria-label="Client reviews"/);
  const skills = read("SkillsExperienceBlock.tsx");
  assert.doesNotMatch(skills, /label="(Best for|Skills|Industries|Events|Tags)"/);
  assert.doesNotMatch(skills, /PROF_LABELS/);
});

test("share row labels come from the message catalog in both languages", () => {
  const row = read("ProfileShareRow.tsx");
  for (const english of ["Share on WhatsApp", "Share on X", "Share on Facebook", "Share on LinkedIn", "Copy link for Instagram", "Print profile"]) {
    assert.ok(!row.includes(`"${english}"`), english);
  }
  const es = JSON.parse(readFileSync(join(webRoot, "messages/es.json"), "utf8"));
  const en = JSON.parse(readFileSync(join(webRoot, "messages/en.json"), "utf8"));
  for (const key of ["shareWhatsapp", "shareX", "shareFacebook", "shareLinkedin", "copyForInstagram", "copiedForInstagram", "print", "shareSystem"]) {
    assert.ok(es.public.profile.share[key], `es ${key}`);
    assert.notEqual(es.public.profile.share[key], en.public.profile.share[key], key);
  }
});

test("the directory card and filter use the Spanish place table", () => {
  const dto = readFileSync(join(webRoot, "src/lib/directory/talent-card-dto.ts"), "utf8");
  assert.match(dto, /spanishPlaceName\(/);
  const filters = readFileSync(join(webRoot, "src/lib/directory/directory-filter-sections.ts"), "utf8");
  assert.match(filters, /spanishPlaceName\(/);
});
