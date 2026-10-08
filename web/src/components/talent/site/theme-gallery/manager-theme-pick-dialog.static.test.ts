/**
 * TUL-321 — the Manager gallery's Design pick uses the in-app keep/change
 * dialog (shared with PublishDesignDialog), never window.confirm, and says
 * plainly that it only changes the draft.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { themeGalleryCopy } from "./theme-gallery-i18n";

const SITE = join(process.cwd(), "src/components/talent/site");
const read = (rel: string) => readFileSync(join(SITE, rel), "utf8");

test("TUL-321: ManagerThemeGallery no longer calls window.confirm", () => {
  const src = read("theme-gallery/ManagerThemeGallery.tsx");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /window\.confirm|\bconfirm\(/);
  assert.match(src, /ThemePickDraftDialog/);
  assert.match(src, /buildLiveDesignChangeSummary/);
  assert.match(src, /applySiteDesignAction/);
});

test("TUL-321: the draft dialog renders the shared keep/change summary", () => {
  const dlg = read("theme-gallery/ThemePickDraftDialog.tsx");
  assert.match(dlg, /DesignChangeSummaryBody/);
  const pub = read("maison-setup/PublishDesignDialog.tsx");
  assert.match(pub, /DesignChangeSummaryBody/);
  const body = read("maison-setup/DesignChangeSummaryBody.tsx");
  assert.match(body, /What changes/);
  assert.match(body, /What stays/);
  assert.match(body, /Qué cambia/);
  assert.match(body, /Qué se queda/);
  assert.doesNotMatch(dlg, /style=\{\{/);
  assert.doesNotMatch(dlg, /#[0-9a-fA-F]{3,8}\b/);
});

test("TUL-321: draft-only wording in en and es, no Publish on the primary, no em dashes", () => {
  const keys = [
    "draftDialogTitle",
    "draftDialogNote",
    "draftDialogConfirm",
    "draftDialogKeep",
    "draftDialogClose",
  ] as const;
  for (const locale of ["en", "es"] as const) {
    for (const k of keys) {
      const v = themeGalleryCopy(locale, k);
      assert.ok(v.length > 0);
      assert.doesNotMatch(v, /—/);
    }
    assert.doesNotMatch(themeGalleryCopy(locale, "draftDialogConfirm"), /publi/i);
    assert.doesNotMatch(themeGalleryCopy(locale, "draftDialogTitle"), /publi/i);
  }
  assert.equal(
    themeGalleryCopy("en", "draftDialogNote"),
    "This changes your draft. Your live site stays the same until you publish.",
  );
  assert.match(themeGalleryCopy("es", "draftDialogNote"), /borrador/);
});

test("TUL-321: one rule, draft is primary and publish-now is secondary in both dialogs", () => {
  const mgr = read("theme-gallery/ThemePickDraftDialog.tsx");
  const mai = read("maison-setup/PublishDesignDialog.tsx");
  // Draft button first in source (flex-row-reverse puts it on the primary side).
  assert.ok(mgr.indexOf("theme-pick-draft-confirm") < mgr.indexOf("theme-pick-draft-publish-now"));
  assert.match(mgr, /bg-emerald-900[^]*?draftDialogConfirm/);
  assert.match(mgr, /draftDialogPublishNow/);
  assert.ok(mai.indexOf("maison-publish-design-draft") < mai.indexOf("maison-publish-design-confirm"));
  assert.match(mai, /bg-emerald-900[^]*?Change design in draft/);
  assert.match(mai, /Change and publish now/);
  assert.doesNotMatch(mai, /window\.confirm/);
  const copy = read("maison-setup/maison-setup-copy.ts");
  assert.match(copy, /"Change design in draft": "Cambiar diseño en el borrador"/);
  assert.match(copy, /"Change and publish now": "Cambiar y publicar ahora"/);
  for (const locale of ["en", "es"] as const) {
    for (const k of ["draftDialogPublishNow", "publishNowError"] as const) {
      const v = themeGalleryCopy(locale, k);
      assert.ok(v.length > 0);
      assert.doesNotMatch(v, /—/);
    }
  }
  assert.equal(themeGalleryCopy("en", "draftDialogPublishNow"), "Change and publish now");
  assert.match(themeGalleryCopy("es", "draftDialogPublishNow"), /publicar/);
});

test("TUL-321: publish-now reuses publishMaxSiteAction, no new publish path", () => {
  const src = read("theme-gallery/ManagerThemeGallery.tsx");
  assert.match(src, /import \{ publishMaxSiteAction \} from "@\/lib\/talent-site\/server\/site-management-actions"/);
  assert.match(src, /await publishMaxSiteAction\(\)/);
});
