/**
 * 2.8 Amendment send / discard (W46, Project › Agreement).
 * Ground truth: `inquiry_offers` — Send moves the draft to `sent` (one active
 * offer per conversation); Discard moves it to `superseded`. Refusal: a send
 * carrying a stale conversation version → `conflict`, and the draft stays.
 *
 * SEEDED: a draft v(n+1) on a project whose v(n) is accepted, for each half.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE } from "./_wire";

skipUnlessFixture();

type Project = { id: string; inquiryId: string; acceptedVersion: number; acceptedId: string };

async function projectsWithAcceptedOffer(count: number): Promise<Project[]> {
  const sb = isolatedService();
  const { data } = await sb
    .from("agency_bookings")
    .select("id, source_inquiry_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "confirmed")
    .not("source_inquiry_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const out: Project[] = [];
  for (const b of (data ?? []) as { id: string; source_inquiry_id: string }[]) {
    const { data: offers } = await sb.from("inquiry_offers").select("id, version, status").eq("inquiry_id", b.source_inquiry_id).order("version", { ascending: false });
    const rows = (offers ?? []) as { id: string; version: number; status: string }[];
    const live = rows.find((o) => o.status === "draft" || o.status === "sent");
    const accepted = rows.find((o) => o.status === "accepted");
    if (!live && accepted) out.push({ id: b.id, inquiryId: b.source_inquiry_id, acceptedVersion: accepted.version, acceptedId: accepted.id });
    if (out.length === count) break;
  }
  if (out.length < count) throw new Error(`failed-fixture: need ${count} projects with an accepted offer and no live amendment`);
  return out;
}

/**
 * `inquiry_offers_one_active_offer` counts `accepted` as occupying the slot,
 * so a draft amendment can only exist once the accepted row has stepped
 * aside (the record's own reading, `project-record.ts`); the seed parks the
 * accepted row as `superseded` and the cleanup restores it.
 */
async function seedDraft(p: Project): Promise<string> {
  const sb = isolatedService();
  const park = await sb.from("inquiry_offers").update({ status: "superseded" }).eq("id", p.acceptedId);
  if (park.error) throw new Error(`seedDraft/park: ${park.error.message}`);
  const { data, error } = await sb
    .from("inquiry_offers")
    .insert({
      tenant_id: JOURNEYS_TENANT_ID,
      inquiry_id: p.inquiryId,
      version: p.acceptedVersion + 1,
      status: "draft",
      total_client_price: 850,
      coordinator_fee: 0,
      currency_code: "USD",
      notes: "WIRE-2.8 amendment",
      created_by_user_id: "33330001-0000-4000-8000-000000000001",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedDraft: ${error?.message ?? "none"}`);
  const offerId = (data as { id: string }).id;
  // An offer with no line is `empty_offer` to the sender; copy the accepted row's line.
  const { data: lines } = await sb
    .from("inquiry_offer_line_items")
    .select("talent_profile_id, label, pricing_unit, units, unit_price, total_price, talent_cost, sort_order, source_service_id, owner_tenant_id")
    .eq("offer_id", p.acceptedId);
  const copies = ((lines ?? []) as Record<string, unknown>[]).map((l) => ({ ...l, offer_id: offerId, tenant_id: JOURNEYS_TENANT_ID, unit_price: 850, total_price: 850 }));
  if (copies.length === 0) throw new Error("failed-fixture: the accepted offer has no line to copy");
  const ins = await sb.from("inquiry_offer_line_items").insert(copies);
  if (ins.error) throw new Error(`seedDraft/lines: ${ins.error.message}`);
  return offerId;
}

test("WIRE-2.8 Agreement: a stale send is refused, a fresh send goes out, a draft can be discarded", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const [a, b] = await projectsWithAcceptedOffer(2);
  const draftA = await seedDraft(a);
  const draftB = await seedDraft(b);
  const offerStatus = async (id: string) => {
    const { data } = await sb.from("inquiry_offers").select("status, sent_at").eq("id", id).maybeSingle();
    return data as { status: string; sent_at: string | null } | null;
  };
  try {
    await signInJourneysStaff(page, `/admin/projects/${a.id}?tab=scope`);
    const block = page.locator(`[data-project-amendment="${draftA}"]`);
    await expect(block, "the draft amendment carries Send / Discard").toBeVisible({ timeout: 30_000 });

    // Stale: the conversation moved under this screen.
    const { data: inq } = await sb.from("inquiries").select("version").eq("id", a.inquiryId).maybeSingle();
    const v = Number((inq as { version: number }).version);
    const bump = await sb.from("inquiries").update({ version: v + 1 }).eq("id", a.inquiryId);
    expect(bump.error, bump.error?.message).toBeNull();
    await block.locator("[data-amendment-send]").click();
    await expect(block.getByRole("status")).toHaveText(WIRE_SENTENCE.conflict, { timeout: 30_000 });
    expect((await offerStatus(draftA))?.status).toBe("draft");

    // Fresh: reload, then send.
    await page.reload();
    const fresh = page.locator(`[data-project-amendment="${draftA}"]`);
    await expect(fresh).toBeVisible({ timeout: 30_000 });
    await fresh.locator("[data-amendment-send]").click();
    await expect(page.locator(`[data-project-amendment="${draftA}"]`)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Awaiting client acceptance", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await offerStatus(draftA))?.status, { timeout: 20_000 }).toBe("sent");
    expect((await offerStatus(draftA))?.sent_at).toBeTruthy();
    const { count: active } = await sb.from("inquiry_offers").select("id", { count: "exact", head: true }).eq("inquiry_id", a.inquiryId).in("status", ["draft", "sent"]);
    expect(active, "one active offer on the conversation").toBe(1);

    // Discard on the second project.
    await page.goto(`/admin/projects/${b.id}?tab=scope`);
    const blockB = page.locator(`[data-project-amendment="${draftB}"]`);
    await expect(blockB).toBeVisible({ timeout: 30_000 });
    await blockB.locator("[data-amendment-discard]").click();
    await expect(page.locator(`[data-project-amendment="${draftB}"]`)).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => (await offerStatus(draftB))?.status, { timeout: 20_000 }).toBe("superseded");
  } finally {
    // A sent draft is the conversation's current offer and occupies the
    // one-active slot: step it aside, point the conversation back at its
    // accepted version, restore that version, then remove the seeds.
    await sb.from("inquiry_offers").update({ status: "superseded" }).in("id", [draftA, draftB]);
    await sb.from("inquiries").update({ status: "booked", current_offer_id: a.acceptedId }).eq("id", a.inquiryId);
    await sb.from("inquiries").update({ status: "booked", current_offer_id: b.acceptedId }).eq("id", b.inquiryId);
    await sb.from("inquiry_offers").update({ status: "accepted" }).in("id", [a.acceptedId, b.acceptedId]);
    await sb.from("inquiry_offer_line_items").delete().in("offer_id", [draftA, draftB]);
    await sb.from("inquiry_offers").delete().in("id", [draftA, draftB]);
  }
});
