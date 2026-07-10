/**
 * Guest-chat lifecycle E2E (Message Panel 360, Wave 0 — lane W0-I).
 *
 * Locks the Wave-0 acceptance walk so later waves cannot silently regress it:
 *   - draft RESUME (re-open + reload keeps ONE draft/thread, no duplicate),
 *   - HONEST launcher pill (a draft never reads "Inquiry sent"),
 *   - COALESCED "Lineup · N talent" system note (exactly one, no stacks),
 *   - the contact GATE + the SENT beat + post-send FREEZE (the "Send to agency"
 *     affordance disappears once the inquiry is sent).
 *
 * Targets the LOCAL tenant proxy (Host-gated -> the Impronta tenant), NOT the
 * default app.local host, because the guest chat + `/api/dev/reset-guest` only
 * behave against a real tenant + dev server. The dev server is webpack, so first
 * compiles are slow -> generous action/navigation timeouts below.
 *
 * Run (dev on :3000, tenant proxy on :3114 already up):
 *
 *   cd web
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 \
 *     PLAYWRIGHT_BASE_URL=http://localhost:3114 \
 *     npx playwright test e2e/guest-chat-lifecycle.spec.ts --project=chromium
 *
 * NOT in CI (no Supabase / no tenant proxy there; lane parity list is untouched).
 *
 * WHY TWO TESTS (not the one 7-step walk): reloading a still-DRAFT inquiry
 * client-promotes it (use-unified-inquiry.ts inits `contactPromoted` from
 * `Boolean(existingInquiryId)` and never resets from the server's authoritative
 * `contactPromoted:false`), so after a reload the draft-privacy banner and the
 * "Send to agency" affordance are gone and the contact gate is never presented.
 * That makes the send/gate/freeze walk impossible to run *after* the resume, so
 * the resume-dedup walk (Test A, task steps 1-5) and the send-freeze walk
 * (Test B, task steps 6-7) each run on their own fresh guest. See the run report
 * for the finding. Each test uses a fresh Playwright context (the default).
 *
 * Side effect (expected + accepted): Test B creates one clearly-marked QA inquiry
 * in the shared DB under contact `qa-w0-e2e@impronta.test`. Do NOT delete DB rows.
 */

import { test, expect, type Page } from "@playwright/test";

// The dev server is webpack; first compiles of /directory + the chat launcher
// are slow, so every action/navigation gets a long ceiling.
test.use({ actionTimeout: 120_000, navigationTimeout: 120_000 });

const ASSERT = { timeout: 30_000 } as const;

/** The launcher pill text while a lineup exists: "Your lineup (N)". */
const LINEUP_PILL = /Your lineup/;
/** The dishonest label a DRAFT must NEVER show. */
const SENT_PILL = /Inquiry sent/;
/** The coalesced system note. Exactly ONE must exist per inquiry. */
const LINEUP_NOTE = /^Lineup · \d+ talent$/;
/** The private-draft banner (present only pre-send). */
const DRAFT_BANNER = /Draft\. Only you can see this\./;
/** The post-send beat (airlock/receipt: "{agency} has your inquiry."). */
const SENT_BEAT = /has your inquiry|Inquiry sent/i;

/** The chat panel is a role=dialog labelled "Message {agency}" (never a bare
 *  dialog: an unrelated closed dialog also lives in the directory DOM). */
function chatPanel(page: Page) {
  return page.getByRole("dialog", { name: /^Message/ });
}

/** The floating launcher pill, matched by its ACCESSIBLE NAME. The aria-label
 *  stays "Your lineup (N)" even while the panel is open (the visible text flips
 *  to "Close"), so role+name is stable across open/closed. */
function lineupPill(page: Page) {
  return page.getByRole("button", { name: LINEUP_PILL }).first();
}

/**
 * Reset the guest session (belt-and-braces on top of the fresh context), then go
 * to the directory and add two DISTINCT talents, each verified as added (the
 * card control flips to aria-pressed=true). Leaves the honest pill assertion to
 * the caller. Returns nothing; the guest now has a two-talent lineup.
 */
async function seedLineup(page: Page): Promise<void> {
  const res = await page.request.post("/api/dev/reset-guest");
  expect(res.status(), "reset-guest should be dev/staff-allowed").toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  await page.goto("/directory", { waitUntil: "domcontentloaded" });

  // The per-card inquiry control is the canonical TalentCardActions button
  // (`data-card-inquiry-toggle`), present in every card variant.
  const toggles = page.locator("[data-card-inquiry-toggle]");
  await toggles.first().waitFor({ state: "visible", timeout: 120_000 });
  expect(
    await toggles.count(),
    "directory should render at least three talent cards",
  ).toBeGreaterThanOrEqual(3);

  await addTalent(page, 0);
  await addTalent(page, 2);
}

/** Add a directory talent by card index, verifying the add registered (the
 *  control flips to aria-pressed=true). force: the control is hover-revealed over
 *  the card photo and a sticky header/overlay intercepts hit-testing. */
async function addTalent(page: Page, index: number): Promise<void> {
  const btn = page.locator("[data-card-inquiry-toggle]").nth(index);
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
  await expect(btn).toHaveAttribute("aria-pressed", "true", ASSERT);
}

/**
 * Open the chat panel robustly. The panel may already be open (adding a talent
 * can auto-open it), so no-op when it is. The launcher pill can be occluded by
 * the overhanging avatar stack (a known issue fixed in a later wave), so open it
 * via a direct DOM click on the button element rather than a hit-tested click.
 */
async function openPanel(page: Page): Promise<void> {
  const panel = chatPanel(page);
  if (await panel.isVisible().catch(() => false)) return;
  const pill = lineupPill(page);
  await pill.waitFor({ state: "visible", timeout: 120_000 });
  // evaluate().click(): bypass the overhanging-avatar occluder entirely.
  await pill.evaluate((el) => (el as HTMLButtonElement).click());
  await panel.waitFor({ state: "visible", timeout: 120_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test A — draft RESUME dedup + honest pill (task steps 1-5).
// ─────────────────────────────────────────────────────────────────────────────

test("draft resume keeps one thread + coalesced note + honest pill", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await test.step("1-2. reset + add two talents; the pill is honest", async () => {
    await seedLineup(page);
    // The floating launcher reads the honest lineup label and NEVER the
    // dishonest "Inquiry sent" while this is still a private draft.
    await expect(lineupPill(page)).toBeVisible(ASSERT);
    await expect(
      page.getByRole("button", { name: SENT_PILL }),
      'a DRAFT must never read "Inquiry sent"',
    ).toHaveCount(0);
  });

  await test.step("3. open panel; the private-draft banner renders", async () => {
    await openPanel(page);
    await expect(page.getByText(DRAFT_BANNER)).toBeVisible(ASSERT);
  });

  await test.step("4. exactly ONE coalesced lineup note", async () => {
    const note = page.getByText(LINEUP_NOTE);
    // Allow time for the debounced chip write + the ~4s thread poll to surface it.
    await expect(note.first()).toBeVisible(ASSERT);
    await expect(
      note,
      "the lineup note must be coalesced into a single row (no stacks)",
    ).toHaveCount(1);
  });

  await test.step("5. reload; resume finds the SAME draft (one note, honest pill)", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });

    // The pill survives the reload (cart restored from the guest session) and
    // still reads the honest lineup label, never "Inquiry sent".
    await expect(lineupPill(page)).toBeVisible(ASSERT);
    await expect(
      page.getByRole("button", { name: SENT_PILL }),
      "a resumed DRAFT must never read Inquiry sent",
    ).toHaveCount(0);

    await openPanel(page);

    // No duplicate draft/thread was created by the resume: still exactly one note.
    const note = page.getByText(LINEUP_NOTE);
    await expect(note.first()).toBeVisible(ASSERT);
    await expect(
      note,
      "resume must find the existing draft, not spawn a duplicate",
    ).toHaveCount(1);

    // W0 follow-up: a resumed UNSENT draft keeps its DRAFT framing. The server
    // now reports contactPromoted on resume (getActiveGuestInquiry), so the
    // privacy banner and the "Send to agency" affordance survive the reload —
    // previously the client assumed any resumed id was promoted and a returning
    // guest could neither see the draft state nor send it through the gate.
    await expect(
      page.getByText(/Draft\. Only you can see this\./),
      "a resumed unsent draft must keep the draft privacy banner",
    ).toBeVisible(ASSERT);
    await expect(
      page.getByRole("button", { name: "Send to agency" }),
      "a resumed unsent draft must still offer Send to agency",
    ).toBeVisible(ASSERT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test B — contact GATE + SENT beat + post-send FREEZE (task steps 6-7).
// Runs on its own fresh draft (see the file header for why it cannot chain off
// Test A's reload).
// ─────────────────────────────────────────────────────────────────────────────

test("draft send: contact gate -> sent beat -> send-to-agency freeze", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await test.step("build a fresh two-talent draft and open it", async () => {
    await seedLineup(page);
    await openPanel(page);
    // The early row has to exist (draft banner) before the "Send to agency"
    // submit + gate are meaningful.
    await expect(page.getByText(DRAFT_BANNER)).toBeVisible(ASSERT);
    await expect(
      page.getByText(LINEUP_NOTE),
      "the lineup note must be coalesced into a single row",
    ).toHaveCount(1);
  });

  await test.step("6. send via the contact gate; the sent beat plays", async () => {
    // Type the first message in the composer (a draft-stage "Write a reply…").
    const composer = page.getByPlaceholder(/Write a reply/);
    await composer.waitFor({ state: "visible", timeout: 120_000 });
    await composer.fill("E2E QA W0 lifecycle run - please ignore");

    // The explicit "Send to agency" submit forces the contact gate (the composer
    // send alone would not fire the sent-airlock confirmation beat).
    await page.getByRole("button", { name: "Send to agency" }).click();

    // Contact gate: name + email. Placeholders are unique to the gate form
    // (the account toolkit's email field uses "name@example.com").
    await page.getByPlaceholder("First name").fill("QA W0 E2E");
    await page.getByPlaceholder("Email", { exact: true }).fill("qa-w0-e2e@impronta.test");
    await page.getByRole("button", { name: "Send message" }).click();

    // The sent beat: the airlock/receipt reads "{agency} has your inquiry."
    await expect(page.getByText(SENT_BEAT).first()).toBeVisible(ASSERT);
    // The draft is now sent, so its private-draft banner is gone.
    await expect(page.getByText(DRAFT_BANNER)).toHaveCount(0);
  });

  await test.step("7. post-send freeze — the send affordance is gone", async () => {
    await expect(
      page.getByRole("button", { name: "Send to agency" }),
      "a sent inquiry must not re-expose the draft submit",
    ).toHaveCount(0);
    // The lineup note stayed coalesced through the send (no fresh stack).
    await expect(page.getByText(LINEUP_NOTE)).toHaveCount(1);
  });
});
