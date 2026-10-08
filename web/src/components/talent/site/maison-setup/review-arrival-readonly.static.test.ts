import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * F58: arriving on the Review step from Today / the pill / My presence wrote
 * to the site (setup_choices + updated_at via saveMaisonSetupChoicesAction)
 * and showed "Previous design restored · Undo" with no user action. The
 * forced-screen effect treated every forced "review" as a restore.
 */
const dir = "src/components/talent/site";
const read = (p: string) => readFileSync(join(process.cwd(), dir, p), "utf8");

function effectBody(src: string, marker: string): string {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `missing ${marker}`);
  const end = src.indexOf("}, [", start);
  return src.slice(start, end);
}

test("a resume-forced screen does not persist choices or show the restored toast", () => {
  const host = read("maison-setup/MaisonSetupHost.tsx");
  const body = effectBody(host, "if (!forceScreen || !talentProfileId) return;");
  assert.match(body, /const resume = forceScreenReason === "resume";/);
  assert.match(body, /if \(!resume\) persistChoices\(/);
  assert.match(body, /forceScreen === "review" && !resume\) setToast\("restored"\)/);
  // No unconditional write left in the effect.
  assert.equal((body.match(/persistChoices\(/g) ?? []).length, 1);
});

test("surfaces open Review as a resume; only Design options' restore is a restore", () => {
  const mgr = read("TalentMaxSiteManager.tsx");
  const open = mgr.slice(mgr.indexOf("const openSetup = useCallback"), mgr.indexOf("}, []);", mgr.indexOf("const openSetup")));
  assert.match(open, /setMaisonForceReason\("resume"\)/);
  assert.match(mgr, /onRestoredToReview=\{\(\) => \{\s*setMaisonForceReason\("restored"\)/);
  assert.match(mgr, /forceScreenReason=\{maisonForceReason\}/);
});

test("mounting ReviewWebsiteScreen only READS: mount effects call no write action", () => {
  const review = read("maison-setup/ReviewWebsiteScreen.tsx");
  const reload = review.slice(review.indexOf("const reload = useCallback"), review.indexOf("}, [choices.contentMode, locale]);"));
  assert.match(reload, /loadMaisonReviewStateAction\(/);
  assert.doesNotMatch(reload, /save\w*Action|undo\w*Action|publish\w*Action|apply\w*Action|restore\w*Action|onChange\(/);
  // Writes exist only inside click handlers.
  for (const w of ["undoMaisonDesignAction(", "publishMaxSiteAction("]) {
    const at = review.indexOf(w);
    if (at < 0) continue;
    const fnStart = review.lastIndexOf("function handle", at);
    assert.ok(fnStart >= 0 && fnStart < at, `${w} must sit in a handleX click handler`);
  }
});
