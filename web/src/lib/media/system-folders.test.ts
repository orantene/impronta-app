import assert from "node:assert/strict";
import test from "node:test";

import {
  BRANDING_FOLDER,
  LIFESTYLE_FOLDER,
  ensureSystemFolder,
  fileAssetInSystemFolder,
} from "./system-folders";

/**
 * A Supabase stand-in with just enough shape for these paths: a `media_folders`
 * table that can be told to lose the insert race, and a `media_folder_items`
 * upsert recorder.
 */
function fakeAdmin(options: {
  existingFolderId?: string | null;
  /** Simulate the unique-violation race: insert fails, re-select finds a row. */
  raceWinnerId?: string;
  insertedId?: string;
}) {
  const calls = { selects: 0, inserts: 0, upserts: [] as Array<Record<string, unknown>> };
  let selectCount = 0;

  const folderSelect = () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => {
            selectCount += 1;
            calls.selects = selectCount;
            // First select = the pre-insert lookup. Second = the post-race one.
            if (selectCount === 1) {
              return { data: options.existingFolderId ? { id: options.existingFolderId } : null };
            }
            return { data: options.raceWinnerId ? { id: options.raceWinnerId } : null };
          },
        }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: async () => {
          calls.inserts += 1;
          if (options.insertedId) return { data: { id: options.insertedId }, error: null };
          return { data: null, error: { message: "duplicate key value" } };
        },
      }),
    }),
  });

  const admin = {
    from(table: string) {
      if (table === "media_folders") return folderSelect() as never;
      if (table === "media_folder_items") {
        return {
          upsert: async (row: Record<string, unknown>) => {
            calls.upserts.push(row);
            return { error: null };
          },
        } as never;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { admin: admin as never, calls };
}

test("an existing system folder is reused, never duplicated", async () => {
  const { admin, calls } = fakeAdmin({ existingFolderId: "folder-1" });
  const id = await ensureSystemFolder(admin, "tenant-1", LIFESTYLE_FOLDER, "user-1");
  assert.equal(id, "folder-1");
  assert.equal(calls.inserts, 0, "a second folder must never be created for the same key");
});

test("first use creates the folder", async () => {
  const { admin, calls } = fakeAdmin({ existingFolderId: null, insertedId: "folder-new" });
  const id = await ensureSystemFolder(admin, "tenant-1", LIFESTYLE_FOLDER, "user-1");
  assert.equal(id, "folder-new");
  assert.equal(calls.inserts, 1);
});

test("losing the insert race returns the winner's folder, not an error", async () => {
  // Two concurrent first-uses: the unique index rejects the loser's insert.
  // Re-selecting is what keeps an upload from failing for a reason the
  // operator could never act on.
  const { admin } = fakeAdmin({ existingFolderId: null, raceWinnerId: "folder-winner" });
  const id = await ensureSystemFolder(admin, "tenant-1", LIFESTYLE_FOLDER, "user-1");
  assert.equal(id, "folder-winner");
});

test("filing an asset writes a folder-items row for the resolved folder", async () => {
  const { admin, calls } = fakeAdmin({ existingFolderId: "folder-1" });
  const folderId = await fileAssetInSystemFolder(admin, {
    tenantId: "tenant-1",
    assetId: "asset-9",
    spec: LIFESTYLE_FOLDER,
    addedBy: "user-1",
  });
  assert.equal(folderId, "folder-1");
  assert.deepEqual(calls.upserts, [
    { folder_id: "folder-1", asset_id: "asset-9", added_by: "user-1" },
  ]);
});

test("the two system folders stay distinct", () => {
  // A shared key would make branding uploads and generated lifestyle imagery
  // land in the same folder — the exact thing this separation exists to stop.
  assert.notEqual(BRANDING_FOLDER.systemKey, LIFESTYLE_FOLDER.systemKey);
  assert.notEqual(BRANDING_FOLDER.color, LIFESTYLE_FOLDER.color);
  assert.equal(LIFESTYLE_FOLDER.name, "Lifestyle");
});
