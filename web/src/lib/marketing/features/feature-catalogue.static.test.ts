import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FEATURE_GROUP_ORDER,
  MARKETING_FEATURES,
  featurePaths,
  getFeatureByKey,
  getFeatureContent,
  featuresForHomeSection,
} from "./index";
import type { Feature, Para } from "./types";

/**
 * The catalogue is read by the grid, the popups, the pages, the nav and the
 * sitemap, so a mistake in it is a mistake on every surface at once. These are
 * the invariants that keep those surfaces honest.
 *
 * The dash test is the one the owner asked for by name. The eslint rule that
 * would otherwise cover it is a warning, and `npm run lint` runs with
 * `--quiet`, so warnings produce no CI signal at all. Without this file the
 * no-dash rule is a hope rather than a gate.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const EM_DASH = "—";
const EN_DASH = "–";

function flattenPara(p: Para): string {
  return p.map((seg) => (typeof seg === "string" ? seg : seg.label)).join("");
}

function allProseFor(feature: Feature): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const locale of ["en", "es"] as const) {
    const c = getFeatureContent(feature, locale);
    const at = (field: string) => `${feature.key}.${locale}.${field}`;
    out.push({ where: at("name"), text: c.name });
    out.push({ where: at("title"), text: c.title });
    out.push({ where: at("subtitle"), text: c.subtitle });
    out.push({ where: at("promise"), text: c.promise });
    c.popup.forEach((p, i) => out.push({ where: at(`popup[${i}]`), text: flattenPara(p) }));
    c.intro.forEach((p, i) => out.push({ where: at(`intro[${i}]`), text: flattenPara(p) }));
    c.sections.forEach((s, i) => {
      out.push({ where: at(`sections[${i}].heading`), text: s.heading });
      s.body.forEach((p, j) =>
        out.push({ where: at(`sections[${i}].body[${j}]`), text: flattenPara(p) }),
      );
    });
    c.highlights.forEach((h, i) => out.push({ where: at(`highlights[${i}]`), text: h }));
    c.faq.forEach((f, i) => {
      out.push({ where: at(`faq[${i}].q`), text: f.q });
      out.push({ where: at(`faq[${i}].a`), text: f.a });
    });
  }
  return out;
}

test("no em dashes or en dashes in any feature copy", () => {
  const offenders: string[] = [];
  for (const feature of MARKETING_FEATURES) {
    for (const { where, text } of allProseFor(feature)) {
      if (text.includes(EM_DASH) || text.includes(EN_DASH)) offenders.push(where);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Dashes are not house style in user-facing copy. Rewrite with a comma, a period or a colon: ${offenders.join(", ")}`,
  );
});

test("the dash check reads the source modules, not just the exports", () => {
  // Belt and braces: if the catalogue is ever restructured so the exported
  // shape stops covering some prose, the raw files are still scanned.
  const files = readdirSync(HERE).filter(
    (f) => (f.startsWith("feature-") || f.startsWith("features-")) && f.endsWith(".ts") && !f.includes(".test."),
  );
  assert.ok(files.length >= 5, "expected the stage content modules to be present");
  const offenders = files.filter((f) => {
    const src = readFileSync(join(HERE, f), "utf8");
    return src.includes(EM_DASH) || src.includes(EN_DASH);
  });
  assert.deepEqual(offenders, [], `dash characters found in: ${offenders.join(", ")}`);
});

test("exactly 21 plates, numbered 1 to 21 with no gaps or repeats", () => {
  assert.equal(MARKETING_FEATURES.length, 21);
  const plates = MARKETING_FEATURES.map((f) => f.plate);
  assert.deepEqual(plates, Array.from({ length: 21 }, (_, i) => i + 1));
});

test("slugs are unique, url safe, and never collide across locales", () => {
  const en = MARKETING_FEATURES.map((f) => f.slugEn);
  const es = MARKETING_FEATURES.map((f) => f.slugEs);
  assert.equal(new Set(en).size, 21, "duplicate English slug");
  assert.equal(new Set(es).size, 21, "duplicate Spanish slug");
  for (const slug of [...en, ...es]) {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `slug is not url safe: ${slug}`);
  }
  // The two route trees are separate, so an English slug that also exists as a
  // Spanish slug would make the cross-slug redirects ambiguous.
  const overlap = en.filter((s) => es.includes(s));
  assert.deepEqual(overlap, [], `slug used in both languages: ${overlap.join(", ")}`);
});

test("every cross-link points at a feature that exists", () => {
  const dangling: string[] = [];
  for (const feature of MARKETING_FEATURES) {
    for (const key of feature.related) {
      if (!getFeatureByKey(key)) dangling.push(`${feature.key} -> related ${key}`);
    }
    for (const locale of ["en", "es"] as const) {
      const c = getFeatureContent(feature, locale);
      const paras = [...c.popup, ...c.intro, ...c.sections.flatMap((s) => s.body)];
      for (const p of paras) {
        for (const seg of p) {
          if (typeof seg !== "string" && !getFeatureByKey(seg.f)) {
            dangling.push(`${feature.key}.${locale} -> inline ${seg.f}`);
          }
        }
      }
    }
  }
  assert.deepEqual(dangling, [], `cross-links to unknown features: ${dangling.join(", ")}`);
});

test("a feature never cross-links to itself", () => {
  const selfLinks = MARKETING_FEATURES.filter((f) => f.related.includes(f.key)).map((f) => f.key);
  assert.deepEqual(selfLinks, []);
});

test("both locales are populated for every feature", () => {
  for (const feature of MARKETING_FEATURES) {
    for (const locale of ["en", "es"] as const) {
      const c = getFeatureContent(feature, locale);
      const at = `${feature.key}.${locale}`;
      assert.ok(c.name.trim().length > 0, `${at}.name is empty`);
      assert.ok(c.title.trim().length > 0, `${at}.title is empty`);
      assert.ok(c.subtitle.trim().length > 0, `${at}.subtitle is empty`);
      assert.ok(c.promise.trim().length > 0, `${at}.promise is empty`);
      assert.ok(c.popup.length > 0, `${at}.popup has no paragraphs`);
      assert.ok(c.intro.length > 0, `${at}.intro has no paragraphs`);
      assert.ok(c.sections.length > 0, `${at} has no sections`);
      assert.ok(c.highlights.length > 0, `${at} has no highlights`);
      assert.ok(c.faq.length > 0, `${at} has no faq`);
    }
  }
});

test("subtitles stay inside a meta description", () => {
  // The subtitle is the meta description. Google truncates around 155 chars,
  // and a truncated sentence reads like a broken page in the result list.
  const tooLong: string[] = [];
  for (const feature of MARKETING_FEATURES) {
    for (const locale of ["en", "es"] as const) {
      const { subtitle } = getFeatureContent(feature, locale);
      if (subtitle.length > 160) tooLong.push(`${feature.key}.${locale} (${subtitle.length})`);
    }
  }
  assert.deepEqual(tooLong, [], `meta descriptions over 160 chars: ${tooLong.join(", ")}`);
});

test("every group has features and the stage order is complete", () => {
  for (const group of FEATURE_GROUP_ORDER) {
    const inGroup = MARKETING_FEATURES.filter((f) => f.group === group);
    assert.ok(inGroup.length > 0, `stage ${group} has no features`);
  }
  const groups = new Set(MARKETING_FEATURES.map((f) => f.group));
  assert.equal(groups.size, FEATURE_GROUP_ORDER.length, "a feature uses an unlisted stage");
});

test("the homepage split matches the owner's specification", () => {
  const one = featuresForHomeSection("one");
  const two = featuresForHomeSection("two");
  // Plates 1 to 12 plus Premium Support, which appears in both sections.
  assert.equal(one.length, 13);
  assert.deepEqual(one.slice(0, 12).map((f) => f.plate), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(one[12]?.key, "premium-support");
  assert.deepEqual(two.map((f) => f.plate), Array.from({ length: 9 }, (_, i) => i + 13));
  assert.ok(two.some((f) => f.key === "premium-support"), "support closes the second section too");
});

test("paths are built from the slugs, in both route trees", () => {
  for (const feature of MARKETING_FEATURES) {
    const { enPath, esPath } = featurePaths(feature);
    assert.equal(enPath, `/features/${feature.slugEn}`);
    assert.equal(esPath, `/funciones/${feature.slugEs}`);
  }
});

test("roadmap features are marked coming and say so in their copy", () => {
  // A page that ranks for a feature we have not shipped is fine. A page that
  // implies it is available is not, and this is the check that keeps that line.
  const coming = MARKETING_FEATURES.filter((f) => f.status === "coming");
  assert.ok(coming.length > 0, "expected roadmap features in the catalogue");
  for (const feature of coming) {
    for (const locale of ["en", "es"] as const) {
      const c = getFeatureContent(feature, locale);
      const faqText = c.faq.map((f) => `${f.q} ${f.a}`).join(" ").toLowerCase();
      const promisesAvailability =
        locale === "es"
          ? faqText.includes("todavía no se lanza") || faqText.includes("hoja de ruta")
          : faqText.includes("not shipped yet") || faqText.includes("roadmap");
      assert.ok(
        promisesAvailability,
        `${feature.key}.${locale} is marked coming but its FAQ never says so`,
      );
    }
  }
});
