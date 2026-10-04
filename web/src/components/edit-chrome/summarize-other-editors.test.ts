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

test("ghost 'You' with null userId is my other tab, not a person named You", () => {
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
