/**
 * TUL-1708 (media folders, tags, download, library): the media WRITERS outside media/actions.ts (#4291) require their
 * capability so a `viewer` is refused: folder create/rename/add/remove, asset tags and notes (media.upload, editor+);
 * folder delete and the public share links (media.delete, manager+); the library PATCH and the watermark bake route
 * (media.upload). Reads keep the viewer default. Static wiring + the role matrix; NO baseline: an export that is
 * neither a listed writer nor a listed read fails by name.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const UP = "agency.site_admin.media.upload";
const DEL = "agency.site_admin.media.delete";
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

type Mod = { file: string; writers: Record<string, string>; reads: string[] };
const MODS: Mod[] = [
  {
    file: "src/app/(workspace)/[tenantSlug]/admin/media/folder-actions.ts",
    writers: {
      actionCreateMediaFolder: UP, actionRenameMediaFolder: UP, actionAddAssetsToFolder: UP, actionRemoveAssetsFromFolder: UP,
      actionSetAssetTags: UP, actionSetAssetNote: UP, actionDeleteMediaFolder: DEL, actionCreateFolderShareLink: DEL, actionRevokeFolderShareLink: DEL,
    },
    reads: ["actionListMediaFolders", "actionListFolderAssets", "actionGetWorkspaceTags", "actionGetAssetActivity"],
  },
  { file: "src/app/api/talent/media/library/route.ts", writers: { PATCH: UP }, reads: ["GET"] },
  { file: "src/app/api/admin/media/bake-watermark/route.ts", writers: { POST: UP }, reads: [] },
  { file: "src/app/(workspace)/[tenantSlug]/admin/media/stock-actions.ts", writers: {}, reads: ["actionListLifestyleStock"] },
  { file: "src/lib/server-actions/media-download.ts", writers: {}, reads: ["actionGetMediaDownloadLink"] },
  { file: "src/lib/server-actions/message-media.ts", writers: {}, reads: ["getMessageMediaUrl"] },
  { file: "src/lib/media/asset-assignments-actions.ts", writers: {}, reads: ["actionListAssetAssignments"] },
  { file: "src/lib/server-actions/admin-media-release.ts", writers: { actionDecideMediaReleaseRequest: "agency.roster.edit", actionRetryReleaseWatermarkBake: "agency.roster.edit", actionRevokeMediaRelease: "agency.roster.edit" }, reads: ["actionListMediaReleaseRequests", "actionListMediaReleaseHistory", "actionListReleaseBakeRepairs"] },
  { file: "src/lib/server-actions/admin-branding-media.ts", writers: {}, reads: ["actionListBrandingMedia"] },
];

const fns = (src: string) => [...src.matchAll(/export (?:async )?function (\w+)|export const (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => ({ name: (m[1] ?? m[2])!, at: m.index! }));
const bodyOf = (src: string, name: string) => {
  const ex = fns(src);
  const i = ex.findIndex((e) => e.name === name);
  assert.ok(i >= 0, `${name} not exported`);
  return src.slice(ex[i]!.at, i + 1 < ex.length ? ex[i + 1]!.at : src.length);
};

test("every media writer here requires its capability; every other export is a listed read", () => {
  for (const m of MODS) {
    const src = read(m.file);
    const known = new Set([...Object.keys(m.writers), ...m.reads]);
    const unlisted = fns(src).map((e) => e.name).filter((n) => !known.has(n) && !/^(authorize|require)/.test(n));
    assert.deepEqual(unlisted, [], `${m.file}: classify these exports (writer with a capability, or read)`);
    for (const [fn, cap] of Object.entries(m.writers)) {
      const body = bodyOf(src, fn);
      assert.match(body, new RegExp(`requireWorkspaceStaffAction\\(\\{ capability: "${cap.replace(/\./g, "\\.")}" \\}\\)`), `${m.file} ${fn} must require ${cap}`);
      assert.doesNotMatch(body, /requireWorkspaceStaffAction\(\s*\)/, `${fn} still has a capability-less guard`);
    }
    for (const fn of m.reads) assert.match(bodyOf(src, fn), /requireWorkspaceStaffAction\(\s*\)/, `${m.file} ${fn} is a read and keeps the viewer default`);
  }
});

test("behaviour on the role matrix: a viewer is refused; an editor uploads and tags; only manager and up delete or share", () => {
  for (const cap of [UP, DEL]) {
    assert.equal(roleGrantsCapability("viewer", cap as never), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap as never), true, `owner must hold ${cap}`);
  }
  assert.equal(roleGrantsCapability("editor", UP as never), true);
  assert.equal(roleGrantsCapability("editor", DEL as never), false);
  assert.equal(roleGrantsCapability("manager", DEL as never), true);
});
