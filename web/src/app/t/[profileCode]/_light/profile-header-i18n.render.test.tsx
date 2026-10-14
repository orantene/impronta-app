import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProfileHeader } from "./ProfileHeader";
import { lightProfileLabels } from "./profile-labels";

const header = (locale: string) =>
  renderToStaticMarkup(
    createElement(ProfileHeader, {
      name: "QA",
      profileImageUrl: null,
      allTalentTypes: [],
      primaryType: null,
      primarySkill: null,
      livesIn: null,
      originallyFrom: null,
      languages: [],
      hasCover: false,
      profileCode: "TAL-1",
      isFeatured: false,
      inquireButton: null,
      shareMenu: null,
      discoveryCta: null,
      hubsIndicator: null,
      maxSiteUrl: "https://qa.example.test",
      locale,
    }),
  );

// TUL-683: the Portfolio badge and the "Visit my site" CTA followed the request locale.
test("ES profile header shows Spanish badge and CTA, no English", () => {
  const html = header("es");
  assert.match(html, /Visita mi sitio/);
  assert.match(html, /PORTAFOLIO/i);
  assert.doesNotMatch(html, /Visit my site/);
  assert.doesNotMatch(html, /PORTFOLIO/);
});

test("EN profile header keeps English badge and CTA", () => {
  const html = header("en");
  assert.match(html, /Visit my site/);
  assert.match(html, /PORTFOLIO/i);
});

test("section headings follow the locale", () => {
  assert.equal(lightProfileLabels("es").services, "Servicios");
  assert.equal(lightProfileLabels("en").services, "Services");
  assert.equal(lightProfileLabels("es").skills, "Habilidades y especialidades");
  assert.equal(lightProfileLabels("en").skills, "Skills & Specialties");
});
