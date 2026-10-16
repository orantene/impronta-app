import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = __dirname;
const read = (rel: string) => readFileSync(join(dir, rel), "utf8");

test("TUL-736: field-group headings and works chip localize", async () => {
  const { fieldGroupLabel, worksLabel } = await import("./_light/group-labels");
  assert.equal(fieldGroupLabel("casting_identity", "es"), "Identidad de casting");
  assert.equal(fieldGroupLabel("sales-client-interaction", "es"), "Ventas y trato con clientes");
  assert.equal(fieldGroupLabel("service_area_travel", "es"), "Zona de servicio y viajes");
  assert.equal(fieldGroupLabel("physical-casting", "es"), "Casting físico");
  assert.equal(fieldGroupLabel("physical-casting", "en"), "Physical casting");
  assert.equal(worksLabel(16, "es"), "16 trabajos");
  assert.equal(worksLabel(16, "en"), "16 works");
});

test("TUL-736: hero experience line and works chip use the page locale", () => {
  const header = read("_light/ProfileHeader.tsx");
  assert.doesNotMatch(header, /LABELS: Record<string, string>/);
  assert.doesNotMatch(header, /yr\$\{skill\.years_experience === 1/);
  assert.match(header, /yearsLabel\(/);
  assert.match(header, /proficiencyLabel\(/);
  const layout = read("_light/LightProfileLayout.tsx");
  assert.doesNotMatch(layout, /\{galleryItems\.length\} works/);
  assert.match(layout, /worksLabel\(galleryItems\.length, locale\)/);
});

test("TUL-736: profile-view routes group labels through the module and stays within budget", () => {
  const src = read("profile-view.tsx");
  assert.match(src, /fieldGroupLabel\(slug, locale\)/);
  assert.doesNotMatch(src, /"physical-casting": \{ en:/);
  assert.ok(src.split("\n").length <= 2677);
});
