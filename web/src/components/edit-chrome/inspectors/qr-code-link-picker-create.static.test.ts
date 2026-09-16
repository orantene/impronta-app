import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * The `qr_code` inspector could only PICK a link, and `public.links` starts
 * empty, so no workspace could ever mint its first `/q/<code>` from the
 * product (the QR & Links deadlock). "Create a link" is that first writer.
 * Pinned statically: the picker mounts the disclosure, the disclosure calls
 * the guarded action (never the store), and a minted link is selected.
 */
const here = path.dirname(new URL(import.meta.url).pathname);
const picker = readFileSync(path.join(here, "qr-code-link-picker.tsx"), "utf8");
const actions = readFileSync(path.join(here, "../../../lib/site-admin/links/actions.ts"), "utf8");

test("the picker offers Create a link and selects what it minted", () => {
  assert.match(picker, /mintLinkAction/);
  assert.match(picker, /data-testid="qr-create-link-open"/);
  assert.match(picker, /onPick\(link\.code\)/);
  assert.doesNotMatch(picker, /from "@\/lib\/links\/link-store"[^;]*createLink/, "the client never imports the store writer");
});

test("mintLinkAction is capability-gated and takes the tenant from the guard", () => {
  const body = actions.slice(actions.indexOf("export async function mintLinkAction"));
  assert.match(body, /requireWorkspaceStaffAction\(\{\s*capability: "agency\.site_admin\.pages\.edit"/);
  assert.match(body, /tenantId: guard\.tenantId/);
  assert.doesNotMatch(body, /input\.tenantId/);
});
