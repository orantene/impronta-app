import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeOtherEditors } from "./summarize-other-editors";

test("same userId peers count as my other tabs", () => {
  const editors = [
    { id: "tab-a", name: "Oran", userId: "u1", isSelf: true },
    { id: "tab-b", name: "Oran", userId: "u1", isSelf: false },
  ];
  const others = editors.filter((e) => !e.isSelf);
  assert.deepEqual(summarizeOtherEditors(editors, others), {
    peopleNames: [],
    myOtherTabs: 1,
  });
});

test("pre-auth ghost 'You' (both null userId) counts as my other tab", () => {
  const editors = [
    { id: "tab-a", name: "You", userId: null, isSelf: true },
    { id: "tab-ghost", name: "You", userId: null, isSelf: false },
  ];
  const others = editors.filter((e) => !e.isSelf);
  assert.deepEqual(summarizeOtherEditors(editors, others), {
    peopleNames: [],
    myOtherTabs: 1,
  });
});

test("null-ID peer named You is NOT hidden once self auth resolved", () => {
  // Another editor may publish before their getUser() completes — must stay visible.
  const editors = [
    { id: "tab-a", name: "Oran", userId: "u1", isSelf: true },
    { id: "tab-peer", name: "You", userId: null, isSelf: false },
  ];
  const others = editors.filter((e) => !e.isSelf);
  assert.deepEqual(summarizeOtherEditors(editors, others), {
    peopleNames: ["You"],
    myOtherTabs: 0,
  });
});

test("null-ID peer matching self display name is still a person", () => {
  const editors = [
    { id: "tab-a", name: "Oran", userId: "u1", isSelf: true },
    { id: "tab-peer", name: "Oran", userId: null, isSelf: false },
  ];
  const others = editors.filter((e) => !e.isSelf);
  assert.deepEqual(summarizeOtherEditors(editors, others), {
    peopleNames: ["Oran"],
    myOtherTabs: 0,
  });
});

test("real other person stays in peopleNames", () => {
  const editors = [
    { id: "tab-a", name: "Oran", userId: "u1", isSelf: true },
    { id: "tab-b", name: "Sofia", userId: "u2", isSelf: false },
  ];
  const others = editors.filter((e) => !e.isSelf);
  assert.deepEqual(summarizeOtherEditors(editors, others), {
    peopleNames: ["Sofia"],
    myOtherTabs: 0,
  });
});
