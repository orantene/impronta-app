import assert from "node:assert/strict";
import { test } from "node:test";

import type { PostWriterActions } from "@/lib/cms/post-writer-types";
import type { PostWriterActionResult } from "@/lib/server-actions/posts-writer-actions";
import { makeLazyCreateActions, type CreateDraft } from "./new-post-actions";

type Rec = { id: string };

function okRecord(id: string): PostWriterActionResult {
  return { ok: true, data: { id } as unknown as Extract<PostWriterActionResult, { ok: true }>["data"] };
}

function setup() {
  const calls: string[] = [];
  const created: string[] = [];
  const base: PostWriterActions = {
    save: async (i: Rec) => (calls.push(`save:${i.id}`), okRecord(i.id)),
    updateSettings: async (i: Rec) => (calls.push(`settings:${i.id}`), okRecord(i.id)),
    publish: async (i: Rec) => (calls.push(`publish:${i.id}`), okRecord(i.id)),
    unpublish: async (i: Rec) => (calls.push(`unpublish:${i.id}`), okRecord(i.id)),
  };
  const create: CreateDraft = async () => (calls.push("create"), okRecord("new-1"));
  const actions = makeLazyCreateActions({ base, create, postLocale: "es", onCreated: (id) => created.push(id) });
  return { calls, created, actions };
}

test("nothing is created until an action runs", () => {
  const { calls } = setup();
  assert.deepEqual(calls, []);
});

test("first save creates with the typed values and does not save twice", async () => {
  const { calls, created, actions } = setup();
  const res = await actions.save({ id: "", title: "Hola" });
  assert.equal(res.ok, true);
  assert.deepEqual(calls, ["create"]);
  assert.deepEqual(created, ["new-1"]);
  await actions.save({ id: "new-1", title: "Hola 2" });
  assert.deepEqual(calls, ["create", "save:new-1"]);
});

test("a settings change before any typing creates the draft once, then applies", async () => {
  const { calls, actions } = setup();
  await actions.updateSettings({ id: "", patch: {} });
  await actions.publish({ id: "" });
  assert.deepEqual(calls, ["create", "settings:new-1", "publish:new-1"]);
});
