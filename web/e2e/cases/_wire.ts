/**
 * Shared doors and ground-truth reads for the wiring verification suite.
 * Specs stay one control each; this file only names affordances and SQL.
 */
import type { Locator, Page } from "@playwright/test";

import { expect, JOURNEYS_SLUG, signInJourneysStaff } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

export const WIRE_SENTENCE = {
  cannotSave: "That cannot be saved.",
  pinInvalid: "That PIN is not right.",
  notManager: "Only a manager can do this.",
  notAllowed: "You do not have permission to do this.",
  alreadyLinked: "This sale is already linked to a booking.",
  alreadyCollected: "This sale is already collected.",
  exceedsOutstanding: "That is more than what is still owed.",
  linesPaid: "Paid lines cannot move.",
  expired: "This offer or link has expired.",
  overlappingRoom: "That room is already booked for this time.",
  soldOut: "There is no place left in that session.",
  alreadyCancelled: "That session is already cancelled.",
  notReschedulable: "This booking cannot be moved.",
  notCancellable: "This booking cannot be cancelled.",
  tokenInvalid: "This link is not valid anymore.",
  talentUnavailable: "That person is not free then.",
  notReopenable: "This project cannot be reopened.",
  alreadyDecided: "This request was already decided.",
  conflict: "This just changed. Reload and try again.",
  saleConflict: "This sale just changed. Reload and try again.",
  hasSpaces: "That zone still has tables on it.",
  lastLocation: "A workspace needs at least one location.",
  spaceOccupied: "That table already has a party.",
  twoActive: "This location already has an active layout.",
  overlap: "Those items overlap.",
  stationInUse: "That station still has tickets or items.",
  visitClosed: "This table visit has ended.",
  venueExpired: "That waitlist place has expired.",
  periodsOverlap: "Those service periods overlap.",
  seatTaken: "That seat is already taken.",
  sameSession: "That ticket is already for this night.",
  channelUnavailable: "That delivery channel is not available.",
  notFound: "That record is gone.",
  tooManyAttempts: "Too many tries. Wait and try again.",
  notReplayable: "That command cannot be saved offline.",
  alreadyClosed: "That shift is already closed.",
  past: "That date is already in the past.",
} as const;

export const ALL_POS_MODES = ["counter", "floor", "door", "classes", "projects"] as const;

export const VIEWER_EMAIL = "qa-journeys-viewer@impronta.test";
export const OWNER_PIN = "2468";
export const WRONG_PIN = "1111";

export async function pressKeypad(page: Page, digits: string): Promise<void> {
  const pad = page.locator("[data-pos-keypad]").last();
  await expect(pad).toBeVisible({ timeout: 20_000 });
  for (const d of digits) {
    await pad.getByRole("button", { name: d, exact: true }).click();
  }
}

export async function openCustomAmountSheet(page: Page): Promise<void> {
  await clickUntil(page.getByRole("button", { name: /custom amount/i }), page.locator("[data-pos-sheet='custom-amount']"));
}

/** Click a door until its target shows; the target is still the assertion. */
export async function clickUntil(door: Locator, target: Locator, timeout = 60_000): Promise<void> {
  await expect(door.first()).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await door.first().click();
    await expect(target.first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout, intervals: [500, 1_000, 2_000] });
}

/** Description is required — Continue stays disabled until both label and amount are set. */
export async function fillCustomAmount(page: Page, label: string, digits: string): Promise<void> {
  await page.locator("#pos-custom-what").fill(label);
  await pressKeypad(page, digits);
}

/**
 * People › Access › a person's row › hats panel › "Register PIN". The PIN box
 * only renders inside the panel of a person who has the Access hat.
 */
export async function openPersonPinBox(page: Page, personName: RegExp): Promise<Locator> {
  const accessTab = page.getByRole("navigation", { name: "People" }).getByRole("button", { name: /^Access/ });
  await expect(accessTab).toBeVisible({ timeout: 30_000 });
  const table = page.getByTestId("people-access-table");
  await expect(async () => {
    await accessTab.click();
    await expect(table).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000, intervals: [500, 1_000, 2_000] });
  const row = table.locator("tr[data-people-row]").filter({ hasText: personName }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button").first().click();
  const box = page.locator("aside [data-people-register-pin]").first();
  await expect(box).toBeVisible({ timeout: 20_000 });
  return box;
}

export async function assertEnglishRefusal(page: Page, sentence: string): Promise<void> {
  await expect(page.getByText(sentence, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
}

/**
 * The settings nav is a React `onClick`; a click that lands before hydration
 * only focuses the button and switches nothing (seen 2026-09-15 on the QA
 * host: nav read `[active]`, pane stayed on Account). Click until the pane
 * shows the card — the card itself is still the assertion.
 */
export async function openSettingsCard(page: Page, section: string, testId: string): Promise<void> {
  await signInJourneysStaff(page, `/${JOURNEYS_SLUG}/admin/settings`);
  await clickSettingsNav(page, section, page.getByTestId(testId));
}

export async function clickSettingsNav(page: Page, section: string, target: Locator): Promise<void> {
  const nav = page.getByRole("button", { name: section, exact: true });
  await expect(nav).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await nav.click();
    await expect(target.first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000, intervals: [500, 1_000, 2_000] });
}

export async function enableAllPosModes(page: Page): Promise<void> {
  await openSettingsCard(page, "Point of sale", "pos-modes-card");
  await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("pos-modes-platform-off")).toHaveCount(0);
  for (const mode of ALL_POS_MODES) {
    const row = page.getByTestId(`pos-mode-row-${mode}`);
    const sw = row.getByRole("switch");
    await expect(sw).toBeVisible({ timeout: 20_000 });
    if ((await sw.getAttribute("aria-checked")) !== "true") {
      await sw.click();
      await expect(page.getByTestId("pos-save-state")).toHaveAttribute("data-save-state", "saved", {
        timeout: 20_000,
      });
    }
  }
}

export async function readEnabledPosModes(): Promise<string[]> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("agencies")
    .select("settings")
    .eq("id", JOURNEYS_TENANT_ID)
    .maybeSingle();
  if (error) throw new Error(`readEnabledPosModes: ${error.message}`);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const pos = (settings.pos ?? {}) as Record<string, unknown>;
  const locations = (pos.locations ?? {}) as Record<string, unknown>;
  const def = (locations.default ?? {}) as Record<string, unknown>;
  return Array.isArray(def.modes) ? (def.modes as string[]) : [];
}

export async function readCustomAmountLimitCents(): Promise<number | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("agencies")
    .select("settings")
    .eq("id", JOURNEYS_TENANT_ID)
    .maybeSingle();
  if (error) throw new Error(`readCustomAmountLimitCents: ${error.message}`);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const pos = (settings.pos ?? {}) as Record<string, unknown>;
  const approval = (pos.approval ?? {}) as Record<string, unknown>;
  const raw = approval.custom_amount_limit_cents;
  return typeof raw === "number" ? raw : raw == null ? null : Number(raw);
}

export async function readStaffPinHashes(): Promise<Record<string, unknown>> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("agencies")
    .select("settings")
    .eq("id", JOURNEYS_TENANT_ID)
    .maybeSingle();
  if (error) throw new Error(`readStaffPinHashes: ${error.message}`);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const people = (settings.people ?? {}) as Record<string, unknown>;
  return { ...((people.pins ?? {}) as Record<string, unknown>) };
}

export async function staffPinIsHashed(userId: string): Promise<boolean> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("agencies")
    .select("settings")
    .eq("id", JOURNEYS_TENANT_ID)
    .maybeSingle();
  if (error) throw new Error(`staffPinIsHashed: ${error.message}`);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const people = (settings.people ?? {}) as Record<string, unknown>;
  const pins = (people.pins ?? {}) as Record<string, unknown>;
  const hash = pins[userId];
  return typeof hash === "string" && hash.length > 10 && !/^\d{4,6}$/.test(hash);
}

export async function latestOrderIdByUrl(page: Page): Promise<string> {
  const url = page.url();
  const match = /[?&]order=([0-9a-f-]{36})/i.exec(url);
  if (!match?.[1]) throw new Error(`no order id in ${url}`);
  return match[1];
}

/**
 * Ground truth for a custom line. `order_lines` has no approval column: a
 * line "needs approval" when its amount is over the workspace limit and
 * `pos_approvals` has no row for it (`lockedCustomLineIds`, custom-line.ts).
 */
export async function latestCustomLine(orderId: string): Promise<{
  id: string;
  kind: string | null;
  amountCents: number;
  needsApproval: boolean;
} | null> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("order_lines")
    .select("id, kind, unit_cents, total_cents")
    .eq("order_id", orderId)
    .eq("kind", "custom")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`latestCustomLine: ${error.message}`);
  if (!data) return null;
  const row = data as { id: string; kind: string | null; unit_cents: number | string; total_cents: number | string };
  const amountCents = Number(row.unit_cents ?? 0);
  const limit = (await readCustomAmountLimitCents()) ?? 0;
  const approvals = await countRows("pos_approvals", { line_id: row.id });
  return { id: row.id, kind: row.kind, amountCents, needsApproval: amountCents > limit && approvals === 0 };
}

export async function countRows(
  table: string,
  filter: Record<string, string | number | boolean>,
): Promise<number> {
  const sb = isolatedService();
  let q = sb.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) throw new Error(`countRows ${table}: ${error.message}`);
  return count ?? 0;
}

export async function readOrder(orderId: string): Promise<{
  id: string;
  status: string;
  tipCents: number;
  totalCents: number;
  sourceChannel: string | null;
}> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("orders")
    .select("id, status, tip_cents, total_cents, source_channel")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) throw new Error(`readOrder: ${error?.message ?? "missing"}`);
  const row = data as {
    id: string;
    status: string;
    tip_cents: number | string | null;
    total_cents: number | string;
    source_channel: string | null;
  };
  return {
    id: row.id,
    status: row.status,
    tipCents: Number(row.tip_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    sourceChannel: row.source_channel,
  };
}

export async function assertInboxGroundTruth(): Promise<void> {
  const sb = isolatedService();
  const { count, error } = await sb
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  if (error) throw new Error(`assertInboxGroundTruth: ${error.message}`);
  if ((count ?? 0) < 1) throw new Error("failed-fixture: no inquiries for Messages prototypes");
}

export async function openMessagesSurface(
  page: Page,
  path = "/admin/pos?view=messages",
): Promise<void> {
  await signInJourneysStaff(page, path);
  await expect(page.locator("[data-pos-messages=shell], [data-pos-messages=phone]").first()).toBeVisible({
    timeout: 20_000,
  });
}

export async function replyOnFirstThread(page: Page, body: string): Promise<void> {
  const row = page.locator("[data-pos-messages] li button").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(page.locator("[data-pos-messages='thread'], [data-pos-messages='phone-thread']")).toBeVisible({
    timeout: 20_000,
  });
  const input = page.getByRole("textbox", { name: "Reply", exact: true });
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill(body);
  await page.getByRole("button", { name: "Reply", exact: true }).last().click();
  // The write is the specs' own assertion (row in `inquiry_messages`); the
  // screen's confirmation is asserted by each prototype.
  await expect
    .poll(
      async () => {
        const { count } = await isolatedService().from("inquiry_messages").select("id", { count: "exact", head: true }).eq("tenant_id", JOURNEYS_TENANT_ID).eq("body", body);
        return count ?? 0;
      },
      { timeout: 20_000, message: "the reply row lands" },
    )
    .toBe(1);
}

/**
 * Actions › Send options. The menu is bound to the viewport and scrolls
 * (D-144), so the row is reached with a REAL click: no dispatched handler,
 * because a row a person cannot click is the defect this door proves fixed.
 */
export async function openSendOptions(page: Page): Promise<void> {
  await page.getByRole("button", { name: /actions/i }).click();
  const menu = page.locator("[data-pos-actions-menu]");
  await expect(menu).toBeVisible({ timeout: 20_000 });
  const box = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(box, "the menu is drawn").toBeTruthy();
  expect(box!.y, "the menu's top edge is on screen").toBeGreaterThanOrEqual(0);
  if (viewport) expect(box!.y + box!.height, "the menu's bottom edge is on screen").toBeLessThanOrEqual(viewport.height);
  const row = page.getByRole("button", { name: /send options/i });
  await expect(row).toBeAttached({ timeout: 20_000 });
  await row.scrollIntoViewIfNeeded();
  await row.click({ timeout: 10_000 });
  await expect(page.locator("[data-pos-sheet='messages-options']")).toBeVisible({ timeout: 20_000 });
}

export async function ownerUserId(): Promise<string> {
  const sb = isolatedService();
  const { data, error } = await sb
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) throw new Error(`ownerUserId: ${error?.message ?? "missing"}`);
  return (data as { profile_id: string }).profile_id;
}
