/**
 * AUD-033: the Maison "Choose a design" card embedded a preview URL that
 * rendered "Page not found" in production. These checks pin the three links
 * of that chain: the URL the card builds maps to a real route file, the route
 * handles its `kind`, and the gate opens it on the Maison flag (not only the
 * generic gallery flag, which is off in production).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildThemePreviewUrl } from "@/components/talent/site/theme-gallery/useThemePreview";
import { MAISON_BUILTIN_DEMO } from "@/lib/talent-site/theme-catalog/maison/builtins";
import { isThemePreviewAllowed } from "./theme-preview-gate";

const APP_DIR = join(process.cwd(), "src", "app");

const cardUrl = () =>
  new URL(
    buildThemePreviewUrl({
      designSlug: "maison",
      lookSlug: MAISON_BUILTIN_DEMO.buildPayload().default_look,
      talentProfileId: "talent-1",
      locale: "en",
    }),
    "https://app.test",
  );

test("the Maison card preview URL maps to an existing app route", () => {
  const url = cardUrl();
  const segments = url.pathname.split("/").filter(Boolean);
  assert.deepEqual(segments, ["template-preview", "maison"]);
  // `/template-preview/<key>` resolves to the dynamic `[key]` page.
  assert.ok(existsSync(join(APP_DIR, "template-preview", "[key]", "page.tsx")));
  assert.equal(url.searchParams.get("kind"), "talent-theme");
});

test("the route handles kind=talent-theme through the gated theme preview", () => {
  const page = readFileSync(join(APP_DIR, "template-preview", "[key]", "page.tsx"), "utf8");
  assert.match(page, /raw === "talent-theme"/);
  assert.match(page, /<ThemeCatalogPreview/);
  const preview = readFileSync(
    join(APP_DIR, "template-preview", "[key]", "theme-preview.tsx"),
    "utf8",
  );
  assert.match(preview, /isThemePreviewAllowed\(designSlug, talentProfileId\)/);
  assert.match(preview, /loadMaisonCatalogRow/);
  assert.doesNotMatch(preview, /isTalentThemeGalleryEnabled\(\)\) notFound/);
});

test("Maison preview opens on the Maison flag even with the gallery flag off", () => {
  const deps = { galleryEnabled: () => false, maisonEnabled: () => true };
  assert.equal(isThemePreviewAllowed("maison", "talent-1", deps), true);
  assert.equal(isThemePreviewAllowed("maison-pink", "talent-1", deps), true);
  // Non-Maison designs still follow the gallery flag.
  assert.equal(isThemePreviewAllowed("editorial", "talent-1", deps), false);
});

test("Maison preview stays closed when the Maison flag is off for the talent", () => {
  const seen: Array<string | null | undefined> = [];
  const allowed = isThemePreviewAllowed("maison", "talent-2", {
    galleryEnabled: () => true,
    maisonEnabled: (id) => {
      seen.push(id);
      return false;
    },
  });
  assert.equal(allowed, false);
  assert.deepEqual(seen, ["talent-2"]);
});
