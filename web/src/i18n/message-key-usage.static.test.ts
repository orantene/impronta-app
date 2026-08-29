/**
 * message-key-usage.static.test.ts — the dashboard i18n catalog checked against
 * its own call sites, in BOTH directions.
 *
 * WHY THIS EXISTS (the bug it would have caught)
 * ──────────────────────────────────────────────
 * PR #1113 defined `statusDenied` and `declinedBadge` under
 * `dashboard.talentHubFace.*` in `messages/en.json` + `es.json`, while
 * `components/talent/media-release-panel.tsx` read them from
 * `dashboard.mediaRelease.*`. `createTranslator` returns the KEY ITSELF when a
 * dot-path misses, so the declined-release tile rendered the literal strings
 * "dashboard.mediaRelease.statusDenied" and ".declinedBadge" to real users, in
 * BOTH locales, in production. Every gate stayed green: `verify:ui-messages`
 * compares en.json against es.json and nothing else, so a key that is defined in
 * both files and read from neither place is, to that script, perfect.
 *
 * The gap was structural, not accidental: nothing anywhere related a key to the
 * code that reads it. PR #1122 fixed that one tile. This fixes the class:
 *
 *   1. MISSING — a `t("literal.key")` whose key is not a string in en.json is a
 *      raw dotted key on somebody's screen. Hard failure, with file:line.
 *   2. DEAD — a catalog key nothing in `src/` references is either a leftover or
 *      the other half of a live #1113 (the copy was written, the reader points
 *      somewhere else). Ratcheted against a recorded baseline, see below.
 *
 * SCOPE — the DASHBOARD i18n system only
 * ──────────────────────────────────────
 * This repo has TWO i18n systems and they must not be merged:
 *
 *   • DASHBOARD (this file's scope) — semantic dotted keys in
 *     `web/messages/{en,es,fr}.json`, read through `useT()` / `createTranslator`
 *     as `t("some.dotted.key")`.
 *   • EDITOR CHROME (NOT this file's scope) — `ES_TEXT` in
 *     `components/edit-chrome/editor-i18n-es.ts`, keyed by the ENGLISH LITERAL
 *     STRING (`t("Publish")`), guarded by `edit-chrome/es-parity.static.test.ts`.
 *
 * They are separate on purpose. Keeping them apart is why the key matcher here
 * requires a dotted, space-free key shape: `copy.t("Save and close.")` is
 * editor-chrome copy and must stay invisible to this guard, and member calls
 * (`something.t(...)`) are excluded outright. If you are here to "unify" the two
 * systems, that is a product decision with a migration attached, not a test fix.
 *
 * WHAT THIS CANNOT SEE, stated plainly rather than implied away
 * ────────────────────────────────────────────────────────────
 *   • `t(someVariable)` and `t(`pfx.${x}`)` that this file cannot resolve are
 *     NOT checked for existence. They are counted and printed so the size of the
 *     blind spot is visible instead of comfortable.
 *   • It does not prove a string SHOULD have been wrapped in `t()`; an unwrapped
 *     English literal is invisible here.
 *   • It does not check translation quality, only that a key resolves.
 *   • `verify:ui-messages` still owns en/es alignment. This guard deliberately
 *     reads en.json only: en is the canonical catalog (`ROOT_FALLBACK_LOCALE`),
 *     so a key present in en is servable in every locale via the fallback chain.
 *
 * LANE
 * ────
 * `npm run test:phase1-i18n`, which is already in both the `ci` aggregate script
 * and `.github/workflows/ci.yml`; `check:ci-lane-parity` proves that pairing.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEAD_MESSAGE_KEY_BASELINE } from "./message-key-usage-baseline";

/** Absolute path to `web/`, derived from this file rather than from cwd. */
const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(WEB_ROOT, "src");

/**
 * The guard's own bookkeeping, excluded from every sweep below.
 *
 * Both files live under `src/` and both are full of catalog keys — the baseline
 * lists every dead key by name, and the allow-list quotes the composition
 * patterns it excuses. Reading them as evidence would make the guard cite its
 * own paperwork as proof the copy is used, and the dead-key half would report
 * zero forever. Found the hard way: an allow-list COMMENT containing
 * `public.reviews.form.traits.${id}` silently registered a key family and hid
 * five real dead keys on the very first run.
 */
const SELF_FILES = new Set([
  "src/i18n/message-key-usage.static.test.ts",
  "src/i18n/message-key-usage-baseline.ts",
]);

/**
 * Keys that no static reader can see because they are assembled from data the
 * guard cannot evaluate, and that the template-family detector below also
 * cannot reach (it only resolves `${...}` holes when the surrounding template
 * literal is itself key-shaped).
 *
 * Every entry needs a reason. This is a list of decisions, not a place to park
 * a failure. Whole prefixes are deliberately NOT skippable: the unit is one key.
 */
const RUNTIME_COMPOSED: ReadonlyMap<string, string> = new Map([
  /*
   * SupportIdeasView.tsx composes the feature-request status label as
   *   t(`dashboard.platform.support.ideasStatus_${status}`)
   * over FEATURE_REQUEST_STATUSES (lib/support/feature-requests.ts), which is
   * also the DB CHECK on support_feature_requests.status. Listed one key per
   * status on purpose: a status added to the enum without copy should fail
   * this guard rather than hide behind a prefix skip.
   */
  ["dashboard.platform.support.ideasStatus_new", "SupportIdeasView composes `ideasStatus_${status}` over FEATURE_REQUEST_STATUSES."],
  ["dashboard.platform.support.ideasStatus_under_review", "SupportIdeasView composes `ideasStatus_${status}` over FEATURE_REQUEST_STATUSES."],
  ["dashboard.platform.support.ideasStatus_planned", "SupportIdeasView composes `ideasStatus_${status}` over FEATURE_REQUEST_STATUSES."],
  ["dashboard.platform.support.ideasStatus_in_progress", "SupportIdeasView composes `ideasStatus_${status}` over FEATURE_REQUEST_STATUSES."],
  ["dashboard.platform.support.ideasStatus_shipped", "SupportIdeasView composes `ideasStatus_${status}` over FEATURE_REQUEST_STATUSES."],
  ["dashboard.platform.support.ideasStatus_declined", "SupportIdeasView composes `ideasStatus_${status}` over FEATURE_REQUEST_STATUSES."],
  /*
   * admin/roster/[id]/EditorSections.tsx:501 builds the language label as
   *   t(`admin.talent.edit.languages.names.${l.code === "zh" ? "mandarin" : …}`)
   * The hole is a nested ternary, not an identifier, so the family detector
   * below refuses it (it only accepts holes it can name). Verified by reading
   * that expression: the reachable values are the ISO language list, one entry
   * per key. Listed one key at a time on purpose — skipping the whole
   * `languages.names.*` prefix would also hide a language nobody can select.
   */
  ["admin.talent.edit.languages.names.arabic", "EditorSections.tsx:501 composes `languages.names.${…}`; reached when l.code === 'ar'."],
  ["admin.talent.edit.languages.names.dutch", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.english", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.french", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.german", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.hindi", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.italian", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.japanese", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.korean", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.mandarin", "EditorSections.tsx:501 composes `languages.names.${…}`; reached when l.code === 'zh'."],
  ["admin.talent.edit.languages.names.portuguese", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.russian", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.spanish", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],
  ["admin.talent.edit.languages.names.turkish", "EditorSections.tsx:501 composes `languages.names.${…}` from the language name."],

  /*
   * WorkspacePageView.tsx:214-215 and BillingPage.tsx:640 title-case the plan
   * INSIDE the last segment:
   *   t(`dashboard.adminWorkspace.planName${plan.charAt(0).toUpperCase()}…`)
   * The hole is mid-segment, so it is not a dotted family at all and the
   * detector cannot see it. Four plan tiers, two key groups, eight keys.
   */
  ["dashboard.adminWorkspace.planNameFree", "WorkspacePageView.tsx:214 composes `planName${TitleCasedPlan}` for plan 'free'."],
  ["dashboard.adminWorkspace.planNameStudio", "WorkspacePageView.tsx:214 composes `planName${TitleCasedPlan}` for plan 'studio'."],
  ["dashboard.adminWorkspace.planNameAgency", "WorkspacePageView.tsx:214 composes `planName${TitleCasedPlan}` for plan 'agency'."],
  ["dashboard.adminWorkspace.planNameNetwork", "WorkspacePageView.tsx:214 composes `planName${TitleCasedPlan}` for plan 'network'."],
  ["dashboard.adminWorkspace.planThemeFree", "WorkspacePageView.tsx:215 composes `planTheme${TitleCasedPlan}` for plan 'free'."],
  ["dashboard.adminWorkspace.planThemeStudio", "WorkspacePageView.tsx:215 composes `planTheme${TitleCasedPlan}` for plan 'studio'."],
  ["dashboard.adminWorkspace.planThemeAgency", "WorkspacePageView.tsx:215 composes `planTheme${TitleCasedPlan}` for plan 'agency'."],
  ["dashboard.adminWorkspace.planThemeNetwork", "WorkspacePageView.tsx:215 composes `planTheme${TitleCasedPlan}` for plan 'network'."],

  /*
   * LeaveReviewCard.tsx:647 renders the trait chip label through a lookup
   * table: tt(`public.reviews.form.traits.${TRAIT_LABEL_KEY[t]}`). The hole is
   * an index expression, which the family detector rejects on purpose (an
   * index it cannot evaluate could stand for anything). TRAIT_LABEL_KEY is
   * declared at line 52 and has exactly these five values.
   */
  ["public.reviews.form.traits.deliveredBrief", "LeaveReviewCard.tsx:647, via TRAIT_LABEL_KEY['delivered_brief']."],
  ["public.reviews.form.traits.easyToWorkWith", "LeaveReviewCard.tsx:647, via TRAIT_LABEL_KEY['easy_to_work_with']."],
  ["public.reviews.form.traits.greatCommunication", "LeaveReviewCard.tsx:647, via TRAIT_LABEL_KEY['great_communication']."],
  ["public.reviews.form.traits.onTime", "LeaveReviewCard.tsx:647, via TRAIT_LABEL_KEY['on_time']."],
  ["public.reviews.form.traits.wellPrepared", "LeaveReviewCard.tsx:647, via TRAIT_LABEL_KEY['well_prepared']."],
]);

/* ────────────────────────────── catalog ────────────────────────────── */

type CatalogNode = { [k: string]: unknown };

interface Catalog {
  /** Dot-paths whose value is a string (or a string array) — servable keys. */
  readonly leaves: ReadonlySet<string>;
  /** Dot-paths whose value is an object, mapped to their child names. */
  readonly nodes: ReadonlyMap<string, readonly string[]>;
  /** Top-level namespaces (`public`, `dashboard`, …). */
  readonly namespaces: ReadonlySet<string>;
}

function readCatalog(): Catalog {
  const en = JSON.parse(readFileSync(join(WEB_ROOT, "messages/en.json"), "utf8")) as CatalogNode;
  const leaves = new Set<string>();
  const nodes = new Map<string, readonly string[]>();
  (function walkNode(obj: CatalogNode, prefix: string) {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      // Arrays are leaves: `getMessageStringArray` reads them at the array path.
      if (value && typeof value === "object" && !Array.isArray(value)) {
        nodes.set(path, Object.keys(value as CatalogNode));
        walkNode(value as CatalogNode, path);
      } else {
        leaves.add(path);
      }
    }
  })(en, "");
  return { leaves, nodes, namespaces: new Set(Object.keys(en)) };
}

/* ───────────────────────────── extraction ──────────────────────────── */

/**
 * A dashboard key: dotted, no spaces. The space-free requirement is what keeps
 * editor-chrome copy (`t("This can't be undone.")`) out of this guard.
 */
const KEY_SHAPE = /^[A-Za-z_][\w-]*(?:\.[A-Za-z0-9_-]+)+$/;

/**
 * Translator-shaped callees, matching what the codebase actually binds today:
 * `t` (useT / createTranslator), `tr`, `tt` / `ti` / `tInterp` / `tFlash`
 * (withInterpolation), `tp` / `tPlural` (withPluralization), `te`
 * (createEnhancedTranslator). The lookbehind excludes MEMBER calls, so the
 * editor-chrome `copy.t("English string")` seam is not mistaken for this one.
 */
const CALLEE = String.raw`(?<![.\w$])(?:t|tr|ti|tt|te|tp|t[A-Z][\w$]*)`;
const CALL_LITERAL = new RegExp(String.raw`${CALLEE}\(\s*(["'])((?:\\.|(?!\1)[^\\\n])*?)\1\s*[,)]`, "g");
const CALL_IDENT = new RegExp(String.raw`${CALLEE}\(\s*([A-Za-z_$][\w$]*)\s*[,)]`, "g");
const CALL_TEMPLATE = new RegExp(String.raw`${CALLEE}\(\s*\x60([^\x60\n]*)\x60\s*[,)]`, "g");

/** `const X = "…"` / `let X = "…"`, so `t(X)` and `` `${X}.suffix` `` resolve. */
const CONST_STRING = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=\n]+)?=\s*(["'])((?:\\.|(?!\2)[^\\\n])*?)\2/g;
/** Any single-line string literal, used for the reference (dead-key) sweep. */
const ANY_LITERAL = /(["'])((?:\\.|(?!\1)[^\\\n])*?)\1/g;
/** Any single-line template literal, likewise. */
const ANY_TEMPLATE = /`([^`\n]*)`/g;

/**
 * Strip `//` and `/* *\/` comments while leaving string and template literals
 * intact, and preserving line numbers.
 *
 * Not optional: `app/(auth)/login/page.tsx` carries a commented-out Apple
 * sign-in block containing `t("public.auth.login.apple")`, and `i18n/
 * interpolate.ts` documents its own API with `t("welcome.user")` in a JSDoc
 * example. Both are prose. Reporting them would train readers to ignore this
 * guard's output, which is the only way a guard actually dies.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i]!;
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out += "\n"; // keep line numbers honest
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Decode a source literal into the string passed at runtime, so an escape in
 * the source is not reported as a phantom missing key. Mirrors the same helper
 * in `edit-chrome/es-parity.static.test.ts`.
 */
function decodeLiteral(raw: string): string {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m, esc: string) => {
    switch (esc[0]) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "u": return String.fromCodePoint(parseInt(esc.slice(1), 16));
      case "x": return String.fromCodePoint(parseInt(esc.slice(1), 16));
      default: return esc; // \\ \" \' and friends
    }
  });
}

function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkSources(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

interface CallSite {
  readonly key: string;
  readonly where: string;
}

interface Extraction {
  /** Static `t("literal.key")` call sites, outside comments and tests. */
  readonly calls: readonly CallSite[];
  /** Every key-shaped literal anywhere in `src/` — the reference sweep. */
  readonly literals: ReadonlySet<string>;
  /** Key-shaped templates with an unresolved hole, e.g. `a.b.${x}.c`. */
  readonly families: ReadonlyMap<string, string>;
  /** `t()` calls whose argument this guard could not resolve. */
  readonly dynamicCalls: number;
  readonly dynamicFiles: ReadonlySet<string>;
}

function extract(catalog: Catalog): Extraction {
  const calls: CallSite[] = [];
  const literals = new Set<string>();
  const families = new Map<string, string>();
  const dynamicFiles = new Set<string>();
  let dynamicCalls = 0;

  for (const file of walkSources(SRC)) {
    const rel = file.slice(WEB_ROOT.length + 1);
    if (SELF_FILES.has(rel)) continue;
    const source = stripComments(readFileSync(file, "utf8"));
    const lineAt = (index: number) => source.slice(0, index).split("\n").length;

    const consts = new Map<string, string>();
    for (const m of source.matchAll(CONST_STRING)) consts.set(m[1]!, decodeLiteral(m[3]!));
    const fillHoles = (body: string) =>
      body.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (whole, id: string) => consts.get(id) ?? whole);

    /* Reference sweep — every key-shaped literal counts, wherever it sits. A
       key handed to a `labelKey` prop or held in a nav table is genuinely used;
       insisting it appear inside `t(...)` would report live copy as dead. */
    for (const m of source.matchAll(ANY_LITERAL)) {
      const value = decodeLiteral(m[2]!);
      if (KEY_SHAPE.test(value)) literals.add(value);
    }
    for (const m of source.matchAll(ANY_TEMPLATE)) {
      const body = m[1]!;
      if (!body.includes("${")) continue;
      const filled = fillHoles(body);
      if (!filled.includes("${")) {
        if (KEY_SHAPE.test(filled)) literals.add(filled);
        continue;
      }
      // A family is only believed when its literal head is a real catalog
      // namespace. Without that, analytics event names (`stripe-webhook.${e}`)
      // and PostgREST filters (`user_id.eq.${id}`) would widen the guard into
      // uselessness.
      const head = filled.split(".")[0]!;
      if (!catalog.namespaces.has(head)) continue;
      if (!/^[A-Za-z_][\w-]*(?:\.[\w-]+)*\.\$\{/.test(filled)) continue;
      if (!/^[A-Za-z0-9_.${}-]+$/.test(filled)) continue;
      if (!families.has(filled)) families.set(filled, `${rel}:${lineAt(m.index)}`);
    }

    /* Call-site sweep — tests are excluded: they build fixture keys on purpose
       (`interpolate.test.ts` asserts on `welcome.user`), and a test that names a
       key that does not exist fails loudly on its own. */
    if (/\.test\.tsx?$/.test(rel)) continue;

    for (const m of source.matchAll(CALL_LITERAL)) {
      const key = decodeLiteral(m[2]!);
      if (KEY_SHAPE.test(key)) calls.push({ key, where: `${rel}:${lineAt(m.index)}` });
    }
    for (const m of source.matchAll(CALL_IDENT)) {
      const value = consts.get(m[1]!);
      if (value && KEY_SHAPE.test(value)) {
        calls.push({ key: value, where: `${rel}:${lineAt(m.index)}` });
      } else {
        dynamicCalls++;
        dynamicFiles.add(rel);
      }
    }
    for (const m of source.matchAll(CALL_TEMPLATE)) {
      const filled = fillHoles(m[1]!);
      if (!filled.includes("${")) {
        if (KEY_SHAPE.test(filled)) calls.push({ key: filled, where: `${rel}:${lineAt(m.index)}` });
        continue;
      }
      dynamicCalls++;
      dynamicFiles.add(rel);
    }
  }

  return { calls, literals, families, dynamicCalls, dynamicFiles };
}

/* ───────────────────────────── resolution ──────────────────────────── */

/**
 * Does `t(key)` resolve to something renderable?
 *
 * A key pointing at an OBJECT normally does not: `createTranslator` only returns
 * a value when the walk lands on a string, so `t("a.b")` over `{a:{b:{desc:…}}}`
 * renders the raw dotted key. The single legitimate exception is the plural
 * convention in `i18n/interpolate.ts`, where `tPlural("inbox.unread")` reads
 * `inbox.unread.one` / `.other` — so a node is accepted only when it carries
 * one of those two children.
 */
function resolvesToCopy(key: string, catalog: Catalog): boolean {
  if (catalog.leaves.has(key)) return true;
  const children = catalog.nodes.get(key);
  return !!children && (children.includes("one") || children.includes("other"));
}

function familyMatcher(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\$\\\{[^}]*\\\}/g, "[A-Za-z0-9_-]+")}$`);
}

/** Is a catalog key reachable from `src/`, by any mechanism this guard sees? */
function isReferenced(key: string, extraction: Extraction, matchers: readonly RegExp[]): boolean {
  if (extraction.literals.has(key)) return true;
  // A reference to an ancestor covers its children: `tPlural("x.y")` reaches
  // `x.y.one`, and a `t("x.y")` on an array node reaches its entries.
  const parts = key.split(".");
  const ancestors: string[] = [];
  for (let i = parts.length - 1; i >= 2; i--) ancestors.push(parts.slice(0, i).join("."));
  for (const ancestor of ancestors) if (extraction.literals.has(ancestor)) return true;
  for (const rx of matchers) {
    if (rx.test(key)) return true;
    for (const ancestor of ancestors) if (rx.test(ancestor)) return true;
  }
  return false;
}

/* ─────────────────────────────── tests ─────────────────────────────── */

const catalog = readCatalog();
const extraction = extract(catalog);
const matchers = [...extraction.families.keys()].map(familyMatcher);

test("every t(\"literal.key\") call site resolves to copy in en.json", () => {
  // HARD FAILURE, no baseline. There were 13 of these when this guard landed
  // (10 of them one live bug: the public homepage location section read
  // `home.location.*` while the copy sat at `public.home.location.*`, so ten
  // raw dotted keys rendered on every tenant homepage that uses it). All 13
  // were fixed in the same commit, so the correct number is zero and a
  // regression is one line of diff away from being caught.
  const broken = extraction.calls.filter((c) => !resolvesToCopy(c.key, catalog));

  // De-duplicate by key+site so a key read in twelve places reports twelve
  // times (each is a separate screen) but a re-scan does not double-count.
  const seen = new Set<string>();
  const unique = broken.filter((c) => {
    const id = `${c.where}|${c.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  unique.sort((a, b) => a.where.localeCompare(b.where) || a.key.localeCompare(b.key));

  const shown = unique.slice(0, 40).map((c) => `  ${c.where}\n    t("${c.key}")`).join("\n");

  assert.equal(
    unique.length,
    0,
    unique.length === 0
      ? ""
      : `${unique.length} t() call site(s) name a key that messages/en.json does ` +
          `not resolve to a string. Each one renders the RAW DOTTED KEY to users ` +
          `in every locale (createTranslator returns the key on a miss).\n\n` +
          `Fix the call site to match where the copy actually lives, or add the ` +
          `key to en.json AND es.json (verify:ui-messages enforces the pair). Do ` +
          `NOT guess a destination: guessing which of two plausible namespaces ` +
          `was meant is exactly how #1113 shipped.\n\n${shown}` +
          (unique.length > 40 ? `\n  ...and ${unique.length - 40} more` : ""),
  );
});

test("no NEW catalog key is dead", () => {
  /*
   * RATCHET, not hard failure — chosen deliberately.
   *
   * 328 keys were already unreferenced when this guard landed: whole retired
   * surfaces (`admin.payouts.*`, `dashboard.clientOverview.*`), homepage copy
   * that moved into the builder tree (`public.home.hero.*`), and a long tail of
   * one-offs. Deleting 328 keys across en/es/fr as a side effect of adding a
   * test would be a large, unreviewable, product-visible diff — and holding the
   * guard back until that cleanup happened would leave the ACTUAL failure mode
   * (#1113's other half) ungated for however long that takes. So the baseline
   * starts working today and the list shrinks on its own schedule.
   *
   * The baseline is an explicit LIST, not a count: a count lets a new dead key
   * hide behind a deleted one. It turns both ways, exactly like the file-size
   * ratchet — a baseline entry that is no longer dead must be removed, so the
   * list cannot rot into a permanent amnesty.
   */
  const dead = [...catalog.leaves]
    .filter((key) => !isReferenced(key, extraction, matchers))
    .filter((key) => !RUNTIME_COMPOSED.has(key))
    .sort();

  const baseline = new Set(DEAD_MESSAGE_KEY_BASELINE);
  const added = dead.filter((k) => !baseline.has(k));
  const revived = [...baseline].filter((k) => !dead.includes(k)).sort();

  const problems: string[] = [];
  if (added.length > 0) {
    problems.push(
      `${added.length} catalog key(s) are newly DEAD — defined in messages/*.json ` +
        `and referenced nowhere in src/:\n` +
        added.slice(0, 40).map((k) => `  ${k}`).join("\n") +
        (added.length > 40 ? `\n  ...and ${added.length - 40} more` : "") +
        `\n\nUsually this means the reader points at a DIFFERENT key than the one ` +
        `you defined (that is bug #1113, and the companion test above will name ` +
        `the call site). If the copy is genuinely unused, delete it from en.json, ` +
        `es.json and fr.json. If it is composed at runtime in a way this guard ` +
        `cannot see, add it to RUNTIME_COMPOSED in ` +
        `src/i18n/message-key-usage.static.test.ts WITH a reason.`,
    );
  }
  if (revived.length > 0) {
    problems.push(
      `${revived.length} baseline entr(ies) are no longer dead. Remove them from ` +
        `DEAD_MESSAGE_KEY_BASELINE in src/i18n/message-key-usage-baseline.ts so ` +
        `the win is locked in instead of becoming headroom:\n` +
        revived.slice(0, 40).map((k) => `  ${k}`).join("\n") +
        (revived.length > 40 ? `\n  ...and ${revived.length - 40} more` : ""),
    );
  }

  assert.equal(problems.length, 0, problems.join("\n\n"));
});

test("the runtime-composed allow-list stays a decision, not a dumping ground", () => {
  for (const [key, reason] of RUNTIME_COMPOSED) {
    assert.ok(reason.trim().length > 20, `RUNTIME_COMPOSED entry "${key}" needs a real reason`);
    assert.ok(
      catalog.leaves.has(key),
      `RUNTIME_COMPOSED entry "${key}" is not a key in messages/en.json — delete it`,
    );
  }
  assert.ok(
    RUNTIME_COMPOSED.size < 40,
    "RUNTIME_COMPOSED is growing into a way to avoid the question; review it",
  );
});

test("the guard reports what it cannot statically see", () => {
  // Not a failure: dynamic `t()` is legitimate (enum labels, per-tier copy).
  // Printing the number is the point — a guard that silently ignores a category
  // teaches false confidence, which is worse than no guard.
  console.log(
    `[i18n-key-usage] ${extraction.calls.length} static t() call site(s) checked ` +
      `against ${catalog.leaves.size} catalog keys; ` +
      `${extraction.families.size} runtime-composed key family(ies) resolved from ` +
      `templates; ${extraction.dynamicCalls} t() call(s) across ` +
      `${extraction.dynamicFiles.size} file(s) take a key this guard CANNOT ` +
      `resolve and are therefore unchecked.`,
  );

  // Liveness: if the matchers ever break, every test above passes vacuously.
  assert.ok(extraction.calls.length > 5000, "extraction collapsed — the matcher broke, not the code");
  assert.ok(extraction.literals.size > 5000, "reference sweep collapsed — the matcher broke");
});

test("the extractor's own edge cases behave", () => {
  // A self-test, because the three tests above are only as true as these rules.
  assert.equal(stripComments('const a = 1; // t("x.y")\n'), "const a = 1; \n");
  assert.equal(stripComments('/* t("x.y") */const a = 1;'), "const a = 1;");
  assert.equal(stripComments('const s = "// not a comment";'), 'const s = "// not a comment";');
  assert.equal(decodeLiteral("a\\u00e9.b"), "aé.b");

  // Member calls are the editor-chrome system and must not be picked up.
  assert.equal([...'copy.t("a.b")'.matchAll(CALL_LITERAL)].length, 0);
  assert.equal([...'t("a.b")'.matchAll(CALL_LITERAL)].length, 1);
  // Space-bearing English literals are editor-chrome copy, not dashboard keys.
  assert.equal(KEY_SHAPE.test("This is a sentence."), false);
  assert.equal(KEY_SHAPE.test("dashboard.a.b"), true);

  // Plural nodes resolve; a plain object node does not.
  const fake: Catalog = {
    leaves: new Set(["a.b.one", "a.b.other", "c.d.desc"]),
    nodes: new Map([["a.b", ["one", "other"]], ["c.d", ["desc"]]]),
    namespaces: new Set(["a", "c"]),
  };
  assert.equal(resolvesToCopy("a.b", fake), true);
  assert.equal(resolvesToCopy("c.d", fake), false);

  // Family matching spans one segment per hole, and does not leak across dots.
  const rx = familyMatcher("dashboard.x.${tier}.${item}");
  assert.equal(rx.test("dashboard.x.studio.upTo50Talents"), true);
  assert.equal(rx.test("dashboard.x.studio"), false);
  assert.equal(rx.test("dashboard.x.studio.a.b"), false);
});
