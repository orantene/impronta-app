import assert from "node:assert/strict";
import { test } from "node:test";
import { bannerDestinations, isWebsitePublished } from "./website-published-truth";

const dir = { id: "directory", label: "Tulala profile", href: "/t/x", enquiryTo: "A" };
const web = { id: "website", label: "Your website", href: "https://a.tulala.digital/", enquiryTo: "A" };

test("published when either the flow or the site row says so", () => {
  assert.equal(isWebsitePublished("published", null), true);
  assert.equal(isWebsitePublished("preview", "published"), true);
  assert.equal(isWebsitePublished("preview", "draft"), false);
  assert.equal(isWebsitePublished(undefined, undefined), false);
});

test("banner lists the website exactly when the pill says live", () => {
  assert.deepEqual(bannerDestinations([dir], true).map((d) => d.id), ["directory", "website"]);
  assert.deepEqual(bannerDestinations([dir, web], true).map((d) => d.id), ["directory", "website"]);
  assert.deepEqual(bannerDestinations([dir, web], false).map((d) => d.id), ["directory"]);
  assert.deepEqual(bannerDestinations([dir], false).map((d) => d.id), ["directory"]);
});
