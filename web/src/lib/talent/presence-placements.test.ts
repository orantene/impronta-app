import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applicationTimeline,
  displayUrl,
  filterNetworks,
  instagramBioLine,
  networkPrimaryAction,
  placementControl,
  placementStatus,
  placementSummary,
  qrFileName,
  splitPlacements,
  whatsappShareUrl,
} from "./presence-placements";
import { PRESENCE_ES_TEXT } from "../../components/talent/studio/presence-es-text";

test("an unpublished agency roster is never reported as live", () => {
  assert.equal(placementStatus("live", false), "not_published");
  assert.equal(placementStatus("agency_hidden", true), "not_published");
  assert.equal(placementStatus("live", true), "live");
  assert.equal(placementStatus("you_hid", true), "hidden_by_you");
  assert.equal(placementStatus("removed", true), "unavailable");
});

test("hub rows hide and show; agency rows can only be asked about; Tulala row has no control", () => {
  assert.equal(placementControl("hub", "live"), "hide");
  assert.equal(placementControl("hub", "hidden_by_you"), "show_again");
  assert.equal(placementControl("hub", "hidden_everywhere"), "none");
  assert.equal(placementControl("agency", "live"), "request_change");
  assert.equal(placementControl("agency", "unavailable"), "none");
  assert.equal(placementControl("tulala", "live"), "none");
});

test("summary splits live listings from other connections, EN and ES", () => {
  const rows = [{ status: "live" as const }, { status: "live" as const }, { status: "pending" as const }];
  const { live, other } = splitPlacements(rows);
  assert.equal(live.length, 2);
  assert.equal(other.length, 1);
  assert.equal(placementSummary(2, 1), "2 live listings · 1 other connection");
  assert.equal(placementSummary(1, 0, true), "1 ficha activa");
});

test("share helpers keep one exact address", () => {
  const url = "https://tulala.digital/t/jor-beauty";
  assert.equal(displayUrl(url), "tulala.digital/t/jor-beauty");
  assert.ok(whatsappShareUrl(url, "Book with me").startsWith("https://wa.me/?text="));
  assert.ok(decodeURIComponent(whatsappShareUrl(url, "Hi")).endsWith(url));
  assert.equal(instagramBioLine(url), "Book with me → tulala.digital/t/jor-beauty");
  assert.equal(qrFileName(url, "png"), "qr-tulala-digital-t-jor-beauty.png");
});

test("a joined network never offers Join again", () => {
  assert.equal(networkPrimaryAction("open", "none"), "join");
  assert.equal(networkPrimaryAction("apply", "none"), "apply");
  assert.equal(networkPrimaryAction("invite", "none"), "invite_only");
  assert.equal(networkPrimaryAction("open", "joined"), "none");
  assert.equal(networkPrimaryAction("apply", "pending"), "none");
});

test("filters by membership and text", () => {
  const list = [
    { name: "A Beauty", city: "Cancún", summary: "nails", access: "open" as const },
    { name: "B Makers", city: "Playa", summary: "makers", access: "apply" as const },
  ];
  assert.equal(filterNetworks(list, { query: "", access: "any" }).length, 2);
  assert.equal(filterNetworks(list, { query: "playa", access: "any" })[0]!.name, "B Makers");
  assert.equal(filterNetworks(list, { query: "", access: "open" }).length, 1);
});

test("accepted and live are separate lines; no date is invented", () => {
  const accepted = applicationTimeline("approved");
  assert.deepEqual(accepted.steps.map((s) => s.done), [true, true, false]);
  assert.match(accepted.next ?? "", /No date given/);
  assert.equal(applicationTimeline("rejected").next, null);
  assert.equal(applicationTimeline("pending").steps.length, 2);
});

test("every presence string has Spanish and no em dash", () => {
  for (const [en, es] of Object.entries(PRESENCE_ES_TEXT)) {
    assert.ok(es.trim(), `missing ES for ${en}`);
    assert.ok(!en.includes("—") && !es.includes("—"), `em dash in ${en}`);
  }
});
