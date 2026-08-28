/**
 * CONTRACT — the inquiry drawer pre-fills the event fields the guest chat
 * already collected, and pre-fills ONLY those.
 *
 * The guest chat modal and the directory inquiry drawer are one inquiry to the
 * visitor, but they had two persistence models:
 *
 *   chat    writes field-by-field via captureGuestChip into the draft's
 *           `interpreted_query`
 *   drawer  holds everything in local React state until submit — guest draft
 *           autosave is off (`enableDraftAutosave={false}`, and autosaveEnabled
 *           additionally requires client?.user_id)
 *
 * So a guest who told the chat their date and budget opened the drawer to an
 * empty form. The lineup never had this problem: both surfaces share
 * useInquiryCart -> PublicDiscoveryState -> saved_talent.
 *
 * This pins the READ half. Write-back is deliberately NOT implemented: it would
 * need guest autosave (currently off, and it looks deliberate — orphan drafts
 * and abuse surface) plus a rule for which surface wins a conflict. Prefill
 * loses nothing and needs neither.
 *
 * WHY ONLY FOUR SECTIONS: `talent` belongs to the shared lineup, and copying a
 * draft's copy of it would fight `bindToInquiryCart`. `requester`/`client` are
 * prefilled from the account, which is fresher. `source_context` must describe
 * the entry point being used NOW, not the one that created the draft — it is
 * what attribution reads.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const LOADER = path.join(process.cwd(), "src/lib/load-directory-inquiry-payload.ts");
const SHEET = path.join(process.cwd(), "src/components/directory/directory-inquiry-sheet.tsx");

test("the payload carries exactly the four event sections", () => {
  const src = readFileSync(LOADER, "utf8");

  const m = src.match(/export type CarriedDraftIntent = Pick<\s*InquiryIntent,([^>]*)>/);
  assert.ok(m, "expected a CarriedDraftIntent Pick<> of InquiryIntent");

  const picked = m[1]
    .split("|")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .sort();

  assert.deepEqual(
    picked,
    ["brief", "budget", "date", "location"],
    "CarriedDraftIntent changed. Adding `talent` fights the shared lineup, " +
      "`requester`/`client` are fresher from the account, and `source_context` " +
      "must describe the CURRENT entry point. See the header of this test.",
  );
});

test("only un-sent drafts are carried", () => {
  const src = readFileSync(LOADER, "utf8");
  const fn = src.slice(src.indexOf("async function loadCarriedDraftIntent"));
  assert.match(
    fn.slice(0, fn.indexOf("\n}")),
    /\.eq\("status", "draft"\)/,
    "the carry must filter to status='draft'. A submitted inquiry is finished " +
      "and must never bleed into a NEW inquiry the visitor is starting.",
  );
});

test("the carry is scoped to this guest AND this tenant", () => {
  const src = readFileSync(LOADER, "utf8");
  const fn = src.slice(src.indexOf("async function loadCarriedDraftIntent"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /\.eq\("guest_session_id", guestSessionId\)/, "must scope to the guest session");
  assert.match(body, /\.eq\("tenant_id", tenantId\)/, "must scope to the tenant — never carry across agencies");
});

test("the drawer spreads the carry BEFORE its explicit sections", () => {
  const src = readFileSync(SHEET, "utf8");
  const spread = src.indexOf("...(ready.carriedIntent");
  const requester = src.indexOf("requester: {", spread);
  const talent = src.indexOf("talent: {", spread);

  assert.ok(spread > 0, "the sheet must spread ready.carriedIntent into initialIntent");
  assert.ok(
    requester > spread && talent > spread,
    "the spread must come FIRST so requester/client (from the account) and " +
      "talent (from the shared lineup) always win over anything the draft carries.",
  );
});

const ACTIONS = path.join(
  process.cwd(),
  "src/app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions.ts",
);

test("a successful submit retires ONLY the carried draft, and safely", () => {
  const src = readFileSync(ACTIONS, "utf8");
  const i = src.indexOf("carried_draft_id");
  assert.ok(i > 0, "the submit action must read source_context.carried_draft_id");
  const block = src.slice(i, i + 1400);

  // Ownership lives in the WHERE — the id arrives from the client and must
  // never retire another guest's (or another tenant's) row.
  assert.match(block, /\.eq\("guest_session_id", ctx\.guestSessionId\)/,
    "retirement must be scoped to the submitting guest session");
  assert.match(block, /\.eq\("tenant_id", ctx\.tenantId\)/,
    "retirement must be scoped to the tenant");
  assert.match(block, /\.eq\("status", "draft"\)/,
    "only an un-sent draft may be retired — a submitted inquiry is immutable here");
  assert.match(block, /"cancelled"/,
    "retire via status='cancelled' — the one bucket getActiveGuestInquiry's " +
      "resume filter already drops, so the chat stops resuming the ghost");

  // A guest can hold several deliberate drafts (chat's "Start a separate
  // inquiry"), so there must be no blanket cancel of all drafts.
  assert.match(block, /\.eq\("id", carriedDraftId\)/,
    "retirement must target the ONE carried draft id, never all drafts");
});
